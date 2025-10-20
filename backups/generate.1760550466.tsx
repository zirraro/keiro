'use client';
import React from 'react';

type Item = {
  title?: string;
  description?: string;
  url?: string;
  source?: string;
  image?: string;
  imageUrl?: string;
  urlToImage?: string;
  thumbnail?: string;
  publishedAt?: string;
};

const CATEGORY_OPTIONS: { label: string; slug: string }[] = [
  { label: 'À la une',       slug: 'top' },
  { label: 'Politique',      slug: 'politics' },
  { label: 'Économie',       slug: 'economy' },
  { label: 'Business',       slug: 'business' },
  { label: 'Sport',          slug: 'sports' },
  { label: 'People',         slug: 'people' },
  { label: 'Santé',          slug: 'health' },
  { label: 'Restauration',   slug: 'food' },
  { label: 'Tech',           slug: 'technology' },
  { label: 'Culture',        slug: 'culture' },
  { label: 'Monde',          slug: 'world' },
  { label: 'Auto',           slug: 'auto' },
  { label: 'Climat',         slug: 'climate' },
  { label: 'Immo',           slug: 'realestate' },
  { label: 'Lifestyle',      slug: 'lifestyle' },
  { label: 'Gaming',         slug: 'gaming' },
];

function pickImage(it: Item) {
  return it.image || it.imageUrl || it.urlToImage || it.thumbnail || '';
}

