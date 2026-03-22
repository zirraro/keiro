/**
 * Sectoral Knowledge Base
 * Contains benchmarks, best practices, and strategies for each business sector.
 * Used by all agents to provide industry-specific advice.
 *
 * Data sources: INSEE, France Num, CCI, Statista, Meta Business, Google Ads benchmarks.
 * All figures are realistic French market averages for small businesses (2024-2026).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SectorKnowledge {
  sector: string;
  aliases: string[];

  marketing: {
    instagramEngagementRate: number;
    tiktokEngagementRate: number;
    emailOpenRate: number;
    emailClickRate: number;
    avgCostPerClick: number; // EUR Meta Ads
    avgROAS: number;
    bestPostingTimes: { platform: string; days: string[]; hours: string[] }[];
    topHashtags: string[];
    contentIdeas: string[];
    competitorCount: 'high' | 'medium' | 'low';
  };

  seo: {
    avgMonthlySearches: string;
    topKeywords: string[];
    localSearchImportance: 'critical' | 'high' | 'medium' | 'low';
    googleMapsImportance: 'critical' | 'high' | 'medium';
    reviewImportance: 'critical' | 'high' | 'medium';
    avgReviewScore: number;
    seasonality: { month: string; demand: 'high' | 'medium' | 'low' }[];
  };

  business: {
    avgTicket: string;
    avgMargin: string;
    clientRetentionRate: string;
    avgLifetimeValue: string;
    peakHours: string[];
    challenges: string[];
    opportunities: string[];
  };

  prospection: {
    bestChannels: string[];
    avgConversionRate: string;
    coldEmailTemplateType: string;
    referralPotential: 'high' | 'medium' | 'low';
    partnershipOpportunities: string[];
  };

  finance: {
    avgRevenue: string;
    mainCosts: string[];
    avgRentPercent: string;
    seasonalCashFlow: string;
    taxObligations: string[];
  };
}

// ---------------------------------------------------------------------------
// Sector Database
// ---------------------------------------------------------------------------

const SECTORS: SectorKnowledge[] = [
  // =========================================================================
  // 1. RESTAURANT
  // =========================================================================
  {
    sector: 'restaurant',
    aliases: ['restaurant', 'bistrot', 'brasserie', 'traiteur', 'fast-food', 'pizzeria', 'creperie', 'snack'],
    marketing: {
      instagramEngagementRate: 3.8,
      tiktokEngagementRate: 6.2,
      emailOpenRate: 22.1,
      emailClickRate: 2.8,
      avgCostPerClick: 0.35,
      avgROAS: 5.2,
      bestPostingTimes: [
        { platform: 'instagram', days: ['mardi', 'mercredi', 'vendredi'], hours: ['11h30', '18h00'] },
        { platform: 'tiktok', days: ['mercredi', 'vendredi', 'samedi'], hours: ['12h00', '19h00'] },
        { platform: 'facebook', days: ['mardi', 'jeudi'], hours: ['11h00', '17h00'] },
      ],
      topHashtags: ['#restaurant', '#foodporn', '#gastro', '#bonneadresse', '#restaurantparis', '#foodie', '#faitmaison', '#platdujour', '#brunch', '#terrasse'],
      contentIdeas: [
        'Coulisses de la cuisine : preparation du plat du jour en accelere',
        'Portrait du chef et son histoire / parcours',
        'Avant/apres de la presentation d\'un plat signature',
        'Timelapse du service du midi ou du soir',
        'Avis client video spontane apres le repas',
        'Recette simplifiee d\'un plat populaire a reproduire chez soi',
        'Arrivage du marche : selection des produits frais du jour',
        'Story "Devinez l\'ingredient secret" avec sondage interactif',
        'Comparaison plat classique vs version revisitee du chef',
        'Visite virtuelle du restaurant en 30 secondes',
        'Menu de saison : presentation visuelle des nouveautes',
        'Collaboration avec un producteur local (ferme, fromagerie)',
      ],
      competitorCount: 'high',
    },
    seo: {
      avgMonthlySearches: '5000-50000',
      topKeywords: ['restaurant [ville]', 'meilleur restaurant [ville]', 'restaurant italien [ville]', 'brunch [ville]', 'terrasse restaurant [ville]', 'restaurant livraison [ville]'],
      localSearchImportance: 'critical',
      googleMapsImportance: 'critical',
      reviewImportance: 'critical',
      avgReviewScore: 4.2,
      seasonality: [
        { month: 'janvier', demand: 'low' }, { month: 'fevrier', demand: 'medium' },
        { month: 'mars', demand: 'medium' }, { month: 'avril', demand: 'high' },
        { month: 'mai', demand: 'high' }, { month: 'juin', demand: 'high' },
        { month: 'juillet', demand: 'medium' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'high' },
        { month: 'novembre', demand: 'medium' }, { month: 'decembre', demand: 'high' },
      ],
    },
    business: {
      avgTicket: '18-35 EUR',
      avgMargin: '8-15%',
      clientRetentionRate: '30-40%',
      avgLifetimeValue: '250-600 EUR',
      peakHours: ['12h-14h', '19h30-21h30'],
      challenges: [
        'Cout des matieres premieres en hausse (+12% en 2 ans)',
        'Recrutement et retention du personnel de salle et cuisine',
        'Concurrence des plateformes de livraison (marges reduites)',
        'Gestion des avis negatifs en ligne',
        'Saisonnalite et gestion des periodes creuses',
      ],
      opportunities: [
        'Click & collect et vente a emporter (marge superieure)',
        'Evenements prives et privatisation',
        'Partenariats avec des influenceurs food locaux',
        'Programme de fidelite digital (carte dematerialisee)',
        'Brunch du week-end (segment en croissance +25%/an)',
      ],
    },
    prospection: {
      bestChannels: ['Google Maps', 'Instagram', 'TripAdvisor', 'TheFork'],
      avgConversionRate: '3-5%',
      coldEmailTemplateType: 'invitation_decouverte',
      referralPotential: 'high',
      partnershipOpportunities: ['Hotels proximite', 'Offices de tourisme', 'Entreprises (dejeuners)', 'Producteurs locaux', 'Applications de reservation'],
    },
    finance: {
      avgRevenue: '15000-45000 EUR/mois',
      mainCosts: ['Matieres premieres (28-35%)', 'Personnel (30-40%)', 'Loyer (8-15%)', 'Energie (3-5%)'],
      avgRentPercent: '8-15%',
      seasonalCashFlow: 'Creux en janvier et aout, pics en decembre et juin',
      taxObligations: ['TVA 10% (sur place)', 'TVA 5.5% (emporter)', 'CFE', 'Cotisations sociales', 'Taxe sur les salaires si >20 salaries'],
    },
  },

  // =========================================================================
  // 2. BOULANGERIE
  // =========================================================================
  {
    sector: 'boulangerie',
    aliases: ['boulangerie', 'patisserie', 'viennoiserie', 'boulanger', 'patissier'],
    marketing: {
      instagramEngagementRate: 4.5,
      tiktokEngagementRate: 7.8,
      emailOpenRate: 23.5,
      emailClickRate: 3.0,
      avgCostPerClick: 0.28,
      avgROAS: 6.1,
      bestPostingTimes: [
        { platform: 'instagram', days: ['mercredi', 'vendredi', 'samedi'], hours: ['7h30', '16h00'] },
        { platform: 'tiktok', days: ['mardi', 'jeudi', 'samedi'], hours: ['7h00', '17h00'] },
      ],
      topHashtags: ['#boulangerie', '#painmaison', '#artisan', '#patisserie', '#viennoiserie', '#croissant', '#faitmaison', '#baguette', '#levain', '#gourmandise'],
      contentIdeas: [
        'Timelapse de la fabrication du pain de A a Z (petrissage, levee, cuisson)',
        'Le reveil du boulanger a 3h du matin : immersion coulisses',
        'Tutorial : comment reconnaitre un vrai pain artisanal',
        'Presentation de la patisserie de la semaine en gros plan',
        'Challenge croissant : feuilletage en direct',
        'Visite du fournil avec explication des farines utilisees',
        'Le pain du mois : creation originale expliquee',
        'ASMR craquement de baguette a la sortie du four',
        'Recette exclusive d\'un cookie ou gateau signature',
        'Story sondage : quel pain voulez-vous demain ?',
        'Collaboration avec un apiculteur local (miel dans les viennoiseries)',
        'Avant/apres cuisson d\'une fournee de brioches',
      ],
      competitorCount: 'high',
    },
    seo: {
      avgMonthlySearches: '3000-20000',
      topKeywords: ['boulangerie [ville]', 'meilleure boulangerie [ville]', 'patisserie [ville]', 'boulangerie artisanale [ville]', 'pain au levain [ville]'],
      localSearchImportance: 'critical',
      googleMapsImportance: 'critical',
      reviewImportance: 'critical',
      avgReviewScore: 4.4,
      seasonality: [
        { month: 'janvier', demand: 'high' }, { month: 'fevrier', demand: 'medium' },
        { month: 'mars', demand: 'medium' }, { month: 'avril', demand: 'high' },
        { month: 'mai', demand: 'medium' }, { month: 'juin', demand: 'medium' },
        { month: 'juillet', demand: 'low' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'medium' },
        { month: 'novembre', demand: 'medium' }, { month: 'decembre', demand: 'high' },
      ],
    },
    business: {
      avgTicket: '4-8 EUR',
      avgMargin: '55-70%',
      clientRetentionRate: '60-75%',
      avgLifetimeValue: '800-2000 EUR',
      peakHours: ['7h-9h', '12h-13h', '16h30-18h30'],
      challenges: [
        'Hausse du prix des matieres premieres (farine +20%, beurre +30%)',
        'Recrutement de boulangers qualifies (metier en tension)',
        'Concurrence des terminaux de cuisson (supermarches)',
        'Couts energetiques eleves (fours)',
        'Horaires contraignants affectant la qualite de vie',
      ],
      opportunities: [
        'Snacking : sandwichs, salades, formules dejeuner',
        'Gamme bio et levain naturel (premium +30%)',
        'Commandes en ligne et click & collect',
        'Patisserie creative (reseaux sociaux, gateau personnalise)',
        'Traiteur evenementiel (mariages, entreprises)',
      ],
    },
    prospection: {
      bestChannels: ['Google Maps', 'Instagram', 'Bouche-a-oreille', 'Facebook local'],
      avgConversionRate: '8-12%',
      coldEmailTemplateType: 'decouverte_artisan',
      referralPotential: 'high',
      partnershipOpportunities: ['Restaurants (pain fourni)', 'Hotels', 'Epiceries fines', 'Marches locaux', 'Ecoles (gouters)'],
    },
    finance: {
      avgRevenue: '20000-50000 EUR/mois',
      mainCosts: ['Matieres premieres (25-30%)', 'Personnel (25-35%)', 'Loyer (5-10%)', 'Energie (5-8%)'],
      avgRentPercent: '5-10%',
      seasonalCashFlow: 'Creux en juillet-aout (vacances), pic a la Galette des Rois (janvier) et Noel',
      taxObligations: ['TVA 5.5% (pain, viennoiseries)', 'TVA 10% (sandwichs sur place)', 'CFE', 'Cotisations sociales'],
    },
  },

  // =========================================================================
  // 3. COIFFEUR
  // =========================================================================
  {
    sector: 'coiffeur',
    aliases: ['coiffeur', 'barbier', 'salon de coiffure', 'coiffeuse', 'barber shop', 'hair salon'],
    marketing: {
      instagramEngagementRate: 4.2,
      tiktokEngagementRate: 5.8,
      emailOpenRate: 20.3,
      emailClickRate: 2.5,
      avgCostPerClick: 0.42,
      avgROAS: 4.8,
      bestPostingTimes: [
        { platform: 'instagram', days: ['mardi', 'jeudi', 'samedi'], hours: ['10h00', '14h00'] },
        { platform: 'tiktok', days: ['mercredi', 'vendredi'], hours: ['12h00', '18h00'] },
      ],
      topHashtags: ['#coiffeur', '#hairstyle', '#coiffure', '#barbier', '#balayage', '#coloration', '#avantapres', '#haircut', '#salondecoiffure', '#cheveux'],
      contentIdeas: [
        'Avant/apres transformation coupe et couleur (timelapse)',
        'Tutorial coiffure express en 60 secondes',
        'Tendances coiffure de la saison avec mannequins clients',
        'Preparation produits coloration en gros plan (satisfying)',
        'Portrait collaborateur : son parcours, sa specialite',
        'Story sondage : coupe courte ou longue ?',
        'Conseils entretien cheveux selon le type (boucles, lisses, colores)',
        'Behind the scenes d\'une preparation mariee',
        'Comparaison tendances annee precedente vs cette annee',
        'Reel ASMR bruit des ciseaux et rasoir',
        'Nouveau produit : test en direct sur un client volontaire',
        'Challenge transformation la plus spectaculaire du mois',
      ],
      competitorCount: 'high',
    },
    seo: {
      avgMonthlySearches: '3000-30000',
      topKeywords: ['coiffeur [ville]', 'barbier [ville]', 'salon de coiffure [ville]', 'balayage [ville]', 'coiffeur pas cher [ville]', 'coiffeur homme [ville]'],
      localSearchImportance: 'critical',
      googleMapsImportance: 'critical',
      reviewImportance: 'critical',
      avgReviewScore: 4.3,
      seasonality: [
        { month: 'janvier', demand: 'medium' }, { month: 'fevrier', demand: 'medium' },
        { month: 'mars', demand: 'medium' }, { month: 'avril', demand: 'high' },
        { month: 'mai', demand: 'high' }, { month: 'juin', demand: 'high' },
        { month: 'juillet', demand: 'low' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'medium' },
        { month: 'novembre', demand: 'medium' }, { month: 'decembre', demand: 'high' },
      ],
    },
    business: {
      avgTicket: '25-55 EUR',
      avgMargin: '40-55%',
      clientRetentionRate: '50-65%',
      avgLifetimeValue: '400-1200 EUR',
      peakHours: ['10h-12h', '14h-18h'],
      challenges: [
        'Fidelisation face a la concurrence (1 coiffeur pour 900 habitants)',
        'No-shows et annulations derniere minute',
        'Recrutement de coiffeurs qualifies',
        'Pression tarifaire des chaines low-cost',
        'Mise a jour constante des tendances et formations',
      ],
      opportunities: [
        'Reservation en ligne (Planity, Treatwell) — 40% des RDV',
        'Vente de produits capillaires (marge 50-60%)',
        'Offres packages (coupe + soin + coloration)',
        'Espace barbier/barber shop (segment en croissance)',
        'Programme fidelite (10e coupe offerte)',
      ],
    },
    prospection: {
      bestChannels: ['Instagram', 'Google Maps', 'Planity/Treatwell', 'Facebook local'],
      avgConversionRate: '5-8%',
      coldEmailTemplateType: 'offre_decouverte',
      referralPotential: 'high',
      partnershipOpportunities: ['Instituts de beaute', 'Photographes (shooting)', 'Mariages (prestataire)', 'Ecoles de coiffure', 'Marques capillaires'],
    },
    finance: {
      avgRevenue: '8000-25000 EUR/mois',
      mainCosts: ['Personnel (40-50%)', 'Produits (10-15%)', 'Loyer (10-15%)', 'Charges sociales (20-25%)'],
      avgRentPercent: '10-15%',
      seasonalCashFlow: 'Pic en juin (mariages) et decembre (fetes), creux juillet-aout',
      taxObligations: ['TVA 20%', 'CFE', 'Cotisations TNS ou regime general', 'Formation continue obligatoire'],
    },
  },

  // =========================================================================
  // 4. BOUTIQUE
  // =========================================================================
  {
    sector: 'boutique',
    aliases: ['boutique', 'pret-a-porter', 'mode', 'vetements', 'magasin', 'concept store', 'accessoires'],
    marketing: {
      instagramEngagementRate: 3.2,
      tiktokEngagementRate: 5.4,
      emailOpenRate: 18.4,
      emailClickRate: 2.3,
      avgCostPerClick: 0.55,
      avgROAS: 3.8,
      bestPostingTimes: [
        { platform: 'instagram', days: ['mardi', 'jeudi', 'samedi'], hours: ['10h00', '19h00'] },
        { platform: 'tiktok', days: ['mercredi', 'vendredi', 'dimanche'], hours: ['11h00', '20h00'] },
      ],
      topHashtags: ['#mode', '#fashion', '#ootd', '#boutique', '#pretaporter', '#lookdujour', '#style', '#shopping', '#nouvellecolection', '#madeinfrance'],
      contentIdeas: [
        'Try-on haul des nouveautes de la semaine',
        'Look du jour porte par une vendeuse ou cliente',
        'Deballage d\'une nouvelle collection en direct',
        '3 facons de porter une meme piece',
        'Shopping avec moi : visite guidee de la boutique',
        'Conseil style : comment assortir les couleurs de saison',
        'Behind the scenes d\'un shooting en boutique',
        'Comparaison look casual vs habille avec les memes basiques',
        'Sondage story : quelle tenue pour un rendez-vous ?',
        'Coup de coeur de la semaine presente par l\'equipe',
        'Interview client : pourquoi cette piece, comment il/elle la porte',
        'Transformation : relooking client en 60 secondes',
      ],
      competitorCount: 'high',
    },
    seo: {
      avgMonthlySearches: '2000-15000',
      topKeywords: ['boutique vetements [ville]', 'pret a porter [ville]', 'mode femme [ville]', 'concept store [ville]', 'boutique homme [ville]'],
      localSearchImportance: 'high',
      googleMapsImportance: 'high',
      reviewImportance: 'high',
      avgReviewScore: 4.3,
      seasonality: [
        { month: 'janvier', demand: 'high' }, { month: 'fevrier', demand: 'low' },
        { month: 'mars', demand: 'medium' }, { month: 'avril', demand: 'medium' },
        { month: 'mai', demand: 'medium' }, { month: 'juin', demand: 'high' },
        { month: 'juillet', demand: 'high' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'medium' },
        { month: 'novembre', demand: 'high' }, { month: 'decembre', demand: 'high' },
      ],
    },
    business: {
      avgTicket: '35-80 EUR',
      avgMargin: '50-65%',
      clientRetentionRate: '25-40%',
      avgLifetimeValue: '300-900 EUR',
      peakHours: ['10h-12h', '14h-18h30', 'samedi 10h-19h'],
      challenges: [
        'Concurrence e-commerce (Zara, H&M, Shein)',
        'Gestion des stocks et invendus (demarque 20-40%)',
        'Fidelisation face a la volatilite des tendances',
        'Pression sur les marges (prix d\'achat en hausse)',
        'Loyers commerciaux eleves en centre-ville',
      ],
      opportunities: [
        'E-commerce complementaire (Instagram Shopping, site web)',
        'Evenements en boutique (ventes privees, ateliers)',
        'Seconde main et consignment (tendance eco-responsable)',
        'Personal shopping et conseils personnalises',
        'Collaborations avec des createurs locaux',
      ],
    },
    prospection: {
      bestChannels: ['Instagram', 'Facebook Ads', 'Google Shopping', 'Bouche-a-oreille'],
      avgConversionRate: '2-4%',
      coldEmailTemplateType: 'vente_privee_exclusive',
      referralPotential: 'medium',
      partnershipOpportunities: ['Influenceurs mode locaux', 'Coiffeurs/estheticiennes', 'Evenements locaux', 'Hotels', 'Wedding planners'],
    },
    finance: {
      avgRevenue: '10000-35000 EUR/mois',
      mainCosts: ['Achats marchandises (35-45%)', 'Loyer (12-18%)', 'Personnel (15-25%)', 'Communication (3-5%)'],
      avgRentPercent: '12-18%',
      seasonalCashFlow: 'Pics en janvier (soldes), juin-juillet (soldes), novembre (Black Friday), decembre (Noel)',
      taxObligations: ['TVA 20%', 'CFE', 'Taxe sur les surfaces commerciales (>400m2)', 'Cotisations sociales'],
    },
  },

  // =========================================================================
  // 5. CAVISTE
  // =========================================================================
  {
    sector: 'caviste',
    aliases: ['caviste', 'cave a vin', 'bar a vin', 'wine shop', 'epicerie fine vins'],
    marketing: {
      instagramEngagementRate: 4.8,
      tiktokEngagementRate: 5.1,
      emailOpenRate: 22.8,
      emailClickRate: 3.2,
      avgCostPerClick: 0.38,
      avgROAS: 5.5,
      bestPostingTimes: [
        { platform: 'instagram', days: ['jeudi', 'vendredi', 'samedi'], hours: ['17h00', '19h00'] },
        { platform: 'tiktok', days: ['vendredi', 'samedi'], hours: ['18h00', '20h00'] },
      ],
      topHashtags: ['#vin', '#caviste', '#wine', '#degustation', '#vinrouge', '#vinbio', '#winelover', '#vignoble', '#terroir', '#accords'],
      contentIdeas: [
        'Degustation commentee d\'un vin de la semaine en 60s',
        'Accord mets-vins : quel vin avec quel plat (carrousel)',
        'Visite d\'un domaine viticole partenaire',
        'Explication d\'une appellation en langage simple',
        'Blind test : vin a 8EUR vs vin a 30EUR',
        'Deballage d\'un nouvel arrivage avec enthousiasme',
        'Les 5 erreurs a eviter quand on choisit un vin',
        'Portrait d\'un vigneron partenaire',
        'Story sondage : rouge, blanc ou rose ce week-end ?',
        'Idees cadeaux vin pour chaque budget',
        'Evenement degustation : recap video des participants',
        'Comment lire une etiquette de vin en 30 secondes',
      ],
      competitorCount: 'medium',
    },
    seo: {
      avgMonthlySearches: '1000-8000',
      topKeywords: ['caviste [ville]', 'cave a vin [ville]', 'vin bio [ville]', 'degustation vin [ville]', 'bar a vin [ville]'],
      localSearchImportance: 'critical',
      googleMapsImportance: 'critical',
      reviewImportance: 'high',
      avgReviewScore: 4.5,
      seasonality: [
        { month: 'janvier', demand: 'low' }, { month: 'fevrier', demand: 'low' },
        { month: 'mars', demand: 'medium' }, { month: 'avril', demand: 'medium' },
        { month: 'mai', demand: 'medium' }, { month: 'juin', demand: 'high' },
        { month: 'juillet', demand: 'medium' }, { month: 'aout', demand: 'medium' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'medium' },
        { month: 'novembre', demand: 'high' }, { month: 'decembre', demand: 'high' },
      ],
    },
    business: {
      avgTicket: '15-35 EUR',
      avgMargin: '30-45%',
      clientRetentionRate: '45-60%',
      avgLifetimeValue: '500-1500 EUR',
      peakHours: ['17h-20h', 'samedi 10h-19h'],
      challenges: [
        'Concurrence grande distribution (60% des ventes de vin)',
        'Fiscalite complexe (droits d\'accises)',
        'Education du client (vin naturel, bio, biodynamique)',
        'Gestion des stocks (rotation, conservation)',
        'Ventes en ligne face aux pure players (Vinatis, etc.)',
      ],
      opportunities: [
        'Evenements degustation (revenus complementaires, fidelisation)',
        'Box vin mensuelle par abonnement',
        'Vente en ligne et livraison locale',
        'Partenariat restaurants (selection de vins)',
        'Oenotourisme et visites de domaines organisees',
      ],
    },
    prospection: {
      bestChannels: ['Instagram', 'Google Maps', 'Evenements degustation', 'Newsletter'],
      avgConversionRate: '6-10%',
      coldEmailTemplateType: 'invitation_degustation',
      referralPotential: 'high',
      partnershipOpportunities: ['Restaurants', 'Traiteurs', 'Hotels', 'Domaines viticoles', 'Fromageries'],
    },
    finance: {
      avgRevenue: '8000-25000 EUR/mois',
      mainCosts: ['Achats vins (50-60%)', 'Loyer (8-12%)', 'Personnel (10-20%)', 'Evenements (3-5%)'],
      avgRentPercent: '8-12%',
      seasonalCashFlow: 'Pic en novembre-decembre (fetes), pic secondaire en juin (ete), creux janvier-fevrier',
      taxObligations: ['TVA 20%', 'Droits d\'accises sur alcools', 'CFE', 'Licence de vente a emporter'],
    },
  },

  // =========================================================================
  // 6. FLEURISTE
  // =========================================================================
  {
    sector: 'fleuriste',
    aliases: ['fleuriste', 'jardinerie', 'fleurs', 'flower shop'],
    marketing: {
      instagramEngagementRate: 5.2,
      tiktokEngagementRate: 6.5,
      emailOpenRate: 21.4,
      emailClickRate: 2.7,
      avgCostPerClick: 0.32,
      avgROAS: 5.8,
      bestPostingTimes: [
        { platform: 'instagram', days: ['lundi', 'mercredi', 'vendredi'], hours: ['9h00', '17h00'] },
        { platform: 'tiktok', days: ['mardi', 'jeudi', 'samedi'], hours: ['10h00', '18h00'] },
      ],
      topHashtags: ['#fleuriste', '#bouquet', '#fleurs', '#flowerstagram', '#artfloral', '#mariage', '#bouquetdujour', '#fleursdesaison', '#roses', '#livraison'],
      contentIdeas: [
        'Composition d\'un bouquet de A a Z en timelapse',
        'Signification des fleurs : que dit chaque couleur de rose',
        'Arrivage du matin au marche aux fleurs (Rungis ou local)',
        'Tuto couronne de fleurs ou centre de table DIY',
        'Avant/apres decoration florale pour un mariage',
        'Les 5 fleurs de saison du mois et comment les entretenir',
        'Story sondage : bouquet rond ou champetre ?',
        'Preparation d\'une commande speciale (derriere les coulisses)',
        'Conseil entretien : comment garder ses fleurs fraiches 10 jours',
        'Bouquet du vendredi : creation unique de la semaine',
        'Collaboration avec un photographe (shooting floral)',
        'Recap video d\'une decoration evenementielle complete',
      ],
      competitorCount: 'medium',
    },
    seo: {
      avgMonthlySearches: '2000-15000',
      topKeywords: ['fleuriste [ville]', 'livraison fleurs [ville]', 'bouquet de fleurs [ville]', 'fleuriste mariage [ville]', 'roses [ville]'],
      localSearchImportance: 'critical',
      googleMapsImportance: 'critical',
      reviewImportance: 'high',
      avgReviewScore: 4.5,
      seasonality: [
        { month: 'janvier', demand: 'low' }, { month: 'fevrier', demand: 'high' },
        { month: 'mars', demand: 'medium' }, { month: 'avril', demand: 'medium' },
        { month: 'mai', demand: 'high' }, { month: 'juin', demand: 'high' },
        { month: 'juillet', demand: 'low' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'medium' },
        { month: 'novembre', demand: 'high' }, { month: 'decembre', demand: 'medium' },
      ],
    },
    business: {
      avgTicket: '25-50 EUR',
      avgMargin: '50-65%',
      clientRetentionRate: '30-45%',
      avgLifetimeValue: '200-600 EUR',
      peakHours: ['9h-12h', '15h-18h'],
      challenges: [
        'Perissabilite des produits (perte 15-25%)',
        'Concurrence des plateformes en ligne (Interflora, Bloom&Wild)',
        'Gestion des pics d\'activite (Saint-Valentin, Fete des Meres)',
        'Approvisionnement et variabilite des prix (saisonnier)',
        'Recrutement de fleuristes qualifies',
      ],
      opportunities: [
        'Abonnements floraux (hebdomadaire/mensuel pour entreprises)',
        'Decoration evenementielle (mariages = 30-40% du CA pour certains)',
        'Livraison locale rapide (meme jour)',
        'Ateliers composition florale (revenus + fidelisation)',
        'Fleurs sechees et compositions durables (marge superieure)',
      ],
    },
    prospection: {
      bestChannels: ['Instagram', 'Google Maps', 'Bouche-a-oreille', 'Partenariats mariages'],
      avgConversionRate: '5-8%',
      coldEmailTemplateType: 'offre_abonnement_fleurs',
      referralPotential: 'high',
      partnershipOpportunities: ['Wedding planners', 'Hotels', 'Restaurants', 'Entreprises (accueil)', 'Pompes funebres'],
    },
    finance: {
      avgRevenue: '8000-22000 EUR/mois',
      mainCosts: ['Achats fleurs (35-45%)', 'Personnel (20-30%)', 'Loyer (10-15%)', 'Vehicule livraison (3-5%)'],
      avgRentPercent: '10-15%',
      seasonalCashFlow: 'Pics majeurs : Saint-Valentin (fevrier), Fete des Meres (mai), Toussaint (novembre). Creux : juillet-aout',
      taxObligations: ['TVA 10% (fleurs coupees)', 'TVA 20% (compositions, accessoires)', 'CFE', 'Cotisations sociales'],
    },
  },

  // =========================================================================
  // 7. COACH
  // =========================================================================
  {
    sector: 'coach',
    aliases: ['coach sportif', 'salle de sport', 'fitness', 'yoga', 'pilates', 'crossfit', 'personal trainer', 'salle de fitness'],
    marketing: {
      instagramEngagementRate: 4.6,
      tiktokEngagementRate: 7.2,
      emailOpenRate: 21.5,
      emailClickRate: 2.9,
      avgCostPerClick: 0.48,
      avgROAS: 4.2,
      bestPostingTimes: [
        { platform: 'instagram', days: ['lundi', 'mercredi', 'vendredi'], hours: ['7h00', '18h00'] },
        { platform: 'tiktok', days: ['lundi', 'mercredi', 'samedi'], hours: ['6h30', '19h00'] },
      ],
      topHashtags: ['#fitness', '#coaching', '#musculation', '#yoga', '#sport', '#transformation', '#motivation', '#workout', '#entrainement', '#sante'],
      contentIdeas: [
        'Transformation client avant/apres (avec temoignage)',
        'Exercice du jour : technique correcte vs erreur courante',
        'Routine d\'echauffement en 5 minutes a reproduire',
        'Un jour dans la vie d\'un coach sportif',
        'Challenge 30 jours : exercice quotidien',
        'Repas healthy de la semaine (prep meal)',
        'Mythes fitness demystifies (spot reduction, etc.)',
        'Entrainement express 15 minutes sans materiel',
        'Story sondage : leg day ou upper body ?',
        'Temoignage client video (parcours, resultats, ressenti)',
        'Conseils nutrition pre et post-entrainement',
        'Visite de la salle / espace de coaching',
      ],
      competitorCount: 'high',
    },
    seo: {
      avgMonthlySearches: '3000-25000',
      topKeywords: ['coach sportif [ville]', 'salle de sport [ville]', 'cours de yoga [ville]', 'personal trainer [ville]', 'fitness [ville]', 'pilates [ville]'],
      localSearchImportance: 'high',
      googleMapsImportance: 'high',
      reviewImportance: 'high',
      avgReviewScore: 4.6,
      seasonality: [
        { month: 'janvier', demand: 'high' }, { month: 'fevrier', demand: 'high' },
        { month: 'mars', demand: 'high' }, { month: 'avril', demand: 'high' },
        { month: 'mai', demand: 'medium' }, { month: 'juin', demand: 'medium' },
        { month: 'juillet', demand: 'low' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'medium' },
        { month: 'novembre', demand: 'medium' }, { month: 'decembre', demand: 'low' },
      ],
    },
    business: {
      avgTicket: '40-70 EUR (seance individuelle)',
      avgMargin: '60-75%',
      clientRetentionRate: '35-50%',
      avgLifetimeValue: '600-2500 EUR',
      peakHours: ['7h-9h', '12h-13h30', '17h30-20h'],
      challenges: [
        'Retention : 50% des inscrits abandonnent avant 6 mois',
        'Concurrence des apps fitness (Peloton, Nike Training)',
        'Saisonnalite forte (pic janvier, creux ete)',
        'Gestion des annulations de derniere minute',
        'Fatigue physique et risque de blessure du coach',
      ],
      opportunities: [
        'Coaching en ligne / hybride (scalabilite)',
        'Programmes nutrition associes (upsell)',
        'Coaching en entreprise (bien-etre au travail)',
        'Cours en petits groupes (marge superieure vs individuel)',
        'Retraites et stages weekend',
      ],
    },
    prospection: {
      bestChannels: ['Instagram', 'TikTok', 'Bouche-a-oreille', 'Google Maps', 'Partenariats entreprises'],
      avgConversionRate: '4-7%',
      coldEmailTemplateType: 'seance_decouverte_offerte',
      referralPotential: 'high',
      partnershipOpportunities: ['Nutritionnistes', 'Kinesitherapeutes', 'Entreprises (CE)', 'Magasins sport', 'Marques de complements'],
    },
    finance: {
      avgRevenue: '3000-12000 EUR/mois (independant) ou 15000-40000 EUR/mois (salle)',
      mainCosts: ['Loyer/local (15-25%)', 'Equipement (5-10%)', 'Assurance RC Pro (2-3%)', 'Marketing (5-10%)'],
      avgRentPercent: '15-25%',
      seasonalCashFlow: 'Pic janvier-mars (bonnes resolutions), creux juillet-aout, reprise septembre',
      taxObligations: ['TVA 20%', 'CFE', 'Micro-BNC ou regime reel', 'Assurance RC Pro obligatoire', 'Carte professionnelle DDCS'],
    },
  },

  // =========================================================================
  // 8. ESTHETIQUE
  // =========================================================================
  {
    sector: 'esthetique',
    aliases: ['institut de beaute', 'spa', 'estheticienne', 'manucure', 'onglerie', 'soins du visage', 'epilation', 'massage'],
    marketing: {
      instagramEngagementRate: 4.4,
      tiktokEngagementRate: 6.0,
      emailOpenRate: 19.6,
      emailClickRate: 2.1,
      avgCostPerClick: 0.45,
      avgROAS: 4.5,
      bestPostingTimes: [
        { platform: 'instagram', days: ['mardi', 'jeudi', 'samedi'], hours: ['10h00', '14h00'] },
        { platform: 'tiktok', days: ['mercredi', 'vendredi', 'dimanche'], hours: ['12h00', '19h00'] },
      ],
      topHashtags: ['#beaute', '#esthetique', '#spa', '#soin', '#manucure', '#nailart', '#skincare', '#massage', '#bienetre', '#institutdebeaute'],
      contentIdeas: [
        'Avant/apres soin visage (gros plan, resultat immediat)',
        'ASMR massage ou soin en cabine',
        'Tutorial skincare routine du matin en 60 secondes',
        'Presentation d\'un nouveau soin ou appareil',
        'Nail art du jour : creation artistique en timelapse',
        'Les 5 erreurs skincare les plus courantes',
        'Ambiance spa : visite en video calme et apaisante',
        'Temoignage client sur un traitement (vergetures, acne, etc.)',
        'Sondage story : vernis classique ou semi-permanent ?',
        'Explication d\'un soin specifique (microneedling, LED, etc.)',
        'Carte cadeau : idee cadeau parfaite en video',
        'Journee type d\'une estheticienne (coulisses)',
      ],
      competitorCount: 'high',
    },
    seo: {
      avgMonthlySearches: '2000-20000',
      topKeywords: ['institut de beaute [ville]', 'spa [ville]', 'manucure [ville]', 'epilation laser [ville]', 'massage [ville]', 'soin visage [ville]'],
      localSearchImportance: 'critical',
      googleMapsImportance: 'critical',
      reviewImportance: 'critical',
      avgReviewScore: 4.4,
      seasonality: [
        { month: 'janvier', demand: 'medium' }, { month: 'fevrier', demand: 'medium' },
        { month: 'mars', demand: 'high' }, { month: 'avril', demand: 'high' },
        { month: 'mai', demand: 'high' }, { month: 'juin', demand: 'high' },
        { month: 'juillet', demand: 'medium' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'medium' },
        { month: 'novembre', demand: 'medium' }, { month: 'decembre', demand: 'high' },
      ],
    },
    business: {
      avgTicket: '30-80 EUR',
      avgMargin: '50-65%',
      clientRetentionRate: '45-60%',
      avgLifetimeValue: '500-1500 EUR',
      peakHours: ['10h-12h', '14h-18h', 'samedi toute la journee'],
      challenges: [
        'Fidelisation et concurrence accrue',
        'Investissements en equipements (laser, appareils haute techno)',
        'Recrutement d\'estheticiennes diplomes',
        'Reglementation stricte (hygiene, normes)',
        'No-shows (10-15% des RDV)',
      ],
      opportunities: [
        'Vente de produits de soin (marge 45-60%)',
        'Forfaits et abonnements (revenus recurrents)',
        'Cures saisonnieres (anti-age, minceur)',
        'Soins hommes (segment en croissance +15%/an)',
        'Technologies innovantes (lumiere pulsee, cryotherapie)',
      ],
    },
    prospection: {
      bestChannels: ['Instagram', 'Google Maps', 'Planity/Treatwell', 'Facebook Ads'],
      avgConversionRate: '5-8%',
      coldEmailTemplateType: 'offre_soin_decouverte',
      referralPotential: 'high',
      partnershipOpportunities: ['Coiffeurs', 'Pharmacies', 'Medecins esthetiques', 'Hotels/spas', 'Marques cosmetiques'],
    },
    finance: {
      avgRevenue: '6000-20000 EUR/mois',
      mainCosts: ['Personnel (35-45%)', 'Produits (15-20%)', 'Loyer (10-15%)', 'Equipements (amortissement 5-10%)'],
      avgRentPercent: '10-15%',
      seasonalCashFlow: 'Pics avant ete (epilation, minceur) et Noel (cartes cadeaux). Creux aout',
      taxObligations: ['TVA 20%', 'CFE', 'Cotisations sociales', 'Formation continue', 'Normes hygiene (ARS)'],
    },
  },

  // =========================================================================
  // 9. IMMOBILIER
  // =========================================================================
  {
    sector: 'immobilier',
    aliases: ['agence immobiliere', 'agent immobilier', 'immobilier', 'mandataire immobilier', 'gestion locative'],
    marketing: {
      instagramEngagementRate: 2.8,
      tiktokEngagementRate: 4.5,
      emailOpenRate: 19.8,
      emailClickRate: 2.4,
      avgCostPerClick: 1.20,
      avgROAS: 8.5,
      bestPostingTimes: [
        { platform: 'instagram', days: ['mardi', 'jeudi', 'samedi'], hours: ['9h00', '18h00'] },
        { platform: 'tiktok', days: ['mercredi', 'vendredi'], hours: ['12h00', '19h00'] },
      ],
      topHashtags: ['#immobilier', '#realestate', '#appartement', '#maison', '#achat', '#vente', '#investissement', '#agenceimmobiliere', '#visite', '#homesweethome'],
      contentIdeas: [
        'Visite virtuelle d\'un bien en vente (storytelling)',
        'Avant/apres home staging d\'un appartement',
        'Quartier de la semaine : avantages, commerces, ambiance',
        'Conseils premiers acheteurs : les 5 pieges a eviter',
        'Timelapse d\'un amenagement ou renovation',
        'Actu marche immobilier local (prix m2, tendances)',
        'Temoignage client : "Comment j\'ai trouve ma maison"',
        'Les 3 criteres les plus importants selon les acheteurs',
        'Behind the scenes d\'une signature chez le notaire',
        'Comparaison : louer vs acheter dans votre ville',
        'Investissement locatif : calcul rentabilite en 60 secondes',
        'Story sondage : maison ou appartement ?',
      ],
      competitorCount: 'high',
    },
    seo: {
      avgMonthlySearches: '10000-100000',
      topKeywords: ['agence immobiliere [ville]', 'appartement a vendre [ville]', 'maison a vendre [ville]', 'location [ville]', 'estimation immobiliere [ville]'],
      localSearchImportance: 'critical',
      googleMapsImportance: 'high',
      reviewImportance: 'high',
      avgReviewScore: 4.1,
      seasonality: [
        { month: 'janvier', demand: 'medium' }, { month: 'fevrier', demand: 'medium' },
        { month: 'mars', demand: 'high' }, { month: 'avril', demand: 'high' },
        { month: 'mai', demand: 'high' }, { month: 'juin', demand: 'high' },
        { month: 'juillet', demand: 'medium' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'high' },
        { month: 'novembre', demand: 'medium' }, { month: 'decembre', demand: 'low' },
      ],
    },
    business: {
      avgTicket: '5000-15000 EUR (commission)',
      avgMargin: '70-85%',
      clientRetentionRate: '15-25%',
      avgLifetimeValue: '8000-25000 EUR',
      peakHours: ['9h-12h', '14h-19h', 'samedi 9h-17h'],
      challenges: [
        'Concurrence des plateformes (SeLoger, LeBonCoin, PAP)',
        'Cycle de vente long (3-6 mois)',
        'Dependance au marche immobilier et taux d\'interet',
        'Gestion de la reputation en ligne (avis negatifs impactants)',
        'Reglementation en evolution (DPE, loi Climat)',
      ],
      opportunities: [
        'Visite virtuelle 3D et video drone (differenciation)',
        'Specialisation de niche (luxe, investissement, neuf)',
        'Content marketing (blog immobilier = SEO long terme)',
        'Gestion locative (revenus recurrents)',
        'Home staging (service additionnel a forte valeur)',
      ],
    },
    prospection: {
      bestChannels: ['SeLoger/LeBonCoin', 'Google Ads', 'Prospection terrain', 'Reseau/recommandation'],
      avgConversionRate: '1-3%',
      coldEmailTemplateType: 'estimation_gratuite',
      referralPotential: 'medium',
      partnershipOpportunities: ['Notaires', 'Courtiers credit', 'Artisans renovation', 'Decorateurs', 'Demenageurs'],
    },
    finance: {
      avgRevenue: '5000-30000 EUR/mois (variable selon transactions)',
      mainCosts: ['Loyer agence (8-12%)', 'Portails annonces (5-10%)', 'Personnel (30-40%)', 'Marketing (10-15%)'],
      avgRentPercent: '8-12%',
      seasonalCashFlow: 'Tres variable, pic au printemps et septembre, creux en aout et decembre. Tresorerie a lisser sur 12 mois.',
      taxObligations: ['TVA 20% (sur honoraires)', 'CFE', 'Carte professionnelle T (CCI)', 'Garantie financiere', 'RC Pro obligatoire'],
    },
  },

  // =========================================================================
  // 10. ARTISAN
  // =========================================================================
  {
    sector: 'artisan',
    aliases: ['plombier', 'electricien', 'menuisier', 'peintre', 'artisan', 'chauffagiste', 'serrurier', 'carreleur', 'macon', 'couvreur'],
    marketing: {
      instagramEngagementRate: 3.5,
      tiktokEngagementRate: 8.1,
      emailOpenRate: 23.2,
      emailClickRate: 3.1,
      avgCostPerClick: 1.80,
      avgROAS: 7.5,
      bestPostingTimes: [
        { platform: 'instagram', days: ['mardi', 'jeudi'], hours: ['7h00', '18h00'] },
        { platform: 'tiktok', days: ['lundi', 'mercredi', 'vendredi'], hours: ['12h00', '19h00'] },
      ],
      topHashtags: ['#artisan', '#renovation', '#bricolage', '#travaux', '#avantapres', '#plombier', '#electricien', '#menuisier', '#chantier', '#madeinfrance'],
      contentIdeas: [
        'Avant/apres spectaculaire d\'une renovation (split screen)',
        'Timelapse d\'un chantier complet de A a Z',
        'Erreur DIY courante et comment la corriger (educatif)',
        'Outils du jour : a quoi sert cet outil ?',
        'Urgence plomberie : geste a faire en attendant l\'artisan',
        'Journee type sur un chantier (coulisses authentiques)',
        'Conseil entretien maison saisonnier',
        'Transformation piece par piece avec commentaire',
        'Rencontre avec l\'equipe : portrait de chaque artisan',
        'Comparaison materiaux : lequel choisir et pourquoi',
        'Story quiz : devinez le prix de ce chantier',
        'Temoignage client satisfait avec visite du resultat',
      ],
      competitorCount: 'medium',
    },
    seo: {
      avgMonthlySearches: '5000-40000',
      topKeywords: ['plombier [ville]', 'electricien [ville]', 'renovation [ville]', 'artisan [ville]', 'depannage [urgence] [ville]'],
      localSearchImportance: 'critical',
      googleMapsImportance: 'critical',
      reviewImportance: 'critical',
      avgReviewScore: 4.3,
      seasonality: [
        { month: 'janvier', demand: 'medium' }, { month: 'fevrier', demand: 'medium' },
        { month: 'mars', demand: 'high' }, { month: 'avril', demand: 'high' },
        { month: 'mai', demand: 'high' }, { month: 'juin', demand: 'high' },
        { month: 'juillet', demand: 'medium' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'high' },
        { month: 'novembre', demand: 'medium' }, { month: 'decembre', demand: 'medium' },
      ],
    },
    business: {
      avgTicket: '150-3000 EUR',
      avgMargin: '25-40%',
      clientRetentionRate: '40-55%',
      avgLifetimeValue: '1000-5000 EUR',
      peakHours: ['8h-12h', '14h-17h'],
      challenges: [
        'Concurrence deloyale (travail au noir, auto-entrepreneurs low-cost)',
        'Difficulte de recrutement (metiers en tension)',
        'Gestion administrative lourde (devis, factures, assurances)',
        'Hausse du prix des materiaux (+15-30%)',
        'Arnaques aux depannages nuit a l\'image du secteur',
      ],
      opportunities: [
        'Renovation energetique (MaPrimeRenov, CEE = volume)',
        'Label RGE (acces aux aides, confiance client)',
        'Avis Google = levier acquisition principal',
        'Devis en ligne (differenciation, rapidite)',
        'Contrats d\'entretien annuels (revenus recurrents)',
      ],
    },
    prospection: {
      bestChannels: ['Google Maps', 'Google Ads (urgences)', 'Bouche-a-oreille', 'PagesJaunes'],
      avgConversionRate: '8-15%',
      coldEmailTemplateType: 'contrat_entretien',
      referralPotential: 'high',
      partnershipOpportunities: ['Agences immobilieres', 'Syndics de copropriete', 'Architectes', 'Magasins bricolage', 'Assurances habitation'],
    },
    finance: {
      avgRevenue: '5000-20000 EUR/mois',
      mainCosts: ['Materiaux (30-40%)', 'Vehicule et carburant (8-12%)', 'Assurances (5-8%)', 'Outillage (3-5%)'],
      avgRentPercent: '3-6%',
      seasonalCashFlow: 'Pic au printemps (mars-juin) et rentrée (sept-oct). Creux en aout et decembre.',
      taxObligations: ['TVA 10% (renovation logement >2 ans)', 'TVA 20% (neuf)', 'CFE', 'Assurance decennale obligatoire', 'Cotisations artisan'],
    },
  },

  // =========================================================================
  // 11. AUTO
  // =========================================================================
  {
    sector: 'auto',
    aliases: ['garage', 'carrossier', 'auto-ecole', 'lavage auto', 'mecanicien', 'garagiste', 'controle technique', 'pneus'],
    marketing: {
      instagramEngagementRate: 3.0,
      tiktokEngagementRate: 5.8,
      emailOpenRate: 17.9,
      emailClickRate: 2.0,
      avgCostPerClick: 0.85,
      avgROAS: 5.0,
      bestPostingTimes: [
        { platform: 'instagram', days: ['mardi', 'jeudi'], hours: ['8h00', '17h00'] },
        { platform: 'tiktok', days: ['mercredi', 'vendredi', 'samedi'], hours: ['12h00', '18h00'] },
      ],
      topHashtags: ['#garage', '#mecanique', '#voiture', '#reparation', '#carrosserie', '#autoecole', '#permis', '#entretien', '#auto', '#detailing'],
      contentIdeas: [
        'Avant/apres reparation carrosserie (transformation satisfying)',
        'Les 5 signes que vos freins doivent etre changes',
        'Timelapse d\'un polissage/detailing complet',
        'Erreurs d\'entretien courantes a eviter',
        'Controle technique : ce qu\'on verifie (educatif)',
        'Decouverte sous le capot : explication pour debutants',
        'Reel "ce qu\'on a trouve dans cette voiture" (surprises)',
        'Conseil saisonnier : preparer sa voiture pour l\'hiver/l\'ete',
        'Pneu creve ? Tuto changement en 2 minutes',
        'L\'evolution du garage : avant/apres renovation atelier',
        'Permis accelere : journee type d\'un eleve auto-ecole',
        'Quiz story : devinez la panne a partir du bruit',
      ],
      competitorCount: 'medium',
    },
    seo: {
      avgMonthlySearches: '3000-30000',
      topKeywords: ['garage [ville]', 'mecanicien [ville]', 'controle technique [ville]', 'auto-ecole [ville]', 'carrossier [ville]', 'pneus pas cher [ville]'],
      localSearchImportance: 'critical',
      googleMapsImportance: 'critical',
      reviewImportance: 'critical',
      avgReviewScore: 4.1,
      seasonality: [
        { month: 'janvier', demand: 'medium' }, { month: 'fevrier', demand: 'medium' },
        { month: 'mars', demand: 'high' }, { month: 'avril', demand: 'high' },
        { month: 'mai', demand: 'medium' }, { month: 'juin', demand: 'high' },
        { month: 'juillet', demand: 'medium' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'high' },
        { month: 'novembre', demand: 'medium' }, { month: 'decembre', demand: 'medium' },
      ],
    },
    business: {
      avgTicket: '80-500 EUR',
      avgMargin: '30-45%',
      clientRetentionRate: '50-65%',
      avgLifetimeValue: '1200-4000 EUR',
      peakHours: ['8h-12h', '14h-18h'],
      challenges: [
        'Transition vers le vehicule electrique (formation, equipement)',
        'Concurrence des centres auto (Norauto, Midas, Feu Vert)',
        'Complexite croissante de l\'electronique embarquee',
        'Image negative du secteur (mefiance sur les prix)',
        'Recrutement de mecaniciens qualifies',
      ],
      opportunities: [
        'Entretien vehicules electriques et hybrides (niche)',
        'Forfaits entretien transparents (confiance)',
        'Avis Google = acquisition principale (92% consultent avant)',
        'Service de navette ou vehicule de pret',
        'Partenariats flottes entreprises et VTC',
      ],
    },
    prospection: {
      bestChannels: ['Google Maps', 'Google Ads', 'Bouche-a-oreille', 'Facebook local'],
      avgConversionRate: '5-10%',
      coldEmailTemplateType: 'forfait_entretien',
      referralPotential: 'medium',
      partnershipOpportunities: ['Assurances auto', 'Concessionnaires', 'Loueurs de vehicules', 'Entreprises (flottes)', 'Depanneurs'],
    },
    finance: {
      avgRevenue: '10000-35000 EUR/mois',
      mainCosts: ['Pieces detachees (35-45%)', 'Personnel (25-35%)', 'Loyer/local (8-12%)', 'Equipement diagnostic (3-5%)'],
      avgRentPercent: '8-12%',
      seasonalCashFlow: 'Pic au printemps (CT avant vacances) et automne (pneus hiver). Creux en aout.',
      taxObligations: ['TVA 20%', 'CFE', 'Cotisations sociales', 'Agrement prefectoral (controle technique)', 'Normes environnementales (huiles, pneus)'],
    },
  },

  // =========================================================================
  // 12. MEDICAL
  // =========================================================================
  {
    sector: 'medical',
    aliases: ['medecin', 'dentiste', 'kine', 'kinesitherapeute', 'osteopathe', 'pharmacie', 'opticien', 'infirmier', 'sage-femme', 'podologue', 'psychologue'],
    marketing: {
      instagramEngagementRate: 3.1,
      tiktokEngagementRate: 5.5,
      emailOpenRate: 24.7,
      emailClickRate: 3.4,
      avgCostPerClick: 1.50,
      avgROAS: 6.2,
      bestPostingTimes: [
        { platform: 'instagram', days: ['mardi', 'jeudi'], hours: ['8h00', '12h00'] },
        { platform: 'tiktok', days: ['lundi', 'mercredi', 'vendredi'], hours: ['12h00', '19h00'] },
      ],
      topHashtags: ['#sante', '#medecin', '#dentiste', '#kine', '#osteo', '#bienetre', '#prevention', '#soinsdentaires', '#reeducation', '#santeaunaturel'],
      contentIdeas: [
        'Conseil prevention sante en 60 secondes (format educatif)',
        'Mythes medicaux demystifies (ex: rhume et froid)',
        'Visite du cabinet : ambiance rassurante, equipements modernes',
        'Exercices d\'etirement pour le dos (kine/osteo)',
        'Les 5 erreurs d\'hygiene dentaire les plus courantes',
        'FAQ patient : repondre aux questions les plus frequentes',
        'Journee type d\'un praticien (humaniser le metier)',
        'Nouvelle technologie ou equipement : explication simple',
        'Temoignage patient (anonymise, avec consentement)',
        'Conseil saisonnier : allergies, grippe, soleil, etc.',
        'Story quiz : vrai ou faux sur un sujet de sante',
        'Partenariat avec un autre professionnel de sante (video conjointe)',
      ],
      competitorCount: 'medium',
    },
    seo: {
      avgMonthlySearches: '5000-50000',
      topKeywords: ['medecin [ville]', 'dentiste [ville]', 'kine [ville]', 'osteopathe [ville]', 'pharmacie [ville]', 'opticien [ville]'],
      localSearchImportance: 'critical',
      googleMapsImportance: 'critical',
      reviewImportance: 'critical',
      avgReviewScore: 4.2,
      seasonality: [
        { month: 'janvier', demand: 'high' }, { month: 'fevrier', demand: 'medium' },
        { month: 'mars', demand: 'medium' }, { month: 'avril', demand: 'medium' },
        { month: 'mai', demand: 'medium' }, { month: 'juin', demand: 'medium' },
        { month: 'juillet', demand: 'low' }, { month: 'aout', demand: 'low' },
        { month: 'septembre', demand: 'high' }, { month: 'octobre', demand: 'high' },
        { month: 'novembre', demand: 'high' }, { month: 'decembre', demand: 'medium' },
      ],
    },
    business: {
      avgTicket: '25-80 EUR (consultation)',
      avgMargin: '45-70%',
      clientRetentionRate: '60-80%',
      avgLifetimeValue: '1000-5000 EUR',
      peakHours: ['8h30-12h', '14h-19h'],
      challenges: [
        'Reglementation communication stricte (Ordre, deontologie)',
        'Prise de RDV en ligne devenue obligatoire (Doctolib = 30EUR/mois)',
        'Deserts medicaux et difficulte d\'installation en zone rurale',
        'Gestion du temps d\'attente et des patients mecontents',
        'Investissements en equipements medicaux (amortissement long)',
      ],
      opportunities: [
        'Teleconsultation (revenus complementaires, flexibilite)',
        'Specialisation de niche (sport, pediatrie, geriatrie)',
        'Education patient en ligne (blog, video = SEO)',
        'Cabinet de groupe / maison de sante (synergie)',
        'Partenariats mutuelles et prevoyance',
      ],
    },
    prospection: {
      bestChannels: ['Doctolib', 'Google Maps', 'Bouche-a-oreille', 'Partenariats confreres'],
      avgConversionRate: '10-20%',
      coldEmailTemplateType: 'information_sante',
      referralPotential: 'high',
      partnershipOpportunities: ['Autres praticiens sante', 'Pharmacies', 'Mutuelles', 'Maisons de sante', 'CPAM/organismes prevention'],
    },
    finance: {
      avgRevenue: '5000-25000 EUR/mois (liberal)',
      mainCosts: ['Charges sociales (35-45%)', 'Loyer cabinet (8-12%)', 'Assurance RCP (2-5%)', 'Materiel medical (5-10%)'],
      avgRentPercent: '8-12%',
      seasonalCashFlow: 'Relativement stable, leger creux en aout. Dentiste : pic en fin d\'annee (depassement mutuelle)',
      taxObligations: ['Exoneration TVA (soins medicaux)', 'BNC regime reel ou micro', 'URSSAF', 'CARMF/CARPIMKO selon profession', 'RCP obligatoire'],
    },
  },
];

// ---------------------------------------------------------------------------
// Lookup functions
// ---------------------------------------------------------------------------

/**
 * Get knowledge for a specific sector by name.
 */
