'use client';
import React from 'react';
import dynamic from 'next/dynamic';

type Preset = 'light' | 'medium' | 'heavy';
const PRESETS: Record<Preset, { label: string; image_strength: number; guidance: number; negative: string }> = {
  light:  { label: 'Légère modif',  image_strength: 0.30, guidance: 3.0, negative: 'keep composition, subject, pose, background; no new objects; no reframing; no style change' },
  medium: { label: 'Modif moyenne', image_strength: 0.55, guidance: 4.0, negative: 'keep general composition; avoid adding new elements; preserve subject identity' },
  heavy:  { label: 'Grande modif',  image_strength: 0.80, guidance: 6.0, negative: 'preserve the core idea only' }
};

const MaskCanvas = dynamic(()=>import('../components/MaskCanvas'), { ssr: false });

export default function EditorPage({ searchParams }: { searchParams: Record<string,string|undefined> }) {
  const initial = decodeURIComponent(searchParams.image ?? '');
  const [src, setSrc] = React.useState<string>(initial);
  const [prompt, setPrompt] = React.useState<string>('Décris la modification (ex: "recolorer la casquette en rouge, rien d’autre").');
  const [preset, setPreset] = React.useState<Preset>('light');
  const [size, setSize] = React.useState<string>('1024x1024');
  const [watermark, setWatermark] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [resultUrl, setResultUrl] = React.useState<string>();
  const [maskDataUrl, setMaskDataUrl] = React.useState<string>();
  const active = PRESETS[preset];

  const [dim, setDim] = React.useState<{w:number,h:number}>({w:1024,h:1024});
  React.useEffect(()=>{
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=> setDim({w: img.naturalWidth || 1024, h: img.naturalHeight || 1024});
    img.src = src;
  }, [src]);

  const doApply = async () => {
    setError(undefined); setLoading(true); setResultUrl(undefined);
    try{
      const res = await fetch('/api/ark/edit', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({
          image: src,
          prompt,
          size,
          response_format: 'url',
          watermark,
          image_strength: active.image_strength,
          guidance_scale: active.guidance,
          negative_prompt: active.negative,
          maskDataUrl
        })
      });
      const data = await res.json();
      if(!res.ok || !data?.url){
        setError((data?.error || 'ark_error') + (data?.status? ` (${data.status})`:''));
      } else {
        setResultUrl(data.url);
      }
    }catch(e:any){
      setError(String(e?.message || e));
    }finally{
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-semibold mb-4">Édition Seedream (Ark)</h1>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <label className="block text-sm font-medium mb-1">Image source (URL)</label>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="https://…/image.jpg"
            value={src}
            onChange={e=>setSrc(e.target.value)}
          />

          <label className="block text-sm font-medium mt-4 mb-1">Prompt d’édition</label>
          <textarea
            className="w-full border rounded px-3 py-2 h-28"
            value={prompt}
            onChange={e=>setPrompt(e.target.value)}
          />

          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Intensité de la modification</div>
            <div className="flex gap-2">
              {(['light','medium','heavy'] as Preset[]).map(p => (
                <button
                  key={p}
                  onClick={()=>setPreset(p)}
                  className={`px-3 py-2 rounded border ${preset===p ? 'bg-black text-white' : 'bg-white hover:bg-neutral-50'}`}
                  type="button"
                >{PRESETS[p].label}</button>
              ))}
            </div>
            <p className="text-xs text-neutral-600 mt-2">
              Sélection actuelle : <b>{active.label}</b> — fidélité={active.image_strength} · guidance={active.guidance}
            </p>
          </div>

          <div className="mt-4 flex gap-3 items-center">
            <label className="flex items-center gap-2">
              <span>Taille</span>
              <select className="border rounded px-2 py-2" value={size} onChange={e=>setSize(e.target.value)}>
                <option>1024x1024</option>
                <option>768x768</option>
                <option>512x512</option>
                <option value="adaptive">adaptive</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={watermark} onChange={e=>setWatermark(e.target.checked)}/>
              Watermark
            </label>
          </div>

          <button
            onClick={doApply}
            disabled={loading || !src || !prompt}
            className="mt-4 px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            type="button"
          >
            {loading ? 'Application…' : 'Appliquer'}
          </button>

          {error && <div className="mt-3 text-sm text-red-600">Erreur : {error}</div>}
        </section>

        <section>
          <div className="text-sm font-medium mb-2">Aperçu source</div>
          {src
            ? <img src={src} alt="source" className="w-full rounded border object-contain max-h-[420px] bg-neutral-50"/>
            : <div className="border rounded p-6 text-neutral-500">Colle ici l’URL d’une image publique.</div>
          }

          <div className="text-sm font-medium mt-6 mb-2">Masque (peins en blanc la zone à modifier)</div>
          <MaskCanvas
            width={dim.w || 1024}
            height={dim.h || 1024}
            onChange={(d)=>setMaskDataUrl(d)}
          />

          <div className="text-sm font-medium mt-6 mb-2">Résultat</div>
          {resultUrl
            ? <img src={resultUrl} alt="résultat" className="w-full rounded border object-contain max-h-[420px] bg-neutral-50"/>
            : <div className="border rounded p-6 text-neutral-500">Lance une édition pour voir le résultat.</div>
          }
        </section>
      </div>
    </main>
  );
}
