import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { createT2VTask, checkT2VTask } from '@/lib/kling';

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max pour le polling

// POST: Créer une tâche de génération vidéo ou vérifier le statut
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, duration = 5, aspectRatio, taskId } = body;

    // Si taskId est fourni, on vérifie le statut (pas de check crédits pour le polling)
    if (taskId) {
      try {
        const result = await checkT2VTask(taskId);

        if (result.status === 'completed') {
          if (result.videoUrl) {
            return Response.json({ ok: true, status: 'completed', videoUrl: result.videoUrl });
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
        return Response.json({ ok: true, status: result.status || 'processing' });
      } catch (error: any) {
        console.error('[T2V] Status check error:', error);
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

    console.log('[T2V] Creating Kling video task, prompt:', prompt.substring(0, 100) + '...');
    console.log('[T2V] Duration:', duration, 'Aspect ratio:', aspectRatio || '16:9');

    // Créer la tâche via Kling
    const klingTaskId = await createT2VTask({
      prompt,
      duration: String(duration),
      aspect_ratio: aspectRatio || '16:9',
    });

    // --- Déduction crédits après création de tâche ---
    let newBalance: number | undefined;
    if (user && !isAdminUser) {
      const result = await deductCredits(user.id, 'video_t2v', `Vidéo T2V ${duration}s`, duration);
      newBalance = result.newBalance;
    }

    return Response.json({
      ok: true,
      taskId: klingTaskId,
      status: 'pending',
      newBalance,
    });

  } catch (error: any) {
    console.error('[T2V] Error:', error);
    return Response.json({ ok: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
