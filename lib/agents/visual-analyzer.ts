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
  // Logo-specific enrichments — only populated when Claude detects the
  // image is a logo. Other image types leave these empty.
  is_logo?: boolean;
  typography_style?: string;   // "sans-serif modern", "serif editorial"…
  brand_personality?: string[]; // ["premium", "playful", "minimalist"]
  icon_style?: string;          // "monogram", "pictographic", "wordmark"
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
        max_tokens: 900,
        system: `You analyze a photo uploaded by a small business owner so AI agents can produce content that matches the REAL space / brand. Be concrete, grounded, never invent what you don't see. Reply ONLY with a valid JSON object matching this shape:

{
  "is_logo": true | false,                      // is this image a logo / wordmark / icon?
  "color_palette": ["#hex", "#hex", "#hex"],   // 2-5 dominant colors (for logos, the brand palette)
  "ambiance": "one short phrase (max 8 words)",
  "style_descriptors": ["adj1", "adj2", "adj3"],
  "lighting": "natural | warm | neon | dim | bright | mixed | N/A for logos",
  "space_type": "specific room or space type (N/A for logos)",
  "visible_elements": ["item1", "item2", "item3"],   // 3-6 concrete things you see
  "typography_style": "only for logos: describe the wordmark type, e.g. 'bold sans-serif modern', 'elegant serif editorial', 'handwritten script'",
  "brand_personality": ["adj", "adj"],          // only for logos: ["premium", "playful", "minimalist", "artisanal"…]
  "icon_style": "only for logos: 'wordmark' | 'monogram' | 'pictographic' | 'combination' | 'abstract'",
  "suggested_use": "one line on how the content agent should use this in future posts",
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
      is_logo: typeof parsed.is_logo === 'boolean' ? parsed.is_logo : undefined,
      typography_style: parsed.typography_style ? String(parsed.typography_style).substring(0, 100) : undefined,
      brand_personality: Array.isArray(parsed.brand_personality) ? parsed.brand_personality.slice(0, 5).map(String) : undefined,
      icon_style: parsed.icon_style ? String(parsed.icon_style).substring(0, 40) : undefined,
    };
  } catch (e: any) {
    console.error('[VisualAnalyzer] Error:', String(e?.message || e).substring(0, 200));
    return null;
  }
}

/**
 * Rich analysis of an uploaded PDF/document. The output schema is the
 * superset of what the UI needs: brand info, tone, style cues, useful
 * facts about the business. Every field is optional so we don't force
 * hallucination when the doc doesn't cover it.
 */
export interface DocumentAnalysis {
  doc_type: string;              // "brand guidelines" | "menu" | "price list" | "product catalogue" | ...
  brand_colors: string[];        // hex
  typography: string[];          // font names or family descriptors
  brand_voice?: string;          // one line about tone
  key_messages: string[];        // brand slogans / taglines extracted
  products_services?: string[];  // for a menu / catalogue
  unique_selling_points: string[];
  facts: string[];               // concrete facts extractable (hours, address, specialties)
  summary: string;
}

/**
 * Extract raw text from a remote PDF via pdfjs-dist, then run Claude to
 * structure it. Works for brand guidelines, menus, catalogs, company
 * decks — anything text-based. For image-heavy PDFs we'd need per-page
 * vision; out of scope for this pass.
 */
export async function analyzePdfForAgent(
  pdfUrl: string,
  agentId: string,
  businessType: string | null,
): Promise<DocumentAnalysis | null> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return null;

  let text = '';
  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    // Lazy-load pdfjs so the module tree stays light for image-only flows.
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null);
    if (!pdfjs) return null;
    const doc = await pdfjs.getDocument({ data: buf, useSystemFonts: true }).promise;
    const maxPages = Math.min(doc.numPages, 20); // cap to avoid 100-page decks
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it: any) => it.str).join(' ') + '\n\n';
    }
    text = text.trim().slice(0, 30_000); // 30k chars fits easily in Sonnet context
  } catch {
    return null;
  }

  if (!text) return null;

  const bizHint = businessType ? `Business type: ${businessType}.` : '';
  const agentHint = agentId === 'content'
    ? 'This will feed Jade\'s content-generation prompts (posts / scripts / captions) so focus on VISUAL + TONE data.'
    : agentId === 'email'
      ? 'This will feed Hugo\'s email sequences so focus on BRAND VOICE + OFFER CLARITY + USPs.'
      : agentId === 'gmaps'
        ? 'This will feed Théo\'s Google review replies so focus on SPECIALTIES, HOURS, VALUES.'
        : 'General business context for all agents.';

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
        max_tokens: 1200,
        system: `You analyze a PDF uploaded by a small business owner so AI agents can ground their work in the client's real brand + offer. Never invent what's not in the text. Reply ONLY with a valid JSON matching this shape:

