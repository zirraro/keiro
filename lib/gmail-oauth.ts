/**
 * Gmail API helpers for sending emails from client's own email.
 * Uses Google OAuth2 with Gmail API scope.
 *
 * Flow: Client clicks "Connect Gmail" → OAuth consent → we store refresh_token
 * → emails sent via Gmail API from their actual address.
 */

import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from '@/lib/token-crypto';

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
    // SCOPES (décision founder 29/06 — set final minimal, post-nettoyage console) :
    //   - gmail.compose  → CRÉE / REPREND / MODIFIE des brouillons ET envoie. SENSIBLE.
    //                      Remplace gmail.send (compose envoie aussi) et couvre le mode
    //                      brouillon (Hugo prépare → le client relit/envoie ; ou le client
    //                      a commencé un brouillon → Hugo le reprend/améliore).
    //   - gmail.readonly → LIRE la boîte du client (réponses prospects + mails reçus)
    //                      pour analyser et répondre en auto (Hugo). RESTREINT →
    //                      nécessite l'audit CASA pour la prod >100 users (gratuit en
    //                      mode test). On NE demande PAS gmail.modify (jamais).
    //   - userinfo.email/profile → identifier la boîte connectée (nom/photo affichés).
    // CORRECTION 15/07 : Google classe gmail.compose ET gmail.readonly en
    // RESTREINT (→ CASA). Le SEUL scope Gmail sensible = gmail.send (envoi seul,
    // pas de CASA). OPTION A (lancement rapide) = gmail.send : Hugo envoie depuis
    // l'adresse du client ; les brouillons-à-valider vivent dans l'UI KeiroAI (pas
    // le dossier Brouillons Gmail) ; les réponses reviennent via Reply-To (webhook).
    // OPTION B (plus tard, avec CASA) : remplacer par gmail.compose + gmail.readonly
    // → brouillons natifs dans Gmail + lecture native de la boîte.
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      // OPTION B (CASA) : 'gmail.compose' + 'gmail.readonly' à la place de send.
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' '),
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

  // Tokens chiffrés au repos (CASA/ASVS) — déchiffrer avant usage. Rétro-compatible
  // avec les anciennes valeurs en clair (decryptToken les renvoie telles quelles).
  const storedAccess = decryptToken(profile.gmail_access_token);
  const refreshToken = decryptToken(profile.gmail_refresh_token);

  // Check if current token is still valid (with 5 min buffer)
  const expiresAt = profile.gmail_token_expires_at ? new Date(profile.gmail_token_expires_at).getTime() : 0;
  if (storedAccess && expiresAt > Date.now() + 300000) {
    return { accessToken: storedAccess, email: profile.gmail_email || '' };
  }

  // Refresh token
  try {
    const newToken = await refreshGmailToken(refreshToken || '');
    const expiresAt = new Date(Date.now() + 3500 * 1000).toISOString(); // ~58 min
    await supabase.from('profiles').update({
      gmail_access_token: encryptToken(newToken),
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

// ──────────────────────────────────────────────────────────
// Gmail DRAFTS (scope gmail.compose) — mode "Hugo prépare, le client relit
// et envoie" + reprise/modification d'un brouillon commencé par le client.
// ──────────────────────────────────────────────────────────

const GMAIL_DRAFTS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';
const GMAIL_DRAFT_URL = (id: string) => `${GMAIL_DRAFTS_URL}/${id}`;

/**
 * Build a base64url-encoded RFC 2822 message. Shared by send + drafts so
 * threading headers (In-Reply-To / References) and encoding stay identical.
 */
export function buildRawGmailMessage(params: {
  to: string;
  subject: string;
  htmlBody: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  inReplyTo?: string;   // Message-ID of the email we're replying to (threading)
}): string {
  const { to, subject, htmlBody, fromName, fromEmail, replyTo, inReplyTo } = params;
  const from = fromName ? `${fromName} <${fromEmail || 'me'}>` : (fromEmail || 'me');
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
  ];
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  // Threading: In-Reply-To + References make the draft/reply land in the
  // same conversation in the recipient's inbox.
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }
  const rawEmail = headers.join('\r\n') + '\r\n\r\n' + htmlBody;
  return Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface GmailDraftLite {
  id: string;
  messageId?: string;
  threadId?: string;
  to?: string;
  subject?: string;
  snippet?: string;
}

/**
 * Create a draft in the client's Gmail (lands in their Drafts folder).
 * Returns the draft id. Used by Hugo's "prepare a reply for me to review"
 * mode and by the on-demand "draft a new email" action.
 */
export async function createGmailDraft(
  accessToken: string,
  params: {
    to: string;
    subject: string;
    htmlBody: string;
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
    inReplyTo?: string;
    threadId?: string;   // attach the draft to an existing Gmail thread
  },
): Promise<{ id: string; messageId?: string; threadId?: string }> {
  const raw = buildRawGmailMessage(params);
  const message: any = { raw };
  if (params.threadId) message.threadId = params.threadId;

  const res = await fetch(GMAIL_DRAFTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[Gmail] Draft create failed:', err);
    throw new Error(`Gmail draft create failed: ${res.status}`);
  }
  const data = await res.json();
  return { id: data.id, messageId: data.message?.id, threadId: data.message?.threadId };
}

/**
 * List the most recent drafts in the client's Gmail. Used to surface
 * "drafts you started" so Hugo can resume/improve them.
 */
export async function listGmailDrafts(accessToken: string, maxResults = 20): Promise<GmailDraftLite[]> {
  const url = `${GMAIL_DRAFTS_URL}?maxResults=${maxResults}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    if (res.status === 403) return []; // scope not granted yet — no-op
    throw new Error(`Gmail drafts list failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  const drafts = data.drafts || [];
  // The list endpoint returns ids + a light message stub; hydrate headers
  // for the ones we show (cap to avoid burning quota on huge mailboxes).
  const out: GmailDraftLite[] = [];
  for (const d of drafts.slice(0, maxResults)) {
    out.push({ id: d.id, messageId: d.message?.id, threadId: d.message?.threadId });
  }
  return out;
}

/**
 * Fetch one draft with its headers + body so Hugo can rewrite it.
 */
export async function getGmailDraft(accessToken: string, draftId: string): Promise<{
  id: string;
  messageId?: string;
  threadId?: string;
  to?: string;
  subject?: string;
  body: string;
} | null> {
  const res = await fetch(`${GMAIL_DRAFT_URL(draftId)}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const msg = data.message;
  if (!msg?.payload) return { id: data.id, messageId: msg?.id, threadId: msg?.threadId, body: '' };

  const headers: Record<string, string> = {};
  for (const h of msg.payload.headers || []) headers[h.name.toLowerCase()] = h.value;

  function extract(part: any): string {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf8');
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    }
    if (Array.isArray(part.parts)) {
      for (const sub of part.parts) {
        const r = extract(sub);
        if (r) return r;
      }
    }
    return '';
  }
  const body = (extract(msg.payload) || msg.snippet || '').trim();
  return {
    id: data.id,
    messageId: msg.id,
    threadId: msg.threadId,
    to: headers['to'],
    subject: headers['subject'],
    body,
  };
}

/**
 * Replace the content of an existing draft (resume/modify what the client
 * started). Keeps the same draft id + thread so it stays in place.
 */
export async function updateGmailDraft(
  accessToken: string,
  draftId: string,
  params: {
    to: string;
    subject: string;
    htmlBody: string;
    fromName?: string;
    fromEmail?: string;
    inReplyTo?: string;
    threadId?: string;
  },
): Promise<{ id: string }> {
  const raw = buildRawGmailMessage(params);
  const message: any = { raw };
  if (params.threadId) message.threadId = params.threadId;

  const res = await fetch(GMAIL_DRAFT_URL(draftId), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[Gmail] Draft update failed:', err);
    throw new Error(`Gmail draft update failed: ${res.status}`);
  }
  const data = await res.json();
  return { id: data.id };
}

/**
 * Send an existing draft (drafts.send). Used when the client lets Hugo send
 * a draft he resumed/improved, instead of sending manually from Gmail.
 */
export async function sendGmailDraft(accessToken: string, draftId: string): Promise<{ id: string; sent: boolean }> {
  const res = await fetch(`${GMAIL_DRAFTS_URL}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: draftId }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[Gmail] Draft send failed:', err);
    throw new Error(`Gmail draft send failed: ${res.status}`);
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

// ──────────────────────────────────────────────────────────
// Gmail read helpers (used by the inbound poller)
// ──────────────────────────────────────────────────────────

const GMAIL_LIST_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const GMAIL_MSG_URL = (id: string) => `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`;
const GMAIL_MODIFY_URL = (id: string) => `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`;

export interface GmailMessageLite {
  id: string;
  threadId: string;
  from_email: string;
  from_name?: string;
  subject?: string;
  body: string;              // plain text extracted from text/plain part (or html stripped)
  message_id?: string;       // RFC Message-Id header (for threading)
  in_reply_to?: string;      // In-Reply-To header
  received_at: string;       // ISO timestamp from internalDate
}

/**
 * List unread messages in the inbox received after `sinceTimestamp` (ms).
 * Returns message IDs only — fetch bodies with getGmailMessage.
 */
export async function listGmailUnread(accessToken: string, sinceMs: number, maxResults = 25): Promise<string[]> {
  // Gmail search query — unread in inbox, newer_than fallback if sinceMs is old.
  const afterSec = Math.floor(sinceMs / 1000);
  const query = `in:inbox is:unread after:${afterSec}`;
  const url = `${GMAIL_LIST_URL}?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    // 403 typically means the scope wasn't granted (client consented on the
    // old .send-only url and hasn't reconnected yet). Return empty so the
    // poller just no-ops rather than crashing.
    if (res.status === 403) return [];
    throw new Error(`Gmail list failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data.messages || []).map((m: any) => m.id);
}

/**
 * Fetch one message and normalise it to a shape the inbound webhook
 * already knows how to handle. We prefer the text/plain part when
 * multipart; strip HTML tags if only html is present.
 */
export async function getGmailMessage(accessToken: string, messageId: string): Promise<GmailMessageLite | null> {
  const url = `${GMAIL_MSG_URL(messageId)}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.payload) return null;

  const headers: Record<string, string> = {};
  for (const h of data.payload.headers || []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  // Parse the "From" header into name + email.
  const fromHeader = headers['from'] || '';
  const fromMatch = fromHeader.match(/(?:"?([^"<]+)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?/);
  const from_email = (fromMatch?.[2] || fromHeader).toLowerCase().trim();
  const from_name = fromMatch?.[1]?.trim() || undefined;

  // Walk MIME parts to find text/plain (preferred) or text/html (fallback).
  function extract(part: any): { plain?: string; html?: string } {
    const out: { plain?: string; html?: string } = {};
    if (part.mimeType === 'text/plain' && part.body?.data) {
      out.plain = Buffer.from(part.body.data, 'base64').toString('utf8');
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      out.html = Buffer.from(part.body.data, 'base64').toString('utf8');
    }
    if (Array.isArray(part.parts)) {
      for (const sub of part.parts) {
        const r = extract(sub);
        out.plain = out.plain || r.plain;
        out.html = out.html || r.html;
      }
    }
    return out;
  }
  const { plain, html } = extract(data.payload);
  const body = (plain || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '') || data.snippet || '').trim();

  return {
    id: data.id,
    threadId: data.threadId,
    from_email,
    from_name,
    subject: headers['subject'],
    body,
    message_id: headers['message-id'],
    in_reply_to: headers['in-reply-to'],
    received_at: data.internalDate ? new Date(parseInt(data.internalDate, 10)).toISOString() : new Date().toISOString(),
  };
}

/**
 * Mark a message as read so it doesn't come back on the next poll.
 */
export async function markGmailRead(accessToken: string, messageId: string): Promise<void> {
  await fetch(GMAIL_MODIFY_URL(messageId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  }).catch(() => { /* non-fatal — next poll will re-process, idempotency handles that */ });
}
