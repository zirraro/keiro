import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

/**
 * POST /api/generate-narration
 * Generate audio narration for TikTok video from news text
 *
 * Body:
 * - text: Original news text
 * - duration: Target duration in seconds (default: 5)
 *
 * Returns:
 * - audioUrl: URL of generated audio file
 * - script: Condensed script text used for narration
 */
export async function POST(req: NextRequest) {
  try {
    const { text, duration = 5 } = await req.json();

    if (!text) {
      return NextResponse.json(
        { ok: false, error: 'Texte manquant' },
        { status: 400 }
      );
    }

    console.log('[GenerateNarration] Generating audio narration...');
    console.log('[GenerateNarration] Original text length:', text.length, 'chars');
    console.log('[GenerateNarration] Target duration:', duration, 'seconds');

    // STEP 1: Condense text to fit duration using Claude API
    // Average speaking rate: ~150 words/minute = 2.5 words/second
    const targetWordCount = Math.floor(duration * 2.5);
    console.log('[GenerateNarration] Target word count:', targetWordCount, 'words');

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const condensedScript = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Condense this news text into a ${targetWordCount}-word narration script for a ${duration}-second TikTok video. Keep it engaging and natural for voice narration. Output ONLY the script text, no commentary.

Original text:
${text}

Script (${targetWordCount} words max):`
        }
      ]
    });

    const scriptText = condensedScript.content[0].type === 'text'
      ? condensedScript.content[0].text.trim()
      : text; // Fallback to original if API fails

    console.log('[GenerateNarration] Condensed script:', scriptText);
    console.log('[GenerateNarration] Script word count:', scriptText.split(' ').length);

    // STEP 2: Generate audio with OpenAI TTS
    const openAIKey = process.env.OPENAI_API_KEY;
    if (!openAIKey) {
      console.warn('[GenerateNarration] OPENAI_API_KEY not configured, returning script only');
      return NextResponse.json({
        ok: true,
        audioUrl: null,
        script: scriptText,
        requiresTTS: true,
        message: 'OpenAI TTS not configured. Please set OPENAI_API_KEY environment variable.'
      });
    }

    console.log('[GenerateNarration] Generating TTS audio with OpenAI...');
    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1', // Fast model (tts-1-hd for higher quality)
        voice: 'nova', // Female voice (alloy, echo, fable, onyx, nova, shimmer)
        input: scriptText,
        speed: 1.0
      })
    });

    if (!ttsResponse.ok) {
      const error = await ttsResponse.text();
      console.error('[GenerateNarration] OpenAI TTS failed:', error);
      throw new Error(`OpenAI TTS failed: ${error}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    console.log('[GenerateNarration] TTS audio generated, size:', (audioBuffer.byteLength / 1024).toFixed(2), 'KB');

    // STEP 3: Upload to Supabase Storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const timestamp = Date.now();
    const fileName = `narration-${timestamp}.mp3`;
    const storagePath = `tiktok-narrations/${fileName}`;

    console.log('[GenerateNarration] Uploading audio to Supabase Storage:', storagePath);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(storagePath, Buffer.from(audioBuffer), {
        contentType: 'audio/mpeg',
        upsert: false
      });

    if (uploadError) {
      console.error('[GenerateNarration] Supabase upload failed:', uploadError);
      throw new Error(`Failed to upload audio: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('generated-images')
      .getPublicUrl(storagePath);

    const audioUrl = urlData.publicUrl;
    console.log('[GenerateNarration] ✅ Audio saved to Supabase:', audioUrl);

    return NextResponse.json({
      ok: true,
      audioUrl,
      script: scriptText,
      duration: duration,
      audioSize: audioBuffer.byteLength
    });

  } catch (error: any) {
    console.error('[GenerateNarration] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la génération audio' },
      { status: 500 }
    );
  }
}
