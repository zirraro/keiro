import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { generateJadeImage } from '@/lib/visuals/jade-prompter';
import { detectSector, SECTORS } from '@/lib/agents/sales-playbook';

export const runtime = 'nodejs';
export const maxDuration = 180;

/**
 * `/demo` — l'arme de closing n°1 (doc commercial) : générer EN LIVE, devant le
 * prospect, un post à partir de SON métier en ~3 min ("moment aha").
 * POST { businessType, businessName?, city?, detail? } → { imageUrl, caption, hook, sector }.
 * Le visuel sort du même pipeline photoréaliste Seedream (anti-IA, sans texte).
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const businessType: string = body.businessType || 'commerce local';
  const businessName: string = body.businessName || '';
  const city: string = body.city || '';
  const detail: string = body.detail || '';
  const sector = detectSector(businessType);
  const fiche = SECTORS[sector];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let hook = '', caption = '', imagePrompt = '';
  if (apiKey) {
    try {
      const r = await new Anthropic({ apiKey }).messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 600,
        tools: [{ name: 'demo_post', description: 'live demo post', input_schema: {
          type: 'object', properties: {
            hook: { type: 'string', description: 'accroche FR courte qui stoppe le scroll' },
            caption: { type: 'string', description: 'légende FR chaleureuse, tutoiement, vocabulaire du métier, 1 CTA doux, 5-8 hashtags pertinents. AUCUN jargon marketing.' },
            image_prompt: { type: 'string', description: 'EN: one concrete photorealistic scene of this exact business (documentary photo, natural light, 35mm, vertical). No text.' },
          }, required: ['hook', 'caption', 'image_prompt'], additionalProperties: false,
        } as any }],
        tool_choice: { type: 'tool', name: 'demo_post' },
        messages: [{ role: 'user', content: `Crée un post de DÉMONSTRATION pour : ${businessName || fiche.label}${city ? ` à ${city}` : ''} (${fiche.label}).${detail ? ` Détail: ${detail}.` : ''}\nVocabulaire à utiliser: ${fiche.vocabUse.join(', ')}. À éviter absolument: ${fiche.vocabAvoid.join(', ')}.\nLe post doit donner envie au gérant en voyant SON métier mis en valeur.` }],
      });
      const tu = r.content.find((b: any) => b.type === 'tool_use') as any;
      if (tu?.input) { hook = tu.input.hook || ''; caption = tu.input.caption || ''; imagePrompt = tu.input.image_prompt || ''; }
    } catch { /* fallback below */ }
  }
  if (!imagePrompt) imagePrompt = `Photorealistic documentary photo of a ${businessType}, natural soft light, 35mm, vertical 9:16, authentic, no text.`;
  imagePrompt += ' ABSOLUTELY no text, letters, signs with writing — blank/imagery only.';

  let imageUrl: string | null = null;
  try { imageUrl = await generateJadeImage(imagePrompt, 'story', body.userId || undefined); } catch { /* surfaced */ }

  return NextResponse.json({
    ok: !!imageUrl, sector, hook, caption, imageUrl,
    fiche: { angoisse: fiche.angoisse, heroAgent: fiche.heroAgent },
  });
}
