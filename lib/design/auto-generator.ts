/**
 * Automatic design template generator.
 *
 * The flow we settled on after realising clients won't go to claude.ai/design
 * themselves:
 *
 *   Client uploads brand assets in KeiroAI (logo, product photos, brand
 *   guide PDF, Excel spec of tone/voice) → visual-analyzer.ts extracts
 *   palette + typography + personality → THIS module asks Claude Sonnet
 *   to synthesise 3-5 production-grade HTML templates (hero section,
 *   social post, email header, case-study one-pager, story template)
 *   based on the extracted brand → stored in design_templates → Jade
 *   picks them up as style references on every visual she generates.
 *
 * Net effect: one upload of "our brand guide" on day zero = every visual
 * produced afterwards by every agent is on-brand. No Canva, no Claude
 * Design round-trip, no designer in the loop.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadAgentUploadsContext } from '@/lib/agents/visual-analyzer';

const TEMPLATE_BRIEFS = [
  {
    category: 'social',
    name: 'Instagram post template',
    brief: 'A 1:1 square Instagram post template (hook overlay on photo, brand footer, subtle gradient). Usable as a reusable background/layer for future posts.',
  },
  {
    category: 'social',
    name: 'Instagram story template',
    brief: 'A 9:16 vertical Instagram story template with large headline at top, call-to-action bar at bottom, brand mark in corner.',
  },
  {
    category: 'landing',
    name: 'Hero section',
    brief: 'A hero section for a landing page — headline + subheadline + primary CTA button + visual placeholder, modern editorial layout.',
  },
  {
    category: 'email',
    name: 'Email header',
    brief: 'An email header block (600px wide) with logo placement, preheader line, hero image placeholder.',
  },
  {
    category: 'onepager',
    name: 'Case study one-pager',
    brief: 'A single-page case study layout: client name, problem, solution, 3-stat row, testimonial quote, call-to-action.',
  },
];

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function getClaude() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  return new Anthropic({ apiKey: key });
}

async function collectBrandContext(supabase: SupabaseClient, userId: string): Promise<{
  context: string;
  palette: string[];
  businessType: string | null;
  businessName: string | null;
}> {
  // Combine analyses from every agent-scoped upload the client made
  const { data: uploads } = await supabase
    .from('agent_uploads')
    .select('ai_analysis, agent_id, file_type, created_at')
    .eq('user_id', userId)
    .not('ai_analysis', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30);

  const { data: dossier } = await supabase
    .from('business_dossiers')
    .select('company_name, company_description, business_type, brand_tone, target_audience, value_proposition, unique_selling_points, brand_colors, visual_style, content_themes')
    .eq('user_id', userId)
    .maybeSingle();

  const palette = new Set<string>();
  const blocks: string[] = [];

  if (dossier) {
    blocks.push(`BUSINESS PROFILE:\n- Name: ${dossier.company_name || 'N/A'}\n- Type: ${dossier.business_type || 'N/A'}\n- Description: ${dossier.company_description || 'N/A'}\n- Brand tone: ${dossier.brand_tone || 'N/A'}\n- Target audience: ${dossier.target_audience || 'N/A'}\n- Value proposition: ${dossier.value_proposition || 'N/A'}\n- USPs: ${Array.isArray(dossier.unique_selling_points) ? dossier.unique_selling_points.join('; ') : (dossier.unique_selling_points || 'N/A')}`);

    // brand_colors can be stored as jsonb array of hex strings or an object
    if (Array.isArray(dossier.brand_colors)) {
      dossier.brand_colors.forEach((c: string) => { if (typeof c === 'string' && c.startsWith('#')) palette.add(c); });
    } else if (dossier.brand_colors && typeof dossier.brand_colors === 'object') {
      Object.values(dossier.brand_colors).forEach((c: any) => { if (typeof c === 'string' && c.startsWith('#')) palette.add(c); });
    }

    if (dossier.visual_style) {
      blocks.push(`VISUAL STYLE:\n- ${dossier.visual_style}`);
    }
    if (dossier.content_themes) {
      blocks.push(`CONTENT THEMES:\n- ${Array.isArray(dossier.content_themes) ? dossier.content_themes.join(', ') : dossier.content_themes}`);
    }
  }

  const visualLines: string[] = [];
  const logoLines: string[] = [];
  for (const u of uploads ?? []) {
    const a = u.ai_analysis;
    if (!a) continue;
    if (Array.isArray(a.color_palette)) {
      a.color_palette.forEach((c: string) => palette.add(c));
    }
    if (a.is_logo) {
      logoLines.push(`- Logo: ${a.typography_style || 'brand mark'} · personality ${Array.isArray(a.brand_personality) ? a.brand_personality.join('/') : 'neutral'}`);
    } else if (a.ambiance) {
      visualLines.push(`- ${a.ambiance} · ${Array.isArray(a.style_descriptors) ? a.style_descriptors.slice(0, 3).join('/') : 'n/a'}`);
    }
  }

  if (logoLines.length) blocks.push(`LOGO & BRANDING:\n${logoLines.slice(0, 3).join('\n')}`);
  if (visualLines.length) blocks.push(`VISUAL REFERENCES:\n${visualLines.slice(0, 5).join('\n')}`);
  if (palette.size) blocks.push(`PALETTE:\n${Array.from(palette).slice(0, 6).join(', ')}`);

  return {
    context: blocks.join('\n\n'),
    palette: Array.from(palette).slice(0, 6),
    businessType: dossier?.business_type || null,
    businessName: dossier?.company_name || null,
  };
}

/**
 * Generate a single HTML template for a brief. Returns cleaned HTML
 * (inline styles only, no external resources, no scripts) ready to store.
 */
