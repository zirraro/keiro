'use client';

import { useEffect, useMemo, useState } from 'react';

type Brand = { id: string; name: string; user_id: string|null; tone: any; created_at: string };
type Generation = { id: string; brand_id: string; source_id: string|null; kind: string; result: any; created_at: string };

function parseMaybeJSON(x:any){ if(typeof x==='string'){ try{return JSON.parse(x)}catch{return x} } return x; }

export default function Studio() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState('');
  const [topic, setTopic] = useState('Lancement produit automne 🍂');
  const [kind, setKind] = useState<'post'|'story'|'tweet'>('post');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [gens, setGens] = useState<Generation[]>([]);

  // Charger brands & generations
  useEffect(() => {
    (async () => {
      try {
        const [bRes, gRes] = await Promise.all([
          fetch('/api/brands', { cache: 'no-store' }),
          fetch('/api/generations', { cache: 'no-store' })
        ]);
        const bJson = await bRes.json();
        const gJson = await gRes.json();
        const b = (bJson.data || []).map((x:any)=>({ ...x, tone: parseMaybeJSON(x.tone) }));
        const g = (gJson.data || []).map((x:any)=>({ ...x, result: parseMaybeJSON(x.result) }));
        setBrands(b);
        setGens(g);
        if (!brandId && b.length) setBrandId(b[0].id);
      } catch (e:any) {
        console.error(e);
        setErrorMsg('Erreur de chargement.');
      }
    })();
  }, []); // first load only

  const currentBrand = useMemo(()=>brands.find(b=>b.id===brandId)||null,[brands,brandId]);
  const voice = currentBrand?.tone?.voice ?? '—';

  async function createSourceAndGenerate() {
    setIsLoading(true);
    setErrorMsg('');
    try {
      if (!brandId) { setErrorMsg('Sélectionne une marque.'); setIsLoading(false); return; }
      if (!topic.trim()) { setErrorMsg('Entre un brief.'); setIsLoading(false); return; }

      // 1) Créer la source (brief)
      const srcRes = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ brand_id: brandId, type: 'brief', payload: { topic } })
      });
      const srcJson = await srcRes.json();
      if (srcJson?.error) throw new Error(srcJson.error?.message || 'Ingestion échouée');
      const source_id = srcJson?.data?.id as string;

      // 2) Générer
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ brand_id: brandId, source_id, kind })
      });
      const genJson = await genRes.json();
      if (genJson?.error) throw new Error(genJson.error?.message || 'Génération échouée');

      // 3) Rafraîchir la liste
      const listRes = await fetch('/api/generations', { cache: 'no-store' });
      const listJson = await listRes.json();
      const g = (listJson.data || []).map((x:any)=>({ ...x, result: parseMaybeJSON(x.result) }));
      setGens(g);
    } catch (e:any) {
      console.error(e);
      setErrorMsg(e?.message || 'Erreur inconnue.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">Studio</h1>
        <p className="text-sm text-neutral-600">
          Saisis un brief, puis génère un contenu pour la marque choisie.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-xl p-4 space-y-3">
          <label className="block text-sm font-medium">Marque</label>
          <select
            value={brandId}
            onChange={(e)=>setBrandId(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          >
            {!brands.length && <option value="">(Aucune marque)</option>}
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <div className="text-xs text-neutral-500">
            Voice: <span className="font-medium">{voice}</span>
          </div>
        </div>

        <div className="border rounded-xl p-4 space-y-3 md:col-span-2">
          <label className="block text-sm font-medium">Brief / sujet</label>
          <textarea
            rows={4}
            value={topic}
            onChange={(e)=>setTopic(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
            placeholder="Ex: Lancement automne 🍂 — tone luxe, CTA -20%..."
          />
          <div className="flex items-center gap-3">
            <select
              value={kind}
              onChange={(e)=>setKind(e.target.value as any)}
              className="border rounded-md px-3 py-2"
            >
              <option value="post">Post</option>
              <option value="story">Story</option>
              <option value="tweet">Tweet</option>
            </select>
            <button
              onClick={createSourceAndGenerate}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
            >
              {isLoading ? 'Génération…' : 'Créer source + Générer'}
            </button>
            {errorMsg && <span className="text-sm text-red-600">{errorMsg}</span>}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Générations récentes</h2>
        {gens.length === 0 ? (
          <div className="text-sm text-neutral-500">Aucune génération pour le moment.</div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gens.map(g => {
              const text: string = g.result?.text ?? '';
              const imageUrl: string | undefined = g.result?.image_url;
              const bVoice: string = g.result?.tone?.voice ?? '—';
              const briefTopic: string = g.result?.brief?.topic ?? '—';
              return (
                <li key={g.id} className="border rounded-xl overflow-hidden">
                  {imageUrl && (
                    <div className="aspect-video bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="generated" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <div className="text-xs text-neutral-500">
                      {new Date(g.created_at).toLocaleString('fr-FR')} • {g.kind} • Voice: {bVoice}
                    </div>
                    <div className="text-sm text-neutral-600">Brief: {briefTopic}</div>
                    <p className="whitespace-pre-wrap">{text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
