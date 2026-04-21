import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidOutlookToken, listOutlookUnread, markOutlookRead } from '@/lib/outlook-oauth';

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
 * POST /api/agents/email/poll-outlook?user_id=X
 *
 * Mirror of /poll-inbound (Gmail) for clients on Outlook / Microsoft 365.
 * Lists unread messages since the last successful poll via Graph API,
 * normalises each, POSTs to /api/webhooks/email-inbound (Hugo's shared
 * classify + reply pipeline), marks as read.
 *
 * Fired by the scheduler alongside Gmail + IMAP pollers in morning_batch.
 */
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('user_id');
  if (!userId) return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const token = await getValidOutlookToken(userId);
  if (!token) {
    return NextResponse.json({ ok: true, skipped: 'no_outlook_connection' });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('outlook_last_poll_at')
    .eq('id', userId)
    .maybeSingle();
  const sinceMs = profile?.outlook_last_poll_at
    ? new Date(profile.outlook_last_poll_at).getTime()
    : Date.now() - 24 * 60 * 60 * 1000;

  let messages: Awaited<ReturnType<typeof listOutlookUnread>> = [];
  try {
    messages = await listOutlookUnread(token.accessToken, sinceMs, 25);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).substring(0, 200) });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
  const results: Array<{ id: string; result: string }> = [];

  for (const msg of messages) {
    if (msg.from_email === (token.email || '').toLowerCase()) {
      await markOutlookRead(token.accessToken, msg.id);
      results.push({ id: msg.id, result: 'skip_self' });
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
      const wj = await webhookRes.json().catch(() => ({}));
      results.push({ id: msg.id, result: wj.result || (webhookRes.ok ? 'ok' : 'webhook_failed') });
      await markOutlookRead(token.accessToken, msg.id);
    } catch (e: any) {
      results.push({ id: msg.id, result: `error:${String(e?.message || e).substring(0, 100)}` });
    }
  }

  await supabase.from('profiles').update({
    outlook_last_poll_at: new Date().toISOString(),
  }).eq('id', userId);

  await supabase.from('agent_logs').insert({
    agent: 'email',
    action: 'outlook_inbound_poll',
    status: 'ok',
    user_id: userId,
    data: { count: messages.length, results },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, count: messages.length, results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
