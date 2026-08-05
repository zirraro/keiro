/**
 * CLARA — la plaque tournante des informations client.
 *
 * Demande du fondateur (2026-08-05) : « le client peut déposer les documents ou
 * remplir les infos dans Clara, qui redistribue aux bons agents concernés ; ou
 * il peut déposer et parler à l'agent direct, qui retient l'info et la remonte
 * également à Clara, pour une meilleure compréhension et des actions efficaces
 * et pertinentes. »
 *
 * ── Le problème que ça résout ──
 *
 * Sans point central, une information donnée à un agent reste chez cet agent.
 * Le commerçant dit à Léna « on ne fait plus de livraison » : Hugo continue de
 * le proposer par email, le chatbot répond que si, WhatsApp aussi. Du point de
 * vue du client, l'équipe ne se parle pas — et c'est exactement l'impression
 * qu'on vend le contraire.
 *
 * Le dossier client est déjà ce point central. Ce qui manquait, c'est le
 * chemin dans les DEUX sens : que ce qu'on dit à un agent y remonte, et que ce
 * qu'on dépose chez Clara en redescende vers les bons agents.
 *
 * ── Pourquoi ça ne notifie pas tout le monde ──
 *
 * Chaque information ne concerne pas tous les agents. `agentsConcernes` (voir
 * onboarding-needs.ts) sait qui consomme quoi : la carte du restaurant part
 * vers le contenu, le chatbot et WhatsApp, pas vers la prospection. Arroser
 * tous les agents diluerait leurs contextes et ferait grimper les coûts pour
 * rien.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { agentsConcernes, besoinsPour, manquePourAgent, BESOINS, type BesoinAgent } from './onboarding-needs';
import { loadBusinessDossier, upsertBusinessDossier, type BusinessDossier } from './client-context';

/** Les colonnes réelles du dossier ; le reste atterrit dans custom_fields. */
const CHAMPS_DOSSIER = new Set<string>([
  'company_name', 'company_description', 'business_type', 'legal_status', 'founder_name',
  'city', 'region', 'country', 'address', 'catchment_area',
  'main_products', 'price_range', 'unique_selling_points', 'competitors',
  'target_audience', 'ideal_customer_profile', 'customer_pain_points',
  'brand_tone', 'visual_style', 'brand_colors', 'content_themes', 'preferred_channels', 'posting_frequency',
  'business_goals', 'marketing_goals', 'monthly_budget', 'kpi_targets',
  'instagram_handle', 'tiktok_handle', 'linkedin_url', 'website_url', 'google_maps_url', 'facebook_url',
  'logo_url', 'communication_language',
]);

export interface InfoRecue {
  cle: string;
  valeur: string;
  /** Qui l'a recueillie : 'clara' ou l'id de l'agent à qui le client a parlé. */
  source: string;
  /** Formulation d'origine du client, conservée pour l'audit. */
  brut?: string;
}

export interface ResultatEnregistrement {
  cle: string;
  enregistre: boolean;
  /** Agents avertis — c'est la redistribution. */
  agentsAvertis: string[];
  /** Ancienne valeur, quand l'information en remplace une autre. */
  ancienneValeur?: string | null;
  raison?: string;
}

/**
 * Enregistre une information et la redistribue aux agents qui s'en servent.
 *
 * Le point important est le dernier : l'écriture dans le dossier ne suffit pas.
 * Un agent qui a déjà son contexte en mémoire ne relira pas le dossier avant
 * longtemps ; on trace donc explicitement la redistribution, ce qui permet à
 * chaque agent de savoir, à sa prochaine exécution, ce qui a changé depuis.
 */
export async function enregistrerInfo(
  supabase: SupabaseClient,
  userId: string,
  info: InfoRecue,
): Promise<ResultatEnregistrement> {
  const besoin = BESOINS.find(b => b.cle === info.cle);
  const valeur = String(info.valeur || '').trim();
  if (!valeur) {
    return { cle: info.cle, enregistre: false, agentsAvertis: [], raison: 'valeur vide' };
  }

  const dossier = await loadBusinessDossier(supabase, userId);
  const ancienne = dossier
    ? (CHAMPS_DOSSIER.has(info.cle)
      ? (dossier as any)[info.cle]
      : dossier.custom_fields?.[info.cle]) ?? null
    : null;

  // Une information identique n'est pas une nouveauté : la redistribuer
  // ferait croire aux agents qu'un changement a eu lieu.
  if (ancienne && String(ancienne).trim() === valeur) {
    return { cle: info.cle, enregistre: false, agentsAvertis: [], raison: 'valeur inchangée' };
  }

  // On passe TOUJOURS la clé telle quelle, jamais enveloppée dans
  // `custom_fields` : `upsertBusinessDossier` ignore explicitement cette clé
  // (elle est dans sa liste de champs sautés) et construit lui-même les champs
  // libres à partir des clés inconnues qu'on lui donne.
  //
  // L'envelopper faisait donc disparaître silencieusement toute information
  // hors colonnes — c'est-à-dire l'essentiel de ce que l'onboarding métier
  // collecte : carte, spécialité, zones d'intervention, horaires, prestations.
  // Le symptôme aurait été insidieux : la question reposée à chaque passage,
  // sans qu'aucune erreur n'apparaisse nulle part.
  await upsertBusinessDossier(supabase, userId, { [info.cle]: valeur });

  // Une clé inconnue du catalogue reste utile : le client a jugé bon de nous
  // la donner. On la conserve et on prévient largement plutôt que de la perdre.
  const destinataires = besoin
    ? agentsConcernes(info.cle)
    : ['content', 'email', 'dm', 'chatbot'];

  await supabase.from('agent_logs').insert({
    agent: 'chatbot',
    action: 'clara_info_redistribuee',
    status: 'ok',
    user_id: userId,
    data: {
      cle: info.cle,
      valeur: valeur.slice(0, 1000),
      ancienne_valeur: ancienne ? String(ancienne).slice(0, 500) : null,
      source: info.source,
      brut: info.brut?.slice(0, 500),
      agents_avertis: destinataires,
      connue_du_catalogue: !!besoin,
      question: besoin?.question,
    },
    created_at: new Date().toISOString(),
  });

  return {
    cle: info.cle, enregistre: true,
    agentsAvertis: destinataires,
    ancienneValeur: ancienne ? String(ancienne) : null,
  };
}

