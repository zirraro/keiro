import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildAdminDigest, sendAdminDailyDigest } from '@/lib/agents/admin-digest';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/admin/trigger-digest?hours=24&dry_run=1
 *
 * Manual trigger for the unified admin digest. Useful for:
 *   - Verifying the Claude-driven diagnosis is producing real
 *     actionable output against live logs
 *   - Re-sending a digest after a bug fix without waiting for the 05:00
 *     UTC cron
 *
 * Auth: CRON_SECRET only (admin-only surface).
 *
 * Query:
 *   hours     — lookback window (default 24)
 *   dry_run=1 — return the computed digest as JSON without sending email
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const hours = Math.min(168, Math.max(1, Number(url.searchParams.get('hours') || 24)));
  const dryRun = url.searchParams.get('dry_run') === '1';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (dryRun) {
    const { stats, digest } = await buildAdminDigest(supabase, hours);
    return NextResponse.json({ ok: true, stats, digest, hours, dry_run: true });
  }

  await sendAdminDailyDigest(supabase, hours);
  return NextResponse.json({ ok: true, hours, sent: true });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
