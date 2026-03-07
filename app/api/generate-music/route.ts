import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { generateBackgroundMusic, MUSIC_PROMPTS } from '@/lib/audio/elevenlabs-music';

export const runtime = 'edge';

/**
 * POST /api/generate-music
 * Generate background music via ElevenLabs Sound Generation
 */
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, blocked: true, reason: 'requires_account' },
        { status: 403 }
      );
    }

    const { style, duration = 10 } = await req.json();

    if (!style || !MUSIC_PROMPTS[style]) {
      return NextResponse.json(
        { ok: false, error: `Style invalide. Valeurs: ${Object.keys(MUSIC_PROMPTS).join(', ')}` },
        { status: 400 }
      );
    }

    console.log(`[GenerateMusic] User: ${user.id}, style: ${style}, duration: ${duration}s`);

    const musicUrl = await generateBackgroundMusic(style, duration);

    return NextResponse.json({ ok: true, musicUrl });
  } catch (error: any) {
    console.error('[GenerateMusic] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur generation musique' },
      { status: 500 }
    );
  }
}
