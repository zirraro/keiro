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

export type OverlayPosition =
  | 'top'           // top center, classic ad
  | 'bottom'        // bottom center, classic
  | 'center'        // centered over negative space
  | 'top-left'      // editorial corner
  | 'bottom-right'  // signature corner
  | 'left-strip'    // left vertical strip
  | 'right-strip';  // right vertical strip

export type OverlayStyle =
  | 'white-shadow'      // white text + dark shadow (any background)
  | 'dark-on-light'     // dark text on a light translucent panel
  | 'light-on-dark'     // light text on a dark translucent panel
  | 'accent-bar'        // accent-colored side bar with light text
  | 'outline-only';     // outlined text, transparent fill (lifestyle/editorial)

export type OverlayTone = 'punchy' | 'elegant' | 'playful';

export type OverlayDecision = {
  needsText: false;
} | {
  needsText: true;
  text: string;            // 3-8 words, max ~40 chars
  position: OverlayPosition;
  tone: OverlayTone;
  style?: OverlayStyle;    // optional, default chosen from tone
  accentColor?: string;    // optional hex (e.g. '#FF3B6E') for accent-bar style
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
- The line creates a STRONG, NON-OBVIOUS link between business reality and a current news angle (when pillar=trends, this is your bread and butter — but make it sharp, not banal).
- A genuine wordplay / double meaning that ONLY this business could write.
- The visual is beautiful but ambiguous, and a 3-8 word line clarifies what's really at stake.
- The post would scroll past silent but the overlay stops the thumb cold.

When NO (silence is louder):
- The visual already tells the story (a perfectly plated dish doesn't need "Délicieux ✨").
- The hook belongs in the caption, not on the image — you'd just be shouting it.
- Restaurant hero dish, fleuriste close-up, beauty before-after — let the image breathe.
- The image is detailed / busy → overlay would clutter.
- You'd write something generic ("Tradition & Modernité", "Le goût du vrai") — DON'T.
- The line you'd write is just the hook with the same energy → caption already does the job.

CRITICAL CALIBRATION: Across 100 posts in a typical month for ONE business, no more than ~25-30 should have an overlay. If every post has one, the feed becomes a billboard. DEFAULT TO NO. Only YES when the line is actually exceptional — better than 90% of overlays you see in the wild. If you're unsure, the answer is no. If the line you'd write is "just OK", the answer is no.

If yes, the line MUST:
- Be 3-8 words MAX (~40 chars). Short = strong.
- Be in ${lang === 'fr' ? 'French (perfect French — no anglicisms unless intentional)' : 'English'}.
- Use the business REALITY (type + offer + sometimes news), not a clichéd template.
- Tie visual ↔ business in a way only THIS business could say.
- Have NO emoji, NO hashtag, NO punctuation overload.
- Position chosen for composition. The image dictates this — read the visual_description and pick the placement that USES the empty space, doesn't fight the subject:
  * top, bottom, center — classic centered placements over negative space
  * top-left, bottom-right — editorial corner placements (great for asymmetric compositions)
  * left-strip, right-strip — vertical column over a side margin (good for portrait shots with subject on one side)
- Tone (font family): punchy (Helvetica bold) for restos/sport/agence; elegant (Georgia serif) for beauté/spa/boutiques luxe; playful (Comic-style) for kids/desserts/fun.
- Style (treatment): pick what suits the underlying image so the text is legible AND coherent with the brand:
  * white-shadow — white text + dark drop-shadow (default, works on any background)
  * dark-on-light — dark text on a light translucent panel (use when image is dark or busy with bright text would clash)
  * light-on-dark — light text on a dark translucent panel (use when image is bright/overexposed and white-shadow would still get lost)
  * accent-bar — solid accent-colored bar (use accentColor) with white text (great for sport/promo/news pillar — gives news-headline feel)
  * outline-only — outlined text, transparent fill (luxury/editorial feel, lifestyle brands)
- accentColor (only relevant for style=accent-bar): a HEX color from the brand palette or a culturally-resonant news color (red for breaking news, etc).

VARY YOUR CHOICES: across many decisions for the same business, mix positions (don't always pick "bottom"), mix styles (not every overlay is "white-shadow"). The combination of position + style + tone should feel like a deliberate art direction choice, not a default.

Return STRICT JSON:
{
  "needsText": false
} OR {
  "needsText": true,
  "text": "string",
  "position": "top|bottom|center|top-left|bottom-right|left-strip|right-strip",
  "tone": "punchy|elegant|playful",
  "style": "white-shadow|dark-on-light|light-on-dark|accent-bar|outline-only",
  "accentColor": "#RRGGBB"
}

style and accentColor are optional. JSON only — no preamble, no explanation, no markdown.`;

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

    const validPositions: OverlayPosition[] = ['top', 'bottom', 'center', 'top-left', 'bottom-right', 'left-strip', 'right-strip'];
    const validStyles: OverlayStyle[] = ['white-shadow', 'dark-on-light', 'light-on-dark', 'accent-bar', 'outline-only'];
    const position: OverlayPosition = validPositions.includes(parsed.position) ? parsed.position : 'bottom';
    const tone: OverlayTone = ['punchy', 'elegant', 'playful'].includes(parsed.tone) ? parsed.tone : 'punchy';
    const style: OverlayStyle = validStyles.includes(parsed.style) ? parsed.style : 'white-shadow';
    const accentColor = typeof parsed.accentColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(parsed.accentColor)
      ? parsed.accentColor
      : undefined;

    return {
      needsText: true,
      text: cleanText,
      position,
      tone,
      style,
      ...(accentColor ? { accentColor } : {}),
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
  position: OverlayPosition,
  tone: OverlayTone,
  style: OverlayStyle = 'white-shadow',
  accentColor: string = '#FF3B6E',
): string {
  // Font choices per tone — kept to web-safe + free families likely
  // present in the Sharp/librsvg font cache on the VPS.
  const fontFamily = tone === 'elegant'
    ? 'Georgia, "Times New Roman", serif'
    : tone === 'playful'
      ? '"Comic Sans MS", "Marker Felt", sans-serif'
      : 'Helvetica, Arial, sans-serif';
  const weight = tone === 'elegant' ? 600 : 800;

  const isStrip = position === 'left-strip' || position === 'right-strip';

  // Auto-size: scale font with the shorter side. Strip layouts are
  // narrower so we shrink the font further; corners go a touch smaller.
  const baseFontSize = Math.round(Math.min(width, height) * 0.06);
  let fontSize = text.length > 30 ? Math.round(baseFontSize * 0.85) : baseFontSize;
  if (isStrip) fontSize = Math.round(fontSize * 0.78);
  if (position === 'top-left' || position === 'bottom-right') fontSize = Math.round(fontSize * 0.92);

  const padding = Math.round(width * 0.05);
  const lineHeight = Math.round(fontSize * 1.15);

  // Naive word-wrap. For strips we wrap MUCH harder (8-12 chars) so
  // the column reads cleanly. Corners stay at normal width.
  const stripWidth = Math.round(width * 0.28);
  const usableWidth = isStrip ? stripWidth : width;
  const maxCharsPerLine = Math.max(isStrip ? 8 : 14, Math.floor(usableWidth / (fontSize * 0.55)));
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
  // Compute anchor X (text-anchor) and Y (yStart) per position.
  let textAnchor: 'start' | 'middle' | 'end' = 'middle';
  let xAnchor: number = width / 2;
  let yStart: number;
  // Optional background panel coordinates (for dark-on-light, light-on-dark, accent-bar).
  let panelX = 0;
  let panelY = 0;
  let panelW = width;
  let panelH = blockHeight + padding;

  switch (position) {
    case 'top':
      yStart = padding + fontSize;
      panelX = 0; panelY = 0; panelW = width; panelH = blockHeight + padding * 1.5;
      break;
    case 'center':
      yStart = Math.round((height - blockHeight) / 2) + fontSize;
      panelX = 0; panelY = Math.round((height - blockHeight - padding) / 2); panelW = width; panelH = blockHeight + padding;
      break;
    case 'top-left':
      textAnchor = 'start';
      xAnchor = padding;
      yStart = padding + fontSize;
      panelX = 0; panelY = 0; panelW = Math.round(width * 0.55); panelH = blockHeight + padding * 1.2;
      break;
    case 'bottom-right':
      textAnchor = 'end';
      xAnchor = width - padding;
      yStart = height - padding - blockHeight + fontSize;
      panelX = Math.round(width * 0.45); panelY = height - blockHeight - padding * 1.2; panelW = Math.round(width * 0.55); panelH = blockHeight + padding * 1.2;
      break;
    case 'left-strip':
      textAnchor = 'start';
      xAnchor = padding;
      yStart = Math.round((height - blockHeight) / 2) + fontSize;
      panelX = 0; panelY = 0; panelW = stripWidth; panelH = height;
      break;
    case 'right-strip':
      textAnchor = 'end';
      xAnchor = width - padding;
      yStart = Math.round((height - blockHeight) / 2) + fontSize;
      panelX = width - stripWidth; panelY = 0; panelW = stripWidth; panelH = height;
      break;
    case 'bottom':
    default:
      yStart = height - padding - blockHeight + fontSize;
      panelX = 0; panelY = height - blockHeight - padding * 1.5; panelW = width; panelH = blockHeight + padding * 1.5;
  }

  // Style → fill, stroke, panel rect, shadow.
  let textFill = '#ffffff';
  let textStroke = '#000000';
  let textStrokeWidth = Math.round(fontSize * 0.04);
  let useShadow = true;
  let panelFill: string | null = null;
  let panelOpacity = 0;
  switch (style) {
    case 'dark-on-light':
      textFill = '#0f1115';
      textStroke = 'none';
      textStrokeWidth = 0;
      useShadow = false;
      panelFill = '#ffffff';
      panelOpacity = 0.85;
      break;
    case 'light-on-dark':
      textFill = '#ffffff';
      textStroke = 'none';
      textStrokeWidth = 0;
      useShadow = false;
      panelFill = '#0a0a0d';
      panelOpacity = 0.7;
      break;
    case 'accent-bar':
      textFill = '#ffffff';
      textStroke = 'none';
      textStrokeWidth = 0;
      useShadow = false;
      panelFill = accentColor;
      panelOpacity = 0.92;
      break;
    case 'outline-only':
      textFill = 'none';
      textStroke = '#ffffff';
      textStrokeWidth = Math.max(2, Math.round(fontSize * 0.05));
      useShadow = true;
      break;
    case 'white-shadow':
    default:
      // defaults already set
      break;
  }

  const tspans = lines.map((line, i) => `
    <tspan x="${xAnchor}" y="${yStart + i * lineHeight}">${escapeXml(line)}</tspan>
  `).join('');

  const panelSvg = panelFill
    ? `<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" fill="${panelFill}" fill-opacity="${panelOpacity}" />`
    : '';

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
  ${panelSvg}
  <text
    text-anchor="${textAnchor}"
    font-family='${fontFamily}'
    font-size="${fontSize}"
    font-weight="${weight}"
    fill="${textFill}"
    stroke="${textStroke}"
    stroke-width="${textStrokeWidth}"
    paint-order="stroke fill"
    ${useShadow ? 'filter="url(#shadow)"' : ''}
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

    const svg = buildOverlaySvg(
      decision.text,
      width,
      height,
      decision.position,
      decision.tone,
      decision.style || 'white-shadow',
      decision.accentColor || '#FF3B6E',
    );
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
