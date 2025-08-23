'use client';

import { useState } from 'react';

type Objective = 'promo' | 'event' | 'leads';
type Platform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'x';

export default function GeneratePage() {
  const [step, setStep] = useState<1|2|3>(1);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [objective, setObjective] = useState<Objective>('promo');
  const [sector, setSector] = useState('restaurant');
  const [context, setContext] = useState('Canicule');
  const [highlight, setHighlight] = useState('Nouveautés d’été');
  const [headline, setHeadline] = useState('À ne pas manquer');
  const [cta, setCta] = useState('Découvrir');
  const [brandColor, setBrandColor] = useState('#2b82f6');
  const [variants, setVariants] = useState<1|3>(1);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);

  async function onGenerate(e?: React.MouseEvent<HTMLButtonElement>) {
    e?.preventDefault();
    e?.stopPropagation();
    setLoading(true);
    setImages([]);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector,
          context,
          offer: highlight,
          headline,
          cta,
          meta: { objective, brandColor, platform },
          variants,
        }),
      });
      const json = await res.json();
      if (json?.images) {
        setImages(json.images);
        setStep(3);
      } else {
        alert(json?.error || json?.details || 'Erreur API');
      }
    } catch (err: any) {
      alert(err?.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative z-10 min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Créer un visuel</h1>

        {/* Stepper simple */}
        <div className="flex items-center gap-2 text-sm">
          {[1,2,3].map(n => (
            <div key={n} className={`px-3 py-1 rounded-full border ${step===n ? 'bg-white text-black' : 'border-neutral-700 text-neutral-300'}`}>
              Étape {n}
            </div>
          ))}
        </div>

        {/* Étape 1 */}
        {step===1 && (
          <div className="space-y-4 border border-neutral-800 rounded-lg p-4">
            <div>
              <label className="text-sm text-neutral-300">Plateforme</label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {(['instagram','tiktok','facebook','linkedin','x'] as Platform[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={(e)=>{e.preventDefault(); setPlatform(p);}}
                    className={`px-3 py-2 rounded border ${platform===p ? 'bg-white text-black' : 'border-neutral-700'}`}
                  >{p}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-neutral-300">Objectif</label>
              <div className="mt-2 flex gap-2">
                {(['promo','event','leads'] as Objective[]).map(o => (
                  <button
                    key={o}
                    type="button"
                    onClick={(e)=>{e.preventDefault(); setObjective(o); setHeadline(o==='promo'?'À ne pas manquer': o==='event'?'C’est maintenant':'On vous écoute'); setCta(o==='promo'?'Découvrir': o==='event'?'Réserver':'Contact');}}
                    className={`px-3 py-2 rounded border ${objective===o ? 'bg-white text-black' : 'border-neutral-700'}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={(e)=>{e.preventDefault(); e.stopPropagation(); setStep(2);}}
                className="px-4 py-2 rounded bg-white text-black"
              >
                Continuer
              </button>
            </div>
          </div>
        )}

        {/* Étape 2 */}
        {step===2 && (
          <div className="space-y-4 border border-neutral-800 rounded-lg p-4">
            <div>
              <label className="text-sm text-neutral-300">Secteur</label>
              <input
                className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                value={sector}
                onChange={(e)=>setSector(e.target.value)}
                placeholder="restaurant, café, e‑commerce…"
              />
            </div>
            <div>
              <label className="text-sm text-neutral-300">Contexte (actualité)</label>
              <input
                className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                value={context}
                onChange={(e)=>setContext(e.target.value)}
                placeholder='Ex: "canicule", "rentrée", "Black Friday"…'
              />
            </div>
            <div>
              <label className="text-sm text-neutral-300">Mise en avant</label>
              <input
                className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                value={highlight}
                onChange={(e)=>setHighlight(e.target.value)}
                placeholder='Ex: "Nouvelle terrasse"'
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-neutral-300">Accroche</label>
                <input
                  className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                  value={headline}
                  onChange={(e)=>setHeadline(e.target.value)}
                  placeholder='Ex: "On se rafraîchit ?"'
                />
              </div>
              <div>
                <label className="text-sm text-neutral-300">CTA</label>
                <input
                  className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                  value={cta}
                  onChange={(e)=>setCta(e.target.value)}
                  placeholder='Ex: "Réserver", "Découvrir"'
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-neutral-300">Couleur de marque</label>
                <div className="mt-1 flex items-center gap-3">
                  <input type="color" value={brandColor} onChange={(e)=>setBrandColor(e.target.value)} className="w-12 h-10 bg-neutral-900 border border-neutral-700 rounded"/>
                  <input className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2" value={brandColor} onChange={(e)=>setBrandColor(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm text-neutral-300">Variantes</label>
                <div className="mt-2 flex gap-2">
                  {[1,3].map(n=>(
                    <button key={n} type="button" onClick={(e)=>{e.preventDefault(); setVariants(n as 1|3);}}
                      className={`px-3 py-2 rounded border ${variants===n ? 'bg-white text-black' : 'border-neutral-700'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button type="button" onClick={(e)=>{e.preventDefault(); setStep(1);}} className="px-4 py-2 rounded border border-neutral-700">
                ← Retour
              </button>
              <button
                type="button"
                onClick={onGenerate}
                disabled={loading}
                className="px-4 py-2 rounded bg-white text-black disabled:opacity-50"
              >
                {loading ? 'Génération…' : 'Générer'}
              </button>
            </div>
          </div>
        )}

        {/* Étape 3 */}
        {step===3 && (
          <div className="space-y-4 border border-neutral-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold">Résultats</h2>
            {loading ? (
              <div className="text-neutral-400">Préparation…</div>
            ) : images.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {images.map((src, i) => (
                  <div key={i} className="rounded overflow-hidden border border-neutral-800">
                    {/* Image non optimisée pour simplifier */}
                    <img src={src} alt={"gen-"+i} className="w-full h-auto"/>
                    <div className="p-3 text-sm flex gap-4">
                      <a href={src} download={`keiro-${i+1}.png`} className="underline">Télécharger</a>
                      <button type="button" className="underline" onClick={()=>navigator.clipboard.writeText(src)}>Copier l’URL</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-neutral-400">Aucune image pour le moment.</div>
            )}
            <div>
              <button type="button" onClick={()=>{setStep(1);}} className="px-4 py-2 rounded border border-neutral-700">
                Recommencer
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
