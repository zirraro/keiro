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
  // ONE concrete, photographable image that makes the actuality↔business
  // link VISIBLE at a glance on a muted, scrolling feed (the founder's
  // hard requirement: "lien fort visuellement"). Drives visual_description.
  visualLink: string;
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
  // Hard list of topics Sonnet must NOT pick (independent of recentAnglesUsed
  // which depends on content_angle being stored — not always reliable).
  avoidTopics?: string[];
  // Optional preference: 'news' = only pick from real news headlines,
  // 'trend' = only pick from trending queries (recurring social
  // media themes), 'event' = upcoming calendar events. Default lets
  // Sonnet choose whichever source has the strongest angle.
  prefer?: 'news' | 'trend' | 'event';
}): Promise<BusinessNewsAngle | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (input.newsHeadlines.length === 0 && input.trendQueries.length === 0 && input.upcomingEvents.length === 0) return null;

  const lang = input.language || 'fr';
  const system = `You are a senior strategist who connects current events to a specific business reality. You write in ${lang === 'fr' ? 'French' : 'English'}.

Your job: given a flat list of news, trends, and upcoming events PLUS a description of one local business, pick the SINGLE item that creates the strongest, most natural angle for a social media post — and write that angle.

SURF THE BIGGEST CURRENT TRENDS — DIVERSIFY:
- Pick what's genuinely BUZZING right now across ALL domains: culture, cinéma/séries, sport, musique/concerts/festivals, célébrités/acteurs, politique, science, viral social trends — NOT only tech/AI/business. The more a topic recurs in the news/social feeds, the better to surf it.
- Then MIX that trend with the business via a CREATIVE, surprising link. The trend is the hook that grabs attention; the business is the payoff. This mix IS the value: a fresh, smart, on-trend bridge that no competitor makes.
- The angle can be PROVOCATIVE, cheeky or funny if it fits the brand — it must STOP the scroll.
- VARY across days: do NOT keep returning to the same theme (e.g. AI, levées de fonds). If a theme is in the banned list below, pick a different domain entirely.

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

THE VISUAL LINK IS NON-NEGOTIABLE:
The post is seen MUTED, while scrolling. The viewer must SEE the connection between the actuality and the business in under 1 second — not read it. So describe ONE concrete, photographable/filmable image where the news theme and the business are BOTH visible in the same frame (e.g. news = heatwave → "a frosty artisan ice-cream counter, condensation on the glass, summer light"; news = AI boom → "a baker checking tomorrow's orders on a tablet at dawn, flour on the screen"). No abstract concepts, no charts, no text-as-image. If you can't picture a strong shared frame, the angle is too weak — return { "picked": null }.

OUTPUT — STRICT JSON:
{
  "picked": "the exact headline / trend / event you chose, copy-pasted",
  "angle": "one sentence in ${lang === 'fr' ? 'French' : 'English'} stating the lens",
  "postIdea": "one short paragraph in ${lang === 'fr' ? 'French' : 'English'} describing what the post should be about — hook idea + emotion to provoke",
  "visualLink": "one concrete photographable/filmable shot (in ${lang === 'fr' ? 'French' : 'English'}) where the actuality AND the business are visible in the SAME frame",
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

  // When a preference is specified, the other sources are hidden
  // entirely — Sonnet can only choose from the requested category.
  // This is how the caller forces a NEWS-pillar post vs a TREND-pillar
  // post, since each plays a different role in social-media reach.
  const showNews = !input.prefer || input.prefer === 'news';
  const showTrends = !input.prefer || input.prefer === 'trend';
  const showEvents = !input.prefer || input.prefer === 'event';
  const preferNote = input.prefer
    ? `\n=== PRÉFÉRENCE EXPLICITE DU CALLER ===\nLe post doit être ancré sur ${input.prefer === 'news' ? "une ACTUALITÉ (vraie news du jour, ce que rapportent les médias)" : input.prefer === 'trend' ? "une TENDANCE (sujet qui revient sur les réseaux, format viral, sound, débat communautaire)" : "un ÉVÉNEMENT calendaire à venir"}. N'utilise QUE les items listés dans cette catégorie ci-dessous, pas les autres.\n`
    : '';

  const message = `=== BUSINESS ===
${businessBlock}
${preferNote}
${showNews ? `=== ACTUALITÉS DU JOUR (FRANCE) ===
${input.newsHeadlines.slice(0, 10).map((h, i) => `${i + 1}. ${h}`).join('\n') || '(aucune)'}
` : ''}
${showTrends ? `=== TRENDS GOOGLE / TIKTOK / RÉSEAUX ===
${input.trendQueries.slice(0, 10).map((t, i) => `${i + 1}. ${t}`).join('\n') || '(aucune)'}
` : ''}
${showEvents ? `=== ÉVÉNEMENTS PROCHES ===
${input.upcomingEvents.slice(0, 4).map((e, i) => `${i + 1}. ${e}`).join('\n') || '(aucun)'}
` : ''}
${input.recentAnglesUsed && input.recentAnglesUsed.length > 0
  ? `=== ANGLES DÉJÀ UTILISÉS RÉCEMMENT (NE PAS REPRENDRE — varie les thèmes) ===\n${input.recentAnglesUsed.slice(0, 8).map((a, i) => `${i + 1}. ${a}`).join('\n')}\n`
  : ''}
${input.avoidTopics && input.avoidTopics.length > 0
  ? `=== INTERDICTION ABSOLUE — NE PAS UTILISER CES THÈMES ===\nLe caller a explicitement banni ces sujets pour ce post (déjà sur-utilisés cette journée) :\n${input.avoidTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}\nSi tu veux te référer à un de ces thèmes, return { "picked": null } — on préfère pas de post du tout que de re-tourner sur ${input.avoidTopics[0]}.\n`
  : ''}

Choose the strongest connection and return JSON. If nothing in ${input.prefer ? `the ${input.prefer.toUpperCase()} category` : 'any category'} connects genuinely, return { "picked": null }.`;

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
      visualLink: String(parsed.visualLink || '').substring(0, 300),
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
${a.visualLink ? `🎯 LIEN VISUEL OBLIGATOIRE (à incarner dans visual_description) : ${a.visualLink}
   → Le spectateur scrolle en muet : il doit VOIR le lien actu↔business en <1s. Le visual_description DOIT décrire ce plan concret (l'actu et le business dans le MÊME cadre). Pas d'image abstraite, pas de texte-image.` : ''}
${a.overlayWorthy ? '→ Sonnet juge que cette idée pourrait gagner avec un overlay punchy si la composition s\'y prête.' : '→ Sonnet juge que ce post peut très bien tenir SANS overlay texte.'}

EXÉCUTE cet angle. Ne le réécris pas, ne le dilue pas. Le hook, la caption et le visual_description doivent INCARNER cette idée — surtout le LIEN VISUEL.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
