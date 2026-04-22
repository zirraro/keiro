/**
 * Content performance analyzer.
 *
 * Reads the last N days of published posts from content_calendar, groups
 * by {format, pillar, slotTime}, computes an engagement score per bucket,
 * and writes a ranking into org_agent_configs so the content agent can
 * bias its next-slot decisions toward what actually works for THIS client.
 *
 * The ranking is used downstream by the scheduler to:
 *   - pick a format with higher weight on the top performers
 *   - pick a pillar with higher weight on the top performers
 *   - surface the client-optimal publish hours (when engagement peaks)
 *
 * Runs once a day per client via cron. Also runnable on demand (Ami's
 * "analyze my performance" action).
 */
import { SupabaseClient } from '@supabase/supabase-js';

export type ContentRanking = {
  by_format: Array<{ format: string; score: number; sample_size: number }>;
  by_pillar: Array<{ pillar: string; score: number; sample_size: number }>;
  by_slot: Array<{ slot: 'morning' | 'midday' | 'evening' | 'other'; score: number; sample_size: number }>;
  optimal_hours: string[];         // ["09:15", "13:45", "19:30"] ranked by engagement
  top_post_id: string | null;
  confidence: 'low' | 'medium' | 'high'; // depends on sample size
  computed_at: string;
  window_days: number;
};

/**
 * Engagement score per post. We collapse multiple signals into one number:
 *   - likes weight 1
 *   - comments weight 4 (harder to get, higher intent)
 *   - saves weight 6 (strongest discovery signal)
 *   - reach normalises across follower growth
 */
function postScore(e: any): number {
  if (!e) return 0;
  const likes = Number(e.like_count || 0);
  const comments = Number(e.comments_count || 0);
  const saves = Number(e.saved || 0);
  const reach = Math.max(1, Number(e.reach || e.impressions || 0));
  const raw = likes + comments * 4 + saves * 6;
  // Normalise by reach when we have reach data, else just use raw.
  return e.reach ? (raw / reach) * 100 : raw;
}

function slotFromTime(timeStr: string | null): 'morning' | 'midday' | 'evening' | 'other' {
  if (!timeStr) return 'other';
  const h = parseInt(timeStr.split(':')[0] || '0');
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'midday';
  if (h >= 16 && h < 23) return 'evening';
  return 'other';
}

export async function computeClientPerformance(
  supabase: SupabaseClient,
  userId: string,
  windowDays: number = 30,
): Promise<ContentRanking> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts } = await supabase
    .from('content_calendar')
    .select('id, format, pillar, scheduled_time, published_at, engagement_data')
    .eq('user_id', userId)
    .eq('status', 'published')
    .not('engagement_data', 'is', null)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(200);

  const rows = posts ?? [];

  // Accumulate scores per bucket
  const formatBuckets = new Map<string, { total: number; count: number }>();
  const pillarBuckets = new Map<string, { total: number; count: number }>();
  const slotBuckets = new Map<string, { total: number; count: number }>();
  const hourScores = new Map<string, { total: number; count: number }>();
  let topPostId: string | null = null;
  let topScore = -1;

  for (const p of rows) {
    const s = postScore(p.engagement_data);
    if (s > topScore) { topScore = s; topPostId = p.id; }

    const format = p.format || 'post';
    const pillar = p.pillar || 'general';
    const slot = slotFromTime(p.scheduled_time);
    const hh = p.scheduled_time ? p.scheduled_time.substring(0, 5) : null;

    const f = formatBuckets.get(format) ?? { total: 0, count: 0 };
    f.total += s; f.count++;
    formatBuckets.set(format, f);

    const pl = pillarBuckets.get(pillar) ?? { total: 0, count: 0 };
    pl.total += s; pl.count++;
    pillarBuckets.set(pillar, pl);

    const sl = slotBuckets.get(slot) ?? { total: 0, count: 0 };
    sl.total += s; sl.count++;
    slotBuckets.set(slot, sl);

    if (hh) {
      const h = hourScores.get(hh) ?? { total: 0, count: 0 };
      h.total += s; h.count++;
      hourScores.set(hh, h);
    }
  }

  const rankMap = <K extends string>(m: Map<K, { total: number; count: number }>) =>
    Array.from(m.entries())
      .map(([k, v]) => ({ key: k, score: v.count ? v.total / v.count : 0, sample_size: v.count }))
      .sort((a, b) => b.score - a.score);

  const by_format = rankMap(formatBuckets).map(r => ({ format: r.key, score: r.score, sample_size: r.sample_size }));
  const by_pillar = rankMap(pillarBuckets).map(r => ({ pillar: r.key, score: r.score, sample_size: r.sample_size }));
  const by_slot = rankMap(slotBuckets).map(r => ({ slot: r.key as any, score: r.score, sample_size: r.sample_size }));

  const optimal_hours = Array.from(hourScores.entries())
    .map(([hh, v]) => ({ hh, score: v.count ? v.total / v.count : 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(r => r.hh);

  const confidence: ContentRanking['confidence'] =
    rows.length >= 25 ? 'high' : rows.length >= 10 ? 'medium' : 'low';

  return {
    by_format,
    by_pillar,
    by_slot,
    optimal_hours,
    top_post_id: topPostId,
    confidence,
    computed_at: new Date().toISOString(),
    window_days: windowDays,
  };
}

/**
 * Persist the ranking on the client's content-agent config so the
 * scheduler reads it without hitting this analyzer on every slot.
 */
export async function storeClientRanking(
  supabase: SupabaseClient,
  userId: string,
  ranking: ContentRanking,
): Promise<void> {
  const { data: existing } = await supabase
    .from('org_agent_configs')
    .select('id, config')
    .eq('user_id', userId)
    .eq('agent_id', 'content')
    .maybeSingle();

  const newConfig = {
    ...(existing?.config || {}),
    performance_ranking: ranking,
  };

  if (existing?.id) {
    await supabase.from('org_agent_configs').update({ config: newConfig }).eq('id', existing.id);
  } else {
    await supabase.from('org_agent_configs').insert({
      user_id: userId,
      agent_id: 'content',
      config: newConfig,
    });
  }
}

/**
 * Apply a ranking to weight a format pick. Returns the biased format
 * chosen for the next post, falling back to the provided default if
 * there's no data yet (low confidence or empty ranking).
 */
export function pickFormatWithRanking(
  defaultFormat: string,
  ranking: ContentRanking | undefined | null,
  allowedFormats?: string[],
): string {
  if (!ranking || ranking.confidence === 'low') return defaultFormat;
  const formats = ranking.by_format.filter(f => !allowedFormats || allowedFormats.includes(f.format));
  if (formats.length === 0) return defaultFormat;

  // Softmax-style weighted pick: top performer picked ~60% of the time,
  // #2 25%, #3 15%. We still pick #1 most often but occasionally explore.
  const weights = formats.map((_, i) => Math.pow(0.6, i));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < formats.length; i++) {
    r -= weights[i];
    if (r <= 0) return formats[i].format;
  }
  return formats[0].format;
}

export function pickPillarWithRanking(
  defaultPillar: string,
  ranking: ContentRanking | undefined | null,
): string {
  if (!ranking || ranking.confidence === 'low') return defaultPillar;
  const pillars = ranking.by_pillar;
  if (pillars.length === 0) return defaultPillar;
  // Same softmax idea, slightly more explorative on pillars (variety
  // matters more for audience relevance).
  const weights = pillars.map((_, i) => Math.pow(0.7, i));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pillars.length; i++) {
    r -= weights[i];
    if (r <= 0) return pillars[i].pillar;
  }
  return pillars[0].pillar;
}
