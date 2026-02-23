import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin, checkFreeGeneration, recordFreeGeneration, getClientIP } from '@/lib/credits/server';
import { generateKlingT2I } from '@/lib/kling';

export const runtime = "nodejs";
export const maxDuration = 120;

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

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

    let imageUrl: string;
    let provider: 'k' | 's';

    // --- Primary: Kling image-o1 ---
    try {
      console.log('[T2I] Trying Kling image-o1...');
      const result = await generateKlingT2I({ prompt });
      imageUrl = result.imageUrl;
      provider = 'k';
      console.log('[T2I] ✓ Kling image-o1 generated successfully');
    } catch (klingError: any) {
      console.warn('[T2I] Kling failed, falling back to Seedream:', klingError.message);

      // --- Fallback: Seedream ---
      const response = await fetch(SEEDREAM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SEEDREAM_API_KEY}`
        },
        body: JSON.stringify({
          model: 'seedream-4-0-250828',
          prompt: prompt,
          sequential_image_generation: 'disabled',
          response_format: 'url',
          size: size,
          stream: false,
          watermark: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[T2I] Seedream fallback also failed:', response.status, errorText);
        return Response.json({
          ok: false,
          error: 'Impossible de générer l\'image. Vérifiez votre connexion et réessayez.'
        }, { status: response.status });
      }

      const data = await response.json();
      if (!data.data || !data.data[0] || !data.data[0].url) {
        console.error('[T2I] Seedream invalid response:', data);
        return Response.json({
          ok: false,
          error: 'Erreur lors de la génération. Veuillez réessayer.'
        }, { status: 500 });
      }

      imageUrl = data.data[0].url;
      provider = 's';
      console.log('[T2I] ⚠ Seedream fallback used successfully');
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
