/**
 * ElevenLabs Text-to-Speech (TTS) Helper
 *
 * Generates audio narration from text using ElevenLabs API
 * Model: eleven_multilingual_v2 (supports French)
 * Output: MP3 44100Hz 128kbps
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ElevenLabs default voices — latest generation, best for multilingual/French
export const ELEVENLABS_VOICES: Record<string, { name: string; label: string; description: string; gender: 'female' | 'male' }> = {
  'pFZP5JQG7iQjIQuC4Bku': { name: 'Lily', label: 'Femme douce', description: 'Voix féminine veloutée et élégante', gender: 'female' },
  'EXAVITQu4vr4xnSDxMaL': { name: 'Sarah', label: 'Femme naturelle', description: 'Voix féminine mature et rassurante', gender: 'female' },
  'Xb7hH8MSUJpSbSDYk0k2': { name: 'Alice', label: 'Femme claire', description: 'Voix féminine claire et engageante', gender: 'female' },
  'cgSgspJ2msm6clMCkdW9': { name: 'Jessica', label: 'Femme pétillante', description: 'Voix féminine chaleureuse et lumineuse', gender: 'female' },
  'JBFqnCBsd6RMkjVDRZzb': { name: 'George', label: 'Homme narrateur', description: 'Voix masculine captivante, style storytelling', gender: 'male' },
  'onwK4e9ZLuTAKqWW03F9': { name: 'Daniel', label: 'Homme posé', description: 'Voix masculine stable et professionnelle', gender: 'male' },
  'nPczCjzI2devNBz1zQrb': { name: 'Brian', label: 'Homme profond', description: 'Voix masculine grave et réconfortante', gender: 'male' },
  'cjVigY5qzO86Huf0OWal': { name: 'Eric', label: 'Homme fluide', description: 'Voix masculine douce et de confiance', gender: 'male' },
};

export const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'; // Daniel — steady, natural

/**
 * Generate audio from text using ElevenLabs TTS
 *
 * @param text - Text to convert to speech
 * @param voiceId - ElevenLabs voice ID
 * @param speed - Speech speed (not directly supported, we use stability/similarity instead)
 * @returns Public URL of generated MP3 file in Supabase Storage
 */
export async function generateAudioWithElevenLabs(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
  languageCode: string = 'fr',
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  console.log('[ElevenLabs TTS] Generating audio for text:', text.substring(0, 50) + '...');
  console.log('[ElevenLabs TTS] Voice ID:', voiceId);

  // 1. Generate audio via ElevenLabs API
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      output_format: 'mp3_44100_128',
      voice_settings: {
        stability: 0.4,        // Lower = more expressive/natural variation
        similarity_boost: 0.85, // High = consistent voice identity
        style: 0.35,           // Higher = more emotional expressiveness
        use_speaker_boost: true,
      },
      language_code: languageCode,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ElevenLabs TTS] API error:', response.status, errorText);
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  console.log('[ElevenLabs TTS] Audio generated, converting to buffer...');

  // 2. Convert response to buffer
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const audioSize = buffer.byteLength;

  console.log('[ElevenLabs TTS] Audio buffer size:', (audioSize / 1024).toFixed(2), 'KB');

  // 3. Upload to Supabase Storage
  const supabase = createClient(supabaseUrl, supabaseKey);

  const timestamp = Date.now();
  const fileName = `narration-${timestamp}.mp3`;
  const storagePath = `audio-narrations/${fileName}`;

  console.log('[ElevenLabs TTS] Uploading to Supabase Storage:', storagePath);

  const { error: uploadError } = await supabase.storage
    .from('generated-images')
    .upload(storagePath, buffer, {
      contentType: 'audio/mpeg',
      upsert: false,
    });

  if (uploadError) {
    console.error('[ElevenLabs TTS] Upload failed:', uploadError);
    throw new Error(`Failed to upload audio: ${uploadError.message}`);
  }

  // 4. Get public URL
  const { data: urlData } = supabase.storage
    .from('generated-images')
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;
  console.log('[ElevenLabs TTS] Audio uploaded:', publicUrl);

  return publicUrl;
}

/**
 * Get estimated duration of text narration
 * Rule of thumb: ~2.5 words per second at normal speed
 */
export function estimateAudioDuration(text: string, speed: number = 1.0): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerSecond = 2.5 * speed;
  return Math.ceil(words / wordsPerSecond);
}
