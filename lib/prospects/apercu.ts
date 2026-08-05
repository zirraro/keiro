/**
 * L'APERÇU PERSONNALISÉ — un visuel fait pour CE commerce, avant tout contact.
 *
 * Demande du fondateur (2026-08-05) : « dans la fiche du prospect, pouvoir
 * générer une image personnalisée et pertinente d'après son profil, que je lui
 * envoie sur WhatsApp ou Instagram via un lien qui devient un aperçu
 * visuellement fort : "écoutez, je me suis permis de faire un visuel pour vous
 * et vous montrer ce que ça donnerait sur votre business, voulez-vous que je
 * vous le montre rapidement ?" — toujours pousser la valeur en premier pour
 * accrocher, comme avec les blogs. »
 *
 * ── Pourquoi ça marche, et pourquoi c'est risqué ──
 *
 * Ça marche parce que la démonstration remplace l'argumentaire : on ne promet
 * pas un résultat, on le montre déjà fait. C'est le même levier que l'article
 * de blog offert, en plus immédiat.
 *
 * C'est risqué exactement pour la même raison. Un visuel qui se trompe de
 * métier, de ville ou de nom détruit la démonstration ET la crédibilité en une
 * seconde — bien plus qu'un message générique qui n'aurait rien promis. Le
 * fondateur l'a dit lui-même : « attention, les infos du profil CRM de la fiche
 * doivent être super bonnes et vérifiées pour éviter les erreurs. »
 *
 * D'où la règle qui gouverne ce module : **on ne génère RIEN tant qu'on n'a pas
 * de quoi être juste.** Refuser est un résultat acceptable ; se tromper ne
 * l'est pas.
 */
import { famillesDe } from '../business-families';
import { PREUVE_PAR_METIER_PUBLIC } from '../visuals/carousel-coherence';

export interface DonneesApercu {
  nom?: string | null;
  ville?: string | null;
  typeActivite?: string | null;
  note?: number | null;
  avis?: number | null;
  instagram?: string | null;
  igStatut?: string | null;
}

export interface VerdictApercu {
  possible: boolean;
  /** Pourquoi on refuse — affiché tel quel à l'utilisateur. */
  raison?: string;
  /** Ce qu'il manque, pour qu'il puisse compléter la fiche. */
  manquant?: string[];
}

/**
 * A-t-on de quoi produire un visuel JUSTE ?
 *
 * Trois exigences, et aucune n'est négociable :
 *
 * 1. Un nom d'établissement. Sans lui le visuel ne parle de personne.
 * 2. Une activité RECONNUE par la taxonomie. « Autre » ou un libellé
 *    inclassable signifie qu'on ne sait pas quoi représenter — et un visuel
 *    inventé sur un métier qu'on n'a pas compris est précisément ce qu'il ne
 *    faut pas envoyer à un inconnu qu'on veut convaincre.
 * 3. Une ville. Elle ancre le visuel et, surtout, elle prouve au destinataire
 *    qu'on a regardé sa fiche plutôt qu'envoyé un modèle.
 */
export function peutGenererApercu(d: DonneesApercu): VerdictApercu {
  const manquant: string[] = [];
  if (!d.nom || String(d.nom).trim().length < 2) manquant.push("le nom de l'établissement");
  if (!d.ville || String(d.ville).trim().length < 2) manquant.push('la ville');

  const familles = famillesDe(d.typeActivite);
  if (!familles.size) manquant.push("une activité reconnue (le libellé actuel ne permet pas de savoir quoi représenter)");

  if (manquant.length) {
    return {
      possible: false,
      manquant,
      raison: `Fiche trop incomplète pour un visuel juste : il manque ${manquant.join(', ')}. Un aperçu qui se trompe de métier ou de ville coûte plus cher qu'un message sans visuel.`,
    };
  }
  return { possible: true };
}

/**
 * Le brief d'image, construit uniquement à partir de faits vérifiés.
 *
 * Aucune donnée n'est déduite ni embellie : on décrit une scène du métier
 * reconnu, sans jamais affirmer quoi que ce soit sur CE commerce en
 * particulier. C'est la nuance qui rend l'envoi honnête — on montre « ce que
 * ça pourrait donner », pas « voici votre boutique », qu'on n'a jamais vue.
 */
export function briefApercu(d: DonneesApercu): string {
  const familles = famillesDe(d.typeActivite);
  const scene = PREUVE_PAR_METIER_PUBLIC[[...familles].find(f => PREUVE_PAR_METIER_PUBLIC[f]) || '']
    || 'le résultat concret du travail, cadré de près';

  return [
    `Photographie éditoriale pour les réseaux sociaux d'un commerce local : ${d.typeActivite}.`,
    `Scène : ${scene}.`,
    'Lumière naturelle, matières et peau réalistes, profondeur de champ courte.',
    "Cadrage carré, composition qui laisse respirer le haut de l'image.",
    "Aucun texte, aucun logo, aucune enseigne lisible dans l'image.",
    "Aucun visage reconnaissable en gros plan.",
  ].join(' ');
}

/**
 * Le message d'accompagnement.
 *
 * La valeur passe avant la demande : on montre d'abord, on propose ensuite.
 * Aucun chiffre, aucune promesse de résultat — la seule affirmation est ce
 * qu'on a réellement fait, et elle est vérifiable puisque le visuel est joint.
 */
export function messageApercu(d: DonneesApercu, lien: string): { whatsapp: string; instagram: string } {
  const nom = String(d.nom || '').trim();
  const accroche = `Bonjour ${nom}, je me suis permis de préparer un visuel pour vous, pour vous montrer ce que ça donnerait sur votre compte.`;

  return {
    whatsapp: [
      accroche,
      '',
      lien,
      '',
      'Si ça vous parle, je vous explique en deux minutes comment ça marche. Sinon vous le gardez, il est à vous.',
    ].join('\n'),
    // Sur Instagram le lien ne se déplie pas dans le message : on annonce donc
    // le visuel autrement, sans quoi le destinataire reçoit une URL nue.
    instagram: [
      accroche,
      `Je vous l'envoie ici si vous voulez le voir — dites-moi simplement oui.`,
    ].join(' '),
  };
}
