/**
 * Cadence preview — endpoint qui calcule en LIVE le mix image/vidéo
 * possible pour un client selon son plan et la position d'un curseur
 * "video_ratio" (0 = full images, 100 = full videos).
 *
 * Founder ask 2026-06-09 : "proposer dans la planification une jauge
 * pour manger les credits — si 100% video voila combien de publi, si
 * 100% image voila combien, sinon mix et le client pose son curseur,
 * nous on s'adapte des validation de la demande".
 *
 * Le ratio remplit le "budget de génération" disponible après
 * coûts fixes (Anthropic briefs + recycle/stories gratuits) avec un
 * mix image/vidéo proportionnel.
 *
 * GET /api/agents/content/cadence-preview?plan=createur&video_ratio=50
 *
 * Réponse :
 *   {
 *     plan, video_ratio, monthly_budget_eur, fixed_costs_eur, gen_budget_eur,
 *     cadence: {
 *       ig_posts_per_week, ig_posts_per_day,
 *       ig_reels_per_week,
 *       tt_videos_per_week, tt_videos_per_day,
 *       tt_photos_per_day (recycle, free),
 *       stories_per_day,
 *       linkedin_per_week
 *     },
 *     estimated_cost_per_month_eur,
 *     margin_pct,
 *     warnings: ["..."]    // si la combinaison dépasse le ceiling
 *   }
 */
import { NextRequest, NextResponse } from 'next/server';
import { PLAN_COST_CEILING, PLAN_DAILY_PUBLISH } from '@/lib/credits/plan-budget-guard';
import { CREDIT_COSTS, PLAN_CREDITS } from '@/lib/credits/constants';

export const runtime = 'nodejs';
export const maxDuration = 10;

// Unit costs (EUR) — calibrated 2026-06-09 audit
const COST = {
  image_seedream:   0.045, // Seedream + cover compression
  video_clip_5s:    0.31,  // Seedance/Kling 5s
  video_clip_10s:   0.55,  // longer clips (multi-segment)
  story_recycle:    0.00,  // existing asset
  brief_anthropic:  0.012, // Claude Sonnet w/ caching per post
  fixed_overhead:   0.50,  // OVH + tooling share per client
};

// Plan revenue (EUR / mois) — used to compute margin
const PLAN_REVENUE: Record<string, number> = {
  free: 0,
  createur: 49,
  pro: 99,
  fondateurs: 79,
  business: 199,
  elite: 299,
  agence: 499,
  admin: 0,
};

interface CadenceOutput {
  plan: string;
  video_ratio: number;
  monthly_budget_eur: number;
  fixed_costs_eur: number;
  gen_budget_eur: number;
  cadence: {
    ig_posts_per_week: number;
    ig_posts_per_day: number;
    ig_reels_per_week: number;
    tt_videos_per_week: number;
    tt_videos_per_day: number;
    tt_photos_per_day: number;
    stories_per_day: number;
    linkedin_per_week: number;
  };
  estimated_cost_per_month_eur: number;
  margin_pct: number;
  /** Credits consumed by THIS specific cadence per month */
  credits_consumed_per_month: number;
  /** Total plan credit allowance */
  plan_credits_total: number;
  /** Percent of plan credits used (0-100+) */
  credits_pct: number;
  /** Status: ok | close | exceeded */
  credits_status: 'ok' | 'close' | 'exceeded';
  /** Safe ancillary buffer — usage keeps margin >= 75% */
  safe_buffer_credits: number;
  /** Warn buffer — usage drops margin to 70-75% */
  warn_buffer_credits: number;
  /** Total credits available beyond publications (might be > safe) */
  remaining_credits: number;
  /** Should we propose an upsell ? */
  upsell_suggested: boolean;
  /** Kind of upsell : 'pack' (credit pack) or 'upgrade' (plan supérieur) */
  upsell_kind: 'pack' | 'upgrade' | 'none';
  warnings: string[];
}

