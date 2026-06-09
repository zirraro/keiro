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
  warnings: string[];
}

function computeCadence(plan: string, videoRatio: number): CadenceOutput {
  const ceiling = PLAN_COST_CEILING[plan] ?? PLAN_COST_CEILING.free;
  const revenue = PLAN_REVENUE[plan] ?? 0;
  const cap = PLAN_DAILY_PUBLISH[plan] ?? PLAN_DAILY_PUBLISH.free;

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

  // Distribute videos: 80% TikTok + 20% IG (reel) — TT prioritaire car
  // c'est là que la vidéo paie le plus en reach.
  const ttVideosMonth = Math.round(videosPerMonth * 0.80);
  const igReelsMonth  = Math.max(0, videosPerMonth - ttVideosMonth);

  // Distribute images: 70% IG feed + 30% LinkedIn (si plan le permet)
  const liAllowed = (cap.li || 0) > 0;
  const igImagesMonth = liAllowed ? Math.round(imagesPerMonth * 0.70) : imagesPerMonth;
  const liImagesMonth = liAllowed ? imagesPerMonth - igImagesMonth : 0;

  // Apply plan caps (hard limits)
  const ttVideosPerWeek = Math.min(cap.tt_videos_per_week, Math.round(ttVideosMonth / 4.33));
  const igReelsPerWeek  = Math.min(cap.ig_reels_per_week, Math.round(igReelsMonth / 4.33));
  const igPostsPerWeek  = Math.min(cap.ig * 7, Math.round(igImagesMonth / 4.33));
  const liPerWeek       = Math.min((cap.li || 0) * 7, Math.round(liImagesMonth / 4.33));

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

  const warnings: string[] = [];
  if (estCost > ceiling) {
    warnings.push(`Coût estimé ${estCost.toFixed(2)}€ dépasse le plafond ${ceiling}€ — quotas auto-cappés au plan.`);
  }
  if (videoRatio > 80 && plan === 'createur') {
    warnings.push('Très fort ratio vidéo sur Créateur — la cadence images sera quasi-nulle.');
  }
  if (margin < 70) {
    warnings.push(`Marge ${margin}% sous le seuil 70% — affiner le mix.`);
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
    warnings,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const plan = (url.searchParams.get('plan') || 'createur').toLowerCase();
  const videoRatio = parseInt(url.searchParams.get('video_ratio') || '40', 10);

  if (!PLAN_COST_CEILING[plan]) {
    return NextResponse.json({ ok: false, error: 'plan inconnu' }, { status: 400 });
  }

  const result = computeCadence(plan, videoRatio);
  return NextResponse.json({ ok: true, ...result });
}
