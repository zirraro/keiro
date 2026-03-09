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

    // Handle trending music: "trending:Song Title" → generate instrumental inspired by it
    let resolvedStyle = style;
    let customPrompt: string | undefined;
    if (style && style.startsWith('trending:')) {
      const songTitle = style.replace('trending:', '').trim();
      resolvedStyle = 'trendy';
      // Build a custom prompt inspired by the actual song
      customPrompt = `Instrumental version inspired by "${songTitle}". Capture the same energy, tempo, and mood of this trending song. Modern production, catchy melodic hook, viral beat. No vocals, purely instrumental but unmistakably reminiscent of the original song's vibe and rhythm.`;
      console.log(`[GenerateMusic] Trending music requested: "${songTitle}", custom prompt`);
    }

    if (!resolvedStyle || !MUSIC_PROMPTS[resolvedStyle]) {
      return NextResponse.json(
        { ok: false, error: `Style invalide. Valeurs: ${Object.keys(MUSIC_PROMPTS).join(', ')}` },
        { status: 400 }
      );
    }

    console.log(`[GenerateMusic] User: ${user.id}, style: ${resolvedStyle}, duration: ${duration}s`);

    const musicUrl = await generateBackgroundMusic(resolvedStyle, duration, customPrompt);

    return NextResponse.json({ ok: true, musicUrl });
  } catch (error: any) {
    console.error('[GenerateMusic] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur generation musique' },
      { status: 500 }
    );
  }
}
