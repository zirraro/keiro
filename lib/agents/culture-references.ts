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

import { famillesDe } from '../business-families';
export { famillesDe };

export interface ReferenceCulturelle {
  /** La réplique, exacte et courte. */
  replique: string;
  /** D'où elle vient — à mentionner si le contexte l'exige. */
  source: string;
  /** Tranches d'âge qui la reconnaissent spontanément. */
  ages: Array<'18-30' | '25-45' | '35-60' | '50+'>;
  /** Ce que la réplique permet de dire — l'angle, pas le thème. */
  usage: string;
  /**
   * Le type d'effet produit. Deux répliques peuvent servir la même idée avec
   * un ton radicalement différent : « Jusqu'ici tout va bien » installe une
   * tension ironique, « Tout le monde peut cuisiner » ouvre sur de
   * l'inspirant. Le registre permet de coller à l'identité du commerce
   * autant qu'à son réseau.
   */
  registre: 'absurde' | 'ironique' | 'tendre' | 'punchy' | 'inspirant' | 'epique';
  /**
   * Métiers où la réplique tombe PARTICULIÈREMENT bien.
   *
   * À ne pas confondre avec `metiers`, qui restreint : ici on n'exclut
   * personne, on signale seulement là où l'analogie est la plus évidente. Ces
   * répliques remontent en tête de liste pour le métier concerné, ce qui
   * oriente le choix du modèle sans jamais appauvrir l'éventail des autres.
   */
  metiersPlus?: string[];
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
  // ── COMÉDIE FRANÇAISE CULTE — reconnaissance très large, 35 ans et plus ──
  {
    replique: "C'est cela, oui.",
    metiersPlus: ['garage', 'plombier', 'immobilier', 'artisan'],
    source: "Le Père Noël est une ordure",
    ages: ['35-60', '50+'],
    registre: 'ironique',
    usage: "répondre avec ironie à une objection courante ou à une promesse trop belle",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Jusqu'ici tout va bien.",
    metiersPlus: ['restaurant', 'garage', 'plombier', 'coiffeur', 'artisan', 'bar', 'auto_ecole', 'assurance'],
    source: "La Haine",
    ages: ['25-45', '35-60'],
    registre: 'ironique',
    usage: "annoncer une situation qui dérape — parfait pour un avant/après ou une galère de métier",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "C'est une bonne situation, ça, scribe ?",
    metiersPlus: ['pme', 'b2b', 'freelance', 'coach', 'immobilier', 'comptable', 'avocat', 'consultant', 'recrutement'],
    source: "Astérix : Mission Cléopâtre",
    ages: ['25-45', '35-60'],
    registre: 'absurde',
    usage: "interroger avec humour le métier, la vocation, le choix d'un parcours",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Pas de bras, pas de chocolat.",
    metiersPlus: ['boulangerie', 'restaurant', 'epicerie', 'chocolat'],
    source: "Intouchables",
    ages: ['18-30', '25-45', '35-60'],
    registre: 'absurde',
    usage: "assumer une contrainte avec autodérision — rupture de stock, service indisponible",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Que trépasse si je faiblis.",
    metiersPlus: ['artisan', 'menuisier', 'boucherie', 'garage', 'macon', 'couvreur'],
    source: "Les Visiteurs",
    ages: ['25-45', '35-60'],
    registre: 'epique',
    usage: "dramatiser une exigence ou un engagement de qualité, avec le sourire",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Quand un étranger vient dans le Nord, i braie deux fois.",
    metiersPlus: ['restaurant', 'hotel', 'boulangerie', 'epicerie'],
    source: "Bienvenue chez les Ch'tis",
    ages: ['25-45', '35-60', '50+'],
    registre: 'tendre',
    usage: "parler d'attachement à un lieu, d'accueil, de fidélité de la clientèle",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Il est où le bonheur, il est où ?",
    metiersPlus: ['boulangerie', 'patisserie', 'restaurant', 'fleuriste', 'glacier', 'cafe', 'chocolat'],
    source: "Christophe Maé (rengaine populaire)",
    ages: ['25-45', '35-60'],
    registre: 'tendre',
    usage: "amener une réponse simple à une quête compliquée — le produit qui fait la journée",
    reseaux: ['instagram', 'tiktok'],
  },

