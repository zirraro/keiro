/**
 * Per-plan monthly budget guard — protège la marge 80% côté serveur.
 *
 * Founder rule 2026-06-09 : "les marges aussi sur createur a 80%". Pour
 * un Créateur à 49 €/mois, marge 80% = max 9.80 €/mois de coût infra.
 * Si un client gourmand pousse la cadence (auto-publish, regen i2i en
 * boucle, etc.), on doit le freiner avant qu'il bouffe la marge.
 *
 * Garde-fou en 3 paliers :
 *   - GREEN : cost <= 60% du budget mensuel → laisse passer
 *   - AMBER : 60-85% → laisse passer mais préfère les modes éco
 *             (Haiku au lieu de Sonnet, skip i2i de luxe, reuse)
 *   - RED   : > 85% → block les ops chères (génération nouvelle reel,
 *             nouvel i2i Seedream). L'agent affiche un fallback : reuse
 *             d'une asset existante.
 */

// Plan cost ceilings (EUR/mois) pour viser 80% margin.
// On laisse 20% de marge de manœuvre par rapport au ceiling théorique
// (cost = revenue × 0.20) pour absorber les pics légitimes.
export const PLAN_COST_CEILING: Record<string, number> = {
  free: 1.5,           // gratuit → cap symbolique
  createur: 9.80,      // 49 × 0.20
  pro: 19.80,          // 99 × 0.20
  fondateurs: 15.80,   // 79 × 0.20 (early bird locked)
  business: 39.80,     // 199 × 0.20
  elite: 59.80,        // 299 × 0.20 (legacy)
  agence: 99.80,       // 499 × 0.20
  admin: 99999,        // pas de cap pour admin
};

export type BudgetLevel = 'green' | 'amber' | 'red';

export interface BudgetState {
  plan: string;
  ceiling: number;
  spent: number;
  pct: number;
  level: BudgetLevel;
  allow_expensive: boolean;  // false = block new reel/i2i generation
  prefer_eco: boolean;       // true = use Haiku/Gemini, reuse assets
}

/**
 * Compute the budget state for a client given their plan + estimated
 * cost-month-to-date. Use this BEFORE expensive operations to decide
 * whether to proceed or fallback to eco mode.
 */
export function evaluateBudget(plan: string | null | undefined, costMtdEur: number): BudgetState {
  const planKey = (plan || 'free').toLowerCase();
  const ceiling = PLAN_COST_CEILING[planKey] ?? PLAN_COST_CEILING.free;
  const pct = ceiling > 0 ? Math.round((costMtdEur / ceiling) * 100) : 0;
  let level: BudgetLevel = 'green';
  if (pct >= 85) level = 'red';
  else if (pct >= 60) level = 'amber';
  return {
    plan: planKey,
    ceiling,
    spent: costMtdEur,
    pct,
    level,
    allow_expensive: level !== 'red',
    prefer_eco: level !== 'green',
  };
}

/**
 * 2026-06-09 — Resolve effective plan for a (client × agent) pair.
 *
 * Founder ask: tester les quotas Créateur sur Léna tout en gardant
 * subscription_plan=pro pour les autres agents.
 *
 * Lookup order:
 *   1. org_agent_configs.config.plan_override (per-agent override)
 *   2. profiles.subscription_plan (default)
 *
 * Returns the plan string to feed into evaluateBudget / quota checks.
 */
export async function resolveEffectivePlan(
  supabase: any,
  userId: string,
  agentId: string,
): Promise<string> {
  if (!userId) return 'free';
  try {
    // Per-agent override (most-recent row wins if duplicates)
    const { data: agentCfg } = await supabase
      .from('org_agent_configs')
      .select('config')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const override = (agentCfg as any)?.config?.plan_override;
    if (override && typeof override === 'string') {
      return override.toLowerCase();
    }
    // Fallback to subscription_plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_plan')
      .eq('id', userId)
      .maybeSingle();
    return ((profile as any)?.subscription_plan || 'free').toLowerCase();
  } catch {
    return 'free';
  }
}

/**
 * Per-plan daily publication quotas — calibres pour garder 80% margin.
 *
 * Modele Createur (49 EUR/mois, ceiling 9.80 EUR) :
 *   - IG feed: 1/jour (mix post + 1 reel/semaine) ~ 2.74 EUR/mois
 *   - IG stories: 1/jour recycle + teaser auto post-publish (~0 EUR)
 *   - TT: 1/jour mais MAJORITAIREMENT photo mode (recycle ~0 EUR)
 *         + 2 vidéos/semaine seulement (~2.48 EUR/mois)
 *   - LI: off
 *   Total Lena ~6.72 EUR/mois -> marge ~81% sur 49 EUR
 *
 * Modele Pro (99 EUR/mois, ceiling 19.80 EUR) :
 *   - IG feed: 2/jour (~3 EUR) + 2-3 reels/sem (~3 EUR)
 *   - IG stories: 2/jour
 *   - TT: 1 vidéo/jour (~9.30 EUR) + 1 photo mode/jour (recycle)
 *   - LI: 1/jour
 *   Total ~19.30 EUR/mois -> marge ~78% sur 99 EUR
 *
 * `tt_videos_per_week` est important: limite les couteux video gen
 * meme si le quota tt journalier est "1" (Photo Mode prend le relais).
 */
