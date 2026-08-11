import { fetchModele } from '../agents/anthropic-avec-repli';
import { blocExigence } from './exigences-reseau';
/**
 * Post-generation visual QA via Claude Vision.
 *
 * Scores a generated image 0-10 against the brief + looks for amateur
 * artefacts (flat 2D paste, lighting mismatch, object incoherence,
 * invented props like "studio projectors in a restaurant"). Returns a
 * numeric score + short notes so the content pipeline can retry when
 * it's below threshold, without hard-coding rules for every edge case.
 *
 * When a venue REFERENCE image is provided, Claude also compares the
 * generated image to it and flags `venue_changed` when Seedream
 * invented elements that weren't in the reference (sea view from a
 * courtyard, different chair style, extra window, swapped wall colour).
 * That single flag is what catches DA-violations the brief alone misses.
 *
 * Haiku 4.5 + 200-300 tokens = ~€0.004 per call. Cheap insurance.
 */

export type QAScore = {
  score: number;      // 0-10, 10 = publish-ready magazine quality
  notes: string;      // one-line reasoning
  amateur_flags: string[]; // e.g. ['2d_paste', 'lighting_mismatch', 'invented_props', 'venue_changed']
};

export async function scoreVisualQuality(
  imageUrl: string,
  brief: string,
  expectedSubject: string,
  referenceImageUrl?: string,
  /**
   * Le réseau de destination. Ajouté le 2026-08-11 : ce contrôle jugeait TOUT
   * comme un visuel Instagram — son prompt commençait littéralement par « You
   * audit Instagram visuals » — y compris quand la publication partait sur
   * TikTok ou LinkedIn. Trois audiences, trois attentes, un seul barème.
   */
  plateforme?: string | null,
  /** Le client a demandé un rendu illustré : ce n'est plus un défaut. */
  renduNonPhotoDemande?: boolean,
): Promise<QAScore> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { score: 7, notes: 'no-api-key', amateur_flags: [] };

  try {
    const exigence = blocExigence(plateforme, { renduNonPhotoDemande });
    const systemPrompt = `You audit social visuals that will be published for small businesses. Reject amateur outputs AND brand-direction violations.

${exigence}

Return STRICT JSON:
{
  "score": 0-10,              // 10 = magazine-quality, 6 = publishable, <6 = retry
  "notes": "one-line reason",
  "amateur_flags": ["looks_generated", "2d_paste", "lighting_mismatch", "invented_props", "wrong_subject", "low_detail", "uncanny_composition", "venue_changed", "proportions_unrealistic", "blurry_subject", "out_of_focus", "off_network_register"]
}

CRITICAL FLAGS:
- looks_generated: the image reads as AI-generated, 3D, cartoon, illustrated or synthetic rather than photographed — unless the client explicitly asked for that rendering (stated above). This is ELIMINATORY: score MUST be ≤ 3. Check hands and fingers, embedded text, background faces, objects melting into one another, impossible reflections, plastic skin, light coming from nowhere.
- off_network_register: technically fine, but wrong for THIS network — an advertising-looking shot on LinkedIn, a flat static frame for TikTok, a careless snapshot on Instagram. Score ≤ 5.
- blurry_subject: the HERO subject (dish / product / face / hands) is soft, smudged, or out-of-focus where it should be tack sharp. Even minor softness on the focal point = HARD FAIL — score MUST be ≤ 3 and we regenerate. Background bokeh is fine, but the subject must be crisp. NO publishable post has a fuzzy hero.
- out_of_focus: composition is overall soft (wrong focal point, focus missed, motion blur where there shouldn't be any). Score ≤ 4.
- 2d_paste: subject looks layered on top of background (floating circle, feathered edges, no contact shadow, perspective-free).
- lighting_mismatch: hero and background have incompatible light sources.
- invented_props: image contains objects that don't belong (studio projectors in a restaurant, mountain view added to a city café, etc).
- wrong_subject: image doesn't show what the brief asks for.
- proportions_unrealistic: the hero subject (dish, product) is sized wrong for the camera distance described in the brief. If the brief says "wide shot, dish 10-15% of frame" and the dish takes 40% of the frame, this flag fires and score MUST be ≤ 5. A real plate is ~25cm — at the camera distance implied by the shot type it should look proportional, not oversized.${referenceImageUrl ? `
- venue_changed: image 1 (REFERENCE — client's actual venue) and image 2 (GENERATED) show DIFFERENT places. GRADUATED severity:
  * MAJOR change (score MUST be ≤ 3): different window VIEW (sea/mountain/garden when reference shows urban or courtyard), different building TYPE (modern when reference is haussmannien), swapped chair STYLE (modern when reference is wooden bistro), additional rooms/balconies that didn't exist, fundamentally altered wall material (brick when reference is plaster).
  * MINOR change (score 5-6): slight shift in pendant lamp position, marginal table surface variation (white marble vs cream marble), lighting angle subtly different, small chair count difference. These are acceptable editorial liberties — flag the change but DO NOT lower the score below 5 just for these.
  Default to MINOR unless the change clearly invents an element that wasn't there.` : ''}

Expected subject: "${expectedSubject}".
Brief context: "${brief.substring(0, 300)}".

Reply with JSON only, no preamble.`;

    const userContent: any[] = [];
    if (referenceImageUrl) {
      userContent.push(
        { type: 'text', text: 'Image 1 — REFERENCE (client real venue, must be preserved):' },
        { type: 'image', source: { type: 'url', url: referenceImageUrl } },
        { type: 'text', text: 'Image 2 — GENERATED (the candidate publication):' },
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: 'Audit. If image 2 invented elements absent from image 1 (different view, layout, materials), score ≤ 4 and flag venue_changed. Return the JSON.' },
      );
    } else {
      userContent.push(
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: 'Audit this visual and return the JSON score.' },
      );
    }

    const res = await fetchModele({
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    }, {
      // Étiquette de COÛT. Sans elle, cet appel se noyait dans le total et on
      // ne pouvait pas répondre à la question du fondateur : « ça nous coûte
      // aussi de vérifier la qualité, on doit pouvoir le maîtriser ». Le
      // préfixe `qc_` est la convention qui permet au rapport de séparer ce
      // qu'on paie pour PRODUIRE de ce qu'on paie pour VÉRIFIER.
      etiquette: 'qc_image', agent: 'content',
    });

    if (!res.ok) {
      return { score: 7, notes: `api ${res.status}`, amateur_flags: [] };
    }
    const data = await res.json();
    const txt = (data.content?.[0]?.text || '').trim();
    const jsonMatch = txt.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { score: 7, notes: 'no-json', amateur_flags: [] };
    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(10, Number(parsed.score ?? 7)));
    const notes = String(parsed.notes || '').substring(0, 200);
    const flags = Array.isArray(parsed.amateur_flags)
      ? parsed.amateur_flags.slice(0, 5).map(String)
      : [];
    return { score, notes, amateur_flags: flags };
  } catch (err: any) {
    return { score: 7, notes: `qa-error: ${err?.message}`, amateur_flags: [] };
  }
}
