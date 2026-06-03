/**
 * 2026-06-04 — Cross-platform reuse (Insta → TikTok).
 *
 * Founder ask : "reutiliser plus tard dans un ordre different et selon
 * les meilleur impacts sur insta". Lena tourne maintenant aussi sur
 * TikTok, mais générer du nouveau visuel à chaque slot ferait exploser
 * Bytedance. Stratégie :
 *
 *   1. Top IG performers (≥ 7 jours, performance_score au-dessus de la
 *      médiane client) sont éligibles pour adaptation TikTok.
 *   2. La caption + le hook sont REGÉNÉRÉS en mode TikTok-native
 *      (court, hook 1s, 3-6 hashtags, ton plus vivant).
 *   3. Le visuel est réutilisé en l'état (pas de regen → -€0.03/post),
 *      mais on TAG le post TikTok pour qu'il porte `reused_from_post_id`
 *      = post IG d'origine. Audit + anti-doublon plus tard.
 *
 * Politique :
 *   - Cross-platform UNIQUEMENT du même client (pas cross-client).
 *   - Cap : 1 reuse / semaine max pour ne pas saturer le feed TT avec
 *     du contenu IG en boucle.
 *   - Décision probabiliste 60 % reuse / 40 % génération fraîche tant
 *     qu'on a un top IG éligible.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RepurposeCandidate {
  ig_post_id: string;
  visual_url: string;
  visual_description: string;
  ig_hook: string;
  ig_caption: string;
  performance_score: number;
  published_at: string;
  format: string;
}

/**
 * Find the best IG post to repurpose for TikTok for this user.
 * Returns null when no eligible candidate (forces fresh generation).
 */
export async function findIgPostToRepurposeForTiktok(
  supabase: SupabaseClient,
  userId: string,
): Promise<RepurposeCandidate | null> {
  try {
    // 1. Has a TikTok reuse fired in the last 7 days?
    //    If yes, skip (one-reuse-per-week cap).
    const oneWeekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const { data: recentReuse } = await supabase
      .from('content_calendar')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', 'tiktok')
      .not('reused_from_post_id', 'is', null)
      .gte('created_at', oneWeekAgo)
      .limit(1);
    if (recentReuse && recentReuse.length > 0) {
      return null; // already did a TikTok reuse this week
    }

    // 2. Pull recent published IG posts with a visual_url + a score
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const { data: igPosts } = await supabase
      .from('content_calendar')
      .select('id, visual_url, visual_description, hook, caption, performance_score, published_at, format')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .eq('status', 'published')
      .not('visual_url', 'is', null)
      .gte('published_at', thirtyDaysAgo)
      .lte('published_at', sevenDaysAgo)
      .order('performance_score', { ascending: false, nullsFirst: false })
      .limit(20);

    if (!igPosts || igPosts.length === 0) return null;

    // 3. Filter: exclude posts already repurposed to TikTok before
    const igPostIds = igPosts.map((p: any) => p.id);
    const { data: alreadyRepurposed } = await supabase
      .from('content_calendar')
      .select('reused_from_post_id')
      .eq('user_id', userId)
      .eq('platform', 'tiktok')
      .in('reused_from_post_id', igPostIds);
    const alreadyDoneSet = new Set((alreadyRepurposed || []).map((r: any) => r.reused_from_post_id));
    const eligible = igPosts.filter((p: any) => !alreadyDoneSet.has(p.id));
    if (eligible.length === 0) return null;

    // 4. Median performance check — only repurpose what was above median.
    const scores = eligible.map((p: any) => p.performance_score || 0).sort((a: number, b: number) => a - b);
    const median = scores[Math.floor(scores.length / 2)] || 0;
    const topPerformers = eligible.filter((p: any) => (p.performance_score || 0) >= median);
    if (topPerformers.length === 0) return null;

    // 5. Probabilistic gate — 60 % chance to reuse vs fresh gen
    if (Math.random() > 0.6) return null;

    const chosen = topPerformers[0];
    return {
      ig_post_id: chosen.id,
      visual_url: chosen.visual_url,
      visual_description: chosen.visual_description || '',
      ig_hook: chosen.hook || '',
      ig_caption: chosen.caption || '',
      performance_score: chosen.performance_score || 0,
      published_at: chosen.published_at,
      format: chosen.format || 'post',
    };
  } catch (e: any) {
    console.warn('[cross-platform-reuse] lookup failed:', e?.message);
    return null;
  }
}

/**
 * Build a TikTok-native rewrite prompt block to bolt onto Lena's
 * caption regen when reusing an IG visual. The visual stays, the copy
 * is reborn in TikTok's voice.
 */
export function buildTiktokRewritePrompt(c: RepurposeCandidate): string {
  return `
🔄 TIKTOK REPURPOSE — Visuel IG performant (score ${c.performance_score})
Hook IG d'origine : "${c.ig_hook.substring(0, 100)}"
Caption IG d'origine : "${c.ig_caption.substring(0, 200)}…"

ADAPTE pour TikTok :
- Hook 1 seconde max (question / chiffre choc / curiosity gap)
- Caption FR < 150 chars (TikTok caption ≠ IG caption)
- 3 à 6 hashtags trending niche + pourtoi/fyp
- Ton oral, plus direct, urgence > élégance
- Pas de "lien en bio" (TikTok ne clique pas) → CTA "réponds 'oui'" / "commente X"
- Réécris COMPLÈTEMENT, ne copie pas — c'est une autre histoire autour du même visuel
`.trim();
}
