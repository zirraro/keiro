import { NextRequest, NextResponse } from 'next/server';
import { generateAudioWithElevenLabs, estimateAudioDuration, DEFAULT_VOICE_ID } from '@/lib/audio/elevenlabs-tts';
import { condenseText } from '@/lib/audio/condense-text';

export const runtime = 'edge';

/**
 * POST /api/generate-narration
 * Generate audio narration for TikTok video from news text
 * Now uses ElevenLabs instead of OpenAI TTS
 */
export async function POST(req: NextRequest) {
  try {
    const { text, duration = 5, voice } = await req.json();

    if (!text) {
      return NextResponse.json(
        { ok: false, error: 'Texte manquant' },
        { status: 400 }
      );
    }

    console.log('[GenerateNarration] Generating audio narration...');
    console.log('[GenerateNarration] Original text length:', text.length, 'chars');
    console.log('[GenerateNarration] Target duration:', duration, 'seconds');

    // STEP 1: Condense text to fit target duration
    const targetWordCount = Math.floor(duration * 2.5);
    let scriptText = text.trim();

    if (scriptText.split(/\s+/).length > targetWordCount) {
      try {
        scriptText = await condenseText(text, targetWordCount, 'informative');
      } catch {
        scriptText = text.split(/\s+/).slice(0, targetWordCount).join(' ');
      }
    }

    console.log('[GenerateNarration] Script:', scriptText);

    // STEP 2: Generate audio with ElevenLabs TTS (always French)
    const voiceId = voice || DEFAULT_VOICE_ID;
    const audioUrl = await generateAudioWithElevenLabs(scriptText, voiceId, 'fr');
    const estimatedDuration = estimateAudioDuration(scriptText);

    return NextResponse.json({
      ok: true,
      audioUrl,
      script: scriptText,
      duration: estimatedDuration,
    });

  } catch (error: any) {
    console.error('[GenerateNarration] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la génération audio' },
      { status: 500 }
    );
  }
}
