import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { createT2VTask, checkT2VTask } from '@/lib/kling';
import { checkVideoQuota, logQuotaUsage } from '@/lib/credits/quotas';
import { isMarginSafe } from '@/lib/credits/margin';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max pour le polling

const SEEDANCE_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDANCE_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

// ═══ PROVIDER ORDER SWITCH ═══
// To swap back: set PRIMARY_PROVIDER = 'kling' and FALLBACK_PROVIDER = 'seedance'
const PRIMARY_PROVIDER: 'kling' | 'seedance' = 'seedance';
const FALLBACK_PROVIDER: 'kling' | 'seedance' = 'kling';

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
      // Plan-level hard quota: monthly count + max duration
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
      const margin = await isMarginSafe(user.id);
      if (!margin.safe) {
        return Response.json({
          ok: false,
          error: margin.message,
          marginBlocked: true,
          plan: margin.snapshot.plan,
          margin_pct: margin.snapshot.margin_pct,
        }, { status: 429 });
      }
    }

    // Vérifier le prompt
    if (!prompt || typeof prompt !== 'string') {
      return Response.json({ ok: false, error: 'Prompt is required' }, { status: 400 });
    }

    let resultTaskId: string;
    let provider: 'k' | 's';

    // Run the raw client brief through Jade's video-optimiser first so
    // every t2v hitting /generate and /studio gets the same elite prompt
    // treatment as Jade's own daily reels (camera movement, lighting
    // evolution, subject action, composition discipline).
    let optimisedBrief = prompt;
    try {
      const { optimiseJadeVideoPrompt } = await import('@/lib/visuals/jade-prompter');
      optimisedBrief = await optimiseJadeVideoPrompt(prompt, {
        aspectRatio,
        duration: Number(duration) || 5,
        hasReferenceImage: false,
      });
    } catch (e: any) {
      console.warn('[T2V] Jade prompter fallback (using raw brief):', e?.message?.substring?.(0, 200));
    }

    // Seedance prompt formatting (used when Seedance is primary or fallback)
    const ratioFlag = aspectRatio ? ` --ratio ${aspectRatio}` : '';
    const truncatedPrompt = optimisedBrief.length > 250 ? optimisedBrief.substring(0, 250) : optimisedBrief;
    const formattedPrompt = `${truncatedPrompt} --camerafixed false${ratioFlag} --duration ${duration}`;

    // --- Primary provider ---
    try {
      if (PRIMARY_PROVIDER === 'kling') {
        console.log('[T2V] Trying Kling (primary)...');
        const klingTaskId = await createT2VTask({
          prompt: optimisedBrief,
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
            prompt: optimisedBrief,
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

        // \u2500\u2500 Dernier filet : Veo, chez Google \u2500\u2500
        //
        // Jusqu'au 20 ao\u00fbt on rendait \u00ab Impossible de g\u00e9n\u00e9rer la vid\u00e9o \u00bb ici.
        // Les images avaient trois secours, la vid\u00e9o aucun : le 19 ao\u00fbt, un
        // pr\u00e9l\u00e8vement ByteDance refus\u00e9 (403 AccountOverdueError) a coup\u00e9
        // Seedance d'un coup et la vid\u00e9o s'est arr\u00eat\u00e9e net, sans repli.
        //
        // Veo vit sur le compte Google, d\u00e9j\u00e0 approvisionn\u00e9 \u2014 donc il survit
        // pr\u00e9cis\u00e9ment \u00e0 la panne qui tue Seedance. C'est la seule propri\u00e9t\u00e9 qui
        // compte pour un secours : ne pas d\u00e9pendre de ce qu'il remplace.
        //
        // Il rend une vid\u00e9o TERMIN\u00c9E, l\u00e0 o\u00f9 Seedance rend un identifiant de
        // t\u00e2che \u00e0 interroger. On renvoie donc directement l'URL au lieu
        // d'entrer dans la boucle de sondage.
        try {
          const { genererVideoVeo } = await import('@/lib/visuals/veo-fallback');
          const veo = await genererVideoVeo(prompt, {
            aspectRatio: aspectRatio || '9:16',
            secondes: duration,
          });
          console.log(`[T2V] \u2713 Veo (${veo.modele}) \u2014 ${veo.coutEur} \u20ac`);

          if (user && !isAdminUser) {
            await deductCredits(user.id, 'video_t2v', `Vid\u00e9o T2V ${duration}s (secours Veo)`, duration);
          }
          return Response.json({
            ok: true,
            videoUrl: veo.videoUrl,
            provider: veo.modele,
            coutEur: veo.coutEur,
            secours: true,
          });
        } catch (veoError: any) {
          // Les trois fournisseurs sont tomb\u00e9s. On nomme le dernier \u00e9chec au
          // lieu d'un message g\u00e9n\u00e9rique : \u00ab impossible \u00bb n'aide personne \u00e0
          // savoir s'il faut recharger un compte ou attendre dix minutes.
          console.error('[T2V] Veo a \u00e9chou\u00e9 aussi :', veoError?.message);
          return Response.json(
            { ok: false, error: `Aucun fournisseur vid\u00e9o disponible \u2014 ${String(veoError?.message ?? '').slice(0, 160)}` },
            { status: 503 },
          );
        }
      }
    }

    // --- Déduction crédits après création de tâche ---
    let newBalance: number | undefined;
    if (user && !isAdminUser) {
      const result = await deductCredits(user.id, 'video_t2v', `Vid\u00e9o T2V ${duration}s`, duration);
      newBalance = result.newBalance;
      logQuotaUsage(user.id, 'video_generated', { mode: 't2v', duration: Number(duration) || 5 }).catch(() => {});
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
