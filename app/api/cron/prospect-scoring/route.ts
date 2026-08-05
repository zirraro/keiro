import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { comptesDepuisSite, reinitialiserCacheDomaines } from '@/lib/prospects/website-social';
import { enrichirInstagram, enrichissementFrais, comptePourInterroger } from '@/lib/prospects/ig-enrich';
import { scorer, marquerChaines, occurrencesDe, VERSION_BAREME } from '@/lib/prospects/score';
import { COUTS_EUR, SEUILS } from '@/lib/prospects/scoring-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * SCORING TERRAIN DES PROSPECTS — pour tous les clients, pas seulement l'admin.
 *
 * Demande du fondateur (2026-08-05) : « ce système de scoring et tout ce qu'on
 * met en place pour améliorer notre utilisation pour l'admin, on doit le mettre
 * en place pour tous les clients / prospects et pour tous les agents. »
 *
 * Chaque client fait donc trier SES prospects par Léo. La fiche enrichie qui en
 * résulte ne sert pas qu'au porte-à-porte : Jade s'en sert pour personnaliser
 * ses messages privés, Hugo pour ses emails, et la liste d'appel sort déjà
 * qualifiée. Un prospect dont on sait qu'il a 600 abonnés et n'a rien publié
 * depuis quatre mois se travaille autrement qu'une ligne de tableur.
 *
 * ── Idempotence ──
 *
 * Relancer sur un lot déjà traité ne redépense rien : le handle n'est cherché
 * que s'il manque, l'appel Graph n'est fait que si l'enrichissement date de
 * plus de quatorze jours, et le score se recalcule gratuitement à partir des
 * colonnes déjà remplies.
 *
 * ── Analyse visuelle ──
 *
 * Derrière ENABLE_VISION_SCORING, désactivée par défaut, et volontairement.
 * Le barème contient déjà « publie depuis moins de 7 jours → −3 », qui capture
 * l'essentiel de ce que dirait une analyse d'images sur la présence d'une
 * agence, pour un coût nul. On l'activera si — et seulement si — les retours
 * de terrain montrent qu'elle prédit quelque chose de plus.
 */

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const VISION_ACTIVE = process.env.ENABLE_VISION_SCORING === 'true';

interface Bilan {
  userId: string;
  examines: number;
  handles_trouves: number;
  ig_enrichis: number;
  ig_depuis_cache: number;
  ig_par_statut: Record<string, number>;
  scores: Record<string, number>;
  appels_api: number;
  cout_estime_eur: number;
  erreurs: number;
}