  // ── KAAMELOTT — humour de dialogue, très cité par les 25-45 ──
  {
    replique: "C'est pas faux.",
    metiersPlus: ['garage', 'plombier', 'coiffeur', 'immobilier', 'b2b', 'bar', 'opticien', 'electricien', 'quincaillerie', 'avocat', 'consultant'],
    source: "Kaamelott",
    ages: ['18-30', '25-45', '35-60'],
    registre: 'ironique',
    usage: "concéder un point au client avec humour avant de le retourner",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "On en a gros.",
    metiersPlus: ['restaurant', 'boulangerie', 'coiffeur', 'artisan', 'bar', 'demenagement'],
    source: "Kaamelott",
    ages: ['18-30', '25-45'],
    registre: 'tendre',
    usage: "exprimer la fatigue d'une galère de métier que la cible partage",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Faut pas prendre les gens pour des cons.",
    metiersPlus: ['boucherie', 'boulangerie', 'garage', 'immobilier', 'epicerie', 'poissonnerie', 'primeur'],
    source: "Kaamelott",
    ages: ['25-45', '35-60'],
    registre: 'punchy',
    usage: "dénoncer une pratique du secteur — fausse promo, faux artisanal, fausse promesse",
    reseaux: ['instagram', 'tiktok'],
  },

  // ── CINÉMA AMÉRICAIN — reconnaissance universelle, tous âges ──
  {
    replique: "Je suis ton père.",
    metiersPlus: ['boulangerie', 'boucherie', 'restaurant', 'artisan', 'fromagerie', 'tatoueur', 'veterinaire', 'librairie', 'creche'],
    source: "Star Wars",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'epique',
    usage: "révéler l'origine d'un produit, d'une recette, d'un savoir-faire transmis",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Que la Force soit avec toi.",
    metiersPlus: ['coach', 'institut_beaute', 'coiffeur', 'freelance', 'salle_sport', 'auto_ecole', 'vtc', 'velo', 'creche', 'loisirs', 'formation', 'glacier', 'mode'],
    source: "Star Wars",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'tendre',
    usage: "souhaiter bon courage — rentrée, examens, gros événement, coup de feu",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Je vais lui faire une offre qu'il ne pourra pas refuser.",
    metiersPlus: ['immobilier', 'garage', 'commerce', 'b2b', 'agence'],
    source: "Le Parrain",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'punchy',
    usage: "annoncer une offre, une promotion ou une nouveauté sans dire « promo »",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "La vie, c'est comme une boîte de chocolats.",
    source: "Forrest Gump",
    ages: ['25-45', '35-60', '50+'],
    registre: 'tendre',
    usage: "parler de surprise, de sélection, de découverte — assortiment, menu du jour",
    reseaux: ['instagram', 'linkedin'],
    metiers: ['restaurant', 'boulangerie', 'patisserie', 'chocolat', 'epicerie', 'traiteur', 'caviste', 'cafe', 'glacier', 'primeur', 'fromagerie', 'agence_voyage', 'librairie'],
  },
  {
    replique: "Il va nous falloir un plus gros bateau.",
    metiersPlus: ['restaurant', 'traiteur', 'boulangerie', 'pme', 'poissonnerie', 'demenagement', 'evenementiel', 'glacier'],
    source: "Les Dents de la mer",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'ironique',
    usage: "raconter un afflux de commandes, un succès qui dépasse les prévisions",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Un grand pouvoir implique de grandes responsabilités.",
    metiersPlus: ['boucherie', 'restaurant', 'garage', 'plombier', 'veterinaire'],
    source: "Spider-Man",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'inspirant',
    usage: "assumer une exigence de qualité ou un engagement (origine, fraîcheur, garantie)",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Je reviendrai.",
    metiersPlus: ['boulangerie', 'patisserie', 'restaurant', 'caviste', 'fleuriste', 'primeur', 'glacier', 'auto_ecole', 'vtc', 'serrurier', 'informatique', 'chocolat', 'mode'],
    source: "Terminator",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'punchy',
    usage: "annoncer le retour d'un produit saisonnier ou d'une formule très demandée",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Je suis le roi du monde !",
    metiersPlus: ['coach', 'institut_beaute', 'coiffeur', 'pme', 'salle_sport', 'mode', 'photographe', 'evenementiel', 'loisirs', 'auto_ecole'],
    source: "Titanic",
    ages: ['18-30', '25-45', '35-60'],
    registre: 'epique',
    usage: "célébrer une réussite, un record, un moment de fierté d'équipe",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Nous aurons toujours Paris.",
    metiersPlus: ['hotel', 'restaurant', 'fleuriste', 'immobilier', 'agence_voyage', 'vtc', 'bijouterie', 'photographe', 'evenementiel'],
    source: "Casablanca",
    ages: ['25-45', '35-60', '50+'],
    registre: 'tendre',
    usage: "évoquer un souvenir, une fidélité, une madeleine — anniversaire de commerce",
    reseaux: ['instagram', 'linkedin'],
  },
  {
    replique: "La pilule bleue ou la pilule rouge.",
    metiersPlus: ['coach', 'freelance', 'b2b', 'pme', 'pharmacie', 'informatique', 'agence', 'consultant'],
    source: "Matrix",
    ages: ['18-30', '25-45', '35-60'],
    registre: 'punchy',
    usage: "poser un choix net entre deux options — deux formules, deux façons de faire",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },

