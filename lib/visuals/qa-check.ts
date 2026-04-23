/**
 * Post-generation visual QA via Claude Vision.
 *
 * Scores a generated image 0-10 against the brief + looks for amateur
 * artefacts (flat 2D paste, lighting mismatch, object incoherence,
 * invented props like "studio projectors in a restaurant"). Returns a
 * numeric score + short notes so the content pipeline can retry when
 * it's below threshold, without hard-coding rules for every edge case.
 *
 * Haiku 4.5 + 120 tokens max = ~€0.003 per call. Cheap insurance.
 */

export type QAScore = {
  score: number;      // 0-10, 10 = publish-ready magazine quality
  notes: string;      // one-line reasoning
  amateur_flags: string[]; // e.g. ['2d_paste', 'lighting_mismatch', 'invented_props']
};

export async function scoreVisualQuality(
  imageUrl: string,
  brief: string,
  expectedSubject: string,
): Promise<QAScore> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { score: 7, notes: 'no-api-key', amateur_flags: [] };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: `You audit Instagram visuals that will be published for small businesses. Reject amateur outputs. Return STRICT JSON:
{
  "score": 0-10,              // 10 = magazine-quality, 7 = publishable, <7 = retry
  "notes": "one-line reason",
  "amateur_flags": ["2d_paste", "lighting_mismatch", "invented_props", "wrong_subject", "low_detail", "uncanny_composition"]
}

Flag 2d_paste when the subject looks layered on top of the background (floating circle, feathered edges visible, no contact shadow, perspective-free). Flag lighting_mismatch when the hero and the background have incompatible light sources. Flag invented_props when the image contains objects that don't belong to the scene (e.g. studio projectors in a restaurant interior). Flag wrong_subject when the image doesn't show what the brief asks for.

Expected subject: "${expectedSubject}".
Brief context: "${brief.substring(0, 300)}".

Reply with JSON only, no preamble.`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: 'Audit this visual and return the JSON score.' },
          ],
        }],
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
