/**
 * Le calendrier sportif, comme matière première du calendrier marketing.
 *
 * Demande du fondateur (2026-08-07) : « injecte un calendrier des matchs de
 * foot des différentes ligues françaises, espagnoles, allemandes, italiennes,
 * USA, et de basket USA aussi — ça étoffe le calendrier marketing en plus des
 * actualités. »
 *
 * ── Pourquoi c'est utile à un commerce ──
 *
 * Le sport est un des rares rendez-vous qui remplit une salle à heure fixe et
 * qu'on peut préparer des semaines à l'avance. Un bar, un restaurant, un
 * traiteur savent quoi proposer un soir de Ligue des Champions ; encore
 * faut-il que quelqu'un le leur rappelle au bon moment. C'est exactement ce
 * qu'un calendrier apporte qu'une actualité ne donne pas : de l'anticipation.
 *
 * ── Ce que ce fichier NE fait PAS ──
 *
 * Il ne contient aucune affiche, aucun horaire de match, aucun résultat. Ces
 * données changent en permanence et les inventer serait la pire faute qu'on
 * puisse commettre — un commerce qui annonce le mauvais match perd sa
 * crédibilité en une publication.
 *
 * Il porte les REPÈRES DE SAISON, qui sont stables et publiés des mois à
 * l'avance : reprises, trêves, phases finales. Chaque entrée porte son degré
 * de certitude, et l'agent n'a le droit d'affirmer que ce qui est vérifié.
 */

export type Certitude = 'verifie' | 'a_confirmer';

export interface RepereSportif {
  /** Identifiant stable, pour ne pas dépendre du libellé. */
  cle: string;
  competition: string;
  /** Ce qui se passe, dans les mots d'un commerçant. */
  evenement: string;
  /** Date ISO, ou début de fenêtre quand l'événement s'étale. */
  date: string;
  /** Fin de fenêtre, si l'événement dure. */
  dateFin?: string;
  certitude: Certitude;
  /** D'où vient l'information — pour qu'on puisse la revérifier. */
  source?: string;
  /** Les métiers pour qui ça compte vraiment. */
  metiers: string[];
}

/**
 * Repères de la saison 2026-2027.
 *
 * Les dates marquées `verifie` ont été confirmées le 7 août 2026 auprès de
 * sources publiques (LFP, Sky Sports, Wikipédia). Celles marquées
 * `a_confirmer` sont des fenêtres habituelles, PAS des dates officielles :
 * l'agent doit alors parler de période, jamais de jour précis.
 */
export const REPERES: RepereSportif[] = [
  {
    cle: 'l1_reprise_2627', competition: 'Ligue 1',
    evenement: 'Reprise du championnat — première journée',
    date: '2026-08-21', dateFin: '2026-08-23',
    certitude: 'verifie', source: 'LFP, calendrier officiel 2026-27',
    metiers: ['restaurant', 'bar', 'cafe', 'hotel', 'boulangerie'],
  },
  {
    cle: 'trophee_champions_2627', competition: 'Trophée des Champions',
    evenement: 'Ouverture de la saison française',
    date: '2026-08-15',
    certitude: 'verifie', source: 'LFP',
    metiers: ['restaurant', 'bar', 'cafe'],
  },
  {
    cle: 'pl_reprise_2627', competition: 'Premier League',
    evenement: 'Reprise du championnat anglais',
    date: '2026-08-21', dateFin: '2026-08-22',
    certitude: 'verifie', source: 'Sky Sports',
    metiers: ['bar', 'restaurant', 'cafe'],
  },
  {
    cle: 'bundesliga_reprise_2627', competition: 'Bundesliga',
    evenement: 'Reprise du championnat allemand',
    date: '2026-08-28',
    certitude: 'verifie', source: 'Wikipédia — 2026-27 Bundesliga',
    metiers: ['bar', 'restaurant'],
  },
  {
    cle: 'l1_treve_2627', competition: 'Ligue 1',
    evenement: 'Trêve hivernale — les soirs de match s\'arrêtent',
    date: '2026-12-21', dateFin: '2026-12-31',
    certitude: 'verifie', source: 'LFP',
    metiers: ['restaurant', 'bar', 'cafe'],
  },
  {
    cle: 'l1_reprise_janvier_2627', competition: 'Ligue 1',
    evenement: 'Reprise après la trêve',
    date: '2027-01-03',
    certitude: 'verifie', source: 'LFP',
    metiers: ['restaurant', 'bar', 'cafe'],
  },
  {
    cle: 'l1_fin_2627', competition: 'Ligue 1',
    evenement: 'Dernière journée de la saison',
    date: '2027-05-29',
    certitude: 'verifie', source: 'LFP',
    metiers: ['restaurant', 'bar', 'cafe'],
  },
  // ── Non vérifiées : fenêtres habituelles, à confirmer avant toute annonce ──
  {
    cle: 'laliga_reprise_2627', competition: 'LaLiga',
    evenement: 'Reprise du championnat espagnol',
    date: '2026-08-15', dateFin: '2026-08-31',
    certitude: 'a_confirmer',
    metiers: ['bar', 'restaurant'],
  },
  {
    cle: 'seriea_reprise_2627', competition: 'Serie A',
    evenement: 'Reprise du championnat italien',
    date: '2026-08-15', dateFin: '2026-08-31',
    certitude: 'a_confirmer',
    metiers: ['bar', 'restaurant'],
  },
  {
    cle: 'ldc_phase_ligue_2627', competition: 'Ligue des Champions',
    evenement: 'Retour des soirées européennes',
    date: '2026-09-15', dateFin: '2026-09-30',
    certitude: 'a_confirmer',
    metiers: ['bar', 'restaurant', 'cafe', 'hotel'],
  },
  {
    cle: 'nba_reprise_2627', competition: 'NBA',
    evenement: 'Reprise de la saison régulière',
    date: '2026-10-15', dateFin: '2026-10-31',
    certitude: 'a_confirmer',
    metiers: ['bar', 'restaurant'],
  },
  {
    cle: 'mls_playoffs_2626', competition: 'MLS',
    evenement: 'Phase finale du championnat américain',
    date: '2026-10-20', dateFin: '2026-12-06',
    certitude: 'a_confirmer',
    metiers: ['bar'],
  },
];

