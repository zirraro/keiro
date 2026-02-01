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

    // Télécharger l'image et la convertir en base64 pour éviter les problèmes d'accès
    let finalImageUrl = imageUrl;

    // Si c'est une URL Supabase, télécharger et convertir en base64
    if (imageUrl.includes('supabase.co') || imageUrl.includes('supabase')) {
      console.log('[Seedream I2V] Supabase URL detected, converting to base64...');

      try {
        const imageResponse = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.status}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(imageBuffer).toString('base64');
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

        // Créer un data URI
        finalImageUrl = `data:${contentType};base64,${base64}`;

        console.log('[Seedream I2V] Converted to base64, size:', (base64.length / 1024).toFixed(2), 'KB');
      } catch (conversionError: any) {
        console.error('[Seedream I2V] Failed to convert to base64:', conversionError.message);
        // Continuer avec l'URL originale en fallback
      }
    }

    // Construire le contenu avec l'image + prompt optionnel
    const content: any[] = [
      {
        type: 'image_url',
        image_url: {
          url: finalImageUrl
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

        // CONVERSION AUTOMATIQUE POUR TIKTOK
        // Convertir la vidéo en format TikTok-compatible (H.264 + AAC)
        console.log('[Seedream I2V] Starting automatic TikTok conversion...');

        try {
          const conversionResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/convert-video-tiktok`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoUrl })
          });

          const conversionData = await conversionResponse.json();

          if (conversionData.ok && conversionData.convertedUrl) {
            console.log('[Seedream I2V] Conversion successful, TikTok-ready URL:', conversionData.convertedUrl);

            return Response.json({
              ok: true,
              status: 'completed',
              videoUrl: conversionData.convertedUrl,
              originalVideoUrl: videoUrl,
              tiktokReady: true,
              conversionMethod: conversionData.method
            });
          } else {
            console.warn('[Seedream I2V] ⚠️ Conversion failed or not available:', conversionData.error);
            console.log('[Seedream I2V] Returning original video URL (may not be TikTok-compatible)');

            // Check if it's a CloudConvert setup issue
            if (conversionData.requiresCloudConvertSetup) {
              console.error('[Seedream I2V] ❌ CloudConvert API key not configured!');
              console.error('[Seedream I2V] Videos will NOT be TikTok-compatible without conversion');
            }

            // Fallback: retourner la vidéo originale avec un avertissement
            return Response.json({
              ok: true,
              status: 'completed',
              videoUrl: videoUrl,
              tiktokReady: false,
              conversionWarning: conversionData.error || 'Conversion automatique non disponible',
              conversionMessage: conversionData.message,
              requiresCloudConvertSetup: conversionData.requiresCloudConvertSetup || false
            });
          }
        } catch (conversionError: any) {
          console.error('[Seedream I2V] ❌ Conversion request error:', conversionError.message);
          console.log('[Seedream I2V] Returning original video URL');

          // En cas d'erreur, retourner la vidéo originale
          return Response.json({
            ok: true,
            status: 'completed',
            videoUrl: videoUrl,
            tiktokReady: false,
            conversionError: 'Échec de la conversion automatique - Configuration CloudConvert requise'
          });
        }
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
      // Extract detailed error message
      const errorMsg = data.error ||
                      data.message ||
                      data.error_message ||
                      data.data?.error ||
                      data.data?.message ||
                      data.error_description ||
                      'Génération vidéo échouée';

      const errorCode = data.error_code || data.code || data.data?.error_code;

      console.error('[Seedream I2V] Task failed:', {
        code: errorCode,
        message: errorMsg,
        fullData: JSON.stringify(data, null, 2)
      });

      return Response.json({
        ok: false,
        status: 'failed',
        error: errorCode ? `Erreur ${errorCode}: ${errorMsg}` : errorMsg
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
