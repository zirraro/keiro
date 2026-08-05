/**
 * AMI — couche de MESURE : ce que les agents ont réellement produit.
 *
 * Demande du fondateur (2026-08-04) : « Ami analyse les résultats remontés par
 * agent contenu, agent DM, agent email, agent prospection, agent WhatsApp, tous
 * les agents, et leur donne les ordres nécessaires à modifier leur stratégie —
 * donc comportement et actions — pour améliorer les résultats. »
 *
 * ── Pourquoi ce module existe ──
 *
 * Ami lisait `agent_logs` : nombre d'exécutions, succès, erreurs. C'est de la
 * supervision technique, pas du marketing. « Léna a tourné 14 fois sans
 * erreur » ne dit RIEN sur la performance — les 14 posts peuvent avoir fait
 * zéro vue. Un directeur marketing qui juge son équipe au nombre de réunions
 * tenues ne dirige rien.
 *
 * On lit donc les tables métier, là où se trouve le résultat réel : les vues
 * d'un post, la réponse à un DM, l'ouverture d'un email, la conversion d'un
 * prospect. Et systématiquement en COMPARAISON avec la période précédente :
 * un chiffre seul ne se juge pas, c'est sa variation qui déclenche une
 * décision.
 *
 * ── Ce que ce module ne fait pas ──
 *
 * Il ne juge pas et ne décide pas. Il produit des faits chiffrés, avec leur
 * taille d'échantillon, pour qu'Ami ne puisse pas broder. Quand une donnée
 * manque, elle vaut `null` — jamais 0 : confondre « aucune donnée » et
 * « résultat nul » ferait prendre des décisions sur du vide, et c'est
 * exactement le travers qu'on corrige partout ailleurs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOrgId } from '../tenant';

/** Une métrique avec son échantillon et sa variation. */
export interface Metrique {
  valeur: number | null;
  /** Nombre d'observations derrière la valeur. Sous 5, on ne conclut pas. */
  echantillon: number;
  /** Même métrique sur la période précédente, pour la variation. */
  precedent: number | null;
  /** Variation en %, ou null si non calculable. */
  variationPct: number | null;
}

export interface ResultatsCanal {
  canal: 'contenu' | 'dm' | 'email' | 'prospection' | 'whatsapp';
  agent: string;
  actif: boolean;
  metriques: Record<string, Metrique>;
  /** Détails qualitatifs — répartitions utiles à la décision. */
  detail: Record<string, any>;
}

export interface ResultatsClient {
  userId: string;
  fenetreJours: number;
  genereLe: string;
  canaux: ResultatsCanal[];
  /** Canaux sans aucune activité : rien à optimiser, mais bon à signaler. */
  canauxInactifs: string[];
}

const vide = (): Metrique => ({ valeur: null, echantillon: 0, precedent: null, variationPct: null });

function metrique(valeur: number | null, echantillon: number, precedent: number | null): Metrique {
  let variationPct: number | null = null;
  if (valeur !== null && precedent !== null && precedent !== 0) {
    variationPct = Math.round(((valeur - precedent) / Math.abs(precedent)) * 1000) / 10;
  }
  return { valeur, echantillon, precedent, variationPct };
}

/** Moyenne qui distingue « pas de données » (null) de « moyenne nulle » (0). */
function moyenne(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  return Math.round((valeurs.reduce((s, v) => s + v, 0) / valeurs.length) * 100) / 100;
}

function taux(numerateur: number, denominateur: number): number | null {
  if (!denominateur) return null;
  return Math.round((numerateur / denominateur) * 1000) / 10;
}

