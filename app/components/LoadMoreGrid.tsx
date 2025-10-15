'use client';
import React from 'react';

type News = {
  title: string;
  source?: string;
  published_at?: string;
  image?: string;
  url?: string;
  // ce champ te sert pour “Utiliser cette actu”
  raw?: any;
};

export default function LoadMoreGrid({
  items,
  initial = 9,
  step = 3,
  onPick,
}: {
  items: News[];
  initial?: number;
  step?: number;
  onPick?: (n: News) => void;
}) {
  const [visible, setVisible] = React.useState(initial);
  const shown = Array.isArray(items) ? items.slice(0, visible) : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {shown.map((it, idx) => (
          <article key={idx} className="rounded-xl border border-neutral-200 overflow-hidden bg-white">
            {it.image ? (
              <img src={it.image} alt="" className="w-full h-48 object-cover" />
            ) : (
              <div className="w-full h-48 bg-neutral-100" />
            )}
            <div className="p-3">
              <div className="text-xs text-neutral-500 flex justify-between">
                <span>{it.source || ''}</span>
                <span>{it.published_at || ''}</span>
              </div>
              <h3 className="mt-2 text-sm font-medium line-clamp-2">{it.title}</h3>
              <div className="mt-3 flex gap-2">
                {it.url && (
                  <a
                    href={it.url}
                    target="_blank"
                    className="px-3 py-1 rounded border text-sm hover:bg-neutral-50"
                  >
                    Voir la source
                  </a>
                )}
                {onPick && (
                  <button
                    onClick={() => onPick(it)}
                    className="px-3 py-1 rounded bg-black text-white text-sm"
                  >
                    Utiliser cette actu
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {Array.isArray(items) && visible < items.length && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisible(v => Math.min(v + step, items.length))}
            className="px-4 py-2 rounded border bg-white hover:bg-neutral-50"
          >
            + 3 actus
          </button>
        </div>
      )}
    </div>
  );
}
