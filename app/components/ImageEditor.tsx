'use client';
import React, { useState } from 'react';

export default function ImageEditor({
  image,
  onClose,
  onUpdated
}:{
  image: string;
  onClose: ()=>void;
  onUpdated: (url:string)=>void;
}) {
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [ratio, setRatio] = useState<'1:1'|'4:5'|'16:9'>('1:1');
  const [style, setStyle] = useState('clean');
  const [strength, setStrength] = useState(0.5);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|undefined>(undefined);

  async function submit() {
    try{
      setBusy(true); setErr(undefined);
      const res = await fetch('/api/gen/edit', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          baseImageDataUrl: image,
          prompt,
          negative_prompt: negative,
          aspect_ratio: ratio,
          style,
          strength
        })
      });
      if(!res.ok){
        const t = await res.text();
        throw new Error(t||`HTTP ${res.status}`);
      }
      const json = await res.json();
      onUpdated(json.imageDataUrl);
      onClose();
    }catch(e:any){
      setErr(e?.message||String(e));
    }finally{
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex">
      <div className="ml-auto h-full w-full max-w-md bg-white shadow-xl p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Éditer l’image</h3>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-black">Fermer</button>
        </div>

        <img src={image} alt="preview" className="w-full h-auto rounded-lg border mb-4"/>

        <label className="block text-sm font-medium mb-1">Ajouts au prompt</label>
        <textarea className="w-full border rounded-md px-3 py-2 mb-3" rows={3}
          placeholder="Ex: ajouter le logo en haut à droite, fond plus lumineux…"
          value={prompt} onChange={e=>setPrompt(e.target.value)} />

        <label className="block text-sm font-medium mb-1">Negative prompt</label>
        <input className="w-full border rounded-md px-3 py-2 mb-3"
          placeholder="Ex: flou, texte illisible"
          value={negative} onChange={e=>setNegative(e.target.value)} />

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <label className="block text-xs text-neutral-600 mb-1">Ratio</label>
            <select className="w-full border rounded-md px-2 py-2" value={ratio} onChange={e=>setRatio(e.target.value as any)}>
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
              <option value="16:9">16:9</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-600 mb-1">Style</label>
            <select className="w-full border rounded-md px-2 py-2" value={style} onChange={e=>setStyle(e.target.value)}>
              <option value="clean">clean</option>
              <option value="bold">bold</option>
              <option value="modern">modern</option>
              <option value="photo">photo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-600 mb-1">Strength</label>
            <input type="range" min={0} max={1} step={0.05} value={strength}
              onChange={e=>setStrength(parseFloat(e.target.value))} className="w-full"/>
          </div>
        </div>

        {err && <div className="text-sm text-red-600 mb-3">Erreur édition : {err}</div>}

        <button disabled={busy}
          onClick={submit}
          className="w-full rounded-md bg-black text-white py-2 disabled:opacity-60">
          {busy? "Application…" : "Appliquer les modifications"}
        </button>
      </div>
    </div>
  );
}
