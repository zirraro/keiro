/**
 * Taxonomie des métiers — la référence commune du produit.
 *
 * Les clients se décrivent avec leurs mots (« Salon de coiffure », « Bar à
 * vin », « Cabinet d'ostéopathie »), jamais avec nos clés internes. Sans
 * résolution, tout filtrage par métier retombe sur du générique et l'essentiel
 * de la personnalisation est perdu.
 *
 * Ce module était né dans culture-references.ts pour choisir les répliques par
 * commerce. Il sert désormais à l'onboarding (quelles informations demander à
 * quel type de commerce), à Clara (vers quel agent router quoi) et aux
 * playbooks : une seule taxonomie pour tout le produit, plutôt qu'une liste
 * différente dans chaque module qui finirait par diverger.
 */

/**
 * Familles de métiers : clé canonique → façons dont un commerce se décrit.
 *
 * Les clients écrivent « Salon de coiffure », « barbier », « institut de
 * beauté », jamais nos clés internes. Sans cette table, le filtrage par
 * sous-chaîne ne reconnaissait que les libellés qui contenaient littéralement
 * la clé, et la quasi-totalité des commerces retombait sur la liste générique.
 *
 * Les alias sont écrits sans accent : le libellé est normalisé avant
 * comparaison, pour que « pâtisserie » et « patisserie » se valent.
 */
