/**
 * AMI — couche d'ACTION : transformer un diagnostic en changement de comportement.
 *
 * Jusqu'ici, Ami écrivait ses conclusions dans `agent_logs` sous forme de
 * feedback texte (« [AMIT Strategic] concentre-toi sur les reels »). Aucun agent
 * ne lisait ces lignes. Le système produisait donc des recommandations que
 * personne n'appliquait — un directeur marketing qui rédige des notes que
 * l'équipe ne reçoit pas.
 *
 * Les agents lisent en revanche `client_directives_typed` (voir
 * typed-directives.ts) : ce canal-là change réellement leur comportement. Ce
 * module y branche Ami, avec quatre garde-fous.
 *
 * ── 1. L'humain passe avant ──
 *
 * L'upsert des directives est en conflit sur (user_id, agent_id, type). Sans
 * précaution, un ordre d'Ami ÉCRASERAIT silencieusement celui du client : le
 * commerçant a demandé « publie à 9h », Ami décide 18h, et le client constate
 * que sa consigne a disparu sans explication. On vérifie donc l'existant : dès
 * qu'une directive du même type vient d'un humain, Ami s'abstient et le
 * consigne.
 *
 * ── 2. Tout ordre expire ──
 *
 * Une décision prise sur les chiffres d'une quinzaine ne vaut pas
 * indéfiniment. L'expiration garantit qu'un mauvais ordre se dissout tout seul
 * même si personne ne le remarque.
 *
 * ── 3. Périmètre fermé ──
 *
 * Ami ne peut écrire que des types explicitement autorisés par agent. Un
 * modèle qui invente un type de directive produirait une ligne qu'aucun agent
 * ne sait lire — un ordre fantôme, pire qu'une absence d'ordre.
 *
 * ── 4. Boucle fermée ──
 *
 * Chaque ordre mémorise la métrique qui l'a justifié et sa valeur au moment de
 * la décision. Après la fenêtre d'évaluation, on recompare : si la métrique ne
 * s'est pas améliorée, l'ordre est retiré. C'est ce qui distingue une
 * adaptation soutenue d'une simple agitation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DirectiveType } from './typed-directives';
import { collecterResultats, type ResultatsClient } from './ami-results';

/**
 * Ce qu'Ami a le droit de modifier, par agent.
 *
 * Volontairement restreint aux leviers réversibles et observables. Rien qui
 * touche à l'identité de marque (`brand_signature`) ou à la cible déclarée
 * (`audience_target`) : ce sont des choix du commerçant, pas des variables
 * d'optimisation.
 */
export const LEVIERS_AMI: Record<string, DirectiveType[]> = {
  content: ['posting_hours', 'format_preference', 'platform_priority', 'frequency', 'focus_topic'],
  dm: ['dm_tone', 'dm_target_niches'],
  // `email_cadence_days` est volontairement absent : le type existe dans
  // DirectiveType mais `directivesPromptBlock` ne le rend pas. Un ordre de ce
  // type serait écrit en base sans qu'aucun agent ne le lise — un ordre
  // fantôme, qu'Ami croirait appliqué et dont elle jugerait ensuite l'effet.
  email: ['email_subject_style'],
  commercial: ['prospection_zones', 'prospection_excluded_types'],
};

/**
 * Durée de vie d'un ordre et délai avant de juger son effet.
 *
 * Calés sur la cadence décidée par le fondateur (2026-08-05) : on analyse
 * chaque semaine, on ajuste chaque mois. Un ordre vit donc deux mois — le temps
 * de deux ajustements — et se juge à un mois, sur quatre relevés hebdomadaires
 * plutôt qu'un seul. Juger plus tôt reviendrait à confondre l'effet de l'ordre
 * avec la variation normale d'une semaine.
 */
const DUREE_ORDRE_JOURS = 60;
const FENETRE_EVALUATION_JOURS = 30;

/**
 * Sous ce nombre d'observations, on ne décide pas.
 *
 * Trois posts dont un a bien marché ne prouvent rien. Agir sur un signal aussi
 * mince ferait osciller la stratégie au gré du bruit, et le client verrait son
 * compte changer de cap toutes les semaines sans raison lisible.
 */
export const ECHANTILLON_MINIMUM = 8;

export interface OrdreAmi {
  agent: string;
  type: DirectiveType;
  value: any;
  /** Formulation lisible — c'est ce que le client verra s'il demande pourquoi. */
  justification: string;
  /** La métrique qui a déclenché la décision, et sa valeur à cet instant. */
  metrique: string;
  valeurAvant: number | null;
  canal: string;
  /** Ce qu'on attend : sert de critère de jugement, pas de promesse. */
  effetAttendu: string;
}

