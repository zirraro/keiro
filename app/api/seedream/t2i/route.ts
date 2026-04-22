import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin, checkFreeGeneration, recordFreeGeneration, getClientIP } from '@/lib/credits/server';
import { generateKlingT2I } from '@/lib/kling';
import { optimizePromptForImage, fetchNewsContext, analyzeTrendForVisuals } from '@/lib/prompt-optimizer';
import { generateJadeImage } from '@/lib/visuals/jade-prompter';
import { checkImageQuota, logQuotaUsage } from '@/lib/credits/quotas';
import { isMarginSafe } from '@/lib/credits/margin';

export const runtime = 'nodejs';
export const maxDuration = 120;

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

// Instruction anti-texte ajoutée APRÈS l'optimisation (pas dans le prompt Claude)
const NO_TEXT_SUFFIX = '\n\nAbsolutely no text, letters, words, numbers, writing, signs, labels, watermarks, logos, captions, titles in the image. Pure visual only. Any signs or storefronts must show abstract shapes, not readable text.';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, size = '2K', newsUrl, newsTitle, newsDescription, businessType, businessDescription } = body;

    if (!prompt || typeof prompt !== 'string') {
      return Response.json({
        ok: false,
        error: 'Prompt is required and must be a string'
      }, { status: 400 });
    }

    // --- Vérification crédits ---
    const { user } = await getAuthUser();
    let isAdminUser = false;
    let isFreeMode = false;
    let useWatermark = false;

    if (user) {
      isAdminUser = await isAdmin(user.id);
      if (!isAdminUser) {
        const check = await checkCredits(user.id, 'image_t2i');
        if (!check.allowed) {
          return Response.json({
            ok: false,
            error: 'Crédits insuffisants',
            insufficientCredits: true,
            cost: check.cost,
            balance: check.balance,
          }, { status: 402 });
        }
        // Hard monthly quota on top of credits — protects margin against
        // power users who'd otherwise spend all their credits on the
        // costliest operation type.
        const imgQ = await checkImageQuota(user.id);
        if (!imgQ.allowed) {
          return Response.json({
            ok: false,
            error: imgQ.message,
            quotaExceeded: true,
            reason: imgQ.reason,
            limit: imgQ.limit,
            plan: imgQ.plan,
          }, { status: 429 });
        }
        // Margin circuit-breaker — blocks at <60% GM even if quota ok
        const margin = await isMarginSafe(user.id);
        if (!margin.safe) {
          return Response.json({
            ok: false,
            error: margin.message,
            marginBlocked: true,
            plan: margin.snapshot.plan,
            margin_pct: margin.snapshot.margin_pct,
          }, { status: 429 });
        }
      }
    } else {
      isFreeMode = true;
      useWatermark = true;
      const ip = getClientIP(request);
      const freeCheck = await checkFreeGeneration(ip, 'image');
      if (!freeCheck.allowed) {
        return Response.json({
          ok: false,
          blocked: true,
          reason: freeCheck.reason,
          used: freeCheck.used,
          limit: freeCheck.limit,
          cta: true,
        }, { status: 403 });
      }
    }

    // --- Étape 1: Deep trend analysis + optimize prompt ---
    // We first weave in trend / news context via the legacy optimizer
    // (still valuable because it pulls the article body), THEN we hand
    // the enriched brief to Jade's shared prompter so the Seedream call
    // goes through the same elite system used by the content agent
    // (brand identity, quality rules, thumbnail readability, etc.)
    let trendAnalysis = '';
    if (newsUrl && newsTitle && businessType) {
      console.log('[T2I] Step 0: Deep trend analysis for', newsTitle);
      const articleContent = await fetchNewsContext(newsUrl, newsTitle);
      trendAnalysis = await analyzeTrendForVisuals(newsTitle, newsDescription || '', articleContent, businessType, businessDescription);
    }

    console.log('[T2I] Step 1: Weaving trend context into brief...', { rawLength: prompt.length, hasTrendAnalysis: !!trendAnalysis });
    const enrichedBrief = await optimizePromptForImage(prompt, trendAnalysis);
    const finalPrompt = enrichedBrief + NO_TEXT_SUFFIX;
    console.log('[T2I] Enriched brief:', finalPrompt.substring(0, 300));

    let imageUrl: string;
    let provider: 'k' | 's';

    // --- Étape 2: Seedream 4.5 en premier, fallback Kling ---
    const seedreamPrompt = finalPrompt.length > 2000 ? finalPrompt.substring(0, 2000) : finalPrompt;

    try {
      // Run the brief through Jade's shared prompter — this is the same
      // elite Seedream pipeline used by the content agent (brand identity
      // rules, thumbnail readability, negative prompt, watermark=false,
      // permanent Supabase caching). Users hitting /generate or /studio
      // now get the same quality as Jade's daily posts.
      console.log('[T2I] Step 2: Generating via Jade shared prompter…');
      const format = (size || '2K').toLowerCase().includes('9:16') ? 'story' : 'post';
      const jadeUrl = await generateJadeImage(seedreamPrompt, format, user?.id);
      if (!jadeUrl) {
        throw new Error('Jade prompter returned no image');
      }
      imageUrl = jadeUrl;
      provider = 's';
      console.log('[T2I] ✓ Jade prompter / Seedream 4.5 OK');
    } catch (seedreamError: any) {
      console.error('[T2I] Seedream failed:', seedreamError.message, '→ trying Kling');

      try {
        const result = await generateKlingT2I({ prompt: finalPrompt });
        imageUrl = result.imageUrl;
        provider = 'k';
        console.log('[T2I] ✓ Kling fallback OK');
      } catch (klingError: any) {
        console.error('[T2I] Kling also failed:', klingError.message);
        return Response.json({
          ok: false,
          error: `Erreur de génération: ${seedreamError.message}`
        }, { status: 500 });
      }
    }

    // --- Déduction crédits après succès ---
    let newBalance: number | undefined;
    if (user && !isAdminUser) {
      const result = await deductCredits(user.id, 'image_t2i', 'Génération image T2I');
      newBalance = result.newBalance;
      // Register against the monthly image quota (fire-and-forget)
      logQuotaUsage(user.id, 'image_generated', { provider }).catch(() => {});
    } else if (isFreeMode) {
      const ip = getClientIP(request);
      const fingerprint = request.headers.get('x-fingerprint');
      await recordFreeGeneration(ip, fingerprint, 'image');
    }

    return Response.json({
      ok: true,
      imageUrl,
      watermark: useWatermark,
      newBalance,
      _p: provider,
    });

  } catch (error: any) {
    console.error('[T2I] Error:', error);
    return Response.json({
      ok: false,
      error: 'Une erreur s\'est produite. Veuillez réessayer.'
    }, { status: 500 });
  }
}
