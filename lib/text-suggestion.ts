/**
 * Génération intelligente de suggestions de texte pour overlay
 * Adapté selon le specialist, profil communication, actualité et business
 * Version 2.0 : Lien fort actualité/business + Tons variés
 */

export interface TextSuggestionParams {
  newsTitle: string;
  newsDescription?: string;
  businessType: string;
  businessDescription?: string;
  targetAudience?: string;
  specialist?: 'seo' | 'marketing' | 'content' | 'copywriter';
  communicationProfile?: 'inspirant' | 'expert' | 'urgent' | 'conversationnel';
  marketingAngle?: string;
}

export type ToneType = 'humour' | 'sérieux' | 'décalé' | 'urgent' | 'inspirant' | 'direct';

/**
 * Extrait les entités principales (mots importants) de l'actualité
 */
function extractNewsEntities(newsTitle: string, newsDescription?: string): string[] {
  const text = newsTitle + ' ' + (newsDescription || '');

  // Extraire les mots de 4+ lettres (noms, marques, concepts)
  const words = text.match(/\b[A-ZÉÈÊËÀÂÔÛÙÇ][a-zéèêëàâôûùç]{3,}/g) || [];

  // Garder seulement les 3 premiers mots importants
  return words.slice(0, 3);
}

/**
 * Extrait les concepts clés et le contexte de l'actualité
 */
function extractKeywords(newsTitle: string, newsDescription?: string): {
  categories: string[];
  mainConcept: string;
  emotion: string;
} {
  const text = `${newsTitle} ${newsDescription || ''}`.toLowerCase();

  const categories: string[] = [];
  let mainConcept = '';
  let emotion = 'neutre';

  // Prix et économie
  if (/hausse|augment|flamb|explos|cher|€|prix|coût/i.test(text)) {
    categories.push('prix');
    mainConcept = mainConcept || 'prix';
    emotion = 'inquiétude';
  }
  if (/baisse|réduc|promo|solde|économ|gratuit/i.test(text)) {
    categories.push('économie');
    mainConcept = mainConcept || 'économies';
    emotion = 'opportunité';
  }

  // Urgence
  if (/urgent|immédiat|maintenant|aujourd'hui|ce soir|cette semaine|dernière chance/i.test(text)) {
    categories.push('urgence');
    emotion = 'urgence';
  }

  // Tendances et innovation
  if (/nouveau|innovation|révolution|tendance|inédit|moderne|futur/i.test(text)) {
    categories.push('nouveauté');
    mainConcept = mainConcept || 'innovation';
    emotion = 'excitation';
  }

  // Problèmes et crises
  if (/problème|crise|difficulté|pénurie|manque|risque|danger/i.test(text)) {
    categories.push('problème');
    emotion = 'inquiétude';
  }

  // Opportunités positives
  if (/opportun|chance|occasion|offre|avantage|succès|record/i.test(text)) {
    categories.push('opportunité');
    emotion = 'enthousiasme';
  }

  // Environnement
  if (/écolo|vert|climat|planète|bio|durable|carbone/i.test(text)) {
    categories.push('écologie');
    mainConcept = mainConcept || 'environnement';
  }

  // Santé
  if (/santé|médical|bien-être|sport|nutrition|fitness/i.test(text)) {
    categories.push('santé');
  }

  // Tech
  if (/tech|digital|IA|robot|application|smartphone|internet/i.test(text)) {
    categories.push('tech');
    mainConcept = mainConcept || 'technologie';
  }

  return { categories, mainConcept: mainConcept || 'actualité', emotion };
}

/**
 * Génère un chiffre accrocheur selon le contexte
 */
function generateCtaNumber(keywords: string[]): string {
  if (keywords.includes('économie') || keywords.includes('prix')) {
    return ['-20%', '-30%', '-50%'][Math.floor(Math.random() * 3)];
  }
  if (keywords.includes('urgence')) {
    return ['24h', '48h', 'Aujourd\'hui'][Math.floor(Math.random() * 3)];
  }
  if (keywords.includes('nouveauté')) {
    return ['Nouveau', 'Inédit', 'Exclusif'][Math.floor(Math.random() * 3)];
  }
  return '';
}

/**
 * Sélectionne un emoji pertinent
 */
function selectEmoji(keywords: string[], specialist?: string): string {
  if (specialist === 'marketing') return '🚀';
  if (specialist === 'seo') return '🎯';
  if (specialist === 'copywriter') return '✨';

  if (keywords.includes('économie')) return '💰';
  if (keywords.includes('urgence')) return '⏰';
  if (keywords.includes('nouveauté')) return '🆕';
  if (keywords.includes('opportunité')) return '🎁';
  if (keywords.includes('problème')) return '💡';

  return '✓';
}

