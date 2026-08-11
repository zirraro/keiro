/**
 * Ce qu'« excellent » veut dire pour CHAQUE tâche d'agent.
 *
 * ── Pourquoi une définition par tâche ──
 *
 * Fondateur, 2026-08-11 : « on veut que tous les agents aient, pour toutes
 * leurs tâches, un contrôle qualité. »
 *
 * Le contenu publié avait le sien depuis longtemps ; le reste de ce qui sort
 * de KeiroAI n'en avait aucun. Or un mail de prospection raté coûte un
 * prospect, une réponse à un avis Google ratée s'affiche publiquement sous la
 * fiche du commerçant, et un document juridique bancal l'expose vraiment.
 *
 * Un barème unique ne pourrait pas juger ces trois-là : ce qui fait la qualité
 * d'un message privé — court, direct, humain — ferait un très mauvais contrat
 * de travail. D'où une définition par tâche, écrite comme une consigne à un
 * relecteur exigeant, et non comme une grille abstraite.
 *
 * Le seuil est lui aussi propre à la tâche : une réponse d'avis Google est
 * publique et définitive, un brouillon de DM se relit avant envoi.
 */

export interface CritereTache {
  /** Nom lisible, pour les journaux et les messages au client. */
  libelle: string;
  /** Ce que le relecteur doit exiger. Injecté tel quel dans le contrôle. */
  exigences: string;
  /** En dessous, on ne laisse pas partir en l'état. */
  seuil: number;
  /**
   * Un contenu retenu bloque-t-il l'envoi, ou part-il quand même après
   * réécriture ? Vrai = on préfère ne rien envoyer que d'envoyer mauvais.
   */
  bloquantSiEchec: boolean;
}

const COMMUN = `RÈGLES VALABLES POUR TOUT CE QUI SORT DE KEIROAI :
· Français correct, sans faute, sans anglicisme inutile. Les clients sont français.
· JAMAIS de client inventé, de témoignage fabriqué, de nom de commerce ou de ville présentés comme réels.
· Aucun chiffre de résultat invraisemblable. Un ordre de grandeur crédible passe, « +300 % » non.
· Jamais le mot « IA » dans une signature ni dans ce que lit le client final : on écrit « ton stratège », pas « ton stratège IA ».
· Aucun texte de remplissage, aucun crochet resté vide, aucune formule creuse.
· Ce qui est promis doit être tenable par le commerçant.`;

