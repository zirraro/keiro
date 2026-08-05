import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { angleDApproche } from '@/lib/prospects/fiche';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * La tournée du samedi — les prospects d'une classe, regroupés PAR RUE.
 *
 * Le regroupement géographique est le point important, et il n'est pas
 * cosmétique : une liste triée par nom fait traverser la ville entre deux
 * portes. À raison de dix minutes perdues par déplacement inutile, un
 * classement alphabétique coûte une demi-journée sur une tournée de vingt
 * adresses.
 *
 * On regroupe par rue, puis on ordonne les rues par proximité réelle quand on
 * a les coordonnées : le trajet suit alors la géographie plutôt que l'ordre
 * d'insertion en base.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Extrait la rue d'une adresse postale française.
 *
 * On retire le numéro de voirie pour que les 12 et 48 de la même rue se
 * retrouvent ensemble — c'est tout l'intérêt du regroupement.
 */
function rueDe(adresse?: string | null): string {
  const a = String(adresse || '').trim();
  if (!a) return 'Adresse inconnue';
  const premierBloc = a.split(',')[0].trim();
  return premierBloc
    .replace(/^\d+\s*(bis|ter|quater)?\s*,?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Adresse inconnue';
}

/** Distance approximative en km — suffisante pour ordonner un trajet urbain. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * 111;
  const dLng = (b.lng - a.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Ordonne les rues en suivant le plus proche voisin.
 *
 * Ce n'est pas le trajet optimal — le problème est NP-difficile et sans intérêt
 * ici — mais sur une vingtaine d'adresses il donne un ordre de marche naturel,
 * ce qui suffit largement pour une tournée à pied.
 */
function ordonnerParProximite<T extends { lat?: number | null; lng?: number | null }>(groupes: T[]): T[] {
  const avec = groupes.filter(g => typeof g.lat === 'number' && typeof g.lng === 'number');
  const sans = groupes.filter(g => typeof g.lat !== 'number' || typeof g.lng !== 'number');
  if (avec.length < 2) return [...avec, ...sans];

  const restants = [...avec];
  const trajet: T[] = [restants.shift()!];
  while (restants.length) {
    const dernier = trajet[trajet.length - 1] as any;
    let meilleur = 0;
    let meilleureDistance = Infinity;
    for (let i = 0; i < restants.length; i++) {
      const d = distanceKm(
        { lat: dernier.lat, lng: dernier.lng },
        { lat: (restants[i] as any).lat, lng: (restants[i] as any).lng },
      );
      if (d < meilleureDistance) { meilleureDistance = d; meilleur = i; }
    }
    trajet.push(restants.splice(meilleur, 1)[0]);
  }
  // Les adresses sans coordonnées ferment la marche : on ne peut pas les
  // placer, mais les perdre serait pire.
  return [...trajet, ...sans];
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const parCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  const { user } = parCron ? { user: null } : await getAuthUser();
  if (!parCron && !user) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });

  const classe = (req.nextUrl.searchParams.get('classe') || 'A').toUpperCase();
  const ville = req.nextUrl.searchParams.get('ville');
  const format = req.nextUrl.searchParams.get('format');
  const cible = req.nextUrl.searchParams.get('user_id') || user?.id;

  const supabase = sb();
  let q = supabase
    .from('crm_prospects')
    .select('id, company, address, ville, phone, website, instagram, lat, lng, score_terrain, classe_terrain, google_rating, google_reviews, ig_status, ig_followers, ig_media_count, ig_days_since_post, statut_prospection')
    .eq('classe_terrain', classe)
    .limit(300);
  if (cible) q = q.eq('created_by', cible);
  if (ville) q = q.ilike('ville', `%${ville}%`);
  // On ne renvoie pas ce qui a déjà été visité : la tournée sert à préparer
  // les portes qu'il reste à pousser.
  q = q.or('statut_prospection.is.null,statut_prospection.eq.non_visite');

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const parRue = new Map<string, any[]>();
  for (const p of data || []) {
    const rue = rueDe((p as any).address);
    if (!parRue.has(rue)) parRue.set(rue, []);
    parRue.get(rue)!.push(p);
  }

  const groupes = ordonnerParProximite(
    [...parRue.entries()].map(([rue, prospects]) => ({
      rue,
      ville: prospects[0]?.ville || null,
      lat: prospects.find((p: any) => typeof p.lat === 'number')?.lat ?? null,
      lng: prospects.find((p: any) => typeof p.lng === 'number')?.lng ?? null,
      arrets: prospects
        .sort((a: any, b: any) => (b.score_terrain ?? 0) - (a.score_terrain ?? 0))
        .map((p: any) => ({
          id: p.id, nom: p.company, adresse: p.address, telephone: p.phone,
          score: p.score_terrain, instagram: p.instagram,
          reputation: (typeof p.google_rating === 'number' && typeof p.google_reviews === 'number')
            ? `${p.google_rating}/5 · ${p.google_reviews} avis` : null,
          angle: angleDApproche({
            igStatut: p.ig_status, igFollowers: p.ig_followers,
            igMediaCount: p.ig_media_count, igJoursDepuisPost: p.ig_days_since_post,
            note: p.google_rating, avis: p.google_reviews, site: p.website,
          }),
        })),
    })),
  );

  const total = groupes.reduce((s, g) => s + g.arrets.length, 0);

  if (format === 'csv') {
    const lignes = [['ordre', 'rue', 'ville', 'etablissement', 'adresse', 'telephone', 'score', 'reputation', 'angle'].join(';')];
    let ordre = 0;
    for (const g of groupes) {
      for (const a of g.arrets) {
        ordre++;
        lignes.push([
          ordre, g.rue, g.ville ?? '', a.nom ?? '', a.adresse ?? '', a.telephone ?? '',
          a.score ?? '', a.reputation ?? '', (a.angle ?? '').replace(/[;\n]/g, ' '),
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));
      }
    }
    return new NextResponse('﻿' + lignes.join('\n'), {
      headers: {
        // BOM en tête : sans lui Excel affiche les accents en charabia, et une
        // liste illisible ne sert à personne un samedi matin.
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tournee-${classe}${ville ? '-' + ville : ''}.csv"`,
      },
    });
  }

  return NextResponse.json({ ok: true, classe, ville: ville || null, arrets: total, rues: groupes.length, tournee: groupes });
}
