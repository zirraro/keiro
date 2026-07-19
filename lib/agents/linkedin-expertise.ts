/**
 * 2026-07-19 — LinkedIn expertise & angle bank (founder : "cable les tous",
 * "mets-toi dans la peau du consultant dans les différents domaines",
 * "super expertise finance invest", "super top niveau sur LinkedIn").
 *
 * Sur LinkedIn, Léna n'écrit PAS la pub de KeiroAI : elle écrit DANS LA VOIX
 * du client (consultant, indépendant, professionnel), sur SON expertise, pour
 * SON audience. Le but = positionner le client comme une référence de son
 * domaine (thought leadership), pas vendre KeiroAI.
 *
 * Ce module fournit :
 *  1. LINKEDIN_ANGLES     — banque d'angles/registres (à faire tourner)
 *  2. DOMAIN_EXPERTISE    — matière experte par domaine (finance, RH, immo…)
 *  3. getLinkedInPlaybook — bloc prompt complet injecté dans le system prompt
 *
 * Réutilisable par Léna (content-prompt) ET Studio.
 */

export interface LinkedInAngle {
  key: string;
  label: string;
  desc: string;
  example: string;
}

// Banque d'angles LinkedIn — à faire tourner (jamais 2 fois le même dans une
// fenêtre de 4 posts). Chaque angle est un REGISTRE, pas un template figé.
export const LINKEDIN_ANGLES: LinkedInAngle[] = [
  { key: 'contrarian', label: 'Contre-pied / idée reçue', desc: 'Attaque une croyance répandue du secteur, puis démontre.', example: 'La plupart des gens croient X. En réalité, c’est l’inverse, et voici pourquoi.' },
  { key: 'insight', label: 'Insight non-évident', desc: 'Une vérité de terrain que seul un expert du domaine connaît.', example: 'Deux dossiers identiques, deux résultats opposés. La différence tient à un détail que personne ne regarde.' },
  { key: 'cost_of_inaction', label: 'Coût de l’inaction', desc: 'Ce que le lecteur perd sans le voir en ne faisant rien.', example: 'Ne rien faire n’est pas neutre. Ça coûte, chaque mois, en silence.' },
  { key: 'framework', label: 'Méthode / framework', desc: 'Un cadre actionnable numéroté, la matière que le lecteur enregistre.', example: 'Avant de décider, passez ces 3 questions. La plupart en sautent une, et la paie cher.' },
  { key: 'myth_vs_reality', label: 'Mythe vs réalité chiffrée', desc: 'Casse une intuition avec un ordre de grandeur concret et juste.', example: '1 % par an semble anodin. Sur 30 ans, c’est un quart du résultat.' },
  { key: 'story_case', label: 'Cas concret / mini-histoire', desc: 'Situation → tension → leçon. Anonymisé, jamais de faux témoignage.', example: 'Un client arrive persuadé que son problème est A. En trois questions, on comprend que c’est B.' },
  { key: 'objection', label: 'Objection retournée', desc: 'Prend la phrase que le prospect dit toujours et la désamorce.', example: '« Je n’ai pas le temps. » C’est justement le symptôme, pas l’excuse.' },
  { key: 'analogy', label: 'Analogie parlante', desc: 'Traduit un concept technique par une image du quotidien.', example: 'Optimiser sans mesurer, c’est accélérer les yeux fermés.' },
  { key: 'manifesto', label: 'Prise de position / manifeste', desc: 'Une conviction assumée sur le métier ou le secteur.', example: 'Le bon conseil ne devrait pas dépendre de la taille du portefeuille.' },
  { key: 'behind_scenes', label: 'Coulisses / envers du métier', desc: 'Montre le vrai travail, ce que le client ne voit pas.', example: 'Ce que les gens voient : une recommandation. Ce qu’il y a derrière : quarante heures de vérifications.' },
  { key: 'trend_analysis', label: 'Lecture d’une tendance', desc: 'Décrypte une évolution récente du secteur et ce qu’elle implique.', example: 'Ce changement passe inaperçu. Dans un an, il aura redistribué les cartes.' },
  { key: 'question_lesson', label: 'Question / retour d’expérience', desc: 'Ouvre sur une question honnête et partage une leçon apprise.', example: 'La plus grosse erreur de mes débuts ? Croire que le meilleur produit gagne toujours.' },
  { key: 'checklist_signals', label: 'Signaux / diagnostic', desc: 'Liste de signes que le lecteur peut vérifier chez lui.', example: 'Trois signaux qui disent qu’il est temps d’agir. Si vous en cochez deux, on en parle.' },
  { key: 'seasonal', label: 'Ancrage temporel / saison', desc: 'Relie un moment de l’année à un enjeu du métier.', example: 'Chaque rentrée, la même fenêtre s’ouvre. Ceux qui la ratent attendent un an.' },
];