async function generateTemplate(
  brandContext: string,
  businessType: string | null,
  businessName: string | null,
  templateBrief: { category: string; name: string; brief: string },
): Promise<string | null> {
  try {
    const res = await getClaude().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      system: `You are an elite brand designer producing production-grade HTML templates for KeiroAI clients. Output standalone HTML only — no <!DOCTYPE>, no <html>, no <head>, just a single root <section> or <div> with inline CSS (style="...") so it renders in any context.

HARD RULES:
- Inline CSS only. No <link>, no <script>, no external fonts (use system stack "system-ui, -apple-system, Segoe UI, sans-serif" or a specified Google Font name in comments).
- All copy in French unless the brand voice indicates English.
- Respect the brand palette EXACTLY (use the hex codes the user provides). Never invent off-brand colours.
- Use real typographic hierarchy (heading 2.5-4rem, body 1rem, small 0.875rem). Line-height 1.3-1.6.
- Include brand-fitting placeholder copy that reflects the business type and voice.
- The template must be visually production-ready — think Apple, Linear, Notion, not bootstrap.
- No images that need external URLs. Use CSS gradients, shapes, or inline SVG for visuals.
- Output NOTHING except the HTML. No markdown fences, no intro, no explanation.`,
      messages: [{
        role: 'user',
        content: `Brand context:\n${brandContext}\n\nBusiness: ${businessName || 'KeiroAI client'} (${businessType || 'small business'})\n\nTemplate to produce:\nName: ${templateBrief.name}\nCategory: ${templateBrief.category}\nBrief: ${templateBrief.brief}\n\nProduce the HTML now.`,
      }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    // Strip markdown fences if the model added them anyway
    const cleaned = text
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    // Basic safety scrub — belt and suspenders
    const safe = cleaned
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');

    return safe.length > 50 ? safe : null;
  } catch (err: any) {
    console.error('[auto-generator] template generation failed:', err?.message);
    return null;
  }
}

export type AutoGenResult = {
  userId: string;
  generated: number;
  failed: number;
  palette: string[];
  templates: Array<{ name: string; category: string; id?: string; status: 'stored' | 'failed' }>;
};

/**
 * Main entry point. Reads all the client's brand material, generates the
 * full set of templates in parallel, and stores successful ones in
 * design_templates. Idempotent by "source_hash" — re-running replaces the
 * previous auto-generated set with a fresh one.
 */
export async function generateBrandTemplatesForUser(userId: string): Promise<AutoGenResult> {
  const supabase = admin();
  const brand = await collectBrandContext(supabase, userId);

  if (!brand.context || brand.context.length < 40) {
    return {
      userId,
      generated: 0,
      failed: 0,
      palette: [],
      templates: [],
      ...({ warning: 'insufficient_brand_context' } as any),
    };
  }

  // Delete previous auto-generated templates so we don't accumulate stale versions
  await supabase
    .from('design_templates')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'auto_generated');

  const results = await Promise.all(
    TEMPLATE_BRIEFS.map(async (brief) => {
      const html = await generateTemplate(brand.context, brand.businessType, brand.businessName, brief);
      if (!html) {
        return { name: brief.name, category: brief.category, status: 'failed' as const };
      }
      const { data, error } = await supabase
        .from('design_templates')
        .insert({
          user_id: userId,
          source: 'auto_generated',
          name: brief.name,
          category: brief.category,
          html,
          palette: brand.palette,
          notes: `Auto-généré depuis les uploads brand du ${new Date().toLocaleDateString('fr-FR')}`,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[auto-generator] insert failed for', brief.name, error.message);
        return { name: brief.name, category: brief.category, status: 'failed' as const };
      }
      return { name: brief.name, category: brief.category, id: data.id, status: 'stored' as const };
    }),
  );

  const generated = results.filter(r => r.status === 'stored').length;
  const failed = results.length - generated;

  return {
    userId,
    generated,
    failed,
    palette: brand.palette,
    templates: results,
  };
}
