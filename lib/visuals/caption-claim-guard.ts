/**
 * Détecte un client inventé dans une légende, sans appel d'IA.
 *
 * Pourquoi ce garde-fou en plus du contrôle de cohérence : celui-ci analyse
 * l'IMAGE et la légende ensemble, il ne s'applique donc qu'aux posts qui ont
 * une image. Les REELS et VIDÉOS passaient à côté — et c'est précisément par là
 * qu'est partie en production la légende « Marie, gérante de sa boutique de
 * créateurs, passait ses soirées à poster sur TikTok », une cliente qui
 * n'existe pas.
 *
 * Il est volontairement déterministe (expressions régulières, zéro token) :
 * il tourne sur chaque publication, y compris quand le crédit d'IA est épuisé,
 * et il ne coûte rien. Il ne remplace pas le contrôle de cohérence, il couvre
 * le cas que celui-ci ne peut pas voir.
 *
 * Il ne cherche qu'UNE chose, celle qui engage la marque : un client
 * identifiable présenté comme réel. Les ordres de grandeur illustratifs
 * (« plus de visibilité, plus de clients ») restent autorisés — arbitrage du
 * fondateur : « ça doit juste pas être aberrant ».
 */

export interface ClaimVerdict {
  /** Faut-il retenir la publication ? */
  blocked: boolean;
  /** Ce qui a déclenché, en clair. */
  reason: string;
  /** L'extrait fautif, pour corriger sans relire tout le texte. */
  excerpt: string;
}

/** Prénoms courants employés comme faux témoignage client. */
const PRENOMS = 'Marie|Pierre|Julie|Sophie|Thomas|Camille|Lucas|Emma|Chloé|Nicolas|Sarah|Julien|Laura|Antoine|Céline|Karim|Fatima|Nadia|Paul|Léa';

const MOTIFS: Array<{ re: RegExp; quoi: string }> = [
  // « Marie, gérante de sa boutique, a doublé… » — un prénom suivi d'un métier
  // ou d'un résultat, c'est un témoignage présenté comme réel.
  {
    re: new RegExp(`\\b(${PRENOMS})\\b\\s*,?\\s+(?:gérant|gerant|proprietaire|propriétaire|fondat|patron|boulang|coiff|fleurist|restaurat|artisan|commerçant|commercant)[^.!?]{0,80}`, 'i'),
    quoi: 'client inventé : un prénom présenté comme un cas réel',
  },
  {
    re: new RegExp(`\\b(${PRENOMS})\\b[^.!?]{0,50}\\b(?:a|ont)\\s+(?:doublé|double|triplé|triple|multiplié|multiplie|gagné|gagne|économisé|economise|explosé|explose)\\b[^.!?]{0,60}`, 'i'),
    quoi: 'client inventé : un prénom associé à un résultat chiffré',
  },
  // « ce restaurant lyonnais », « cette fleuriste parisienne » : un commerce
  // localisé présenté comme un cas suivi.
  {
    re: /\b(?:ce|cette|un|une)\s+(?:restaurant|boulangerie|fleuriste|coiffeur|salon|boutique|librairie|caviste|institut|garage)\s+\w*\s*(?:lyonnais|parisien|marseillais|bordelais|toulousain|lillois|nantais|niçois|nicois|strasbourgeois)\w*[^.!?]{0,80}/i,
    quoi: 'cas client inventé : un commerce localisé donné comme référence',
  },
  // Une étude ou un sondage qu'on n'a jamais menés.
  {
    re: /\b(?:on a |nous avons )?(?:interrogé|interroge|sondé|sonde|analysé|analyse|demandé à)\s+\d{2,}\s+(?:commerçants|commercants|clients|entreprises|professionnels)/i,
    quoi: 'étude inventée : un sondage qu\'on n\'a jamais mené',
  },
  {
    re: /\b(?:testé|teste|approuvé|approuve|utilisé|utilise)\s+par\s+(?:des\s+)?(?:milliers|centaines|\d{2,})\s+(?:de\s+)?(?:commerçants|commercants|clients|entreprises)/i,
    quoi: 'preuve inventée : un nombre d\'utilisateurs invérifiable',
  },
  // Un ordre de grandeur qui ne passe pas le test du bon sens.
  {
    re: /\+\s?[3-9]\d{2,}\s?%|\bx\s?[1-9]\d\b|×\s?[1-9]\d\b/i,
    quoi: 'chiffre aberrant : hors de toute proportion pour un commerce',
  },
  {
    /**
     * ── « par semaine » n'était pas à sa place dans cette liste ──
     *
     * L'alternative disait (économisées | gagnées | PAR SEMAINE). « par
     * semaine » se retrouvait donc au même rang qu'un verbe d'économie, et
     * n'importe quelle durée hebdomadaire déclenchait le blocage.
     *
     * Constaté le 15 août : « Tu passes 10h par semaine à dessiner des plans de
     * jardin » — un post pour un paysagiste — refusé pour « gain de temps
     * aberrant ». Or ce n'est pas une promesse, c'est une observation sur le
     * métier du lecteur, et c'est exactement l'accroche qu'on veut : concrète,
     * chiffrée, vraie.
     *
     * Ce qui engage la marque, c'est le VERBE : « 10h économisées » promet
     * quelque chose, « 10h passées » décrit une situation. On exige donc le
     * verbe, et « par semaine » redevient ce qu'il est — une précision de
     * durée, pas une affirmation.
     */
    re: /\b([1-9]\d|[6-9])\s?h(?:eures)?\s+(?:économisées|economisees|gagnées|gagnees)/i,
    quoi: 'gain de temps aberrant',
  },
];

/**
 * Analyse une légende. Ne bloque que sur une affirmation qui engage la marque.
 */
export function detectInventedClaim(caption: string | null | undefined): ClaimVerdict {
  const texte = String(caption || '');
  if (texte.length < 12) return { blocked: false, reason: '', excerpt: '' };

  for (const m of MOTIFS) {
    const trouve = texte.match(m.re);
    if (trouve) {
      return {
        blocked: true,
        reason: m.quoi,
        excerpt: String(trouve[0]).slice(0, 140).replace(/\s+/g, ' ').trim(),
      };
    }
  }
  return { blocked: false, reason: '', excerpt: '' };
}
