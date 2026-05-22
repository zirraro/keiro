/**
 * Video hook intro — overlays a strong opening "card" on the first
 * 1.0-1.8s of an uploaded reel/video, tailored to the chosen network
 * and hook style.
 *
 * Why: a generated reel without a strong hook in frame 1 dies on the
 * FYP. Most clients don't know how to write a sharp 3-word opener —
 * Sonnet picks one based on the video's keyframe + business context,
 * and ffmpeg burns it in.
 *
 * Phase 1 (this file): intro overlay only — full-card hook for the
 * first ~1.5s, then the original video plays out. No transitions,
 * no audio remix yet (Phase 2).
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const execAsync = promisify(exec);

export type HookStyle =
  | 'three_word_punch'      // "3 mots qui frappent"
  | 'pov_opener'            // "POV: tu..." style hook
  | 'stat_carton'           // big number on full screen
  | 'clean_cut_intro'       // minimalist 1-line cold open
  | 'question_hook'         // "Et si je te disais que…" — opens with a curiosity-gap question
  | 'before_after'          // "Avant / Après" diptych — proof of transformation
  | 'red_arrow_callout'     // bright arrow + 1 word pointing at the subject — TikTok-native
  | 'storytime_opener'      // "Je vais te raconter…" — narrative storytelling intro
  | 'controversy_take'      // "Personne ne te dit que…" — bold contrarian take
  | 'quick_cut_montage';    // 0.5s × 3 flash cuts before the main video — TikTok algo loves it

export type Network = 'instagram' | 'tiktok' | 'linkedin';

const HOOK_STYLES: Record<HookStyle, { label: string; durationS: number; bgColor: string; fg: string; fontSize: number }> = {
  three_word_punch:  { label: '3-mots punch',  durationS: 1.4, bgColor: '#0c1a3a', fg: '#ffffff', fontSize: 96 },
  pov_opener:        { label: 'POV opener',    durationS: 1.6, bgColor: '#000000', fg: '#fcd34d', fontSize: 80 },
  stat_carton:       { label: 'Stat carton',   durationS: 1.5, bgColor: '#7c3aed', fg: '#ffffff', fontSize: 120 },
  clean_cut_intro:   { label: 'Clean cut',     durationS: 1.2, bgColor: 'transparent', fg: '#ffffff', fontSize: 72 },
  question_hook:     { label: 'Question piège',durationS: 1.7, bgColor: '#1e293b', fg: '#facc15', fontSize: 78 },
  before_after:      { label: 'Avant / Après', durationS: 1.5, bgColor: '#000000', fg: '#ffffff', fontSize: 84 },
  red_arrow_callout: { label: 'Flèche rouge',  durationS: 1.3, bgColor: 'transparent', fg: '#ef4444', fontSize: 92 },
  storytime_opener:  { label: 'Storytime',     durationS: 1.8, bgColor: '#0f172a', fg: '#f1f5f9', fontSize: 70 },
  controversy_take:  { label: 'Hot take',      durationS: 1.5, bgColor: '#7f1d1d', fg: '#fef3c7', fontSize: 88 },
  quick_cut_montage: { label: 'Quick-cut',     durationS: 1.5, bgColor: '#000000', fg: '#ffffff', fontSize: 96 },
};

export type HookText = {
  primary: string;     // big line, e.g. "Tu rates 80%."
  secondary?: string;  // smaller, e.g. "des conversions IG"
};

/** Use Sonnet to draft the hook text from a keyframe + brief. */
export async function draftHookText(input: {
  keyframeUrl: string;
  network: Network;
  style: HookStyle;
  businessType?: string;
  businessSummary?: string;
  language?: 'fr' | 'en';
}): Promise<HookText | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const lang = input.language || 'fr';

  const networkVoice = input.network === 'tiktok'
    ? 'TikTok FYP — punchy, slang OK, very direct'
    : input.network === 'linkedin'
      ? 'LinkedIn — pro, sharp, no slang, expert framing'
      : 'Instagram Reels — lifestyle, warm, conversational';

  const styleNotes: Record<HookStyle, string> = {
    three_word_punch:  'Exactly 3 words for primary line. No more.',
    pov_opener:        'Primary line MUST start with "POV:" or "POV :"',
    stat_carton:       'Primary line is a SHOCKING NUMBER + 1-2 words ("80% rate.", "+340%.").',
    clean_cut_intro:   'Primary line is a single short sentence (5-7 words max), zero extra punctuation.',
    question_hook:     'Primary line MUST be a question that opens a curiosity gap. Max 6 words. End with "?". Examples: "Et si je te disais que…?" "Pourquoi personne n\'en parle ?"',
    before_after:      'Primary line = "Avant" (1-2 words). Secondary line = "Après" (1-3 words). Format: stark contrast.',
    red_arrow_callout: 'Primary line is ONE punchy word + an action verb (TikTok-native arrow points at the subject). Max 3 words.',
    storytime_opener:  'Primary line starts with "Je vais te raconter…" or "Histoire vraie:" — narrative storytelling. Max 8 words.',
    controversy_take:  'Primary line is a contrarian statement. Starts with "Personne ne te dit que…" or "Vérité brutale:". Max 7 words.',
    quick_cut_montage: 'Primary line is 3 ultra-short words separated by " · " (each shown for 0.5s in the burn). E.g. "TESTE · AIME · REVIENT".',
  };
  const styleNote = styleNotes[input.style] || styleNotes.clean_cut_intro;

  const system = `You write opening hooks for short-form videos. Voice: ${networkVoice}. Style: ${styleNote}.

You see ONE keyframe from the video. Your job: write a hook text overlay that will burn into the FIRST 1.5 seconds and stop the scroll cold.

Rules:
- Language: ${lang === 'fr' ? 'French' : 'English'}.
- The primary line must connect to what's IN the keyframe AND to the business reality.
- The optional secondary line clarifies / lands the punch (≤ 6 words).
- NO emoji, NO hashtag, NO punctuation overload.
- Refuse generic openings ("Découvrez", "Bienvenue", "Voici"). Be specific to the image.
- If the keyframe gives you nothing actionable, return primary: "" so the caller knows to skip the hook.

Return STRICT JSON: { "primary": "...", "secondary": "..." } — secondary may be empty. JSON only.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 200,
        system,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: input.keyframeUrl } },
            { type: 'text', text: `Business: ${input.businessType || 'unknown'}\n${input.businessSummary ? `Activité: ${input.businessSummary.substring(0, 200)}\n` : ''}Network: ${input.network}\nStyle: ${input.style}\n\nWrite the hook. JSON.` },
          ],
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = (data.content?.[0]?.text || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const primary = String(parsed.primary || '').trim().slice(0, 80);
    if (primary.length < 2) return null;
    return {
      primary,
      secondary: parsed.secondary ? String(parsed.secondary).trim().slice(0, 60) : undefined,
    };
  } catch {
    return null;
  }
}

function escapeFfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/,/g, '\\,');
}

export type HookEnhancements = {
  captions?: boolean;
  crop?: 'keep' | '9:16' | '1:1' | '4:5';
  speed?: number;          // 1 | 1.1 | 1.25 | 1.5
  loudness?: 'keep' | 'normalize' | 'boost';
};

/**
 * Burn the hook intro on the front of the source video. Builds a card
 * (1.5s, full screen) using ffmpeg + drawtext, then concatenates with
 * the source. Returns the public URL of the result, or null on failure.
 *
 * `enhancements` lets the caller force a single-pass re-encode that also
 * crops to a target ratio, changes speed, normalizes loudness, etc.
 */
export async function applyVideoHook(input: {
  sourceVideoUrl: string;
  hook: HookText;
  style: HookStyle;
  network: Network;
  outputBaseId: string;
  enhancements?: HookEnhancements;
}): Promise<string | null> {
  const tmp = tmpdir();
  const localSource = join(tmp, `hk-src-${input.outputBaseId}.mp4`);
  const localHook = join(tmp, `hk-card-${input.outputBaseId}.mp4`);
  const localOut = join(tmp, `hk-out-${input.outputBaseId}.mp4`);
  const localList = join(tmp, `hk-list-${input.outputBaseId}.txt`);

  try {
    const res = await fetch(input.sourceVideoUrl);
    if (!res.ok) return null;
    await writeFile(localSource, Buffer.from(await res.arrayBuffer()));

    // Probe source for w/h/fps so the hook card matches dimensions.
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0:s=x "${localSource}"`,
      { timeout: 15000 },
    );
    const [wStr, hStr, fpsStr] = stdout.trim().split('x');
    const width = parseInt(wStr) || 1080;
    const height = parseInt(hStr) || 1920;
    // r_frame_rate is "30/1" → take the int
    const fps = (() => {
      const m = (fpsStr || '30/1').match(/(\d+)\/(\d+)/);
      return m ? Math.round(parseInt(m[1]) / Math.max(1, parseInt(m[2]))) : 30;
    })();

    const cfg = HOOK_STYLES[input.style];
    const dur = cfg.durationS;
    const fontSize = Math.round(cfg.fontSize * (Math.min(width, height) / 1080));
    const secondaryFontSize = Math.round(fontSize * 0.55);

    const primary = escapeFfText(input.hook.primary);
    const secondary = input.hook.secondary ? escapeFfText(input.hook.secondary) : '';
    const yPrimary = Math.round(height * 0.45);
    const ySecondary = Math.round(height * 0.55);

    // Build the hook card as a solid-color clip with drawtext.
    const drawPrimary = `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${primary}':fontcolor=${cfg.fg}:fontsize=${fontSize}:x=(w-tw)/2:y=${yPrimary}-th/2`;
    const drawSecondary = secondary
      ? `,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${secondary}':fontcolor=${cfg.fg}:fontsize=${secondaryFontSize}:x=(w-tw)/2:y=${ySecondary}-th/2`
      : '';
    const filter = `${drawPrimary}${drawSecondary}`;

    // Card: solid bg color, same WxH/fps/duration as source (or transparent overlay-on-black for clean_cut).
    const bg = cfg.bgColor === 'transparent' ? 'black' : cfg.bgColor;
    await execAsync(
      `ffmpeg -y -f lavfi -i "color=c=${bg}:s=${width}x${height}:r=${fps}:d=${dur}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p "${localHook}"`,
      { timeout: 30000 },
    );

    // Concat: hook card + source. When no enhancements are requested we
    // stream-copy (fast, lossless). When enhancements are present we
    // re-encode through a filter graph in a single pass.
    const enh = input.enhancements || {};
    const wantsReencode = (enh.crop && enh.crop !== 'keep')
      || (enh.speed && enh.speed !== 1)
      || (enh.loudness && enh.loudness !== 'keep');

    if (!wantsReencode) {
      await writeFile(localList, `file '${localHook}'\nfile '${localSource}'\n`);
      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${localList}" -c copy "${localOut}"`,
        { timeout: 60000 },
      );
    } else {
      // Crop expression — ffmpeg crop=w:h:x:y, centered.
      const cropExpr = (() => {
        if (!enh.crop || enh.crop === 'keep') return '';
        const [aw, ah] = enh.crop.split(':').map(Number);
        // min(w*ah/aw, h) gives the inscribed-rect height for target ratio.
        return `crop='min(iw*${ah}/${aw}\\,ih)*${aw}/${ah}':'min(iw*${ah}/${aw}\\,ih)':((iw-min(iw*${ah}/${aw}\\,ih)*${aw}/${ah})/2):((ih-min(iw*${ah}/${aw}\\,ih))/2)`;
      })();
      const speed = enh.speed && enh.speed !== 1 ? enh.speed : 1;
      // setpts for video, atempo (capped 0.5..2.0 per filter chain) for audio.
      const vSpeedExpr = speed !== 1 ? `setpts=PTS/${speed}` : '';
      const aSpeedExpr = speed !== 1 ? `atempo=${Math.min(2, Math.max(0.5, speed))}` : '';
      const aLoudnessExpr = enh.loudness === 'normalize'
        ? 'loudnorm=I=-16:LRA=11:TP=-1.5'
        : enh.loudness === 'boost'
          ? 'volume=1.41' // ~+3 dB
          : '';

      const vChain = [cropExpr, vSpeedExpr].filter(Boolean).join(',');
      const aChain = [aSpeedExpr, aLoudnessExpr].filter(Boolean).join(',');

      // concat → split into v/a → apply chains → encode.
      const filterParts: string[] = [
        '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[cv][ca]',
      ];
      if (vChain) filterParts.push(`[cv]${vChain}[vout]`); else filterParts.push('[cv]null[vout]');
      if (aChain) filterParts.push(`[ca]${aChain}[aout]`); else filterParts.push('[ca]anull[aout]');
      const filterComplex = filterParts.join(';');

      await execAsync(
        `ffmpeg -y -i "${localHook}" -i "${localSource}" -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k "${localOut}"`,
        { timeout: 120000 },
      );
    }

    // Upload to Supabase storage.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const buf = await readFile(localOut);
    const path = `video-hooks/${input.outputBaseId}-${Date.now()}.mp4`;
    const { error: upErr } = await supabase.storage
      .from('generated-images')
      .upload(path, buf, { contentType: 'video/mp4', upsert: true });
    if (upErr) {
      console.warn('[video-hook] upload failed:', upErr.message);
      return null;
    }
    const { data: pub } = supabase.storage.from('generated-images').getPublicUrl(path);
    return pub?.publicUrl || null;
  } catch (e: any) {
    console.warn('[video-hook] failed:', e?.message);
    return null;
  } finally {
    await unlink(localSource).catch(() => {});
    await unlink(localHook).catch(() => {});
    await unlink(localOut).catch(() => {});
    await unlink(localList).catch(() => {});
  }
}

export const HOOK_STYLE_META = HOOK_STYLES;
