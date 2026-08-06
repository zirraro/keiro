/**
 * SYNERGIES ENTRE AGENTS — faire circuler ce qui est déjà produit.
 *
 * Demande du fondateur (2026-08-05) : « rouvrir le canal entre agents. Jade
 * sait quels sujets font répondre en message privé, Léna l'ignore. Hugo sait
 * quelles objections reviennent, le chatbot ne les a pas. » Puis : « Sara,
 * Louis et Théo peuvent avoir besoin d'infos ou interagir, WhatsApp peut
 * interagir plus. »
 *
 * ── Pourquoi ce module ──
 *
 * `agent_feedback` existait depuis des mois et n'avait jamais reçu une seule
 * ligne : l'insert passait une colonne inexistante, PostgREST le rejetait en
 * bloc, et l'appelant ne lisait pas l'erreur. Le canal était donc mort sans
 * que personne ne s'en aperçoive.
 *
 * Maintenant qu'il écrit, encore faut-il savoir QUOI faire circuler et VERS
 * QUI. Diffuser tout à tout le monde diluerait chaque contexte et ferait
 * grimper la facture : chaque agent lirait des dizaines de lignes qui ne le
 * concernent pas, à chaque exécution.
 *
 * ── Le principe de routage ──
 *
 * Une observation ne voyage que si elle change une décision chez le
 * destinataire. « Les posts sur le levain font répondre en DM » change ce que
 * Léna écrit ; ça ne change rien pour le comptable. Le catalogue ci-dessous
 * décrit ces trajets, un par un, avec la raison — sans la raison, personne ne
 * saura dans six mois si le trajet mérite d'exister.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Les agents qui peuvent émettre ou recevoir. */
export type AgentId =
  | 'content' | 'dm' | 'email' | 'commercial' | 'chatbot' | 'whatsapp'
  | 'seo' | 'retention' | 'rh' | 'comptable' | 'amit' | 'ops';

/** Prénoms côté produit — jamais d'identifiant technique dans un texte lu. */
export const PRENOM: Record<string, string> = {
  content: 'Léna', dm: 'Jade', email: 'Hugo', commercial: 'Léo',
  chatbot: 'Clara', whatsapp: 'Stella', seo: 'Théo', retention: 'Louis',
  rh: 'Sara', comptable: 'Camille', amit: 'Ami', ops: 'Ops',
};

export interface Trajet {
  /** Ce qui est observé, en une clé stable. */
  observation: string;
  de: AgentId;
  vers: AgentId[];
  /** Pourquoi ça change quelque chose chez le destinataire. */
  utilite: string;
}

/**
 * Le catalogue des trajets utiles.
 *
 * Volontairement explicite plutôt que dérivé d'une règle générale : chaque
 * ligne est une décision produit, et la lire suffit à comprendre pourquoi
 * l'information voyage.
 */
