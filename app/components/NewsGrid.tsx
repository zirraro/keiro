'use client';
import React from 'react';
import { BACKEND_CAT, CATEGORY_LABELS, CleanCategory, textLooksLike } from './categoryMap';

type NewsItem = {
  title?: string;
  description?: string;
  url?: string;
  source?: string;
  image?: string;
  imageUrl?: string;
  urlToImage?: string;
  thumbnail?: string;
  picture_url?: string;
  enclosure?: { url?: string };
  media?: { url?: string }[];
  category?: string;
};

function pickImage(it: NewsItem): string|undefined {
  return (it.image || it.imageUrl || it.urlToImage || it.thumbnail || it.picture_url || it.enclosure?.url || it.media?.[0]?.url);
}

async function fetchNews(cat: CleanCategory, limit=36, timeframe='24h'): Promise<NewsItem[]> {
  const qcat = BACKEND_CAT[cat];
  const url = qcat
    ? `/api/news/search?cat=${encodeURIComponent(qcat)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`
    : `/api/news/search?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json().catch(()=>({ items:[] }));
  let items: NewsItem[] = Array.isArray(data?.items) ? data.items : [];

  // filtre heuristique si backend ne filtre pas nativement
  if (!qcat && cat !== 'actu') {
    items = items.filter(it => textLooksLike(cat, `${it.title||''} ${it.description||''}`));
  }

  return items.map(it => ({ ...it, image: pickImage(it) }));
}

export default function NewsGrid({
  cat='actu',
  initialCount=9,
  step=3,
}: { cat?: CleanCategory; initialCount?: number; step?: number }) {
  const [items, setItems] = React.useState<NewsItem[]>([]);
  const [visible, setVisible] = React.useState(initialCount);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string>();

  React.useEffect(()=>{
    let alive = true;
    setLoading(true); setErr(undefined);
    fetchNews(cat as CleanCategory)
      .then(list => { if(alive){ setItems(list); } })
      .catch(e => setErr(String(e?.message || e)))
      .finally(()=> alive && setLoading(false));
    return ()=>{ alive = false; };
  }, [cat]);

  const shown = items.slice(0, visible);
  const rest = Math.max(items.length - visible, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{CATEGORY_LABELS[cat as CleanCategory] || 'Actu'}</h3>
        {!loading && rest > 0 && (
          <button
            onClick={()=> setVisible(v => v + step)}
            className="text-sm px-3 py-1.5 rounded border border-neutral-300 bg-white hover:bg-neutral-50"
            aria-label="Ajouter 3 actus"
            title="Ajouter 3 actus"
          >
            +3 actus
          </button>
        )}
      </div>

      {loading && <div className="text-sm text-neutral-500">Chargement des articles…</div>}
      {err && <div className="text-sm text-red-600">Erreur actu : {err}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shown.map((it, i) => (
          <a
            key={(it.url||'') + i}
            href={it.url || '#'}
            target="_blank"
            rel="noreferrer"
            className="group rounded-2xl border border-neutral-200 bg-white overflow-hidden hover:shadow-sm transition"
          >
            <div className="aspect-[16/10] w-full bg-neutral-100 overflow-hidden">
              {it.image ? (
                <img
                  src={`/api/img?u=${encodeURIComponent(it.image)}`}
                  alt={it.title || 'Article'}
                  className="h-full w-full object-cover group-hover:scale-[1.02] transition"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-neutral-400 text-xs">pas d’image</div>
              )}
            </div>
            <div className="p-3">
              <div className="text-sm font-medium leading-snug line-clamp-2">{it.title || 'Sans titre'}</div>
              <div className="mt-1 text-xs text-neutral-600 line-clamp-3">{it.description || ''}</div>
            </div>
          </a>
        ))}
      </div>

      {!loading && rest > 0 && (
        <div className="flex justify-center">
          <button
            onClick={()=> setVisible(v => v + step)}
            className="text-sm px-3 py-1.5 rounded border border-neutral-300 bg-white hover:bg-neutral-50"
          >
            +3 actus
          </button>
        </div>
      )}
    </div>
  );
}
