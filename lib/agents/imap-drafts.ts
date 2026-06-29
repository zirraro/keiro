/**
 * IMAP drafts for custom-domain mailboxes (OVH, Gandi, Infomaniak, Zoho,
 * iCloud, 365-IMAP, etc.) — the provider-agnostic equivalent of Gmail's
 * gmail.compose, WITHOUT any Google OAuth.
 *
 * Founder ask (29/06) : "on veut des brouillons à écrire/éditer/reprendre +
 * lire + envoyer aussi via domaine (Brevo/Resend/IMAP sur le VPS)".
 *
 * Why IMAP and not Brevo/Resend : Brevo/Resend are SEND APIs, they have no
 * mailbox and no Drafts folder. IMAP is the universal protocol that does it
 * all on the client's real mailbox:
 *   - read inbox        → already done by poll-imap
 *   - create a draft    → IMAP APPEND to the \Drafts mailbox
 *   - read a draft      → IMAP FETCH
 *   - edit/resume       → APPEND new version + delete the old UID (IMAP
 *                         messages are immutable, so "edit" = replace)
 *   - send a draft      → SMTP (reuses sendViaSmtp) then delete from Drafts
 *
 * Connection uses the SMTP creds the client already saved + the imap_*
 * columns (host auto-derived from smtp_host when empty), same as poll-imap.
 * Connections are short-lived (connect → act → logout).
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import MailComposer from 'nodemailer/lib/mail-composer';
import { createClient } from '@supabase/supabase-js';
import { decryptSmtpPassword } from '@/lib/smtp-crypto';
import { textToSafeHtml } from '@/lib/email/text-to-html';

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string;
}

/**
 * Load + decrypt the IMAP connection config from the client's saved SMTP
 * credentials. Returns null when IMAP isn't usable (no creds / not verified).
 */
export async function loadImapConfig(userId: string): Promise<ImapConfig | null> {
  const supabase = getSupabaseAdmin();
  const { data: p } = await supabase
    .from('profiles')
    .select('smtp_host, smtp_user, smtp_password_enc, smtp_from_email, smtp_from_name, smtp_verified_at, imap_host, imap_port, imap_secure')
    .eq('id', userId)
    .maybeSingle();

  if (!p?.smtp_host || !p.smtp_password_enc || !p.smtp_verified_at) return null;

  let pass: string;
  try { pass = decryptSmtpPassword(p.smtp_password_enc); } catch { return null; }

  // Derive the IMAP host from the SMTP host when not set explicitly
  // (smtp.example.com → imap.example.com; mail.* stays as-is).
  const host = p.imap_host || String(p.smtp_host).replace(/^smtp\./i, 'imap.');
  return {
    host,
    port: p.imap_port || 993,
    secure: p.imap_secure ?? true,
    user: p.smtp_user,
    pass,
    fromEmail: p.smtp_from_email || p.smtp_user,
    fromName: p.smtp_from_name || undefined,
  };
}

function newClient(cfg: ImapConfig): ImapFlow {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    // Keep the handshake snappy so one unreachable host can't stall a poll.
    socketTimeout: 20_000,
  } as any);
}

/** Find the special-use \Drafts mailbox path, falling back to common names. */
async function draftsPath(client: ImapFlow): Promise<string> {
  try {
    const boxes = await client.list();
    const special = boxes.find(b => (b as any).specialUse === '\\Drafts');
    if (special) return special.path;
    const byName = boxes.find(b => /^(drafts|brouillons|\[gmail\]\/drafts|inbox\.drafts)$/i.test(b.path));
    if (byName) return byName.path;
  } catch { /* fall through */ }
  return 'Drafts';
}

/** Build a raw RFC822 message (Buffer) for APPEND. */
async function buildRaw(cfg: ImapConfig, params: {
  to: string; subject: string; html: string; inReplyTo?: string;
}): Promise<Buffer> {
  const mail = new MailComposer({
    from: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.inReplyTo ? { inReplyTo: params.inReplyTo, references: [params.inReplyTo] } : {}),
  });
  return await mail.compile().build();
}

function htmlFromBody(body: string): string {
  return textToSafeHtml(body);
}

export interface ImapDraftLite {
  uid: number;
  to?: string;
  subject?: string;
  preview?: string;
}

/**
 * Create a draft in the client's mailbox (APPEND to \Drafts).
 * Returns the new UID when the server reports it.
 */