export const TRAJETS: Trajet[] = [
  // ── Ce que le terrain remonte vers la production de contenu ──
  {
    observation: 'sujets_qui_font_repondre',
    de: 'dm', vers: ['content', 'whatsapp', 'email'],
    utilite: "Les sujets qui déclenchent une réponse en message privé sont ceux qui intéressent vraiment cette clientèle. Léna en fait des posts, Hugo des objets d'emails.",
  },
  {
    observation: 'objections_recurrentes',
    de: 'email', vers: ['chatbot', 'whatsapp', 'dm', 'commercial'],
    utilite: "Une objection qui revient par email reviendra en message privé et au téléphone. La traiter avant qu'elle soit formulée fait passer de « j'y réfléchis » à « je prends ».",
  },
  {
    observation: 'questions_frequentes_visiteurs',
    de: 'chatbot', vers: ['content', 'seo', 'whatsapp'],
    utilite: "Ce que les visiteurs demandent au chatbot dit exactement quel contenu manque sur le site et dans les publications.",
  },
  {
    observation: 'requetes_qui_amenent_du_monde',
    de: 'seo', vers: ['content', 'chatbot'],
    utilite: "Les mots par lesquels on trouve ce commerce sont ceux qu'il faut employer dans les légendes et les réponses — ce sont les mots de ses clients, pas les nôtres.",
  },
  {
    observation: 'avis_clients_recurrents',
    de: 'seo', vers: ['content', 'email', 'dm'],
    utilite: "Ce que les clients écrivent dans leurs avis convertit mieux que ce qu'on écrirait à leur place. On le réutilise tel quel.",
  },

  // ── Ce que la prospection produit et que les autres attendent ──
  {
    observation: 'fiche_prospect_enrichie',
    de: 'commercial', vers: ['dm', 'email', 'whatsapp'],
    utilite: "Abonnés, ancienneté du dernier post, réputation : de quoi personnaliser sur des faits vérifiés au lieu d'inventer un détail que le prospect démentira.",
  },
  {
    observation: 'motifs_de_refus',
    de: 'commercial', vers: ['email', 'dm', 'content'],
    utilite: "Pourquoi un prospect a dit non oriente l'argumentaire suivant. Sans ce retour, on répète l'approche qui vient d'échouer.",
  },

  // ── La rétention, qui voit partir les gens ──
  {
    observation: 'signaux_de_lassitude',
    de: 'retention', vers: ['content', 'amit', 'chatbot'],
    utilite: "Un client qui se désengage le montre avant de partir : moins de connexions, plus de posts supprimés. Léna ajuste le ton, Ami révise la stratégie.",
  },
  {
    observation: 'raisons_de_depart',
    de: 'retention', vers: ['amit', 'commercial'],
    utilite: "Ce qui fait partir un client est ce qu'il ne faut pas promettre au suivant.",
  },

  // ── WhatsApp, qui parle en direct ──
  {
    observation: 'demandes_en_direct',
    de: 'whatsapp', vers: ['chatbot', 'content', 'email'],
    utilite: "Ce qu'on demande sur WhatsApp est plus direct qu'ailleurs : disponibilité, prix, délai. C'est de l'information de première main sur ce qui bloque.",
  },
  {
    observation: 'conversion_apres_visuel',
    de: 'whatsapp', vers: ['commercial', 'content'],
    utilite: "Quand un aperçu personnalisé déclenche une réponse, ça valide à la fois le visuel et le prospect. Léo priorise, Léna reproduit ce qui a marché.",
  },

  // ── Les fonctions support, qui savent des choses utiles ──
  {
    observation: 'contraintes_administratives',
    de: 'comptable', vers: ['content', 'email'],
    utilite: "Une mention légale obligatoire, une période de soldes encadrée, un tarif à ne pas afficher : autant de pièges qu'un post peut déclencher.",
  },
  {
    observation: 'moments_forts_equipe',
    de: 'rh', vers: ['content'],
    utilite: "Une arrivée, un anniversaire d'ouverture, un départ : les contenus qui parlent des gens sont ceux qui touchent le plus, et personne d'autre ne les connaît.",
  },
];

/**
 * Diffuse une observation aux agents qu'elle concerne.
 *
 * On écrit dans `agent_feedback` — le canal historique, désormais réparé — avec
 * l'agent émetteur en clair, pour que le destinataire sache d'où vient
 * l'information et puisse en juger la fiabilité.
 */
export async function partager(
  supabase: SupabaseClient,
  input: {
    observation: string;
    de: AgentId;
    contenu: string;
    userId?: string | null;
    /** Chiffre à l'appui, quand il existe : sans lui, ce n'est qu'une impression. */
    preuve?: string;
  },
): Promise<{ diffuse: boolean; vers: AgentId[] }> {
  const trajet = TRAJETS.find(t => t.observation === input.observation && t.de === input.de);
  if (!trajet) return { diffuse: false, vers: [] };

  const texte = [
    input.contenu.trim(),
    input.preuve ? `(${input.preuve})` : '',
  ].filter(Boolean).join(' ');

  const { saveAgentFeedback } = await import('./learning');
  for (const destinataire of trajet.vers) {
    try {
      await saveAgentFeedback(supabase, {
        from_agent: input.de,
        to_agent: destinataire,
        feedback: `[${PRENOM[input.de] || input.de}] ${texte}`,
        category: 'general',
      });
    } catch { /* un destinataire injoignable n'empêche pas les autres */ }
  }
  return { diffuse: true, vers: trajet.vers };
}

