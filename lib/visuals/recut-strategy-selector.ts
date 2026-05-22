/**
 * Léna's strategy selector for video recuts + hook styles.
 *
 * Léna doesn't hard-code one strategy across every client. She adapts
 * to:
 *   1. BUSINESS TYPE — a restaurant tells stories well (storytime),
 *      a coach demonstrates change (before/after), a boutique benefits
 *      from quick-cuts that match TikTok's snappy aesthetic.
 *   2. NETWORK — TikTok rewards 3-cut quick montages; Instagram Reels
 *      favours a 3-act narrative; LinkedIn wants clean expert framing.
 *   3. VARIATION — avoids repeating the same strategy 3 times in a row
 *      for the same client (the algorithm + the audience both get
 *      bored).
 *
 * The selector returns BOTH a recut strategy AND a hook style. Both
 * decisions are coupled — a 'best_of_3' recut pairs naturally with a
 * 'red_arrow_callout' or 'quick_cut_montage' hook, while a
 * 'hook_escalation_payoff' recut pairs with a 'storytime_opener' or
 * 'controversy_take' hook.
 *
 * Used by Léna content generation when she processes an uploaded video.
 * Also used by Studio as the default 'auto' selection.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecutStrategy } from './video-recut';
import type { HookStyle } from './video-hook';

export type Network = 'instagram' | 'tiktok' | 'linkedin';

export interface RecutChoice {
  recutStrategy: RecutStrategy;
  hookStyle: HookStyle;
  reason: string; // human-readable, surfaced in the brief for transparency
}

// Business-type → preferred (strategy, hook style) pairings.
// First entry is the default pick when no rotation pressure; rest are
// the variation pool the selector cycles through.
const BUSINESS_PRESETS: Record<string, RecutChoice[]> = {
  restaurant: [
    { recutStrategy: 'hook_escalation_payoff', hookStyle: 'storytime_opener',  reason: 'Storytelling autour du plat — restaurant = narratif émotionnel' },
    { recutStrategy: 'best_of_3',              hookStyle: 'three_word_punch',  reason: '3 meilleurs moments servis cash — efficace en service rapide' },
    { recutStrategy: 'preserve_order',         hookStyle: 'pov_opener',        reason: 'POV: tu rentres dans le resto — immersion brute' },
  ],
  coach: [
    { recutStrategy: 'hook_escalation_payoff', hookStyle: 'before_after',     reason: 'Avant/Après = preuve de transformation, signature du coaching' },
    { recutStrategy: 'best_of_3',              hookStyle: 'stat_carton',      reason: 'Chiffre choc des résultats clients' },
    { recutStrategy: 'hook_escalation_payoff', hookStyle: 'controversy_take', reason: 'Hot take contrarian — différencie le coach des concurrents' },
  ],
  coiffeur: [
    { recutStrategy: 'best_of_3',              hookStyle: 'before_after',     reason: 'Transformation = la métrique du coiffeur. 3 angles forts.' },
    { recutStrategy: 'hook_escalation_payoff', hookStyle: 'three_word_punch', reason: 'Découpe narrative avec ouverture punchy' },
    { recutStrategy: 'preserve_order',         hookStyle: 'pov_opener',       reason: 'POV: tu rentres dans le salon — sensation de service' },
  ],
  fleuriste: [
    { recutStrategy: 'preserve_order',         hookStyle: 'clean_cut_intro', reason: 'Préserve la composition florale, ouverture sobre' },
    { recutStrategy: 'hook_escalation_payoff', hookStyle: 'storytime_opener', reason: 'Histoire d\'une commande — anniversaire, mariage, deuil' },
    { recutStrategy: 'best_of_3',              hookStyle: 'three_word_punch', reason: '3 bouquets, 3 ambiances — efficace pour les saisons' },
  ],
  boutique: [
    { recutStrategy: 'best_of_3',              hookStyle: 'red_arrow_callout', reason: 'Spot produit + flèche rouge — réflexe TikTok-native' },
    { recutStrategy: 'best_of_3',              hookStyle: 'quick_cut_montage', reason: '3 produits flash, algo TikTok adore' },
    { recutStrategy: 'hook_escalation_payoff', hookStyle: 'stat_carton',       reason: 'Stat de vente comme accroche, narrative ensuite' },
  ],
  caviste: [
    { recutStrategy: 'hook_escalation_payoff', hookStyle: 'storytime_opener', reason: 'Histoire du vigneron ou de la cave — pédagogie' },
    { recutStrategy: 'best_of_3',              hookStyle: 'question_hook',    reason: '"Pourquoi ce vin ?" — curiosity gap' },
    { recutStrategy: 'preserve_order',         hookStyle: 'clean_cut_intro',  reason: 'Dégustation linéaire, ouverture pro' },
  ],
  services: [
    { recutStrategy: 'hook_escalation_payoff', hookStyle: 'before_after',     reason: 'Avant/Après chantier — métier de service par excellence' },
    { recutStrategy: 'best_of_3',              hookStyle: 'stat_carton',      reason: 'Chiffres impressionnants du résultat' },
    { recutStrategy: 'best_of_3',              hookStyle: 'red_arrow_callout', reason: 'Détail technique pointé — Tiktok visuel' },
  ],
  agence: [
    { recutStrategy: 'best_of_3',              hookStyle: 'stat_carton',      reason: 'Stats clients = preuve d\'expertise agence' },
    { recutStrategy: 'hook_escalation_payoff', hookStyle: 'controversy_take', reason: 'Hot take sur le marketing — différencie l\'agence' },
    { recutStrategy: 'hook_escalation_payoff', hookStyle: 'storytime_opener', reason: 'Étude de cas client — récit d\'impact' },
  ],
};

// Network adjustments: certain hook styles are more native to one
// platform. We re-weight when the chosen network doesn't fit.
const NETWORK_AFFINITY: Record<Network, HookStyle[]> = {
  tiktok:    ['quick_cut_montage', 'red_arrow_callout', 'controversy_take', 'three_word_punch'],
  instagram: ['storytime_opener',  'before_after',     'pov_opener',        'clean_cut_intro'],
  linkedin:  ['stat_carton',       'clean_cut_intro',  'question_hook'],
};

/**
 * Fetch the last N recut strategies used by this client to avoid
 * repetition. Reads from agent_logs where action ends with 'recut'.
 */
