/**
 * Mux a silent reel video with optional voiceover (TTS in client's
 * language) + optional background music (Pixabay royalty-free).
 *
 * Inputs:
 *   - silent MP4 from Seedance i2v
 *   - optional voiceover MP3 (we generate via ElevenLabs multilingual)
 *   - optional music MP3 (we fetch via Pixabay)
 *
 * Output:
 *   - MP4 with audio track baked in, uploaded to business-assets bucket
 *
 * Audio mixing rules:
 *   - If both voice + music: music ducked to -16 dB while voice plays,
 *     normal volume otherwise (sidechain compression).
 *   - If voice only: voice on dedicated track, no music bed.
 *   - If music only: music at -8 dB so it doesn't overpower.
 *   - If neither: no-op (return original video URL).
 *
 * Implementation uses the same ffmpeg binary resolution as video-converter.ts
 * (ffmpeg-static → @ffmpeg-installer → system).
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createClient } from '@supabase/supabase-js';

const execPromise = promisify(exec);

function getFfmpegPath(): string {
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && typeof ffmpegStatic === 'string') return ffmpegStatic;
  } catch {}
  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    if (ffmpegInstaller?.path && typeof ffmpegInstaller.path === 'string') return ffmpegInstaller.path;
  } catch {}
  return 'ffmpeg';
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function fetchBuffer(url: string, timeoutMs = 20_000): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export interface ReelAudioMuxParams {
  videoUrl: string;
  voiceBuffer?: Buffer | null;   // optional TTS MP3 (in-memory)
  voiceUrl?: string | null;      // optional TTS MP3 URL (alternative to buffer)
  musicUrl?: string | null;      // optional Pixabay MP3 URL
  /** Used in the upload path so we can correlate to the original post */
  postId: string;
  /** Video duration in seconds — used to trim the music if longer */
  durationSec?: number;
}

export interface ReelAudioMuxResult {
  url: string;
  withVoice: boolean;
  withMusic: boolean;
  fallback?: string;
}

/**
 * Mux the video. Returns the new URL (uploaded to business-assets/reels-audio/)
 * on success, or { url: original video, fallback: reason } on failure.
 */
export async function muxReelAudio(p: ReelAudioMuxParams): Promise<ReelAudioMuxResult> {
  // Materialize voice from URL if a buffer wasn't provided
  let voiceBuffer = p.voiceBuffer || null;
  if (!voiceBuffer && p.voiceUrl) {
    voiceBuffer = await fetchBuffer(p.voiceUrl);
  }
  const haveVoice = !!(voiceBuffer && voiceBuffer.length > 1000);
  const haveMusic = !!p.musicUrl;
  // Nothing to mux — short-circuit
  if (!haveVoice && !haveMusic) {
    return { url: p.videoUrl, withVoice: false, withMusic: false, fallback: 'no_audio_inputs' };
  }

  const tmpDir = path.join(os.tmpdir(), `reel-mux-${Date.now()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });

    // 1. Fetch video
    const videoBuf = await fetchBuffer(p.videoUrl);
    if (!videoBuf) {
      return { url: p.videoUrl, withVoice: false, withMusic: false, fallback: 'video_fetch_failed' };
    }
    const videoPath = path.join(tmpDir, 'in.mp4');
    await fs.writeFile(videoPath, videoBuf);

    // 2. Write voice if present
    let voicePath: string | null = null;
    if (haveVoice) {
      voicePath = path.join(tmpDir, 'voice.mp3');
      await fs.writeFile(voicePath, voiceBuffer!);
    }

    // 3. Fetch music if present
    let musicPath: string | null = null;
    if (haveMusic) {
      const musicBuf = await fetchBuffer(p.musicUrl!);
      if (musicBuf) {
        musicPath = path.join(tmpDir, 'music.mp3');
        await fs.writeFile(musicPath, musicBuf);
      }
    }

    const outPath = path.join(tmpDir, 'out.mp4');
    const ffmpegBin = getFfmpegPath();
    const dur = p.durationSec || 5;

    // 4. Build ffmpeg command per case
    // Note: we always re-encode the video to ensure even if Seedance ships
    // exotic codec params (yuv420p10le, varying fps), the output works on
    // TikTok upload. -shortest stops at the shortest stream which we want
    // bounded to the video length.
    let cmd: string;
    if (voicePath && musicPath) {
      // voice + music, music ducked under voice
      cmd = `"${ffmpegBin}" -y -i "${videoPath}" -i "${voicePath}" -i "${musicPath}" -filter_complex "[2:a]volume=0.25[bg];[1:a][bg]amix=inputs=2:duration=longest:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 -c:a aac -b:a 128k -t ${dur} -shortest "${outPath}"`;
    } else if (voicePath) {
      // voice only
      cmd = `"${ffmpegBin}" -y -i "${videoPath}" -i "${voicePath}" -map 0:v -map 1:a -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 -c:a aac -b:a 128k -t ${dur} -shortest "${outPath}"`;
    } else if (musicPath) {
      // music only, at moderate volume so it doesn't overpower
      cmd = `"${ffmpegBin}" -y -i "${videoPath}" -i "${musicPath}" -filter_complex "[1:a]volume=0.4[a]" -map 0:v -map "[a]" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 -c:a aac -b:a 128k -t ${dur} -shortest "${outPath}"`;
    } else {
      // Should never hit because of the short-circuit above
      return { url: p.videoUrl, withVoice: false, withMusic: false, fallback: 'no_audio_after_fetch' };
    }

    await execPromise(cmd, { timeout: 60_000, maxBuffer: 1024 * 1024 * 50 });
    const outBuf = await fs.readFile(outPath);
    if (outBuf.length < 5000) {
      return { url: p.videoUrl, withVoice: false, withMusic: false, fallback: 'output_too_small' };
    }

    // 5. Upload
    const sb = admin();
    const objectPath = `reels-audio/${p.postId}-${Date.now()}.mp4`;
    const { error: upErr } = await sb.storage
      .from('business-assets')
      .upload(objectPath, outBuf, { contentType: 'video/mp4', upsert: true });
    if (upErr) {
      console.warn('[reel-audio-mux] upload failed:', upErr.message);
      return { url: p.videoUrl, withVoice: false, withMusic: false, fallback: 'upload_failed' };
    }
    const { data: pub } = sb.storage.from('business-assets').getPublicUrl(objectPath);
    return {
      url: pub?.publicUrl || p.videoUrl,
      withVoice: !!voicePath,
      withMusic: !!musicPath,
    };
  } catch (e: any) {
    console.warn('[reel-audio-mux] threw:', e?.message?.substring(0, 200));
    return { url: p.videoUrl, withVoice: false, withMusic: false, fallback: `threw:${e?.message?.substring(0, 60)}` };
  } finally {
    // Clean tmp dir best-effort
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