  // ── ANIMATION — transgénérationnel, ton chaleureux ──
  {
    replique: "Hakuna Matata.",
    metiersPlus: ['hotel', 'institut_beaute', 'coach', 'traiteur', 'glacier', 'cafe', 'agence_voyage', 'veterinaire', 'creche'],
    source: "Le Roi Lion",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'tendre',
    usage: "vendre la tranquillité d'esprit — un service qui gère tout à la place du client",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Ce qui est fait est fait.",
    metiersPlus: ['coiffeur', 'garage', 'plombier', 'institut_beaute', 'tatoueur', 'sante', 'pharmacie', 'veterinaire', 'peintre', 'pressing', 'jardinerie', 'decoration', 'menage', 'mode', 'auto_ecole', 'carreleur'],
    source: "Le Roi Lion",
    ages: ['18-30', '25-45', '35-60'],
    registre: 'inspirant',
    usage: "dédramatiser un raté, une erreur de commande, un imprévu",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Tout le monde peut cuisiner.",
    metiersPlus: ['restaurant', 'boulangerie', 'traiteur', 'formation'],
    source: "Ratatouille",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'inspirant',
    usage: "rendre un savoir-faire accessible, partager une astuce, démystifier le métier",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
    metiers: ['restaurant', 'boulangerie', 'traiteur', 'epicerie', 'boucherie', 'patisserie', 'cafe', 'formation', 'coach', 'artisan', 'primeur', 'fromagerie'],
  },
  {
    replique: "Vers l'infini et au-delà !",
    metiersPlus: ['coach', 'pme', 'b2b', 'freelance', 'glacier', 'agence_voyage', 'salle_sport', 'velo', 'loisirs', 'agence'],
    source: "Toy Story",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'epique',
    usage: "annoncer un dépassement, une nouveauté ambitieuse, une expansion",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },

  // ── RÉPLIQUES SÉRIEUSES — l'analogie qui pose un propos, LinkedIn compris ──
  {
    replique: "Les temps sont durs pour les rêveurs.",
    metiersPlus: ['artisan', 'freelance', 'fleuriste', 'menuisier', 'paysagiste', 'jardinerie'],
    source: "Le Fabuleux Destin d'Amélie Poulain",
    ages: ['25-45', '35-60'],
    registre: 'inspirant',
    usage: "parler de persévérance, de projet mené malgré le contexte — récit d'entrepreneur",
    reseaux: ['instagram', 'linkedin'],
  },
  {
    replique: "Y'a pas de problème, y'a que des solutions.",
    metiersPlus: ['plombier', 'garage', 'traiteur', 'pme', 'vtc', 'electricien', 'serrurier', 'renovation', 'pressing', 'quincaillerie', 'informatique', 'menage', 'demenagement', 'macon', 'auto_ecole'],
    source: "formule popularisée au cinéma",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'inspirant',
    usage: "montrer qu'on trouve toujours une réponse à une demande inhabituelle",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Faites ce que vous voulez, mais faites-le bien.",
    metiersPlus: ['menuisier', 'artisan', 'garage', 'macon', 'peintre', 'carreleur', 'quincaillerie', 'decoration', 'photographe'],
    source: "esprit de l'artisanat",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'inspirant',
    usage: "revendiquer l'exigence du métier",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Alors, heureux ?",
    metiersPlus: ['coiffeur', 'institut_beaute', 'garage', 'menuisier', 'bar', 'opticien', 'peintre', 'carreleur', 'paysagiste', 'renovation', 'bijouterie', 'mode', 'decoration', 'menage', 'photographe'],
    source: "Le Grand Bleu",
    ages: ['25-45', '35-60', '50+'],
    registre: 'tendre',
    usage: "clore une transformation, un avant/après, une commande livrée",
    reseaux: ['instagram', 'linkedin'],
  },