{
  "doc_type": "short label",
  "brand_colors": ["#hex", ...],                 // colors explicitly cited OR described (translate "deep blue" → #1e3a5f only if confident)
  "typography": ["Font name", ...],
  "brand_voice": "one line on tone (friendly, formal, playful…)",
  "key_messages": ["slogan 1", ...],
  "products_services": ["item1", ...],           // only if the doc is a menu/catalog
  "unique_selling_points": ["USP 1", ...],
  "facts": ["hours: ...", "address: ...", "specialty: ..."],
  "summary": "one-paragraph synthesis for agents"
}

${agentHint}
${bizHint}`,
        messages: [{ role: 'user', content: `PDF CONTENT (up to 20 pages, ~30k chars):\n\n${text}\n\nReturn the JSON.` }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    let txt = (data.content?.[0]?.text || '').trim();
    txt = txt.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(txt);
    return {
      doc_type: String(parsed.doc_type || '').substring(0, 50),
      brand_colors: Array.isArray(parsed.brand_colors) ? parsed.brand_colors.slice(0, 8).map(String) : [],
      typography: Array.isArray(parsed.typography) ? parsed.typography.slice(0, 5).map(String) : [],
      brand_voice: parsed.brand_voice ? String(parsed.brand_voice).substring(0, 200) : undefined,
      key_messages: Array.isArray(parsed.key_messages) ? parsed.key_messages.slice(0, 8).map(String) : [],
      products_services: Array.isArray(parsed.products_services) ? parsed.products_services.slice(0, 20).map(String) : undefined,
      unique_selling_points: Array.isArray(parsed.unique_selling_points) ? parsed.unique_selling_points.slice(0, 8).map(String) : [],
      facts: Array.isArray(parsed.facts) ? parsed.facts.slice(0, 12).map(String) : [],
      summary: String(parsed.summary || '').substring(0, 800),
    };
  } catch {
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

/**
 * Format document analyses (PDF brand guidelines, menus, catalogs) into
 * a prompt context block for any agent. Merges brand colors, USPs,
 * key messages across all docs for a consolidated brand signal.
 */
export function documentsToPromptContext(docs: DocumentAnalysis[], maxItems = 4): string {
  if (docs.length === 0) return '';
  const picks = docs.slice(0, maxItems);

  const colors = new Set<string>();
  const usps = new Set<string>();
  const messages = new Set<string>();
  const facts = new Set<string>();
  const products = new Set<string>();
  for (const d of docs) {
    for (const c of d.brand_colors) colors.add(c.toUpperCase());
    for (const u of d.unique_selling_points) usps.add(u);
    for (const m of d.key_messages) messages.add(m);
    for (const f of d.facts) facts.add(f);
    if (d.products_services) for (const p of d.products_services) products.add(p);
  }

  const lines: string[] = [];
  lines.push('=== DOCUMENTS CLIENT ANALYSÉS ===');
  if (colors.size > 0) lines.push(`Couleurs de marque : ${[...colors].slice(0, 8).join(', ')}`);
  if (messages.size > 0) lines.push(`Messages-clés : ${[...messages].slice(0, 4).map(m => `"${m}"`).join(' / ')}`);
  if (usps.size > 0) lines.push(`Points forts (USPs) : ${[...usps].slice(0, 4).join(' | ')}`);
  if (facts.size > 0) lines.push(`Faits concrets : ${[...facts].slice(0, 8).join(' ; ')}`);
  if (products.size > 0) lines.push(`Produits/services listés : ${[...products].slice(0, 10).join(', ')}`);
  lines.push('');
  lines.push('Documents :');
  for (const d of picks) {
    const voice = d.brand_voice ? ` — voix : ${d.brand_voice}` : '';
    lines.push(`- [${d.doc_type}] ${d.summary.substring(0, 200)}${voice}`);
  }

  return lines.join('\n');
}

/**
 * Load every analyzed upload for a given agent + format them as a
 * single "client context" block mixing visual and document analyses.
 *
 * This is the one-call helper any agent uses to bring the client's
 * uploaded material into its generation prompt. Used by Jade (content),
 * Hugo (email), Léna (DMs), Théo (reviews), Clara (onboarding).
 */
export async function loadAgentUploadsContext(
  supabase: any,
  userId: string,
  agentId: string,
): Promise<string> {
  const { data: rows } = await supabase
    .from('agent_uploads')
    .select('ai_analysis, file_type')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .not('ai_analysis', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!rows || rows.length === 0) return '';

  const visuals: VisualAnalysis[] = [];
  const docs: DocumentAnalysis[] = [];
  for (const r of rows) {
    const a = r.ai_analysis;
    if (!a) continue;
    // Document analyses have doc_type, visual analyses have color_palette + ambiance
    if (a.doc_type !== undefined || a.brand_voice !== undefined || a.key_messages !== undefined) {
      docs.push(a as DocumentAnalysis);
    } else if (a.color_palette !== undefined || a.ambiance !== undefined) {
      visuals.push(a as VisualAnalysis);
    }
  }

  const blocks: string[] = [];
  const v = analysesToPromptContext(visuals);
  const d = documentsToPromptContext(docs);
  if (v) blocks.push(v);
  if (d) blocks.push(d);
  return blocks.join('\n\n');
}
