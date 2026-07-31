/**
 * Démonstrations vidéo par agent.
 *
 * Demande fondateur (2026-07-30) : des vidéos courtes sur l'accueil, une par
 * agent, pour accompagner et convertir — et Clara doit pouvoir les montrer
 * quand un client demande comment ça marche. Les vidéos sont filmées en
 * capture d'écran SANS SON : tout doit se comprendre à l'image, d'où le champ
 * `resume` qui sert de sous-titre et de texte alternatif.
 *
 * POUR AJOUTER UNE VIDÉO : déposer le fichier dans `public/videos/agents/`
 * puis renseigner `src` ci-dessous. Tant que `src` est vide, l'emplacement
 * n'apparaît pas — la carte s'affiche exactement comme aujourd'hui, sans trou
 * ni lecteur cassé.
 */

export interface AgentVideo {
  /** Chemin public du fichier, vide tant que la vidéo n'est pas tournée. */
  src: string;
  /** Image fixe affichée avant lecture (facultative). */
  poster?: string;
  /** Ce que la vidéo montre, en une phrase — sert de sous-titre (pas de son). */
  resume: string;
  /** Durée visée, pour l'affichage. */
  duree: string;
}

export const AGENT_VIDEOS: Record<string, AgentVideo> = {
  content: { src: '', resume: 'Tu déposes 3 photos de ta boutique, Léna en fait des posts publiables et les programme.', duree: '40 s' },
  email: { src: '', resume: 'Une boîte à 200 pubs, Hugo la vide, range en dossiers et prépare les réponses.', duree: '40 s' },
  gmaps: { src: '', resume: 'Un avis Google arrive, Théo répond dans ton ton et complète ta fiche.', duree: '30 s' },
  dm_instagram: { src: '', resume: 'Jade répond aux DM et aux commentaires, et repère les comptes à suivre.', duree: '30 s' },
  rh: { src: '', resume: 'Tu cliques sur « CDD », Sara sort le contrat à ta marque, prêt à signer.', duree: '30 s' },
  comptable: { src: '', resume: 'Louis produit un prévisionnel Excel et un dossier prêt pour la banque.', duree: '30 s' },
  commercial: { src: '', resume: 'Léo remplit ton CRM de prospects qualifiés dans ta zone.', duree: '30 s' },
  whatsapp: { src: '', resume: 'Stella confirme le rendez-vous et envoie le rappel de la veille.', duree: '30 s' },
  /** Parcours complet, mis en avant sur l'accueil et proposé par Clara. */
  parcours: { src: '', resume: 'De l\'inscription au premier post publié, en conditions réelles pour une boutique.', duree: '2 min 30' },
};

/** La vidéo de cet agent est-elle disponible ? */
export function hasAgentVideo(agentId: string): boolean {
  return !!AGENT_VIDEOS[agentId]?.src;
}

/** Vidéos réellement disponibles, pour l'accueil et pour Clara. */
export function availableVideos(): Array<{ id: string } & AgentVideo> {
  return Object.entries(AGENT_VIDEOS)
    .filter(([, v]) => !!v.src)
    .map(([id, v]) => ({ id, ...v }));
}

/**
 * Bloc de prompt pour Clara : ce qu'elle peut montrer, et comment.
 * Renvoie une chaîne vide tant qu'aucune vidéo n'est disponible — Clara ne
 * promettra donc jamais une vidéo qui n'existe pas.
 */
export function videosPromptBlock(): string {
  const list = availableVideos();
  if (list.length === 0) return '';
  const lines = list.map(v => `  • ${v.id} (${v.duree}) — ${v.resume}\n     lien : ${v.src}`).join('\n');
  return `\n━━━ DÉMONSTRATIONS VIDÉO DISPONIBLES ━━━
${lines}

Quand le client demande comment ça marche, ce que fait un agent, ou qu'il
hésite : propose la vidéo correspondante et donne le lien tel quel. Elles sont
SANS SON et durent moins d'une minute (sauf le parcours complet) — précise-le,
il peut la regarder tout de suite, même en réunion. Ne propose JAMAIS une vidéo
qui n'est pas dans cette liste.\n`;
}