async function fetchRecentStrategies(
  supabase: SupabaseClient,
  userId: string | null,
  limit: number = 5,
): Promise<Array<{ strategy: RecutStrategy; hookStyle: HookStyle }>> {
  if (!userId) return [];
  try {
    const { data } = await supabase
      .from('agent_logs')
      .select('data')
      .eq('user_id', userId)
      .eq('agent', 'content')
      .eq('action', 'video_recut_applied')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []).map((row: any) => ({
      strategy: row?.data?.strategy as RecutStrategy,
      hookStyle: row?.data?.hookStyle as HookStyle,
    })).filter(r => r.strategy && r.hookStyle);
  } catch {
    return [];
  }
}

/**
 * Léna selects the right recut strategy + hook style for THIS client's
 * next video. Adapts to business type, network, and prior strategies
 * (rotation to avoid repetition).
 */
export async function selectRecutStrategy(args: {
  supabase: SupabaseClient;
  userId: string | null;
  businessType: string | null;
  network: Network;
}): Promise<RecutChoice> {
  const { supabase, userId, businessType, network } = args;
  const bizKey = (businessType || '').toLowerCase();
  // Map various business_type names to our preset keys.
  const resolved = BUSINESS_PRESETS[bizKey]
    || BUSINESS_PRESETS[bizKey.split('_')[0]]
    || BUSINESS_PRESETS[bizKey.split(' ')[0]]
    || BUSINESS_PRESETS['services']; // generic fallback

  const recent = await fetchRecentStrategies(supabase, userId, 5);
  const recentlyUsed = new Set(recent.map(r => `${r.strategy}|${r.hookStyle}`));

  // Find a preset not recently used. If all 3 were used recently, pick
  // the oldest one (the one furthest back).
  let chosen = resolved.find(p => !recentlyUsed.has(`${p.recutStrategy}|${p.hookStyle}`));
  if (!chosen) chosen = resolved[recent.length % resolved.length];

  // Network affinity check — if the hook style isn't native to the
  // chosen network, swap to the network's top choice but keep the
  // recut strategy (which depends on business type more than network).
  const networkPool = NETWORK_AFFINITY[network] || [];
  if (networkPool.length > 0 && !networkPool.includes(chosen.hookStyle)) {
    // Find the first native style from the network pool that we
    // haven't recently used.
    const nativeUnused = networkPool.find(h => !recentlyUsed.has(`${chosen!.recutStrategy}|${h}`));
    if (nativeUnused) {
      chosen = {
        recutStrategy: chosen.recutStrategy,
        hookStyle: nativeUnused,
        reason: `${chosen.reason} (style ajusté pour ${network})`,
      };
    }
  }

  return chosen;
}
