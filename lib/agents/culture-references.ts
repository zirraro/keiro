/**
 * Références culturelles — répliques de films, séries et publicités cultes,
 * utilisables comme angle de contenu.
 *
 * Demande du fondateur (2026-08-04) : « on peut ajouter dans la stratégie,
 * selon le business et la cible, des citations de film — ça peut faire rire ou
 * s'approprier un business avec un lien fort, attirer l'attention, peut-être
 * même créer un trend. À ajuster par business et âge de la cible pour que
 * l'analogie soit bien perçue et comprise. »
 *
 * ── Pourquoi une liste plutôt qu'une consigne libre ──
 *
 * Laisser le modèle « citer un film » produirait des répliques approximatives
 * ou inventées — c'est exactement le travers qu'on a passé la semaine à
 * corriger sur les témoignages clients et les détails de DM. Une réplique mal
 * citée est pire que pas de référence : le public la connaît par cœur, et
 * l'erreur saute aux yeux de ceux-là mêmes qu'on voulait séduire.
 *
 * Les répliques ci-dessous sont donc vérifiées, courtes (citation courte, usage
 * licite), et chacune porte l'idée qu'elle sert. Le modèle choisit, il n'invente
 * pas.
 *
 * ── Pourquoi l'âge compte ──
 *
 * Une référence que la cible ne reconnaît pas ne fait pas sourire : elle
 * intrigue au mieux, elle exclut au pire. « Le Père Noël est une ordure » parle
 * à un public de 40 ans et plus ; une réplique de Kaamelott à 25-45 ans ; un
 * mème récent à moins de 30. On indexe donc par tranche d'âge, et on ne propose
 * que ce que la cible peut reconnaître.
 */

export interface ReferenceCulturelle {
  /** La réplique, exacte et courte. */
  replique: string;
  /** D'où elle vient — à mentionner si le contexte l'exige. */
  source: string;
  /** Tranches d'âge qui la reconnaissent spontanément. */
  ages: Array<'18-30' | '25-45' | '35-60' | '50+'>;
  /** Ce que la réplique permet de dire — l'angle, pas le thème. */
  usage: string;
  /** Métiers où l'analogie tombe juste. Vide = tous. */
  metiers?: string[];
  /**
   * Réseaux où la référence passe bien.
   *
   * La même réplique ne porte pas pareil partout : TikTok vit de la culture
   * mème et pardonne l'irrévérence, Instagram est plus lifestyle, LinkedIn
   * attend de la retenue. « Le Père Noël est une ordure » fait mouche sur
   * TikTok et détonne sur LinkedIn, où l'humour doit rester présentable devant
   * un client ou un recruteur.
   */
  reseaux: Array<'instagram' | 'tiktok' | 'linkedin'>;
}

