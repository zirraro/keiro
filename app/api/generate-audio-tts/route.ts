import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { generateAudioWithElevenLabs, estimateAudioDuration, ELEVENLABS_VOICES, DEFAULT_VOICE_ID } from '@/lib/audio/elevenlabs-tts';
import { condenseText } from '@/lib/audio/condense-text';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, blocked: true, reason: 'requires_account', cta: true },
        { status: 403 }
      );
    }

    // --- Credit check ---
    const isAdminUser = await isAdmin(user.id);
    if (!isAdminUser) {
      const check = await checkCredits(user.id, 'audio_tts');
      if (!check.allowed) {
        return NextResponse.json(
          { ok: false, error: 'Crédits insuffisants', insufficientCredits: true, cost: check.cost, balance: check.balance },
          { status: 402 }
        );
      }
    }

    const {
      text,
      targetDuration = 5,
      voice = DEFAULT_VOICE_ID,
      speed = 1.0,
    } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Texte manquant ou invalide' },
        { status: 400 }
      );
    }

    // Validate voice ID
    const voiceId = ELEVENLABS_VOICES[voice] ? voice : DEFAULT_VOICE_ID;

    console.log('[GenerateAudioTTS] User:', user.id);
    console.log('[GenerateAudioTTS] Text length:', text.length, 'characters');
    console.log('[GenerateAudioTTS] Target duration:', targetDuration, 'seconds');
    console.log('[GenerateAudioTTS] Voice:', voiceId, ELEVENLABS_VOICES[voiceId]?.name || 'unknown');

    // 1. Condense text to fit target duration if needed
    const targetWords = Math.floor(targetDuration * 2.5 * speed);
    const currentWords = text.trim().split(/\s+/).length;

    console.log('[GenerateAudioTTS] Current words:', currentWords, '/ Target:', targetWords);

    let finalText = text.trim();

    if (currentWords > targetWords) {
      console.log('[GenerateAudioTTS] Text too long, condensing with Claude...');
      try {
        finalText = await condenseText(text, targetWords, 'informative');
        console.log('[GenerateAudioTTS] Text condensed:', finalText);
      } catch (error: any) {
        console.error('[GenerateAudioTTS] Condensation failed:', error);
      }
    }

    // 2. Generate audio with ElevenLabs TTS
    console.log('[GenerateAudioTTS] Generating audio with ElevenLabs...');
    const audioUrl = await generateAudioWithElevenLabs(finalText, voiceId);

    // 3. Estimate actual duration
    const estimatedDuration = estimateAudioDuration(finalText, speed);

    console.log('[GenerateAudioTTS] Audio generated successfully');
    console.log('[GenerateAudioTTS] Audio URL:', audioUrl);
    console.log('[GenerateAudioTTS] Estimated duration:', estimatedDuration, 'seconds');

    // --- Deduct credits after success ---
    let newBalance: number | undefined;
    if (!isAdminUser) {
      const result = await deductCredits(user.id, 'audio_tts', 'Audio narration TTS (ElevenLabs)');
      newBalance = result.newBalance;
    }

    return NextResponse.json({
      ok: true,
      audioUrl,
      condensedText: finalText,
      estimatedDuration,
      originalWordCount: currentWords,
      finalWordCount: finalText.split(/\s+/).length,
      newBalance,
    });
  } catch (error: any) {
    console.error('[GenerateAudioTTS] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la génération audio' },
      { status: 500 }
    );
  }
}
