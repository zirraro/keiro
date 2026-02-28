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

    // --- Pour I2I, adapter le prompt selon la force de modification ---
    const finalPrompt = prompt.trim();
    const strength = guidance_scale || 5.5;

    // Prompt adaptatif : plus la force est basse, plus on insiste sur la préservation
    let editPrefix: string;
    if (strength <= 5) {
      editPrefix = `Make a SUBTLE edit to this image. Keep EVERYTHING exactly the same — same composition, same subject, same background, same colors, same lighting. Only make this small adjustment: `;
    } else if (strength <= 7) {
      editPrefix = `EDIT this image. Keep the same overall composition and main subject. Apply this modification: `;
    } else {
      editPrefix = `CREATIVELY TRANSFORM this image while keeping the main subject recognizable. Apply this significant change: `;
    }

    console.log('[I2I] Edit prompt (strength:', strength, '):', finalPrompt);

    // --- Seedream 4.5 I2I (même modèle que T2I + param image), Kling en fallback ---
    const seedreamPrompt = finalPrompt.length > 2000 ? finalPrompt.substring(0, 2000) : finalPrompt;

    // Image source : URL d'origine si disponible, sinon base64
    const imageForSeedream = sourceImage.startsWith('http') ? sourceImage : imageBase64;

    try {
      console.log('[I2I] Generating with Seedream 4.5 I2I...', { imageFormat: imageForSeedream.substring(0, 60) });

      const seedreamBody: any = {
        model: 'seedream-4-5-251128',
        prompt: `${editPrefix}${seedreamPrompt}`,
        image: imageForSeedream,
        response_format: 'url',
        watermark: false,
        size: size || 'adaptive',
        seed: seed || -1,
      };

      console.log('[I2I] Request body (sans image):', JSON.stringify({ ...seedreamBody, image: seedreamBody.image.substring(0, 60) + '...' }));

      const seedreamRes = await fetch(SEEDREAM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
        },
        body: JSON.stringify(seedreamBody),
      });

      const seedreamData = await seedreamRes.json();
      console.log('[I2I] Seedream 4.5 response status:', seedreamRes.status);

      if (!seedreamRes.ok) {
        console.error('[I2I] Seedream 4.5 error:', JSON.stringify(seedreamData).substring(0, 500));
        throw new Error(seedreamData.error?.message || `Seedream HTTP ${seedreamRes.status}`);
      }

      const resultUrl = seedreamData.data?.[0]?.url;
      const resultB64 = seedreamData.data?.[0]?.b64_image;

      if (resultUrl) {
        resultImageUrl = resultUrl;
      } else if (resultB64) {
        resultImageUrl = `data:image/png;base64,${resultB64}`;
      } else {
        console.error('[I2I] Seedream no image in response:', JSON.stringify(seedreamData).substring(0, 500));
        throw new Error('Seedream returned no image');
      }

      provider = 's';
      console.log('[I2I] ✓ Seedream 4.5 I2I generated successfully');
    } catch (seedreamError: any) {
      console.error('[I2I] Seedream 4.5 failed:', seedreamError.message);

      // Retry avec base64 si on avait envoyé une URL
      if (imageForSeedream.startsWith('http') && imageBase64.startsWith('data:')) {
        try {
          console.log('[I2I] Retrying Seedream 4.5 with base64 image...');
          const retryBody: any = {
            model: 'seedream-4-5-251128',
            prompt: `${editPrefix}${seedreamPrompt}`,
            image: imageBase64,
            response_format: 'url',
            watermark: false,
            size: size || 'adaptive',
            seed: seed || -1,
          };

          const retryRes = await fetch(SEEDREAM_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
            },
            body: JSON.stringify(retryBody),
          });

          const retryData = await retryRes.json();
          console.log('[I2I] Seedream 4.5 retry status:', retryRes.status);

          if (retryRes.ok) {
            const retryUrl = retryData.data?.[0]?.url;
            const retryB64 = retryData.data?.[0]?.b64_image;
            if (retryUrl) {
              resultImageUrl = retryUrl;
              provider = 's';
              console.log('[I2I] ✓ Seedream 4.5 I2I retry with base64 OK');
            } else if (retryB64) {
              resultImageUrl = `data:image/png;base64,${retryB64}`;
              provider = 's';
              console.log('[I2I] ✓ Seedream 4.5 I2I retry with base64 OK (b64)');
            } else {
              throw new Error('Seedream retry returned no image');
            }
          } else {
            console.error('[I2I] Seedream retry error:', JSON.stringify(retryData).substring(0, 500));
            throw new Error(retryData.error?.message || `Seedream retry HTTP ${retryRes.status}`);
          }
        } catch (retryError: any) {
          console.error('[I2I] Seedream 4.5 retry also failed:', retryError.message, '→ Kling fallback');
          // Fallback Kling
          try {
            const result = await generateKlingI2I({ prompt: finalPrompt, image: imageBase64 });
            resultImageUrl = result.imageUrl;
            provider = 'k';
            console.log('[I2I] ✓ Kling fallback OK');
          } catch (klingError: any) {
            console.error('[I2I] Kling also failed:', klingError.message);
            return Response.json({ ok: false, error: `Erreur d'édition: ${retryError.message}` }, { status: 500 });
          }
        }
      } else {
        // Fallback Kling directement
        try {
          console.log('[I2I] Falling back to Kling...');
          const result = await generateKlingI2I({ prompt: finalPrompt, image: imageBase64 });
          resultImageUrl = result.imageUrl;
          provider = 'k';
          console.log('[I2I] ✓ Kling fallback OK');
        } catch (klingError: any) {
          console.error('[I2I] Kling also failed:', klingError.message);
          return Response.json({ ok: false, error: `Erreur d'édition: ${seedreamError.message}` }, { status: 500 });
        }
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
