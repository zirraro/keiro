/**
 * Per-agent visual asset analyzer.
 *
 * When a client uploads photos/videos to a specific agent's workspace
 * (e.g., Jade's content agent — photos of their restaurant interior,
 * their product shots, their brand guidelines PDF), this module runs
 * each image through Claude Vision to extract structured features that
 * other agents can pull into their generation prompts.
 *
 * The extracted schema is deliberately narrow: if we ask for too many
 * fields the model hallucinates. What we store:
 *   - color_palette:    dominant hex colors (2-5) in the image
 *   - ambiance:         short phrase ("warm neighborhood bistro")
 *   - style_descriptors: 3-5 adjectives (rustic, industrial, minimalist…)
 *   - lighting:         natural / warm / neon / dim / bright
 *   - space_type:       for restaurants, shops — specific room type
 *   - visible_elements: items the model sees (wood tables, plants, neon sign…)
 *   - suggested_use:    one line on how Jade should use this in content
 */

export interface VisualAnalysis {
  color_palette: string[];
  ambiance: string;
  style_descriptors: string[];
  lighting: string;
  space_type: string;
  visible_elements: string[];
  suggested_use: string;
  summary: string;
}

/**
 * Analyze a single image URL. Returns null when the API call fails —
 * caller stores the raw upload anyway; we'll re-analyze later.
 */
export async function analyzeImageForAgent(
  imageUrl: string,
  agentId: string,
  businessType: string | null,
): Promise<VisualAnalysis | null> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return null;

  const agentHint: Record<string, string> = {
    content: 'The client uploaded this image as inspiration for their social-media content. Focus on what can be REPLICATED or REFERENCED in future Instagram/TikTok posts.',
    dm_instagram: 'The client uploaded this as visual context so Jade can reference the space when replying to DMs about it.',
    default: 'The client uploaded this as reference material for their business.',
  };

  const instruction = agentHint[agentId] || agentHint.default;
  const bizHint = businessType ? `Their business type is: ${businessType}.` : '';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: `You analyze a photo uploaded by a small business owner so AI agents can produce content that matches the REAL space / brand. Be concrete, grounded, never invent what you don't see. Reply ONLY with a valid JSON object matching this shape:

{
  "color_palette": ["#hex", "#hex", "#hex"],   // 2-5 dominant colors
  "ambiance": "one short phrase (max 8 words)",
  "style_descriptors": ["adj1", "adj2", "adj3"],
  "lighting": "natural | warm | neon | dim | bright | mixed",
  "space_type": "specific room or space type",
  "visible_elements": ["item1", "item2", "item3"],   // 3-6 concrete things you see
  "suggested_use": "one line: how should Jade use this in future social posts?",
  "summary": "one sentence describing the image for future prompts"
}

${instruction}
${bizHint}`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: 'Analyze this photo and return the JSON.' },
          ],
        }],
      }),
    });

    if (!res.ok) {
      console.error('[VisualAnalyzer] API error:', res.status, (await res.text()).substring(0, 200));
      return null;
    }

    const data = await res.json();
    let txt = (data.content?.[0]?.text || '').trim();
    txt = txt.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(txt);

    return {
      color_palette: Array.isArray(parsed.color_palette) ? parsed.color_palette.slice(0, 5).map(String) : [],
      ambiance: String(parsed.ambiance || '').substring(0, 100),
      style_descriptors: Array.isArray(parsed.style_descriptors) ? parsed.style_descriptors.slice(0, 5).map(String) : [],
      lighting: String(parsed.lighting || '').substring(0, 30),
      space_type: String(parsed.space_type || '').substring(0, 60),
      visible_elements: Array.isArray(parsed.visible_elements) ? parsed.visible_elements.slice(0, 8).map(String) : [],
      suggested_use: String(parsed.suggested_use || '').substring(0, 200),
      summary: String(parsed.summary || '').substring(0, 300),
    };
  } catch (e: any) {
    console.error('[VisualAnalyzer] Error:', String(e?.message || e).substring(0, 200));
    return null;
  }
}

/**
 * Format a list of analyses into a compact "visual reference" block for
 * content-generation prompts. Designed to be injected AFTER the brand
 * context so agents produce content grounded in the client's actual
 * visual identity.
 */
export function analysesToPromptContext(analyses: VisualAnalysis[], maxItems = 6): string {
  if (analyses.length === 0) return '';
  const items = analyses.slice(0, maxItems);

  // Aggregate color palette across all uploads (dedup, keep most frequent).
  const colorCount = new Map<string, number>();
  for (const a of analyses) {
    for (const c of a.color_palette) {
      const k = c.toUpperCase();
      colorCount.set(k, (colorCount.get(k) || 0) + 1);
    }
  }
  const topColors = [...colorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);

  // Aggregate style adjectives.
  const styleCount = new Map<string, number>();
  for (const a of analyses) {
    for (const s of a.style_descriptors) {
      const k = s.toLowerCase();
      styleCount.set(k, (styleCount.get(k) || 0) + 1);
    }
  }
  const topStyles = [...styleCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);

  const lines: string[] = [];
  lines.push('=== RÉFÉRENCES VISUELLES UPLOADÉES PAR LE CLIENT ===');
  if (topColors.length > 0) lines.push(`Palette dominante : ${topColors.join(', ')}`);
  if (topStyles.length > 0) lines.push(`Style récurrent : ${topStyles.join(', ')}`);
  lines.push('');
  lines.push('Photos analysées :');
  for (const a of items) {
    lines.push(`- ${a.summary} [ambiance: ${a.ambiance}; ${a.visible_elements.slice(0, 4).join(', ')}]`);
  }
  lines.push('');
  lines.push('IMPORTANT : tes prompts visuels et tes suggestions de shots DOIVENT rester cohérents avec ce style et cette palette — c\'est le VRAI univers visuel du client. Ne propose pas un style contradictoire.');

  return lines.join('\n');
}