// Matière experte par domaine — points d'expertise RÉELS que le consultant peut
// développer (Léna pioche ce qui colle au sujet du jour). Objectif : profondeur
// crédible, pas généralités. Toujours écrit à la 1re personne du pro / son "on".
export const DOMAIN_EXPERTISE: Record<string, { match: string[]; angles: string[] }> = {
  finance_patrimoine: {
    match: ['finance', 'patrimoine', 'gestion de patrimoine', 'cgp', 'conseiller financier', 'invest', 'investissement', 'wealth', 'courtier', 'assurance vie'],
    angles: [
      'Risque de séquence : la moyenne de rendement ne dit rien de la trajectoire ; subir ses pires années au début des retraits peut ruiner un plan cohérent sur le papier.',
      'Impact des frais sur intérêts composés : 1 %/an de frais ≈ un quart du capital sur 30 ans. Le seul rendement garanti, c’est le coût qu’on évite.',
      'Enveloppes fiscales FR (PEA après 5 ans, assurance-vie après 8 ans, PER déductible) : optimiser le contenant rapporte souvent plus que le placement lui-même.',
      'Time in market > timing the market : rater les 10 meilleures séances sur 20 ans ampute la perf de moitié ; elles suivent souvent les pires.',
      'Vraie tolérance au risque = celle qu’on tient dans un krach, pas celle déclarée dans un questionnaire au calme.',
      'Diversification comme seul "repas gratuit" ; corrélation qui monte quand tout baisse ; poche de liquidités pour ne jamais vendre au plus bas.',
      'Biais comportementaux : aversion à la perte, ancrage, sur-confiance après une bonne année. Le pire ennemi de l’épargnant est souvent lui-même.',
    ],
  },
  comptabilite_fiscalite: {
    match: ['comptable', 'expert-comptable', 'comptabilité', 'fiscalité', 'fiscaliste', 'gestion'],
    angles: [
      'La trésorerie tue plus d’entreprises rentables que les pertes : un bénéfice comptable n’est pas du cash disponible.',
      'Choix du statut (micro, EI, SASU, SARL) : l’écart de net dans la poche se joue plus sur les charges et la protection sociale que sur l’impôt affiché.',
      'Anticiper l’impôt plutôt que le subir : provisionner, lisser, arbitrer rémunération vs dividendes selon la tranche.',
      'Un tableau de bord mensuel simple (marge, point mort, BFR) vaut mieux qu’un bilan annuel qu’on découvre trop tard.',
    ],
  },
  rh_recrutement: {
    match: ['rh', 'ressources humaines', 'recrutement', 'recruteur', 'talent', 'consultant rh'],
    angles: [
      'Un recrutement raté coûte l’équipe, pas le salaire : temps managers, démotivation, clients rattrapés, marque employeur.',
      'La cause d’un échec est rarement la compétence, c’est le décalage entre le poste vendu et le poste réel.',
      'Définir la réussite à 6 mois AVANT de sourcer ; recruter le contexte, pas le CV.',
      'Onboarding : les 90 premiers jours décident de la rétention à 3 ans. La plupart des départs se jouent dès la première semaine.',
      'Marque employeur : ce que vos équipes disent en off pèse plus que n’importe quelle annonce.',
    ],
  },
  marketing_growth: {
    match: ['marketing', 'growth', 'acquisition', 'communication', 'publicité', 'consultant marketing', 'seo', 'social media'],
    angles: [
      'La plupart des boîtes ont un problème de rétention masqué par l’achat de trafic. Un point de rétention vaut plusieurs points d’acquisition, et ne se paie qu’une fois.',
      'CAC vs LTV : quand le coût d’acquisition dépasse la valeur client, la croissance est un puits.',
      'Le meilleur canal n’est pas le moins cher, c’est celui qui amène les clients qui restent.',
      'La régularité bat l’intensité : un rythme tenu 12 mois écrase une campagne géniale sans lendemain.',
      'Message > budget : doubler la clarté de l’offre change plus les résultats que doubler la dépense.',
    ],
  },
  immobilier: {
    match: ['immobilier', 'agent immobilier', 'agence immo', 'mandataire', 'transaction', 'promoteur'],
    angles: [
      'Le prix de départ décide de tout : un bien surévalué se vend moins cher qu’un bien au juste prix, car il traîne et fait douter.',
      'La première visite se fait en ligne : photos, avis, régularité de l’agent ; un profil endormi fait perdre des mandats.',
      'Home staging et lumière : l’acheteur projette une vie, pas des mètres carrés.',
      'Investissement locatif : la rentabilité nette (charges, vacance, fiscalité) est souvent la moitié de la rentabilité brute annoncée.',
    ],
  },
  juridique: {
    match: ['avocat', 'juridique', 'droit', 'notaire', 'juriste', 'legal'],
    angles: [
      'Le contrat le plus utile est celui qu’on lit quand tout va bien, pas celui qu’on dégaine dans le conflit.',
      'Prévenir coûte une consultation, réparer coûte une procédure : le juridique est une assurance, pas une dépense.',
      'Une clause ambiguë ne protège personne ; la précision aujourd’hui évite l’interprétation demain.',
      'Transmission / statuts / propriété intellectuelle : les angles morts les plus chers sont ceux qu’on remet à plus tard.',
    ],
  },
  coaching_dev: {
    match: ['coach', 'coaching', 'développement personnel', 'mentor', 'consultant', 'formateur', 'accompagnement'],
    angles: [
      'On ne change pas par manque d’information mais par manque de système : réduire une friction bat ajouter une règle.',
      'Les objectifs motivent un jour, les habitudes tiennent un an. Concevez l’environnement, pas la volonté.',
      'Le vrai blocage est rarement la stratégie, c’est la peur qui la précède.',
      'Mesurer ce qui compte : ce qu’on suit s’améliore, ce qu’on ignore dérive.',
    ],
  },
  sante_bienetre: {
    match: ['nutrition', 'diététicien', 'coach sportif', 'bien-être', 'thérapeute', 'kiné', 'santé', 'sophrologue', 'naturopathe', 'praticien'],
    angles: [
      'Le problème n’est pas de savoir quoi faire, c’est de tenir : un plan imparfait suivi bat un plan parfait abandonné.',
      'La discipline est une affaire d’environnement plus que de volonté : retirer une friction à la fois.',
      'La constance sur des bases simples surpasse les protocoles complexes qu’on ne tient pas.',
      'Le repos et la régularité sont des leviers sous-estimés, autant que l’effort.',
    ],
  },
  artisanat_btp: {
    match: ['artisan', 'menuisier', 'plombier', 'électricien', 'btp', 'bâtiment', 'peintre', 'maçon', 'ébéniste', 'couvreur'],
    angles: [
      'Le talent, le client le suppose ; ce qu’il vérifie en ligne, ce sont vos réalisations et vos avis.',
      'Un devis clair et rapide gagne plus de chantiers qu’un prix bas : le client achète la tranquillité.',
      'Montrer le "avant/pendant/après" d’un chantier vaut tous les arguments : le geste métier est la meilleure preuve.',
      'La réputation locale se construit avis après avis ; un mot en réponse à chacun se lit par tous les futurs clients.',
    ],
  },
  beaute_esthetique: {
    match: ['coiffeur', 'coiffure', 'esthétique', 'institut', 'beauté', 'barbier', 'ongles', 'spa', 'salon'],
    angles: [
      'La fidélité se joue sur l’expérience autant que sur le résultat : l’accueil, le conseil, le suivi.',
      'Le conseil à emporter (routine maison, entretien) transforme une prestation en relation durable.',
      'Une prise de rendez-vous fluide et une présence en ligne à jour remplissent l’agenda plus que n’importe quelle promo.',
      'Montrer la transformation réelle (avec accord client) crée l’envie mieux qu’une photo catalogue.',
    ],
  },
  restauration_food: {
    match: ['restaurant', 'restaurateur', 'chef', 'traiteur', 'boulangerie', 'pâtisserie', 'café', 'food', 'cuisine'],
    angles: [
      'Le client choisit où manger sur son téléphone avant de pousser la porte : une page à jour remplit des tables.',
      'La marge se joue autant sur les achats et le gaspillage que sur le prix du menu.',
      'Raconter le produit et le geste (provenance, préparation) justifie le prix mieux qu’une remise.',
      'Un avis sans réponse est une table qu’on laisse partir chez le voisin.',
    ],
  },
  mode_retail: {
    match: ['mode', 'boutique', 'prêt-à-porter', 'retail', 'concept store', 'vêtements', 'accessoires', 'bijoux'],
    angles: [
      'La vitrine en ligne est ouverte 24h/24 : un profil figé, c’est un rideau à moitié baissé.',
      'Le conseil de style (comment porter, associer) vend mieux que la photo produit seule.',
      'Les drops et la rareté réelle créent l’envie ; la fausse urgence la détruit.',
      'Un client fidèle vaut plusieurs ventes : le lien post-achat fait revenir.',
    ],
  },
  tech_it: {
    match: ['tech', 'informatique', 'it', 'cybersécurité', 'développeur', 'saas', 'digital', 'data', 'cloud'],
    angles: [
      'La sécurité n’est pas un produit qu’on achète, c’est une hygiène qu’on tient : la faille la plus fréquente est humaine.',
      'La dette technique est un emprunt : elle finance la vitesse d’aujourd’hui avec les intérêts de demain.',
      'Automatiser un mauvais process, c’est faire les erreurs plus vite : simplifier avant d’outiller.',
      'Le bon indicateur n’est pas la fonctionnalité livrée mais le problème résolu pour l’utilisateur.',
    ],
  },
  assurance_courtage: {
    match: ['assurance', 'courtier', 'mutuelle', 'prévoyance', 'assureur'],
    angles: [
      'La bonne couverture n’est pas la moins chère, c’est celle qui paie le jour où tout va mal.',
      'Les exclusions se lisent avant le sinistre, jamais après : le diable est dans les petites lignes.',
      'Sous-assurer coûte peu chaque mois et beaucoup une seule fois.',
      'Prévoyance et arrêt de travail : l’angle mort le plus courant des indépendants.',
    ],
  },
};