/** Les repères qui tombent dans la fenêtre utile pour préparer un contenu. */
export function reperesAVenir(
  aPartirDe: Date = new Date(),
  jours = 30,
  businessType?: string | null,
): RepereSportif[] {
  const debut = aPartirDe.getTime();
  const fin = debut + jours * 86400000;

  return REPERES.filter(r => {
    const d = new Date(r.dateFin || r.date).getTime();
    const dDebut = new Date(r.date).getTime();
    // On garde ce qui commence dans la fenêtre, ou qui est déjà en cours.
    if (dDebut > fin || d < debut) return false;
    if (!businessType) return true;
    const t = String(businessType).toLowerCase();
    return r.metiers.some(m => t.includes(m) || m === 'restaurant' && /resto|brasserie|pizz/.test(t));
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Le bloc injecté dans le prompt de génération.
 *
 * La distinction vérifié / à confirmer n'est pas cosmétique : elle décide de
 * ce que l'agent a le droit d'écrire. Sur une date confirmée il peut annoncer
 * le jour ; sinon il parle de période, et jamais d'affiche ni d'horaire —
 * qu'il ne connaît dans aucun des deux cas.
 */
export function blocCalendrierSportif(businessType?: string | null, jours = 30): string {
  const reperes = reperesAVenir(new Date(), jours, businessType);
  if (!reperes.length) return '';

  const lignes = reperes.map(r => {
    const quand = r.certitude === 'verifie'
      ? (r.dateFin ? `du ${r.date} au ${r.dateFin}` : `le ${r.date}`)
      : `autour de ${r.date.slice(0, 7)} (date NON confirmée)`;
    return `- ${r.competition} — ${r.evenement}, ${quand}`;
  });

  return `\n=== RENDEZ-VOUS SPORTIFS À VENIR ===
Le sport remplit une salle à heure fixe et se prépare des semaines à l'avance.
Ces repères sont une matière pour anticiper, pas une obligation d'en parler.

${lignes.join('\n')}

RÈGLES ABSOLUES :
- Tu ne cites JAMAIS une affiche, un horaire précis ou un résultat : tu ne les
  connais pas, et un commerce qui annonce le mauvais match perd sa crédibilité
  en une publication.
- Une date marquée NON confirmée ne s'écrit pas au jour près : tu parles de
  période (« fin août », « à la rentrée »).
- Tu parles de ce que LE COMMERCE propose ce soir-là — l'ambiance, la formule,
  la table qu'on garde — pas du sport lui-même. C'est son offre qui intéresse
  son audience, pas ton commentaire sportif.
`;
}