export function getSectorKnowledge(businessType: string): SectorKnowledge | null {
  const normalized = businessType.toLowerCase().trim();
  return SECTORS.find(
    (s) => s.sector === normalized || s.aliases.some((a) => a === normalized)
  ) ?? null;
}

/**
 * Get all available sector names.
 */
export function getAvailableSectors(): string[] {
  return SECTORS.map((s) => s.sector);
}

/**
 * Match a free-text business description to the closest sector.
 * Scans aliases for substring matches, picks the best.
 */
export function matchSector(description: string): SectorKnowledge | null {
  if (!description) return null;
  const lower = description.toLowerCase().trim();

  // Exact alias match first
  for (const s of SECTORS) {
    if (s.sector === lower) return s;
    for (const alias of s.aliases) {
      if (alias === lower) return s;
    }
  }

  // Substring match — score by how many aliases appear
  let best: SectorKnowledge | null = null;
  let bestScore = 0;

  for (const s of SECTORS) {
    let score = 0;
    for (const alias of s.aliases) {
      if (lower.includes(alias)) {
        score += alias.length; // longer match = better
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Agent-specific formatting
// ---------------------------------------------------------------------------

/**
 * Format sector knowledge for a specific agent's prompt.
 * Only includes the data relevant to that agent's role.
 */
export function formatSectorForAgent(sector: SectorKnowledge, agentId: string): string {
  const lines: string[] = [
    `--- INTELLIGENCE SECTORIELLE : ${sector.sector.toUpperCase()} ---`,
  ];

  switch (agentId) {
    // ── Hugo: Email Marketing ──────────────────────────────────────
    case 'email': {
      const m = sector.marketing;
      const p = sector.prospection;
      lines.push(`Taux ouverture email secteur: ${m.emailOpenRate}%`);
      lines.push(`Taux clic email secteur: ${m.emailClickRate}%`);
      lines.push(`Template recommande: ${p.coldEmailTemplateType}`);
      lines.push(`Potentiel parrainage: ${p.referralPotential}`);
      lines.push(`Taux conversion moyen: ${p.avgConversionRate}`);
      lines.push(`Meilleurs canaux: ${p.bestChannels.join(', ')}`);
      lines.push(`Partenariats: ${p.partnershipOpportunities.join(', ')}`);
      lines.push(`Panier moyen: ${sector.business.avgTicket} | LTV: ${sector.business.avgLifetimeValue}`);
      lines.push(`Defis: ${sector.business.challenges.slice(0, 3).join(' ; ')}`);
      break;
    }

    // ── Oscar: SEO ─────────────────────────────────────────────────
    case 'seo': {
      const s = sector.seo;
      lines.push(`Recherches mensuelles: ${s.avgMonthlySearches}`);
      lines.push(`Top keywords: ${s.topKeywords.join(', ')}`);
      lines.push(`Importance recherche locale: ${s.localSearchImportance}`);
      lines.push(`Importance Google Maps: ${s.googleMapsImportance}`);
      lines.push(`Importance avis: ${s.reviewImportance} (note moyenne: ${s.avgReviewScore}/5)`);
      lines.push('Saisonnalite:');
      const highMonths = s.seasonality.filter((m) => m.demand === 'high').map((m) => m.month);
      const lowMonths = s.seasonality.filter((m) => m.demand === 'low').map((m) => m.month);
      lines.push(`  Haute demande: ${highMonths.join(', ')}`);
      lines.push(`  Basse demande: ${lowMonths.join(', ')}`);
      break;
    }

    // ── Felix: Ads & Funnels ───────────────────────────────────────
    case 'ads': {
      const m = sector.marketing;
      lines.push(`CPC moyen Meta Ads: ${m.avgCostPerClick} EUR`);
      lines.push(`ROAS moyen: ${m.avgROAS}x`);
      lines.push(`Taux engagement Instagram: ${m.instagramEngagementRate}%`);
      lines.push(`Taux engagement TikTok: ${m.tiktokEngagementRate}%`);
      lines.push(`Concurrence: ${m.competitorCount}`);
      lines.push(`Panier moyen: ${sector.business.avgTicket} | Marge: ${sector.business.avgMargin}`);
      lines.push(`LTV client: ${sector.business.avgLifetimeValue}`);
      lines.push(`Meilleurs canaux acquisition: ${sector.prospection.bestChannels.join(', ')}`);
      lines.push(`Taux conversion: ${sector.prospection.avgConversionRate}`);
      break;
    }

    // ── Lena: Content & Publication ────────────────────────────────
    case 'content': {
      const m = sector.marketing;
      lines.push(`Engagement Instagram: ${m.instagramEngagementRate}% | TikTok: ${m.tiktokEngagementRate}%`);
      lines.push('Meilleurs horaires publication:');
      for (const pt of m.bestPostingTimes) {
        lines.push(`  ${pt.platform}: ${pt.days.join(', ')} a ${pt.hours.join(' et ')}`);
      }
      lines.push(`Hashtags: ${m.topHashtags.join(' ')}`);
      lines.push('Idees contenu:');
      for (const idea of m.contentIdeas) {
        lines.push(`  - ${idea}`);
      }
      break;
    }

    // ── Leo: Commercial / Prospection ──────────────────────────────
    case 'commercial': {
      const p = sector.prospection;
      const b = sector.business;
      lines.push(`Meilleurs canaux: ${p.bestChannels.join(', ')}`);
      lines.push(`Taux conversion: ${p.avgConversionRate}`);
      lines.push(`Potentiel parrainage: ${p.referralPotential}`);
      lines.push(`Partenariats: ${p.partnershipOpportunities.join(', ')}`);
      lines.push(`Panier moyen: ${b.avgTicket} | LTV: ${b.avgLifetimeValue}`);
      lines.push(`Retention: ${b.clientRetentionRate}`);
      lines.push(`Defis: ${b.challenges.join(' ; ')}`);
      lines.push(`Opportunites: ${b.opportunities.join(' ; ')}`);
      break;
    }

    // ── Noah: CEO / Strategie ──────────────────────────────────────
    case 'ceo': {
      const b = sector.business;
      const f = sector.finance;
      lines.push(`CA moyen: ${f.avgRevenue}`);
      lines.push(`Panier moyen: ${b.avgTicket} | Marge: ${b.avgMargin}`);
      lines.push(`Retention: ${b.clientRetentionRate} | LTV: ${b.avgLifetimeValue}`);
      lines.push(`Heures de pointe: ${b.peakHours.join(', ')}`);
      lines.push(`Principaux couts: ${f.mainCosts.join(', ')}`);
      lines.push(`Tresorerie saisonniere: ${f.seasonalCashFlow}`);
      lines.push(`Defis: ${b.challenges.join(' ; ')}`);
      lines.push(`Opportunites: ${b.opportunities.join(' ; ')}`);
      const highMonths = sector.seo.seasonality.filter((m) => m.demand === 'high').map((m) => m.month);
      lines.push(`Mois forts: ${highMonths.join(', ')}`);
      break;
    }

    // ── Louis: Comptable / Finance ─────────────────────────────────
    case 'comptable': {
      const f = sector.finance;
      const b = sector.business;
      lines.push(`CA moyen: ${f.avgRevenue}`);
      lines.push(`Marge moyenne: ${b.avgMargin}`);
      lines.push(`Principaux couts: ${f.mainCosts.join(', ')}`);
      lines.push(`Loyer moyen: ${f.avgRentPercent} du CA`);
      lines.push(`Tresorerie: ${f.seasonalCashFlow}`);
      lines.push(`Obligations fiscales: ${f.taxObligations.join(', ')}`);
      lines.push(`Panier moyen: ${b.avgTicket} | LTV: ${b.avgLifetimeValue}`);
      break;
    }

    // ── Ami: Marketing Intelligence ────────────────────────────────
    case 'marketing': {
      const m = sector.marketing;
      const b = sector.business;
      lines.push(`Engagement Instagram: ${m.instagramEngagementRate}% | TikTok: ${m.tiktokEngagementRate}%`);
      lines.push(`Email: ${m.emailOpenRate}% ouverture, ${m.emailClickRate}% clic`);
      lines.push(`CPC Meta: ${m.avgCostPerClick} EUR | ROAS: ${m.avgROAS}x`);
      lines.push(`Concurrence: ${m.competitorCount}`);
      lines.push(`Panier: ${b.avgTicket} | Marge: ${b.avgMargin} | LTV: ${b.avgLifetimeValue}`);
      lines.push(`Defis: ${b.challenges.slice(0, 3).join(' ; ')}`);
      lines.push(`Opportunites: ${b.opportunities.slice(0, 3).join(' ; ')}`);
      lines.push('Horaires optimaux:');
      for (const pt of m.bestPostingTimes) {
        lines.push(`  ${pt.platform}: ${pt.days.join(', ')} a ${pt.hours.join(' et ')}`);
      }
      break;
    }

    // ── Theo: Retention ────────────────────────────────────────────
    case 'retention': {
      const b = sector.business;
      lines.push(`Taux retention secteur: ${b.clientRetentionRate}`);
      lines.push(`LTV: ${b.avgLifetimeValue}`);
      lines.push(`Panier moyen: ${b.avgTicket}`);
      lines.push(`Heures de pointe: ${b.peakHours.join(', ')}`);
      lines.push(`Defis fidelisation: ${b.challenges.filter((c) => c.toLowerCase().includes('fidel') || c.toLowerCase().includes('client') || c.toLowerCase().includes('retention')).join(' ; ') || b.challenges[0]}`);
      lines.push(`Email ouverture: ${sector.marketing.emailOpenRate}% | Clic: ${sector.marketing.emailClickRate}%`);
      lines.push(`Referral potentiel: ${sector.prospection.referralPotential}`);
      break;
    }

    // ── Clara: Onboarding ──────────────────────────────────────────
    case 'onboarding': {
      const b = sector.business;
      lines.push(`Secteur: ${sector.sector}`);
      lines.push(`Panier moyen: ${b.avgTicket}`);
      lines.push(`Heures de pointe: ${b.peakHours.join(', ')}`);
      lines.push(`Defis principaux: ${b.challenges.slice(0, 2).join(' ; ')}`);
      lines.push(`Opportunites cles: ${b.opportunities.slice(0, 2).join(' ; ')}`);
      lines.push(`Canaux recommandes: ${sector.prospection.bestChannels.join(', ')}`);
      break;
    }

    // ── Sara: RH ───────────────────────────────────────────────────
    case 'rh': {
      const b = sector.business;
      const f = sector.finance;
      lines.push(`Obligations fiscales: ${f.taxObligations.join(', ')}`);
      lines.push(`Couts principaux: ${f.mainCosts.join(', ')}`);
      lines.push(`Defis RH: ${b.challenges.filter((c) => c.toLowerCase().includes('recrutement') || c.toLowerCase().includes('personnel') || c.toLowerCase().includes('salari')).join(' ; ') || b.challenges.slice(0, 2).join(' ; ')}`);
      break;
    }

    // ── Jade: Ops / Publication ────────────────────────────────────
    case 'ops': {
      const m = sector.marketing;
      lines.push('Horaires publication optimaux:');
      for (const pt of m.bestPostingTimes) {
        lines.push(`  ${pt.platform}: ${pt.days.join(', ')} a ${pt.hours.join(' et ')}`);
      }
      lines.push(`Hashtags: ${m.topHashtags.slice(0, 5).join(' ')}`);
      break;
    }

    // ── Default: everything summarized ─────────────────────────────
    default: {
      const m = sector.marketing;
      const b = sector.business;
      lines.push(`Engagement IG: ${m.instagramEngagementRate}% | TT: ${m.tiktokEngagementRate}%`);
      lines.push(`Email: ${m.emailOpenRate}% ouverture`);
      lines.push(`Panier: ${b.avgTicket} | Marge: ${b.avgMargin}`);
      lines.push(`LTV: ${b.avgLifetimeValue} | Retention: ${b.clientRetentionRate}`);
      break;
    }
  }

  lines.push(`--- FIN INTELLIGENCE SECTORIELLE ---`);
  return lines.join('\n');
}
