'use client';
import React from 'react';

type NewsItem = {
  id?: string | number;
  url?: string;
  title?: string;
  description?: string;
  image?: string;
  source?: string;
  publishedAt?: string;
};

type Props = {
  categorySlug: string;          // ex: 'technology'
  period: string;                // ex: '24h' | '7d'...
  searchTerm?: string;           // optionnel
  baseLimit?: number;            // défaut 9
};

export default function NewsGridWithLoadMore({
  categorySlug,
  period,
  searchTerm,
  baseLimit = 9,
}: Props) {
  const [visibleCount, setVisibleCount] = React.useState<number>(baseLimit);
  const [items, setItems] = React.useState<NewsItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [loadingMore, setLoadingMore] = React.useState<boolean>(false);
  const [err, setErr] = React.useState<string>();

  const fetchNews = React.useCallback(async (limit: number) => {
    setErr(undefined);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cat: categorySlug || 'technology',
        timeframe: period || '24h',
        limit: String(limit),
      });
      if (searchTerm && searchTerm.trim()) {
        params.set('q', searchTerm.trim());
      }
      const res = await fetch(`/api/news/search?${params.toString()}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data?.items ?? []);
      setItems(arr as NewsItem[]);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [categorySlug, period, searchTerm]);

  // (Re)charge à chaque changement de filtres, et reset à baseLimit
  React.useEffect(() => {
    setVisibleCount(baseLimit);
    fetchNews(baseLimit);
  }, [baseLimit, fetchNews]);

  const handleLoadMore = async () => {
    const next = visibleCount + 3;
    setVisibleCount(next);
    if (items.length < next) {
      setLoadingMore(true);
      await fetchNews(next);
      setLoadingMore(false);
    }
  };

  return (
    <section className="mt-6">
      {err && (
        <div className="mb-3 text-sm text-red-600">
          Erreur chargement actus : {err}
        </div>
      )}

      {/* Cartes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(items || []).slice(0, visibleCount).map((it, idx) => (
          <article key={String(it.id ?? it.url ?? idx)} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {it.image ? (
              <img
                src={it.image}
                alt={it.title || 'illustration'}
                className="w-full h-44 object-cover"
              />
            ) : (
              <div className="w-full h-44 bg-neutral-100" />
            )}
            <div className="p-3">
              <div className="text-xs text-neutral-500 flex justify-between">
                <span>{it.source || '—'}</span>
                {it.publishedAt && <span>{it.publishedAt}</span>}
              </div>
              <h3 className="mt-1 font-medium line-clamp-2">{it.title}</h3>
              {it.description && (
                <p className="mt-1 text-sm text-neutral-700 line-clamp-3">{it.description}</p>
              )}
              <div className="mt-3 flex gap-2">
                {it.url && (
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded border bg-white hover:bg-neutral-50 text-sm"
                  >
                    Voir la source
                  </a>
                )}
                {/* Tu peux ajouter ici ton bouton "Utiliser cette actu" si besoin */}
              </div>
            </div>
          </article>
        ))}

        {/* Bouton +3 actus */}
        {items.length >= visibleCount && (
          <div className="col-span-full mt-2 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore || loading}
              className="px-4 py-2 rounded-md border bg-white hover:bg-neutral-50 disabled:opacity-60"
            >
              {loadingMore ? 'Chargement…' : '+ 3 actus'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
