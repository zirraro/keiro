import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin, checkFreeGeneration, recordFreeGeneration, getClientIP } from '@/lib/credits/server';

export const runtime = "nodejs";

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, image, imageUrl, size = 'adaptive', seed, guidance_scale = 5.5 } = body;

    // Accepter soit 'image' soit 'imageUrl' pour compatibilité
    const sourceImage = image || imageUrl;

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

    console.log('[Seedream I2I] Editing image with prompt:', prompt.substring(0, 100) + '...');
    console.log('[Seedream I2I] Source image:', sourceImage.substring(0, 100) + '...');

    // Appeler l'API Seedream 3.0 i2i
    const requestBody: any = {
      model: 'seededit-3-0-i2i-250628',
      prompt: prompt,
      image: sourceImage,
      response_format: 'url',
      guidance_scale: guidance_scale,
      watermark: false // Pas de watermark
    };

    // N'ajouter size que si ce n'est pas 'adaptive' (non supporté par l'API)
    if (size && size !== 'adaptive') {
      requestBody.size = size;
    }

    // Ajouter seed si fourni
    if (seed !== undefined) {
      requestBody.seed = seed;
    }

    const response = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Seedream I2I] API Error:', response.status, errorText);
      return Response.json({
        ok: false,
        error: 'Impossible d\'éditer l\'image. Vérifiez votre connexion et réessayez.'
      }, { status: response.status });
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].url) {
      console.error('[Seedream I2I] Invalid response:', data);
      return Response.json({
        ok: false,
        error: 'Erreur lors de l\'édition. Veuillez réessayer.'
      }, { status: 500 });
    }

    console.log('[Seedream I2I] Image edited successfully:', data.data[0].url);

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
      imageUrl: data.data[0].url,
      size: data.data[0].size,
      usage: data.usage,
      watermark: useWatermark,
      newBalance,
    });

  } catch (error: any) {
    console.error('[Seedream I2I] Error:', error);
    return Response.json({
      ok: false,
      error: 'Une erreur s\'est produite. Veuillez réessayer.'
    }, { status: 500 });
  }
}
