/**
 * 2026-06-04 — Cross-platform reuse BIDIRECTIONNEL (IG ↔ TikTok).
 *
 * Founder ask 1 : "reutiliser plus tard dans un ordre different et
 * selon les meilleur impacts sur insta".
 * Founder ask 2 : "les images publiees sur insta peuvent aussi etre
 * utilisées dans tiktok ofc le reus/transfer se fait dans les 2 sens".
 *
 * Stratégie :
 *
 *   IG top performer → adaptation TikTok :
 *     - Top IG (≥ 7 jours, score ≥ médiane), pas déjà repurposé.
 *     - Caption REGÉNÉRÉE en mode TikTok-native (hook 1s, 3-6 hashtags).
 *     - Visuel réutilisé (-€0.03/post Bytedance).
 *
 *   TikTok top performer → adaptation IG :
 *     - Top TikTok (≥ 7 jours, ratio engagement/vues élevé), pas déjà
 *       repurposé vers IG.
 *     - Caption REGÉNÉRÉE en mode IG-native (storytelling 3-5 lignes,
 *       jusqu'à 30 hashtags structurés).
 *     - Visuel réutilisé.
 *
 * Politique commune :
 *   - INTRA-client uniquement (pas cross-client).
 *   - Cap : 1 reuse / semaine / direction (max 2 reuse/sem total).
 *   - 60 % probabilité quand top performer éligible existe, sinon
 *     génération fraîche.
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
 * 2026-06-04 — Reverse direction: TikTok → IG repurpose.
 * Same shape and policy as findIgPostToRepurposeForTiktok, but pulls
 * from published TikTok posts and gates the IG side. Returns null when
 * no candidate (forces fresh generation).
 */
export async function findTiktokPostToRepurposeForIg(
  supabase: SupabaseClient,
  userId: string,
): Promise<RepurposeCandidate | null> {
  try {
    // Cap : 1 IG-direction reuse per week
    const oneWeekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const { data: recentReuse } = await supabase
      .from('content_calendar')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .not('reused_from_post_id', 'is', null)
      .gte('created_at', oneWeekAgo)
      .limit(1);
    if (recentReuse && recentReuse.length > 0) return null;

    // Top TikTok posts ≥ 7 days, ≤ 30 days, with a visual + score
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const { data: ttPosts } = await supabase
      .from('content_calendar')
      .select('id, visual_url, visual_description, hook, caption, performance_score, published_at, format')
      .eq('user_id', userId)
      .eq('platform', 'tiktok')
      .eq('status', 'published')
      .not('visual_url', 'is', null)
      .gte('published_at', thirtyDaysAgo)
      .lte('published_at', sevenDaysAgo)
      .order('performance_score', { ascending: false, nullsFirst: false })
      .limit(20);
    if (!ttPosts || ttPosts.length === 0) return null;

    // Exclude posts already repurposed to IG
    const ttPostIds = ttPosts.map((p: any) => p.id);
    const { data: alreadyRepurposed } = await supabase
      .from('content_calendar')
      .select('reused_from_post_id')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .in('reused_from_post_id', ttPostIds);
    const alreadyDoneSet = new Set((alreadyRepurposed || []).map((r: any) => r.reused_from_post_id));
    const eligible = ttPosts.filter((p: any) => !alreadyDoneSet.has(p.id));
    if (eligible.length === 0) return null;

    // Score median gate
    const scores = eligible.map((p: any) => p.performance_score || 0).sort((a: number, b: number) => a - b);
    const median = scores[Math.floor(scores.length / 2)] || 0;
    const topPerformers = eligible.filter((p: any) => (p.performance_score || 0) >= median);
    if (topPerformers.length === 0) return null;

    // 60% probabilistic gate
    if (Math.random() > 0.6) return null;

    const chosen = topPerformers[0];
    return {
      ig_post_id: chosen.id, // shape compat — actually a TT post id here
      visual_url: chosen.visual_url,
      visual_description: chosen.visual_description || '',
      ig_hook: chosen.hook || '',
      ig_caption: chosen.caption || '',
      performance_score: chosen.performance_score || 0,
      published_at: chosen.published_at,
      format: chosen.format || 'post',
    };
  } catch (e: any) {
    console.warn('[cross-platform-reuse] TikTok→IG lookup failed:', e?.message);
    return null;
  }
}

/**
 * Build an IG-native rewrite prompt block when reusing a TikTok
 * visual on Instagram. IG storytelling, structured hashtags, 3-5
 * lines body.
 */
export function buildIgRewritePrompt(c: RepurposeCandidate): string {
  return `
🔄 IG REPURPOSE — Visuel TikTok performant (score ${c.performance_score})
Hook TT d'origine : "${c.ig_hook.substring(0, 100)}"
Caption TT d'origine : "${c.ig_caption.substring(0, 200)}…"

ADAPTE pour Instagram :
- Hook 1ère ligne IG (curiosity gap, pas de "POV:" TikTok-vibe)
- Storytelling 3-5 lignes courtes, espacées
- 8-15 hashtags niche + 5-10 broad
- Émojis ponctuellement, ton réfléchi vs urgence TT
- CTA "lien en bio" / "DM nous" (IG permet le clic)
- Réécris COMPLÈTEMENT, ne copie pas — même visuel, autre histoire
`.trim();
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
