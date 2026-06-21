import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateJadeImage } from '@/lib/visuals/jade-prompter';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Showcase IMAGE generator (CRON) — top-quality photorealistic images for the
 * démarchage library. generateJadeImage (Seedream élite, anti-AI) → saved_images
 * tagged with business_type so they show in "mes créations" by type.
 * Body: { businessType, visualDescription, count?, userId? }
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const cs = process.env.CRON_SECRET;
  if (!cs || req.headers.get('authorization') !== `Bearer ${cs}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const businessType: string = body.businessType || 'commerce local';
  const vd: string = body.visualDescription || businessType;
  const count = Math.min(3, Math.max(1, Number(body.count) || 1));
  const userId: string = body.userId || 'd7d3ae4a-c420-40e1-b2c9-b983d960d1fb';
  const supabase = sb();

  const craft = `Photographie documentaire ultra-réaliste, composition règle des tiers, lumière naturelle motivée (golden hour / fenêtre), couleurs naturelles chaleureuses, grain 35mm subtil. PAS un rendu 3D, PAS une illustration — une vraie photo. AUCUN texte, lettre, chiffre, enseigne lisible.`;
  // 3 angles/propositions DISTINCTS du même business (founder: pas 3 images
  // identiques — variété d'angles + d'offres).
  const ANGLES = [
    { tag: 'plan large', p: `Plan LARGE d'ambiance d'un ${businessType} : on voit le lieu/l'espace dans son ensemble, accueillant. ${vd}.` },
    { tag: 'détail produit', p: `GROS PLAN sur LE produit/la prestation signature d'un ${businessType} (le détail qui donne envie). ${vd}.` },
    { tag: 'lifestyle', p: `Scène LIFESTYLE dans un ${businessType} : une personne en situation (cliente/artisan) qui vit le moment, émotion authentique, donne envie de venir. ${vd}.` },
  ];
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = ANGLES[i % ANGLES.length];
    const prompt = `${a.p.slice(0, 340)} ${craft}`;
    try {
      const url = await generateJadeImage(prompt, i === 0 ? 'post' : 'story', userId);
      if (!url) continue;
      await supabase.from('saved_images').insert({
        user_id: userId, image_url: url, business_type: businessType,
        title: `[${businessType}] Vitrine image — ${a.tag}`, ai_model: 'seedream',
        generation_prompt: prompt.slice(0, 500), tags: ['vitrine', 'demarchage', a.tag],
        is_favorite: false, download_count: 0, view_count: 0,
      });
      urls.push(url);
    } catch { /* skip */ }
  }
  return NextResponse.json({ ok: true, businessType, generated: urls.length, urls });
}
export async function GET(req: NextRequest) { return POST(req); }
