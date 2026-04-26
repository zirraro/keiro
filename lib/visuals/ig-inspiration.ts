/**
 * Instagram account inspiration — analyse a public IG handle and extract
 * stylistic cues so the content agent can generate posts in that aesthetic.
 *
 * Uses Meta Business Discovery API when available (requires the OWNER's
 * IG token), otherwise falls back to oEmbed / public-facing scrape.
 *
 * Returns a structured "style brief" that gets injected into Léna's
 * generation prompt as a soft inspiration layer (never a copy/paste —
 * we use it for tone, palette, composition cues only).
 */

export type IgInspirationBrief = {
  handle: string;
  visual_style: string;        // 1-2 sentences describing the look
  tone: string;                 // 1 sentence — voice (chic, playful, gritty, etc.)
  palette_hints: string[];      // colour names (warm tones, muted earth, neon, etc.)
  composition_hints: string[];  // wide shots, top-down, portraits, etc.
  hook_patterns: string[];      // recurring caption structures
  recent_posts: Array<{
    media_url?: string;
    caption_preview?: string;
    permalink?: string;
  }>;
};

/**
 * Fetch a public IG profile via Business Discovery (when owner token
 * available) and analyse with Claude Vision to produce the brief.
 */
export async function analyzeIgAccount(input: {
  handle: string;             // @bistrot_marais or bistrot_marais
  ownerIgToken?: string;       // owner's IG access token for Business Discovery
  ownerIgBusinessId?: string;  // owner's IG Business Account ID
  language?: 'fr' | 'en';
}): Promise<IgInspirationBrief | null> {
  const handle = input.handle.replace(/^@/, '').trim().toLowerCase();
  if (!handle) return null;

  let recentPosts: Array<{ media_url?: string; caption_preview?: string; permalink?: string }> = [];

  // Path 1 — Business Discovery (preferred when owner token + business id present)
  if (input.ownerIgToken && input.ownerIgBusinessId) {
    try {
      const url = `https://graph.facebook.com/v21.0/${input.ownerIgBusinessId}?fields=business_discovery.username(${handle}){media.limit(8){media_url,caption,permalink,media_type}}&access_token=${input.ownerIgToken}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const media = data?.business_discovery?.media?.data || [];
        recentPosts = media.slice(0, 8).map((m: any) => ({
          media_url: m.media_url,
          caption_preview: (m.caption || '').substring(0, 250),
          permalink: m.permalink,
        }));
      }
    } catch (e: any) {
      console.warn('[ig-inspiration] business_discovery failed:', e?.message);
    }
  }

  if (recentPosts.length === 0) {
    // No accessible posts — return a minimal brief so Léna can still use
    // the handle name as a stylistic anchor.
    return {
      handle,
      visual_style: 'Inspiration not accessible — use handle name as a stylistic cue only',
      tone: 'Adapt to the client\'s brand',
      palette_hints: [],
      composition_hints: [],
      hook_patterns: [],
      recent_posts: [],
    };
  }

  // Ask Claude Vision to extract a style brief from up to 6 image URLs.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const lang = input.language || 'fr';
  const imageContents = recentPosts.slice(0, 6).filter(p => p.media_url).map(p => ({
    type: 'image' as const,
    source: { type: 'url' as const, url: p.media_url! },
  }));
  const captionList = recentPosts.map((p, i) => `Post ${i + 1}: ${p.caption_preview || '(no caption)'}`).join('\n');

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
        max_tokens: 800,
        system: `You analyse the visual + editorial style of an Instagram account so an AI content agent can produce posts in the same aesthetic. Return STRICT JSON:
{
  "visual_style": "1-2 sentences describing the LOOK (lighting, framing, subject, vibe)",
  "tone": "1 sentence describing the VOICE (chic / playful / gritty / luxe / minimal / etc)",
  "palette_hints": ["colour names — warm earth, muted pastels, neon, etc"],
  "composition_hints": ["wide editorial shots, overhead flat lays, intimate portraits, etc"],
  "hook_patterns": ["recurring caption structures — short punchlines, story format, question-driven, etc"]
}
Reply in ${lang === 'fr' ? 'French' : 'English'}. JSON only.`,
        messages: [{
          role: 'user',
          content: [
            ...imageContents,
            { type: 'text', text: `Account @${handle}.\n\nCaptions for context:\n${captionList}\n\nExtract the style brief.` },
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
    return {
      handle,
      visual_style: String(parsed.visual_style || '').substring(0, 400),
      tone: String(parsed.tone || '').substring(0, 200),
      palette_hints: Array.isArray(parsed.palette_hints) ? parsed.palette_hints.slice(0, 6).map(String) : [],
      composition_hints: Array.isArray(parsed.composition_hints) ? parsed.composition_hints.slice(0, 6).map(String) : [],
      hook_patterns: Array.isArray(parsed.hook_patterns) ? parsed.hook_patterns.slice(0, 6).map(String) : [],
      recent_posts: recentPosts.slice(0, 6),
    };
  } catch (e: any) {
    console.warn('[ig-inspiration] analyze failed:', e?.message);
    return null;
  }
}

/** Format the brief as a prompt block to inject into Léna's system prompt. */
export function formatInspirationForPrompt(brief: IgInspirationBrief): string {
  return `

━━━ INSPIRATION VISUELLE — Compte @${brief.handle} ━━━
- Style visuel : ${brief.visual_style}
- Ton éditorial : ${brief.tone}
${brief.palette_hints.length > 0 ? `- Palette : ${brief.palette_hints.join(', ')}` : ''}
${brief.composition_hints.length > 0 ? `- Composition : ${brief.composition_hints.join(' · ')}` : ''}
${brief.hook_patterns.length > 0 ? `- Hooks récurrents : ${brief.hook_patterns.join(' · ')}` : ''}

→ Inspire-toi de cette esthétique pour le visuel ET le hook. NE COPIE PAS — extrais les codes (palette, framing, ton) et applique-les au contenu du client. Le résultat doit ressembler à "ce que ferait @${brief.handle} si elle était notre client".
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
}