export const REFERENCES: ReferenceCulturelle[] = [
  // ── Comédie française, très large reconnaissance ──
  {
    replique: "C'est cela, oui.",
    source: 'Le Père Noël est une ordure',
    ages: ['35-60', '50+'],
    usage: "répondre avec ironie à une objection courante ou à une promesse trop belle",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Il est où le patron ? Il est où ?!",
    source: 'La Cité de la peur',
    ages: ['25-45', '35-60'],
    usage: "assumer l'absence du gérant, ou l'inverse : montrer qu'on est toujours là",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "C'est pas faux.",
    source: 'Kaamelott',
    ages: ['18-30', '25-45', '35-60'],
    usage: "concéder un point au client avec humour avant de le retourner",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "On en a gros.",
    source: 'Kaamelott',
    ages: ['18-30', '25-45'],
    usage: "exprimer la fatigue d'une galère de métier que la cible partage",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Vous êtes bien urgents, vous.",
    source: 'Kaamelott',
    ages: ['25-45', '35-60'],
    usage: "parler des commandes de dernière minute avec le sourire",
    reseaux: ['instagram', 'tiktok'],
    metiers: ['restaurant', 'traiteur', 'fleuriste', 'boulangerie', 'artisan'],
  },
  {
    replique: "Je suis ton père.",
    source: 'Star Wars',
    ages: ['18-30', '25-45', '35-60', '50+'],
    usage: "révéler l'origine d'un produit, d'une recette ou d'un savoir-faire transmis",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Un grand pouvoir implique de grandes responsabilités.",
    source: 'Spider-Man',
    ages: ['18-30', '25-45'],
    usage: "assumer une exigence de qualité ou un engagement (origine, fraîcheur, garantie)",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Ce qui est fait est fait.",
    source: 'Le Roi Lion',
    ages: ['18-30', '25-45', '35-60'],
    usage: "dédramatiser un raté, une erreur de commande, un imprévu",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Hakuna Matata.",
    source: 'Le Roi Lion',
    ages: ['18-30', '25-45', '35-60'],
    usage: "vendre la tranquillité d'esprit — service qui gère tout à la place du client",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Y'a pas de problème, y'a que des solutions.",
    source: 'expression popularisée au cinéma',
    ages: ['25-45', '35-60', '50+'],
    usage: "montrer qu'on trouve toujours une réponse à une demande inhabituelle",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Sans la sauce, c'est rien.",
    source: 'La Vérité si je mens',
    ages: ['25-45', '35-60'],
    usage: "mettre en avant le détail qui change tout dans un produit",
    reseaux: ['instagram', 'tiktok'],
    metiers: ['restaurant', 'boulangerie', 'traiteur', 'boucherie', 'epicerie'],
  },
  {
    replique: "Alors, heureux ?",
    source: 'Le Grand Bleu',
    ages: ['35-60', '50+'],
    usage: "clore une transformation, un avant/après, une commande livrée",
    reseaux: ['instagram', 'linkedin'],
  },
  {
    replique: "Faites ce que vous voulez, mais faites-le bien.",
    source: "esprit de l'artisanat, formule de cinéma",
    ages: ['25-45', '35-60', '50+'],
    usage: "revendiquer l'exigence du métier",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
    metiers: ['artisan', 'menuisier', 'plombier', 'garage', 'coiffeur', 'institut_beaute'],
  },
];

/** Âge dominant supposé de la clientèle, par type de commerce. */
const AGE_PAR_METIER: Record<string, ReferenceCulturelle['ages'][number]> = {
  restaurant: '25-45',
  boulangerie: '35-60',
  boucherie: '35-60',
  epicerie: '35-60',
  fleuriste: '35-60',
  coiffeur: '25-45',
  institut_beaute: '25-45',
  hotel: '35-60',
  coach: '18-30',
  freelance: '25-45',
  artisan: '35-60',
  plombier: '35-60',
  menuisier: '35-60',
  garage: '35-60',
  immobilier: '35-60',
  pme: '35-60',
  b2b: '35-60',
};

/**
 * Sélectionne les références utilisables pour un commerce donné.
 *
 * On filtre sur l'âge présumé de sa clientèle et sur le métier. Le modèle
 * choisira parmi celles-ci — ou n'en utilisera aucune, ce qui reste le cas le
 * plus fréquent : une référence forcée vaut moins qu'un bon post sans.
 */
export function referencesPour(opts: {
  businessType?: string | null;
  /** Si le client a précisé sa cible, elle prime sur la présomption métier. */
  ageCible?: ReferenceCulturelle['ages'][number] | null;
  /** Réseau visé : une réplique qui marche sur TikTok peut détonner sur LinkedIn. */
  reseau?: 'instagram' | 'tiktok' | 'linkedin' | null;
}): ReferenceCulturelle[] {
  const metier = String(opts.businessType || '').toLowerCase().trim();
  const age = opts.ageCible
    || Object.entries(AGE_PAR_METIER).find(([k]) => metier.includes(k))?.[1]
    || '25-45';

  return REFERENCES.filter(r => {
    if (!r.ages.includes(age)) return false;
    if (opts.reseau && !r.reseaux.includes(opts.reseau)) return false;
    if (r.metiers && r.metiers.length > 0) {
      return r.metiers.some(m => metier.includes(m));
    }
    return true;
  });
}

