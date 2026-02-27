import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { createI2VTask, checkI2VTask } from '@/lib/kling';

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max pour le polling

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_VIDEO_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

/**
 * POST /api/seedream/i2v
 * Convertir une image en vidéo — Seedance 1.5 Pro primary, Kling fallback
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageUrl, prompt = '', duration = 5, taskId } = body;

    // Si taskId est fourni, on vérifie le statut
    if (taskId) {
      if (typeof taskId === 'string' && taskId.startsWith('seedream_')) {
        return checkSeedreamTaskStatus(taskId.replace('seedream_', ''));
      }
      try {
        const result = await checkI2VTask(taskId);

        if (result.status === 'completed') {
          if (result.videoUrl) {
            return Response.json({ ok: true, status: 'completed', videoUrl: result.videoUrl, _p: 'k' });
          }
          return Response.json({
            ok: true,
            status: 'completed',
            error: result.error || 'Video completed but URL not found',
          });
        }

        if (result.status === 'failed') {
          return Response.json({ ok: false, status: 'failed', error: result.error });
        }

        return Response.json({ ok: true, status: result.status || 'processing', _p: 'k' });
      } catch (error: any) {
        console.error('[I2V] Kling status check error:', error);
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
    }

    // --- Vérification crédits ---
    const { user } = await getAuthUser();
    if (!user) {
      return Response.json({
        ok: false,
        blocked: true,
        reason: 'requires_account',
        cta: true,
      }, { status: 403 });
    }

    const isAdminUser = await isAdmin(user.id);
    if (!isAdminUser) {
      const check = await checkCredits(user.id, 'video_i2v', duration);
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

    if (!imageUrl || typeof imageUrl !== 'string') {
      return Response.json({ ok: false, error: 'Image URL is required' }, { status: 400 });
    }

    // Préparer l'URL de l'image — Seedance accepte URL ou data URI
    let imageForSeedance = imageUrl;

    let resultTaskId: string;
    let provider: 'k' | 's';

    // --- Primary: Seedance 1.5 Pro ---
    try {
      console.log('[I2V] Trying Seedance 1.5 Pro...');

      const textPrompt = prompt && prompt.trim()
        ? `${prompt} --duration ${duration} --camerafixed false`
        : `Animate this image with smooth cinematic camera movement --duration ${duration} --camerafixed false`;

      const content: any[] = [
        { type: 'text', text: textPrompt },
        { type: 'image_url', image_url: { url: imageForSeedance } }
      ];

      const response = await fetch(SEEDREAM_VIDEO_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SEEDREAM_API_KEY}`
        },
        body: JSON.stringify({
          model: 'seedance-1-5-pro-251215',
          content: content
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[I2V] Seedance failed:', response.status, errorText);
        throw new Error(`Seedance HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      const seedreamId = data.id || data.task_id || data.data?.id || data.data?.task_id;
      if (!seedreamId) {
        console.error('[I2V] Seedance no task ID:', data);
        throw new Error('Seedance returned no task ID');
      }

      resultTaskId = `seedream_${seedreamId}`;
      provider = 's';
      console.log('[I2V] ✓ Seedance 1.5 Pro task created:', seedreamId);
    } catch (seedanceError: any) {
      console.warn('[I2V] Seedance failed, falling back to Kling:', seedanceError.message);

      // Convertir en base64 pour Kling
      let imageBase64 = imageUrl;
      if (imageUrl.startsWith('http')) {
        try {
          const imageResponse = await fetch(imageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          if (imageResponse.ok) {
            const imageBuffer = await imageResponse.arrayBuffer();
            const base64 = Buffer.from(imageBuffer).toString('base64');
            const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
            imageBase64 = `data:${contentType};base64,${base64}`;
          }
        } catch (e: any) {
          console.warn('[I2V] Base64 conversion failed:', e.message);
        }
      }

      // --- Fallback: Kling ---
      try {
        const klingTaskId = await createI2VTask({
          image: imageBase64,
          prompt: prompt || 'Animate this image with smooth cinematic camera movement',
          duration: String(duration),
        });
        resultTaskId = klingTaskId;
        provider = 'k';
        console.log('[I2V] ✓ Kling fallback task created:', klingTaskId);
      } catch (klingError: any) {
        console.error('[I2V] Kling also failed:', klingError.message);
        return Response.json({ ok: false, error: 'Impossible de générer la vidéo' }, { status: 500 });
      }
    }

    // --- Déduction crédits après création de tâche ---
    let newBalance: number | undefined;
    if (user && !isAdminUser) {
      const result = await deductCredits(user.id, 'video_i2v', `Vidéo I2V ${duration}s`, duration);
      newBalance = result.newBalance;
    }

    return Response.json({
      ok: true,
      taskId: resultTaskId,
      status: 'pending',
      newBalance,
      _p: provider,
    });

  } catch (error: any) {
    console.error('[I2V] Error:', error);
    return Response.json({ ok: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// --- Seedream video task status check ---
async function checkSeedreamTaskStatus(taskId: string): Promise<Response> {
  try {
    const response = await fetch(`${SEEDREAM_VIDEO_API_URL}/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${SEEDREAM_API_KEY}` }
    });

    if (!response.ok) {
      return Response.json({ ok: false, error: `Seedream status error: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const status = data.status || data.data?.status || data.state || data.data?.state;

    if (status === 'succeeded' || status === 'completed' || status === 'success' || status === 'done') {
      let videoUrl = null;
      if (data.content && typeof data.content === 'object' && !Array.isArray(data.content)) {
        videoUrl = data.content.video_url;
      }
      if (!videoUrl && data.content && Array.isArray(data.content)) {
        for (const item of data.content) {
          if (item.type === 'video_url' && item.video_url?.url) { videoUrl = item.video_url.url; break; }
          if (item.type === 'video' && item.url) { videoUrl = item.url; break; }
          if (item.video_url) { videoUrl = typeof item.video_url === 'string' ? item.video_url : item.video_url.url; break; }
        }
      }
      if (!videoUrl) videoUrl = data.output?.video_url || data.output?.url || data.result?.video_url || data.result?.url || data.video_url || data.url || data.data?.video_url;

      if (videoUrl) {
        return Response.json({ ok: true, status: 'completed', videoUrl, _p: 's' });
      }
      return Response.json({ ok: true, status: 'completed', error: 'Video completed but URL not found' });
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      return Response.json({ ok: false, status: 'failed', error: data.error || 'Video generation failed' });
    }

    return Response.json({ ok: true, status: status || 'processing', _p: 's' });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
