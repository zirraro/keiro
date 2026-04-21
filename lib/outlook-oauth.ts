/**
 * Microsoft Graph helpers for Outlook / Microsoft 365 mailboxes.
 *
 * Mirror of lib/gmail-oauth.ts but against the Microsoft identity
 * platform. We store the refresh token on profiles and refresh on
 * demand — exactly the same pattern as Gmail.
 *
 * App setup required (one-time, in Azure portal):
 *   - Register an app at https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps
 *   - Add platform: Web, redirect URI: https://keiroai.com/api/auth/outlook-callback
 *   - API permissions (delegated):
 *       Mail.Read, Mail.Send, Mail.ReadWrite, offline_access, User.Read, email
 *   - Grant admin consent if multi-tenant
 *   - Create a client secret, paste value into env MS_CLIENT_SECRET
 *   - Client ID goes into env MS_CLIENT_ID
 *   - Tenant = 'common' (we accept personal + work accounts)
 */

import { createClient } from '@supabase/supabase-js';

const TENANT = process.env.MS_TENANT_ID || 'common';
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
const AUTH_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`;
const GRAPH_SEND = 'https://graph.microsoft.com/v1.0/me/sendMail';
const GRAPH_ME = 'https://graph.microsoft.com/v1.0/me';
const GRAPH_MESSAGES = 'https://graph.microsoft.com/v1.0/me/messages';

const SCOPES = [
  'offline_access',
  'User.Read',
  'Mail.Send',
  'Mail.Read',
  'Mail.ReadWrite',
].join(' ');

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export function getOutlookOAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES,
    state,
    prompt: 'consent',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeOutlookCode(code: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: SCOPES,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Outlook token exchange failed: ${err.substring(0, 200)}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function refreshOutlookToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: SCOPES,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Outlook refresh failed');
  const data = await res.json();
  return data.access_token;
}

export async function getValidOutlookToken(userId: string): Promise<{ accessToken: string; email: string } | null> {
  const supabase = getSupabase();
  const { data: profile } = await supabase
    .from('profiles')
    .select('outlook_refresh_token, outlook_access_token, outlook_token_expires_at, outlook_email')
    .eq('id', userId)
    .single();
  if (!profile?.outlook_refresh_token) return null;

  const expiresAt = profile.outlook_token_expires_at ? new Date(profile.outlook_token_expires_at).getTime() : 0;
  if (profile.outlook_access_token && expiresAt > Date.now() + 60_000) {
    return { accessToken: profile.outlook_access_token, email: profile.outlook_email || '' };
  }

  try {
    const fresh = await refreshOutlookToken(profile.outlook_refresh_token);
    const newExpires = new Date(Date.now() + 3500 * 1000).toISOString();
    await supabase.from('profiles').update({
      outlook_access_token: fresh,
      outlook_token_expires_at: newExpires,
    }).eq('id', userId);
    return { accessToken: fresh, email: profile.outlook_email || '' };
  } catch (e: any) {
    console.error('[Outlook] Refresh failed:', e.message);
    return null;
  }
}

export async function getOutlookProfile(accessToken: string): Promise<{ email: string }> {
  const res = await fetch(GRAPH_ME, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('Outlook profile fetch failed');
  const data = await res.json();
  return { email: data.mail || data.userPrincipalName || '' };
}

/**
 * Send an email via Graph /me/sendMail. Microsoft returns 202 Accepted
 * with no body — we map to a stable interface matching sendViaGmail.
 */
export async function sendViaOutlook(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string,
  _fromName?: string,
  fromEmail?: string,
  _replyTo?: string,
): Promise<{ sent: boolean }> {
  const payload = {
    message: {
      subject,
      body: { contentType: 'HTML', content: htmlBody },
      toRecipients: [{ emailAddress: { address: to } }],
      // Graph doesn't let you change the from address except for shared
      // mailboxes with delegate rights. For the delegated-user scope we
      // ignore fromEmail — the message goes out as the authenticated user.
      ...(fromEmail ? { from: { emailAddress: { address: fromEmail } } } : {}),
    },
    saveToSentItems: true,
  };
  const res = await fetch(GRAPH_SEND, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[Outlook] Send failed:', err.substring(0, 200));
    return { sent: false };
  }
  return { sent: true };
}

/**
 * List unread messages received after `sinceMs` so the inbound-poller
 * can route prospect replies into /api/webhooks/email-inbound.
 */
export async function listOutlookUnread(accessToken: string, sinceMs: number, top = 25): Promise<Array<{
  id: string;
  from_email: string;
  from_name?: string;
  subject: string;
  body: string;
  message_id?: string;
  in_reply_to?: string;
}>> {
  const sinceIso = new Date(sinceMs).toISOString();
  // Graph filter on receivedDateTime + isRead
  const url = `${GRAPH_MESSAGES}?$filter=isRead eq false and receivedDateTime ge ${sinceIso}&$top=${top}&$select=id,subject,receivedDateTime,from,internetMessageId,internetMessageHeaders,body,bodyPreview`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return [];
    throw new Error(`Outlook list failed: ${res.status}`);
  }
  const data = await res.json();
  const out: Array<any> = [];
  for (const m of data.value || []) {
    const addr = m.from?.emailAddress;
    if (!addr?.address) continue;
    const headers = Array.isArray(m.internetMessageHeaders) ? m.internetMessageHeaders : [];
    const getHeader = (name: string) => headers.find((h: any) => String(h.name || '').toLowerCase() === name.toLowerCase())?.value;
    const html = m.body?.contentType === 'html' ? (m.body?.content || '') : '';
    const text = html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : (m.body?.content || m.bodyPreview || '');
    out.push({
      id: m.id,
      from_email: String(addr.address).toLowerCase(),
      from_name: addr.name || undefined,
      subject: m.subject,
      body: text.trim(),
      message_id: m.internetMessageId || getHeader('Message-ID'),
      in_reply_to: getHeader('In-Reply-To'),
    });
  }
  return out;
}

export async function markOutlookRead(accessToken: string, messageId: string): Promise<void> {
  await fetch(`${GRAPH_MESSAGES}/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead: true }),
  }).catch(() => {});
}

export async function isOutlookConnected(userId: string): Promise<{ connected: boolean; email: string | null }> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('profiles')
    .select('outlook_refresh_token, outlook_email')
    .eq('id', userId)
    .single();
  return {
    connected: !!data?.outlook_refresh_token,
    email: data?.outlook_email || null,
  };
}
