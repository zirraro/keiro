import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { generateAudioWithElevenLabs, estimateAudioDuration, ELEVENLABS_VOICES, DEFAULT_VOICE_ID } from '@/lib/audio/elevenlabs-tts';
import { condenseText } from '@/lib/audio/condense-text';
import { checkCredits, deductCredits, isAdmin } from '@/lib/credits/server';
import { checkTtsQuota, logQuotaUsage } from '@/lib/credits/quotas';
import { isMarginSafe } from '@/lib/credits/margin';

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
      language: overrideLanguage,
    } = await req.json();

    // Plan-level TTS minutes quota (checked AFTER parsing so we know duration)
    if (!isAdminUser) {
      const ttsQ = await checkTtsQuota(user.id, Number(targetDuration) || 5);
      if (!ttsQ.allowed) {
        return NextResponse.json(
          { ok: false, error: ttsQ.message, quotaExceeded: true, reason: ttsQ.reason, limit: ttsQ.limit, plan: ttsQ.plan },
          { status: 429 }
        );
      }
      const margin = await isMarginSafe(user.id);
      if (!margin.safe) {
        return NextResponse.json(
          { ok: false, error: margin.message, marginBlocked: true, plan: margin.snapshot.plan, margin_pct: margin.snapshot.margin_pct },
          { status: 429 }
        );
      }
    }

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Texte manquant ou invalide' },
        { status: 400 }
      );
    }

    // Resolve client's communication language. Caller may override
    // explicitly (useful for admin tools); otherwise we read it from the
    // business_dossier so a French client's videos stay in French and
    // an English client's videos stay in English.
    // Important: this is the CLIENT's default language, not a
    // detected language from inbound messages — replies use the
    // mirror-the-prospect logic in languagePromptDirective.
    let language: 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt' = 'fr';
    if (overrideLanguage && ['fr', 'en', 'es', 'de', 'it', 'pt'].includes(overrideLanguage)) {
      language = overrideLanguage;
    } else {
      try {
        // Dynamic import to stay Edge-compatible.
        const { createClient } = await import('@supabase/supabase-js');
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const { data: d } = await admin.from('business_dossiers').select('communication_language').eq('user_id', user.id).maybeSingle();
        const v = String(d?.communication_language || '').toLowerCase().slice(0, 2);
        if (['fr', 'en', 'es', 'de', 'it', 'pt'].includes(v)) language = v as typeof language;
      } catch { /* default stays 'fr' */ }
    }

    // Validate voice ID
    const voiceId = ELEVENLABS_VOICES[voice] ? voice : DEFAULT_VOICE_ID;

    console.log('[GenerateAudioTTS] User:', user.id, 'Lang:', language);
    console.log('[GenerateAudioTTS] Text length:', text.length, 'characters');
    console.log('[GenerateAudioTTS] Target duration:', targetDuration, 'seconds');
    console.log('[GenerateAudioTTS] Voice:', voiceId, ELEVENLABS_VOICES[voiceId]?.name || 'unknown');

    // 1. Adapt text length to fit target duration
    const targetWords = Math.floor(targetDuration * 2.5 * speed);
    const currentWords = text.trim().split(/\s+/).length;

    console.log('[GenerateAudioTTS] Current words:', currentWords, '/ Target:', targetWords, `(${targetDuration}s)`);

    let finalText = text.trim();

    // Strip legacy translation hint prefix if present (from old UI).
    finalText = finalText.replace(/^\[TRADUIRE EN FRANÇAIS SI NÉCESSAIRE\]\s*/i, '');
    finalText = finalText.replace(/^\[TRANSLATE TO [A-Z]+\s+IF NEEDED\]\s*/i, '');

    // Run through condenseText when the source isn't already close to
    // the target word count OR when we suspect it's not in the client's
    // language (condenseText now translates + adapts in a single pass).
    const needsAdaptation = currentWords > targetWords * 1.2 || (currentWords < targetWords * 0.6 && targetDuration > 5);
    const preview = finalText.substring(0, 200);
    // Fast heuristic: only "looks wrong language" if we're targeting fr
    // and see no French diacritics, OR targeting en and see lots of
    // French diacritics. Not exhaustive, but keeps the condenser off
    // when the input is already clean.
    const looksMismatched = (language === 'fr'
        ? (!/[àâäéèêëïîôùûüÿçœæ]/i.test(preview) && /\b(the|and|your|with|you|for)\b/i.test(preview))
        : (language === 'en' && /[àâäéèêëïîôùûüÿçœæ]/i.test(preview)));

    if (needsAdaptation || looksMismatched) {
      console.log(`[GenerateAudioTTS] Running condenseText (lang=${language}, ${currentWords} → ~${targetWords} words)...`);
      try {
        finalText = await condenseText(finalText, targetWords, 'informative', language);
        console.log(`[GenerateAudioTTS] condenseText done:`, finalText.substring(0, 100) + '...');
      } catch (error: any) {
        console.error(`[GenerateAudioTTS] condenseText failed:`, error);
      }
    }

    // 2. Generate audio with ElevenLabs TTS in the client's language
    console.log(`[GenerateAudioTTS] Generating audio with ElevenLabs (language: ${language})...`);
    const audioUrl = await generateAudioWithElevenLabs(finalText, voiceId, language);

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
      logQuotaUsage(user.id, 'tts_generated', { seconds: Number(targetDuration) || 5, voice }).catch(() => {});
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
