import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/agents/dm-instagram/send-queue
 *
 * ⛔ DISABLED 2026-06-11 — ToS compliance (existential).
 *
 * This cron used to take COLD prospection DMs out of `dm_queue` and send them
 * via the Meta Graph API (`graph.instagram.com/me/messages`) to accounts that
 * had NEVER messaged the client first — plus auto-liking their posts to bait a
 * reply. Both are violations of Instagram's Platform Terms (the messaging API
 * is for REPLIES inside the 24h window, not unsolicited outbound). A single
 * client account ban from this kills KeiroAI by word of mouth.
 *
 * Founder decision (2026-06-11): Jade PREPARES personalised prospection DMs;
 * the CLIENT reviews them in the queue UI, then copies/pastes and sends from
 * their OWN Instagram. That flow already exists end-to-end:
 *   - GET  /api/agents/dm-instagram/queue        → lists prepared `pending` DMs
 *   - POST /api/agents/dm-instagram/send-single  → client confirms manual send
 *
 * Legal AUTO paths remain untouched:
 *   - POST /api/agents/dm-instagram/auto-reply   → replies to INCOMING DMs (24h window)
 *
 * So this route no longer sends anything. Prospection DMs stay `pending` and
 * surface in the client's manual-send queue. Kept as an explicit no-op (rather
 * than deleted) so any lingering cron trigger fails safe instead of 404-ing.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    sent: 0,
    disabled: true,
    reason:
      'Cold prospection DMs are never auto-sent (Instagram ToS). Jade prepares them; the client sends manually from the queue UI.',
  });
}

// Some schedulers hit this with GET — keep it a safe no-op too.
export async function GET(req: NextRequest) {
  return POST(req);
}
