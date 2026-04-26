/**
 * Sonnet step that picks ONE news/trend item and crafts a SHARP angle
 * linking it to the client's business reality. Without this, Léna sees
 * a flat list of headlines and her copy stays generic ("on parle de
 * l'inflation, comme tout le monde, et tu sais quoi, viens chez nous").
 *
 * The angle returned here is opinionated, specific, and meant to FRAME
 * the post. It is injected into Léna's prompt as a strong directive
 * BEFORE she writes hook/caption/visual_description. She follows the
 * frame; she doesn't reinvent it.
 *
 * Trigger conditions (caller decides):
 *   - pillar === 'trends'
 *   - OR there's a major event today/tomorrow worth surfing
 *   - We do NOT call this on every post — that would explode cost and
 *     dilute the trend posts.
 *
 * Cost: ~€0.02 per call (Sonnet, ~600 in / ~250 out tokens).
 */

export type BusinessNewsAngle = {
  // The chosen news/trend item (verbatim from input list).
  picked: string;
  // The sharp angle: one sentence, the lens.
  angle: string;
  // Concrete idea Léna should turn into a post (hook + visual hint).
  postIdea: string;
  // Whether Sonnet judged this image-overlay-worthy (hint for the
  // overlay decider downstream — soft signal, not binding).
  overlayWorthy: boolean;
};

export async function pickBusinessNewsAngle(input: {
  businessType?: string;
  businessSummary?: string;
  signatureOffer?: string;
  city?: string;
  language?: 'fr' | 'en';
  // The flat lists Léna currently sees — Sonnet does the synthesis.
  newsHeadlines: string[];
  trendQueries: string[];
  upcomingEvents: string[];   // e.g. ["AUJOURD'HUI: Fête nationale"]
  // Avoid re-picking what was already used.
  recentAnglesUsed?: string[];
}): Promise<BusinessNewsAngle | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (input.newsHeadlines.length === 0 && input.trendQueries.length === 0 && input.upcomingEvents.length === 0) return null;

  const lang = input.language || 'fr';
  const system = `You are a senior strategist who connects current events to a specific business reality. You write in ${lang === 'fr' ? 'French' : 'English'}.

Your job: given a flat list of news, trends, and upcoming events PLUS a description of one local business, pick the SINGLE item that creates the strongest, most natural angle for a social media post — and write that angle.

WHAT MAKES AN ANGLE STRONG:
- It's specific to THIS business, not "any restaurant" or "any salon".
- It surprises the reader: a non-obvious connection, a contrarian take, a stat.
- It has emotional or practical stakes for the customer NOW (not next month).
- It uses local geography or culture if the business is local.
- It avoids the lame "Saint-Valentin is coming, here's our heart-shaped croissant" template UNLESS you can find a fresh, specific angle.

WHAT TO AVOID:
- Generic "happy [holiday]" greetings.
- Vague "in this rapidly changing world..." openings.
- Forcing a connection that isn't there. If NONE of the headlines genuinely connect to the business, return null.
- Re-picking an angle that's been used recently.

OUTPUT — STRICT JSON:
{
  "picked": "the exact headline / trend / event you chose, copy-pasted",
  "angle": "one sentence in ${lang === 'fr' ? 'French' : 'English'} stating the lens",
  "postIdea": "one short paragraph in ${lang === 'fr' ? 'French' : 'English'} describing what the post should be about — hook idea + visual hint + emotion to provoke",
  "overlayWorthy": true | false
}

If no headline genuinely connects, return: { "picked": null }.

JSON only. No preamble, no markdown.`;

  const businessBlock = [
    input.businessType && `Type: ${input.businessType}`,
    input.businessSummary && `Activité: ${input.businessSummary.substring(0, 300)}`,
    input.signatureOffer && `Offre signature: ${input.signatureOffer.substring(0, 200)}`,
    input.city && `Ville: ${input.city}`,
  ].filter(Boolean).join('\n') || 'Inconnu';

  const message = `=== BUSINESS ===
${businessBlock}

=== ACTUALITÉS DU JOUR (FRANCE) ===
${input.newsHeadlines.slice(0, 8).map((h, i) => `${i + 1}. ${h}`).join('\n') || '(aucune)'}

=== TRENDS GOOGLE / TIKTOK ===
${input.trendQueries.slice(0, 8).map((t, i) => `${i + 1}. ${t}`).join('\n') || '(aucune)'}

=== ÉVÉNEMENTS PROCHES ===
${input.upcomingEvents.slice(0, 4).map((e, i) => `${i + 1}. ${e}`).join('\n') || '(aucun)'}

${input.recentAnglesUsed && input.recentAnglesUsed.length > 0
  ? `=== ANGLES DÉJÀ UTILISÉS (À NE PAS REPRENDRE) ===\n${input.recentAnglesUsed.slice(0, 5).map((a, i) => `${i + 1}. ${a}`).join('\n')}\n`
  : ''}

Choose the strongest connection and return JSON. If nothing connects genuinely, return { "picked": null }.`;

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
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: message }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = (data.content?.[0]?.text || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (!parsed.picked || typeof parsed.picked !== 'string') return null;
    return {
      picked: String(parsed.picked).substring(0, 240),
      angle: String(parsed.angle || '').substring(0, 280),
      postIdea: String(parsed.postIdea || '').substring(0, 600),
      overlayWorthy: parsed.overlayWorthy === true,
    };
  } catch {
    return null;
  }
}

/**
 * Format a chosen angle as a prompt block to inject into Léna's
 * generation prompt. The block is intentionally directive — Léna does
 * not need to choose between angles, she has ONE angle to execute.
 */
export function angleToPromptBlock(a: BusinessNewsAngle): string {
  return `\n━━━ ANGLE BUSINESS ↔ ACTUALITÉ (Sonnet stratège) ━━━
Sujet retenu : ${a.picked}
Angle (lens) : ${a.angle}
Idée de post : ${a.postIdea}
${a.overlayWorthy ? '→ Sonnet juge que cette idée pourrait gagner avec un overlay punchy si la composition s\'y prête.' : '→ Sonnet juge que ce post peut très bien tenir SANS overlay texte.'}

EXÉCUTE cet angle. Ne le réécris pas, ne le dilue pas. Le hook, la caption et le visual_description doivent INCARNER cette idée.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