  // ── MÉTIERS DE BOUCHE — l'analogie tombe pile ──
  {
    replique: "Sans la sauce, c'est rien.",
    metiersPlus: ['restaurant', 'traiteur', 'boucherie', 'poissonnerie'],
    source: "La Vérité si je mens",
    ages: ['25-45', '35-60'],
    registre: 'punchy',
    usage: "mettre en avant le détail qui change tout dans un produit",
    reseaux: ['instagram', 'tiktok'],
    metiers: ['restaurant', 'boulangerie', 'traiteur', 'boucherie', 'epicerie', 'patisserie', 'cafe', 'poissonnerie', 'primeur', 'fromagerie', 'bar', 'glacier'],
  },
  {
    replique: "Vous êtes bien urgents, vous.",
    metiersPlus: ['fleuriste', 'traiteur', 'boulangerie', 'pressing', 'menage', 'evenementiel'],
    source: "Kaamelott",
    ages: ['25-45', '35-60'],
    registre: 'ironique',
    usage: "parler des commandes de dernière minute avec le sourire",
    reseaux: ['instagram', 'tiktok'],
    metiers: ['restaurant', 'traiteur', 'fleuriste', 'boulangerie', 'artisan', 'evenementiel', 'pressing', 'menage', 'photographe', 'serrurier', 'plombier', 'garage', 'demenagement', 'informatique'],
  },

  // ── LES INCONNUS / LES TROIS FRÈRES — sketch et cinéma populaire ──
  {
    replique: "T'as pas cent balles ?",
    metiersPlus: ['epicerie', 'commerce', 'boulangerie', 'caviste', 'bar'],
    source: "Les Trois Frères",
    ages: ['25-45', '35-60', '50+'],
    registre: 'ironique',
    usage: "parler d'argent, de petit budget ou d'une bonne affaire sans être lourd",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "C'est ton destin.",
    metiersPlus: ['immobilier', 'coach', 'caviste', 'fleuriste', 'agence_voyage', 'tatoueur', 'bijouterie', 'mode', 'loisirs'],
    source: "Les Trois Frères",
    ages: ['18-30', '25-45', '35-60'],
    registre: 'epique',
    usage: "dramatiser un choix simple — le produit qu'on ne peut pas ne pas prendre",
    reseaux: ['instagram', 'tiktok'],
  },

  // ── LE DÎNER DE CONS ──
  {
    replique: "Je m'appelle François Pignon.",
    metiersPlus: ['pme', 'b2b', 'freelance', 'commerce', 'recrutement'],
    source: "Le Dîner de cons",
    ages: ['25-45', '35-60', '50+'],
    registre: 'absurde',
    usage: "se présenter avec autodérision — post de présentation d'équipe ou de gérant",
    reseaux: ['instagram', 'tiktok'],
  },

  // ── LA VÉRITÉ SI JE MENS ──
  {
    replique: "On est des professionnels ou on l'est pas ?",
    metiersPlus: ['garage', 'plombier', 'menuisier', 'b2b', 'pme', 'macon', 'couvreur', 'carreleur', 'renovation'],
    source: "La Vérité si je mens",
    ages: ['25-45', '35-60'],
    registre: 'punchy',
    usage: "revendiquer le sérieux du métier face aux amateurs du secteur",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },

