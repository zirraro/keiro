import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin, checkFreeGeneration, recordFreeGeneration, getClientIP } from '@/lib/credits/server';
import { generateKlingI2I } from '@/lib/kling';

export const runtime = "nodejs";
export const maxDuration = 120;

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, image, imageUrl: imageUrlParam, size = 'adaptive', seed, guidance_scale = 5.5 } = body;

    // Accepter soit 'image' soit 'imageUrl' pour compatibilité
    const sourceImage = image || imageUrlParam;

    if (!prompt || typeof prompt !== 'string') {
      return Response.json({
        ok: false,
        error: 'Prompt is required and must be a string'
      }, { status: 400 });
    }

    if (!sourceImage || typeof sourceImage !== 'string') {
      return Response.json({
        ok: false,
        error: 'Image URL is required and must be a string'
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
        const check = await checkCredits(user.id, 'image_i2i');
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

    // Convertir l'image en base64 si c'est une URL
    let imageBase64 = sourceImage;
    if (sourceImage.startsWith('http')) {
      try {
        const imgRes = await fetch(sourceImage, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          const b64 = Buffer.from(buf).toString('base64');
          const ct = imgRes.headers.get('content-type') || 'image/jpeg';
          imageBase64 = `data:${ct};base64,${b64}`;
        }
      } catch (e: any) {
        console.warn('[I2I] Failed to convert image to base64:', e.message);
      }
    }

    let resultImageUrl: string;
    let provider: 'k' | 's';

    // --- Pour I2I, utiliser le prompt d'édition DIRECTEMENT ---
    // Ne PAS passer par l'optimizer qui réécrit tout en nouvelle scène.
    // L'image elle-même fournit le contexte, le prompt décrit juste la modification souhaitée.
    const noTextSuffix = '. No text, letters, words, numbers, writing in the result.';
    const finalPrompt = prompt.trim() + noTextSuffix;
    console.log('[I2I] Edit prompt (direct):', finalPrompt.substring(0, 200));

    // --- Kling omni-image en premier (kling-image-o1), Seedream en fallback ---
    try {
      console.log('[I2I] Generating with Kling omni-image (kling-image-o1)...');
      const result = await generateKlingI2I({ prompt: finalPrompt, image: imageBase64 });
      resultImageUrl = result.imageUrl;
      provider = 'k';
      console.log('[I2I] ✓ Kling generated successfully');
    } catch (klingError: any) {
      console.error('[I2I] Kling failed, falling back to Seedream:', klingError.message);

      // Fallback Seedream
      const seedreamPrompt = finalPrompt.length > 2000 ? finalPrompt.substring(0, 2000) : finalPrompt;
      try {
        const seedreamBody: any = {
          model: 'seedream-3.0',
          prompt: seedreamPrompt,
          size: size || 'adaptive',
          seed: seed || -1,
          guidance_scale: guidance_scale || 5.5,
          image_url: sourceImage.startsWith('http') || sourceImage.startsWith('data:')
            ? sourceImage
            : `data:image/jpeg;base64,${sourceImage}`,
        };

        const seedreamRes = await fetch(SEEDREAM_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
          },
          body: JSON.stringify(seedreamBody),
        });

        const seedreamData = await seedreamRes.json();
        if (!seedreamRes.ok || !seedreamData.data?.[0]?.b64_image) {
          throw new Error(seedreamData.error?.message || 'Seedream returned no image');
        }

        resultImageUrl = `data:image/png;base64,${seedreamData.data[0].b64_image}`;
        provider = 's';
        console.log('[I2I] ✓ Seedream fallback generated successfully');
      } catch (seedreamError: any) {
        console.error('[I2I] Seedream fallback also failed:', seedreamError.message);
        return Response.json({
          ok: false,
          error: `Erreur d'édition: ${klingError.message}`
        }, { status: 500 });
      }
    }

    // --- Déduction crédits après succès ---
    let newBalance: number | undefined;
    if (user && !isAdminUser) {
      const result = await deductCredits(user.id, 'image_i2i', 'Modification image I2I');
      newBalance = result.newBalance;
    } else if (isFreeMode) {
      const ip = getClientIP(request);
      const fingerprint = request.headers.get('x-fingerprint');
      await recordFreeGeneration(ip, fingerprint, 'image');
    }

    return Response.json({
      ok: true,
      imageUrl: resultImageUrl,
      watermark: useWatermark,
      newBalance,
      _p: provider,
    });

  } catch (error: any) {
    console.error('[I2I] Error:', error);
    return Response.json({
      ok: false,
      error: 'Une erreur s\'est produite. Veuillez réessayer.'
    }, { status: 500 });
  }
}
