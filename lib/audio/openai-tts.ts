/**
 * OpenAI Text-to-Speech (TTS) Helper
 *
 * Generates audio narration from text using OpenAI's TTS API
 * Cost: $0.015 / 1000 characters (~$0.001 per 5-second narration)
 * Speed: 2-5 seconds per generation
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Generate audio from text using OpenAI TTS
 *
 * @param text - Text to convert to speech (max 4096 characters)
 * @param voice - Voice to use ('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer')
 * @param speed - Speed of speech (0.25 to 4.0, default 1.0)
 * @returns Public URL of generated MP3 file in Supabase Storage
 */
export async function generateAudioWithOpenAI(
  text: string,
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'alloy',
  speed: number = 1.0
): Promise<string> {
  console.log('[OpenAI TTS] Generating audio for text:', text.substring(0, 50) + '...');
  console.log('[OpenAI TTS] Voice:', voice, 'Speed:', speed);

  // 1. Generate audio via OpenAI TTS API
  const mp3Response = await openai.audio.speech.create({
    model: 'tts-1', // 'tts-1' is faster, 'tts-1-hd' is higher quality
    voice: voice,
    input: text,
    speed: speed,
  });

  console.log('[OpenAI TTS] Audio generated, converting to buffer...');

  // 2. Convert response to buffer
  const buffer = Buffer.from(await mp3Response.arrayBuffer());
  const audioSize = buffer.byteLength;

  console.log('[OpenAI TTS] Audio buffer size:', (audioSize / 1024).toFixed(2), 'KB');

  // 3. Upload to Supabase Storage
  const supabase = createClient(supabaseUrl, supabaseKey);

  const timestamp = Date.now();
  const fileName = `narration-${timestamp}.mp3`;
  const storagePath = `audio-narrations/${fileName}`;

  console.log('[OpenAI TTS] Uploading to Supabase Storage:', storagePath);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('generated-images')
    .upload(storagePath, buffer, {
      contentType: 'audio/mpeg',
      upsert: false,
    });

  if (uploadError) {
    console.error('[OpenAI TTS] Upload failed:', uploadError);
    throw new Error(`Failed to upload audio: ${uploadError.message}`);
  }

  // 4. Get public URL
  const { data: urlData } = supabase.storage
    .from('generated-images')
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;
  console.log('[OpenAI TTS] ✅ Audio uploaded:', publicUrl);

  return publicUrl;
}

/**
 * Get estimated duration of text narration
 * Rule of thumb: ~2.5 words per second at normal speed
 *
 * @param text - Text to estimate duration for
 * @param speed - Speech speed multiplier (default 1.0)
 * @returns Estimated duration in seconds
 */
export function estimateAudioDuration(text: string, speed: number = 1.0): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerSecond = 2.5 * speed;
  return Math.ceil(words / wordsPerSecond);
}