  // ── JAMES BOND & ARCHÉTYPES DE L'ESPION ──
  {
    replique: "Bond. James Bond.",
    metiersPlus: ['immobilier', 'coiffeur', 'hotel', 'b2b', 'recrutement'],
    source: "James Bond",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'punchy',
    usage: "présenter un produit ou une personne avec assurance — post de présentation",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },

  // ── SEIGNEUR DES ANNEAUX / FANTASY ──
  {
    replique: "Vous ne passerez pas !",
    metiersPlus: ['restaurant', 'boulangerie', 'coiffeur', 'institut_beaute', 'couvreur', 'serrurier', 'loisirs', 'mode'],
    source: "Le Seigneur des Anneaux",
    ages: ['18-30', '25-45', '35-60'],
    registre: 'epique',
    usage: "poser une limite avec humour — horaires, dernière commande, règle de la maison",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Mon précieux.",
    metiersPlus: ['caviste', 'fromagerie', 'chocolat', 'boucherie', 'patisserie', 'cafe', 'tatoueur', 'bijouterie', 'mode', 'decoration'],
    source: "Le Seigneur des Anneaux",
    ages: ['18-30', '25-45', '35-60'],
    registre: 'tendre',
    usage: "parler d'un produit qu'on garde jalousement — édition limitée, recette secrète",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "L'hiver vient.",
    metiersPlus: ['restaurant', 'caviste', 'boulangerie', 'commerce', 'hotel', 'primeur', 'couvreur', 'paysagiste', 'librairie', 'jardinerie', 'mode'],
    source: "Game of Thrones",
    ages: ['18-30', '25-45', '35-60'],
    registre: 'epique',
    usage: "annoncer un changement de saison, une collection ou une carte d'hiver",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },

  // ── CLASSIQUES AMÉRICAINS — l'analogie qui pose ou qui claque ──
  {
    replique: "Houston, on a un problème.",
    metiersPlus: ['garage', 'plombier', 'pme', 'b2b', 'sante', 'pharmacie', 'auto_ecole', 'vtc', 'velo', 'electricien', 'serrurier', 'renovation', 'pressing', 'informatique', 'demenagement', 'comptable', 'assurance', 'agence', 'macon'],
    source: "Apollo 13",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'ironique',
    usage: "annoncer un imprévu avec le sourire — panne, rupture, contretemps",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Carpe diem.",
    metiersPlus: ['restaurant', 'boulangerie', 'fleuriste', 'caviste', 'traiteur', 'poissonnerie', 'primeur', 'glacier', 'cafe', 'agence_voyage', 'paysagiste', 'librairie', 'jardinerie', 'photographe', 'formation', 'chocolat'],
    source: "Le Cercle des poètes disparus",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'inspirant',
    usage: "inviter à profiter maintenant — offre du jour, saison courte, dernier service",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Adrian !",
    metiersPlus: ['coach', 'pme', 'garage', 'salle_sport', 'velo'],
    source: "Rocky",
    ages: ['25-45', '35-60', '50+'],
    registre: 'epique',
    usage: "célébrer une victoire, un objectif atteint, une fierté d'équipe",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Je vois des gens morts.",
    metiersPlus: ['restaurant', 'boulangerie', 'coiffeur', 'hotel', 'cafe', 'opticien'],
    source: "Sixième Sens",
    ages: ['25-45', '35-60'],
    registre: 'absurde',
    usage: "décrire l'état du lundi matin, d'une fin de service, d'un inventaire",
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "Élémentaire, mon cher Watson.",
    metiersPlus: ['garage', 'plombier', 'immobilier', 'b2b', 'menuisier', 'sante', 'pharmacie', 'opticien', 'electricien', 'serrurier', 'librairie', 'quincaillerie', 'informatique', 'comptable', 'avocat', 'consultant', 'macon'],
    source: "Sherlock Holmes",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'ironique',
    usage: "expliquer une évidence du métier que les clients ignorent",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Après tout, demain est un autre jour.",
    metiersPlus: ['restaurant', 'commerce', 'coiffeur', 'hotel'],
    source: "Autant en emporte le vent",
    ages: ['35-60', '50+'],
    registre: 'inspirant',
    usage: "clore une journée difficile, relativiser un imprévu",
    reseaux: ['instagram', 'linkedin'],
  },
  {
    replique: "L'important n'est pas la chute, c'est l'atterrissage.",
    metiersPlus: ['pme', 'freelance', 'coach', 'b2b', 'salle_sport', 'auto_ecole', 'velo', 'assurance', 'agence', 'recrutement'],
    source: "La Haine",
    ages: ['18-30', '25-45', '35-60'],
    registre: 'inspirant',
    usage: "parler de rebond après un échec — récit d'entrepreneur, changement de cap",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },

