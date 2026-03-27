import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { generateAudioWithElevenLabs, estimateAudioDuration, ELEVENLABS_VOICES, DEFAULT_VOICE_ID } from '@/lib/audio/elevenlabs-tts';
import { condenseText } from '@/lib/audio/condense-text';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';

export const runtime = 'edge';

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

    // 1. Adapt text length to fit target duration
    const targetWords = Math.floor(targetDuration * 2.5 * speed);
    const currentWords = text.trim().split(/\s+/).length;

    console.log('[GenerateAudioTTS] Current words:', currentWords, '/ Target:', targetWords, `(${targetDuration}s)`);

    let finalText = text.trim();

    // Strip translation hint prefix if present
    finalText = finalText.replace(/^\[TRADUIRE EN FRANÇAIS SI NÉCESSAIRE\]\s*/i, '');

    // Always run through condenseText to ensure French language + proper duration
    // condenseText enforces French output even if input is in English
    const needsAdaptation = currentWords > targetWords * 1.2 || (currentWords < targetWords * 0.6 && targetDuration > 5);
    const looksEnglish = /^[a-zA-Z\s,.'":;!?-]+$/.test(finalText.substring(0, 100)) && !/[àâäéèêëïîôùûüÿçœæ]/i.test(finalText.substring(0, 200));

    if (needsAdaptation || looksEnglish) {
      const reason = looksEnglish ? 'translating to French +' : '';
      const action = currentWords > targetWords ? 'condensing' : 'expanding';
      console.log(`[GenerateAudioTTS] Text needs ${reason} ${action} (${currentWords} → ~${targetWords} words for ${targetDuration}s)...`);
      try {
        finalText = await condenseText(finalText, targetWords, 'informative');
        console.log(`[GenerateAudioTTS] Text ${reason}${action} done:`, finalText.substring(0, 100) + '...');
      } catch (error: any) {
        console.error(`[GenerateAudioTTS] Text ${reason}${action} failed:`, error);
      }
    }

    // 2. Generate audio with ElevenLabs TTS (always French)
    console.log('[GenerateAudioTTS] Generating audio with ElevenLabs (language: fr)...');
    const audioUrl = await generateAudioWithElevenLabs(finalText, voiceId, 'fr');

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
