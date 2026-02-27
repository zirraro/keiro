import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin, checkFreeGeneration, recordFreeGeneration, getClientIP } from '@/lib/credits/server';
import { generateKlingT2I } from '@/lib/kling';
import { optimizePromptForImage } from '@/lib/prompt-optimizer';

export const runtime = "nodejs";
export const maxDuration = 120;

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

// Instruction anti-texte ajoutée APRÈS l'optimisation (pas dans le prompt Claude)
const NO_TEXT_SUFFIX = '\n\nAbsolutely no text, letters, words, numbers, writing, signs, labels, watermarks, logos, captions, titles in the image. Pure visual only. Any signs or storefronts must show abstract shapes, not readable text.';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, size = '2K' } = body;

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

    // --- Étape 1: Optimiser le prompt avec Claude Haiku ---
    console.log('[T2I] Step 1: Optimizing prompt with Claude...', { rawLength: prompt.length });
    const visualPrompt = await optimizePromptForImage(prompt);
    const finalPrompt = visualPrompt + NO_TEXT_SUFFIX;
    console.log('[T2I] Optimized prompt:', finalPrompt.substring(0, 300));

    let imageUrl: string;
    let provider: 'k' | 's';

    // --- Étape 2: Seedream 4.5 en premier, fallback Kling ---
    const seedreamPrompt = finalPrompt.length > 2000 ? finalPrompt.substring(0, 2000) : finalPrompt;

    try {
      console.log('[T2I] Step 2: Generating with Seedream 4.5...', { promptLength: seedreamPrompt.length });
      const seedreamRes = await fetch(SEEDREAM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'seedream-4-5-251128',
          prompt: seedreamPrompt,
          negative_prompt: 'text, words, letters, numbers, writing, typography, signs, labels, captions, watermarks, logos, headlines, slogans, brand names, price tags, menus, screens with text, readable characters',
          response_format: 'url',
          watermark: false,
          size: size || '2K',
          seed: -1,
        }),
      });

      const seedreamData = await seedreamRes.json();
      console.log('[T2I] Seedream 4.5 response:', seedreamRes.status);

      if (!seedreamRes.ok) {
        console.error('[T2I] Seedream error:', JSON.stringify(seedreamData).substring(0, 500));
        throw new Error(seedreamData.error?.message || `Seedream HTTP ${seedreamRes.status}`);
      }

      // Seedream 4.5 avec response_format=url renvoie une URL, sinon b64_image
      const resultUrl = seedreamData.data?.[0]?.url;
      const resultB64 = seedreamData.data?.[0]?.b64_image;

      if (resultUrl) {
        imageUrl = resultUrl;
      } else if (resultB64) {
        imageUrl = `data:image/png;base64,${resultB64}`;
      } else {
        console.error('[T2I] Seedream no image:', JSON.stringify(seedreamData).substring(0, 500));
        throw new Error('Seedream returned no image');
      }

      provider = 's';
      console.log('[T2I] ✓ Seedream 4.5 OK');
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