const FAMILLES_METIERS: Record<string, string[]> = {
  // ── Métiers de bouche ──
  restaurant: ['restaurant', 'resto', 'bistrot', 'bistro', 'brasserie', 'pizzeria', 'pizza', 'creperie', 'trattoria', 'gastronom', 'table', 'auberge', 'snack', 'kebab', 'burger', 'sushi', 'food truck', 'foodtruck', 'cantine', 'bouchon', 'cuisine du monde'],
  boulangerie: ['boulanger', 'viennoiserie', 'pain'],
  patisserie: ['patisserie', 'patissier', 'gateau', 'cake', 'biscuiterie'],
  chocolat: ['chocolat', 'confiserie', 'bonbon'],
  boucherie: ['boucher', 'charcuterie', 'charcutier', 'rotisserie'],
  poissonnerie: ['poissonn', 'ecailler', 'maree', 'fruits de mer'],
  primeur: ['primeur', 'maraich', 'fruits et legumes'],
  fromagerie: ['fromag', 'cremerie'],
  caviste: ['caviste', 'cave a vin', 'vin', 'oenolog', 'spiritueux', 'biere', 'brasseur', 'microbrasserie', 'whisky'],
  epicerie: ['epicerie', 'epicier', 'superette', 'alimentation', 'vrac', 'supermarche'],
  glacier: ['glacier', 'glace', 'creme glacee'],
  cafe: ['cafe', 'coffee', 'torrefact', 'salon de the', 'brunch', 'coffee shop'],
  bar: ['bar ', 'pub', 'cocktail', 'taverne', 'bar a'],
  traiteur: ['traiteur', 'catering'],

  // ── Hébergement & tourisme ──
  hotel: ['hotel', 'hebergement', 'gite', 'chambre d hote', 'camping', 'auberge de jeunesse', 'residence'],
  agence_voyage: ['voyage', 'tourisme', 'sejour', 'croisiere', 'excursion'],

  // ── Beauté & bien-être ──
  coiffeur: ['coiffeur', 'coiffure', 'coiffeuse', 'barbier', 'barber'],
  institut_beaute: ['institut', 'beaute', 'esthetic', 'esthetique', 'onglerie', 'ongle', 'nail', 'spa', 'massage', 'masseur', 'epilation', 'bien etre', 'soin du visage'],
  tatoueur: ['tatou', 'tattoo', 'piercing'],
  salle_sport: ['salle de sport', 'fitness', 'gym', 'musculation', 'crossfit', 'pilates', 'yoga', 'danse', 'boxe'],
  coach: ['coach', 'preparateur', 'personal trainer', 'mentor'],

  // ── Santé ──
  sante: ['osteopath', 'kine', 'dentiste', 'medecin', 'infirmier', 'podolog', 'naturopath', 'dietetic', 'nutrition', 'psycholog', 'sophrolog', 'orthodont', 'cabinet medical'],
  pharmacie: ['pharmac'],
  opticien: ['opticien', 'optique', 'lunette', 'audioprothes', 'audition'],
  veterinaire: ['veterinaire', 'animalerie', 'toilettage', 'toiletteur', 'pension animal'],

  // ── Auto & mobilité ──
  garage: ['garage', 'garagiste', 'mecanic', 'carrosserie', 'pneu', 'automobile', 'concession', 'controle technique', 'depannage auto'],
  auto_ecole: ['auto ecole', 'autoecole', 'conduite', 'permis'],
  vtc: ['vtc', 'taxi', 'chauffeur prive', 'transport de personne'],
  velo: ['velo', 'cycle', 'bicyclette', 'moto', 'scooter', 'trottinette'],

  // ── Bâtiment & artisanat ──
  plombier: ['plombier', 'plomberie', 'chauffagiste', 'sanitaire', 'chauffage'],
  electricien: ['electricien', 'electricite', 'domotique'],
  menuisier: ['menuis', 'ebenist', 'charpent', 'agencement', 'cuisiniste', 'placard'],
  macon: ['macon', 'gros oeuvre', 'terrassement'],
  couvreur: ['couvreur', 'couverture', 'toiture', 'zingu', 'charpente'],
  peintre: ['peintre', 'peinture', 'platrier', 'plaquiste', 'decoration interieur'],
  carreleur: ['carrel', 'parquet', 'revetement de sol'],
  serrurier: ['serrur', 'vitrier', 'vitrerie'],
  paysagiste: ['paysag', 'jardin', 'espaces verts', 'elagage', 'pepinier'],
  renovation: ['renovation', 'batiment', 'btp', 'travaux', 'isolation', 'maitre d oeuvre'],
  artisan: ['artisan', 'atelier', 'fait main', 'savoir faire', 'sur mesure'],

  // ── Commerce de détail ──
  fleuriste: ['fleur', 'floral'],
  bijouterie: ['bijou', 'joaill', 'horloger', 'montre'],
  librairie: ['librairie', 'livre', 'papeterie', 'bande dessinee'],
  pressing: ['pressing', 'blanchisserie', 'laverie', 'retouche', 'couturier', 'couture', 'cordonn'],
  quincaillerie: ['quincaill', 'bricolage', 'outillage'],
  jardinerie: ['jardinerie', 'graine', 'plante', 'horticult'],
  mode: ['pret a porter', 'vetement', 'chaussure', 'maroquinerie', 'friperie', 'concept store', 'mode', 'lingerie'],
  decoration: ['decoration', 'ameublement', 'meuble', 'literie', 'luminaire', 'brocante', 'antiquaire'],
  informatique: ['informatique', 'telephonie', 'reparation smartphone', 'high tech', 'electromenager', 'multimedia'],

  // ── Services aux particuliers ──
  creche: ['creche', 'garde d enfant', 'nounou', 'assistante maternelle', 'periscolaire', 'micro creche'],
  menage: ['menage', 'nettoyage', 'proprete', 'entretien'],
  demenagement: ['demenagement', 'garde meuble', 'debarras'],
  photographe: ['photographe', 'photo', 'videast', 'studio photo'],
  evenementiel: ['evenementiel', 'mariage', 'wedding', 'dj ', 'location de salle', 'reception'],
  loisirs: ['escape game', 'bowling', 'laser game', 'karting', 'parc de loisirs', 'cinema', 'theatre', 'musee'],

  // ── Services aux entreprises ──
  immobilier: ['immobilier', 'syndic', 'promoteur', 'home staging', 'agent immo'],
  comptable: ['comptable', 'comptabilite', 'paie', 'gestion'],
  avocat: ['avocat', 'juridique', 'notaire', 'huissier', 'droit'],
  assurance: ['assurance', 'courtier', 'mutuelle', 'banque', 'credit', 'patrimoine'],
  agence: ['agence web', 'agence de communication', 'marketing', 'graphiste', 'community manager', 'seo', 'developpeur', 'agence digitale'],
  consultant: ['consultant', 'conseil', 'cabinet', 'strategie'],
  formation: ['formation', 'ecole', 'cours', 'professeur', 'tutorat', 'organisme de formation'],
  recrutement: ['recrutement', 'interim', 'ressources humaines', 'chasseur de tete'],
  freelance: ['freelance', 'independant', 'auto entrepreneur', 'solopreneur'],
  pme: ['pme', 'tpe', 'entreprise', 'industrie', 'usine', 'fabricant', 'grossiste', 'distributeur', 'manufacture'],
  b2b: ['b2b', 'professionnel', 'fournisseur'],
  commerce: ['commerce', 'boutique', 'magasin', 'enseigne', 'franchise'],
};

