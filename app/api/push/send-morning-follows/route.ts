import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

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
 * POST /api/push/send-morning-follows
 *
 * Morning reminder for every client with push enabled AND at least one
 * prospect queued in Jade's manual-follow list. Tells them how many
 * accounts are waiting so they can swipe through them on their phone
 * (~30s) and tap ✓ Tout marquer fait when done.
 *
 * Invoked by the scheduler at 06:00 UTC (~08:00 Paris) from the
 * morning_batch slot.
 *
 * Subscriptions that return 404/410 (browser unsubscribed) are pruned
 * automatically so the table stays clean.
 */
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:contact@keiroai.com';

  if (!publicKey || !privateKey) {
    return NextResponse.json({ ok: false, error: 'VAPID keys not configured' }, { status: 500 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const supabase = getSupabaseAdmin();

  // Pull every active subscription + the owner's pending follow count.
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth');

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const byUser = new Map<string, typeof subs>();
  for (const s of subs) {
    const list = byUser.get(s.user_id) || [];
    list.push(s);
    byUser.set(s.user_id, list as any);
  }

  let sent = 0;
  let pruned = 0;
  const results: Array<{ user_id: string; pending: number; pushed: number }> = [];

  for (const [userId, userSubs] of byUser.entries()) {
    const { count } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('dm_status', 'queued_for_manual_follow');

    const pending = count || 0;
    if (pending === 0) {
      results.push({ user_id: userId, pending: 0, pushed: 0 });
      continue;
    }

    const payload = JSON.stringify({
      title: `🤝 ${pending} compte${pending > 1 ? 's' : ''} à suivre sur Instagram`,
      body: pending > 5
        ? `Jade a préparé ${pending} comptes warm-up — 5 min pour swiper sur ton téléphone.`
        : `Jade a préparé ${pending} compte${pending > 1 ? 's' : ''} — ça se fait en 1 minute.`,
      data: { url: '/assistant/agent/dm_instagram?tab=follows' },
      tag: 'jade-morning-follows',
      requireInteraction: false,
    });

    let pushedThisUser = 0;
    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        pushedThisUser++;
        sent++;
        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id);
      } catch (e: any) {
        const code = e?.statusCode;
        // 404/410 = browser unsubscribed (user revoked permission or
        // uninstalled the app). Prune so we don't keep retrying.
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          pruned++;
        } else {
          console.warn('[PushMorning] send failed:', code, e?.body?.substring?.(0, 200));
        }
      }
    }

    results.push({ user_id: userId, pending, pushed: pushedThisUser });
  }

  await supabase.from('agent_logs').insert({
    agent: 'dm_instagram',
    action: 'morning_follow_push',
    status: 'success',
    data: { sent, pruned, results },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, sent, pruned, results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
