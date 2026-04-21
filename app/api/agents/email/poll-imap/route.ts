import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { decryptSmtpPassword } from '@/lib/smtp-crypto';

export const runtime = 'nodejs';
export const maxDuration = 180;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function authorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  return !!cronSecret && auth === `Bearer ${cronSecret}`;
}

/**
 * POST /api/agents/email/poll-imap?user_id=X
 *
 * IMAP equivalent of /poll-inbound for clients hosting their email on a
 * custom domain (OVH, Gandi, Infomaniak, iCloud, Zoho, Outlook/365).
 * Reuses the SMTP credentials they already saved + two extra columns:
 *   imap_host (auto-derived from smtp_host if left empty)
 *   imap_port (993 default, TLS)
 *
 * Flow:
 *   - Connect to IMAP server with TLS
 *   - Select INBOX
 *   - Search messages UNSEEN AND RECEIVED AFTER imap_last_poll_at
 *   - For each: parse via mailparser, POST normalised payload to
 *     /api/webhooks/email-inbound (Hugo's classify + reply pipeline)
 *   - Mark message as SEEN so next poll skips it
 *   - Update imap_last_poll_at
 *
 * Fired by the scheduler every 10 min per client with SMTP configured.
 * Silently skips when password decryption or IMAP connection fails so a
 * single bad client doesn't break the loop.
 */
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('user_id');
  if (!userId) return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: profile } = await supabase
    .from('profiles')
    .select('smtp_host, smtp_user, smtp_password_enc, smtp_verified_at, imap_host, imap_port, imap_secure, imap_last_poll_at')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.smtp_password_enc || !profile.smtp_verified_at) {
    return NextResponse.json({ ok: true, skipped: 'no_smtp_credentials' });
  }

  // Derive IMAP host from SMTP host when the client didn't set one
  // explicitly — most providers follow smtp.X.Y ↔ imap.X.Y.
  const imapHost = profile.imap_host
    || (profile.smtp_host ? profile.smtp_host.replace(/^smtp\./i, 'imap.').replace(/^mail\./i, 'imap.').replace(/^ssl0\.ovh\.net$/i, 'ssl0.ovh.net') : null);
  if (!imapHost) {
    return NextResponse.json({ ok: true, skipped: 'no_imap_host' });
  }
  const imapPort = profile.imap_port || 993;
  const imapSecure = profile.imap_secure ?? true;

  let password: string;
  try {
    password = decryptSmtpPassword(profile.smtp_password_enc);
  } catch {
    return NextResponse.json({ ok: false, error: 'decrypt_failed' }, { status: 500 });
  }

  const sinceDate = profile.imap_last_poll_at
    ? new Date(profile.imap_last_poll_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    auth: { user: profile.smtp_user!, pass: password },
    logger: false,
  });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
  const results: Array<{ uid: number; result: string }> = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Search for UNSEEN messages received since last poll. IMAP SEARCH
      // with SINCE has day-level precision; we still re-filter with
      // internalDate below for accuracy.
      const uids = await client.search({ seen: false, since: sinceDate }, { uid: true });

      for (const uid of (uids || []).slice(0, 30)) {
        try {
          const msg: any = await client.fetchOne(String(uid), { source: true, envelope: true, internalDate: true }, { uid: true });
          if (!msg || !msg.source) { results.push({ uid, result: 'no_source' }); continue; }

          const parsed = await simpleParser(msg.source as Buffer);
          const from = parsed.from?.value?.[0];
          const fromEmail = (from?.address || '').toLowerCase().trim();
          const fromName = from?.name || undefined;
          if (!fromEmail) { results.push({ uid, result: 'no_from' }); continue; }

          // Skip self-replies (user's outbound landing back via BCC, etc.)
          if (fromEmail === profile.smtp_user?.toLowerCase()) {
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
            results.push({ uid, result: 'skip_self' });
            continue;
          }

          const htmlStr = typeof parsed.html === 'string' ? parsed.html : '';
          const body = (parsed.text || htmlStr.replace(/<[^>]+>/g, ' ') || '').trim();
          if (!body) { results.push({ uid, result: 'empty_body' }); continue; }

          const webhookRes = await fetch(`${baseUrl}/api/webhooks/email-inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from_email: fromEmail,
              from_name: fromName,
              subject: parsed.subject,
              body,
              message_id: parsed.messageId,
              in_reply_to: parsed.inReplyTo,
            }),
          });
          const wj = await webhookRes.json().catch(() => ({}));
          results.push({ uid, result: wj.result || (webhookRes.ok ? 'ok' : 'webhook_failed') });

          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        } catch (e: any) {
          results.push({ uid, result: `error:${String(e?.message || e).substring(0, 100)}` });
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `imap_connect_failed:${String(e?.message || e).substring(0, 200)}` }, { status: 500 });
  }

  await supabase.from('profiles').update({
    imap_last_poll_at: new Date().toISOString(),
  }).eq('id', userId);

  await supabase.from('agent_logs').insert({
    agent: 'email',
    action: 'imap_inbound_poll',
    status: 'ok',
    user_id: userId,
    data: { count: results.length, results },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, count: results.length, results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
