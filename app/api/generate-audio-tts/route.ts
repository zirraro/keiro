import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { generateAudioWithOpenAI, estimateAudioDuration } from '@/lib/audio/openai-tts';
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

    // --- Vérification crédits ---
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
      voice = 'alloy',
      speed = 1.0,
    } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Texte manquant ou invalide' },
        { status: 400 }
      );
    }

    console.log('[GenerateAudioTTS] User:', user.id);
    console.log('[GenerateAudioTTS] Text length:', text.length, 'characters');
    console.log('[GenerateAudioTTS] Target duration:', targetDuration, 'seconds');
    console.log('[GenerateAudioTTS] Voice:', voice, 'Speed:', speed);

    // 1. Condense text to fit target duration if needed
    // Rule: ~2.5 words per second at normal speed
    const targetWords = Math.floor(targetDuration * 2.5 * speed);
    const currentWords = text.trim().split(/\s+/).length;

    console.log('[GenerateAudioTTS] Current words:', currentWords, '/ Target:', targetWords);

    let finalText = text.trim();

    if (currentWords > targetWords) {
      console.log('[GenerateAudioTTS] Text too long, condensing with Claude...');
      try {
        finalText = await condenseText(text, targetWords, 'informative');
        console.log('[GenerateAudioTTS] ✅ Text condensed:', finalText);
      } catch (error: any) {
        console.error('[GenerateAudioTTS] Condensation failed:', error);
        // Continue with original text if condensation fails
        console.log('[GenerateAudioTTS] Using original text (condensation failed)');
      }
    }

    // 2. Generate audio with OpenAI TTS
    console.log('[GenerateAudioTTS] Generating audio with OpenAI TTS...');
    const audioUrl = await generateAudioWithOpenAI(
      finalText,
      voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      speed
    );

    // 3. Estimate actual duration
    const estimatedDuration = estimateAudioDuration(finalText, speed);

    console.log('[GenerateAudioTTS] ✅ Audio generated successfully');
    console.log('[GenerateAudioTTS] Audio URL:', audioUrl);
    console.log('[GenerateAudioTTS] Estimated duration:', estimatedDuration, 'seconds');

    // --- Déduction crédits après succès ---
    let newBalance: number | undefined;
    if (!isAdminUser) {
      const result = await deductCredits(user.id, 'audio_tts', 'Audio narration TTS');
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

/**
 * Setup instructions:
 *
 * 1. Ensure OPENAI_API_KEY is set in environment variables
 * 2. Ensure ANTHROPIC_API_KEY is set (for text condensation)
 * 3. Ensure Supabase Storage bucket 'generated-images' allows audio files
 *
 * Cost estimation:
 * - OpenAI TTS: $0.015 / 1000 characters
 * - Claude condensation: $0.003 / 1000 tokens
 * - Total per 5-second narration: ~$0.001-0.002 (very affordable)
 *
 * Usage example:
 * ```
 * const response = await fetch('/api/generate-audio-tts', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     text: 'Découvrez les 3 tendances marketing incontournables de 2026',
 *     targetDuration: 5,
 *     voice: 'alloy'
 *   })
 * });
 *
 * const { audioUrl, condensedText } = await response.json();
 * ```
 */
