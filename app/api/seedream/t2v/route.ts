import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { createT2VTask, checkT2VTask } from '@/lib/kling';

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max pour le polling

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_VIDEO_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

// POST: Créer une tâche de génération vidéo ou vérifier le statut
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, duration = 5, aspectRatio, taskId } = body;

    // Si taskId est fourni, on vérifie le statut (pas de check crédits pour le polling)
    if (taskId) {
      // Router vers le bon provider selon le préfixe
      if (typeof taskId === 'string' && taskId.startsWith('seedream_')) {
        return checkSeedreamTaskStatus(taskId.replace('seedream_', ''));
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

    // --- Primary: Kling ---
    try {
      console.log('[T2V] Trying Kling...');
      const klingTaskId = await createT2VTask({
        prompt,
        duration: String(duration),
        aspect_ratio: aspectRatio || '16:9',
      });
      resultTaskId = klingTaskId;
      provider = 'k';
      console.log('[T2V] ✓ Kling task created:', klingTaskId);
    } catch (klingError: any) {
      console.warn('[T2V] Kling failed, falling back to Seedream:', klingError.message);

      // --- Fallback: Seedream SeedAnce ---
      const ratioFlag = aspectRatio ? ` --ratio ${aspectRatio}` : '';
      const formattedPrompt = `${prompt} --resolution 1080p --duration ${duration}${ratioFlag} --camerafixed false`;

      const response = await fetch(SEEDREAM_VIDEO_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SEEDREAM_API_KEY}`
        },
        body: JSON.stringify({
          model: 'seedance-1-0-pro-250528',
          content: [{ type: 'text', text: formattedPrompt }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[T2V] Seedream fallback also failed:', response.status, errorText);
        return Response.json({ ok: false, error: 'Impossible de générer la vidéo' }, { status: 500 });
      }

      const data = await response.json();
      const seedreamId = data.id || data.task_id || data.data?.id || data.data?.task_id;
      if (!seedreamId) {
        console.error('[T2V] Seedream no task ID:', data);
        return Response.json({ ok: false, error: 'Erreur création tâche vidéo' }, { status: 500 });
      }

      resultTaskId = `seedream_${seedreamId}`;
      provider = 's';
      console.log('[T2V] ⚠ Seedream fallback task created:', seedreamId);
    }

    // --- Déduction crédits après création de tâche ---
    let newBalance: number | undefined;
    if (user && !isAdminUser) {
      const result = await deductCredits(user.id, 'video_t2v', `Vidéo T2V ${duration}s`, duration);
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

// --- Seedream video task status check ---
async function checkSeedreamTaskStatus(taskId: string): Promise<Response> {
  try {
    const response = await fetch(`${SEEDREAM_VIDEO_API_URL}/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ ok: false, error: `Seedream status error: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const status = data.status || data.data?.status || data.state || data.data?.state;

    if (status === 'succeeded' || status === 'completed' || status === 'success' || status === 'done') {
      let videoUrl = null;
      // Chercher l'URL vidéo dans différents formats
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
