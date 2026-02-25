import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin, checkFreeGeneration, recordFreeGeneration, getClientIP } from '@/lib/credits/server';
import { generateKlingI2I } from '@/lib/kling';
import { optimizePromptForImage } from '@/lib/prompt-optimizer';

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

    // --- Optimiser le prompt avec Claude Haiku ---
    console.log('[I2I] Optimizing prompt...', { rawLength: prompt.length });
    const visualPrompt = await optimizePromptForImage(prompt);
    const noTextSuffix = '\n\nAbsolutely no text, letters, words, numbers, writing, signs, labels, watermarks in the image. Pure visual only.';
    const finalPrompt = visualPrompt + noTextSuffix;
    console.log('[I2I] Optimized:', finalPrompt.substring(0, 200));

    // --- Seedream en premier, fallback Kling ---
    const seedreamPrompt = finalPrompt.length > 2000 ? finalPrompt.substring(0, 2000) : finalPrompt;

    try {
      console.log('[I2I] Generating with Seedream...', { promptLength: seedreamPrompt.length });
      const seedreamBody: any = {
        model: 'seedream-3.0',
        prompt: seedreamPrompt,
        size: size || 'adaptive',
        seed: seed || -1,
        guidance_scale: guidance_scale || 5.5,
        image_strength: 0.65,
      };

      // Seedream accepte image_url pour I2I
      if (sourceImage.startsWith('http')) {
        seedreamBody.image_url = sourceImage;
      } else if (sourceImage.startsWith('data:')) {
        seedreamBody.image_url = sourceImage;
      } else {
        seedreamBody.image_url = `data:image/jpeg;base64,${sourceImage}`;
      }

      const seedreamRes = await fetch(SEEDREAM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
        },
        body: JSON.stringify(seedreamBody),
      });

      const seedreamData = await seedreamRes.json();
      console.log('[I2I] Seedream response status:', seedreamRes.status, 'ok:', seedreamRes.ok, 'hasImage:', !!seedreamData.data?.[0]?.b64_image);

      if (!seedreamRes.ok) {
        console.error('[I2I] Seedream API error:', JSON.stringify(seedreamData).substring(0, 500));
        throw new Error(seedreamData.error?.message || `Seedream HTTP ${seedreamRes.status}`);
      }

      if (!seedreamData.data?.[0]?.b64_image) {
        console.error('[I2I] Seedream no image:', JSON.stringify(seedreamData).substring(0, 500));
        throw new Error('Seedream returned no image');
      }

      resultImageUrl = `data:image/png;base64,${seedreamData.data[0].b64_image}`;
      provider = 's';
      console.log('[I2I] ✓ Seedream generated successfully');
    } catch (seedreamError: any) {
      console.error('[I2I] Seedream failed, falling back to Kling:', seedreamError.message);

      // Fallback Kling I2I
      try {
        const result = await generateKlingI2I({ prompt: finalPrompt, image: imageBase64 });
        resultImageUrl = result.imageUrl;
        provider = 'k';
        console.log('[I2I] ✓ Kling fallback generated successfully');
      } catch (klingError: any) {
        console.error('[I2I] Kling fallback also failed:', klingError.message);
        return Response.json({
          ok: false,
          error: `Erreur d'édition: ${seedreamError.message}`
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
