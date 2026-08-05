/**
 * CE DONT CHAQUE AGENT A BESOIN POUR BIEN TRAVAILLER — par métier.
 *
 * Demande du fondateur (2026-08-05) : « on veut un onboarding de qualité,
 * demande tout ce dont nous avons besoin pour fournir un service premium dès
 * les premières actions des agents, et de tous — contenu mais aussi DM, mails,
 * etc. En optionnel pour certains, comme le logo, mais en disant à quoi il
 * servira : quand on demande quelque chose, on explique vite fait où ça va
 * servir, et le client arbitre. » Puis : « prépare-toi à tous types de business,
 * car selon le business les attentes ne sont pas les mêmes. »
 *
 * ── Le principe ──
 *
 * Un onboarding qui demande tout à tout le monde est un formulaire qu'on
 * abandonne. Un onboarding qui demande trop peu produit des agents qui
 * inventent — le travers qu'on corrige partout ailleurs. La sortie est donc
 * indexée sur le métier : on ne demande pas sa carte à un plombier, ni ses
 * zones d'intervention à une boulangerie.
 *
 * ── Pourquoi chaque question porte son « à quoi ça sert » ──
 *
 * C'est la demande explicite du fondateur, et c'est la bonne : un champ
 * inexpliqué se remplit mal ou pas du tout. « Ton logo » se saute ; « ton logo,
 * pour les devis, les documents et le filigrane discret sur certains visuels »
 * se décide. Le client arbitre en connaissance de cause, et il sait où le
 * déposer plus tard s'il change d'avis.
 *
 * ── Trois niveaux, pas deux ──
 *
 * `essentiel` bloque la qualité : sans, l'agent produit du générique.
 * `important` fait la différence entre correct et bon.
 * `optionnel` améliore à la marge.
 * Distinguer les deux derniers évite de présenter comme facultatif ce qui, en
 * pratique, sépare un compte quelconque d'un compte crédible.
 */
import { famillesDe } from '../business-families';

export type Priorite = 'essentiel' | 'important' | 'optionnel';
export type TypeChamp = 'texte' | 'texte_long' | 'liste' | 'url' | 'fichier' | 'choix' | 'nombre';