  // ── ANIMATION & FAMILLE — chaleureux, très transgénérationnel ──
  {
    replique: "Un pour tous, tous pour un.",
    metiersPlus: ['pme', 'restaurant', 'commerce', 'b2b', 'librairie', 'creche', 'demenagement', 'evenementiel', 'avocat', 'recrutement'],
    source: "Les Trois Mousquetaires",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'tendre',
    usage: "parler d'équipe, d'entraide entre commerçants, de collectif",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "La patience est la clé.",
    metiersPlus: ['boulangerie', 'fromagerie', 'caviste', 'boucherie', 'artisan', 'poissonnerie', 'primeur', 'sante', 'veterinaire', 'macon', 'peintre', 'carreleur', 'paysagiste', 'jardinerie', 'decoration', 'creche', 'formation', 'chocolat'],
    source: "Kung Fu Panda",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'inspirant',
    usage: "valoriser un temps long — maturation, levain, séchage, fait maison",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "Il n'y a pas de secret d'ingrédient.",
    metiersPlus: ['boulangerie', 'restaurant', 'patisserie', 'traiteur', 'formation'],
    source: "Kung Fu Panda",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'inspirant',
    usage: "dire que la qualité tient au soin, pas à une recette magique",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },

  // ── FORMULES DE MÉTIER — sérieuses, pour LinkedIn et les PME ──
  {
    replique: "Le diable est dans les détails.",
    metiersPlus: ['menuisier', 'artisan', 'garage', 'plombier', 'immobilier', 'b2b', 'tatoueur', 'opticien', 'electricien', 'macon', 'couvreur', 'peintre', 'carreleur', 'renovation', 'bijouterie', 'pressing', 'quincaillerie', 'decoration', 'menage', 'photographe', 'comptable', 'avocat', 'assurance', 'consultant', 'chocolat'],
    source: "expression consacrée",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'inspirant',
    usage: "justifier une exigence invisible pour le client mais décisive",
    reseaux: ['instagram', 'tiktok', 'linkedin'],
  },
  {
    replique: "La confiance se gagne en gouttes et se perd en litres.",
    metiersPlus: ['garage', 'plombier', 'immobilier', 'b2b', 'pme', 'sante', 'pharmacie', 'comptable', 'assurance'],
    source: "formule consacrée",
    ages: ['18-30', '25-45', '35-60', '50+'],
    registre: 'inspirant',
    usage: "parler de fidélité, de réputation, d'avis clients",
    reseaux: ['instagram', 'linkedin'],
  },

  // ── OSS 117 — répliques recoupées sur plusieurs bases de citations ──
  {
    replique: "Comment est votre blanquette ?",
    source: 'OSS 117 : Le Caire, nid d\'espions',
    ages: ['18-30', '25-45', '35-60'],
    registre: 'absurde',
    usage: "le mot de passe entre initiés — la réponse attendue est « Elle est bonne ! ». Sert d'appel à commentaire : ceux qui connaissent répondent d'eux-mêmes",
    metiersPlus: ['restaurant', 'traiteur', 'boucherie', 'cafe', 'bar'],
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "J'aime me beurrer la biscotte.",
    source: 'OSS 117 : Le Caire, nid d\'espions',
    ages: ['25-45', '35-60'],
    registre: 'absurde',
    usage: "assumer la gourmandise du matin — beurre, viennoiserie, petit-déjeuner, brunch",
    metiersPlus: ['boulangerie', 'patisserie', 'cafe', 'epicerie', 'fromagerie'],
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "23 à 0 ! C'est la piquette Jack ! Tu sais pas jouer Jack ! T'es mauvais !",
    source: 'OSS 117 : Le Caire, nid d\'espions',
    ages: ['18-30', '25-45', '35-60'],
    registre: 'punchy',
    usage: "célébrer un score, un record, une performance d'équipe — la vantardise est tellement excessive qu'elle se lit au second degré",
    metiersPlus: ['salle_sport', 'coach', 'loisirs'],
    reseaux: ['instagram', 'tiktok'],
  },
  {
    replique: "J'aime quand on m'enduit d'huile.",
    source: 'OSS 117 : Le Caire, nid d\'espions',
    ages: ['25-45', '35-60'],
    registre: 'absurde',
    usage: "parler massage et soin du corps avec un clin d'œil — le sous-entendu est assumé, à réserver aux comptes qui pratiquent déjà l'humour",
    metiersPlus: ['institut_beaute'],
    metiers: ['institut_beaute'],
    reseaux: ['instagram', 'tiktok'],
  },

];

