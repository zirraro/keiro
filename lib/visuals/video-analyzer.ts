/**
 * Video upload analyzer.
 *
 * Extracts a representative keyframe via ffmpeg, runs Claude Vision
 * on it to get the same shape of ai_analysis we already have for
 * images, plus video-specific metadata (duration, has_audio).
 *
 * Used by the upload pipeline so videos uploaded to agent workspaces
 * become first-class assets that Léna can reference in generations
 * and Ami can include in montages.
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const execAsync = promisify(exec);

export type VideoAnalysis = {
  duration_sec?: number;
  has_audio?: boolean;
  width?: number;
  height?: number;
  keyframe_url?: string;
  // Same shape as image ai_analysis so the rest of the pipeline can treat
  // videos like rich photos
  summary?: string;
  content_type?: 'video' | 'reel' | 'demo' | 'testimonial' | 'behind_scenes' | 'other';
  visible_elements?: string[];
  tone?: string;
  suggested_use?: string;
  relevant_agents?: string[];
};

/**
 * Probe video metadata via ffprobe (duration, dimensions, audio stream).
 */
async function probeVideo(filePath: string): Promise<{
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries stream=codec_type,width,height,duration -of json "${filePath}"`,
      { timeout: 15000 },
    );
    const data = JSON.parse(stdout);
    const streams = data.streams || [];
    const video = streams.find((s: any) => s.codec_type === 'video');
    const audio = streams.find((s: any) => s.codec_type === 'audio');
    return {
      duration: video?.duration ? parseFloat(video.duration) : undefined,
      width: video?.width,
      height: video?.height,
      hasAudio: !!audio,
    };
  } catch (e: any) {
    console.warn('[video-analyzer] probe failed:', e?.message);
    return {};
  }
}

/**
 * Extract one keyframe at ~25% of the video's runtime (more representative
 * than the very first frame which is often a black/title card).
 */
async function extractKeyframe(filePath: string, outPath: string, atSeconds: number): Promise<boolean> {
  try {
    await execAsync(
      `ffmpeg -y -ss ${atSeconds} -i "${filePath}" -frames:v 1 -q:v 2 "${outPath}"`,
      { timeout: 20000 },
    );
    return true;
  } catch (e: any) {
    console.warn('[video-analyzer] keyframe extract failed:', e?.message);
    return false;
  }
}

/**
 * Full analysis pipeline. Downloads the video, probes, extracts a
 * keyframe, uploads keyframe to storage, runs Claude Vision, returns
 * VideoAnalysis. Cleans up local temp files.
 */
export async function analyzeVideo(input: {
  videoUrl: string;
  uploadId: string;
  agentId: string;
}): Promise<VideoAnalysis | null> {
  const tmp = tmpdir();
  const localVideo = join(tmp, `kv-${input.uploadId}.mp4`);
  const localFrame = join(tmp, `kv-${input.uploadId}.jpg`);

  try {
    // Download video
    const res = await fetch(input.videoUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(localVideo, buf);

    // Probe
    const meta = await probeVideo(localVideo);
    const at = Math.max(0.5, Math.min((meta.duration || 5) * 0.25, 8));

    // Keyframe
    const ok = await extractKeyframe(localVideo, localFrame, at);
    if (!ok) {
      return {
        duration_sec: meta.duration,
        width: meta.width,
        height: meta.height,
        has_audio: meta.hasAudio,
        content_type: 'video',
        summary: 'Video metadata only — keyframe extraction failed',
      };
    }

    // Upload keyframe to Supabase storage
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const frameBuf = await import('node:fs/promises').then(fs => fs.readFile(localFrame));
    const framePath = `video-keyframes/${input.uploadId}.jpg`;
    await supabase.storage.from('generated-images').upload(framePath, frameBuf, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    const { data: pub } = supabase.storage.from('generated-images').getPublicUrl(framePath);
    const keyframeUrl = pub?.publicUrl;

    // Claude Vision on keyframe
    let visionAnalysis: Partial<VideoAnalysis> = {};
    if (keyframeUrl && process.env.ANTHROPIC_API_KEY) {
      try {
        const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 400,
            system: `Analyse this keyframe from a video uploaded to an agent workspace. Return STRICT JSON describing the video's likely content based on the frame:
{
  "summary": "1 sentence describing the video subject (in French)",
  "content_type": "video|reel|demo|testimonial|behind_scenes|other",
  "visible_elements": ["3-6 visible things"],
  "tone": "1-2 words: chic, gritty, playful, minimal, etc",
  "suggested_use": "1 sentence — how could this video power a social post (in French)",
  "relevant_agents": ["content"]
}
JSON only.`,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'url', url: keyframeUrl } },
                { type: 'text', text: 'Analyse this video keyframe. JSON.' },
              ],
            }],
          }),
        });
        if (visionRes.ok) {
          const data = await visionRes.json();
          const txt = (data.content?.[0]?.text || '').trim();
          const m = txt.match(/\{[\s\S]*\}/);
          if (m) visionAnalysis = JSON.parse(m[0]);
        }
      } catch (e: any) {
        console.warn('[video-analyzer] vision failed:', e?.message);
      }
    }

    return {
      duration_sec: meta.duration,
      width: meta.width,
      height: meta.height,
      has_audio: meta.hasAudio,
      keyframe_url: keyframeUrl,
      ...visionAnalysis,
    };
  } catch (e: any) {
    console.warn('[video-analyzer] failed:', e?.message);
    return null;
  } finally {
    // Cleanup
    await unlink(localVideo).catch(() => {});
    await unlink(localFrame).catch(() => {});
  }
}