/** Les deux fenêtres : période courante et période précédente de même durée. */
function fenetres(jours: number) {
  const maintenant = Date.now();
  return {
    debutCourant: new Date(maintenant - jours * 86400000).toISOString(),
    debutPrecedent: new Date(maintenant - 2 * jours * 86400000).toISOString(),
    finPrecedent: new Date(maintenant - jours * 86400000).toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTENU — Léna
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les vues arrivent sous plusieurs clés selon la plateforme : `views` sur
 * TikTok, `reach` ou `impressions` sur Instagram selon le type de média. On
 * prend la meilleure disponible plutôt que d'en privilégier une, sans quoi la
 * moitié des posts compterait pour zéro vue.
 */
function vuesDe(e: any): number | null {
  if (!e || typeof e !== 'object') return null;
  const candidats = [e.views, e.reach, e.impressions, e.video_views, e.play_count]
    .filter(v => typeof v === 'number');
  return candidats.length ? Math.max(...candidats) : null;
}

function engagementDe(e: any): number | null {
  if (!e || typeof e !== 'object') return null;
  const l = Number(e.like_count ?? e.likes ?? 0);
  const c = Number(e.comments_count ?? e.comments ?? 0);
  const s = Number(e.saved ?? e.saves ?? 0);
  const p = Number(e.shares ?? 0);
  if ([e.like_count, e.likes, e.comments_count, e.comments].every(v => typeof v !== 'number')) return null;
  return l + c + s + p;
}

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Performance par heure de publication, en heure de Paris.
 *
 * C'est la donnée qui manquait pour décider des horaires : sans elle, un ordre
 * « publie à 18h » ne reposerait sur rien. On regroupe par tranche de 2 heures
 * — à l'heure près, chaque case ne contiendrait qu'un ou deux posts et le
 * classement ne refléterait que du bruit.
 */
function parHeure(rows: any[]): Record<string, { moyenne: number | null; n: number }> {
  const g: Record<string, number[]> = {};
  for (const r of rows) {
    const v = vuesDe(r.engagement_data);
    if (v === null || !r.published_at) continue;
    // `format()` rend « 18 h » en français : Number() en fait NaN et toute
    // l'analyse horaire ressortait vide, sans la moindre erreur. On lit la
    // partie « hour » directement, ce qui ne dépend ni de la locale ni de la
    // version d'ICU.
    const h = Number(
      new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
        .formatToParts(new Date(r.published_at))
        .find(p => p.type === 'hour')?.value,
    );
    if (!Number.isFinite(h)) continue;
    const debut = Math.floor(h / 2) * 2;
    const cle = `${String(debut).padStart(2, '0')}h-${String(debut + 2).padStart(2, '0')}h`;
    (g[cle] ||= []).push(v);
  }
  const out: Record<string, { moyenne: number | null; n: number }> = {};
  for (const k of Object.keys(g).sort()) out[k] = { moyenne: moyenne(g[k]), n: g[k].length };
  return out;
}

/** Même logique par jour de semaine : le meilleur créneau dépend du jour. */
function parJour(rows: any[]): Record<string, { moyenne: number | null; n: number }> {
  const g: Record<string, number[]> = {};
  for (const r of rows) {
    const v = vuesDe(r.engagement_data);
    if (v === null || !r.published_at) continue;
    (g[JOURS_FR[new Date(r.published_at).getDay()]] ||= []).push(v);
  }
  const out: Record<string, { moyenne: number | null; n: number }> = {};
  for (const k of Object.keys(g)) out[k] = { moyenne: moyenne(g[k]), n: g[k].length };
  return out;
}

async function resultatsContenu(
  supabase: SupabaseClient, userId: string, jours: number,
): Promise<ResultatsCanal> {
  const { debutPrecedent } = fenetres(jours);
  const coupure = new Date(Date.now() - jours * 86400000).getTime();

  // On charge les deux fenêtres d'un coup puis on partage en mémoire : deux
  // requêtes coûteraient le double pour le même volume.
  const { data } = await supabase
    .from('content_calendar')
    .select('platform, format, status, published_at, engagement_data, qa_quality_score, deleted_detected_at, hook')
    .eq('user_id', userId)
    .gte('published_at', debutPrecedent)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1000);

  const tous = data || [];
  const publie = (r: any) => String(r.status || '').startsWith('published') || r.published_at;
  const courant = tous.filter(r => publie(r) && new Date(r.published_at).getTime() >= coupure);
  const precedent = tous.filter(r => publie(r) && new Date(r.published_at).getTime() < coupure);

  const vues = (rows: any[]) => rows.map(r => vuesDe(r.engagement_data)).filter((v): v is number => v !== null);
  const engs = (rows: any[]) => rows.map(r => engagementDe(r.engagement_data)).filter((v): v is number => v !== null);

  const vuesC = vues(courant), vuesP = vues(precedent);
  const engC = engs(courant), engP = engs(precedent);

  // Un post publié qui ne fait aucune vue est le signal le plus fort qu'on ait :
  // ce n'est pas un mauvais score, c'est une distribution nulle (throttle,
  // légende vide, compte pénalisé). Il mérite sa propre métrique.
  const zeroC = vuesC.filter(v => v === 0).length;
  const zeroP = vuesP.filter(v => v === 0).length;

  const supprC = courant.filter(r => r.deleted_detected_at).length;
  const qaC = courant.map(r => Number(r.qa_quality_score)).filter(v => Number.isFinite(v));

  const parCle = (rows: any[], cle: string) => {
    const g: Record<string, number[]> = {};
    for (const r of rows) {
      const v = vuesDe(r.engagement_data);
      if (v === null) continue;
      const k = String(r[cle] || 'inconnu');
      (g[k] ||= []).push(v);
    }
    const out: Record<string, { moyenne: number | null; n: number }> = {};
    for (const k of Object.keys(g)) out[k] = { moyenne: moyenne(g[k]), n: g[k].length };
    return out;
  };

  return {
    canal: 'contenu',
    agent: 'content',
    actif: courant.length > 0,
    metriques: {
      posts_publies: metrique(courant.length, courant.length, precedent.length),
      vues_moyennes: metrique(moyenne(vuesC), vuesC.length, moyenne(vuesP)),
      engagement_moyen: metrique(moyenne(engC), engC.length, moyenne(engP)),
      taux_zero_vue: metrique(taux(zeroC, vuesC.length), vuesC.length, taux(zeroP, vuesP.length)),
      taux_suppression_client: metrique(taux(supprC, courant.length), courant.length, null),
      score_qc_moyen: metrique(moyenne(qaC), qaC.length, null),
    },
    detail: {
      par_plateforme: parCle(courant, 'platform'),
      par_format: parCle(courant, 'format'),
      par_heure: parHeure(courant),
      par_jour: parJour(courant),
      posts_sans_metrique: courant.length - vuesC.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DM — Jade
// ─────────────────────────────────────────────────────────────────────────────

async function resultatsDm(
  supabase: SupabaseClient, userId: string, jours: number,
): Promise<ResultatsCanal> {
  const { debutPrecedent } = fenetres(jours);
  const coupure = new Date(Date.now() - jours * 86400000).getTime();

  // dm_queue est cloisonné par org, pas par user. `profiles` ne porte pas
  // d'org_id : l'appartenance vit dans organization_members, d'où le helper.
  const orgId = await resolveOrgId(supabase, userId);
  if (!orgId) {
    return { canal: 'dm', agent: 'dm', actif: false, metriques: {}, detail: { raison: 'aucune organisation rattachée' } };
  }

  const { data } = await supabase
    .from('dm_queue')
    .select('status, response_type, sent_at, created_at, verified_exists, channel')
    .eq('org_id', orgId)
    .gte('created_at', debutPrecedent)
    .order('created_at', { ascending: false })
    .limit(1000);

  const tous = data || [];
  const dansCourant = (r: any) => new Date(r.created_at).getTime() >= coupure;
  const courant = tous.filter(dansCourant);
  const precedent = tous.filter(r => !dansCourant(r));

  const envoyes = (rows: any[]) => rows.filter(r => r.status === 'sent' || r.status === 'responded');
  const repondus = (rows: any[]) => rows.filter(r => r.status === 'responded');
  // Un handle vérifié inexistant est un lien mort : le client clique dans le
  // vide. Le fondateur l'a signalé comme tueur de productivité.
  const morts = (rows: any[]) => rows.filter(r => r.verified_exists === false);

  const envC = envoyes(courant), envP = envoyes(precedent);

  return {
    canal: 'dm',
    agent: 'dm',
    actif: courant.length > 0,
    metriques: {
      dm_envoyes: metrique(envC.length, envC.length, envP.length),
      taux_reponse: metrique(
        taux(repondus(courant).length, envC.length), envC.length,
        taux(repondus(precedent).length, envP.length),
      ),
      taux_liens_morts: metrique(
        taux(morts(courant).length, courant.length), courant.length,
        taux(morts(precedent).length, precedent.length),
      ),
      en_attente: metrique(courant.filter(r => r.status === 'pending').length, courant.length, null),
    },
    detail: {
      par_statut: courant.reduce((a: Record<string, number>, r) => {
        a[r.status || 'inconnu'] = (a[r.status || 'inconnu'] || 0) + 1; return a;
      }, {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL — Hugo (les résultats vivent sur crm_prospects, pas dans une table dédiée)
// ─────────────────────────────────────────────────────────────────────────────

async function resultatsEmail(
  supabase: SupabaseClient, userId: string, jours: number,
): Promise<ResultatsCanal> {
  const { debutPrecedent } = fenetres(jours);
  const coupure = new Date(Date.now() - jours * 86400000).getTime();

  const { data } = await supabase
    .from('crm_prospects')
    .select('last_email_sent_at, last_email_opened_at, last_email_clicked_at, email_opens_count, email_clicks_count, email_auto_replies_count, email_sequence_step, email_send_failures, email_provider')
    .eq('created_by', userId)
    .gte('last_email_sent_at', debutPrecedent)
    .not('last_email_sent_at', 'is', null)
    .order('last_email_sent_at', { ascending: false })
    .limit(1000);

  const tous = data || [];
  const courant = tous.filter(r => new Date(r.last_email_sent_at).getTime() >= coupure);
  const precedent = tous.filter(r => new Date(r.last_email_sent_at).getTime() < coupure);

  const ouverts = (rows: any[]) => rows.filter(r => Number(r.email_opens_count) > 0 || r.last_email_opened_at);
  const cliques = (rows: any[]) => rows.filter(r => Number(r.email_clicks_count) > 0 || r.last_email_clicked_at);
  const repondus = (rows: any[]) => rows.filter(r => Number(r.email_auto_replies_count) > 0);
  const echecs = (rows: any[]) => rows.filter(r => Number(r.email_send_failures) > 0);

  /**
   * Le pixel d'ouverture n'est pas toujours actif selon le mode d'envoi. Quand
   * AUCUNE ligne de la période ne porte de compteur d'ouverture — pas même à
   * zéro — c'est que le suivi n'est pas instrumenté, pas que personne n'a
   * ouvert. Rendre 0 % ici pousserait Ami à réécrire les objets d'un emailing
   * qui fonctionne peut-être très bien : on rend « pas de donnée ».
   */
  const suivi = (rows: any[], compteur: string, horodatage: string) =>
    rows.some(r => typeof r[compteur] === 'number' || r[horodatage]);

  const tauxSuivi = (rows: any[], compteur: string, horodatage: string, filtre: (r: any[]) => any[]) =>
    suivi(rows, compteur, horodatage) ? taux(filtre(rows).length, rows.length) : null;

  /**
   * Un clic suppose une ouverture. Un taux de clic supérieur au taux
   * d'ouverture est donc arithmétiquement impossible : cela signale que le
   * pixel d'ouverture est bloqué (Apple Mail Privacy, filtres d'entreprise),
   * pas que les destinataires n'ouvrent pas.
   *
   * Le contrôle est déterministe et non négociable : lors du premier cycle,
   * Ami a lu « 0 % d'ouverture, 33 % de clics » et a ordonné de réécrire les
   * objets d'emails que les gens ouvraient en réalité. On neutralise donc la
   * métrique à la source plutôt que d'espérer que le modèle repère la
   * contradiction.
   */
  const ouvertureBrute = tauxSuivi(courant, 'email_opens_count', 'last_email_opened_at', ouverts);
  const clicBrut = tauxSuivi(courant, 'email_clicks_count', 'last_email_clicked_at', cliques);
  const pixelFiable = !(ouvertureBrute !== null && clicBrut !== null && clicBrut > ouvertureBrute);

  return {
    canal: 'email',
    agent: 'email',
    actif: courant.length > 0,
    metriques: {
      emails_envoyes: metrique(courant.length, courant.length, precedent.length),
      taux_ouverture: metrique(
        pixelFiable ? ouvertureBrute : null, courant.length,
        pixelFiable ? tauxSuivi(precedent, 'email_opens_count', 'last_email_opened_at', ouverts) : null,
      ),
      taux_clic: metrique(
        clicBrut, courant.length,
        tauxSuivi(precedent, 'email_clicks_count', 'last_email_clicked_at', cliques),
      ),
      taux_reponse: metrique(
        taux(repondus(courant).length, courant.length), courant.length,
        taux(repondus(precedent).length, precedent.length),
      ),
      taux_echec_envoi: metrique(taux(echecs(courant).length, courant.length), courant.length, null),
    },
    detail: {
      par_etape: courant.reduce((a: Record<string, number>, r) => {
        const k = `étape ${r.email_sequence_step ?? '?'}`;
        a[k] = (a[k] || 0) + 1; return a;
      }, {}),
      ...(pixelFiable ? {} : {
        avertissement: `suivi d'ouverture non fiable (${clicBrut}% de clics pour ${ouvertureBrute}% d'ouvertures — impossible) : le taux d'ouverture est neutralisé, ne conclus rien sur les objets d'emails`,
      }),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROSPECTION — Léo
// ─────────────────────────────────────────────────────────────────────────────

/** Statuts qui valent conversion. Le CRM ne supprime jamais : il déplace. */
const STATUTS_GAGNES = ['client', 'converti', 'gagne', 'signe'];
const STATUTS_PERDUS = ['perdu', 'dead', 'desabonne'];

async function resultatsProspection(
  supabase: SupabaseClient, userId: string, jours: number,
): Promise<ResultatsCanal> {
  const { debutPrecedent } = fenetres(jours);
  const coupure = new Date(Date.now() - jours * 86400000).getTime();

  const { data } = await supabase
    .from('crm_prospects')
    .select('status, temperature, source, source_agent, created_at, verified, active_channel, email, instagram, phone, whatsapp_phone, tiktok_handle, linkedin_url')
    .eq('created_by', userId)
    .gte('created_at', debutPrecedent)
    .order('created_at', { ascending: false })
    .limit(1000);

  const tous = data || [];
  const courant = tous.filter(r => new Date(r.created_at).getTime() >= coupure);
  const precedent = tous.filter(r => new Date(r.created_at).getTime() < coupure);

  const gagnes = (rows: any[]) => rows.filter(r => STATUTS_GAGNES.includes(String(r.status || '').toLowerCase()));
  const perdus = (rows: any[]) => rows.filter(r => STATUTS_PERDUS.includes(String(r.status || '').toLowerCase()));
  /**
   * Un prospect sans AUCUN moyen de contact gonfle le volume sans rien pouvoir
   * produire — c'est un défaut de la source, pas du canal.
   *
   * Il faut compter tous les canaux, pas seulement email et Instagram : la
   * prospection commerciale de terrain ramène des fiches avec téléphone et
   * adresse, parfaitement exploitables. Ne regarder que le mail et l'Insta
   * faisait ressortir 100 % d'injoignables sur des listes en réalité complètes,
   * et aurait poussé Ami à couper une source qui fonctionne.
   */
  const injoignables = (rows: any[]) => rows.filter(
    r => !r.email && !r.instagram && !r.phone && !r.whatsapp_phone && !r.tiktok_handle && !r.linkedin_url,
  );

  return {
    canal: 'prospection',
    agent: 'commercial',
    actif: courant.length > 0,
    metriques: {
      prospects_ajoutes: metrique(courant.length, courant.length, precedent.length),
      taux_conversion: metrique(
        taux(gagnes(courant).length, courant.length), courant.length,
        taux(gagnes(precedent).length, precedent.length),
      ),
      taux_perte: metrique(
        taux(perdus(courant).length, courant.length), courant.length,
        taux(perdus(precedent).length, precedent.length),
      ),
      taux_injoignables: metrique(
        taux(injoignables(courant).length, courant.length), courant.length,
        taux(injoignables(precedent).length, precedent.length),
      ),
    },
    detail: {
      par_source: courant.reduce((a: Record<string, number>, r) => {
        a[r.source || 'inconnu'] = (a[r.source || 'inconnu'] || 0) + 1; return a;
      }, {}),
      par_temperature: courant.reduce((a: Record<string, number>, r) => {
        a[r.temperature || 'inconnue'] = (a[r.temperature || 'inconnue'] || 0) + 1; return a;
      }, {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP — Stella
// ─────────────────────────────────────────────────────────────────────────────

async function resultatsWhatsapp(
  supabase: SupabaseClient, userId: string, jours: number,
): Promise<ResultatsCanal> {
  const { debutPrecedent } = fenetres(jours);
  const coupure = new Date(Date.now() - jours * 86400000).getTime();

  const orgId = await resolveOrgId(supabase, userId);
  if (!orgId) {
    return { canal: 'whatsapp', agent: 'whatsapp', actif: false, metriques: {}, detail: { raison: 'aucune organisation rattachée' } };
  }

  const { data } = await supabase
    .from('whatsapp_conversations')
    .select('role, created_at, phone_number, prospect_id')
    .eq('org_id', orgId)
    .gte('created_at', debutPrecedent)
    .order('created_at', { ascending: false })
    .limit(1000);

  const tous = data || [];
  const courant = tous.filter(r => new Date(r.created_at).getTime() >= coupure);
  const precedent = tous.filter(r => new Date(r.created_at).getTime() < coupure);

  const conversations = (rows: any[]) => new Set(rows.map(r => r.phone_number)).size;
  const entrants = (rows: any[]) => rows.filter(r => r.role === 'user').length;

  return {
    canal: 'whatsapp',
    agent: 'whatsapp',
    actif: courant.length > 0,
    metriques: {
      conversations: metrique(conversations(courant), courant.length, conversations(precedent)),
      messages_entrants: metrique(entrants(courant), courant.length, entrants(precedent)),
      // Combien d'échanges il faut en moyenne : un ratio qui grimpe signale un
      // assistant qui tourne en rond sans conclure.
      messages_par_conversation: metrique(
        conversations(courant) ? Math.round((courant.length / conversations(courant)) * 10) / 10 : null,
        courant.length,
        conversations(precedent) ? Math.round((precedent.length / conversations(precedent)) * 10) / 10 : null,
      ),
    },
    detail: {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collecte les résultats de tous les canaux pour un client.
 *
 * Les canaux sont interrogés en parallèle et chacun est isolé : un canal qui
 * échoue (table absente, colonne renommée) ne doit jamais faire tomber le
 * diagnostic entier — Ami travaillerait alors sans rien voir, ce qui est pire
 * qu'un canal manquant clairement signalé.
 */
export async function collecterResultats(
  supabase: SupabaseClient,
  userId: string,
  jours = 14,
): Promise<ResultatsClient> {
  const collecteurs: Array<[string, Promise<ResultatsCanal>]> = [
    ['contenu', resultatsContenu(supabase, userId, jours)],
    ['dm', resultatsDm(supabase, userId, jours)],
    ['email', resultatsEmail(supabase, userId, jours)],
    ['prospection', resultatsProspection(supabase, userId, jours)],
    ['whatsapp', resultatsWhatsapp(supabase, userId, jours)],
  ];

  const canaux: ResultatsCanal[] = [];
  for (const [nom, promesse] of collecteurs) {
    try {
      canaux.push(await promesse);
    } catch (e: any) {
      canaux.push({
        canal: nom as any, agent: nom, actif: false,
        metriques: {}, detail: { erreur: String(e?.message || e).slice(0, 200) },
      });
    }
  }

  return {
    userId,
    fenetreJours: jours,
    genereLe: new Date().toISOString(),
    canaux,
    canauxInactifs: canaux.filter(c => !c.actif).map(c => c.canal),
  };
}

/**
 * Met les résultats en texte pour le prompt.
 *
 * Chaque chiffre est accompagné de son échantillon et de sa variation. Sans
 * l'échantillon, un taux de réponse de 100 % sur un seul DM se lirait comme un
 * succès et déclencherait un ordre absurde.
 */
export function resultatsEnTexte(r: ResultatsClient): string {
  const l: string[] = [`RÉSULTATS RÉELS — ${r.fenetreJours} derniers jours (vs les ${r.fenetreJours} jours précédents)`];

  for (const c of r.canaux) {
    if (!c.actif) {
      const raison = c.detail?.erreur ? `donnée illisible : ${c.detail.erreur}` : 'aucune activité sur la période';
      l.push(`\n■ ${c.canal.toUpperCase()} — ${raison}`);
      continue;
    }
    l.push(`\n■ ${c.canal.toUpperCase()} (agent « ${c.agent} »)`);
    for (const [nom, m] of Object.entries(c.metriques)) {
      if (m.valeur === null) { l.push(`   ${nom} : pas de donnée`); continue; }
      const variation = m.variationPct === null
        ? 'pas de comparatif'
        : `${m.variationPct > 0 ? '+' : ''}${m.variationPct} % vs période précédente`;
      const fiabilite = m.echantillon < 5 ? '  ⚠ échantillon trop faible pour conclure' : '';
      l.push(`   ${nom} : ${m.valeur} (n=${m.echantillon}, ${variation})${fiabilite}`);
    }
    for (const [nom, v] of Object.entries(c.detail)) {
      if (!v || (typeof v === 'object' && !Object.keys(v).length)) continue;
      l.push(`   · ${nom} : ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
  }
  return l.join('\n');
}
