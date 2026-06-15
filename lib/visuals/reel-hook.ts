/**
 * Reel Hook Engine — give every reel a worked, scroll-stopping hook.
 *
 * Two pieces:
 *   1. generateReelHook() — writes a punchy 3-7 word hook using proven hook
 *      frameworks, biased by the client's OWN top-performing posts (first-party
 *      data — no scraping, ToS-safe, free). This is the "reverse-engineer the
 *      patterns, not the competitors" approach.
 *   2. overlayReelHook() — burns the hook as a text overlay on the first ~2.6s
 *      of the generated reel via ffmpeg drawtext (with fade in/out). Graceful:
 *      returns the original URL untouched on any failure, so it can never break
 *      publishing.
 *
 * ffmpeg / font / upload patterns mirror lib/audio/reel-audio-mux.ts.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

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

// Locate a Unicode-capable bold font for drawtext. drawtext needs an explicit
// fontfile. We probe the usual Linux/VPS paths; if none exists we skip the
// overlay rather than fail the publish.
function findFont(): string | null {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    'C:\\Windows\\Fonts\\arialbd.ttf',
  ];
  for (const f of candidates) {
    try { if (existsSync(f)) return f; } catch {}
  }
  return null;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Wrap a hook into <=2 short lines (drawtext does not auto-wrap). Keeps each
// line ~18 chars so it reads big and centered on a vertical reel.
function wrapHook(hook: string, perLine = 18): string {
  const words = hook.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine && cur) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, 3).join('\n');
}

/**
 * Generate a short reel hook (3-7 words) using proven frameworks, biased by the
 * client's own best-performing past hooks. Returns null on failure (caller then
 * skips the overlay — never blocks publishing).
 */
export async function generateReelHook(args: {
  topic: string;            // post subject / caption / visual_description
  platform: string;         // 'instagram' | 'tiktok'
  lang?: 'fr' | 'en';
  topPerformerHooks?: string[]; // client's own winning hooks (first-party)
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const lang = args.lang === 'en' ? 'English' : 'French';
  const winners = (args.topPerformerHooks || []).filter(Boolean).slice(0, 6);
  const winnersBlock = winners.length
    ? `\nThis account's OWN best-performing hooks (reverse-engineer what already works HERE — same energy/structure, fresh angle, never copy verbatim):\n- ${winners.join('\n- ')}`
    : '';
  try {
    const r = await new Anthropic({ apiKey }).messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 60,
      system: `You write the on-screen HOOK that opens a vertical ${args.platform} reel — the 0-2.5s text that stops the thumb. Output ONLY the hook, in ${lang}, 3 to 7 words, no quotes, no hashtag, no emoji, no period.

It must do ONE of these (rotate, pick what fits the topic best):
- Curiosity gap ("Ce détail change tout")
- Bold/contrarian claim ("Arrête de poster à 18h")
- Pattern interrupt / stop ("Personne ne te dira ça")
- Number/stakes ("3 erreurs qui tuent ton reach")
- POV / call-out ("Si ton commerce est vide à 14h")
Make it concrete to the topic. Punchy, spoken, human. Never generic ("Découvre nos services"). Never the word "IA".${winnersBlock}`,
      messages: [{ role: 'user', content: `Topic of this reel: "${args.topic.slice(0, 300)}"\n\nWrite the hook now.` }],
    });
    let hook = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    hook = hook.replace(/^["'«»]+|["'«».]+$/g, '').replace(/#\w+/g, '').trim();
    // Strip emojis defensively.
    hook = hook.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s{2,}/g, ' ').trim();
    if (hook.length < 3 || hook.length > 60) return hook.slice(0, 60) || null;
    return hook;
  } catch {
    return null;
  }
}

async function fetchBuffer(url: string, timeoutMs = 20_000): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

/**
 * Burn `hookText` onto the first ~2.6s of the reel (fade in/out, centered upper
 * third). Returns the new uploaded URL, or the original videoUrl on any failure.
 */
export async function overlayReelHook(args: {
  videoUrl: string;
  hookText: string;
  postId: string;
}): Promise<{ url: string; applied: boolean; reason?: string }> {
  const hook = (args.hookText || '').trim();
  if (!hook) return { url: args.videoUrl, applied: false, reason: 'no_hook' };
  const font = findFont();
  if (!font) return { url: args.videoUrl, applied: false, reason: 'no_font' };

  const tmpDir = path.join(os.tmpdir(), `reel-hook-${Date.now()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    const videoBuf = await fetchBuffer(args.videoUrl);
    if (!videoBuf) return { url: args.videoUrl, applied: false, reason: 'video_fetch_failed' };
    const videoPath = path.join(tmpDir, 'in.mp4');
    await fs.writeFile(videoPath, videoBuf);

    // Use textfile= to avoid drawtext escaping hell with French apostrophes
    // and accents (DejaVu/Liberation are Unicode-capable).
    const hookFile = path.join(tmpDir, 'hook.txt');
    await fs.writeFile(hookFile, wrapHook(hook), 'utf8');

    const outPath = path.join(tmpDir, 'out.mp4');
    const ffmpegBin = getFfmpegPath();
    const ff = (s: string) => s.replace(/\\/g, '/').replace(/:/g, '\\:'); // ffmpeg filter path escaping

    // drawtext: bold white text on a translucent black box, centered, upper
    // third, visible 0-2.6s with a 0.3s fade in and out.
    const drawtext = [
      `drawtext=textfile='${ff(hookFile)}'`,
      `fontfile='${ff(font)}'`,
      `fontcolor=white`,
      `fontsize=h/17`,
      `line_spacing=12`,
      `box=1:boxcolor=black@0.55:boxborderw=28`,
      `x=(w-text_w)/2`,
      `y=h*0.16`,
      `enable='between(t,0,2.6)'`,
      `alpha='if(lt(t,0.3),t/0.3,if(lt(t,2.3),1,if(lt(t,2.6),(2.6-t)/0.3,0)))'`,
    ].join(':');

    const cmd = `"${ffmpegBin}" -y -i "${videoPath}" -vf "${drawtext}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 -c:a copy "${outPath}"`;
    await execPromise(cmd, { timeout: 90_000, maxBuffer: 1024 * 1024 * 50 });

    const outBuf = await fs.readFile(outPath);
    if (outBuf.length < 5000) return { url: args.videoUrl, applied: false, reason: 'output_too_small' };

    const sb = admin();
    const objectPath = `reels-hook/${args.postId}-${Date.now()}.mp4`;
    const { error: upErr } = await sb.storage.from('business-assets').upload(objectPath, outBuf, { contentType: 'video/mp4', upsert: true });
    if (upErr) return { url: args.videoUrl, applied: false, reason: `upload_failed:${upErr.message.slice(0, 50)}` };
    const { data: pub } = sb.storage.from('business-assets').getPublicUrl(objectPath);
    return { url: pub?.publicUrl || args.videoUrl, applied: true };
  } catch (e: any) {
    return { url: args.videoUrl, applied: false, reason: `threw:${e?.message?.substring(0, 60)}` };
  } finally {
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
