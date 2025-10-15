export type CatKey =
  | "technology" | "science" | "health" | "food"
  | "environment" | "gaming" | "world" | "sports" | "business";

export const CATEGORIES: Array<{key: CatKey; label: string}> = [
  { key: "technology",  label: "Technologie" },
  { key: "science",     label: "Science" },
  { key: "health",      label: "Santé" },
  { key: "food",        label: "Restauration" },
  { key: "environment", label: "Environnement" },
  { key: "gaming",      label: "Gaming" },
  { key: "world",       label: "Monde" },
  { key: "sports",      label: "Sport" },
  { key: "business",    label: "Économie" },
];

// Aides sémantiques quand "topic" ne suffit pas
export const CATEGORY_HINTS: Record<CatKey, { topic?: string; q?: string }> = {
  technology:  { topic: "technology" },
  science:     { topic: "science" },
  world:       { topic: "world" },
  business:    { topic: "business" },
  sports:      {
    topic: "sports",
    q: '(sport OR football OR foot OR rugby OR tennis OR basket OR NBA OR JO OR olympique OR "Ligue 1" OR PSG OR OM)',
  },
  health: {
    topic: "health",
    q: '(santé OR médical OR médecine OR hôpital OR hopital OR maladie OR vaccin OR "santé publique")',
  },
  food: {
    q: '(restauration OR restaurant OR restaurants OR "chaîne de restaurants" OR "fast-food" OR cuisine OR agroalimentaire)',
  },
  environment: {
    q: '(environnement OR écologie OR climat OR "changement climatique" OR biodiversité OR "énergie verte" OR recyclage OR COP)',
  },
  gaming: {
    q: '(gaming OR "jeu vidéo" OR "jeux vidéo" OR Xbox OR PlayStation OR Nintendo OR Steam OR e-sport OR esports)',
  },
};
