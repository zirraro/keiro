import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeClientPerformance, storeClientRanking } from '@/lib/content/performance-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/cron/content-performance
 *
 * For every user with published content in the last 30 days, computes
 * the performance ranking (format, pillar, slot, optimal hours) and
 * stores it on their content-agent config so the scheduler biases
 * future picks toward what worked.
 *
 * Auth: CRON_SECRET bearer.
 *
 * Scheduled: once daily at 03:15 UTC (after midnight metrics are in).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: activeUsers } = await supabase
    .from('content_calendar')
    .select('user_id')
    .eq('status', 'published')
    .gte('published_at', since)
    .not('user_id', 'is', null);

  const unique = new Set((activeUsers ?? []).map(r => r.user_id));
  const results: Array<{ user_id: string; samples: number; confidence: string; top_format?: string }> = [];

  for (const userId of unique) {
    try {
      const ranking = await computeClientPerformance(supabase, userId, 30);
      await storeClientRanking(supabase, userId, ranking);
      results.push({
        user_id: userId,
        samples: ranking.by_format.reduce((s, f) => s + f.sample_size, 0),
        confidence: ranking.confidence,
        top_format: ranking.by_format[0]?.format,
      });
    } catch (err: any) {
      console.error(`[content-performance] ${userId}:`, err?.message);
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    total_eligible: unique.size,
    results: results.slice(0, 20),
  });
}
