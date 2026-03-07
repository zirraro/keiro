/**
 * ElevenLabs Sound Generation for background music
 * Uses the Sound Generation API to create background music from text descriptions
 * Max duration per generation: 22 seconds (loop for longer videos)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Music style prompts optimized for ElevenLabs Sound Generation
export const MUSIC_PROMPTS: Record<string, string> = {
  corporate: 'Soft corporate background music, clean piano and subtle strings, professional and modern, steady gentle rhythm, no vocals',
  energetic: 'Upbeat energetic electronic background music, dynamic drums and synths, motivational and driving rhythm, no vocals',
  calm: 'Calm ambient background music, soft piano with gentle pads, relaxing and peaceful atmosphere, slow tempo, no vocals',
  inspiring: 'Inspiring cinematic background music, emotional strings and piano, uplifting crescendo, hopeful and warm, no vocals',
  trendy: 'Modern trendy lo-fi hip hop background music, chill beats with vinyl crackle, relaxed jazzy chords, no vocals',
};

/**
 * Generate background music using ElevenLabs Sound Generation API
 * For videos > 22s, generates a 22s loop
 */
export async function generateBackgroundMusic(
  style: string,
  targetDuration: number,
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const prompt = MUSIC_PROMPTS[style];
  if (!prompt) {
    throw new Error(`Unknown music style: ${style}`);
  }

  // ElevenLabs Sound Generation max is 22s
  const genDuration = Math.min(targetDuration, 22);

  console.log(`[ElevenLabs Music] Generating ${genDuration}s of "${style}" music...`);

  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: genDuration,
      prompt_influence: 0.5,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ElevenLabs Music] API error:', response.status, errorText);
    throw new Error(`ElevenLabs Sound Generation error: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`[ElevenLabs Music] Generated: ${(buffer.byteLength / 1024).toFixed(0)} KB`);

  // Upload to Supabase Storage
  const supabase = createClient(supabaseUrl, supabaseKey);
  const fileName = `background-music/${Date.now()}-${style}.mp3`;

  const { error: uploadError } = await supabase.storage
    .from('generated-images')
    .upload(fileName, buffer, { contentType: 'audio/mpeg', upsert: false });

  if (uploadError) {
    throw new Error(`Failed to upload music: ${uploadError.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('generated-images')
    .getPublicUrl(fileName);

  console.log(`[ElevenLabs Music] Uploaded: ${publicUrl}`);
  return publicUrl;
}
