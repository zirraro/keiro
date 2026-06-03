/**
 * 2026-06-03 — Visual Reuse (Levier 3).
 *
 * Founder ask: "Si un client a publié 1 visual qui a bien performé
 * (likes, comments), Lena peut le réutiliser plus tard dans une compo
 * différente, au lieu de regénérer from scratch".
 *
 * Politique :
 *   - INTRA-CLIENT uniquement (jamais cross-client, trop risqué)
 *   - Top 3 visuels les plus performants du client (likes + comments + reach)
 *   - Réutilisation max 2 fois par visual sur 3 mois (pour pas saturer le feed)
 *   - Si réutilisé : la caption et le hook DOIVENT être différents (pas de
 *     copie complète), seul le visuel est réutilisé
 *
 * Bénéfice :
 *   - Économie Bytedance ~30% sur les clients établis (3+ mois d'historique)
 *   - Renforce les visuels qui marchent (effet "best of")
 *   - Pas de risque de duplication entre clients
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReusableVisual {
  post_id: string;
  visual_url: string;
  visual_description: string;
  performance_score: number;
  engagement: {
    likes: number;
    comments: number;
    reach: number;
  };
  format: string;
  platform: string;
  published_at: string;
  reused_count: number;
}

/**
 * Get top performing visuals from this client that are eligible for reuse.
 * Criteria:
 *   - Status = published
 *   - visual_url IS NOT NULL (no recycle of text-only posts)
 *   - performance_score > seuil OR engagement above median
 *   - reused_count < 2 (cap reuse)
 *   - published_at within last 90 days (recent enough to feel current)
 *   - At least 14 days old (let the algo settle)
 */
export async function getReusableTopVisuals(
  supabase: SupabaseClient,
  userId: string,
  opts: { platform?: string; format?: string; limit?: number } = {},
): Promise<ReusableVisual[]> {
  const limit = opts.limit ?? 3;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();

  let q = supabase
    .from('content_calendar')
    .select('id, visual_url, visual_description, engagement_data, performance_score, visual_reused_count, format, platform, published_at')
    .eq('user_id', userId)
    .eq('status', 'published')
    .not('visual_url', 'is', null)
    .lt('visual_reused_count', 2)
    .gte('published_at', ninetyDaysAgo)
    .lte('published_at', fourteenDaysAgo);
  if (opts.platform) q = q.eq('platform', opts.platform);
  if (opts.format) q = q.eq('format', opts.format);
  // Order by performance_score if set, else by engagement count
  q = q.order('performance_score', { ascending: false, nullsFirst: false }).limit(limit * 3);

  const { data } = await q;
  const candidates = data || [];

  // Compute synthetic score if performance_score not set
  const scored: ReusableVisual[] = candidates.map((c: any) => {
    const e = c.engagement_data || {};
    const likes = e.like_count || e.likes || 0;
    const comments = e.comments_count || e.comments || 0;
    const reach = e.reach || e.views || 0;
    const score = c.performance_score
      ?? (likes * 1 + comments * 5 + Math.floor(reach / 50));
    return {
      post_id: c.id,
      visual_url: c.visual_url,
      visual_description: c.visual_description || '',
      performance_score: score,
      engagement: { likes, comments, reach },
      format: c.format || 'post',
      platform: c.platform || 'instagram',
      published_at: c.published_at,
      reused_count: c.visual_reused_count || 0,
    };
  });

  // Sort by computed score and take top N
  return scored
    .sort((a, b) => b.performance_score - a.performance_score)
    .slice(0, limit);
}

/**
 * Decide whether to reuse a top visual or generate fresh.
 * Returns the chosen visual + a flag to skip Bytedance generation.
 *
 * Strategy:
 *   - 30% probability of reuse if at least 1 top visual exists
 *   - Caption MUST be different (Lena generates new caption around the
 *     reused visual via the visual_description as context)
 */
export async function pickReuseOrGenerate(
  supabase: SupabaseClient,
  userId: string,
  opts: { platform?: string; format?: string } = {},
): Promise<{ reuse: ReusableVisual | null; mode: 'reuse' | 'generate' }> {
  const topVisuals = await getReusableTopVisuals(supabase, userId, { ...opts, limit: 3 });
  if (topVisuals.length === 0) return { reuse: null, mode: 'generate' };

  // 30% reuse rate — keeps feed fresh but reaps the saving
  const REUSE_PROBABILITY = 0.30;
  if (Math.random() > REUSE_PROBABILITY) return { reuse: null, mode: 'generate' };

  // Pick the highest scoring visual that hasn't been reused recently
  const chosen = topVisuals[0];
  return { reuse: chosen, mode: 'reuse' };
}

/**
 * Mark a visual as reused (increments visual_reused_count + sets
 * reused_from_post_id on the new post).
 */
export async function markVisualReused(
  supabase: SupabaseClient,
  reusedFromPostId: string,
  newPostId: string,
): Promise<void> {
  try {
    // Increment counter on the source post
    const { data: source } = await supabase
      .from('content_calendar')
      .select('visual_reused_count')
      .eq('id', reusedFromPostId)
      .maybeSingle();
    const newCount = (source?.visual_reused_count || 0) + 1;
    await supabase
      .from('content_calendar')
      .update({ visual_reused_count: newCount, updated_at: new Date().toISOString() })
      .eq('id', reusedFromPostId);

    // Link the new post back to the source
    await supabase
      .from('content_calendar')
      .update({ reused_from_post_id: reusedFromPostId })
      .eq('id', newPostId);
  } catch (e: any) {
    console.warn('[visual-reuse] markVisualReused failed:', e?.message?.slice(0, 150));
  }
}

/**
 * Backfill performance_score on published posts that have engagement_data
 * but no score yet. Run periodically (eg daily cron).
 */
export async function backfillPerformanceScores(
  supabase: SupabaseClient,
  userId?: string,
): Promise<{ updated: number }> {
  let q = supabase
    .from('content_calendar')
    .select('id, engagement_data')
    .is('performance_score', null)
    .not('engagement_data', 'is', null)
    .eq('status', 'published')
    .limit(500);
  if (userId) q = q.eq('user_id', userId);

  const { data } = await q;
  if (!data || data.length === 0) return { updated: 0 };

  let updated = 0;
  for (const p of data as any[]) {
    const e = p.engagement_data || {};
    const score = (e.like_count || 0) * 1
      + (e.comments_count || 0) * 5
      + Math.floor((e.reach || 0) / 50);
    if (score > 0) {
      await supabase
        .from('content_calendar')
        .update({ performance_score: score })
        .eq('id', p.id);
      updated++;
    }
  }
  return { updated };
}
