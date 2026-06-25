import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Échantillon "magie" de l'onboarding — montre un VRAI exemple de notre vitrine
 * pour le secteur du client (image + reel), pour qu'il ressente la valeur dès
 * les premières secondes (founder : "feel the magic in 3 taps", value-first).
 * Puise dans la bibliothèque vitrine du compte agence (50 types générés).
 */
const AGENCY_UID = 'd7d3ae4a-c420-40e1-b2c9-b983d960d1fb';

// Mappe la verticale d'onboarding → libellé(s) de la vitrine.
const SECTOR_TO_LABEL: Record<string, string[]> = {
  restaurant: ['Restaurant', 'Pizzeria', 'Café', 'Fast-food', 'Boulangerie'],
  beaute: ['Institut de beauté', 'Coiffeur', 'Barbier', 'Onglerie', 'Spa', 'Lash bar'],
  coach: ['Coach sportif', 'Salle de sport', 'Yoga', 'Studio de danse'],
  immobilier: ['Agence immobilière'],
  boutique: ['Boutique mode', 'Fleuriste', 'Bijouterie', 'Décoration'],
  autre: ['Restaurant', 'Boutique mode', 'Institut de beauté'],
};

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const sector = (new URL(req.url).searchParams.get('sector') || 'autre').toLowerCase();
  const labels = SECTOR_TO_LABEL[sector] || SECTOR_TO_LABEL.autre;
  const supabase = sb();
  let imageUrl: string | null = null;
  let videoUrl: string | null = null;
  let usedLabel = labels[0];

  for (const label of labels) {
    if (!imageUrl) {
      const { data: imgs } = await supabase.from('saved_images')
        .select('image_url').eq('user_id', AGENCY_UID).ilike('business_type', `%${label}%`).limit(5);
      if (imgs && imgs.length) { imageUrl = (imgs[Math.floor(imgs.length / 2)] as any)?.image_url || (imgs[0] as any).image_url; usedLabel = label; }
    }
    if (!videoUrl) {
      const { data: vids } = await supabase.from('my_videos')
        .select('video_url, title').eq('user_id', AGENCY_UID).ilike('title', `%[${label}]%`).limit(5);
      if (vids && vids.length) { videoUrl = (vids[0] as any).video_url; }
    }
    if (imageUrl && videoUrl) break;
  }

  return NextResponse.json({ ok: true, sector, label: usedLabel, imageUrl, videoUrl });
}