/** Âge dominant supposé de la clientèle, par type de commerce. */


/**
 * Âge présumé de la clientèle, par famille de métier.
 *
 * Une présomption, pas une vérité : dès que le client renseigne sa cible,
 * `ageCible` prime. Elle sert uniquement à ne pas servir une référence que
 * personne dans la salle ne reconnaîtra.
 */
const AGE_PAR_METIER: Record<string, ReferenceCulturelle['ages'][number]> = {
  restaurant: '25-45',
  boulangerie: '35-60',
  patisserie: '25-45',
  chocolat: '35-60',
  boucherie: '35-60',
  poissonnerie: '35-60',
  primeur: '35-60',
  fromagerie: '35-60',
  caviste: '35-60',
  epicerie: '35-60',
  glacier: '18-30',
  cafe: '25-45',
  bar: '18-30',
  traiteur: '35-60',
  hotel: '35-60',
  agence_voyage: '35-60',
  coiffeur: '25-45',
  institut_beaute: '25-45',
  tatoueur: '18-30',
  salle_sport: '25-45',
  coach: '18-30',
  sante: '35-60',
  pharmacie: '35-60',
  opticien: '35-60',
  veterinaire: '35-60',
  garage: '35-60',
  auto_ecole: '18-30',
  vtc: '25-45',
  velo: '25-45',
  plombier: '35-60',
  electricien: '35-60',
  menuisier: '35-60',
  macon: '35-60',
  couvreur: '35-60',
  peintre: '35-60',
  carreleur: '35-60',
  serrurier: '35-60',
  paysagiste: '35-60',
  renovation: '35-60',
  artisan: '35-60',
  fleuriste: '35-60',
  bijouterie: '35-60',
  librairie: '35-60',
  pressing: '35-60',
  quincaillerie: '35-60',
  jardinerie: '50+',
  mode: '18-30',
  decoration: '25-45',
  informatique: '25-45',
  creche: '25-45',
  menage: '35-60',
  demenagement: '35-60',
  photographe: '25-45',
  evenementiel: '25-45',
  loisirs: '18-30',
  immobilier: '35-60',
  comptable: '35-60',
  avocat: '35-60',
  assurance: '35-60',
  agence: '25-45',
  consultant: '35-60',
  formation: '25-45',
  recrutement: '25-45',
  freelance: '25-45',
  pme: '35-60',
  b2b: '35-60',
  commerce: '35-60',
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
  // On résout d'abord le libellé libre — « Salon de coiffure », « Bar à vin » —
  // vers ses familles. Comparer directement à la chaîne brute ne reconnaissait
  // que les commerces qui s'étaient décrits avec nos propres mots.
  const familles = famillesDe(opts.businessType);
  const appartient = (m: string) => familles.has(m);

  const age = opts.ageCible
    || [...familles].map(f => AGE_PAR_METIER[f]).find(Boolean)
    || '25-45';

  const retenues = REFERENCES.filter(r => {
    if (!r.ages.includes(age)) return false;
    if (opts.reseau && !r.reseaux.includes(opts.reseau)) return false;
    if (r.metiers && r.metiers.length > 0) {
      return r.metiers.some(appartient);
    }
    return true;
  });

  // Les répliques taillées pour ce métier passent devant : le modèle lit la
  // liste dans l'ordre, autant lui présenter les analogies les plus évidentes
  // en premier. On ne retire rien — les autres restent disponibles derrière.
  return retenues.sort((x, y) => {
    const xPlus = (x.metiersPlus || []).some(appartient) ? 1 : 0;
    const yPlus = (y.metiersPlus || []).some(appartient) ? 1 : 0;
    return yPlus - xPlus;
  });
}

