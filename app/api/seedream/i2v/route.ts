export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max pour le polling

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_VIDEO_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

/**
 * POST /api/seedream/i2v
 * Convertir une image en vidéo avec Seedream
 *
 * Body:
 * - imageUrl: URL de l'image à convertir (requis)
 * - prompt: Description du mouvement (optionnel, ex: "zoom avant lentement")
 * - duration: Durée en secondes (défaut: 5)
 * - resolution: '720p' ou '1080p' (défaut: '1080p')
 * - taskId: Pour vérifier le statut d'une tâche existante
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageUrl, prompt = '', duration = 5, resolution = '1080p', taskId } = body;

    // Si taskId est fourni, on vérifie le statut
    if (taskId) {
      return checkTaskStatus(taskId);
    }

    // Vérifier que l'image est fournie
    if (!imageUrl || typeof imageUrl !== 'string') {
      return Response.json({
        ok: false,
        error: 'Image URL is required'
      }, { status: 400 });
    }

    console.log('[Seedream I2V] Creating video from image:', imageUrl.substring(0, 100) + '...');
    if (prompt) {
      console.log('[Seedream I2V] With prompt:', prompt);
    }

    // Construire le contenu avec l'image + prompt optionnel
    const content: any[] = [
      {
        type: 'image_url',
        image_url: {
          url: imageUrl
        }
      }
    ];

    // Ajouter le prompt si fourni (pour contrôler le mouvement)
    if (prompt && prompt.trim()) {
      content.push({
        type: 'text',
        text: `${prompt} --resolution ${resolution} --duration ${duration} --camerafixed false`
      });
    } else {
      // Prompt par défaut pour animer l'image
      content.push({
        type: 'text',
        text: `Animate this image with smooth camera movement --resolution ${resolution} --duration ${duration} --camerafixed false`
      });
    }

    const requestBody = {
      model: 'seedance-1-0-pro-250528',
      content: content
    };

    console.log('[Seedream I2V] Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(SEEDREAM_VIDEO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log('[Seedream I2V] Raw response:', responseText);

    if (!response.ok) {
      console.error('[Seedream I2V] API Error:', response.status, responseText);
      return Response.json({
        ok: false,
        error: `Seedream Video API error: ${response.status} - ${responseText}`
      }, { status: response.status });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('[Seedream I2V] Failed to parse response:', responseText);
      return Response.json({
        ok: false,
        error: 'Invalid JSON response from Seedream Video API'
      }, { status: 500 });
    }

    console.log('[Seedream I2V] Parsed response:', JSON.stringify(data, null, 2));

    // Chercher l'ID de la tâche
    const taskIdFromResponse = data.id || data.task_id || data.taskId || data.data?.id || data.data?.task_id;

    if (!taskIdFromResponse) {
      console.error('[Seedream I2V] No task ID in response:', data);
      return Response.json({
        ok: false,
        error: 'Invalid response from Seedream Video API - no task ID found',
        debug: data
      }, { status: 500 });
    }

    console.log('[Seedream I2V] Task created successfully:', taskIdFromResponse);

    return Response.json({
      ok: true,
      taskId: taskIdFromResponse,
      status: 'pending'
    });

  } catch (error: any) {
    console.error('[Seedream I2V] Error:', error);
    return Response.json({
      ok: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

// Vérifier le statut d'une tâche (identique au T2V)
async function checkTaskStatus(taskId: string) {
  try {
    console.log('[Seedream I2V] Checking task status:', taskId);

    const response = await fetch(`${SEEDREAM_VIDEO_API_URL}/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`
      }
    });

    const responseText = await response.text();
    console.log('[Seedream I2V] Status response:', responseText);

    if (!response.ok) {
      console.error('[Seedream I2V] Status check error:', response.status, responseText);
      return Response.json({
        ok: false,
        error: `Failed to check task status: ${response.status} - ${responseText}`
      }, { status: response.status });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('[Seedream I2V] Failed to parse status response:', responseText);
      return Response.json({
        ok: false,
        error: 'Invalid JSON response when checking status'
      }, { status: 500 });
    }

    console.log('[Seedream I2V] Parsed status:', JSON.stringify(data, null, 2));

    const status = data.status || data.state || data.task_status || data.data?.status;
    console.log('[Seedream I2V] Task status:', status);

    // Vérifier si la vidéo est prête
    if (status === 'succeeded' || status === 'completed' || status === 'success' || status === 'done') {
      let videoUrl = null;

      // Chercher l'URL de la vidéo
      if (data.content && typeof data.content === 'object' && !Array.isArray(data.content)) {
        if (data.content.video_url) {
          videoUrl = data.content.video_url;
        }
      }

      if (!videoUrl && data.content && Array.isArray(data.content)) {
        for (const item of data.content) {
          if (item.type === 'video_url' && item.video_url?.url) {
            videoUrl = item.video_url.url;
            break;
          }
          if (item.type === 'video' && item.url) {
            videoUrl = item.url;
            break;
          }
          if (item.video_url) {
            videoUrl = typeof item.video_url === 'string' ? item.video_url : item.video_url.url;
            break;
          }
        }
      }

      if (!videoUrl) videoUrl = data.output?.video_url;
      if (!videoUrl) videoUrl = data.output?.url;
      if (!videoUrl) videoUrl = data.result?.video_url;
      if (!videoUrl) videoUrl = data.result?.url;
      if (!videoUrl) videoUrl = data.video_url;
      if (!videoUrl) videoUrl = data.url;
      if (!videoUrl) videoUrl = data.data?.video_url;
      if (!videoUrl) videoUrl = data.data?.output?.video_url;

      if (videoUrl) {
        console.log('[Seedream I2V] Video ready:', videoUrl);
        return Response.json({
          ok: true,
          status: 'completed',
          videoUrl: videoUrl
        });
      } else {
        console.log('[Seedream I2V] ====== DEBUG: Status completed but no video URL ======');
        console.log('[Seedream I2V] Full data:', JSON.stringify(data, null, 2));

        return Response.json({
          ok: true,
          status: 'completed',
          error: 'Video completed but URL not found',
          debug: data
        });
      }
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      const errorMsg = data.error || data.message || data.error_message || data.data?.error || 'Video generation failed';
      console.error('[Seedream I2V] Task failed:', errorMsg);
      return Response.json({
        ok: false,
        status: 'failed',
        error: errorMsg
      });
    }

    // Encore en cours
    const progress = data.progress || data.percent || data.data?.progress;
    console.log('[Seedream I2V] Still processing, progress:', progress);

    return Response.json({
      ok: true,
      status: status || 'processing',
      progress: progress
    });

  } catch (error: any) {
    console.error('[Seedream I2V] Status check error:', error);
    return Response.json({
      ok: false,
      error: error.message || 'Failed to check task status'
    }, { status: 500 });
  }
}