/**
 * Ce qui a changé récemment et qui concerne CET agent.
 *
 * À injecter en tête de son prompt : c'est ce qui fait qu'une consigne donnée
 * à Clara le lundi est appliquée par Léna le mardi, sans que le client ait à la
 * répéter.
 */
export async function nouveautesPourAgent(
  supabase: SupabaseClient,
  userId: string,
  agent: string,
  depuisJours = 30,
): Promise<string> {
  const { data } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('action', 'clara_info_redistribuee')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - depuisJours * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50);

  const miennes = (data || []).filter((l: any) => (l.data?.agents_avertis || []).includes(agent));
  if (!miennes.length) return '';

  // Une même clé peut avoir été corrigée plusieurs fois : seule la dernière
  // valeur compte, sinon on injecterait des consignes contradictoires.
  const vues = new Set<string>();
  const lignes: string[] = [];
  for (const l of miennes as any[]) {
    if (vues.has(l.data.cle)) continue;
    vues.add(l.data.cle);
    const quand = new Date(l.created_at).toLocaleDateString('fr-FR');
    const via = l.data.source === 'clara' ? 'via Clara' : `dit à ${l.data.source}`;
    lignes.push(`- ${l.data.question || l.data.cle} (${quand}, ${via}) : ${String(l.data.valeur).slice(0, 300)}`);
  }

  return [
    '',
    'CE QUE LE CLIENT A PRÉCISÉ RÉCEMMENT — à appliquer sans qu\'il ait à le redemander',
    ...lignes,
    "Ces informations priment sur tes réglages par défaut. Si l'une contredit ce que tu croyais savoir, c'est elle qui a raison.",
  ].join('\n');
}

/**
 * Ce qui manque encore pour que cet agent travaille bien.
 *
 * Deux usages, tous deux importants. D'abord la relance : Clara réclame ce qui
 * bloque réellement la qualité, pas la totalité du formulaire. Ensuite
 * l'honnêteté : un agent qui sait ce qu'il ignore peut le dire au lieu de
 * combler le vide — inventer une spécialité maison est exactement le genre
 * d'erreur qu'un client repère immédiatement.
 */
export async function lacunesPourAgent(
  supabase: SupabaseClient,
  userId: string,
  agent: string,
): Promise<{ manquants: BesoinAgent[]; blocPrompt: string }> {
  const dossier = await loadBusinessDossier(supabase, userId);
  const renseigne = clesRenseignees(dossier);

  const manquants = manquePourAgent(agent, {
    businessType: dossier?.business_type,
    dejaRenseigne: renseigne,
  });
  if (!manquants.length) return { manquants: [], blocPrompt: '' };

  const blocPrompt = [
    '',
    "CE QUE TU NE SAIS PAS ENCORE SUR CE COMMERCE",
    ...manquants.slice(0, 6).map(m => `- ${m.question}`),
    "N'invente RIEN pour combler ces trous. Reste sur ce que tu sais, ou dis simplement que tu ne l'as pas encore. Un détail inventé qu'un client repère coûte plus cher qu'un contenu moins précis.",
  ].join('\n');

  return { manquants, blocPrompt };
}

/** Les clés déjà remplies, colonnes du dossier et champs libres confondus. */
export function clesRenseignees(dossier: BusinessDossier | null): string[] {
  if (!dossier) return [];
  const cles: string[] = [];
  for (const champ of CHAMPS_DOSSIER) {
    const v = (dossier as any)[champ];
    if (v !== null && v !== undefined && String(v).trim() !== '') cles.push(champ);
  }
  for (const [k, v] of Object.entries(dossier.custom_fields || {})) {
    if (v && String(v).trim() !== '') cles.push(k);
  }
  if (dossier.uploaded_files?.length) cles.push('photos_reelles');
  return cles;
}

/**
 * La prochaine question que Clara doit poser, et pourquoi.
 *
 * Une seule à la fois, délibérément : un client relancé avec six questions n'en
 * traite aucune. On demande d'abord ce qui débloque le plus de qualité — les
 * essentiels, puis ce qui sert au plus grand nombre d'agents.
 */
export async function prochaineQuestion(
  supabase: SupabaseClient,
  userId: string,
  agentsActifs?: string[],
): Promise<{ besoin: BesoinAgent; formulation: string } | null> {
  const dossier = await loadBusinessDossier(supabase, userId);
  const restants = besoinsPour({
    businessType: dossier?.business_type,
    agentsActifs,
    dejaRenseigne: clesRenseignees(dossier),
  });
  if (!restants.length) return null;

  const meilleur = restants
    .filter(b => b.priorite === restants[0].priorite)
    .sort((a, b) => b.agents.length - a.agents.length)[0];

  return {
    besoin: meilleur,
    formulation: [
      meilleur.question + ' ?',
      `→ ${meilleur.aQuoiCaSert}`,
      meilleur.exemple ? `Par exemple : ${meilleur.exemple}` : '',
      meilleur.priorite === 'optionnel' ? "C'est facultatif — tu peux passer, et le déposer plus tard si tu veux." : '',
    ].filter(Boolean).join('\n'),
  };
}
