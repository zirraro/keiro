import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/merge-audio-video
 * Fusionne un fichier audio dans une vidéo côté serveur via FFmpeg.
 *
 * Body:
 * - videoUrl: URL de la vidéo
 * - audioUrl: URL de l'audio (narration TTS)
 *
 * Returns:
 * - mergedUrl: URL de la vidéo fusionnée sur Supabase Storage
 */
export async function POST(req: NextRequest) {
  const id = randomUUID().slice(0, 8);
  const tmpDir = join(tmpdir(), `merge-${id}`);

  try {
    console.log(`[MergeAV-${id}] Starting audio+video merge...`);

    // Auth
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
    }

    const { videoUrl, audioUrl } = await req.json();

    if (!videoUrl || !audioUrl) {
      return NextResponse.json({ ok: false, error: 'videoUrl et audioUrl requis' }, { status: 400 });
    }

    console.log(`[MergeAV-${id}] Video: ${videoUrl.substring(0, 80)}...`);
    console.log(`[MergeAV-${id}] Audio: ${audioUrl.substring(0, 80)}...`);

    // Create temp directory
    await mkdir(tmpDir, { recursive: true });

    const videoPath = join(tmpDir, 'input.mp4');
    const audioPath = join(tmpDir, 'audio.mp3');
    const outputPath = join(tmpDir, 'merged.mp4');

    // Download video and audio in parallel
    console.log(`[MergeAV-${id}] Downloading files...`);
    const [videoRes, audioRes] = await Promise.all([
      fetch(videoUrl),
      fetch(audioUrl)
    ]);

    if (!videoRes.ok) throw new Error(`Download vidéo échoué: ${videoRes.status}`);
    if (!audioRes.ok) throw new Error(`Download audio échoué: ${audioRes.status}`);

    const [videoBuffer, audioBuffer] = await Promise.all([
      videoRes.arrayBuffer(),
      audioRes.arrayBuffer()
    ]);

    console.log(`[MergeAV-${id}] Video: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
    console.log(`[MergeAV-${id}] Audio: ${(audioBuffer.byteLength / 1024).toFixed(0)} KB`);

    await Promise.all([
      writeFile(videoPath, Buffer.from(videoBuffer)),
      writeFile(audioPath, Buffer.from(audioBuffer))
    ]);

    // Merge with FFmpeg (server-side)
    console.log(`[MergeAV-${id}] Merging with FFmpeg...`);
    const ffmpegPath = require('ffmpeg-static') as string;
    console.log(`[MergeAV-${id}] FFmpeg binary path: ${ffmpegPath}`);

    // Vérifier que le binaire existe
    const { existsSync } = require('fs');
    if (!ffmpegPath || !existsSync(ffmpegPath)) {
      console.error(`[MergeAV-${id}] FFmpeg binary NOT found at: ${ffmpegPath}`);
      throw new Error('FFmpeg binary introuvable sur le serveur');
    }
    console.log(`[MergeAV-${id}] ✅ FFmpeg binary found`);

    const ffmpeg = require('fluent-ffmpeg') as typeof import('fluent-ffmpeg');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .setFfmpegPath(ffmpegPath)
        .input(audioPath)
        .outputOptions([
          '-c:v', 'copy',       // Copy video stream (no re-encoding = fast)
          '-c:a', 'aac',        // Encode audio as AAC
          '-b:a', '128k',       // Audio bitrate
          '-map', '0:v:0',      // Video from first input
          '-map', '1:a:0',      // Audio from second input
          '-shortest',          // Stop when shortest stream ends
          '-movflags', '+faststart' // Web-optimized
        ])
        .output(outputPath)
        .on('start', (cmd: string) => {
          console.log(`[MergeAV-${id}] FFmpeg command:`, cmd);
        })
        .on('end', () => {
          console.log(`[MergeAV-${id}] ✅ FFmpeg merge complete`);
          resolve();
        })
        .on('error', (err: Error) => {
          console.error(`[MergeAV-${id}] ❌ FFmpeg error:`, err.message);
          reject(err);
        })
        .run();
    });

    // Read merged file
    const { readFile } = await import('fs/promises');
    const mergedBuffer = await readFile(outputPath);
    console.log(`[MergeAV-${id}] Merged file: ${(mergedBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Upload to Supabase Storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `merged-videos/${user.id}/${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(fileName, mergedBuffer, {
        contentType: 'video/mp4',
        upsert: false
      });

    if (uploadError) throw new Error(`Upload échoué: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    console.log(`[MergeAV-${id}] ✅ Uploaded to Supabase: ${publicUrl}`);

    // Cleanup temp files
    await Promise.all([
      unlink(videoPath).catch(() => {}),
      unlink(audioPath).catch(() => {}),
      unlink(outputPath).catch(() => {})
    ]);

    return NextResponse.json({
      ok: true,
      mergedUrl: publicUrl,
      videoSize: mergedBuffer.byteLength
    });

  } catch (error: any) {
    console.error(`[MergeAV-${id}] ❌ Error:`, error.message);

    // Cleanup on error
    await Promise.all([
      unlink(join(tmpDir, 'input.mp4')).catch(() => {}),
      unlink(join(tmpDir, 'audio.mp3')).catch(() => {}),
      unlink(join(tmpDir, 'merged.mp4')).catch(() => {})
    ]);

    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur de fusion audio/vidéo' },
      { status: 500 }
    );
  }
}