/**
 * Génère une suggestion de texte selon le specialist
 */
function generateBySpecialist(
  specialist: string,
  profile: string,
  keywords: string[],
  businessType: string,
  mainConcept: string,
  emotion: string
): string[] {
  const suggestions: string[] = [];

  if (specialist === 'seo') {
    // SEO : Mots-clés + Bénéfice + Local + Concept principal
    suggestions.push(`${businessType} ${mainConcept} près de chez vous`);
    suggestions.push(`Expert ${mainConcept} - ${businessType}`);
    suggestions.push(`${businessType} : Votre solution ${mainConcept}`);
  }

  else if (specialist === 'marketing') {
    // Marketing : Urgence + CTA + Chiffre + Émotion
    const number = generateCtaNumber(keywords);
    if (emotion === 'urgence') {
      suggestions.push(`${number} - Agissez maintenant !`);
      suggestions.push(`Dernière chance ${mainConcept} ${selectEmoji(keywords, specialist)}`);
    } else if (emotion === 'opportunité') {
      suggestions.push(`${number} sur ${mainConcept} - Profitez-en !`);
      suggestions.push(`Offre ${mainConcept} exclusive ${selectEmoji(keywords, specialist)}`);
    } else {
      suggestions.push(`${number} ${keywords.includes('urgence') ? 'seulement' : 'cette semaine'} !`);
      suggestions.push(`L'offre qui change tout ${selectEmoji(keywords, specialist)}`);
    }
  }

  else if (specialist === 'content') {
    // Content : Story + Valeurs + Authenticité + Émotion
    if (profile === 'inspirant') {
      suggestions.push(`Votre ${mainConcept}, notre passion ${selectEmoji(keywords)}`);
      suggestions.push(`Ensemble vers l'excellence ${mainConcept}`);
    } else if (profile === 'conversationnel') {
      suggestions.push(`On vous accompagne sur ${mainConcept} ${selectEmoji(keywords)}`);
      suggestions.push(`${mainConcept} comme vous l'aimez`);
    } else if (profile === 'expert') {
      suggestions.push(`Expertise ${mainConcept} reconnue`);
      suggestions.push(`Maîtrise ${mainConcept} depuis 10 ans`);
    }
  }

  else if (specialist === 'copywriter') {
    // Copywriter : Transformation + Bénéfice + Action + Émotion
    if (emotion === 'inquiétude') {
      suggestions.push(`${mainConcept} : Notre solution vous rassure`);
      suggestions.push(`Fini les problèmes de ${mainConcept} ${selectEmoji(keywords, specialist)}`);
    } else if (emotion === 'enthousiasme' || emotion === 'excitation') {
      suggestions.push(`Découvrez le ${mainConcept} nouvelle génération`);
      suggestions.push(`${mainConcept} : L'innovation qui fait la différence`);
    } else {
      suggestions.push(`Votre ${mainConcept}, en mieux ${selectEmoji(keywords, specialist)}`);
      suggestions.push(`Résultats visibles en ${mainConcept}`);
    }
  }

  // Suggestions génériques si pas assez spécifiques
  if (suggestions.length === 0) {
    suggestions.push(`${businessType} d'exception`);
    suggestions.push(`Découvrez la différence`);
    suggestions.push(`Votre partenaire ${mainConcept}`);
  }

  return suggestions;
}

/**
 * Génère une suggestion de texte basée sur l'actualité
 * Crée un lien FORT et EXPLICITE entre l'actualité et le business
 */
