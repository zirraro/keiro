'use client';
import React from 'react';

export type NewsCard = {
  id: string;
  title: string;
  img: string;
  source: string;
  tag: string;
  hint: string;    // texte à injecter dans le prompt
  time: string;
};
export type NewsCategory = { id: string; name: string; cards: NewsCard[] };

export default function NewsFeed({
  categories,
  active,
  setActive,
  onUseHint,
}: {
  categories: NewsCategory[];
  active: string;
  setActive: (id: string) => void;
  onUseHint: (hint: string) => void;
}) {
  const cat = categories.find(c => c.id === active) ?? categories[0];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`px-3 py-2 rounded-2xl text-sm border transition shadow-sm
              ${active === c.id ? 'bg-black text-white border-black' : 'bg-white hover:bg-neutral-50'}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Grid of news cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cat.cards.map(card => (
          <article
            key={card.id}
            className="group relative overflow-hidden rounded-2xl bg-white border shadow-sm"
          >
            <div className="aspect-[16/10] w-full overflow-hidden">
              <img
                src={card.img}
                alt={card.title}
                className="h-full w-full object-cover transition group-hover:scale-[1.03]"
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 via-black/20 to-transparent text-white">
              <div className="text-[11px] uppercase tracking-wide opacity-90">
                {card.source} • {card.time}
              </div>
              <h3 className="font-semibold leading-snug">{card.title}</h3>
              <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full bg-white/15 border border-white/20 backdrop-blur">
                {card.tag}
              </span>
            </div>

            <div className="p-3">
              <p className="text-sm text-neutral-600 line-clamp-2">{card.hint}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => onUseHint(card.hint)}
                  className="px-3 py-1.5 rounded-lg border text-sm hover:bg-neutral-50"
                  title="Insérer cette idée dans le prompt"
                >
                  Utiliser dans le prompt
                </button>
                <a
                  href={card.img}
                  className="px-3 py-1.5 rounded-lg border text-sm hover:bg-neutral-50"
                  target="_blank" rel="noreferrer"
                >
                  Ouvrir l’image
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
