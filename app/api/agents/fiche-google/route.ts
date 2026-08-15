import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * Chercher et choisir SA fiche Google — parce qu'on ne peut pas la deviner.
 *
 * ── Pourquoi cette route existe ──
 *
 * Fondateur, 15 août 2026, après trois « ça ne s'affiche toujours pas » :
 * « la fiche que j'ai connectée, c'est Le Repère de l'Autisme ».
 *
 * On cherchait « KeiroAI », le nom de son dossier d'entreprise. La fiche
 * s'appelle autrement, et se trouve à une autre adresse. Aucune recherche
 * automatique ne pouvait aboutir — et quand on devine, on affiche le commerce
 * d'un homonyme : « KeiroAI » rend « Kayro.ai » puis « Kiiro », deux sociétés
 * parisiennes sans aucun rapport.
 *
 * Le nom de l'entreprise et celui de la fiche diffèrent souvent, et
 * légitimement : une agence qui gère la fiche d'un client, un gérant de
 * plusieurs établissements, une enseigne différente de la raison sociale.
 * Deviner marchera parfois, jamais toujours.
 *
 * Alors on demande. Une recherche, un choix, et c'est réglé pour de bon.
 *
 * ── Ce que ça débloque tout de suite ──
 *
 * L'affichage de la fiche ne dépend plus de l'autorisation Business Profile
 * encore en attente chez Google : Places suffit à LIRE. L'écriture — répondre
 * aux avis, corriger les horaires — attendra l'accès, mais le commerçant voit
 * enfin son établissement.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function utilisateur(req: NextRequest) {
  // Le secret de cron autorise l'appel outillé ; sinon, la session du client.
  if (req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`) {
    const uid = req.nextUrl.searchParams.get('user_id');
    return uid ? { id: uid } : null;
  }
  try {
    const { getAuthUser } = await import('@/lib/auth-server');
    const { user } = await getAuthUser();
    return user || null;
  } catch { return null; }
}

/** GET ?q=… → les fiches qui correspondent, pour que le client choisisse. */
export async function GET(req: NextRequest) {
  const user = await utilisateur(req);
  if (!user) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 3) return NextResponse.json({ ok: false, error: 'recherche trop courte' }, { status: 400 });

  const cle = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!cle) return NextResponse.json({ ok: false, error: 'recherche indisponible' }, { status: 503 });

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': cle,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({ textQuery: q, languageCode: 'fr', maxResultCount: 5 }),
    });
    const j = await r.json();
    if (j.error) return NextResponse.json({ ok: false, error: 'recherche impossible' }, { status: 502 });

    // On rend PLUSIEURS résultats et on laisse choisir : prendre le premier
    // d'office est exactement ce qui affichait le commerce d'un homonyme.
    return NextResponse.json({
      ok: true,
      resultats: (j.places || []).map((p: any) => ({
        placeId: p.id,
        nom: p.displayName?.text || '',
        adresse: p.formattedAddress || '',
        note: p.rating ?? null,
        nombreAvis: p.userRatingCount ?? 0,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}

/** POST { placeId, nom, adresse } → on retient CETTE fiche pour ce client. */
export async function POST(req: NextRequest) {
  const user = await utilisateur(req);
  if (!user) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const placeId = String(body.placeId || '').trim();
  if (!placeId) return NextResponse.json({ ok: false, error: 'placeId requis' }, { status: 400 });

  const supabase = sb();
  const { error } = await supabase.from('profiles').update({
    google_place_id: placeId,
    google_place_nom: String(body.nom || '').slice(0, 200) || null,
    google_place_adresse: String(body.adresse || '').slice(0, 300) || null,
    updated_at: new Date().toISOString(),
  }).eq('id', user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, placeId });
}