/**
 * Ce que l'équipe a appris et qui concerne CET agent.
 *
 * À injecter dans son prompt. C'est le pendant lecture de `partager` : sans
 * lui, on écrirait dans un canal que personne n'ouvre — exactement le défaut
 * qu'on vient de corriger.
 *
 * On déduplique par émetteur et on borne à huit lignes : au-delà, le bloc
 * pèse plus qu'il n'apporte, et les observations les plus anciennes noient
 * les récentes.
 */
export async function contexteEquipe(
  supabase: SupabaseClient,
  agent: AgentId,
  userId?: string | null,
  depuisJours = 21,
): Promise<string> {
  try {
    let q = supabase
      .from('agent_logs')
      .select('agent, data, created_at')
      .eq('action', 'agent_feedback')
      .eq('agent', agent)
      .gte('created_at', new Date(Date.now() - depuisJours * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(40);
    if (userId) q = q.eq('user_id', userId);

    const { data } = await q;
    if (!data?.length) return '';

    const vus = new Set<string>();
    const lignes: string[] = [];
    for (const l of data as any[]) {
      const texte = String(l.data?.feedback || '').trim();
      if (!texte || vus.has(texte)) continue;
      vus.add(texte);
      lignes.push(`- ${texte}`);
      if (lignes.length >= 8) break;
    }
    if (!lignes.length) return '';

    return [
      '',
      "CE QUE LE RESTE DE L'ÉQUIPE A OBSERVÉ",
      ...lignes,
      "Ces observations viennent d'agents qui parlent à la même clientèle que toi, sur d'autres canaux. Elles ne sont pas des ordres : sers-t'en si elles éclairent ce que tu prépares, ignore-les sinon.",
    ].join('\n');
  } catch {
    return '';
  }
}

/**
 * Les leçons que CET agent a lui-même tirées.
 *
 * Trente fichiers écrivent dans le pool de leçons, deux le lisaient : un agent
 * qui avait appris quelque chose la semaine précédente ne s'en souvenait pas
 * la semaine suivante. C'est la boucle la moins chère à refermer du système —
 * la donnée existe déjà, il suffisait de la relire.
 */
export async function mesLecons(
  supabase: SupabaseClient,
  agent: AgentId,
  limite = 6,
): Promise<string> {
  try {
    const { data } = await supabase
      .from('agent_logs')
      .select('data, created_at')
      .eq('agent', agent)
      .eq('action', 'learning')
      .order('created_at', { ascending: false })
      .limit(30);

    // On ne garde que les leçons assez confirmées : une observation notée une
    // seule fois peut n'être qu'un accident, et la ressortir à chaque
    // exécution ancrerait une fausse règle.
    const retenues = (data || [])
      .filter((l: any) => Number(l.data?.confidence ?? 0) >= 55)
      .slice(0, limite)
      .map((l: any) => `- ${String(l.data?.learning || '').trim()}`)
      .filter(l => l.length > 4);

    if (!retenues.length) return '';
    return ['', 'CE QUE TU AS DÉJÀ APPRIS SUR CE COMMERCE', ...retenues].join('\n');
  } catch {
    return '';
  }
}

/**
 * Le bloc complet à injecter : ce que l'équipe sait, et ce que l'agent a appris.
 */
export async function blocSynergies(
  supabase: SupabaseClient,
  agent: AgentId,
  userId?: string | null,
): Promise<string> {
  const [equipe, lecons] = await Promise.all([
    contexteEquipe(supabase, agent, userId),
    mesLecons(supabase, agent),
  ]);
  return equipe + lecons;
}