export const CRITERES: Record<string, CritereTache> = {
  email_prospection: {
    libelle: 'Email de prospection',
    seuil: 7,
    bloquantSiEchec: true,
    exigences: `${COMMUN}

CE QUI FAIT UN BON EMAIL DE PROSPECTION FROID :
· L'objet donne envie d'ouvrir sans mentir ni racoler. Pas de majuscules, pas d'emoji, pas de « URGENT ».
· La première phrase parle du DESTINATAIRE, pas de nous. Un mail qui commence par « Nous sommes… » est mort.
· On apporte de la VALEUR avant de demander quoi que ce soit : un constat utile sur son métier, un article, une observation.
· On ne parle NI de prix, NI de carte bancaire, NI d'abonnement dans un premier contact.
· Court. Cinq à dix lignes. Un commerçant lit sur son téléphone entre deux clients.
· UN seul appel à l'action, simple et sans pression.
· Ton humain, tutoiement possible, jamais de jargon marketing.`,
  },

  email_reponse: {
    libelle: 'Réponse à un email reçu',
    seuil: 7,
    bloquantSiEchec: true,
    exigences: `${COMMUN}

CE QUI FAIT UNE BONNE RÉPONSE :
· Elle répond À LA QUESTION POSÉE, précisément, dès les premières lignes.
· Elle reprend les éléments concrets du message reçu — sans quoi elle sonne automatique.
· Elle ne promet rien qu'on ne puisse tenir, et n'invente aucune information sur le dossier.
· Si quelque chose manque pour répondre, elle le dit et pose UNE question claire.
· Ton professionnel et chaleureux, sans excès de formules.`,
  },

  dm_reponse: {
    libelle: 'Message privé',
    seuil: 7,
    bloquantSiEchec: true,
    exigences: `${COMMUN}

CE QUI FAIT UN BON MESSAGE PRIVÉ :
· Très court. Deux à quatre lignes. Un DM long ne se lit pas.
· Écrit comme une personne écrit, pas comme une marque : pas de formule d'appel guindée, pas de signature.
· Il rebondit sur quelque chose de RÉEL — le profil, un post, ce que la personne a écrit.
· Aucune vente au premier message. On ouvre une conversation.
· Un emoji au maximum, et seulement s'il apporte le ton.
· Pas de lien dans un premier message : les plateformes le sanctionnent et le lecteur s'en méfie.`,
  },

  avis_google: {
    libelle: 'Réponse à un avis Google',
    seuil: 8,
    bloquantSiEchec: true,
    exigences: `${COMMUN}

CETTE RÉPONSE EST PUBLIQUE, DÉFINITIVE, ET LUE PAR LES FUTURS CLIENTS. Elle est jugée plus sévèrement que tout le reste.
· Elle nomme un élément PRÉCIS de l'avis : sans cela, elle sonne copiée-collée et fait plus de mal que pas de réponse.
· Sur un avis négatif : on reconnaît, on ne se justifie pas, on ne conteste pas les faits publiquement, on propose de poursuivre en privé.
· Jamais de ton défensif, jamais d'ironie, jamais de reproche au client — même quand l'avis est injuste.
· Signée par le commerce, au ton du commerce, pas au ton d'un service client générique.
· Trois à cinq lignes. Une réponse trop longue à un avis paraît suspecte.`,
  },

  document_juridique: {
    libelle: 'Document RH ou juridique',
    seuil: 8,
    bloquantSiEchec: true,
    exigences: `${COMMUN}

UN DOCUMENT ENGAGE LE COMMERÇANT. Il est jugé sévèrement.
· Toutes les mentions obligatoires du type de document sont présentes.
· Aucune donnée inventée : ce qui n'est pas connu reste un champ à compléter, VISIBLEMENT marqué, jamais rempli au hasard.
· Aucun montant, date ou durée inventés.
· Vocabulaire juridique juste ; à défaut de certitude, une formulation neutre plutôt qu'un terme faux.
· Le document doit indiquer qu'il constitue un modèle à faire vérifier — on n'est pas avocat, et le prétendre exposerait le client.`,
  },

  whatsapp_reponse: {
    libelle: 'Réponse WhatsApp',
    seuil: 7,
    bloquantSiEchec: true,
    exigences: `${COMMUN}

CE QUI FAIT UNE BONNE RÉPONSE WHATSAPP :
· Très courte, conversationnelle : c'est une messagerie, pas un courrier.
· Elle répond immédiatement à la demande — horaires, disponibilité, prix, réservation — sans préambule.
· Si l'information n'est pas dans le dossier du commerce, on ne l'invente pas : on le dit et on propose de faire suivre.
· Ton du commerce, chaleureux, jamais robotique.
· Pas de pavé : si la réponse est longue, elle se découpe.`,
  },

  brief_client: {
    libelle: 'Brief envoyé au client',
    seuil: 7,
    bloquantSiEchec: false,
    exigences: `${COMMUN}

CE QUI FAIT UN BON BRIEF :
· Il dit ce qui a été FAIT et ce que ça a donné, avec des chiffres réels — jamais d'activité inventée pour remplir.
· S'il ne s'est rien passé, il le dit franchement : un brief qui gonfle le vide détruit la confiance.
· Il se lit en trente secondes sur un téléphone.
· Il ne demande une action que si elle est vraiment nécessaire.`,
  },
};

/** Le barème d'une tâche, avec un repli prudent pour les tâches non déclarées. */
export function critereDe(tache: string): CritereTache {
  return CRITERES[tache] || {
    libelle: tache,
    seuil: 7,
    bloquantSiEchec: false,
    exigences: COMMUN,
  };
}
