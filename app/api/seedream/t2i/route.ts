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

    // --- Seedream en premier, fallback Kling ---
    // Tronquer le prompt pour Seedream si trop long (limite ~2000 chars)
    const seedreamPrompt = prompt.length > 2000 ? prompt.substring(0, 2000) : prompt;

    try {
      console.log('[T2I] Generating with Seedream...', { promptLength: seedreamPrompt.length });
      const seedreamRes = await fetch(SEEDREAM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'seedream-3.0',
          prompt: seedreamPrompt,
          size: size || '2K',
          seed: -1,
        }),
      });

      const seedreamData = await seedreamRes.json();
      console.log('[T2I] Seedream response status:', seedreamRes.status, 'ok:', seedreamRes.ok, 'hasImage:', !!seedreamData.data?.[0]?.b64_image);

      if (!seedreamRes.ok) {
        console.error('[T2I] Seedream API error:', JSON.stringify(seedreamData).substring(0, 500));
        throw new Error(seedreamData.error?.message || `Seedream HTTP ${seedreamRes.status}`);
      }

      if (!seedreamData.data?.[0]?.b64_image) {
        console.error('[T2I] Seedream no image in response:', JSON.stringify(seedreamData).substring(0, 500));
        throw new Error('Seedream returned no image');
      }

      imageUrl = `data:image/png;base64,${seedreamData.data[0].b64_image}`;
      provider = 's';
      console.log('[T2I] ✓ Seedream generated successfully');
    } catch (seedreamError: any) {
      console.error('[T2I] Seedream failed, falling back to Kling:', seedreamError.message);

      // Fallback Kling T2I
      try {
        const result = await generateKlingT2I({ prompt });
        imageUrl = result.imageUrl;
        provider = 'k';
        console.log('[T2I] ✓ Kling fallback generated successfully');
      } catch (klingError: any) {
        console.error('[T2I] Kling fallback also failed:', klingError.message);
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
