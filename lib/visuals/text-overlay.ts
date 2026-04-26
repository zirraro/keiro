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
  businessSummary?: string;     // dossier.summary — adds real context
  signatureOffer?: string;       // dossier.signature_offer
  recentNews?: string;           // top news headline if pillar=trends
  pillar?: string;
  format?: string;
  language?: 'fr' | 'en';
}): Promise<OverlayDecision> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { needsText: false };

  const lang = input.language || 'fr';
  const system = `You are an elite copy art director for premium social media visuals (luxury hospitality, fashion, beauté, gastronomie). You are NOT a generic punchline generator — your taste is sharp, your French (or English) writing is impeccable, and you know when silence beats noise.

Your single decision: does this image NEED a short text overlay to land harder, or is it already complete?

When YES (overlay amplifies):
- A genuine wordplay / double meaning ties the visual to the business reality (not a generic restaurant cliché — something specific to THIS business or THIS news angle if pillar=trends).
- The visual is beautiful but slightly ambiguous and a 3-8 word line clarifies the intent.
- The post would scroll past without text but stops the scroll WITH it.
- The line is memorable and brand-coherent.

When NO (silence is louder):
- The visual already tells the story (a perfectly plated dish doesn't need "Délicieux ✨").
- The hook belongs in the caption, not on the image.
- Restaurant hero dish, fleuriste close-up, beauty before-after — let the image breathe.
- The image is detailed / busy → overlay would clutter.

DEFAULT TO NO. Only say YES when the line is ACTUALLY good — better than 80% of overlays you see in the wild. If you're unsure, the answer is no.

If yes, the line MUST:
- Be 3-8 words MAX (~40 chars). Short = strong.
- Be in ${lang === 'fr' ? 'French (perfect French — no anglicisms unless intentional)' : 'English'}.
- Use the business REALITY (type + offer + sometimes news), not a clichéd template.
- Tie visual ↔ business in a way only THIS business could say.
- Have NO emoji, NO hashtag, NO punctuation overload.
- Position chosen for composition: top (above subject), bottom (below subject), center (over negative space).
- Tone: punchy (Helvetica bold) for restos/sport/agence; elegant (Georgia serif) for beauté/spa/boutiques luxe; playful (Comic-style) for kids/desserts/fun.

Return STRICT JSON:
{
  "needsText": false
} OR {
  "needsText": true,
  "text": "string",
  "position": "top|bottom|center",
  "tone": "punchy|elegant|playful"
}

JSON only — no preamble, no explanation, no markdown.`;

  const businessContext = [
    input.businessType && `Type: ${input.businessType}`,
    input.businessSummary && `Activité: ${input.businessSummary.substring(0, 200)}`,
    input.signatureOffer && `Offre signature: ${input.signatureOffer.substring(0, 150)}`,
  ].filter(Boolean).join('\n');

  const message = `=== POST ===
Hook : ${input.hook}
Caption (200 premiers char) : ${(input.caption || '').substring(0, 200)}
Pilier : ${input.pillar || ''}
Format : ${input.format || ''}

=== VISUEL ===
${(input.visualDescription || '').substring(0, 400)}

=== BUSINESS ===
${businessContext || 'Inconnu'}
${input.recentNews ? `\n=== ACTUALITÉ DU JOUR (pour pillar=trends) ===\n${input.recentNews.substring(0, 250)}\n` : ''}

Décide. JSON strict.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Sonnet 4: better French, sharper editorial taste, fewer
        // generic punchlines than Haiku. ~€0.015 per call vs €0.005.
        // Worth the bump because the overlay is what stops the scroll.
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 250,
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
