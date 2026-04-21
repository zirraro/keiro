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
    const { text, duration = 5, voice, user_id, language: overrideLanguage } = await req.json();

    if (!text) {
      return NextResponse.json(
        { ok: false, error: 'Texte manquant' },
        { status: 400 }
      );
    }

    // Resolve the client's communication language: explicit override,
    // else dossier lookup by user_id, else 'fr' for backward compat.
    let language: 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt' = 'fr';
    if (overrideLanguage && ['fr', 'en', 'es', 'de', 'it', 'pt'].includes(overrideLanguage)) {
      language = overrideLanguage;
    } else if (user_id) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const { data: d } = await admin.from('business_dossiers').select('communication_language').eq('user_id', user_id).maybeSingle();
        const v = String(d?.communication_language || '').toLowerCase().slice(0, 2);
        if (['fr', 'en', 'es', 'de', 'it', 'pt'].includes(v)) language = v as typeof language;
      } catch { /* keep 'fr' */ }
    }

    console.log('[GenerateNarration] Generating audio narration...');
    console.log('[GenerateNarration] Original text length:', text.length, 'chars');
    console.log('[GenerateNarration] Target duration:', duration, 'seconds');
    console.log('[GenerateNarration] Language:', language);

    // STEP 1: Condense text to fit target duration + match client language
    const targetWordCount = Math.floor(duration * 2.5);
    let scriptText = text.trim();

    if (scriptText.split(/\s+/).length > targetWordCount) {
      try {
        scriptText = await condenseText(text, targetWordCount, 'informative', language);
      } catch {
        scriptText = text.split(/\s+/).slice(0, targetWordCount).join(' ');
      }
    }

    console.log('[GenerateNarration] Script:', scriptText);

    // STEP 2: Generate audio with ElevenLabs TTS in the client's language
    const voiceId = voice || DEFAULT_VOICE_ID;
    const audioUrl = await generateAudioWithElevenLabs(scriptText, voiceId, language);
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
