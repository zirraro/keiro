import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidGmailToken, listGmailUnread, getGmailMessage, markGmailRead } from '@/lib/gmail-oauth';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
 * POST /api/agents/email/poll-inbound?user_id=X
 *
 * Polls the connected Gmail inbox for unread replies since the last
 * successful poll, normalises each message, and POSTs it back into
 * /api/webhooks/email-inbound which does the classification +
 * auto-reply routing. Marks messages as read once processed so the
 * next tick doesn't re-see them.
 *
 * Fired by the per-client scheduler every 10 minutes.
 */
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('user_id');
  if (!userId) return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const token = await getValidGmailToken(userId);
  if (!token) {
    return NextResponse.json({ ok: true, skipped: 'no_gmail_connection' });
  }

  // Last poll timestamp — defaults to 24h ago on first run so we don't
  // flood the inbound pipeline with historic unread mail.
  const { data: profile } = await supabase
    .from('profiles')
    .select('gmail_last_poll_at')
    .eq('id', userId)
    .maybeSingle();
  const sinceMs = profile?.gmail_last_poll_at
    ? new Date(profile.gmail_last_poll_at).getTime()
    : Date.now() - 24 * 60 * 60 * 1000;

  let ids: string[] = [];
  try {
    ids = await listGmailUnread(token.accessToken, sinceMs, 25);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message?.substring?.(0, 200) });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
  const results: Array<{ id: string; result: string }> = [];

  for (const id of ids) {
    const msg = await getGmailMessage(token.accessToken, id);
    if (!msg || !msg.from_email || !msg.body) {
      results.push({ id, result: 'skip_empty' });
      continue;
    }

    // Skip emails we ourselves sent (bounces, self-reply threads).
    if (msg.from_email === token.email?.toLowerCase()) {
      await markGmailRead(token.accessToken, id);
      results.push({ id, result: 'skip_self' });
      continue;
    }

    try {
      const webhookRes = await fetch(`${baseUrl}/api/webhooks/email-inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_email: msg.from_email,
          from_name: msg.from_name,
          subject: msg.subject,
          body: msg.body,
          message_id: msg.message_id,
          in_reply_to: msg.in_reply_to,
        }),
      });
      const webhookJson = await webhookRes.json().catch(() => ({}));
      results.push({ id, result: webhookJson.result || (webhookRes.ok ? 'ok' : 'webhook_failed') });
      await markGmailRead(token.accessToken, id);
    } catch (e: any) {
      results.push({ id, result: `error:${String(e?.message || e).substring(0, 100)}` });
    }
  }

  // Update high-water mark so the next poll starts from now.
  await supabase.from('profiles').update({
    gmail_last_poll_at: new Date().toISOString(),
  }).eq('id', userId);

  await supabase.from('agent_logs').insert({
    agent: 'email',
    action: 'gmail_inbound_poll',
    status: 'ok',
    user_id: userId,
    data: { count: ids.length, results },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, count: ids.length, results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