async function traiterClient(
  supabase: any,
  userId: string,
  opts: { limite: number; dryRun: boolean },
): Promise<Bilan> {
  const bilan: Bilan = {
    userId, examines: 0, handles_trouves: 0, ig_enrichis: 0, ig_depuis_cache: 0,
    ig_par_statut: {}, scores: { A: 0, B: 0, C: 0 }, appels_api: 0, cout_estime_eur: 0, erreurs: 0,
  };

  const { data: prospects } = await supabase
    .from('crm_prospects')
    .select('id, company, website, instagram, business_status, google_rating, google_reviews, last_review_date, ig_status, ig_enriched_at, ig_followers, ig_media_count, ig_last_post_at, abonnes, ville, statut_prospection')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(opts.limite);

  if (!prospects?.length) return bilan;

  // La détection de chaîne se fait sur l'ENSEMBLE du lot du client : c'est la
  // répétition d'un nom qui trahit l'enseigne, pas la ligne prise isolément.
  const occurrences = marquerChaines(prospects.map((p: any) => p.company || ''));

  const compte = await comptePourInterroger(supabase, userId);
  reinitialiserCacheDomaines();

  for (const p of prospects) {
    bilan.examines++;
    try {
      // ── 1. Handle Instagram, uniquement s'il manque ──
      let handle: string | null = p.instagram || null;
      let reseauxTrouves: any = null;
      if (!handle && p.website) {
        if (!opts.dryRun) {
          reseauxTrouves = await comptesDepuisSite(p.website);
          handle = reseauxTrouves.instagram;
        }
        bilan.appels_api++; // lecture de site : gratuite, mais comptée pour la transparence
      }
      if (handle) bilan.handles_trouves++;

      // ── 2. Enrichissement Instagram, uniquement si périmé ──
      let ig: any = null;
      const frais = enrichissementFrais(p.ig_enriched_at);
      if (handle && compte && !frais) {
        bilan.appels_api++;
        bilan.cout_estime_eur += COUTS_EUR.business_discovery;
        if (!opts.dryRun) {
          ig = await enrichirInstagram(handle, compte.igId, compte.token);
          bilan.ig_enrichis++;
          bilan.ig_par_statut[ig.statut] = (bilan.ig_par_statut[ig.statut] || 0) + 1;
        }
      } else if (handle && frais) {
        bilan.ig_depuis_cache++;
      }

      if (opts.dryRun) continue;

      // ── 3. Scoring, gratuit ──
      const joursDepuisPost = ig?.joursDepuisDernierPost
        ?? (p.ig_last_post_at ? Math.floor((Date.now() - new Date(p.ig_last_post_at).getTime()) / 86400000) : null);

      const resultat = scorer({
        businessStatus: p.business_status,
        occurrencesNom: occurrencesDe(p.company || '', occurrences),
        derniereAvisLe: p.last_review_date,
        nombreAvis: p.google_reviews,
        note: p.google_rating,
        site: p.website,
        igStatut: ig?.statut ?? p.ig_status,
        igFollowers: ig?.followers ?? p.ig_followers ?? p.abonnes,
        igMediaCount: ig?.mediaCount ?? p.ig_media_count,
        igJoursDepuisPost: joursDepuisPost,
      }, { avecVision: VISION_ACTIVE });

      bilan.scores[resultat.classe]++;

      const maj: Record<string, any> = {
        score_terrain: resultat.score,
        classe_terrain: resultat.classe,
        score_details: resultat.details,
        is_chain: resultat.details.elimine_par?.cle === 'chaine_ou_franchise',
        updated_at: new Date().toISOString(),
      };
      if (handle && !p.instagram) maj.instagram = handle;
      if (reseauxTrouves?.tiktok && !p.tiktok_handle) maj.tiktok_handle = reseauxTrouves.tiktok;
      if (reseauxTrouves?.linkedin) maj.linkedin_url = `https://www.linkedin.com/company/${reseauxTrouves.linkedin}`;
      if (ig) {
        maj.ig_status = ig.statut;
        maj.ig_followers = ig.followers ?? null;
        maj.ig_media_count = ig.mediaCount ?? null;
        maj.ig_last_post_at = ig.dernierPostLe ?? null;
        maj.ig_days_since_post = ig.joursDepuisDernierPost ?? null;
        maj.ig_enriched_at = new Date().toISOString();
      }

      await supabase.from('crm_prospects').update(maj).eq('id', p.id);
    } catch (e: any) {
      // Un prospect qui échoue ne doit jamais interrompre le lot : c'est un
      // critère d'acceptation explicite, et le contraire ferait perdre tout le
      // travail déjà payé sur les lignes précédentes.
      bilan.erreurs++;
      console.warn(`[Scoring] prospect ${p.id} en échec:`, e?.message);
    }
  }

  if (!opts.dryRun) {
    await supabase.from('agent_logs').insert({
      agent: 'commercial', action: 'prospect_scoring', status: 'ok', user_id: userId,
      data: { ...bilan, version_bareme: VERSION_BAREME, vision_active: VISION_ACTIVE, compte_emprunte: compte?.emprunte ?? null },
      created_at: new Date().toISOString(),
    });
  }
  return bilan;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const cible = req.nextUrl.searchParams.get('user_id');
  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';
  const limite = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') || '200', 10));

  let requete = supabase
    .from('profiles')
    .select('id, subscription_plan')
    .not('subscription_plan', 'is', null)
    .neq('subscription_plan', 'free')
    .limit(200);
  if (cible) requete = requete.eq('id', cible);

  const { data: clients, error } = await requete;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const bilans: Bilan[] = [];
  for (const c of clients || []) {
    try {
      bilans.push(await traiterClient(supabase, c.id, { limite, dryRun }));
    } catch (e: any) {
      bilans.push({
        userId: c.id, examines: 0, handles_trouves: 0, ig_enrichis: 0, ig_depuis_cache: 0,
        ig_par_statut: {}, scores: { A: 0, B: 0, C: 0 }, appels_api: 0, cout_estime_eur: 0, erreurs: 1,
      });
    }
  }

  const total = (f: (b: Bilan) => number) => bilans.reduce((s, b) => s + f(b), 0);
  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    version_bareme: VERSION_BAREME,
    vision_active: VISION_ACTIVE,
    cache_ig_jours: SEUILS.IG_CACHE_JOURS,
    clients: bilans.length,
    examines: total(b => b.examines),
    appels_api: total(b => b.appels_api),
    cout_estime_eur: Math.round(total(b => b.cout_estime_eur) * 1000) / 1000,
    classe_A: total(b => b.scores.A),
    classe_B: total(b => b.scores.B),
    classe_C: total(b => b.scores.C),
    depuis_cache: total(b => b.ig_depuis_cache),
    erreurs: total(b => b.erreurs),
    bilans,
  });
}