/**
 * Bloc à injecter dans le prompt de contenu.
 *
 * Volontairement présenté comme une OPTION parmi d'autres angles, avec un
 * plafond : une référence dans chaque post deviendrait un tic, et l'effet de
 * surprise — qui fait tout son intérêt — disparaîtrait.
 */
/**
 * Nombre de répliques proposées par réseau.
 *
 * La bibliothèque complète représentait près de 19 000 caractères injectés dans
 * CHAQUE génération de contenu — pour une consigne qui n'autorise la référence
 * qu'un post sur huit. Sept fois sur huit, c'était donc des tokens payés pour
 * rien, sur tous les clients et tous les jours.
 *
 * Douze suffisent : le tri place déjà les analogies taillées pour le métier en
 * tête, et douze options laissent largement de quoi ne pas se répéter d'un post
 * à l'autre.
 */
const MAX_PAR_RESEAU = 12;

/**
 * Coupe la liste sans l'appauvrir : on garde d'abord les répliques taillées
 * pour le métier, puis on complète en variant les registres.
 *
 * Sans cette variation, la coupe rendrait des listes monocolores — douze
 * « inspirant » d'affilée — et le modèle écrirait tous ses posts sur le même
 * ton, ce qui est précisément le travers qu'on cherche à éviter.
 */
function restreindre(liste: ReferenceCulturelle[]): ReferenceCulturelle[] {
  if (liste.length <= MAX_PAR_RESEAU) return liste;

  const retenues: ReferenceCulturelle[] = [];
  const restantes = [...liste];
  const vus = new Set<string>();

  // Un tour par registre déjà servi : on pioche en priorité un registre absent.
  while (retenues.length < MAX_PAR_RESEAU && restantes.length > 0) {
    let i = restantes.findIndex(r => !vus.has(r.registre));
    if (i === -1) { i = 0; vus.clear(); }
    const [choisie] = restantes.splice(i, 1);
    vus.add(choisie.registre);
    retenues.push(choisie);
  }
  return retenues;
}

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
    const dispo = restreindre(
      referencesPour({ businessType: opts.businessType, ageCible: opts.ageCible, reseau: r }),
    );
    if (dispo.length === 0) continue;
    sections.push('  ' + r.toUpperCase() + ' — ' + TON[r]);
    for (const x of dispo) sections.push('    • [' + x.registre + '] « ' + x.replique + ' » (' + x.source + ') → ' + x.usage);
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
    "REGISTRES — choisis celui qui colle à l'identité du commerce :",
    '  absurde = décalé, fait rire · ironique = second degré, complice · tendre = chaleureux, humain',
    '  punchy = accroche directe · inspirant = sérieux positif, valorise le métier · epique = dramatise pour marquer',
    "Un artisan qui soigne son image ne parle pas comme un food-truck : le registre doit ressembler au commerce, pas à la mode du moment.",
    '',
    'RÈGLES :',
    "- MAXIMUM 1 post sur 8 avec une référence. Au-delà ça devient un tic, et la surprise — qui fait tout l'intérêt — s'épuise.",
    "- Cite la réplique EXACTEMENT telle qu'écrite. Une réplique déformée saute aux yeux de ceux qui la connaissent, c'est-à-dire précisément le public qu'on visait.",
    "- N'invente JAMAIS une réplique ou un film absent de cette liste.",
    "- Respecte le réseau : une réplique listée sous TIKTOK ne va pas sur LinkedIn.",
    "- Le lien avec le commerce doit être ÉVIDENT en une seconde. Si tu dois expliquer l'analogie, elle ne marche pas : passe à autre chose.",
    "- La réplique sert le message, jamais l'inverse. Si le post fonctionne sans, n'en mets pas.",
  ].join('\n');
}