interface ComputeOpts {
  /** Réseaux que le client veut activer.
   *  Créateur : max 2 sur les 3 (sinon block + upsell).
   *  Pro+     : up to 3.
   *  Si undefined : défaut = ['instagram', 'tiktok'] (Créateur) ou tous (Pro+).
   */
  enabled_networks?: ('instagram' | 'tiktok' | 'linkedin')[];
}

function computeCadence(plan: string, videoRatio: number, opts: ComputeOpts = {}): CadenceOutput {
  const ceiling = PLAN_COST_CEILING[plan] ?? PLAN_COST_CEILING.free;
  const revenue = PLAN_REVENUE[plan] ?? 0;
  const cap = PLAN_DAILY_PUBLISH[plan] ?? PLAN_DAILY_PUBLISH.free;

  // Founder rule 2026-06-09 : Créateur peut activer LinkedIn mais
  // doit sacrifier 1 ou 2 réseaux (max 2 réseaux actifs simultanément).
  // Pro+ : tous les réseaux activables.
  const isCreateur = plan === 'createur';
  const defaultNetworks: ('instagram' | 'tiktok' | 'linkedin')[] =
    isCreateur ? ['instagram', 'tiktok'] : ['instagram', 'tiktok', 'linkedin'];
  const requested = opts.enabled_networks || defaultNetworks;
  // Filter to allowed + dedupe
  const networks = Array.from(new Set(requested.filter(n => ['instagram', 'tiktok', 'linkedin'].includes(n))));
  const maxNetworks = isCreateur ? 2 : 3;
  const tooManyNetworks = networks.length > maxNetworks;
  // Apply cap : si client demande 3 mais Créateur, on tronque à 2
  // (le frontend prévient avant via warnings)
  const activeNetworks = networks.slice(0, maxNetworks);
  const igActive = activeNetworks.includes('instagram');
  const ttActive = activeNetworks.includes('tiktok');
  const liActive = activeNetworks.includes('linkedin');

  // Fixed costs that exist regardless of mix
  const fixedBriefs = COST.brief_anthropic * 30 * 1.5;       // ~30 briefs/mois × 1.5 (planning + retry)
  const fixedOverhead = COST.fixed_overhead;
  const fixedCosts = fixedBriefs + fixedOverhead;
  const genBudget = Math.max(0, ceiling - fixedCosts);

  // Mix logic : the generation budget is split between videos and images.
  // video_ratio = 0   → 0% budget on videos, 100% on images
  // video_ratio = 100 → 100% budget on videos, 0% on images
  // 50% → split half-half by EUR (not by count, since unit costs differ)
  const r = Math.max(0, Math.min(100, videoRatio)) / 100;
  const budgetForVideos = genBudget * r;
  const budgetForImages = genBudget * (1 - r);

  // Translate budgets into counts
  const videosPerMonth = Math.floor(budgetForVideos / COST.video_clip_5s);
  const imagesPerMonth = Math.floor(budgetForImages / COST.image_seedream);

  // 2026-06-09 — Founder ask : le curseur doit VRAIMENT scaler avec
  // le mix. Plus vers vidéo = plus de 3 TT/sem possibles. Marge baisse
  // un peu mais reste ~80% objectif.
  //
  // Stratégie : on supprime les hard caps "tt_videos_per_week",
  // "ig_reels_per_week" du plan et on laisse le budget driver le
  // nombre. On garde des sanity caps anti-spam (~ratio max réaliste).
  //
  // Hard sanity caps (anti-spam, pas margin) :
  //   TT vidéos    : max ~1.5/jour soit 10/sem (algo TT tolère plus)
  //   IG reels     : max 1/jour soit 7/sem
  //   IG posts     : max 2/jour soit 14/sem (au-delà = sature feed)
  //   LinkedIn     : max 1/jour soit 7/sem (algo LI pénalise spam pro)

  // Vidéos uniquement vers les réseaux actifs (TT prioritaire si actif)
  let ttVideosMonth = 0;
  let igReelsMonth = 0;
  if (ttActive && igActive) {
    ttVideosMonth = Math.round(videosPerMonth * 0.80);
    igReelsMonth = videosPerMonth - ttVideosMonth;
  } else if (ttActive) {
    ttVideosMonth = videosPerMonth;
  } else if (igActive) {
    igReelsMonth = videosPerMonth;
  }
  // LinkedIn n'a pas de reel — vidéos = IG/TT uniquement

  const liAllowed = liActive;
  // Images distribuées entre réseaux actifs IG + LI uniquement
  let igImagesMonth = 0;
  let liImagesMonth = 0;
  if (igActive && liActive) {
    igImagesMonth = Math.round(imagesPerMonth * 0.70);
    liImagesMonth = imagesPerMonth - igImagesMonth;
  } else if (igActive) {
    igImagesMonth = imagesPerMonth;
  } else if (liActive) {
    liImagesMonth = imagesPerMonth;
  } else if (ttActive) {
    // Cas Créateur LI+TT sans IG : TT photos = recycle (gratuit) +
    // un peu de génération photo
    igImagesMonth = 0;
    liImagesMonth = 0;
  }

  // Budget-driven counts (no plan cap, sanity cap only)
  const SANITY_TT_VIDS_PER_WEEK = 10;
  const SANITY_IG_REELS_PER_WEEK = 7;
  const SANITY_IG_POSTS_PER_WEEK = 14;
  const SANITY_LI_PER_WEEK = 7;

  const ttVideosPerWeek = ttActive ? Math.min(SANITY_TT_VIDS_PER_WEEK, Math.round(ttVideosMonth / 4.33)) : 0;
  const igReelsPerWeek  = igActive ? Math.min(SANITY_IG_REELS_PER_WEEK, Math.round(igReelsMonth / 4.33)) : 0;
  const igPostsPerWeek  = igActive ? Math.min(SANITY_IG_POSTS_PER_WEEK, Math.round(igImagesMonth / 4.33)) : 0;
  const liPerWeek       = liActive ? Math.min(SANITY_LI_PER_WEEK, Math.round(liImagesMonth / 4.33)) : 0;

  // Per-day rounding (informational — clients see "1.5/jour" as "1-2/jour")
  const igPostsPerDay   = +(igPostsPerWeek / 7).toFixed(1);
  const ttVideosPerDay  = +(ttVideosPerWeek / 7).toFixed(1);
  const storiesPerDay   = Math.max(cap.stories_ig, cap.stories_tt); // 1 IG + 1 TT in Créateur

  // Estimated true monthly cost based on capped counts
  const estCost =
    fixedCosts +
    ttVideosPerWeek * 4.33 * COST.video_clip_5s +
    igReelsPerWeek  * 4.33 * COST.video_clip_5s +
    igPostsPerWeek  * 4.33 * COST.image_seedream +
    liPerWeek       * 4.33 * COST.image_seedream;

  const margin = revenue > 0 ? Math.round(((revenue - estCost) / revenue) * 100) : 0;

  // ─── Credit consumption per month (client-facing) ─────────
  // Convention 2026-06-09 :
  //   - image_t2i = 4 cr (toute nouvelle image)
  //   - Durée vidéo par défaut DÉPEND DU PLAN :
  //       Créateur → 5s (15 cr) - optimisé TT FYP
  //       Pro      → 10s (25 cr)
  //       Business+ → 15s (35 cr)
  //   - Stories recycle / TT photo recycle = 0 cr (la lib existe)
  //   - briefs LLM = négligeable côté crédits client
  // On compte les NOUVELLES générations seulement, pas les recycles.
  const creditsPerImage = CREDIT_COSTS.image_t2i;        // 4
  const creditsPerVideoByPlan: Record<string, number> = {
    free: CREDIT_COSTS.video_5s,           // 15
    createur: CREDIT_COSTS.video_5s,       // 15 — duré 5s par défaut
    pro: CREDIT_COSTS.video_10s,           // 25 — durée 10s
    fondateurs: CREDIT_COSTS.video_10s,    // 25
    business: CREDIT_COSTS.video_15s,      // 35 — durée 15s
    elite: CREDIT_COSTS.video_15s,         // 35
    agence: CREDIT_COSTS.video_30s,        // 50
    admin: CREDIT_COSTS.video_5s,
  };
  const creditsPerVideo = creditsPerVideoByPlan[plan] ?? CREDIT_COSTS.video_5s;
  const creditsConsumed = Math.round(
    igPostsPerWeek  * 4.33 * creditsPerImage +
    igReelsPerWeek  * 4.33 * creditsPerVideo +
    ttVideosPerWeek * 4.33 * creditsPerVideo +
    liPerWeek       * 4.33 * creditsPerImage
  );
  const planCredits = PLAN_CREDITS[plan] ?? 0;
  const creditsPct = planCredits > 0 ? Math.round((creditsConsumed / planCredits) * 100) : 0;
  let creditsStatus: 'ok' | 'close' | 'exceeded' = 'ok';
  // Marge < 65% = block (équivalent dépassement crédits)
  if (creditsPct > 100 || margin < 65) creditsStatus = 'exceeded';
  else if (creditsPct >= 85 || margin < 75) creditsStatus = 'close';

  // ─── Safe ancillary buffer ────────────────────────────────
  // Founder rule 2026-06-09 : "619 cr restants me parait beaucoup —
  // si client génère vidéos en autonomie on est vite hors marge —
  // adapter + bloquer/upsell + gardefous".
  //
  // On distingue 3 zones dans les crédits restants :
  //   - SAFE buffer : ce que le client peut consommer en studio
  //     sans faire descendre la marge globale < 75%
  //   - WARN buffer : entre 75% et 65% — upsell pack suggéré
  //   - DANGER zone : sous 65% — block studio gen vidéo cher
  //
  // Calcul du SAFE buffer :
  //   margeFloor = 75% -> coût max = revenue × 0.25
  //   coûtPublication actuel = estCost (déjà calculé)
  //   coûtAncillaryMax = revenue × 0.25 - estCost
  //   safeBufferCredits = coûtAncillaryMax / coûtMoyenParCredit
  const marginFloor75 = revenue * 0.25;   // cost max pour 75% margin
  const marginFloor70 = revenue * 0.30;   // cost max pour 70% margin
  const ancillaryBudget75 = Math.max(0, marginFloor75 - estCost);
  const ancillaryBudget70 = Math.max(0, marginFloor70 - estCost);
  // Coût moyen par crédit ancillary : mix image i2i (3cr=0.03€) +
  // chat (1cr=0.0007€) + narration (2cr=0.01€) ≈ 0.012€/cr moyen.
  const avgCostPerAncillaryCredit = 0.012;
  const safeCredits = Math.round(ancillaryBudget75 / avgCostPerAncillaryCredit);
  const warnCredits = Math.round(ancillaryBudget70 / avgCostPerAncillaryCredit);
  const remainingCredits = Math.max(0, planCredits - creditsConsumed);
  // Capper le "safe" au "vraiment restant" — pas la peine de dire
  // qu'on a 500 cr safe si plan en a que 200 dispos
  const safeBufferCredits = Math.min(remainingCredits, safeCredits);
  const warnBufferCredits = Math.min(remainingCredits, warnCredits);

  const warnings: string[] = [];
  if (tooManyNetworks) {
    warnings.push(`Plan ${plan} : max ${maxNetworks} réseaux actifs simultanément. Désactive ${networks.length - maxNetworks} ou passe au plan Pro pour les 3.`);
  }
  if (creditsStatus === 'exceeded') {
    warnings.push(`Ce mix consomme ${creditsConsumed} crédits/mois mais ton plan ne couvre que ${planCredits}. Prends un pack ou passe au plan supérieur.`);
  } else if (creditsStatus === 'close') {
    warnings.push(`Mix proche de la limite (${creditsPct}% de ton quota mensuel) — un pack te donnerait du confort.`);
  }
  if (videoRatio > 80 && plan === 'createur') {
    warnings.push('Fort ratio vidéo : la cadence images devient nulle (revenir à 60-70% si tu veux garder du contenu image).');
  }

  // ─── Upsell trigger ───────────────────────────────────────
  // Founder rule 2026-06-09: "à partir de 80% video on propose un
  // upsell tu vois ? faut revoir le calcul des credits et couts".
  // Logique :
  //   - video_ratio >= 80 sur Créateur/Free → 'upgrade' (Pro débloque vidéo)
  //   - video_ratio >= 70 OU credits_pct >= 70 OU creditsStatus close
  //     → 'pack' (pack crédits suffit)
  //   - exceeded ou margin < 65 → 'upgrade' direct (gros dépassement)
  //   - sinon 'none'
  let upsellKind: 'pack' | 'upgrade' | 'none' = 'none';
  let upsellSuggested = false;
  const isLowPlan = plan === 'createur' || plan === 'free';
  if (creditsStatus === 'exceeded' || margin < 65) {
    upsellKind = isLowPlan ? 'upgrade' : 'pack';
    upsellSuggested = true;
  } else if (videoRatio >= 80 && isLowPlan) {
    upsellKind = 'upgrade';
    upsellSuggested = true;
  } else if (videoRatio >= 70 || creditsPct >= 70 || creditsStatus === 'close') {
    upsellKind = 'pack';
    upsellSuggested = true;
  } else if (tooManyNetworks) {
    upsellKind = 'upgrade';
    upsellSuggested = true;
  }

  return {
    plan,
    video_ratio: videoRatio,
    monthly_budget_eur: ceiling,
    fixed_costs_eur: +fixedCosts.toFixed(2),
    gen_budget_eur: +genBudget.toFixed(2),
    cadence: {
      ig_posts_per_week: igPostsPerWeek,
      ig_posts_per_day: igPostsPerDay,
      ig_reels_per_week: igReelsPerWeek,
      tt_videos_per_week: ttVideosPerWeek,
      tt_videos_per_day: ttVideosPerDay,
      tt_photos_per_day: cap.stories_tt,
      stories_per_day: storiesPerDay,
      linkedin_per_week: liPerWeek,
    },
    estimated_cost_per_month_eur: +estCost.toFixed(2),
    margin_pct: margin,
    credits_consumed_per_month: creditsConsumed,
    plan_credits_total: planCredits,
    credits_pct: creditsPct,
    credits_status: creditsStatus,
    safe_buffer_credits: safeBufferCredits,
    warn_buffer_credits: warnBufferCredits,
    remaining_credits: remainingCredits,
    upsell_suggested: upsellSuggested,
    upsell_kind: upsellKind,
    warnings,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const plan = (url.searchParams.get('plan') || 'createur').toLowerCase();
  const videoRatio = parseInt(url.searchParams.get('video_ratio') || '40', 10);
  const networksParam = url.searchParams.get('networks');
  const enabled_networks = networksParam
    ? networksParam.split(',').map(s => s.trim().toLowerCase()) as ('instagram' | 'tiktok' | 'linkedin')[]
    : undefined;

  if (!PLAN_COST_CEILING[plan]) {
    return NextResponse.json({ ok: false, error: 'plan inconnu' }, { status: 400 });
  }

  const result = computeCadence(plan, videoRatio, { enabled_networks });
  return NextResponse.json({ ok: true, ...result });
}
