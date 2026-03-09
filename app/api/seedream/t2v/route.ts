import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { createT2VTask, checkT2VTask } from '@/lib/kling';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max pour le polling

const SEEDANCE_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDANCE_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

// ═══ PROVIDER ORDER SWITCH ═══
// To swap back: set PRIMARY_PROVIDER = 'seedance' and FALLBACK_PROVIDER = 'kling'
const PRIMARY_PROVIDER: 'kling' | 'seedance' = 'kling';
const FALLBACK_PROVIDER: 'kling' | 'seedance' = 'seedance';

// POST: Créer une tâche de génération vidéo ou vérifier le statut
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, duration = 5, aspectRatio, taskId } = body;

    // Si taskId est fourni, on vérifie le statut (pas de check crédits pour le polling)
    if (taskId) {
      // Router vers le bon provider selon le préfixe
      if (typeof taskId === 'string' && taskId.startsWith('seedream_')) {
        return checkSeedanceTaskStatus(taskId.replace('seedream_', ''));
      }
      try {
        const result = await checkT2VTask(taskId);

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

        // Still processing
        return Response.json({ ok: true, status: result.status || 'processing', _p: 'k' });
      } catch (error: any) {
        console.error('[T2V] Kling status check error:', error);
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
    }

    // --- Vérification crédits (vidéo = bloquée en mode gratuit) ---
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
      const check = await checkCredits(user.id, 'video_t2v', duration);
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

    // Vérifier le prompt
    if (!prompt || typeof prompt !== 'string') {
      return Response.json({ ok: false, error: 'Prompt is required' }, { status: 400 });
    }

    let resultTaskId: string;
    let provider: 'k' | 's';

    // Seedance prompt formatting (used when Seedance is primary or fallback)
    const ratioFlag = aspectRatio ? ` --ratio ${aspectRatio}` : '';
    const truncatedPrompt = prompt.length > 250 ? prompt.substring(0, 250) : prompt;
    const formattedPrompt = `${truncatedPrompt} --camerafixed false${ratioFlag} --duration ${duration}`;

    // --- Primary provider ---
    try {
      if (PRIMARY_PROVIDER === 'kling') {
        console.log('[T2V] Trying Kling (primary)...');
        const klingTaskId = await createT2VTask({
          prompt,
          duration: String(duration),
          aspect_ratio: aspectRatio || '16:9',
        });
        resultTaskId = klingTaskId;
        provider = 'k';
        console.log('[T2V] \u2713 Kling task created:', klingTaskId);
      } else {
        console.log('[T2V] Trying Seedance 1.5 Pro (primary)...');
        const response = await fetch(SEEDANCE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SEEDANCE_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'seedance-1-5-pro-251215',
            content: [{ type: 'text', text: formattedPrompt }],
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
        console.log('[T2V] \u2713 Seedance task created:', seedanceId);
      }
    } catch (primaryError: any) {
      console.warn(`[T2V] ${PRIMARY_PROVIDER} failed, falling back to ${FALLBACK_PROVIDER}:`, primaryError.message);

      // --- Fallback provider ---
      try {
        if (FALLBACK_PROVIDER === 'kling') {
          const klingTaskId = await createT2VTask({
            prompt,
            duration: String(duration),
            aspect_ratio: aspectRatio || '16:9',
          });
          resultTaskId = klingTaskId;
          provider = 'k';
          console.log('[T2V] \u2713 Kling fallback task created:', klingTaskId);
        } else {
          const response = await fetch(SEEDANCE_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SEEDANCE_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'seedance-1-5-pro-251215',
              content: [{ type: 'text', text: formattedPrompt }],
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
          console.log('[T2V] \u2713 Seedance fallback task created:', seedanceId);
        }
      } catch (fallbackError: any) {
        console.error(`[T2V] ${FALLBACK_PROVIDER} also failed:`, fallbackError.message);
        return Response.json({ ok: false, error: 'Impossible de g\u00e9n\u00e9rer la vid\u00e9o' }, { status: 500 });
      }
    }

    // --- Déduction crédits après création de tâche ---
    let newBalance: number | undefined;
    if (user && !isAdminUser) {
      const result = await deductCredits(user.id, 'video_t2v', `Vid\u00e9o T2V ${duration}s`, duration);
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
    console.error('[T2V] Error:', error);
    return Response.json({ ok: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// --- Seedance video task status check ---
async function checkSeedanceTaskStatus(taskId: string): Promise<Response> {
  try {
    const response = await fetch(`${SEEDANCE_API_URL}/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SEEDANCE_API_KEY}`,
      },
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