/**
 * Retourne le registre d'expertise le plus proche du business_type, sinon null.
 */
export function matchDomain(businessType?: string | null): { key: string; angles: string[] } | null {
  if (!businessType) return null;
  const b = businessType.toLowerCase();
  for (const [key, v] of Object.entries(DOMAIN_EXPERTISE)) {
    if (v.match.some((m) => b.includes(m) || m.includes(b))) return { key, angles: v.angles };
  }
  return null;
}

/**
 * Bloc prompt LinkedIn complet (voix consultant + banque d'angles + expertise
 * domaine ciblée si business_type connu). Injecté dans le system prompt Léna.
 */
export function getLinkedInPlaybook(businessType?: string | null): string {
  const domain = matchDomain(businessType);
  const anglesBlock = LINKEDIN_ANGLES
    .map((a, i) => `${i + 1}. ${a.label} — ${a.desc}\n   Ex : ${a.example}`)
    .join('\n');

  const expertiseBlock = domain
    ? `EXPERTISE DU DOMAINE (« ${businessType} ») — pioche ce qui sert le sujet, développe avec profondeur, jamais en survol :\n` +
      domain.angles.map((a) => `• ${a}`).join('\n')
    : `EXPERTISE DU DOMAINE : écris avec la profondeur d’un vrai spécialiste du métier du client (${businessType || 'son secteur'}). Donne un angle précis, un ordre de grandeur juste, un mécanisme — jamais une généralité que n’importe qui pourrait écrire.`;

  return `POST LINKEDIN — VOIX DU CLIENT, EXPERTISE DE SON MÉTIER (NIVEAU RÉFÉRENCE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RÈGLE CARDINALE : sur LinkedIn tu n’écris PAS la publicité de KeiroAI. Tu écris
DANS LA VOIX DU CLIENT (consultant, indépendant, professionnel), sur SON
expertise, pour SON audience. Objectif = faire du client une RÉFÉRENCE de son
domaine (thought leadership). Le "je"/"on" est celui du client, pas de KeiroAI.
Ne mentionne JAMAIS KeiroAI, ni "IA", ni un outil dans le corps du post.

${expertiseBlock}

BANQUE D’ANGLES (fais-les TOURNER — jamais 2 fois le même dans 4 posts consécutifs ;
choisis celui qui sert le mieux le sujet, pas le premier) :
${anglesBlock}

FORME (founder 2026-07-19, STRICT) :
- Ton LinkedIn : professionnel, posé, incarné. Ni corporate froid, ni familier IG/TikTok.
- Vraies apostrophes françaises (’), accents complets. Zéro faute de typographie.
- Aéré : phrases courtes, un saut de ligne fréquent, aucun bloc massif. Le blanc fait respirer.
- Emoji : ZÉRO par défaut. Au maximum UN seul, uniquement s’il est vraiment pertinent, et rarement.
- Longueur 900-2200 caractères. Structure : hook (1 ligne) → développement/preuve → mécanique ou méthode → chute.
- Le hook est une accroche forte (idée reçue cassée, chiffre juste, question). Pas d’intro molle.
- CTA = une VRAIE question d’engagement dans la voix du client (« Quel est votre… ? », « Comment gérez-vous… ? »)
  ou une invitation sobre à échanger/suivre le profil. Jamais "lien en bio", jamais de promo frontale.
- Honnêteté : jamais de faux témoignage, jamais de chiffre inventé. Un cas concret est anonymisé et plausible.

HASHTAGS LINKEDIN : 3-6 max, ciblés métier + sujet (pas de #fyp #pourtoi). L’algo pénalise au-delà.`;
}
