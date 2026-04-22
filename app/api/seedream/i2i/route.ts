import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin, checkFreeGeneration, recordFreeGeneration, getClientIP } from '@/lib/credits/server';
import { generateKlingI2I } from '@/lib/kling';
import { generateJadeImageFromReference } from '@/lib/visuals/jade-prompter';
import { checkImageQuota, logQuotaUsage } from '@/lib/credits/quotas';

export const runtime = 'nodejs';
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

    let resultImageUrl: string = '';
    let provider: 'k' | 's' = 's';

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

    // --- Seedream 4.5 I2I (même endpoint que T2I + param image), Kling en fallback ---
    const seedreamPrompt = finalPrompt.length > 2000 ? finalPrompt.substring(0, 2000) : finalPrompt;

    // Préférer base64 (BytePlus ne peut pas toujours télécharger les URLs externes)
    const imageForSeedream = imageBase64.startsWith('data:') ? imageBase64 : sourceImage;

    // Helper pour tenter un appel Seedream 4.5
    const trySeedream = async (img: string, label: string): Promise<string | null> => {
      const body: any = {
        model: 'seedream-4-5-251128',
        prompt: `${editPrefix}${seedreamPrompt}`,
        image: img,
        response_format: 'url',
        watermark: false,
        size: '2K',
        seed: -1,
      };

      console.log(`[I2I] ${label} — model: ${body.model}, size: ${body.size}, image: ${img.substring(0, 50)}...`);

      // Timeout 90s pour éviter le 504 Vercel
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      const res = await fetch(SEEDREAM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json();
      console.log(`[I2I] ${label} — status: ${res.status}`);

      if (!res.ok) {
        const errMsg = data.error?.message || JSON.stringify(data.error || data).substring(0, 300);
        console.error(`[I2I] ${label} ERROR:`, errMsg);
        throw new Error(errMsg);
      }

      const url = data.data?.[0]?.url;
      const b64 = data.data?.[0]?.b64_image;
      if (url) return url;
      if (b64) return `data:image/png;base64,${b64}`;
      console.error(`[I2I] ${label} — no image in response:`, JSON.stringify(data).substring(0, 300));
      throw new Error('Seedream returned no image');
    };

    // Attempt 0: Jade-grade i2i (the same elite prompt pipeline used by
    // the content agent). This gives /generate + /studio uploads the
    // editorial lift Jade applies to her own daily posts. On failure we
    // fall back to the existing robust retry chain below.
    try {
      const jadeStrength = strength <= 5 ? 0.25 : strength <= 7 ? 0.45 : 0.7;
      const jadeFormat = (size || '2K').toLowerCase().includes('9:16') ? 'story' : 'post';
      const jadeUrl = await generateJadeImageFromReference(sourceImage, finalPrompt, jadeFormat, jadeStrength);
      if (jadeUrl) {
        resultImageUrl = jadeUrl;
        provider = 's';
        console.log('[I2I] ✓ Jade prompter i2i OK');
        // resultImageUrl is set → the guard on the retry chain below
        // short-circuits so we skip straight to credit deduction.
      }
    } catch (jadeErr: any) {
      console.warn('[I2I] Jade prompter path failed, falling back:', jadeErr?.message?.substring?.(0, 200));
    }

    // Tentative 1: base64 (fiable, pas de dépendance réseau)
    // Tentative 2: URL originale (si base64 a échoué)
    // Tentative 3: Kling fallback
    try {
      if (!resultImageUrl) {
        resultImageUrl = await trySeedream(imageForSeedream, 'Attempt 1 (base64)') as string;
        provider = 's';
        console.log('[I2I] ✓ Seedream 4.5 OK');
      }
    } catch (err1: any) {
      console.error('[I2I] Attempt 1 failed:', err1.message);

      // Tentative 2 : URL si la tentative 1 était en base64
      if (imageForSeedream.startsWith('data:') && sourceImage.startsWith('http')) {
        try {
          resultImageUrl = await trySeedream(sourceImage, 'Attempt 2 (URL)') as string;
          provider = 's';
          console.log('[I2I] ✓ Seedream 4.5 OK (URL fallback)');
        } catch (err2: any) {
          console.error('[I2I] Attempt 2 failed:', err2.message, '→ Kling');
          try {
            const result = await generateKlingI2I({ prompt: finalPrompt, image: imageBase64 });
            resultImageUrl = result.imageUrl;
            provider = 'k';
            console.log('[I2I] ✓ Kling fallback OK');
          } catch (klingErr: any) {
            return Response.json({ ok: false, error: `Seedream: ${err2.message}` }, { status: 500 });
          }
        }
      } else {
        // Kling fallback directement
        try {
          console.log('[I2I] → Kling fallback...');
          const result = await generateKlingI2I({ prompt: finalPrompt, image: imageBase64 });
          resultImageUrl = result.imageUrl;
          provider = 'k';
          console.log('[I2I] ✓ Kling fallback OK');
        } catch (klingErr: any) {
          return Response.json({ ok: false, error: `Seedream: ${err1.message}` }, { status: 500 });
        }
      }
    }

    // --- Déduction crédits après succès ---
    let newBalance: number | undefined;
    if (user && !isAdminUser) {
      const result = await deductCredits(user.id, 'image_i2i', 'Modification image I2I');
      newBalance = result.newBalance;
      logQuotaUsage(user.id, 'image_generated', { mode: 'i2i' }).catch(() => {});
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
