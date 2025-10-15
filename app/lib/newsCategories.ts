export type CleanCategory = {
  slug: string;   // utilisé dans l’API
  label: string;  // affiché à l’utilisateur
  emoji?: string; // optionnel
};

// ⚠️ Liste canonique — sans &, /, ni accents dans les slugs
export const CATEGORIES: CleanCategory[] = [
  { slug: 'technology', label: 'Technologie', emoji: '💡' },
  { slug: 'business',   label: 'Business',     emoji: '💼' },
  { slug: 'world',      label: 'Monde',        emoji: '🌍' },
  { slug: 'sports',     label: 'Sports',       emoji: '🏅' },
  { slug: 'gaming',     label: 'Gaming',       emoji: '🎮' },
  { slug: 'culture',    label: 'Culture',      emoji: '🎭' },
  { slug: 'food',       label: 'Gastronomie',  emoji: '🍽️' },
  { slug: 'lifestyle',  label: 'Lifestyle',    emoji: '✨' },
  { slug: 'sante',      label: 'Santé',        emoji: '🩺' },
  { slug: 'auto',       label: 'Auto',         emoji: '🚗' },
  { slug: 'climat',     label: 'Climat',       emoji: '🌦️' },
  { slug: 'immo',       label: 'Immobilier',   emoji: '🏠' },
];
