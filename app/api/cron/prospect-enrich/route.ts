import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isUnderDailyBudget } from '@/lib/places/prospect-pool';
import { fetchPlaceBusinessPhotos } from '@/lib/places/place-photos';
import { comptesDepuisSite, reinitialiserCacheDomaines } from '@/lib/prospects/website-social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * ENRICHISSEMENT PROGRESSIF DU STOCK DE PROSPECTS.
 *
 * Demande du fondateur (2026-08-05) : « enrichis progressivement tous ceux
 * présents, avec toutes les infos et images, je veux pouvoir les contacter à
 * fond et le plus personnalisé possible pour un maximum d'impact — attention à
 * maîtriser les coûts seulement. »
 *
 * ── Sur les images : les vraies plutôt que des générées ──
 *
 * Le premier réflexe serait de générer un visuel par prospect. C'est le mauvais
 * choix, sur les deux tableaux à la fois.
 *
 * Google Places expose les photos que le commerce a lui-même publiées : son
 * comptoir, sa vitrine, ses plats. Une photo réelle de LEUR établissement bat
 * n'importe quelle image générée en personnalisation — on ne montre plus « un
 * salon de coiffure », on montre LE leur. Et elle coûte une fraction du prix
 * d'une génération.
 *
 * La génération garde son rôle, mais ailleurs : montrer ce qu'on PRODUIRAIT
 * pour eux (l'aperçu), ce qu'aucune photo existante ne peut faire.
 *
 * ── Sur les coûts ──
 *
 * Trois garde-fous, hérités de l'emballement Places d'avril (350 €) :
 *   - budget journalier partagé, vérifié AVANT chaque prospect ;
 *   - plafond dur de prospects par passage ;
 *   - aucune reprise sur échec — un appel raté est un appel perdu, pas trois.
 *
 * Et le plus efficace de tous : on ne retouche jamais un prospect déjà enrichi.
 */

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Plafond par passage. Volontairement bas : le stock se rattrape en jours. */
const LOT_MAX = 40;

/** Nombre de photos par établissement — au-delà, on paie sans gagner. */
const PHOTOS_PAR_PROSPECT = 3;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const limite = Math.min(LOT_MAX, parseInt(req.nextUrl.searchParams.get('limit') || String(LOT_MAX), 10));
  const cible = req.nextUrl.searchParams.get('user_id');

  const budgetDepart = await isUnderDailyBudget(supabase);
  if (!budgetDepart.ok) {
    return NextResponse.json({
      ok: true, arrete: 'budget_journalier',
      message: `Budget Places du jour atteint (${budgetDepart.spent.toFixed(2)} € / ${budgetDepart.budget} €) — reprise demain.`,
    });
  }

  // On enrichit d'abord ce qui a le plus de valeur : les prospects les mieux
  // classés d'abord, puis les plus récents. Enrichir un prospect de classe C
  // avant un A reviendrait à payer pour une porte qu'on ne poussera pas.
  let q = supabase
    .from('crm_prospects')
    .select('id, company, website, instagram, google_place_id, photos_lieu, enrichi_le, classe_terrain, tiktok_handle, linkedin_url')
    .is('enrichi_le', null)
    .not('google_place_id', 'is', null)
    .order('classe_terrain', { ascending: true, nullsFirst: false })
    .limit(limite);
  if (cible) q = q.eq('created_by', cible);

  const { data: prospects, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  reinitialiserCacheDomaines();
  const bilan = { examines: 0, photos_recuperees: 0, reseaux_trouves: 0, sans_photo: 0, erreurs: 0, arrete_budget: false };

  for (const p of prospects || []) {
    // Le budget se vérifie à CHAQUE tour : un lot de quarante peut le franchir
    // en cours de route, et le contrôler seulement au départ laisserait passer
    // trente-neuf appels au-delà de la limite.
    const budget = await isUnderDailyBudget(supabase);
    if (!budget.ok) { bilan.arrete_budget = true; break; }

    bilan.examines++;
    try {
      const maj: Record<string, any> = { enrichi_le: new Date().toISOString(), updated_at: new Date().toISOString() };

      // ── Réseaux sociaux depuis le site — gratuit ──
      if (!p.instagram && p.website) {
        const reseaux = await comptesDepuisSite(p.website);
        if (reseaux.instagram) { maj.instagram = reseaux.instagram; bilan.reseaux_trouves++; }
        if (reseaux.tiktok && !p.tiktok_handle) maj.tiktok_handle = reseaux.tiktok;
        if (reseaux.linkedin && !p.linkedin_url) maj.linkedin_url = `https://www.linkedin.com/company/${reseaux.linkedin}`;
      }

      // ── Photos réelles du lieu ──
      if (!p.photos_lieu?.length && p.google_place_id) {
        const res = await fetchPlaceBusinessPhotos(p.google_place_id, supabase, { count: PHOTOS_PAR_PROSPECT });
        if (res.photos.length) {
          maj.photos_lieu = res.photos;
          bilan.photos_recuperees += res.photos.length;
        } else {
          bilan.sans_photo++;
        }
      }

      await supabase.from('crm_prospects').update(maj).eq('id', p.id);
    } catch (e: any) {
      bilan.erreurs++;
      console.warn(`[Enrich] prospect ${p.id}:`, e?.message);
    }
  }

  const budgetFin = await isUnderDailyBudget(supabase);
  const { count: restants } = await supabase
    .from('crm_prospects')
    .select('id', { count: 'exact', head: true })
    .is('enrichi_le', null)
    .not('google_place_id', 'is', null);

  await supabase.from('agent_logs').insert({
    agent: 'commercial', action: 'prospect_enrich', status: 'ok',
    data: { ...bilan, restants, depense_jour: budgetFin.spent, budget_jour: budgetFin.budget },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    ...bilan,
    restants_a_enrichir: restants,
    depense_jour_eur: Math.round(budgetFin.spent * 100) / 100,
    budget_jour_eur: budgetFin.budget,
  });
}