/**
 * Bloc à injecter dans le prompt de contenu.
 *
 * Volontairement présenté comme une OPTION parmi d'autres angles, avec un
 * plafond : une référence culturelle dans chaque post deviendrait un tic, et
 * l'effet de surprise — qui fait tout son intérêt — disparaîtrait.
 */
/**
 * Bloc à injecter dans le prompt de contenu.
 *
 * Volontairement présenté comme une OPTION parmi d'autres angles, avec un
 * plafond : une référence dans chaque post deviendrait un tic, et l'effet de
 * surprise — qui fait tout son intérêt — disparaîtrait.
 */
export function blocReferences(opts: {
  businessType?: string | null;
  ageCible?: ReferenceCulturelle['ages'][number] | null;
  /**
   * Réseau visé. Quand il n'est PAS précisé — cas du plan hebdomadaire, qui
   * couvre les trois réseaux d'un coup — on liste les répliques groupées par
   * réseau, pour que le modèle choisisse la bonne selon le post qu'il écrit.
   */
  reseau?: 'instagram' | 'tiktok' | 'linkedin' | null;
}): string {
  const TOUS = ['instagram', 'tiktok', 'linkedin'] as const;
  const cibles = opts.reseau ? [opts.reseau] : TOUS;

  // Le même clin d'œil ne se joue pas de la même façon selon l'endroit.
  const TON: Record<string, string> = {
    tiktok: "c'est là que la référence porte le plus : le public la reconnaît vite et la commente. Elle peut porter le hook des 3 premières secondes.",
    instagram: "elle fonctionne surtout en légende, en complicité avec l'image. Elle ne remplace pas le visuel.",
    linkedin: "elle doit rester présentable devant un client ou un recruteur. Le clin d'œil est bienvenu, la vanne potache non : elle humanise un propos professionnel, elle ne fait pas le pitre.",
  };

  const sections: string[] = [];
  for (const r of cibles) {
    const dispo = referencesPour({ businessType: opts.businessType, ageCible: opts.ageCible, reseau: r });
    if (dispo.length === 0) continue;
    sections.push('  ' + r.toUpperCase() + ' — ' + TON[r]);
    for (const x of dispo) sections.push('    • « ' + x.replique + ' » (' + x.source + ') → ' + x.usage);
    sections.push('');
  }
  if (sections.length === 0) return '';

  return [
    '',
    'RÉFÉRENCES CULTURELLES — un angle possible, à doser',
    "Une réplique culte bien placée fait sourire, crée une complicité immédiate et se partage. C'est l'un des rares angles qui peut transformer un post de commerce en contenu qu'on envoie à un ami.",
    "La liste ci-dessous est déjà filtrée selon l'âge présumé de cette clientèle et son métier.",
    '',
    ...sections,
    'RÈGLES :',
    "- MAXIMUM 1 post sur 8 avec une référence. Au-delà ça devient un tic, et la surprise — qui fait tout l'intérêt — s'épuise.",
    "- Cite la réplique EXACTEMENT telle qu'écrite. Une réplique déformée saute aux yeux de ceux qui la connaissent, c'est-à-dire précisément le public qu'on visait.",
    "- N'invente JAMAIS une réplique ou un film absent de cette liste.",
    "- Respecte le réseau : une réplique listée sous TIKTOK ne va pas sur LinkedIn.",
    "- Le lien avec le commerce doit être ÉVIDENT en une seconde. Si tu dois expliquer l'analogie, elle ne marche pas : passe à autre chose.",
    "- La réplique sert le message, jamais l'inverse. Si le post fonctionne sans, n'en mets pas.",
  ].join('\n');
}
