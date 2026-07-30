/**
 * Garde-fou anti-mensonge — vérification DÉTERMINISTE, pas une consigne.
 *
 * Contexte (2026-07-30) : un client a demandé à Hugo de nettoyer sa boîte.
 * Hugo a répondu qu'il avait supprimé des mails et créé des dossiers dans
 * Gmail. En réalité aucune action n'avait été lancée — la réponse est rédigée
 * avant l'exécution, et le modèle a comblé le vide. Le client est allé
 * vérifier dans Gmail et n'a rien trouvé.
 *
 * Une règle de prompt réduit le risque mais ne le supprime pas. Ici on
 * VÉRIFIE : si la réponse affirme un acte accompli alors qu'aucune action n'a
 * été déclenchée et qu'aucune tâche n'est terminée, on refuse la réponse telle
 * quelle. Le fondateur : « si il dit il fait, c'est vrai ».
 */

/**
 * Formulations qui affirment un acte ACCOMPLI. Volontairement centrées sur le
 * passé composé et les tournures de résultat — on ne veut pas attraper
 * « je vais publier » ni « je lance le tri », qui sont honnêtes.
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\bj'ai (supprim|effac|vid|nettoy|rang|class|archiv|cré|creé|publi|post|envoy|tri|répond|repond|planifi|programm|génér|gener|ajout|mis à jour|mis a jour)/i,
  /\bje viens de (supprimer|nettoyer|ranger|archiver|créer|creer|publier|poster|envoyer|trier|répondre|repondre|planifier|programmer|générer|generer)/i,
  /\b(c'est|c est) (fait|bon|publié|publie|envoyé|envoye|nettoyé|nettoye|réglé|regle|en ligne)\b/i,
  /\b(voilà|voila),? (c'est|c est) (fait|bon)\b/i,
  /\bton (post|message|email|mail) (est|a été|a ete) (publié|publie|envoyé|envoye)\b/i,
  /\b(ta boîte|ta boite) (est|a été|a ete) (nettoyée|nettoyee|triée|triee|rangée|rangee)\b/i,
  /\bj'ai bien (supprimé|supprime|envoyé|envoye|publié|publie|rangé|range)/i,
];

/** Chiffres présentés comme un résultat obtenu (« 12 mails supprimés »). */
const NUMERIC_RESULT = /\b\d+\s+(mails?|emails?|messages?|posts?|publications?|prospects?|pubs?|newsletters?|dossiers?|brouillons?)\s+(supprimés?|supprimes?|archivés?|archives?|rangés?|ranges?|publiés?|publies?|envoyés?|envoyes?|créés?|crees?|traités?|traites?)/i;

export interface ClaimVerdict {
  /** La réponse affirme-t-elle un acte non prouvé ? */
  unbacked: boolean;
  /** Extrait fautif, pour le log. */
  matched?: string;
}

/**
 * @param reply         texte produit par l'agent
 * @param actionEmitted une action a-t-elle réellement été déclenchée ?
 * @param hasFinishedTask une tâche est-elle réellement terminée dans le contexte ?
 */
export function detectUnbackedClaim(
  reply: string,
  opts: { actionEmitted: boolean; hasFinishedTask: boolean },
): ClaimVerdict {
  // Si une action vient d'être exécutée, ou si une tâche terminée figure au
  // contexte, l'agent a le droit d'annoncer un résultat.
  if (opts.actionEmitted || opts.hasFinishedTask) return { unbacked: false };
  const text = reply || '';
  for (const re of [...CLAIM_PATTERNS, NUMERIC_RESULT]) {
    const m = text.match(re);
    if (m) return { unbacked: true, matched: m[0].slice(0, 80) };
  }
  return { unbacked: false };
}

/**
 * Consigne de correction envoyée au modèle pour qu'il réécrive sa réponse.
 * On préfère une réécriture à une censure : le client doit recevoir une réponse
 * utile, simplement honnête.
 */
export const CLAIM_CORRECTION_INSTRUCTION = `Ta réponse précédente affirmait avoir DÉJÀ fait quelque chose (suppression, rangement, publication, envoi…) alors qu'aucune action n'a été lancée et qu'aucune tâche n'est terminée. C'est faux, et le client ira vérifier.
Réécris ta réponse :
- soit tu émets le tag [ACTION:...] correspondant et tu annonces au PRÉSENT ce que tu lances (« je trie ta boîte maintenant, je te préviens dès que c'est terminé ») ;
- soit tu ne peux pas agir, et tu le dis franchement avec ce qui manque.
Aucun verbe au passé composé sur une action non faite. Aucun chiffre inventé.`;

/** Repli déterministe si la réécriture échoue : on neutralise l'affirmation. */
export function neutralizeClaim(reply: string): string {
  return `${(reply || '').trim()}\n\n_(Je viens de lancer l'opération — je ne l'ai pas encore terminée. Tu recevras une notification avec le détail dès que c'est fini.)_`;
}
