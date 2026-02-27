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

    // --- SeedEdit 3.0 I2I dédié en premier, Kling omni-image en fallback ---
    const seedreamPrompt = finalPrompt.length > 2000 ? finalPrompt.substring(0, 2000) : finalPrompt;
    try {
      console.log('[I2I] Generating with SeedEdit 3.0 I2I...');
      // Utiliser le base64 pour SeedEdit (les serveurs BytePlus n'accèdent pas toujours aux URLs externes)
      const imageForSeedEdit = imageBase64.startsWith('data:')
        ? imageBase64
        : sourceImage.startsWith('http') || sourceImage.startsWith('data:')
          ? sourceImage
          : `data:image/jpeg;base64,${sourceImage}`;
      console.log('[I2I] Image format for SeedEdit:', imageForSeedEdit.substring(0, 50) + '...');

      const seedreamBody: any = {
        model: 'seededit-3-0-i2i-250628',
        prompt: `${editPrefix}${seedreamPrompt}`,
        response_format: 'url',
        watermark: false,
        size: size || 'adaptive',
        seed: seed || -1,
        guidance_scale: guidance_scale || 5.5,
        image: imageForSeedEdit,
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

      if (!seedreamRes.ok) {
        console.error('[I2I] SeedEdit error:', JSON.stringify(seedreamData).substring(0, 500));
        throw new Error(seedreamData.error?.message || `SeedEdit HTTP ${seedreamRes.status}`);
      }

      // SeedEdit avec response_format=url renvoie une URL, sinon b64_image
      const resultUrl = seedreamData.data?.[0]?.url;
      const resultB64 = seedreamData.data?.[0]?.b64_image;

      if (resultUrl) {
        resultImageUrl = resultUrl;
      } else if (resultB64) {
        resultImageUrl = `data:image/png;base64,${resultB64}`;
      } else {
        throw new Error('Seedream returned no image');
      }

      provider = 's';
      console.log('[I2I] ✓ SeedEdit 3.0 generated successfully');
    } catch (seedreamError: any) {
      console.error('[I2I] SeedEdit failed, falling back to Kling. Error:', seedreamError.message);

      // Fallback Kling omni-image
      try {
        console.log('[I2I] Generating with Kling omni-image (fallback)...');
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
