/**
 * Optional text overlay on generated visuals.
 *
 * Two-step:
 *   1. decideTextOverlay() — Claude Haiku judges whether a punchline
 *      would amplify the post (jeu de mots, link business ↔ visual)
 *      and drafts the text upstream. Returns null when the image is
 *      strong enough on its own (avoids text spam).
 *   2. applyTextOverlay() — composites the text onto the image via
 *      Sharp (SVG layer) so Seedream never has to render text itself
 *      (it's bad at it). Smart position based on the chosen layout.
 *
 * Cost: ~€0.005 per decide call (Haiku, 200 tokens). Sharp compositing
 * is local CPU, free.
 */
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

export type OverlayDecision = {
  needsText: false;
} | {
  needsText: true;
  text: string;            // 3-8 words, max ~40 chars
  position: 'top' | 'bottom' | 'center';
  tone: 'punchy' | 'elegant' | 'playful';
};

/** Ask Claude whether a text overlay would help, and draft it. */
export async function decideTextOverlay(input: {
  hook: string;
  caption?: string;
  visualDescription?: string;
  businessType?: string;
  pillar?: string;
  format?: string;
  language?: 'fr' | 'en';
}): Promise<OverlayDecision> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { needsText: false };

  const lang = input.language || 'fr';
  const system = `You are a copy art director for social media visuals. Your job is to decide whether a SHORT punchy text overlay would amplify the impact of a generated image — or whether the image stands alone.

When to add text (overlay HELPS):
- A wordplay or pun naturally ties the visual to the business
- The image is striking but ambiguous (text disambiguates the hook)
- A short punchline (3-8 words) makes the viewer stop scrolling

When NOT to add text (image stands alone):
- The visual already tells the story clearly
- The hook is best read in the caption, not on the image
- A restaurant dish hero shot — the dish + caption already deliver
- The image is busy / detailed (overlay would clutter)

Default to NO TEXT. Only say yes when the punchline is GENUINELY impactful, not just decorative.

If yes:
- Text MUST be 3-8 words (~40 characters max), in ${lang === 'fr' ? 'French' : 'English'}
- Use the business type to find the punchline (e.g. florist + product photo: "Ne dis rien. Dis-le avec des fleurs." / restaurant + dish: "Une assiette qui parle pour elle.")
- NO emojis in the overlay text
- NO hashtags
- Choose position based on composition (top/bottom/center)
- Choose tone (punchy / elegant / playful) based on business

Return JSON only:
{
  "needsText": false
} OR {
  "needsText": true,
  "text": "string",
  "position": "top|bottom|center",
  "tone": "punchy|elegant|playful"
}`;

  const message = `Hook: ${input.hook}
Business: ${input.businessType || 'unknown'}
Pillar: ${input.pillar || ''}
Format: ${input.format || ''}
Visual: ${(input.visualDescription || '').substring(0, 300)}
Caption (first 200 chars): ${(input.caption || '').substring(0, 200)}

Decide. JSON only.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system,
        messages: [{ role: 'user', content: message }],
      }),
    });
    if (!res.ok) return { needsText: false };
    const data = await res.json();
    const txt = (data.content?.[0]?.text || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return { needsText: false };
    const parsed = JSON.parse(m[0]);
    if (!parsed.needsText) return { needsText: false };
    const cleanText = String(parsed.text || '').trim().substring(0, 60);
    if (cleanText.length < 3) return { needsText: false };
    return {
      needsText: true,
      text: cleanText,
      position: ['top', 'bottom', 'center'].includes(parsed.position) ? parsed.position : 'bottom',
      tone: ['punchy', 'elegant', 'playful'].includes(parsed.tone) ? parsed.tone : 'punchy',
    };
  } catch {
    return { needsText: false };
  }
}

/** Build an SVG overlay sized to the target image dimensions. */
function buildOverlaySvg(
  text: string,
  width: number,
  height: number,
  position: 'top' | 'bottom' | 'center',
  tone: 'punchy' | 'elegant' | 'playful',
): string {
  // Font choices per tone — kept to web-safe + free families likely
  // present in the Sharp/librsvg font cache on the VPS.
  const fontFamily = tone === 'elegant'
    ? 'Georgia, "Times New Roman", serif'
    : tone === 'playful'
      ? '"Comic Sans MS", "Marker Felt", sans-serif'
      : 'Helvetica, Arial, sans-serif';
  const weight = tone === 'elegant' ? 600 : 800;

  // Auto-size: scale font with the shorter side. Cap so 8-word
  // punchlines wrap reasonably.
  const baseFontSize = Math.round(Math.min(width, height) * 0.06);
  // If text is long (>30 chars), drop one notch.
  const fontSize = text.length > 30 ? Math.round(baseFontSize * 0.85) : baseFontSize;

  const padding = Math.round(width * 0.05);
  const lineHeight = Math.round(fontSize * 1.15);

  // Naive word-wrap to ~22-24 chars per line for readability.
  const maxCharsPerLine = Math.max(14, Math.floor(width / (fontSize * 0.55)));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxCharsPerLine) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);

  const blockHeight = lines.length * lineHeight;
  let yStart: number;
  if (position === 'top') {
    yStart = padding + fontSize;
  } else if (position === 'center') {
    yStart = Math.round((height - blockHeight) / 2) + fontSize;
  } else {
    // bottom
    yStart = height - padding - blockHeight + fontSize;
  }

  // Strong contrast: white text + dark drop shadow + thin dark stroke.
  // Works on any background (light or dark) without needing to sample
  // the underlying image.
  const tspans = lines.map((line, i) => `
    <tspan x="${width / 2}" y="${yStart + i * lineHeight}">${escapeXml(line)}</tspan>
  `).join('');

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${Math.round(fontSize * 0.06)}" />
      <feOffset dx="0" dy="${Math.round(fontSize * 0.04)}" result="offsetblur" />
      <feFlood flood-color="#000" flood-opacity="0.7" />
      <feComposite in2="offsetblur" operator="in" />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <text
    text-anchor="middle"
    font-family='${fontFamily}'
    font-size="${fontSize}"
    font-weight="${weight}"
    fill="#ffffff"
    stroke="#000000"
    stroke-width="${Math.round(fontSize * 0.04)}"
    paint-order="stroke fill"
    filter="url(#shadow)"
    style="letter-spacing: -0.5px;"
  >${tspans}</text>
</svg>`.trim();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Apply the overlay to a remote image URL and upload the result back
 * to Supabase storage. Returns the new permanent URL or null on
 * failure (caller falls back to the original image).
 */
export async function applyTextOverlay(
  imageUrl: string,
  decision: Extract<OverlayDecision, { needsText: true }>,
  postId: string,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const inputBuf = Buffer.from(arrayBuf);

    const meta = await sharp(inputBuf).metadata();
    const width = meta.width || 1080;
    const height = meta.height || 1080;

    const svg = buildOverlaySvg(decision.text, width, height, decision.position, decision.tone);
    const composited = await sharp(inputBuf)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 88 })
      .toBuffer();

    // Upload to Supabase storage
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const fileName = `text-overlay/${postId}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('generated-images')
      .upload(fileName, composited, { contentType: 'image/jpeg', upsert: true });
    if (error) {
      console.warn('[text-overlay] upload error:', error.message);
      return null;
    }
    const { data: pub } = supabase.storage.from('generated-images').getPublicUrl(fileName);
    return pub?.publicUrl || null;
  } catch (e: any) {
    console.warn('[text-overlay] composite failed:', e?.message);
    return null;
  }
}
