'use client';
import React, { useMemo, useState } from 'react';
import EditButton from '@/components/EditButton';

export default function PromptAssistant({
  onGenerate,
  initialPrompt,
}: {
  onGenerate: (payload: {
    prompt: string;
    imageFile: File | null;
    guidance: number;
    style: string;
    strength: number;
  }) => Promise<string>; // retourne l'URL du résultat
  initialPrompt: string;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [guidance, setGuidance] = useState(5.5);
  const [style, setStyle] = useState('Éditorial doux');
  const [strength, setStrength] = useState(0.5); // pour i2i
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const preview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : 'https://picsum.photos/seed/arkdemo/900/700'),
    [imageFile]
  );

  async function handleGenerate() {
    try {
      setBusy(true);
      setError(null);
      setResultUrl(null);
      const url = await onGenerate({ prompt: `${style}. ${prompt}`, imageFile, guidance, style, strength });
      setResultUrl(url);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="rounded-2xl border bg-white p-4 shadow-sm h-fit sticky top-4">
      <h2 className="text-lg font-semibold">Assistant personnalisé</h2>

      <div className="mt-3 grid gap-3">
        <label className="text-sm font-medium">Style</label>
        <select
          className="rounded-lg border p-2"
          value={style}
          onChange={e => setStyle(e.target.value)}
        >
          <option>Éditorial doux</option>
          <option>Commercial net</option>
          <option>Film vintage</option>
          <option>Noir & Blanc riche</option>
          <option>Glow doré</option>
        </select>

        <label className="text-sm font-medium mt-2">Prompt</label>
        <textarea
          rows={6}
          className="w-full rounded-lg border p-3"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Décris précisément ton intention…"
        />

        <label className="text-sm font-medium mt-2">Image de base (optionnel)</label>
        <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] ?? null)} />

        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <label className="text-xs font-medium">Guidance</label>
            <input type="range" min="1" max="9" step="0.1" value={guidance}
              onChange={e => setGuidance(parseFloat(e.target.value))} className="w-full" />
            <div className="text-xs text-neutral-600">{guidance.toFixed(1)}</div>
          </div>
          <div>
            <label className="text-xs font-medium">Force i2i</label>
            <input type="range" min="0" max="1" step="0.05" value={strength}
              onChange={e => setStrength(parseFloat(e.target.value))} className="w-full" />
            <div className="text-xs text-neutral-600">{(strength*100).toFixed(0)}%</div>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={busy || !prompt.trim()}
          className="mt-3 w-full px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
        >
          {busy ? 'Génération…' : 'Générer'}
        </button>

        {error && <p className="text-sm text-red-600">Erreur : {error}</p>}

        <div className="mt-4">
          <div className="text-sm text-neutral-600 mb-2">
            {resultUrl ? 'Résultat' : (imageFile ? 'Aperçu de l’image source' : 'Aperçu (démo)')}
          </div>
          <img src={resultUrl || preview} className="w-full rounded-lg object-cover" alt="preview" />
          {resultUrl && (
            <div className="mt-3 flex gap-2">
              <EditButton srcUrl={resultUrl} />
              <a href={resultUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg border">Télécharger</a>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