/** Enlève accents et ponctuation : « Pâtisserie & Co. » → « patisserie   co  ». */
function normaliser(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Résout un libellé libre vers l'ensemble des familles auxquelles il appartient.
 *
 * Un commerce peut en toucher plusieurs — « bar à vin » relève du bar ET du
 * caviste, « boulangerie-pâtisserie » des deux — et c'est voulu : il hérite
 * alors des répliques taillées pour chacune.
 */
/**
 * Suffixes tolérés après un alias : pluriels, féminins et dérivations
 * courantes du français commercial.
 *
 * Sans eux, « boulanger » ne reconnaîtrait pas « boulangerie » et « fleur » pas
 * « fleurs ». Avec eux mais SANS frontière de mot, on obtient l'inverse :
 * « comptable » contient « table » et un cabinet d'expertise comptable se
 * voyait classé restaurant — on lui demandait sa carte et son lien de
 * réservation. La combinaison des deux est ce qui rend la reconnaissance sûre.
 *
 * `ale`/`al` sont volontairement absents : c'est ce qui empêche « artisanale »
 * de déclencher la famille « artisan ». Une boulangerie artisanale est une
 * boulangerie, pas un artisan du bâtiment, et elle n'a pas de zone
 * d'intervention à déclarer.
 */
const SUFFIXES = '(?:e|s|es|x|ie|ies|erie|eries|ier|iere|ieres)?';

function echapper(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * L'alias doit commencer sur une frontière de mot et finir sur une frontière,
 * suffixe autorisé compris. Un alias en plusieurs mots est cherché tel quel,
 * toujours à partir d'un début de mot.
 */
function present(libelle: string, alias: string): boolean {
  const motif = alias.includes(' ')
    ? `(?:^| )${echapper(alias.trim())}`
    : `\\b${echapper(alias)}${SUFFIXES}\\b`;
  return new RegExp(motif).test(libelle);
}

/**
 * Familles à retirer quand une famille plus précise a été reconnue.
 *
 * Une auto-école EST un organisme de formation, et une clinique vétérinaire
 * relève bien du soin — mais elles n'en ont pas les attentes : on demanderait à
 * l'auto-école quelles entreprises elle vise et quel est son cycle de vente,
 * alors qu'elle vend à des particuliers. La famille spécifique l'emporte donc
 * sur la générique, sauf si cette dernière a été nommée pour elle-même.
 */
const PLUS_PRECIS_QUE: Record<string, string[]> = {
  auto_ecole: ['formation'],
  veterinaire: ['sante'],
  pharmacie: ['sante'],
  opticien: ['sante'],
  salle_sport: ['coach'],
  tatoueur: ['institut_beaute'],
  glacier: ['restaurant'],
  boulangerie: ['artisan'],
  patisserie: ['artisan'],
  chocolat: ['artisan'],
};

export function famillesDe(businessType?: string | null): Set<string> {
  const libelle = normaliser(String(businessType || ''));
  const familles = new Set<string>();
  if (!libelle) return familles;

  // On note au passage les familles reconnues par leur propre nom : celles-là
  // sont voulues par le client et ne se laissent évincer par personne.
  const nommees = new Set<string>();
  for (const [cle, alias] of Object.entries(FAMILLES_METIERS)) {
    // La clé est normalisée elle aussi : « salle_sport » ne se retrouverait
    // jamais tel quel dans un libellé, qui s'écrit « salle de sport ».
    const parLaCle = present(libelle, cle.replace(/_/g, ' '));
    if (parLaCle || alias.some(a => present(libelle, a))) familles.add(cle);
    if (parLaCle) nommees.add(cle);
  }

  for (const precise of [...familles]) {
    for (const generique of PLUS_PRECIS_QUE[precise] || []) {
      if (!nommees.has(generique)) familles.delete(generique);
    }
  }
  return familles;
}
