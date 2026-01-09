/**
 * Génération intelligente de suggestions de texte pour overlay
 * Adapté selon le specialist, profil communication, actualité et business
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

/**
 * Extrait les mots-clés importants de l'actualité
 */
function extractKeywords(newsTitle: string, newsDescription?: string): string[] {
  const text = `${newsTitle} ${newsDescription || ''}`.toLowerCase();

  // Mots-clés tendance à détecter
  const keywords: string[] = [];

  // Prix et économie
  if (/hausse|augment|flamb|explos|cher/i.test(text)) keywords.push('prix');
  if (/baisse|réduc|promo|solde|économ/i.test(text)) keywords.push('économie');

  // Urgence
  if (/urgent|immédiat|maintenant|aujourd'hui|ce soir|cette semaine/i.test(text)) keywords.push('urgence');

  // Tendances
  if (/nouveau|innovation|révolution|tendance|inédit/i.test(text)) keywords.push('nouveauté');

  // Problèmes
  if (/problème|crise|difficulté|pénurie|manque/i.test(text)) keywords.push('problème');

  // Opportunités
  if (/opportun|chance|occasion|offre|avantage/i.test(text)) keywords.push('opportunité');

  return keywords;
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
  businessType: string
): string[] {
  const suggestions: string[] = [];

  if (specialist === 'seo') {
    // SEO : Mots-clés + Bénéfice + Local
    suggestions.push(`${businessType} ${keywords[0] || 'expert'} près de chez vous`);
    suggestions.push(`Solution ${keywords[0] || 'professionnelle'} ${businessType.toLowerCase()}`);
    suggestions.push(`${businessType} : La référence locale`);
  }

  else if (specialist === 'marketing') {
    // Marketing : Urgence + CTA + Chiffre
    const number = generateCtaNumber(keywords);
    suggestions.push(`${number} ${keywords.includes('urgence') ? 'seulement' : 'cette semaine'} !`);
    suggestions.push(`L'offre qui change tout ${selectEmoji(keywords, specialist)}`);
    suggestions.push(`${number} + Livraison offerte`);
  }

  else if (specialist === 'content') {
    // Content : Story + Valeurs + Authenticité
    if (profile === 'inspirant') {
      suggestions.push(`Notre histoire, votre solution ${selectEmoji(keywords)}`);
      suggestions.push(`Parce que vous méritez le meilleur`);
    } else if (profile === 'conversationnel') {
      suggestions.push(`On a pensé à vous ${selectEmoji(keywords)}`);
      suggestions.push(`Votre ${businessType.toLowerCase()} comme vous l'aimez`);
    }
    suggestions.push(`Fait avec passion depuis 20XX`);
  }

  else if (specialist === 'copywriter') {
    // Copywriter : Transformation + Bénéfice + Action
    if (keywords.includes('problème')) {
      suggestions.push(`Le problème ? On a la solution.`);
      suggestions.push(`Fini les ${keywords[0]} ${selectEmoji(keywords, specialist)}`);
    }
    suggestions.push(`Résultat garanti ou remboursé`);
    suggestions.push(`Votre vie, en mieux ${selectEmoji(keywords, specialist)}`);
  }

  // Suggestions génériques si pas assez spécifiques
  if (suggestions.length === 0) {
    suggestions.push(`${businessType} d'exception`);
    suggestions.push(`Découvrez la différence`);
    suggestions.push(`Votre partenaire de confiance`);
  }

  return suggestions;
}

/**
 * Génère une suggestion de texte basée sur l'actualité
 */
function generateNewsBasedText(
  newsTitle: string,
  businessType: string,
  keywords: string[]
): string[] {
  const suggestions: string[] = [];

  // Pattern : Actualité + Transition + Solution
  if (keywords.includes('prix') || keywords.includes('économie')) {
    suggestions.push(`Les prix explosent ? Pas ici ! ${selectEmoji(keywords)}`);
    suggestions.push(`L'actu vous coûte cher ? On allège l'addition`);
  }

  if (keywords.includes('problème') || keywords.includes('urgence')) {
    suggestions.push(`Face à l'actu, on vous aide ${selectEmoji(keywords)}`);
    suggestions.push(`Notre solution à votre problème`);
  }

  if (keywords.includes('nouveauté') || keywords.includes('opportunité')) {
    suggestions.push(`On surfe sur la tendance avec vous !`);
    suggestions.push(`L'actu du moment = Votre opportunité`);
  }

  return suggestions;
}

/**
 * Génère des suggestions de texte intelligentes
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

  // Extraire les mots-clés de l'actu
  const keywords = extractKeywords(newsTitle, newsDescription);

  // Générer selon le specialist
  const specialistSuggestions = generateBySpecialist(
    specialist,
    communicationProfile,
    keywords,
    businessType
  );

  // Générer selon l'actualité
  const newsSuggestions = generateNewsBasedText(newsTitle, businessType, keywords);

  // Générer selon l'angle marketing si fourni
  const angleSuggestions: string[] = [];
  if (marketingAngle) {
    if (marketingAngle.includes('opportunité')) {
      angleSuggestions.push(`Profitez-en maintenant ! ${selectEmoji(keywords)}`);
    }
    if (marketingAngle.includes('expert')) {
      angleSuggestions.push(`L'expertise qui fait la différence`);
    }
    if (marketingAngle.includes('tendance')) {
      angleSuggestions.push(`On est dans la tendance ${selectEmoji(['nouveauté'])}`);
    }
  }

  // Combiner et dédupliquer
  const allSuggestions = [
    ...newsSuggestions,
    ...specialistSuggestions,
    ...angleSuggestions,
  ];

  // Retourner les 5 meilleures (déduplication et filtrage)
  const unique = Array.from(new Set(allSuggestions));
  const filtered = unique.filter(s => s.length <= 50 && s.length >= 10); // Longueur optimale

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