export interface ResultatApplication {
  appliques: OrdreAmi[];
  refuses: Array<{ ordre: OrdreAmi; raison: string }>;
}

/**
 * Écrit les ordres retenus, en protégeant systématiquement ceux du client.
 */
export async function appliquerOrdres(
  supabase: SupabaseClient,
  userId: string,
  ordres: OrdreAmi[],
): Promise<ResultatApplication> {
  const appliques: OrdreAmi[] = [];
  const refuses: Array<{ ordre: OrdreAmi; raison: string }> = [];

  for (const ordre of ordres) {
    const autorises = LEVIERS_AMI[ordre.agent];
    if (!autorises) {
      refuses.push({ ordre, raison: `agent « ${ordre.agent} » hors périmètre d'Ami` });
      continue;
    }
    if (!autorises.includes(ordre.type)) {
      refuses.push({ ordre, raison: `type « ${ordre.type} » non autorisé pour ${ordre.agent}` });
      continue;
    }
    if (ordre.value === undefined || ordre.value === null) {
      refuses.push({ ordre, raison: 'valeur absente' });
      continue;
    }

    // Garde-fou n°1 : une consigne humaine du même type est intouchable.
    const { data: existante } = await supabase
      .from('client_directives_typed')
      .select('source, raw_text')
      .eq('user_id', userId)
      .eq('agent_id', ordre.agent)
      .eq('type', ordre.type)
      .maybeSingle();

    if (existante && (existante as any).source !== 'ami') {
      refuses.push({
        ordre,
        raison: `le client a déjà donné cette consigne (« ${String((existante as any).raw_text || '').slice(0, 80)} ») — Ami ne la remplace pas`,
      });
      continue;
    }

    const expiration = new Date(Date.now() + DUREE_ORDRE_JOURS * 86400000).toISOString();
    const { error } = await supabase.from('client_directives_typed').upsert({
      user_id: userId,
      agent_id: ordre.agent,
      type: ordre.type,
      value: ordre.value,
      raw_text: `[Ami] ${ordre.justification}`,
      confidence: 0.75,
      source: 'ami',
      expires_at: expiration,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,agent_id,type', ignoreDuplicates: false });

    if (error) {
      refuses.push({ ordre, raison: `écriture refusée : ${error.message}` });
      continue;
    }

    // Trace d'audit : c'est elle qui permettra de juger l'ordre plus tard, et
    // de répondre au client qui demande « pourquoi as-tu changé ça ? ».
    // `agent_logs` n'a pas de colonne `target` — c'est `target_id`, un uuid.
    // L'agent visé va donc dans `data`, où il est lisible sans conversion.
    await supabase.from('agent_logs').insert({
      agent: 'amit',
      action: 'ami_order',
      status: 'ok',
      user_id: userId,
      data: {
        user_id: userId,
        agent_cible: ordre.agent,
        type: ordre.type,
        value: ordre.value,
        justification: ordre.justification,
        canal: ordre.canal,
        metrique: ordre.metrique,
        valeur_avant: ordre.valeurAvant,
        effet_attendu: ordre.effetAttendu,
        a_evaluer_apres: new Date(Date.now() + FENETRE_EVALUATION_JOURS * 86400000).toISOString(),
        expire_le: expiration,
      },
      created_at: new Date().toISOString(),
    });

    appliques.push(ordre);
  }

  return { appliques, refuses };
}

// ─────────────────────────────────────────────────────────────────────────────
// La boucle fermée : juger les ordres passés
// ─────────────────────────────────────────────────────────────────────────────

export interface VerdictOrdre {
  type: DirectiveType;
  agent: string;
  metrique: string;
  avant: number | null;
  apres: number | null;
  verdict: 'ameliore' | 'degrade' | 'stable' | 'indecidable';
  action: 'conserve' | 'retire';
  commentaire: string;
}

/** Retrouve une métrique dans le relevé courant à partir de son nom et canal. */
function lireMetrique(res: ResultatsClient, canal: string, nom: string) {
  const c = res.canaux.find(x => x.canal === canal);
  return c?.metriques?.[nom] ?? null;
}

/**
 * Les métriques où une BAISSE est un progrès.
 *
 * Sans cette liste, on féliciterait un ordre qui a fait grimper le taux de
 * liens morts ou de posts à zéro vue.
 */
const METRIQUES_INVERSEES = new Set([
  'taux_zero_vue', 'taux_liens_morts', 'taux_suppression_client',
  'taux_echec_envoi', 'taux_perte', 'taux_injoignables', 'messages_par_conversation',
]);

/**
 * Rejuge les ordres arrivés à échéance d'évaluation et retire ceux qui n'ont
 * rien apporté.
 *
 * Sans ce passage, chaque cycle empilerait de nouvelles consignes sur les
 * précédentes : au bout de quelques semaines les agents crouleraient sous des
 * ordres contradictoires dont plus personne ne connaîtrait la raison.
 */
export async function evaluerOrdresPasses(
  supabase: SupabaseClient,
  userId: string,
  resultatsActuels?: ResultatsClient,
): Promise<VerdictOrdre[]> {
  const maintenant = Date.now();

  const { data: ordres } = await supabase
    .from('agent_logs')
    .select('id, data, created_at')
    .eq('agent', 'amit')
    .eq('action', 'ami_order')
    .gte('created_at', new Date(maintenant - 60 * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(200);

  const aJuger = (ordres || []).filter((o: any) => {
    if (o.data?.user_id !== userId) return false;
    if (o.data?.evalue) return false;
    const echeance = o.data?.a_evaluer_apres;
    return echeance && new Date(echeance).getTime() <= maintenant;
  });
  if (!aJuger.length) return [];

  const res = resultatsActuels || await collecterResultats(supabase, userId);
  const verdicts: VerdictOrdre[] = [];

  for (const o of aJuger) {
    const d = o.data;
    const m = lireMetrique(res, d.canal, d.metrique);
    const avant = typeof d.valeur_avant === 'number' ? d.valeur_avant : null;
    const apres = m?.valeur ?? null;

    let verdict: VerdictOrdre['verdict'] = 'indecidable';
    let action: VerdictOrdre['action'] = 'conserve';
    let commentaire = '';

    if (apres === null || avant === null) {
      commentaire = 'métrique indisponible à la réévaluation — ordre conservé jusqu\'à expiration naturelle';
    } else if ((m?.echantillon ?? 0) < ECHANTILLON_MINIMUM) {
      commentaire = `échantillon insuffisant (n=${m?.echantillon}) — on ne conclut pas`;
    } else {
      const inversee = METRIQUES_INVERSEES.has(d.metrique);
      const progres = inversee ? avant - apres : apres - avant;
      const seuil = Math.abs(avant) * 0.05; // en deçà de 5 %, c'est du bruit

      if (progres > seuil) { verdict = 'ameliore'; commentaire = 'la métrique a progressé — ordre conservé'; }
      else if (progres < -seuil) {
        verdict = 'degrade'; action = 'retire';
        commentaire = 'la métrique s\'est dégradée depuis l\'ordre — retrait immédiat';
      } else {
        verdict = 'stable'; action = 'retire';
        commentaire = 'aucun effet mesurable — on retire pour laisser la place à un autre levier';
      }
    }

    if (action === 'retire') {
      await supabase
        .from('client_directives_typed')
        .delete()
        .eq('user_id', userId)
        .eq('agent_id', d.agent_cible || '')
        .eq('type', d.type)
        .eq('source', 'ami');
    }

    // On marque l'ordre comme jugé pour ne pas le réévaluer en boucle.
    await supabase
      .from('agent_logs')
      .update({ data: { ...d, evalue: true, verdict, valeur_apres: apres, juge_le: new Date().toISOString() } })
      .eq('id', o.id);

    verdicts.push({
      type: d.type, agent: d.agent_cible || '', metrique: d.metrique,
      avant, apres, verdict, action, commentaire,
    });
  }

  return verdicts;
}

/**
 * Historique lisible des ordres d'Ami — sert au prompt (pour ne pas répéter un
 * levier déjà jugé inefficace) et aux réponses adressées au client.
 */
export async function historiqueOrdres(
  supabase: SupabaseClient,
  userId: string,
  limite = 20,
): Promise<string> {
  const { data } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('agent', 'amit')
    .eq('action', 'ami_order')
    .order('created_at', { ascending: false })
    .limit(120);

  const miens = (data || []).filter((o: any) => o.data?.user_id === userId).slice(0, limite);
  if (!miens.length) return 'Aucun ordre passé : c\'est le premier cycle sur ce client.';

  return miens.map((o: any) => {
    const d = o.data;
    const date = new Date(o.created_at).toLocaleDateString('fr-FR');
    const issue = d.evalue
      ? `jugé « ${d.verdict} » (${d.metrique} : ${d.valeur_avant} → ${d.valeur_apres})`
      : 'en cours d\'évaluation';
    return `- ${date} · ${d.agent_cible}/${d.type} — ${d.justification} → ${issue}`;
  }).join('\n');
}