export interface PlanCadence {
  ig: number;                   // posts feed IG / jour
  tt: number;                   // contenus TT / jour (incluant photos)
  li: number;                   // posts LinkedIn / jour
  stories_ig: number;           // stories IG / jour (recycle + teaser)
  stories_tt: number;           // photo mode TT / jour (recycle + teaser)
  ig_reels_per_week: number;    // cap reels IG hebdo (couteux)
  tt_videos_per_week: number;   // cap videos TT hebdo (couteux)
}

export const PLAN_DAILY_PUBLISH: Record<string, PlanCadence> = {
  free:       { ig: 0, tt: 0, li: 0, stories_ig: 0, stories_tt: 0, ig_reels_per_week: 0, tt_videos_per_week: 0 },
  createur:   { ig: 1, tt: 1, li: 0, stories_ig: 1, stories_tt: 1, ig_reels_per_week: 1, tt_videos_per_week: 2 },
  pro:        { ig: 2, tt: 1, li: 1, stories_ig: 2, stories_tt: 1, ig_reels_per_week: 3, tt_videos_per_week: 7 },
  fondateurs: { ig: 2, tt: 1, li: 1, stories_ig: 2, stories_tt: 1, ig_reels_per_week: 2, tt_videos_per_week: 5 },
  business:   { ig: 3, tt: 2, li: 2, stories_ig: 3, stories_tt: 2, ig_reels_per_week: 4, tt_videos_per_week: 10 },
  elite:      { ig: 4, tt: 3, li: 3, stories_ig: 4, stories_tt: 2, ig_reels_per_week: 6, tt_videos_per_week: 14 },
  agence:     { ig: 5, tt: 4, li: 3, stories_ig: 5, stories_tt: 3, ig_reels_per_week: 8, tt_videos_per_week: 21 },
  admin:      { ig: 99, tt: 99, li: 99, stories_ig: 99, stories_tt: 99, ig_reels_per_week: 99, tt_videos_per_week: 99 },
};

/**
 * Helper : count how many publish slots are already used today
 * on a given platform/format for this user. Used by the publish
 * loop to enforce PLAN_DAILY_PUBLISH caps in real time.
 */
export async function countPublishedToday(
  supabase: any,
  userId: string,
  platform: string,
  formats?: string[],
): Promise<number> {
  if (!userId) return 0;
  const today = new Date().toISOString().split('T')[0];
  let q = supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('status', 'published')
    .gte('published_at', today + 'T00:00:00Z')
    .lte('published_at', today + 'T23:59:59Z');
  if (formats && formats.length > 0) q = q.in('format', formats);
  const { count } = await q;
  return count || 0;
}

export async function countPublishedThisWeek(
  supabase: any,
  userId: string,
  platform: string,
  formats: string[],
): Promise<number> {
  if (!userId) return 0;
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('status', 'published')
    .in('format', formats)
    .gte('published_at', since);
  return count || 0;
}

/**
 * Quick DB lookup : estimate cost-month-to-date for a client. Used by
 * agent routes before expensive ops. Cheap aggregation : 4 count queries.
 */
export async function estimateClientCostMtd(
  supabase: any,
  userId: string,
): Promise<number> {
  if (!userId) return 0;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const since = monthStart.toISOString();

  try {
    const [
      { data: logs },
      { data: posts },
      { count: emailsCount },
    ] = await Promise.all([
      supabase.from('agent_logs').select('agent').eq('user_id', userId).gte('created_at', since).limit(5000),
      supabase.from('content_calendar').select('format').eq('user_id', userId).eq('status', 'published').gte('published_at', since),
      supabase.from('crm_activities').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('type', 'email').gte('created_at', since),
    ]);

    let cost = 0.40; // OVH share
    for (const l of (logs || []) as any[]) {
      // Heuristic agent → model mapping (matches cost-margin route)
      if (['hugo', 'jade', 'ami', 'noah', 'ceo', 'email', 'dm_instagram', 'reviews', 'marketing'].includes(l.agent)) {
        cost += 0.012 * 0.55; // Sonnet w/ prompt caching
      } else if (['instagram_comments', 'tiktok_comments'].includes(l.agent)) {
        cost += 0.0015; // Haiku
      } else {
        cost += 0.001; // Gemini
      }
    }
    for (const p of (posts || []) as any[]) {
      cost += p.format === 'video' || p.format === 'reel' ? 0.30 : 0.04;
    }
    cost += (emailsCount || 0) * 0.0003;
    return cost;
  } catch {
    return 0;
  }
}
