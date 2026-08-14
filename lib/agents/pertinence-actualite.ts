/**
 * Quelle actualité concerne QUEL métier — et quelle audience.
 *
 * ── Pourquoi ce fichier existe ──
 *
 * Fondateur, 2026-08-13, après m'avoir vu couper l'actualité un peu partout :
 * « on ne doit pas arrêter de publier sur l'actualité en faisant un lien fort
 * visuel avec le business, c'est notre différenciant, notre valeur ajoutée.
 * Idem calendrier sportif et événementiel. Mais les cibles d'un fleuriste,
 * d'un coach sportif ou d'un restaurant ne sont pas les mêmes — un coiffeur
 * qui prend des actus people aura plus de pertinence que le foot, qui en aura
 * plus pour un bar. »
 *
 * Il a raison sur les deux points, et j'avais réglé le mauvais curseur. Le
 * problème n'a jamais été que l'actualité soit présente : c'est qu'on prenait
 * CELLE QUI PASSAIT, sans se demander si elle concernait ce commerce. Une
 * éclipse solaire sur un post marketing, un match de foot pour un fleuriste :
 * ce n'est pas de l'actualité en trop, c'est de l'actualité mal choisie.
 *
 * Couper l'accès était donc une réponse brutale à un vrai problème. On remet
 * l'accès, avec le tri qui manquait.
 *
 * ── Le principe ──
 *
 * Chaque métier a des univers d'actualité qui LUI parlent, parce qu'ils
 * touchent sa clientèle ou son activité. Un bar vit du sport parce que ses
 * clients viennent regarder les matchs. Un coiffeur vit du people parce que
 * ses clientes arrivent avec une photo. Un fleuriste vit du calendrier
 * affectif. Ce n'est pas une question de goût : c'est une question de qui
 * pousse la porte.
 */

/** Les univers d'actualité, tels qu'on peut les reconnaître dans un titre. */
export type Univers =
  | 'sport' | 'people' | 'culture' | 'gastronomie' | 'meteo'
  | 'local' | 'economie' | 'sante_bienetre' | 'mode' | 'famille' | 'tech';

/**
 * Ce qui fait entrer un client chez ce commerçant, exprimé en univers
 * d'actualité, du plus au moins pertinent.
 *
 * La liste n'a pas à être exhaustive : elle a à être JUSTE. Mieux vaut deux
 * univers vraiment liés que sept qui rendraient le filtre inopérant.
 */
const UNIVERS_PAR_METIER: Record<string, Univers[]> = {
  // Un bar se remplit les soirs de match, et sa terrasse dépend du temps.
  bar: ['sport', 'meteo', 'culture', 'local'],
  brasserie: ['sport', 'meteo', 'local', 'gastronomie'],

  // Le restaurant dépend d'abord de sa table et de la météo ; le sport ne
  // compte que s'il diffuse. On reste sur ce qui est vrai pour tous.
  restaurant: ['gastronomie', 'meteo', 'local', 'famille'],
  pizzeria: ['gastronomie', 'sport', 'famille', 'local'],
  fastfood: ['sport', 'culture', 'famille', 'local'],
  brunch: ['gastronomie', 'mode', 'meteo', 'famille'],
  boulangerie: ['gastronomie', 'famille', 'local', 'meteo'],
  patisserie: ['gastronomie', 'famille', 'culture'],
  traiteur: ['gastronomie', 'famille', 'local'],

  // Le coiffeur et l'esthétique vivent de l'image : people et mode d'abord.
  coiffeur: ['people', 'mode', 'culture', 'sante_bienetre'],
  barbier: ['people', 'sport', 'mode'],
  institut_beaute: ['people', 'mode', 'sante_bienetre'],
  onglerie: ['people', 'mode'],
  spa: ['sante_bienetre', 'meteo', 'people'],

  // Le fleuriste vit du calendrier affectif et des saisons.
  fleuriste: ['famille', 'meteo', 'culture', 'local'],

  // Le sport et la santé suivent les saisons et les grands rendez-vous.
  coach_sportif: ['sport', 'sante_bienetre', 'meteo'],
  salle_sport: ['sport', 'sante_bienetre', 'famille'],
  kine: ['sante_bienetre', 'sport'],

  // Les métiers du bâtiment suivent la météo, la maison et les aides.
  plombier: ['meteo', 'economie', 'local'],
  electricien: ['meteo', 'economie', 'tech', 'local'],
  menuisier: ['economie', 'local', 'meteo'],
  paysagiste: ['meteo', 'famille', 'local'],

  // Le commerce d'habillement suit la mode et la météo.
  boutique: ['mode', 'meteo', 'people', 'culture'],
  pretaporter: ['mode', 'people', 'meteo'],
  bijouterie: ['famille', 'mode', 'people'],

  // Les services professionnels suivent l'économie et leur secteur.
  avocat: ['economie', 'local'],
  comptable: ['economie'],
  immobilier: ['economie', 'local', 'famille'],
  garage: ['economie', 'tech', 'meteo'],
  auto_ecole: ['economie', 'famille', 'local'],
};

