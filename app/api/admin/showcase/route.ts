import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { callGemini } from '@/lib/agents/gemini';
import { getActiveLearnings } from '@/lib/agents/learning';
import { formatLearningsForPrompt } from '@/lib/agents/learning';

export const runtime = 'nodejs';
export const maxDuration = 120;

const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Business types with showcase descriptions */
const BUSINESS_TYPES: Record<string, { label: string; emoji: string; examples: string[] }> = {
  restaurant: {
    label: 'Restaurant',
    emoji: '🍽️',
    examples: [
      'Un plat signature gastronomique joliment dressé sur assiette blanche, lumière chaude naturelle, style food photography magazine',
      'Ambiance terrasse de restaurant le soir avec guirlandes lumineuses, tables dressées, clients souriants flous en arrière-plan',
      'Chef en cuisine préparant un plat avec des flammes, action shot dynamique, éclairage dramatique',
      'Dessert artisanal avec décoration florale, vue du dessus flat lay, fond marbre, couleurs pastel',
      'Story Instagram du menu du jour écrit sur ardoise, avec un café latte art à côté, ambiance cosy',
    ],
  },
  boutique: {
    label: 'Boutique',
    emoji: '🛍️',
    examples: [
      'Vitrine de boutique de mode élégante avec mannequins habillés tendance printemps, éclairage chaud doré',
      'Flat lay de produits mode : sac, chaussures, lunettes de soleil sur fond uni rose poudré',
      'Intérieur de boutique minimaliste avec portants de vêtements bien rangés, plantes vertes, lumière naturelle',
      'Nouvelle collection lookbook : modèle marchant dans la rue avec tenue streetwear chic, lumière golden hour',
      'Emballage cadeau premium avec ruban satin, packaging unboxing experience luxueux',
    ],
  },
  coach: {
    label: 'Coach / Fitness',
    emoji: '💪',
    examples: [
      'Coach sportif dynamique en plein exercice dans une salle moderne, énergie positive, éclairage néon bleu',
      'Transformation avant/après : split screen stylisé avec progrès fitness, fond gradient motivant',
      'Session de coaching en petit groupe en extérieur, parc verdoyant, soleil levant, ambiance motivante',
      'Plan nutritionnel healthy bowl coloré, superaliments arrangés artistiquement, vue du dessus',
      'Citation motivante sur fond photographique de montagne au lever du soleil, typographie moderne épurée',
    ],
  },
  coiffeur: {
    label: 'Coiffeur / Barbier',
    emoji: '💈',
    examples: [
      'Résultat coupe tendance homme avec dégradé parfait, vue de profil, éclairage studio professionnel',
      'Coloration balayage naturel femme, cheveux ondulés brillants, reflets dorés, photo portrait lumineux',
      'Intérieur de salon de coiffure moderne avec miroirs, fauteuils en cuir, ambiance industrielle chic',
      'Barbier au travail avec rasoir droit, gros plan sur les mains, atmosphère vintage et soignée',
      'Avant/après transformation capillaire spectaculaire, side by side, même angle et éclairage',
    ],
  },
  caviste: {
    label: 'Caviste / Fleuriste',
    emoji: '🍷',
    examples: [
      'Cave à vin avec bouteilles premium alignées sur étagères bois, lumière tamisée chaude ambrée',
      'Dégustation de vin : verre de rouge tenu en main, vignoble flou en arrière-plan, lumière dorée',
      'Composition florale artisanale luxuriante avec pivoines et eucalyptus, style champêtre chic',
      'Bouquet de fleurs de saison sur comptoir de bois rustique, lumière naturelle latérale douce',
      'Plateau fromages et vin avec raisins, miel, noix, sur planche bois, ambiance épicurienne',
    ],
  },
  freelance: {
    label: 'Freelance / Consultant',
    emoji: '💻',
    examples: [
      'Espace de travail minimaliste créatif avec MacBook, café, plante, lumière naturelle fenêtre',
      'Personal branding portrait professionnel en milieu urbain, fond moderne flou, confiance naturelle',
      'Mood board digital pour projet créatif, palette de couleurs harmonieuse, éléments de design',
      'Réunion client en visio avec écran montrant des graphiques de résultats, bureau moderne épuré',
      'Portfolio créatif en flat lay : sketchbook, tablette graphique, échantillons couleurs, matériaux',
    ],
  },
  professionnel: {
    label: 'Professionnel (avocat, santé...)',
    emoji: '⚖️',
    examples: [
      'Cabinet professionnel élégant avec bibliothèque, bureau en bois noble, lumière naturelle chaude',
      'Portrait professionnel confiance : médecin ou avocat souriant, fond neutre, tenue soignée',
      'Salle de consultation moderne et rassurante, plantes vertes, couleurs apaisantes, mobilier design',
      'Équipe professionnelle souriante en réunion, ambiance collaborative et sérieuse, bureau vitré',
      'Détail luxe : stylo sur document, montre élégante, fond flou bureau, qualité premium',
    ],
  },
  services: {
    label: 'Artisan / Services',
    emoji: '🔧',
    examples: [
      'Artisan au travail : gros plan sur les mains expertes, matériaux de qualité, lumière atelier',
      'Résultat avant/après rénovation : pièce transformée, photo grand angle, lumière naturelle',
      'Outils de travail artisanal disposés soigneusement sur établi bois, style photographique éditorial',
      'Chantier terminé avec finitions parfaites, client satisfait souriant, lumière naturelle belle',
      'Véhicule professionnel avec logo sur chantier, image de marque professionnelle et fiable',
    ],
  },
  pme: {
    label: 'PME / Startup',
    emoji: '🏢',
    examples: [
      'Équipe startup en open space moderne, brainstorming créatif, post-its colorés, énergie positive',
      'Product shot professionnel sur fond épuré, packaging premium, éclairage studio commercial',
      'Bureau corporate moderne avec vue ville, décoration design, ambiance productive et inspirante',
      'Événement entreprise networking : professionnels qui échangent, badges, décor branded élégant',
      'Infographie stylisée montrant croissance et résultats, données visuelles impactantes, couleurs vives',
    ],
  },
};