export default function GeneratePage() {
  // News
  const [category, setCategory]   = React.useState<string>('technology');
  const [timeframe, setTimeframe] = React.useState<'24h'|'7d'>('24h');
  const [query, setQuery]         = React.useState<string>('');       // barre de recherche
  const [items, setItems]         = React.useState<Item[]>([]);
  const [visible, setVisible]     = React.useState<number>(9);
  const [loading, setLoading]     = React.useState(false);
  const [err, setErr]             = React.useState<string>();
  const [selected, setSelected]   = React.useState<Item>();

  // Génération Seedream
  const [genPrompt, setGenPrompt] = React.useState('');
  const [genSize, setGenSize]     = React.useState('1024x1024');
  const [genGuid, setGenGuid]     = React.useState(3);
  const [genUrl, setGenUrl]       = React.useState<string>();
  const [genLoading, setGenLoading] = React.useState(false);
  const [genErr, setGenErr]       = React.useState<string>();

  // Assistant guidé (étapes)
  const [brand, setBrand]       = React.useState('');
  const [audience, setAudience] = React.useState('');
  const [goal, setGoal]         = React.useState('attirer des prospects');
  const [tone, setTone]         = React.useState('convaincant, clair, professionnel');
  const [emotions, setEmotions] = React.useState('confiance, curiosité, désir');
  const [pains, setPains]       = React.useState('perte de temps, coûts');
  const [proof, setProof]       = React.useState('témoignages, chiffres, cas clients');
  const [offer, setOffer]       = React.useState('offre limitée');
  const [channels, setChannels] = React.useState('Instagram Reels, LinkedIn');
  const [cta, setCta]           = React.useState('Demander un devis');

  // compose le prompt à partir des étapes
  const composePrompt = () => {
    const base = selected ? `${selected.title ?? ''} — ${selected.description ?? ''}`.trim() : '';
    const lines = [
      base || 'Visuel éditorial lié à une actualité.',
      `Marque / secteur : ${brand || '—'}.`,
      `Audience : ${audience || '—'}.`,
      `Objectif : ${goal || '—'}.`,
      `Ton : ${tone || '—'}.`,
      `Émotions à susciter : ${emotions || '—'}.`,
      `Douleurs à adresser : ${pains || '—'}.`,
      `Preuves : ${proof || '—'}.`,
      `Offre : ${offer || '—'}.`,
      `Canaux : ${channels || '—'}.`,
      `CTA : ${cta || '—'}.`,
      `Style : clair, lisible, adapté aux réseaux.`,
    ];
    setGenPrompt(lines.join('\n'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // fetch actus
  const effectiveCat = React.useMemo(() => category || 'technology', [category]);

  const fetchNews = React.useCallback(async () => {
    try {
      setLoading(true); setErr(undefined); console.error("news fetch failed", e);
      const params = new URLSearchParams({
        cat: effectiveCat,
        timeframe: timeframe === '24h' ? '24h' : '7d',
        limit: String(visible),
      });
      if (query.trim()) params.set('q', query.trim());
      const r = await fetch(`/api/news/search?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'omit',
        headers: { accept: 'application/json' }
      });
      if(!r.ok){
        const t = await r.text();
        throw new Error(`news_http_${r.status}: ${t.slice(0,200)}`);
      }
      const data = await r.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch(e:any){
      setErr(String(e?.message || e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveCat, timeframe, visible, query]);

  // recherche avec debounce 300ms
  

  // premier chargement immédiat
  React.useEffect(()=>{ fetchNews(); }, []);


  function selectOnCard(it: Item){
    setSelected(it);
    const base = `${it.title ?? ''} — ${it.description ?? ''}`.trim();
    if(base) setGenPrompt(base);
  }

  async function doGenerate(){
    setGenErr(undefined); setGenLoading(true); setGenUrl(undefined);
    try{
      const res = await fetch('/api/ark/generate',{
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({
          prompt: genPrompt || (selected?.title || 'Créer une image'),
          size: genSize,
          guidance_scale: genGuid,
          response_format: 'url',
          watermark: false
        })
      });
      const data = await res.json();
      if(!res.ok || !data?.url){
        throw new Error((data?.error||'ark_error')+': '+(data?.message||data?.status||''));
      }
      setGenUrl(data.url);
    }catch(e:any){
      setGenErr(String(e?.message || e));
    }finally{
      setGenLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header simple (non-fixe), responsive */}
      

      <main className="pt-20" className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* GAUCHE — Actus */}
        <section>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-600">Catégorie</span>
              <select
                className="rounded-md border border-neutral-300 bg-white px-2 py-1"
                value={effectiveCat}
                onChange={(e)=> { setCategory(e.target.value); setVisible(9); }}
              >
                {CATEGORY_OPTIONS.map(o=>(
                  <option key={o.slug} value={o.slug}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="inline-flex rounded-md border bg-white overflow-hidden">
              <button
                onClick={()=>{ setTimeframe('24h'); setVisible(9); }}
                className={`px-3 py-1 text-sm ${timeframe==='24h'?'bg-black text-white':'hover:bg-neutral-50'}`}
              >24h</button>
              <button
                onClick={()=>{ setTimeframe('7d'); setVisible(9); }}
                className={`px-3 py-1 text-sm ${timeframe==='7d'?'bg-black text-white':'hover:bg-neutral-50'}`}
              >7 jours</button>
            </div>

            {/* Barre de recherche (remplace "Rafraîchir") */}
            <div className="flex-1 min-w-[240px]">
              <input
                type="search"
                value={query}
                onChange={(e)=>{ setQuery(e.target.value); setVisible(9); }}
                placeholder="Rechercher une actu précise…"
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm"
              />
            </div>
          </div>

          {err && <div className="mb-3 text-sm text-red-600">Erreur actus : {err}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {loading && Array.from({length:3}).map((_,i)=>(
              <div key={i} className="h-[260px] rounded-md border bg-white animate-pulse" />
            ))}
            {!loading && items.slice(0,visible).map((it,idx)=>{
              const img = pickImage(it);
              const src = img ? `/api/img?u=${encodeURIComponent(img)}` : '';
              return (
                <article
                  key={idx}
                  onClick={()=>selectOnCard(it)}
                  className={`group cursor-pointer rounded-md border overflow-hidden bg-white hover:shadow-sm transition ${selected?.url===it.url?'ring-2 ring-black':''}`}
                  aria-label={it.title || 'actualité'}
                >
                  <div className="h-[180px] bg-neutral-100">
                    {src ? (
                      <img
                        src={src}
                        alt={it.title || 'illustration'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="p-3">
                    <div className="text-xs text-neutral-500 mb-1">{it.source || ''}</div>
                    <h3 className="font-medium leading-snug line-clamp-2">{it.title}</h3>
                    <p className="mt-1 text-sm text-neutral-600 line-clamp-2">{it.description}</p>
                    <div className="mt-3 flex gap-2">
                      {it.url ? (
                        <a href={it.url} target="_blank" className="text-sm rounded border px-2 py-1 bg-white hover:bg-neutral-50">Voir la source</a>
                      ) : null}
                      <button className="text-sm rounded border px-2 py-1 bg-white group-hover:bg-black group-hover:text-white transition">Utiliser cette actu</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* +3 actus */}
          <div className="mt-4 text-center">
            {items.length > visible ? (
              <button
                onClick={()=> setVisible(v=>v+3)}
                className="inline-flex items-center gap-2 text-sm rounded-full border px-3 py-1 bg-white hover:bg-neutral-50"
              >
                +3 actus
              </button>
            ) : null}
          </div>
        </section>

        {/* DROITE — Panneau */}
        <aside className="self-start">
          {/* Drop logo — visuel placeholder */}
          <div className="rounded-lg border-2 border-dashed border-neutral-300 bg-white p-4 mb-4 text-center text-sm text-neutral-600">
            <div className="font-medium mb-1">Insérer un logo (optionnel)</div>
            <div className="text-neutral-500">Glisser-déposer un fichier ou cliquer pour choisir</div>
          </div>

          {/* Assistant guidé */}
          <div className="rounded-lg border bg-white p-4 mb-4">
            <div className="font-medium mb-3">Assistant de prompt</div>

            <div className="space-y-2">
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Marque / secteur" value={brand} onChange={e=>setBrand(e.target.value)} />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Audience visée" value={audience} onChange={e=>setAudience(e.target.value)} />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Objectif (ex. attirer des prospects)" value={goal} onChange={e=>setGoal(e.target.value)} />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Ton (ex. convaincant, clair, pro…)" value={tone} onChange={e=>setTone(e.target.value)} />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Émotions (ex. confiance, curiosité…)" value={emotions} onChange={e=>setEmotions(e.target.value)} />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Douleurs (ex. coûts, complexité…)" value={pains} onChange={e=>setPains(e.target.value)} />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Preuves (ex. chiffres, cas clients…)" value={proof} onChange={e=>setProof(e.target.value)} />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Offre (ex. offre limitée…)" value={offer} onChange={e=>setOffer(e.target.value)} />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Canaux (ex. Instagram Reels, LinkedIn…)" value={channels} onChange={e=>setChannels(e.target.value)} />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="CTA (ex. Demander un devis…)" value={cta} onChange={e=>setCta(e.target.value)} />

              <button
                onClick={composePrompt}
                className="w-full rounded bg-neutral-900 text-white py-2 text-sm hover:bg-black"
              >
                Composer le prompt
              </button>
            </div>

            <textarea
              value={genPrompt}
              onChange={(e)=>setGenPrompt(e.target.value)}
              placeholder="Prompt final (modifiable)"
              className="w-full h-28 rounded border px-3 py-2 mt-3 text-sm"
            />
          </div>

          {/* Génération Seedream */}
          <div className="rounded-lg border bg-white p-4">
            <div className="font-medium mb-3">Génération & édition Seedream</div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <label className="text-sm text-neutral-600">Taille</label>
              <select className="rounded border px-2 py-1" value={genSize} onChange={(e)=>setGenSize(e.target.value)}>
                <option>1024x1024</option>
                <option>768x768</option>
                <option>512x512</option>
              </select>

              <label className="text-sm text-neutral-600">Guidance</label>
              <input
                type="number"
                className="rounded border px-2 py-1"
                min={0} max={20} step={0.5}
                value={genGuid}
                onChange={(e)=> setGenGuid(Number(e.target.value))}
              />
            </div>

            <button
              onClick={doGenerate}
              disabled={genLoading}
              className="w-full rounded bg-black text-white py-2 text-sm disabled:opacity-50"
            >
              {genLoading ? 'Génération…' : 'Générer l’image'}
            </button>

            {genErr && <div className="mt-2 text-sm text-red-600">Erreur : {genErr}</div>}

            {genUrl && (
              <div className="mt-3">
                <img src={genUrl} alt="Aperçu généré" className="w-full h-[220px] object-cover rounded border bg-neutral-100" />
                <a
                  href={`/editor?image=${encodeURIComponent(genUrl)}`}
                  className="mt-2 inline-flex items-center px-3 py-2 rounded border bg-white hover:bg-neutral-50"
                >
                  Éditer dans Seedream
                </a>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