function generateNewsBasedText(
  newsTitle: string,
  businessType: string,
  keywords: string[],
  mainConcept: string,
  entities: string[]
): string[] {
  const suggestions: string[] = [];

  // Extraire le premier mot-clé de l'actualité si disponible
  const newsEntity = entities[0] || mainConcept;

  // Pattern : Actualité + Transition + Solution EXPLICITE
  if (keywords.includes('prix') || keywords.includes('économie')) {
    suggestions.push(`${newsEntity} en hausse ? On vous protège !`);
    suggestions.push(`Face à la hausse ${mainConcept}, notre solution`);
    suggestions.push(`Les prix explosent ? Pas ici ! ${selectEmoji(keywords)}`);
  }

  if (keywords.includes('problème') || keywords.includes('urgence')) {
    suggestions.push(`Problème ${newsEntity} ? ${businessType} vous aide`);
    suggestions.push(`${newsEntity} : Notre expertise à votre service`);
    suggestions.push(`Face à ${newsEntity}, on a la solution ${selectEmoji(keywords)}`);
  }

  if (keywords.includes('nouveauté') || keywords.includes('opportunité')) {
    suggestions.push(`${newsEntity} arrive ! On est prêts`);
    suggestions.push(`Nouveau ${newsEntity} = Nouvelle opportunité avec nous`);
    suggestions.push(`Tendance ${newsEntity} : On vous accompagne !`);
  }

  if (keywords.includes('tech')) {
    suggestions.push(`${newsEntity} : ${businessType} à la pointe`);
    suggestions.push(`Innovation ${newsEntity} avec ${businessType}`);
  }

  if (keywords.includes('écologie')) {
    suggestions.push(`${newsEntity} : Notre engagement pour la planète`);
    suggestions.push(`${businessType} éco-responsable face à ${newsEntity}`);
  }

  if (keywords.includes('santé')) {
    suggestions.push(`Votre bien-être ${mainConcept} avec ${businessType}`);
    suggestions.push(`${newsEntity} : Prenez soin de vous avec nous`);
  }

  // Formule générique avec entité
  if (suggestions.length === 0 && entities.length > 0) {
    suggestions.push(`${newsEntity} + ${businessType} = La solution`);
    suggestions.push(`Suivez l'actu ${newsEntity} avec nous`);
  }

  return suggestions;
}

/**
 * Génère des suggestions selon le TON (humour, sérieux, décalé, urgent, inspirant, direct)
 * Cette fonction offre de la VARIÉTÉ dans les suggestions
 */
function generateByTone(
  tone: ToneType,
  newsEntity: string,
  businessType: string,
  mainConcept: string,
  emotion: string,
  keywords: string[]
): string[] {
  const suggestions: string[] = [];

  switch (tone) {
    case 'humour':
      // Ton humoristique et léger
      suggestions.push(`${newsEntity} fait le buzz ? Nous aussi ! 😎`);
      suggestions.push(`Pas de panique pour ${mainConcept} 😅`);
      suggestions.push(`${businessType} : On assure même quand ça chauffe !`);
      if (emotion === 'inquiétude') {
        suggestions.push(`${mainConcept} en mode survie ? On a le cheat code 🎮`);
      }
      break;

    case 'sérieux':
      // Ton professionnel et factuel
      suggestions.push(`${newsEntity} : Analyse et solutions ${businessType}`);
      suggestions.push(`Expertise ${mainConcept} - Résultats concrets`);
      suggestions.push(`Face à ${newsEntity}, notre méthodologie éprouvée`);
      if (emotion === 'urgence') {
        suggestions.push(`${mainConcept} : Intervention rapide garantie`);
      }
      break;

    case 'décalé':
      // Ton original et créatif
      suggestions.push(`${newsEntity} ? Plot twist : On a LA solution 🎬`);
      suggestions.push(`${mainConcept} level : Expert unlocked 🔓`);
      suggestions.push(`Pendant que ${newsEntity} fait parler, nous on agit`);
      if (keywords.includes('tech')) {
        suggestions.push(`${newsEntity} 2.0 powered by ${businessType} ⚡`);
      }
      break;

    case 'urgent':
      // Ton pressant et actionnable
      suggestions.push(`${newsEntity} : Agissez MAINTENANT ⏰`);
      suggestions.push(`${mainConcept} - Dernières places disponibles !`);
      suggestions.push(`URGENT ${newsEntity} : ${businessType} répond présent`);
      if (emotion === 'opportunité') {
        suggestions.push(`${newsEntity} - Offre limitée 24h !`);
      }
      break;

    case 'inspirant':
      // Ton motivant et émotionnel
      suggestions.push(`${newsEntity} : Ensemble, tout est possible ✨`);
      suggestions.push(`Votre réussite ${mainConcept} commence ici`);
      suggestions.push(`${newsEntity} nous inspire à vous servir mieux`);
      if (emotion === 'enthousiasme') {
        suggestions.push(`Transformez ${mainConcept} en succès avec nous 🌟`);
      }
      break;

    case 'direct':
      // Ton franc et sans détour
      suggestions.push(`${newsEntity} ? Voilà notre réponse.`);
      suggestions.push(`${mainConcept} : Simple. Efficace. ${businessType}.`);
      suggestions.push(`Besoin ${newsEntity} ? On livre.`);
      if (keywords.includes('prix')) {
        suggestions.push(`${mainConcept} au juste prix. Point.`);
      }
      break;
  }

  return suggestions;
}