export async function createImapDraft(userId: string, params: {
  to: string; subject: string; body?: string; html?: string; inReplyTo?: string;
}): Promise<{ created: boolean; uid?: number; reason?: string }> {
  const cfg = await loadImapConfig(userId);
  if (!cfg) return { created: false, reason: 'imap_not_configured' };

  const client = newClient(cfg);
  try {
    await client.connect();
    const path = await draftsPath(client);
    const raw = await buildRaw(cfg, {
      to: params.to,
      subject: params.subject,
      html: params.html || htmlFromBody(params.body || ''),
      inReplyTo: params.inReplyTo,
    });
    const res = await client.append(path, raw, ['\\Draft']);
    const uid = res && typeof res === 'object' ? (res as any).uid : undefined;
    return { created: true, uid };
  } catch (e: any) {
    return { created: false, reason: String(e?.message || e).substring(0, 160) };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/** List recent drafts (last `max`). */
export async function listImapDrafts(userId: string, max = 15): Promise<ImapDraftLite[]> {
  const cfg = await loadImapConfig(userId);
  if (!cfg) return [];

  const client = newClient(cfg);
  const out: ImapDraftLite[] = [];
  try {
    await client.connect();
    const path = await draftsPath(client);
    const lock = await client.getMailboxLock(path);
    try {
      const total = (client.mailbox && typeof client.mailbox === 'object') ? (client.mailbox as any).exists || 0 : 0;
      if (total > 0) {
        const start = Math.max(1, total - max + 1);
        for await (const msg of client.fetch(`${start}:*`, { uid: true, envelope: true })) {
          const env = msg.envelope;
          out.push({
            uid: msg.uid,
            to: env?.to?.[0]?.address,
            subject: env?.subject || '(sans objet)',
          });
        }
      }
    } finally {
      lock.release();
    }
  } catch { /* return what we have */ } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
  // newest first
  return out.sort((a, b) => b.uid - a.uid);
}

/** Fetch one draft (parsed). */
export async function getImapDraft(userId: string, uid: number): Promise<{
  uid: number; to?: string; subject?: string; body: string;
} | null> {
  const cfg = await loadImapConfig(userId);
  if (!cfg) return null;

  const client = newClient(cfg);
  try {
    await client.connect();
    const path = await draftsPath(client);
    const lock = await client.getMailboxLock(path);
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !(msg as any).source) return null;
      const parsed = await simpleParser((msg as any).source);
      const toObj = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
      const htmlText = typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '';
      return {
        uid,
        to: toObj?.text,
        subject: parsed.subject,
        body: (parsed.text || htmlText || '').trim(),
      };
    } finally {
      lock.release();
    }
  } catch {
    return null;
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/**
 * Edit/resume a draft = APPEND the new version then delete the old UID
 * (IMAP messages are immutable). Returns the new UID.
 */
export async function updateImapDraft(userId: string, uid: number, params: {
  to: string; subject: string; body?: string; html?: string; inReplyTo?: string;
}): Promise<{ updated: boolean; uid?: number; reason?: string }> {
  const cfg = await loadImapConfig(userId);
  if (!cfg) return { updated: false, reason: 'imap_not_configured' };

  const client = newClient(cfg);
  try {
    await client.connect();
    const path = await draftsPath(client);
    const raw = await buildRaw(cfg, {
      to: params.to,
      subject: params.subject,
      html: params.html || htmlFromBody(params.body || ''),
      inReplyTo: params.inReplyTo,
    });
    const res = await client.append(path, raw, ['\\Draft']);
    const newUid = res && typeof res === 'object' ? (res as any).uid : undefined;
    // Remove the old version now that the new one is stored.
    const lock = await client.getMailboxLock(path);
    try {
      await client.messageDelete(String(uid), { uid: true });
    } finally {
      lock.release();
    }
    return { updated: true, uid: newUid };
  } catch (e: any) {
    return { updated: false, reason: String(e?.message || e).substring(0, 160) };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/**
 * Send a draft: fetch it, send via the client's SMTP, then delete it from
 * Drafts. Reuses sendViaSmtp for the actual delivery.
 */
export async function sendImapDraft(userId: string, uid: number): Promise<{ sent: boolean; reason?: string }> {
  const draft = await getImapDraft(userId, uid);
  if (!draft || !draft.to) return { sent: false, reason: 'draft_not_found' };

  const { sendViaSmtp } = await import('./smtp-sender');
  const r = await sendViaSmtp({
    userId,
    to: draft.to,
    subject: draft.subject || '(sans objet)',
    body: draft.body,
  });
  if (!r.sent) return r;

  // Delete the sent draft (best-effort).
  const cfg = await loadImapConfig(userId);
  if (cfg) {
    const client = newClient(cfg);
    try {
      await client.connect();
      const path = await draftsPath(client);
      const lock = await client.getMailboxLock(path);
      try { await client.messageDelete(String(uid), { uid: true }); } finally { lock.release(); }
    } catch { /* non-fatal */ } finally {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
  return { sent: true };
}

/** Is IMAP usable for this user (custom-domain mailbox configured)? */
export async function hasImap(userId: string): Promise<boolean> {
  return (await loadImapConfig(userId)) !== null;
}
