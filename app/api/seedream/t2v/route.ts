export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max pour le polling

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_VIDEO_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

// POST: Créer une tâche de génération vidéo
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, duration = 5, resolution = '1080p', taskId } = body;

    // Si taskId est fourni, on vérifie le statut
    if (taskId) {
      return checkTaskStatus(taskId);
    }

    // Sinon, on crée une nouvelle tâche
    if (!prompt || typeof prompt !== 'string') {
      return Response.json({
        ok: false,
        error: 'Prompt is required and must be a string'
      }, { status: 400 });
    }

    console.log('[Seedream T2V] Creating video task with prompt:', prompt.substring(0, 100) + '...');

    // Formater le prompt avec les paramètres
    const formattedPrompt = `${prompt} --resolution ${resolution} --duration ${duration} --camerafixed false`;

    const response = await fetch(SEEDREAM_VIDEO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`
      },
      body: JSON.stringify({
        model: 'seedance-1-0-pro-250528',
        content: [
          {
            type: 'text',
            text: formattedPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Seedream T2V] API Error:', response.status, errorText);
      return Response.json({
        ok: false,
        error: `Seedream Video API error: ${response.status} - ${errorText}`
      }, { status: response.status });
    }

    const data = await response.json();

    if (!data.id) {
      console.error('[Seedream T2V] Invalid response:', data);
      return Response.json({
        ok: false,
        error: 'Invalid response from Seedream Video API - no task ID'
      }, { status: 500 });
    }

    console.log('[Seedream T2V] Task created successfully:', data.id);

    return Response.json({
      ok: true,
      taskId: data.id,
      status: 'pending'
    });

  } catch (error: any) {
    console.error('[Seedream T2V] Error:', error);
    return Response.json({
      ok: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

// Vérifier le statut d'une tâche
async function checkTaskStatus(taskId: string) {
  try {
    console.log('[Seedream T2V] Checking task status:', taskId);

    const response = await fetch(`${SEEDREAM_VIDEO_API_URL}/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Seedream T2V] Status check error:', response.status, errorText);
      return Response.json({
        ok: false,
        error: `Failed to check task status: ${response.status}`
      }, { status: response.status });
    }

    const data = await response.json();
    console.log('[Seedream T2V] Task status:', data.status);

    // Vérifier si la vidéo est prête
    if (data.status === 'succeeded' || data.status === 'completed') {
      // Chercher l'URL de la vidéo dans la réponse
      let videoUrl = null;

      if (data.content && Array.isArray(data.content)) {
        for (const item of data.content) {
          if (item.type === 'video_url' && item.video_url?.url) {
            videoUrl = item.video_url.url;
            break;
          }
        }
      }

      if (data.output?.video_url) {
        videoUrl = data.output.video_url;
      }

      if (data.result?.video_url) {
        videoUrl = data.result.video_url;
      }

      if (videoUrl) {
        console.log('[Seedream T2V] Video ready:', videoUrl);
        return Response.json({
          ok: true,
          status: 'completed',
          videoUrl: videoUrl
        });
      }
    }

    if (data.status === 'failed' || data.status === 'error') {
      return Response.json({
        ok: false,
        status: 'failed',
        error: data.error || data.message || 'Video generation failed'
      });
    }

    // Encore en cours
    return Response.json({
      ok: true,
      status: data.status || 'processing',
      progress: data.progress || null
    });

  } catch (error: any) {
    console.error('[Seedream T2V] Status check error:', error);
    return Response.json({
      ok: false,
      error: error.message || 'Failed to check task status'
    }, { status: 500 });
  }
}
