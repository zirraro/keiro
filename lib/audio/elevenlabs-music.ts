/**
 * ElevenLabs Eleven Music API — Background music generation
 * Uses POST /v1/music with force_instrumental: true
 * Supports 3s to 5min (300,000ms) duration
 * Output: MP3 professional quality
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Music style prompts — detailed, genre-specific for Eleven Music
export const MUSIC_PROMPTS: Record<string, string> = {
  corporate: 'Clean corporate background music with soft piano chords, subtle ambient pads, and a light acoustic guitar. Professional, modern, and polished sound. Steady gentle rhythm at 90 BPM. Warm and reassuring tone, perfect for business presentations.',
  energetic: 'High-energy electronic pop track with punchy drums, driving bass synth, and bright synth leads. Festival-ready drop with build-up. 128 BPM, major key, euphoric and motivational. Think uplifting EDM meets pop anthem.',
  calm: 'Serene lo-fi ambient music with warm vinyl-crackle texture, soft Rhodes piano, gentle reverb pads, and distant wind chimes. Very slow tempo at 70 BPM. Meditative, peaceful, dreamy atmosphere. Like a sunset over the ocean.',
  inspiring: 'Cinematic inspirational track building from solo piano to full orchestral arrangement with soaring strings, French horns, and timpani. Emotional crescendo that gives goosebumps. 100 BPM, major key, hopeful and triumphant.',
  trendy: 'Viral TikTok-style beat with catchy melodic hook, bouncy 808 bass, crisp hi-hats, and a memorable synth riff that gets stuck in your head. Modern trap-pop hybrid at 130 BPM. Playful, confident, Gen-Z energy. Think trending sound that makes you want to create a challenge.',
};

/**
 * Generate background music using ElevenLabs Eleven Music API
 * POST /v1/music — real AI music generation, up to 5 minutes
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

  // Eleven Music: min 3s (3000ms), max 5min (300000ms)
  // Add 2s buffer to ensure music covers the full video
  const durationMs = Math.min(Math.max((targetDuration + 2) * 1000, 3000), 300000);

  console.log(`[ElevenLabs Music] Generating ${durationMs / 1000}s of "${style}" music via Eleven Music API...`);

  const response = await fetch('https://api.elevenlabs.io/v1/music', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      prompt: prompt,
      duration_ms: durationMs,
      force_instrumental: true,
      output_format: 'mp3_44100_128',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ElevenLabs Music] API error:', response.status, errorText);
    throw new Error(`ElevenLabs Music API error: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`[ElevenLabs Music] Generated: ${(buffer.byteLength / 1024).toFixed(0)} KB (${durationMs / 1000}s)`);

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
