/**
 * Gmail API helpers for sending emails from client's own email.
 * Uses Google OAuth2 with Gmail API scope.
 *
 * Flow: Client clicks "Connect Gmail" → OAuth consent → we store refresh_token
 * → emails sent via Gmail API from their actual address.
 */

import { createClient } from '@supabase/supabase-js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Build Gmail OAuth URL for consent screen.
 */
export function getGmailOAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for Gmail tokens.
 */
export async function exchangeGmailCode(code: string, redirectUri: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail token exchange failed: ${err}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

/**
 * Refresh Gmail access token.
 */
export async function refreshGmailToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Gmail token refresh failed');
  const data = await res.json();
  return data.access_token;
}

/**
 * Get valid Gmail access token for a user (auto-refresh if needed).
 */
export async function getValidGmailToken(userId: string): Promise<{ accessToken: string; email: string } | null> {
  const supabase = getSupabase();
  const { data: profile } = await supabase
    .from('profiles')
    .select('gmail_refresh_token, gmail_email, gmail_access_token, gmail_token_expires_at')
    .eq('id', userId)
    .single();

  if (!profile?.gmail_refresh_token) return null;

  // Check if current token is still valid (with 5 min buffer)
  const expiresAt = profile.gmail_token_expires_at ? new Date(profile.gmail_token_expires_at).getTime() : 0;
  if (profile.gmail_access_token && expiresAt > Date.now() + 300000) {
    return { accessToken: profile.gmail_access_token, email: profile.gmail_email || '' };
  }

  // Refresh token
  try {
    const newToken = await refreshGmailToken(profile.gmail_refresh_token);
    const expiresAt = new Date(Date.now() + 3500 * 1000).toISOString(); // ~58 min
    await supabase.from('profiles').update({
      gmail_access_token: newToken,
      gmail_token_expires_at: expiresAt,
    }).eq('id', userId);
    return { accessToken: newToken, email: profile.gmail_email || '' };
  } catch (e: any) {
    console.error('[Gmail] Token refresh failed:', e.message);
    return null;
  }
}

/**
 * Get Gmail profile (email address).
 */
export async function getGmailProfile(accessToken: string): Promise<{ email: string }> {
  const res = await fetch(GMAIL_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to get Gmail profile');
  const data = await res.json();
  return { email: data.emailAddress };
}

/**
 * Send email via Gmail API (from client's own email).
 * Returns message ID on success.
 */
export async function sendViaGmail(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string,
  fromName?: string,
  fromEmail?: string,
  replyTo?: string,
): Promise<{ id: string; sent: boolean }> {
  // Build RFC 2822 email
  const from = fromName ? `${fromName} <${fromEmail || 'me'}>` : (fromEmail || 'me');
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
  ];
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);

  const rawEmail = headers.join('\r\n') + '\r\n\r\n' + htmlBody;

  // Base64url encode
  const encoded = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[Gmail] Send failed:', err);
    throw new Error(`Gmail send failed: ${res.status}`);
  }

  const data = await res.json();
  return { id: data.id, sent: true };
}

/**
 * Check if a user has Gmail connected.
 */
export async function isGmailConnected(userId: string): Promise<{ connected: boolean; email: string | null }> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('profiles')
    .select('gmail_refresh_token, gmail_email')
    .eq('id', userId)
    .single();
  return {
    connected: !!data?.gmail_refresh_token,
    email: data?.gmail_email || null,
  };
}
