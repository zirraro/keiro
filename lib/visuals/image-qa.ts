/**
 * Image quality QA via Sonnet vision.
 *
 * Why: i2i / text-to-image sometimes returns soft, blurry, or smudged
 * frames — particularly when the source photo was already low-res or
 * the strength was too high. Without a check we publish those, and
 * the user complains "the dish is blurry".
 *
 * What this does: sends ONE image to Sonnet vision with a tight
 * prompt asking for a verdict on technical quality (blur, focus,
 * artefacts) — NOT aesthetic preferences. Returns pass/soft/hard
 * fail so the caller can regenerate before publish.
 *
 * Cost: ~€0.005 per call. We call this AFTER generation but BEFORE
 * the overlay step so a regen restarts cleanly.
 */

export type ImageQaVerdict = {
  verdict: 'pass' | 'soft_fail' | 'hard_fail';
  // One short sentence on the most important issue, if any.
  issue?: string;
  // 0..1
  confidence?: number;
};

export async function reviewGeneratedImage(input: {
  imageUrl: string;
  visualBrief?: string;
  businessType?: string;
}): Promise<ImageQaVerdict> {
  if (!process.env.ANTHROPIC_API_KEY) return { verdict: 'pass' };

  const system = `You are a senior photo editor reviewing a generated image BEFORE it ships to a client's social feed. You see ONE image and the brief that was meant to drive it.

Your single job: catch TECHNICAL quality failures that would embarrass the client. NOT aesthetic preferences.

HARD FAILS (must NOT ship):
- Subject blurry / out-of-focus where it should be sharp (the dish, the product, the face).
- Unreadable smudged details where the eye expects clarity.
- Severe noise / grain / artefacts (melted edges, deformed limbs, gibberish text patches).
- Wrong subject identity (the dish was supposed to be octopus, image shows pasta).

SOFT FAILS (reviewable, may still ship):
- Slight softness that's stylistic (intentional shallow depth-of-field) but borderline.
- Minor artefact in a non-focal area.
- Composition slightly off but the message lands.

PASS:
- Subject sharp, framing coherent, no embarrassing artefacts.
- A normal client looking at this would not say "this is blurry" or "this looks AI-broken".

Return STRICT JSON:
{
  "verdict": "pass" | "soft_fail" | "hard_fail",
  "issue": "<one short sentence describing the worst issue, or empty>",
  "confidence": 0..1
}

JSON only. No preamble.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 250,
        system,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `Brief: ${input.visualBrief || 'unknown'}\nBusiness: ${input.businessType || 'unknown'}\nReview this image for technical quality. JSON.` },
            { type: 'image', source: { type: 'url', url: input.imageUrl } },
          ],
        }],
      }),
    });
    if (!res.ok) return { verdict: 'pass' };
    const data = await res.json();
    const txt = (data.content?.[0]?.text || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return { verdict: 'pass' };
    const parsed = JSON.parse(m[0]);
    const verdict: 'pass' | 'soft_fail' | 'hard_fail' =
      ['pass', 'soft_fail', 'hard_fail'].includes(parsed.verdict) ? parsed.verdict : 'pass';
    return {
      verdict,
      issue: typeof parsed.issue === 'string' ? parsed.issue.substring(0, 240) : undefined,
      confidence: Number.isFinite(parsed.confidence) ? parsed.confidence : undefined,
    };
  } catch (e: any) {
    console.warn('[image-qa] review failed:', e?.message);
    return { verdict: 'pass' };
  }
}
