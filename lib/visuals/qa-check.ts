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
): Promise<QAScore> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { score: 7, notes: 'no-api-key', amateur_flags: [] };

  try {
    const systemPrompt = `You audit Instagram visuals that will be published for small businesses. Reject amateur outputs AND brand-direction violations. Return STRICT JSON:
{
  "score": 0-10,              // 10 = magazine-quality, 6 = publishable, <6 = retry
  "notes": "one-line reason",
  "amateur_flags": ["2d_paste", "lighting_mismatch", "invented_props", "wrong_subject", "low_detail", "uncanny_composition", "venue_changed"]
}

CRITICAL FLAGS:
- 2d_paste: subject looks layered on top of background (floating circle, feathered edges, no contact shadow, perspective-free).
- lighting_mismatch: hero and background have incompatible light sources.
- invented_props: image contains objects that don't belong (studio projectors in a restaurant, mountain view added to a city café, etc).
- wrong_subject: image doesn't show what the brief asks for.${referenceImageUrl ? `
- venue_changed: image 1 (REFERENCE — client's actual venue) and image 2 (GENERATED) show DIFFERENT places. Look at: window views (no sea/mountain/garden if reference has urban/courtyard), chair style, table shape, wall material, door style, ceiling height, layout. If the generated image invented elements absent from the reference, this flag fires and the score MUST be ≤ 4. The whole point is preserving the client's real space.` : ''}

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

    const res = await fetch('https://api.anthropic.com/v1/messages', {
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