/**
 * GET: List existing showcase examples
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch existing showcase examples from agent_logs
    const { data: logs } = await supabase
      .from('agent_logs')
      .select('data, created_at')
      .eq('agent', 'content')
      .eq('action', 'showcase_generate')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(20);

    // Flatten all showcase items from logs
    const showcases: Record<string, any[]> = {};
    for (const log of logs || []) {
      const type = log.data?.business_type;
      const items = log.data?.items || [];
      if (type && items.length > 0) {
        if (!showcases[type]) showcases[type] = [];
        showcases[type].push(...items);
      }
    }

    return NextResponse.json({
      ok: true,
      types: BUSINESS_TYPES,
      showcases,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Generate showcase examples for a business type
 * Body: { type: 'restaurant' | 'boutique' | ... }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { type } = await request.json();
    if (!type || !BUSINESS_TYPES[type]) {
      return NextResponse.json({ error: 'Invalid business type' }, { status: 400 });
    }

    const bizConfig = BUSINESS_TYPES[type];

    // Load knowledge pool learnings for elite-quality generation
    let learningContext = '';
    try {
      const learnings = await getActiveLearnings(supabase, 'content');
      if (learnings.length > 0) {
        learningContext = formatLearningsForPrompt(learnings, []);
      }
    } catch { /* learnings optional */ }

    // Use AI to generate optimized visual descriptions based on learnings
    let visualDescriptions = bizConfig.examples;
    try {
      const aiResult = await callGemini({
        system: `Tu es un directeur artistique d'élite spécialisé dans le contenu visuel pour réseaux sociaux.
Tu connais parfaitement les tendances Instagram, TikTok et LinkedIn pour les commerces en France.

${learningContext ? `CONNAISSANCES DU POOL (utilise ces insights pour optimiser) :\n${learningContext}\n` : ''}

Ton objectif : créer 5 descriptions de visuels ULTRA-PERCUTANTS pour un ${bizConfig.label} qui cherche à attirer plus de clients via les réseaux sociaux.

CRITÈRES STAR (Situation → Tâche → Action → Résultat) :
- Chaque visuel doit raconter une mini-histoire
- L'image doit donner envie instantanément (scroll-stopping)
- La qualité doit crier "professionnel" pour que le prospect se dise "je veux ÇA pour mon business"
- Chaque visuel doit montrer un RÉSULTAT concret (clients, produit, ambiance)

CONTRAINTES TECHNIQUES :
- Description purement visuelle (pas de texte dans l'image)
- Format carré optimisé Instagram (1:1)
- Chaque description doit être complète et autonome
- Style photographique professionnel, pas de dessin/illustration
- Lumière naturelle ou studio, couleurs vibrantes mais naturelles`,
        message: `Génère 5 descriptions de visuels pour un ${bizConfig.label} français.

Chaque description doit être un prompt visuel complet en UNE phrase de 20-40 mots.
Varie les angles : produit, ambiance, action, résultat, social proof.

Réponds en JSON : ["description 1", "description 2", "description 3", "description 4", "description 5"]
UNIQUEMENT du JSON valide.`,
        maxTokens: 1000,
      });

      if (aiResult) {
        const cleaned = aiResult.replace(/```[\w]*\s*/g, '').trim();
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length >= 3) {
            visualDescriptions = parsed.slice(0, 5);
          }
        }
      }
    } catch (err) {
      console.warn(`[Showcase] AI description failed for ${type}, using defaults:`, err);
    }

    // Generate 5 images with Seedream
    const items: { description: string; url: string | null; generated_at: string }[] = [];

    for (const desc of visualDescriptions) {
      try {
        const res = await fetch(SEEDREAM_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'seedream-3.0',
            prompt: `Professional social media post photo for a ${bizConfig.label} business in France. ${desc}. Ultra high quality, photorealistic, no text, no watermark, no logo, no words.`,
            negative_prompt: 'text, words, letters, watermark, logo, blurry, low quality, deformed, ugly, cartoon, anime, illustration, drawing, painting',
            response_format: 'url',
            watermark: false,
            size: '1024x1024',
            seed: -1,
          }),
        });

        const data = await res.json();
        const url = data.data?.[0]?.url || null;

        items.push({
          description: desc,
          url,
          generated_at: new Date().toISOString(),
        });

        if (url) {
          console.log(`[Showcase] Generated ${type}: ${desc.substring(0, 60)}...`);
        } else {
          console.warn(`[Showcase] No image returned for ${type}: ${JSON.stringify(data).substring(0, 200)}`);
        }
      } catch (err: any) {
        console.error(`[Showcase] Generation error for ${type}:`, err.message);
        items.push({ description: desc, url: null, generated_at: new Date().toISOString() });
      }

      // Small delay between requests
      await new Promise(r => setTimeout(r, 1500));
    }

    // Log the generation
    await supabase.from('agent_logs').insert({
      agent: 'content',
      action: 'showcase_generate',
      status: 'success',
      data: {
        business_type: type,
        items: items.filter(i => i.url),
        total: items.length,
        successful: items.filter(i => i.url).length,
      },
    });

    return NextResponse.json({
      ok: true,
      type,
      items,
      successful: items.filter(i => i.url).length,
    });
  } catch (err: any) {
    console.error('[Showcase] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
