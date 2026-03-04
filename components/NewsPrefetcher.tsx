'use client';

import { useEffect } from 'react';

/**
 * Composant invisible qui précharge les actualités en arrière-plan
 * dès l'arrivée sur le site (n'importe quelle page).
 * Les données sont stockées dans localStorage et réutilisées par la page /generate.
 */
export default function NewsPrefetcher() {
  useEffect(() => {
    const CACHE_KEY = 'keiro_news_cache_fr';
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { ts } = JSON.parse(cached);
        if (ts && Date.now() - ts < CACHE_TTL) return; // Cache frais, rien à faire
      }
    } catch { /* ignore */ }

    // Précharger en arrière-plan (faible priorité)
    const timer = setTimeout(() => {
      fetch('/api/news?all=true&region=fr')
        .then(res => res.json())
        .then(data => {
          if (data?.ok && data.items?.length > 0) {
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify({ items: data.items, ts: Date.now() }));
            } catch { /* quota exceeded */ }
          }
        })
        .catch(() => { /* silently fail */ });
    }, 2000); // Attendre 2s pour ne pas bloquer le chargement initial

    return () => clearTimeout(timer);
  }, []);

  return null;
}
