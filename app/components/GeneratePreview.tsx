'use client';
import React from 'react';

type PresetKey = 'light' | 'medium' | 'heavy';
const PRESETS: Record<PresetKey, { label: string; guidance: number; helper: string; }> = {
  light:  { label: 'Légère', guidance: 6.5, helper: 'Modification minimale. Conserve étroitement l’original (recoloration, petites retouches).' },
  medium: { label: 'Moyenne', guidance: 5.5, helper: 'Équilibre entre fidélité et changement visible.' },
  heavy:  { label: 'Grande',  guidance: 4.5, helper: 'Transformation marquée mais en gardant l’idée générale.' },
};

export default function GeneratePreview({ selected }: { selected?: any }) {
  const baseFromNews = selected?.title || selected?.description || '';
  const [prompt, setPrompt] = React.useState<string>(
    baseFromNews ? `Illustration éditoriale : ${baseFromNews}` : 'Créer une image'
  );
  React.useEffect(()=>{ if (baseFromNews) setPrompt(`Illustration éditoriale : ${baseFromNews}`); }, [baseFromNews]);

  const [size, setSize] = React.useState<string>('1024x1024');
  const [guidance, setGuidance] = React.useState<number>(3);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [url, setUrl] = React.useState<string>();

  // Edition (i2i)
  const [editPrompt, setEditPrompt] = React.useState<string>('Recolor only the targeted areas. Keep composition & identity.');
  const [preset, setPreset] = React.useState<PresetKey>('light');
  const [editLoading, setEditLoading] = React.useState(false);
  const [editError, setEditError] = React.useState<string>();
  const [editedUrl, setEditedUrl] = React.useState<string>();

  const doGenerate = async ()=>{
    setError(undefined); setLoading(true); setUrl(undefined); setEditedUrl(undefined);
    try{
      const res = await fetch('/api/ark/generate', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ prompt, size, guidance_scale: guidance, watermark: false, response_format: 'url' })
      });
      const data = await res.json();
      if(!res.ok || !data?.url){
        setError((data?.error || 'ark_error') + (data?.status? ` (${data.status})`:''));
      } else {
        setUrl(data.url);
      }
    }catch(e:any){ setError(String(e?.message || e)); }
    finally{ setLoading(false); }
  };

  const doEdit = async ()=>{
    if (!url) return;
    setEditError(undefined); setEditLoading(true); setEditedUrl(undefined);
    try{
      const res = await fetch('/api/ark/edit', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({
          prompt: `${editPrompt} ${preset === 'light' ? 'ONLY minimal changes; DO NOT alter composition.' :
                          preset === 'medium' ? 'Moderate changes allowed; keep subject & layout.' :
                          'Allow strong changes while keeping the core idea.'}`,
          image: url,
          size: 'adaptive',
          guidance_scale: PRESETS[preset].guidance,
          watermark: false,
          response_format: 'url'
        })
      });
      const data = await res.json();
      if(!res.ok || !data?.url){
        setEditError((data?.error || 'ark_error') + (data?.status? ` (${data.status})`:''));
      } else {
        setEditedUrl(data.url);
      }
    }catch(e:any){ setEditError(String(e?.message || e)); }
    finally{ setEditLoading(false); }
  };

  return (
    <div className="rounded-2xl border border-neutral-200 p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium">Génération & édition Seedream</h4>
      </div>

      <div className="space-y-3">
        <textarea
          className="w-full border rounded px-3 py-2 h-24"
          value={prompt}
          onChange={e=>setPrompt(e.target.value)}
          placeholder="Décris l'image à générer…"
        />
        <div className="flex items-center gap-3">
          <label className="text-sm">Taille</label>
          <select className="border rounded px-2 py-2" value={size} onChange={e=>setSize(e.target.value)}>
            <option>1024x1024</option>
            <option>768x768</option>
            <option>512x512</option>
          </select>

          <label className="text-sm">Guidance (t2i)</label>
          <input
            type="number" step="0.5" min="0" max="20"
            className="border rounded px-2 py-1 w-24"
            value={guidance} onChange={e=>setGuidance(Number(e.target.value))}
          />
        </div>

        <button
          onClick={doGenerate}
          disabled={loading}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {loading ? 'Génération…' : 'Générer l’image'}
        </button>

        {error && <div className="text-sm text-red-600">Erreur : {error}</div>}

        {url && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border p-3">
              <div className="text-sm text-neutral-700 mb-2">Résultat</div>
              <img src={url} alt="Aperçu généré" className="w-full h-[260px] object-cover rounded-md border bg-neutral-50" />
            </div>

            {/* Bloc édition i2i */}
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-medium">Éditer cette image</div>
                  <div className="text-xs text-neutral-500">Choisis l’intensité des changements</div>
                </div>
              </div>

              <div className="flex gap-2 mb-2">
                {(['light','medium','heavy'] as PresetKey[]).map(k=>{
                  const active = preset === k;
                  return (
                    <button
                      key={k}
                      onClick={()=>setPreset(k)}
                      className={`px-3 py-1.5 rounded-full border text-sm ${active ? 'bg-black text-white' : 'bg-white hover:bg-neutral-50'}`}
                      title={PRESETS[k].helper}
                    >
                      {PRESETS[k].label}
                    </button>
                  );
                })}
              </div>

              <textarea
                className="w-full border rounded px-3 py-2 h-20"
                value={editPrompt}
                onChange={e=>setEditPrompt(e.target.value)}
                placeholder="Ex: Change only the cap color to red, keep composition & identity."
              />

              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-neutral-500">Fidélité (guidance i2i) suggérée: {PRESETS[preset].guidance}</span>
              </div>

              <button
                onClick={doEdit}
                disabled={editLoading}
                className="mt-3 px-3 py-2 rounded border bg-white hover:bg-neutral-50 disabled:opacity-50"
              >
                {editLoading ? 'Édition…' : 'Appliquer les modifications'}
              </button>

              {editError && <div className="text-xs text-red-600 mt-2">Erreur édition : {editError}</div>}

              {editedUrl && (
                <div className="mt-3">
                  <img src={editedUrl} alt="Aperçu édité" className="w-full h-[260px] object-cover rounded-md border bg-neutral-50" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
