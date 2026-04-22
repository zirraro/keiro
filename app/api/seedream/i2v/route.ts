import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { createI2VTask, checkI2VTask } from '@/lib/kling';
import { checkVideoQuota, logQuotaUsage } from '@/lib/credits/quotas';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max pour le polling

const SEEDANCE_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDANCE_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

// ═══ PROVIDER ORDER SWITCH ═══
// To swap back: set PRIMARY_PROVIDER = 'kling' and FALLBACK_PROVIDER = 'seedance'
const PRIMARY_PROVIDER: 'kling' | 'seedance' = 'seedance';
const FALLBACK_PROVIDER: 'kling' | 'seedance' = 'kling';

/**
 * POST /api/seedream/i2v
 * Convertir une image en vid\u00e9o \u2014 Kling primary, Seedance fallback
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageUrl, prompt = '', duration = 5, taskId } = body;

    // Si taskId est fourni, on v\u00e9rifie le statut
    if (taskId) {
      if (typeof taskId === 'string' && taskId.startsWith('seedream_')) {
        return checkSeedanceTaskStatus(taskId.replace('seedream_', ''));
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

    // --- V\u00e9rification cr\u00e9dits ---
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
          error: 'Cr\u00e9dits insuffisants',
          insufficientCredits: true,
          cost: check.cost,
          balance: check.balance,
        }, { status: 402 });
      }
      const vidQ = await checkVideoQuota(user.id, Number(duration) || 5);
      if (!vidQ.allowed) {
        return Response.json({
          ok: false,
          error: vidQ.message,
          quotaExceeded: true,
          reason: vidQ.reason,
          limit: vidQ.limit,
          plan: vidQ.plan,
        }, { status: 429 });
      }
    }

    if (!imageUrl || typeof imageUrl !== 'string') {
      return Response.json({ ok: false, error: 'Image URL is required' }, { status: 400 });
    }

    let resultTaskId: string;
    let provider: 'k' | 's';

    // Run the raw brief through Jade's video-optimiser so i2v output
    // (triggered from /generate, /studio or gallery regeneration) gets
    // the same camera + lighting + action direction as Jade's own reels.
    let optimisedBrief = prompt || '';
    try {
      const { optimiseJadeVideoPrompt } = await import('@/lib/visuals/jade-prompter');
      optimisedBrief = await optimiseJadeVideoPrompt(
        prompt && prompt.trim() ? prompt : 'Animate this image with smooth cinematic camera movement, natural editorial lighting, subject staying in frame',
        { duration: Number(duration) || 5, hasReferenceImage: true },
      );
    } catch (e: any) {
      console.warn('[I2V] Jade prompter fallback:', e?.message?.substring?.(0, 200));
    }

    // Seedance prompt formatting
    const truncatedPrompt = optimisedBrief.length > 250 ? optimisedBrief.substring(0, 250) : optimisedBrief;
    const textPrompt = `${truncatedPrompt} --camerafixed false --duration ${duration}`;

    // Helper: convert URL to base64 for Kling
    async function toBase64(url: string): Promise<string> {
      if (!url.startsWith('http')) return url;
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const b64 = Buffer.from(buf).toString('base64');
          const ct = res.headers.get('content-type') || 'image/jpeg';
          return `data:${ct};base64,${b64}`;
        }
      } catch (e: any) {
        console.warn('[I2V] Base64 conversion failed:', e.message);
      }
      return url;
    }

    // --- Primary provider ---
    try {
      if (PRIMARY_PROVIDER === 'kling') {
        console.log('[I2V] Trying Kling (primary)...');
        const imageBase64 = await toBase64(imageUrl);
        const klingTaskId = await createI2VTask({
          image: imageBase64,
          prompt: optimisedBrief || 'Animate this image with smooth cinematic camera movement',
          duration: String(duration),
        });
        resultTaskId = klingTaskId;
        provider = 'k';
        console.log('[I2V] \u2713 Kling task created:', klingTaskId);
      } else {
        console.log('[I2V] Trying Seedance 1.5 Pro (primary)...');
        const content: any[] = [
          { type: 'text', text: textPrompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ];
        const response = await fetch(SEEDANCE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SEEDANCE_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'seedance-1-5-pro-251215',
            content,
          }),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Seedance HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }
        const data = await response.json();
        const seedanceId = data.id || data.task_id || data.data?.id || data.data?.task_id;
        if (!seedanceId) throw new Error('Seedance returned no task ID');
        resultTaskId = `seedream_${seedanceId}`;
        provider = 's';
        console.log('[I2V] \u2713 Seedance task created:', seedanceId);
      }
    } catch (primaryError: any) {
      console.warn(`[I2V] ${PRIMARY_PROVIDER} failed, falling back to ${FALLBACK_PROVIDER}:`, primaryError.message);

      // --- Fallback provider ---
      try {
        if (FALLBACK_PROVIDER === 'kling') {
          const imageBase64 = await toBase64(imageUrl);
          const klingTaskId = await createI2VTask({
            image: imageBase64,
            prompt: optimisedBrief || 'Animate this image with smooth cinematic camera movement',
            duration: String(duration),
          });
          resultTaskId = klingTaskId;
          provider = 'k';
          console.log('[I2V] \u2713 Kling fallback task created:', klingTaskId);
        } else {
          const content: any[] = [
            { type: 'text', text: textPrompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ];
          const response = await fetch(SEEDANCE_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SEEDANCE_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'seedance-1-5-pro-251215',
              content,
            }),
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Seedance HTTP ${response.status}: ${errorText.substring(0, 200)}`);
          }
          const data = await response.json();
          const seedanceId = data.id || data.task_id || data.data?.id || data.data?.task_id;
          if (!seedanceId) throw new Error('Seedance returned no task ID');
          resultTaskId = `seedream_${seedanceId}`;
          provider = 's';
          console.log('[I2V] \u2713 Seedance fallback task created:', seedanceId);
        }
      } catch (fallbackError: any) {
        console.error(`[I2V] ${FALLBACK_PROVIDER} also failed:`, fallbackError.message);
        return Response.json({ ok: false, error: 'Impossible de g\u00e9n\u00e9rer la vid\u00e9o' }, { status: 500 });
      }
    }

    // --- D\u00e9duction cr\u00e9dits apr\u00e8s cr\u00e9ation de t\u00e2che ---
    let newBalance: number | undefined;
    if (user && !isAdminUser) {
      const result = await deductCredits(user.id, 'video_i2v', `Vid\u00e9o I2V ${duration}s`, duration);
      newBalance = result.newBalance;
      logQuotaUsage(user.id, 'video_generated', { mode: 'i2v', duration: Number(duration) || 5 }).catch(() => {});
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

// --- Seedance video task status check ---
async function checkSeedanceTaskStatus(taskId: string): Promise<Response> {
  try {
    const response = await fetch(`${SEEDANCE_API_URL}/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${SEEDANCE_API_KEY}` },
    });

    if (!response.ok) {
      return Response.json({ ok: false, error: `Seedance status error: ${response.status}` }, { status: 500 });
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
