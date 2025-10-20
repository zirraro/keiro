export type NewsCard = {
  id: string;
  title: string;
  url: string;
  image?: string;
  source?: string;
  date?: string;
  category?: string;
  summary?: string;
};

export const CATEGORY_LIST = [
  'Finance', 'Tech & IA', 'Sport', 'Auto', 'Energie',
  'Immobilier', 'Santé', 'Mode & Luxe', 'Gaming', 'Culture'
];

/** Stubs — renvoient [] pour la build. Remplace par tes vraies intégrations ensuite. */
export async function fetchGoogleNews(_cat: string, _q?: string): Promise<NewsCard[]> { return []; }
export async function fetchNewsData(_cat: string, _q?: string): Promise<NewsCard[]> { return []; }
export async function fetchNewsApiAI(_cat: string, _q?: string): Promise<NewsCard[]> { return []; }

/** Essaie chaque source, retourne la 1ère non vide (stub => vide). */
export async function fetchBestAvailable(category: string, query?: string): Promise<NewsCard[]> {
  for (const fn of [fetchGoogleNews, fetchNewsData, fetchNewsApiAI]) {
    const items = await fn(category, query);
    if (items?.length) return items;
  }
  return [];
}

export default {
  fetchGoogleNews, fetchNewsData, fetchNewsApiAI, fetchBestAvailable, CATEGORY_LIST
};
