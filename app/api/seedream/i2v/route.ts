import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { createI2VTask, checkI2VTask } from '@/lib/kling';

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max pour le polling

/**
 * POST /api/seedream/i2v
 * Convertir une image en vidéo avec Kling AI
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageUrl, prompt = '', duration = 5, taskId } = body;

    // Si taskId est fourni, on vérifie le statut (pas de check crédits pour le polling)
    if (taskId) {
      try {
        const result = await checkI2VTask(taskId);

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
        console.error('[I2V] Status check error:', error);
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

    // Vérifier que l'image est fournie
    if (!imageUrl || typeof imageUrl !== 'string') {
      return Response.json({ ok: false, error: 'Image URL is required' }, { status: 400 });
    }

    console.log('[I2V] Creating Kling video from image:', imageUrl.substring(0, 100) + '...');
    if (prompt) console.log('[I2V] With prompt:', prompt);

    // Télécharger l'image et la convertir en base64 pour Kling
    let imageForKling = imageUrl;

    // Si c'est une URL (pas déjà du base64), télécharger et convertir
    if (imageUrl.startsWith('http')) {
      console.log('[I2V] Downloading image for base64 conversion...');
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

        // Kling accepte les data URIs ou le base64 brut
        imageForKling = `data:${contentType};base64,${base64}`;
        console.log('[I2V] Converted to base64, size:', (base64.length / 1024).toFixed(2), 'KB');
      } catch (conversionError: any) {
        console.error('[I2V] Failed to convert to base64:', conversionError.message);
        // Essayer avec l'URL directe en fallback
        imageForKling = imageUrl;
      }
    }

    // Créer la tâche via Kling
    const klingTaskId = await createI2VTask({
      image: imageForKling,
      prompt: prompt || 'Animate this image with smooth cinematic camera movement',
      duration: String(duration),
    });

    // --- Déduction crédits après création de tâche ---
    let newBalance: number | undefined;
    if (user && !isAdminUser) {
      const result = await deductCredits(user.id, 'video_i2v', `Vidéo I2V ${duration}s`, duration);
      newBalance = result.newBalance;
    }

    return Response.json({
      ok: true,
      taskId: klingTaskId,
      status: 'pending',
      newBalance,
    });

  } catch (error: any) {
    console.error('[I2V] Error:', error);
    return Response.json({ ok: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
