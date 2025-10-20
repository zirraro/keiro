'use client';

import { useEffect, useMemo, useState } from 'react';

type NewsCard = {
  id: string;
  title: string;
  source: string;
  date?: string;
  image?: string;
  summary?: string;
  url?: string;         // lien vers la source
};

const CATEGORIES = [
  'À la une','Politique','Économie','Business','Sport','People','Santé',
  'Restauration','Tech','Culture','Monde','Auto','Climat','Immo','Lifestyle','Gaming'
];

export default function GeneratePage(){
  // ÉTATS
  const [category, setCategory] = useState<string>('Tech');
  const [query, setQuery] = useState<string>('');
  const [items, setItems] = useState<NewsCard[]>([]);
  const [selected, setSelected] = useState<NewsCard | null>(null);

  // NOTE : remplace ce useEffect par TA récupération d’actus (GNews/NewsData/NewsAPI.ai)
  useEffect(()=>{
    // démo : jeu de cartes statiques à remplacer par ton fetch
    const demo: NewsCard[] = Array.from({length: 9}).map((_,i)=>({
      id: `${category}-${i}`,
      title: `${category} — Démo n°${i+1}`,
      source: 'zonebourse.com',
      date: '2025-10-16',
      image: i%2===0
        ? 'https://picsum.photos/seed/card'+i+'/640/360'
        : undefined,
      summary: 'Résumé bref de la dépêche. Remplace cette démo par tes données.',
      url: 'https://example.com'
    }));
    setItems(demo);
    setSelected(null);
  },[category]);

  // Filtrage local simple
  const visibleItems = useMemo(()=>{
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(c =>
      (c.title||'').toLowerCase().includes(q) ||
      (c.source||'').toLowerCase().includes(q) ||
      (c.summary||'').toLowerCase().includes(q)
    );
  },[items, query]);

  // Lancer la génération (t2i). Branche-le sur ta route existante si différent.
  async function createVisual(){
    try{
      // Compose un prompt simple basé sur l’actu + l’assistant
      const brief = (document.getElementById('brief') as HTMLTextAreaElement)?.value?.trim() || '';
      const tonality = (document.getElementById('tonality') as HTMLSelectElement)?.value;
      const pov      = (document.getElementById('pov') as HTMLSelectElement)?.value;
      if (!selected) { alert('Sélectionne une actualité d’abord.'); return; }
      if (!brief)    { alert('Décris ton besoin dans le brief.'); return; }

      const finalPrompt =
        `Sujet: ${selected.title}. Objectif: ${brief}. ` +
        `Tonalité: ${tonality}. Point de vue: ${pov}. ` +
        `Pas de logo ni d’icône de réseau social.`;

      // Ici tu peux appeler ta route /api/ark-generate (t2i) si tu l’as.
      // Pour rester neutre, on navigue vers le studio avec juste l’image de l’actu (si dispo)
      // ou bien un placeholder. Tu peux remplacer par le résultat de génération.
      const src = selected.image || 'https://picsum.photos/seed/visu/1200/800';
      window.location.href = `/editor?src=${encodeURIComponent(src)}&from=generate`;
    }catch(e:any){
      alert(`Échec génération : ${e?.message || e}`);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-4">
      {/* Barre supérieure : Catégorie + Recherche */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 mb-5">
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-600">Catégorie</label>
          <select
            className="rounded-xl border px-3 py-2"
            value={category}
            onChange={e=>setCategory(e.target.value)}
          >
            {CATEGORIES.map(c=> <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex-1 flex items-center gap-2">
          <input
            value={query}
            onChange={e=>setQuery(e.target.value)}
            placeholder="Rechercher une actu précise…"
            className="w-full rounded-xl border px-3 py-2"
          />
          <button
            onClick={()=>{/* filtrage live, bouton décoratif */}}
            className="rounded-xl border px-4 py-2 bg-black text-white"
          >
            Chercher
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        {/* Colonne gauche : cartes d’actu (3 par ligne) */}
        <section>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleItems.map(card=>(
              <article
                key={card.id}
                className={`rounded-2xl border bg-white overflow-hidden shadow-sm flex flex-col ${
                  selected?.id===card.id ? 'ring-2 ring-black' : ''
                }`}
              >
                {card.image
                  ? <img src={card.image} alt="" className="w-full h-40 object-cover" />
                  : <div className="h-40 bg-neutral-100" />
                }
                <div className="p-4 flex-1 flex flex-col">
                  <div className="text-xs text-neutral-500">{card.source} · {card.date}</div>
                  <h3 className="font-medium mt-1 line-clamp-2">{card.title}</h3>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <a
                      href={card.url || '#'}
                      target="_blank"
                      className="text-sm underline"
                    >
                      Voir la source
                    </a>
                    <button
                      onClick={()=>setSelected(card)}
                      className="rounded-xl px-3 py-1.5 bg-black text-white"
                    >
                      Sélectionner
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* + d’actus (ex : pagination – à brancher plus tard) */}
          <div className="flex justify-center mt-6">
            <button
              onClick={()=>alert('Charge plus d’actus côté serveur (à brancher).')}
              className="rounded-xl border px-4 py-2"
            >
              + d’actus
            </button>
          </div>
        </section>

        {/* Colonne droite : Assistant de prompt */}
        <aside className="rounded-2xl border bg-white p-4 space-y-4">
          <h3 className="font-semibold">Assistant de prompt</h3>

          <div>
            <label className="text-sm block mb-1">Insérer un logo (optionnel)</label>
            <div className="border-2 border-dashed rounded-xl h-28 flex items-center justify-center text-sm text-neutral-500">
              Glisser-déposer ou cliquer
            </div>
          </div>

          <div>
            <label className="text-sm block mb-1">Objectif</label>
            <select id="goal" className="w-full rounded-xl border px-3 py-2">
              <option>Créer une image</option>
              <option>Créer une bannière</option>
              <option>Créer un post social</option>
            </select>
          </div>

          <div>
            <label className="text-sm block mb-1">Tonalité</label>
            <select id="tonality" className="w-full rounded-xl border px-3 py-2">
              <option>Premium</option>
              <option>Énergique</option>
              <option>Minimaliste</option>
              <option>Chaleureuse</option>
            </select>
          </div>

          <div>
            <label className="text-sm block mb-1">Point de vue</label>
            <select id="pov" className="w-full rounded-xl border px-3 py-2">
              <option>Contre-plongée héroïque</option>
              <option>Plongée éditoriale</option>
              <option>Eye-level naturel</option>
              <option>Macro produit</option>
            </select>
          </div>

          <div>
            <label className="text-sm block mb-1">Brief (décris ton besoin)</label>
            <textarea
              id="brief"
              placeholder="Objectif, cible, bénéfice, message, ambiance, CTA…"
              className="w-full h-28 rounded-xl border px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm block mb-1">Prompt final (modifiable)</label>
            <textarea
              placeholder="Le prompt complet sera pré-rempli au clic (si tu le souhaites)."
              className="w-full h-24 rounded-xl border px-3 py-2"
            />
          </div>

          <button
            onClick={createVisual}
            className="w-full rounded-xl px-4 py-2 bg-black text-white"
          >
            Créer un visuel
          </button>
        </aside>
      </div>
    </div>
  );
}