export interface BesoinAgent {
  /** Clé de stockage dans le dossier client (ou custom_fields). */
  cle: string;
  /** Agents qui s'en servent — sert au routage de Clara. */
  agents: string[];
  /** La question, telle qu'elle est posée au client. */
  question: string;
  /** Où ça sert, en une phrase. Affiché sous la question, toujours. */
  aQuoiCaSert: string;
  priorite: Priorite;
  type: TypeChamp;
  exemple?: string;
  /**
   * Exemples par famille de métier.
   *
   * Un exemple parle bien plus qu'une consigne — mais montrer « levain naturel
   * maison, farine bio » à une agence de communication produit l'effet inverse :
   * le client comprend que la question n'a pas été pensée pour lui, et il la
   * remplit au minimum ou la saute. La famille reconnue l'emporte sur
   * `exemple`, qui reste le repli neutre.
   */
  exemplesParMetier?: Record<string, string>;
  /** Familles concernées. Vide = tous les métiers. */
  metiers?: string[];
  /** Familles où ce besoin est nettement plus important qu'ailleurs. */
  metiersPlus?: string[];
  /** Options, pour les champs de type `choix`. */
  options?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SOCLE — vrai pour tout commerce
// ─────────────────────────────────────────────────────────────────────────────

const SOCLE: BesoinAgent[] = [
  {
    cle: 'company_name', agents: ['content', 'email', 'dm', 'chatbot', 'seo', 'whatsapp'],
    question: 'Le nom exact de ton commerce',
    aQuoiCaSert: "Il apparaît dans chaque post, chaque email et chaque réponse à un client. Orthographié comme sur ta devanture, pas approximé.",
    priorite: 'essentiel', type: 'texte',
  },
  {
    cle: 'business_type', agents: ['content', 'email', 'dm', 'commercial', 'seo'],
    question: 'Ton activité, en quelques mots',
    aQuoiCaSert: "Elle détermine tout le reste : le ton, les visuels, les sujets, et jusqu'aux clins d'œil qu'on se permet ou pas.",
    priorite: 'essentiel', type: 'texte', exemple: 'Boulangerie-pâtisserie artisanale',
  },
  {
    cle: 'city', agents: ['content', 'seo', 'commercial', 'email'],
    question: 'Ta ville et ton quartier',
    aQuoiCaSert: "L'ancrage local est ce qui fait la différence en référencement, et c'est aussi ce qui rend un post crédible auprès des gens du coin.",
    priorite: 'essentiel', type: 'texte',
  },
  {
    cle: 'unique_selling_points', agents: ['content', 'email', 'dm', 'chatbot', 'commercial'],
    question: "Ce qui te distingue vraiment des autres, chez toi",
    aQuoiCaSert: "C'est l'argument qu'on répète partout. Sans lui, les agents écrivent des banalités vraies pour n'importe quel concurrent.",
    priorite: 'essentiel', type: 'texte_long',
    exemple: "Ce que tu fais autrement, et que tes clients citent quand ils parlent de toi",
    exemplesParMetier: {
      boulangerie: "Levain naturel maison, farine bio d'un moulin à 30 km, aucun surgelé",
      restaurant: "Carte qui change chaque semaine, tout fait maison, poisson de criée",
      coiffeur: "Diagnostic capillaire offert, colorations végétales uniquement",
      institut_beaute: "Protocoles sur-mesure, marques bio, jamais de vente forcée",
      plombier: "Devis en 24 h, intervention sous 48 h, chantier laissé propre",
      menuisier: "Bois massif français, tout sur-mesure, pose comprise",
      garage: "Devis avant toute intervention, pièces d'origine, véhicule de prêt",
      agence: "Un seul interlocuteur, résultats mesurés chaque mois, sans engagement",
      comptable: "Réponse sous 24 h, un bilan expliqué en français, honoraires fixes",
      immobilier: "Estimation argumentée gratuite, photos pro, visites accompagnées",
      hotel: "Petit-déjeuner de producteurs locaux, accueil tardif, parking privé",
      mode: "Créateurs français, retouches offertes, pièces en série limitée",
      sante: "Prise en charge le jour même, bilan complet, suivi personnalisé",
      salle_sport: "Un coach à chaque créneau, salle jamais bondée, sans engagement",
      veterinaire: "Urgences acceptées, devis avant chaque acte, suivi post-opératoire",
      boucherie: "Bêtes entières de fermes voisines, maturation maison, découpe à la demande",
      fleuriste: "Fleurs de producteurs de la région, compositions uniques, livraison le jour même",
    },
  },
  {
    cle: 'target_audience', agents: ['content', 'dm', 'email', 'commercial'],
    question: 'Qui sont tes clients, concrètement',
    aQuoiCaSert: "Elle règle le ton, l'heure de publication et jusqu'aux références culturelles employées — une blague qui marche à 25 ans tombe à plat à 60.",
    priorite: 'essentiel', type: 'texte_long',
    exemple: "Qui pousse ta porte, leur âge, ce qu'ils viennent chercher",
    exemplesParMetier: {
      boulangerie: "Familles du quartier le week-end, bureaux le midi, 30-55 ans",
      restaurant: "Cadres le midi, couples et familles le soir, 30-60 ans",
      coiffeur: "Femmes actives 25-50 ans du quartier, beaucoup de fidèles",
      plombier: "Propriétaires de maisons individuelles, 35-65 ans, dans un rayon de 25 km",
      agence: "Dirigeants de PME de 10 à 50 salariés, secteur industriel",
      comptable: "Artisans et commerçants indépendants qui viennent de se lancer",
      immobilier: "Primo-accédants 28-40 ans et vendeurs de maisons familiales",
      hotel: "Clientèle affaires en semaine, couples et familles le week-end",
      mode: "Femmes 25-45 ans qui cherchent des pièces qu'on ne voit pas partout",
      salle_sport: "Actifs 25-45 ans qui viennent avant ou après le travail",
      sante: "Patients du quartier, beaucoup de seniors et de sportifs",
      veterinaire: "Propriétaires de chiens et chats du quartier, tous âges",
    },
  },
  {
    cle: 'scene_signature', agents: ['content', 'dm', 'email', 'seo'],
    question: "Ce qu'on voit quand ton travail est réussi",
    aQuoiCaSert: "C'est la scène qu'on reproduira dans tes visuels. Sans elle, on ne peut que deviner à partir de ton métier — et pour une activité qui sort des cases habituelles, deviner produit des images qui n'ont rien à voir avec toi.",
    priorite: 'essentiel', type: 'texte_long',
    exemple: "Une pièce terminée, cadrée de près, avec le détail qui montre le soin apporté",
    exemplesParMetier: {
      boulangerie: "Une baguette rompue en deux, mie alvéolée bien visible, farine sur le plan de travail",
      restaurant: "Une assiette dressée à l'instant, vapeur et brillance visibles",
      coiffeur: "Le résultat fini sur un client visiblement satisfait, lumière du salon",
      plombier: "Une installation neuve terminée, soudures nettes, chantier laissé propre",
      menuisier: "Le détail d'un assemblage, veine du bois et précision de la coupe",
      agence: "Un tableau de résultats commenté devant le client, courbe en hausse",
      immobilier: "La remise des clés devant le bien, sourires",
      fleuriste: "Une composition terminée vue de près, fraîcheur et couleurs",
      hotel: "Une chambre prête, lit impeccable, lumière de fin d'après-midi",
      veterinaire: "Un animal apaisé après le soin, avec son maître",
    },
  },
  {
    cle: 'brand_tone', agents: ['content', 'email', 'dm', 'chatbot', 'whatsapp'],
    question: 'Comment tu parles à tes clients',
    aQuoiCaSert: "Le tutoiement, l'humour, le niveau de familiarité. C'est ce qui fait qu'un post te ressemble au lieu de ressembler à une marque anonyme.",
    priorite: 'essentiel', type: 'choix',
    options: ['chaleureux et proche', 'professionnel et rassurant', 'drôle et décalé', 'expert et pédagogue', 'haut de gamme et sobre'],
  },
  {
    cle: 'avoid_topics', agents: ['content', 'email', 'dm', 'chatbot', 'whatsapp', 'commercial', 'seo'],
    question: "Ce qu'on ne doit jamais dire ou montrer",
    aQuoiCaSert: "On l'appliquera partout, sans exception. C'est le garde-fou le plus utile que tu puisses nous donner.",
    priorite: 'important', type: 'texte_long',
    exemple: 'Jamais de promo, ne pas parler de politique, ne pas montrer le fournil en désordre',
  },
  {
    cle: 'price_range', agents: ['content', 'chatbot', 'email', 'whatsapp'],
    question: 'Ta gamme de prix',
    aQuoiCaSert: "Elle empêche d'annoncer un tarif faux à un client qui pose la question, et cadre le positionnement des visuels.",
    priorite: 'important', type: 'texte', exemple: 'Menu midi 14-19 €, à la carte 25-40 €',
  },
  {
    cle: 'logo_url', agents: ['content', 'email', 'commercial'],
    question: 'Ton logo',
    aQuoiCaSert: "Devis, documents et signatures d'emails. Optionnel : sans lui on travaille très bien, on n'appose simplement rien sur les visuels.",
    priorite: 'optionnel', type: 'fichier',
  },
  {
    cle: 'brand_colors', agents: ['content'],
    question: 'Tes couleurs',
    aQuoiCaSert: "Elles harmonisent les visuels entre eux, ce qui rend un feed reconnaissable au premier coup d'œil.",
    priorite: 'optionnel', type: 'texte', exemple: 'Bordeaux et beige',
  },
  {
    cle: 'photos_reelles', agents: ['content'],
    question: 'Des photos de ton commerce, de ton équipe, de tes produits',
    aQuoiCaSert: "C'est le point qui change le plus le résultat. Les vraies photos font systématiquement mieux que les visuels générés, et elles évitent qu'un client reconnaisse un lieu qui n'est pas le tien.",
    priorite: 'important', type: 'fichier',
  },
  {
    cle: 'horaires', agents: ['chatbot', 'whatsapp', 'content', 'seo'],
    question: 'Tes horaires et tes jours de fermeture',
    aQuoiCaSert: "Pour répondre juste à la question la plus posée, et pour ne pas programmer un post d'accueil un jour où tu es fermé.",
    priorite: 'essentiel', type: 'texte',
  },
  {
    cle: 'moments_forts', agents: ['content', 'email', 'whatsapp'],
    question: 'Tes temps forts dans l\'année',
    aQuoiCaSert: "On prépare le contenu en amont plutôt qu'au dernier moment — trois semaines avant, quand ça se décide chez tes clients.",
    priorite: 'important', type: 'texte_long',
    exemple: 'Fêtes de fin d\'année, Saint-Valentin, rentrée de septembre',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PAR MÉTIER — ce qui change vraiment d'un commerce à l'autre
// ─────────────────────────────────────────────────────────────────────────────

const METIERS: BesoinAgent[] = [
  // ── Métiers de bouche ──
  {
    cle: 'carte_menu', agents: ['content', 'chatbot', 'whatsapp', 'seo'],
    question: 'Ta carte ou ta gamme du moment',
    aQuoiCaSert: "Elle évite d'annoncer un plat que tu ne fais plus, et permet de mettre en avant ce que tu veux vraiment vendre.",
    priorite: 'essentiel', type: 'fichier',
    metiers: ['restaurant', 'boulangerie', 'patisserie', 'traiteur', 'cafe', 'bar', 'glacier', 'chocolat', 'boucherie', 'fromagerie', 'caviste', 'epicerie', 'primeur', 'poissonnerie'],
  },
  {
    cle: 'specialite_maison', agents: ['content', 'dm', 'email'],
    question: 'Ta spécialité, celle pour laquelle on vient chez toi',
    aQuoiCaSert: "C'est le sujet qui reviendra le plus souvent, parce que c'est celui qui fait venir du monde.",
    priorite: 'essentiel', type: 'texte',
    metiers: ['restaurant', 'boulangerie', 'patisserie', 'traiteur', 'boucherie', 'fromagerie', 'glacier', 'chocolat', 'cafe', 'bar', 'poissonnerie'],
  },
  {
    cle: 'origine_produits', agents: ['content', 'chatbot'],
    question: "D'où viennent tes produits",
    aQuoiCaSert: "L'origine est devenue l'argument numéro un en alimentaire. Précise, elle rassure ; vague, elle inquiète.",
    priorite: 'important', type: 'texte_long',
    metiers: ['restaurant', 'boulangerie', 'boucherie', 'fromagerie', 'primeur', 'poissonnerie', 'epicerie', 'traiteur', 'caviste'],
  },
  {
    cle: 'allergenes_regimes', agents: ['chatbot', 'whatsapp', 'content'],
    question: 'Ce que tu proposes en sans-gluten, végétarien, halal…',
    aQuoiCaSert: "C'est la deuxième question la plus posée en message privé. Y répondre juste évite de perdre une réservation.",
    priorite: 'important', type: 'texte',
    metiers: ['restaurant', 'boulangerie', 'patisserie', 'traiteur', 'cafe', 'glacier'],
  },
  {
    cle: 'reservation_lien', agents: ['chatbot', 'whatsapp', 'content', 'seo'],
    question: 'Ton lien ou ton numéro de réservation',
    aQuoiCaSert: "C'est l'action qu'on demandera à la fin des posts et des réponses. Sans lui, on peut faire venir du monde sur ton profil sans jamais le convertir.",
    priorite: 'essentiel', type: 'texte',
    metiers: ['restaurant', 'hotel', 'coiffeur', 'institut_beaute', 'sante', 'veterinaire', 'tatoueur', 'salle_sport', 'coach', 'photographe', 'loisirs', 'auto_ecole'],
  },

  // ── Beauté, bien-être, santé ──
  {
    cle: 'prestations_durees', agents: ['content', 'chatbot', 'whatsapp'],
    question: 'Tes prestations, avec durées et tarifs',
    aQuoiCaSert: "Pour répondre au quart de tour à « combien ça coûte et ça dure combien de temps », sans jamais inventer un prix.",
    priorite: 'essentiel', type: 'texte_long',
    metiers: ['coiffeur', 'institut_beaute', 'tatoueur', 'sante', 'salle_sport', 'coach', 'veterinaire', 'photographe'],
  },
  {
    cle: 'marques_produits', agents: ['content', 'chatbot'],
    question: 'Les marques que tu utilises ou revends',
    aQuoiCaSert: "Elles rassurent sur le niveau de gamme et donnent des sujets de contenu tout trouvés.",
    priorite: 'important', type: 'liste',
    metiers: ['coiffeur', 'institut_beaute', 'opticien', 'pharmacie', 'salle_sport', 'garage', 'informatique', 'mode', 'decoration'],
  },
  {
    cle: 'avant_apres_ok', agents: ['content'],
    question: 'Peut-on publier des avant/après de tes clients ?',
    aQuoiCaSert: "C'est le format le plus performant de ton métier — mais il demande l'accord des personnes concernées, donc on ne le fait jamais sans ton feu vert.",
    priorite: 'important', type: 'choix', options: ['oui, avec accord signé', 'oui, sans visage', 'non'],
    metiers: ['coiffeur', 'institut_beaute', 'tatoueur', 'sante', 'salle_sport', 'coach', 'peintre', 'renovation', 'menuisier', 'paysagiste', 'decoration'],
  },
  {
    cle: 'diplomes_certifications', agents: ['content', 'email', 'seo'],
    question: 'Tes diplômes, certifications et années de métier',
    aQuoiCaSert: "Dans les métiers où l'on confie son corps, sa santé ou son argent, la preuve de compétence vaut tous les arguments.",
    priorite: 'important', type: 'texte_long',
    metiers: ['sante', 'coach', 'veterinaire', 'opticien', 'pharmacie', 'comptable', 'avocat', 'assurance', 'consultant', 'formation', 'institut_beaute', 'auto_ecole'],
  },

  // ── Artisanat et bâtiment ──
  {
    cle: 'zones_intervention', agents: ['content', 'commercial', 'seo', 'email'],
    question: 'Tes zones d\'intervention',
    aQuoiCaSert: "Elles cadrent la prospection et le référencement local : inutile d'attirer des demandes que tu refuseras.",
    priorite: 'essentiel', type: 'texte',
    metiers: ['plombier', 'electricien', 'menuisier', 'macon', 'couvreur', 'peintre', 'carreleur', 'serrurier', 'paysagiste', 'renovation', 'demenagement', 'menage', 'vtc', 'artisan', 'photographe', 'evenementiel'],
  },
  {
    cle: 'chantiers_references', agents: ['content', 'email', 'commercial'],
    question: 'Tes plus beaux chantiers ou réalisations',
    aQuoiCaSert: "Dans ces métiers, on n'achète pas un discours, on achète un résultat qu'on a vu. Ce sont tes meilleurs contenus.",
    priorite: 'essentiel', type: 'fichier',
    metiers: ['menuisier', 'macon', 'couvreur', 'peintre', 'carreleur', 'paysagiste', 'renovation', 'plombier', 'electricien', 'decoration', 'artisan', 'serrurier'],
  },
  {
    cle: 'urgences_delais', agents: ['chatbot', 'whatsapp', 'content'],
    question: 'Interviens-tu en urgence, et sous quel délai ?',
    aQuoiCaSert: "C'est ce qu'on demande en premier à un plombier ou un serrurier. Une réponse claire là-dessus convertit mieux que n'importe quel argument.",
    priorite: 'important', type: 'texte',
    metiers: ['plombier', 'electricien', 'serrurier', 'garage', 'informatique', 'veterinaire', 'demenagement'],
  },
  {
    cle: 'garanties_assurances', agents: ['content', 'email', 'chatbot'],
    question: 'Tes garanties et assurances (décennale, etc.)',
    aQuoiCaSert: "C'est ce qui distingue un professionnel d'un bricoleur aux yeux d'un client qui hésite à confier un chantier.",
    priorite: 'important', type: 'texte',
    metiers: ['macon', 'couvreur', 'plombier', 'electricien', 'menuisier', 'carreleur', 'renovation', 'peintre', 'garage'],
  },

  // ── Commerce de détail ──
  {
    cle: 'nouveautes_frequence', agents: ['content', 'email'],
    question: 'À quelle fréquence renouvelles-tu tes produits ?',
    aQuoiCaSert: "Pour caler le rythme des posts sur tes arrivages plutôt que sur un calendrier abstrait.",
    priorite: 'important', type: 'texte',
    metiers: ['mode', 'decoration', 'bijouterie', 'librairie', 'jardinerie', 'quincaillerie', 'informatique', 'commerce', 'epicerie', 'caviste'],
  },
  {
    cle: 'vente_en_ligne', agents: ['content', 'chatbot', 'seo', 'email'],
    question: 'Vends-tu en ligne, et sur quelle plateforme ?',
    aQuoiCaSert: "Elle change l'appel à l'action de chaque post : faire venir en boutique ou envoyer vers ta fiche produit ne s'écrit pas pareil.",
    priorite: 'important', type: 'url',
    metiers: ['mode', 'decoration', 'bijouterie', 'librairie', 'epicerie', 'caviste', 'chocolat', 'informatique', 'commerce', 'artisan'],
  },

  // ── Services aux entreprises ──
  {
    cle: 'clients_types_b2b', agents: ['commercial', 'email', 'dm', 'content'],
    question: 'Le type d\'entreprises que tu vises',
    aQuoiCaSert: "Elle cible la prospection et évite d'aller chercher des interlocuteurs qui ne signeront jamais.",
    priorite: 'essentiel', type: 'texte_long',
    metiers: ['comptable', 'avocat', 'assurance', 'agence', 'consultant', 'recrutement', 'formation', 'b2b', 'pme', 'immobilier', 'freelance'],
  },
  {
    cle: 'cas_clients', agents: ['content', 'email', 'commercial'],
    question: 'Des résultats obtenus chez tes clients',
    aQuoiCaSert: "Les chiffres réels remplacent les promesses. On ne publiera JAMAIS de résultat inventé, donc sans ceux-là on reste sur du qualitatif.",
    priorite: 'important', type: 'texte_long',
    metiers: ['comptable', 'avocat', 'assurance', 'agence', 'consultant', 'recrutement', 'formation', 'b2b', 'coach', 'immobilier'],
  },
  {
    cle: 'cycle_vente', agents: ['email', 'commercial', 'dm'],
    question: 'Combien de temps met un prospect à devenir client ?',
    aQuoiCaSert: "Elle règle l'espacement des relances : trop serrées, elles agacent ; trop lâches, on passe après un concurrent.",
    priorite: 'important', type: 'texte',
    metiers: ['comptable', 'avocat', 'assurance', 'agence', 'consultant', 'recrutement', 'formation', 'b2b', 'pme', 'immobilier'],
  },

  // ── Hébergement, tourisme, loisirs ──
  {
    cle: 'saisonnalite', agents: ['content', 'email', 'commercial'],
    question: 'Ta haute et ta basse saison',
    aQuoiCaSert: "On pousse le remplissage quand c'est creux et l'image de marque quand c'est plein — l'inverse serait du gaspillage.",
    priorite: 'essentiel', type: 'texte',
    metiers: ['hotel', 'agence_voyage', 'loisirs', 'evenementiel', 'photographe', 'paysagiste', 'glacier', 'jardinerie'],
  },
  {
    cle: 'equipements_services', agents: ['content', 'chatbot', 'whatsapp', 'seo'],
    question: 'Tes équipements et services inclus',
    aQuoiCaSert: "Ce sont les questions posées avant de réserver. Y répondre à l'avance dans le contenu évite un échange de messages.",
    priorite: 'important', type: 'texte_long',
    metiers: ['hotel', 'loisirs', 'salle_sport', 'evenementiel', 'creche'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PAR AGENT — ce que chaque agent réclame en propre
// ─────────────────────────────────────────────────────────────────────────────

const PAR_AGENT: BesoinAgent[] = [
  {
    cle: 'email_signature_reelle', agents: ['email'],
    question: 'Comment tu signes tes emails',
    aQuoiCaSert: "Un email signé par une vraie personne obtient beaucoup plus de réponses qu'un email signé par un nom de commerce.",
    priorite: 'important', type: 'texte', exemple: 'Karim, gérant',
  },
  {
    cle: 'email_objectif', agents: ['email'],
    question: "Ce que tu veux obtenir de tes emails",
    aQuoiCaSert: "Prendre rendez-vous, faire venir en boutique ou vendre en ligne ne s'écrivent pas du tout pareil.",
    priorite: 'important', type: 'choix',
    options: ['prendre rendez-vous', 'faire venir en boutique', 'vendre en ligne', 'faire connaître', 'fidéliser'],
  },
  {
    cle: 'dm_ce_quon_propose', agents: ['dm'],
    question: "Ce que tu proposes à quelqu'un qui te découvre",
    aQuoiCaSert: "C'est le contenu du premier message privé. Sans offre claire, un message d'approche n'a aucune raison d'obtenir une réponse.",
    priorite: 'important', type: 'texte',
    exemple: 'Un premier essai offert, ou 10 % sur la première commande',
  },
  {
    cle: 'comptes_inspirants', agents: ['content'],
    question: 'Des comptes dont tu aimes le style',
    aQuoiCaSert: "Ils cadrent la direction artistique bien plus vite qu'une description. On s'en inspire sans jamais copier.",
    priorite: 'optionnel', type: 'liste',
  },
  {
    cle: 'concurrents_locaux', agents: ['content', 'commercial', 'seo'],
    question: 'Tes concurrents directs dans le quartier',
    aQuoiCaSert: "Pour ne pas dire la même chose qu'eux, et pour repérer ce qu'ils ne font pas.",
    priorite: 'optionnel', type: 'liste',
  },
  {
    cle: 'avis_recurrents', agents: ['content', 'seo', 'chatbot'],
    question: 'Ce que tes clients disent le plus souvent de toi',
    aQuoiCaSert: "Leurs mots convertissent mieux que les nôtres. On les réutilise tels quels dans les contenus et les réponses.",
    priorite: 'important', type: 'texte_long',
  },
  {
    cle: 'objections_frequentes', agents: ['chatbot', 'email', 'dm', 'whatsapp', 'commercial'],
    question: "Ce qui fait hésiter tes clients avant d'acheter",
    aQuoiCaSert: "Traiter l'objection avant qu'elle soit formulée est ce qui fait passer de « j'y réfléchis » à « je prends ».",
    priorite: 'important', type: 'texte_long',
    exemple: 'Ils trouvent ça cher, ou ils ne savent pas si on prend sans rendez-vous',
  },
];

export const BESOINS: BesoinAgent[] = [...SOCLE, ...METIERS, ...PAR_AGENT];

// ─────────────────────────────────────────────────────────────────────────────

const ORDRE: Record<Priorite, number> = { essentiel: 0, important: 1, optionnel: 2 };

/**
 * Ce qu'il faut demander à CE commerce, pour les agents dont il dispose.
 *
 * On filtre sur deux axes : le métier (on ne demande pas sa carte à un
 * plombier) et les agents réellement actifs chez ce client (lui demander sa
 * signature d'email alors qu'il n'a pas l'agent email, c'est du formulaire pour
 * rien — et c'est ce qui fait abandonner un onboarding).
 */
/**
 * Choisit l'exemple qui parle à CE métier.
 *
 * Renvoie un besoin dont `exemple` est déjà résolu : les appelants n'ont pas à
 * connaître l'existence de `exemplesParMetier`, et aucun ne peut oublier de
 * l'utiliser.
 */
function avecExempleAdapte(b: BesoinAgent, familles: Set<string>): BesoinAgent {
  if (!b.exemplesParMetier) return b;
  const cible = Object.keys(b.exemplesParMetier).find(m => familles.has(m));
  return cible ? { ...b, exemple: b.exemplesParMetier[cible] } : b;
}

/**
 * Le métier sort-il de nos familles connues ?
 *
 * Un client qui choisit « autre », ou dont l'activité ne ressemble à aucune de
 * nos 66 familles, ne peut bénéficier d'aucun repli métier : ni exemple
 * adapté, ni scène de preuve, ni contrôle de cohérence visuelle. Sa
 * description devient alors la SEULE source fiable, et elle cesse d'être un
 * confort pour devenir la condition d'un rendu correct.
 */
export function metierHorsTaxonomie(businessType?: string | null): boolean {
  return famillesDe(businessType).size === 0;
}

export function besoinsPour(opts: {
  businessType?: string | null;
  agentsActifs?: string[];
  /** Clés déjà renseignées : on ne les repose pas. */
  dejaRenseigne?: string[];
}): BesoinAgent[] {
  const familles = famillesDe(opts.businessType);
  const actifs = opts.agentsActifs?.length ? new Set(opts.agentsActifs) : null;
  const connu = new Set(opts.dejaRenseigne || []);

  return BESOINS
    .map(b => avecExempleAdapte(b, familles))
    .filter(b => !connu.has(b.cle))
    .filter(b => !b.metiers?.length || b.metiers.some(m => familles.has(m)))
    .filter(b => !actifs || b.agents.some(a => actifs.has(a)))
    .sort((a, b) => {
      // Métier hors taxonomie : ce qui décrit l'activité et ce qu'on doit
      // montrer passe avant tout le reste. C'est ce qui remplace les replis
      // métier dont ce client ne bénéficiera pas.
      if (!familles.size) {
        const SOCLE_DESCRIPTIF = ['business_type', 'scene_signature', 'unique_selling_points', 'company_description'];
        const ai = SOCLE_DESCRIPTIF.indexOf(a.cle), bi = SOCLE_DESCRIPTIF.indexOf(b.cle);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }
      const p = ORDRE[a.priorite] - ORDRE[b.priorite];
      if (p !== 0) return p;
      // À priorité égale, ce qui est taillé pour le métier passe devant.
      const ax = a.metiers?.some(m => familles.has(m)) ? 0 : 1;
      const bx = b.metiers?.some(m => familles.has(m)) ? 0 : 1;
      return ax - bx;
    });
}

/** Les agents qui consomment une information — le routage de Clara. */
export function agentsConcernes(cle: string): string[] {
  return BESOINS.find(b => b.cle === cle)?.agents || [];
}

/**
 * Ce qui manque encore, résumé pour un agent donné.
 *
 * Sert à deux choses : la relance de Clara, et l'aveu honnête d'un agent qui
 * explique pourquoi il reste générique — « je ne connais pas encore ta
 * spécialité » vaut mieux que d'inventer une spécialité.
 */
export function manquePourAgent(
  agent: string,
  opts: { businessType?: string | null; dejaRenseigne?: string[] },
): BesoinAgent[] {
  return besoinsPour({ ...opts, agentsActifs: [agent] })
    .filter(b => b.priorite !== 'optionnel');
}