/**
 * Génère des suggestions de texte intelligentes avec VARIÉTÉ de tons
 * @returns Array de 3-5 suggestions optimisées pour réseaux sociaux
 */
export function generateTextSuggestions(params: TextSuggestionParams): string[] {
  const {
    newsTitle,
    newsDescription,
    businessType,
    specialist = 'marketing',
    communicationProfile = 'inspirant',
    marketingAngle,
  } = params;

  // Extraire les mots-clés et le contexte de l'actu
  const keywords = extractKeywords(newsTitle, newsDescription);
  const entities = extractNewsEntities(newsTitle, newsDescription);

  // Générer selon le specialist (avec mainConcept et emotion)
  const specialistSuggestions = generateBySpecialist(
    specialist,
    communicationProfile,
    keywords.categories,
    businessType,
    keywords.mainConcept,
    keywords.emotion
  );

  // Générer selon l'actualité (avec lien fort actualité/business)
  const newsSuggestions = generateNewsBasedText(
    newsTitle,
    businessType,
    keywords.categories,
    keywords.mainConcept,
    entities
  );

  // Générer selon différents TONS pour la variété
  const newsEntity = entities[0] || keywords.mainConcept;
  const toneSuggestions: string[] = [];

  // Ton inspirant (prioritaire)
  toneSuggestions.push(...generateByTone('inspirant', newsEntity, businessType, keywords.mainConcept, keywords.emotion, keywords.categories));

  // Ton sérieux
  toneSuggestions.push(...generateByTone('sérieux', newsEntity, businessType, keywords.mainConcept, keywords.emotion, keywords.categories));

  // Ton décalé ou humour selon l'émotion
  if (keywords.emotion !== 'inquiétude') {
    toneSuggestions.push(...generateByTone('humour', newsEntity, businessType, keywords.mainConcept, keywords.emotion, keywords.categories));
  } else {
    toneSuggestions.push(...generateByTone('décalé', newsEntity, businessType, keywords.mainConcept, keywords.emotion, keywords.categories));
  }

  // Ton urgent si l'actualité le justifie
  if (keywords.categories.includes('urgence') || keywords.emotion === 'urgence') {
    toneSuggestions.push(...generateByTone('urgent', newsEntity, businessType, keywords.mainConcept, keywords.emotion, keywords.categories));
  }

  // Ton direct
  toneSuggestions.push(...generateByTone('direct', newsEntity, businessType, keywords.mainConcept, keywords.emotion, keywords.categories));

  // Générer selon l'angle marketing si fourni
  const angleSuggestions: string[] = [];
  if (marketingAngle) {
    if (marketingAngle.includes('opportunité')) {
      angleSuggestions.push(`Profitez-en maintenant ! ${selectEmoji(keywords.categories)}`);
    }
    if (marketingAngle.includes('expert')) {
      angleSuggestions.push(`L'expertise qui fait la différence`);
    }
    if (marketingAngle.includes('tendance')) {
      angleSuggestions.push(`On est dans la tendance ${selectEmoji(['nouveauté'])}`);
    }
  }

  // Combiner TOUTES les sources et mélanger pour la variété
  const allSuggestions = [
    ...newsSuggestions,        // Lien fort actualité/business
    ...toneSuggestions,        // Tons variés (humour, sérieux, etc.)
    ...specialistSuggestions,  // Approche specialist
    ...angleSuggestions,       // Angle marketing
  ];

  // Retourner les 5 meilleures (déduplication et filtrage)
  const unique = Array.from(new Set(allSuggestions));
  const filtered = unique.filter(s => s.length <= 60 && s.length >= 10); // Longueur optimale (augmenté à 60)

  return filtered.slice(0, 5);
}

/**
 * Génère UNE suggestion optimale (la meilleure)
 */
export function generateBestTextSuggestion(params: TextSuggestionParams): string {
  const suggestions = generateTextSuggestions(params);

  // Prioriser selon le specialist
  if (params.specialist === 'marketing') {
    // Préférer les textes avec chiffres ou urgence
    const withNumbers = suggestions.find(s => /\d+|%|€/.test(s));
    if (withNumbers) return withNumbers;
  }

  if (params.specialist === 'copywriter') {
    // Préférer les textes transformationnels
    const transformational = suggestions.find(s => /solution|résultat|mieux|fini/.test(s.toLowerCase()));
    if (transformational) return transformational;
  }

  // Par défaut, retourner la première suggestion (basée sur l'actu)
  return suggestions[0] || `${params.businessType} d'exception`;
}
