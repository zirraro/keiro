import { getAuthUser } from '@/lib/auth-server';
import { decomposePromptIntoScenes, calculateSegments } from '@/lib/video-scenes';
import { enhanceVideoPrompt } from '@/lib/video-prompt-enhancer';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/seedream/video-long/decompose
 * Returns decomposed scenes for the advanced video editor.
 * Requires authentication.
 */
export async function POST(request: Request) {
  try {
    const { user } = await getAuthUser();
    if (!user) {
      return Response.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, duration, options } = body;

    if (!prompt || !duration) {
      return Response.json({ ok: false, error: 'prompt et duration requis' }, { status: 400 });
    }

    // Enhance prompt with cinematic directives first
    let enhancedPrompt = prompt;
    try {
      enhancedPrompt = await enhanceVideoPrompt(prompt, {
        duration,
        ...options,
      });
    } catch (e) {
      console.warn('[decompose] Enhancement failed, using raw prompt');
    }

    // Decompose into scenes
    const scenes = await decomposePromptIntoScenes(enhancedPrompt, duration, options);

    // Map to advanced segment format
    const segments = scenes.map((scene, i) => ({
      index: i,
      duration: scene.duration,
      prompt: scene.prompt,
      cameraMovement: 'tracking',
      transition: i < scenes.length - 1 ? 'smooth' : 'fade',
      type: scene.type,
    }));

    return Response.json({ ok: true, segments });
  } catch (error: any) {
    console.error('[decompose] Error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