/** Les mots qui trahissent l'univers d'un titre d'actualité, en français. */
const INDICES: Record<Univers, RegExp> = {
  sport: /\b(match|foot|football|rugby|tennis|basket|cyclisme|tour de france|jo|jeux olympiques|championnat|ligue|coupe|finale|marathon|roland[- ]garros|psg|équipe de france)\b/i,
  // ── Le people se reconnaît aussi à la forme de la dépêche ──
  //
  // 2026-08-13 : « Travis Kelce rêvait de mariage avec Taylor Swift » est
  // ressorti sur un post de commerçant. Le titre ne contenait aucun mot-métier
  // — ni « star », ni « chanteuse » — mais il contenait « mariage », classé
  // dans la famille, univers universel. Une actualité de couple de célébrités
  // passait donc pour un sujet de calendrier familial.
  //
  // On reconnaît donc aussi les tournures : se marie, fiançailles, divorce,
  // couple, attend un bébé. Et « mariage » seul quitte la famille — un
  // fleuriste s'intéresse à la SAISON des mariages, pas au mariage de
  // quelqu'un en particulier.
  people: /\b(star|célébrité|celebrite|acteur|actrice|chanteu|rappeu|influenceu|téléréalité|telerealite|festival de cannes|oscar|césar|people|se marie|se marient|fiançailles|fiancailles|divorce|en couple|attend un bébé|attend un bebe)\b/i,
  culture: /\b(film|cinéma|cinema|série|serie|album|concert|festival|expo|exposition|livre|roman|théâtre|theatre|sortie|netflix)\b/i,
  gastronomie: /\b(restaurant|chef|cuisine|recette|gastronomi|michelin|produit de saison|produits de saison|fruits de saison|légumes de saison|marché|marche|récolte|recolte|vin|fromage)\b/i,
  meteo: /\b(canicule|chaleur|froid|neige|pluie|orage|tempête|tempete|vague de|météo|meteo|degré|degre|beau temps|ensoleill)\b/i,
  local: /\b(ville|quartier|commune|mairie|travaux|circulation|grève|greve|transport|marché de|braderie|brocante)\b/i,
  economie: /\b(inflation|prix|pouvoir d'achat|taxe|impôt|impot|aide|subvention|crédit|credit|taux|salaire|smic|réforme|reforme)\b/i,
  sante_bienetre: /\b(santé|sante|bien[- ]être|bien[- ]etre|sommeil|stress|alimentation|sport santé|prévention|prevention|allergie)\b/i,
  mode: /\b(mode|tendance|collection|défilé|defile|fashion|style|vêtement|vetement|coiffure|beauté|beaute)\b/i,
  famille: /\b(rentrée|rentree|vacances|enfant|famille|école|ecole|fête des|fete des|noël|noel|anniversaire|saison des mariages|saint[- ]valentin)\b/i,
  tech: /\b(intelligence artificielle|\bia\b|application|réseaux sociaux|reseaux sociaux|tiktok|instagram|algorithme|smartphone|numérique|numerique)\b/i,
};

/**
 * Les univers qui concernent TOUS les commerces, quel que soit le métier.
 *
 * Fondateur, 2026-08-13 : « les actualités générales, politique ou sport,
 * parfois s'appliquent à tous — faut juste bien savoir l'appliquer et que ce
 * soit pertinent. »
 *
 * Mon premier tri était trop rigide : il n'autorisait que les univers propres
 * au métier. Or une canicule change la journée d'un fleuriste comme d'un
 * plombier ; une grève de transports vide un centre-ville pour tout le monde ;
 * une hausse de charges touche chaque commerçant. Les écarter, c'était priver
 * les clients des actualités qui les concernent le plus directement.
 *
 * Ces univers-là passent toujours. Ce qui change, c'est ce qu'on en fait :
 * l'angle doit dire ce que ça change POUR CE COMMERCE, pas commenter
 * l'événement.
 */
const UNIVERS_UNIVERSELS: Univers[] = ['meteo', 'local', 'economie', 'famille'];

/** Les univers pertinents pour ce métier, avec un repli raisonnable. */
export function universPour(metier?: string | null): Univers[] {
  const cle = String(metier || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!cle) return ['local', 'meteo', 'famille', 'economie'];
  if (UNIVERS_PAR_METIER[cle]) return UNIVERS_PAR_METIER[cle];

  // ── Le sous-type l'emporte sur le type ──
  //
  // Fondateur, 2026-08-13 : « la finesse par sous-type — fast-food ≠ brunch —
  // doit remonter du dossier client. »
  //
  // L'appelant nous passe donc une SIGNATURE : le type déclaré, la description
  // de l'entreprise et ses produits, concaténés. « restaurant — brunch et
  // pâtisseries maison » contient « restaurant » ET « brunch » ; prendre le
  // premier trouvé donnerait le générique et perdrait la finesse.
  //
  // On garde donc la clé la PLUS LONGUE qui apparaît : « brunch » (6) ne bat
  // pas « restaurant » (10) sur la longueur, mais elle est plus spécifique —
  // on classe donc par spécificité déclarée, les sous-types en premier.
  const SOUS_TYPES = ['brunch', 'fastfood', 'fast_food', 'pizzeria', 'brasserie', 'barbier',
    'onglerie', 'patisserie', 'traiteur', 'salle_sport', 'coach_sportif', 'pretaporter',
    'institut_beaute', 'auto_ecole'];
  for (const st of SOUS_TYPES) {
    if (cle.includes(st)) {
      const v = UNIVERS_PAR_METIER[st] || UNIVERS_PAR_METIER[st.replace('_', '')];
      if (v) return v;
    }
  }

  // Puis le type générique, par correspondance partielle.
  for (const [k, v] of Object.entries(UNIVERS_PAR_METIER)) {
    if (cle.includes(k) || k.includes(cle)) return v;
  }

  // Métier inconnu : ce qui touche presque tous les commerces de proximité.
  return ['local', 'meteo', 'famille', 'economie'];
}

/** L'univers d'un titre, ou null si on ne le reconnaît pas. */
export function universDuTitre(titre: string): Univers | null {
  for (const [u, rx] of Object.entries(INDICES) as Array<[Univers, RegExp]>) {
    if (rx.test(titre)) return u;
  }
  return null;
}

/**
 * Ne garde que les actualités qui concernent CE métier, dans l'ordre de
 * pertinence de ses univers.
 *
 * Une actualité dont on ne reconnaît pas l'univers est ÉCARTÉE. C'est un choix :
 * dans le doute, le modèle fabriquera un lien, et c'est exactement ce qu'on
 * cherche à éviter. Mieux vaut trois actualités qui parlent au commerçant que
 * douze où il doit piocher.
 */
export function filtrerActualites(
  items: string[],
  metier?: string | null,
  max = 6,
): string[] {
  const propres = universPour(metier);
  // Les univers du métier d'abord, puis ceux qui concernent tout le monde. Une
  // canicule intéresse un fleuriste, mais moins que la fête des mères : l'ordre
  // dit la priorité, pas l'exclusion.
  const rang = new Map<Univers, number>();
  propres.forEach((u, i) => rang.set(u, i));
  UNIVERS_UNIVERSELS.forEach((u, i) => { if (!rang.has(u)) rang.set(u, propres.length + i); });

  return (items || [])
    .map(t => ({ t, u: universDuTitre(t) }))
    .filter(x => x.u !== null && rang.has(x.u))
    .sort((a, b) => (rang.get(a.u!) ?? 99) - (rang.get(b.u!) ?? 99))
    .slice(0, max)
    .map(x => x.t);
}

/**
 * Le bloc qui explique au modèle POURQUOI ces actualités-là lui sont données.
 *
 * Sans cette phrase, il reçoit une liste filtrée sans savoir qu'elle l'est, et
 * peut encore chercher ailleurs. En la lui disant, on lui donne le critère
 * plutôt que la conclusion.
 */
export function blocPertinence(metier?: string | null): string {
  const u = universPour(metier);
  const noms: Record<Univers, string> = {
    sport: 'le sport', people: "l'actualité des personnalités", culture: 'la culture et les sorties',
    gastronomie: 'la gastronomie et les produits', meteo: 'la météo et les saisons',
    local: 'la vie locale', economie: "l'économie et le pouvoir d'achat",
    sante_bienetre: 'la santé et le bien-être', mode: 'la mode', famille: 'la famille et le calendrier',
    tech: 'le numérique',
  };
  return [
    '',
    `POURQUOI CES ACTUALITÉS-LÀ : elles ont été retenues parce qu'elles touchent`,
    `la clientèle de ce métier — ${u.map(x => noms[x]).join(', ')}.`,
    `Ce sont les sujets qui font pousser sa porte. Une actualité d'un autre`,
    `univers ne l'intéresse pas, même si elle fait beaucoup de bruit ailleurs.`,
    '',
    `S'y ajoutent les sujets qui concernent TOUS les commerces — la météo, la vie`,
    `locale, le pouvoir d'achat, le calendrier familial. Une canicule change la`,
    `journée d'un fleuriste comme d'un plombier ; une grève de transports vide un`,
    `centre-ville pour tout le monde.`,
    `Sur ceux-là, l'angle ne COMMENTE PAS l'événement : il dit ce que ça change`,
    `pour CE commerce, cette semaine, concrètement. « Il va faire 38 °C » n'est pas`,
    `un post ; « la vitrine reste fraîche jusqu'à 16 h, passez avant » en est un.`,
    '',
  ].join('\n');
}

/**
 * Une actualité assez FORTE pour passer avant le tour de rotation.
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-14 : « je veux que l'agent contenu vérifie quotidiennement
 * les actualités, et s'il estime qu'une actualité est super importante pour
 * surfer dessus, il l'utilise et ça passe avant, même si on dépasse les 2 fois
 * sur 7. »
 *
 * La rotation protège d'un excès — deux jours d'actualité sur sept, pour ne pas
 * transformer le compte en revue de presse. Mais une canicule annoncée ou une
 * grève de transports ne demande pas la permission au calendrier : elle change
 * la journée du commerçant AUJOURD'HUI, et un post publié trois jours plus tard
 * ne vaut plus rien.
 *
 * Une règle de cadence ne doit jamais empêcher de saisir ce qui compte. Elle
 * règle l'ordinaire ; l'exceptionnel la dépasse, sinon ce n'est pas une
 * stratégie, c'est un tourniquet.
 *
 * ── Pourquoi cette liste-là, et pas un jugement de modèle ──
 *
 * On pourrait demander à un modèle « cette actualité est-elle importante ? ».
 * Il répondrait oui trop souvent — c'est exactement le travers qu'on corrige
 * depuis trois jours. Les événements retenus ici ont un point commun
 * vérifiable : ils modifient physiquement la journée d'un commerce, ils sont
 * datés, et personne ne les discute. Une liste courte et sûre vaut mieux qu'un
 * arbitrage flou.
 */
const IMPACT_FORT: Array<{ motif: RegExp; pourquoi: string }> = [
  { motif: /\b(canicule|alerte rouge|vague de chaleur|38|39|40)\s*(°|degr)/i, pourquoi: 'la chaleur change ce qu\'on achète et à quelle heure on sort' },
  { motif: /\b(canicule|vague de chaleur)\b/i, pourquoi: 'la chaleur change ce qu\'on achète et à quelle heure on sort' },
  { motif: /\b(gr[èe]ve|blocage|manifestation)\b.*\b(transport|train|m[ée]tro|bus|routier)\b/i, pourquoi: 'l\'affluence du centre-ville s\'effondre ou se déplace' },
  { motif: /\b(tempête|inondation|neige|verglas|alerte météo)\b/i, pourquoi: 'les déplacements et les livraisons sont touchés' },
  { motif: /\b(jour f[ée]ri[ée]|pont du|fermeture exceptionnelle)\b/i, pourquoi: 'les horaires et l\'affluence changent ce jour-là' },
  { motif: /\b(rentr[ée]e scolaire|premier jour d'[ée]cole)\b/i, pourquoi: 'un pic de demande daté, sur presque tous les commerces' },
];

/**
 * Renvoie la première actualité à impact fort pour ce métier, ou null.
 *
 * On ne cherche que dans les actualités DÉJÀ triées pour le métier : une grève
 * de transports concerne un commerce de centre-ville, pas un artisan qui se
 * déplace. Le tri par métier reste le premier filtre.
 */
export function actualiteExceptionnelle(
  itemsDejaTries: string[],
  metier?: string | null,
): { titre: string; pourquoi: string } | null {
  for (const t of itemsDejaTries || []) {
    for (const { motif, pourquoi } of IMPACT_FORT) {
      if (motif.test(t)) return { titre: t, pourquoi };
    }
  }
  return null;
}

/** Ce qu'on dit au générateur quand une actualité passe avant son tour. */
export function blocActualitePrioritaire(a: { titre: string; pourquoi: string }): string {
  return [
    '',
    '━━━ CETTE ACTUALITÉ PASSE AVANT LE RESTE ━━━',
    `« ${a.titre} »`,
    `Pourquoi elle prime : ${a.pourquoi}.`,
    '',
    'Elle change la journée de ce commerce MAINTENANT, et un post publié dans',
    'trois jours ne vaudra plus rien. Le post porte donc dessus — sur ce que ça',
    "change pour lui cette semaine, et sur ce que ses clients doivent savoir ou",
    'faire. Pas un commentaire de l\'événement : ce qu\'il en découle chez lui.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ].join('\n');
}
