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

⛔ HARDEST RULE — SURGICAL VISUAL-TEXT COHERENCE ⛔
Before you say YES, name AT LEAST ONE specific element from the visual_description that VISUALLY anchors the line you want to write. If you can't name a concrete visual anchor, the answer is NO.

This is surgical — not "vaguely on theme":
- ❌ NO: visual is a plate of grilled octopus. Line: "Sondages vs résultats". → octopus has zero visual link to elections. The viewer asks "what?". REFUSE.
- ❌ NO: visual is a coffee shop interior. Line: "L'IA va remplacer les baristas ?". → no AI element in the image, no robot, no screen. REFUSE even if the news is hot.
- ❌ NO: visual is a fleuriste close-up. Line: "Le coiffeur qui a publié pendant la finale". → coiffeur has no anchor in a fleuriste image. REFUSE.
- ✅ YES: visual is a plate with one tiny portion of food, lots of empty plate. Line: "On t'a vendu plus que ça". → the empty space IS the anchor, the line names it.
- ✅ YES: visual is a barber with a single chair empty, mid-day. Line: "Personne ne veut payer ça". → empty chair IS the anchor.
- ✅ YES: visual is a salon interior with old equipment. Line: "Des outils qui ont fait 10 000 coupes". → old equipment IS the anchor.

The line must FEEL inevitable once you read the image. The viewer's brain should connect text↔image in <500ms without effort. If they need to read the caption to "get" why the text is there, the overlay has failed.

ABSTRACT / METAPHORICAL lines are usually a refusal unless the image itself contains the metaphor's anchor (e.g. line about "starting from scratch" + image of empty workspace = OK because the empty workspace IS the scratch).

⚡ GATE 4 — WHAT DOES THIS OVERLAY ADD? ⚡
Before saying YES, write down the answer: "Without this overlay, what would the viewer miss?"
The acceptable answers are:
- ✅ A pun / clever wordplay that makes the post smile-worthy (humour).
- ✅ A specific, non-obvious news↔business angle that the visual ALONE wouldn't telegraph.
- ✅ A sharper meaning to an ambiguous image (e.g. mid-action shot the viewer can't yet read).
- ✅ A stat or number that is surprising and lands harder ON the image than buried in caption.

UNACCEPTABLE answers (= REFUSE the overlay):
- ❌ "Just rephrasing the hook" → caption already does that.
- ❌ "Branding / vibes" → no overlay needed for vibes.
- ❌ "Inspiring quote" → ZERO inspirational quotes. This is the laziest overlay genre.
- ❌ "Generic value statement" ('Tradition & qualité', 'L'art de bien manger') → cliché.
- ❌ "Just because the post is on the trends pillar" — being trends-related doesn't justify text. The TEXT must CARRY the trend angle in a way the image CAN'T.

⛔ COLOUR / STYLE INTENT — must defend the colour ⛔
When you pick an accent-bar style or non-default colour, justify why this colour SUITS the image's existing palette:
- A red bar on a warm sage/cream cafe scene = clash. Choose a tone-on-tone bar (cream-on-marble, charcoal-on-brick) or skip the bar.
- An accent that fights the image's mood = REFUSE.
- "white-shadow" is the safest default — it works on any palette without colour decisions to defend.
- Only pick a colour you can name a reason for: "matches the brick wall", "echoes the wine bottle", "news headline red because the line is breaking-news framed".
If you cannot name a colour reason, do not specify accentColor.

CRITICAL CALIBRATION: Across 100 posts in a typical month for ONE business, no more than ~10-15 should have an overlay. We have a deterministic upstream gate that already kills overlay if recent rate ≥20%. So when this prompt fires, you have a chance — make it count or pass. DEFAULT TO NO. Only YES when:
1. The line is exceptional — better than 90% of overlays in the wild.
2. The line VISUALLY ties to elements actually present in the image (Gate 3).
3. Removing the overlay would meaningfully weaken the post (Gate 4).
4. If you specify a colour, you can justify why it fits the image's palette.
If any of those four is shaky, the answer is NO.

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
