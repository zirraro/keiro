'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export default function EditorClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const src = sp.get('src') || '';
  const prompt = sp.get('prompt') || '';
  const v = sp.get('v') || 'v1';

  const [busy, setBusy] = useState(false);

  // EXEMPLE SIMPLE D’UI (remplace ici par ta logique i2i existante)
  async function onApply() {
    try {
      setBusy(true);
      // TODO: appelle /api/ark-edit avec src/prompt/params
      // await fetch('/api/ark-edit', { ... })
      alert('Edition envoyée (démo) — branche ici ton appel réel.');
    } catch (e) {
      console.error(e);
      alert('Édition échouée');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!src) {
      // si pas d'image → renvoyer vers /generate
      router.replace('/generate');
    }
  }, [src, router]);

  if (!src) {
    return <div className="p-6">Redirection…</div>;
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Original / Aperçu */}
      <div className="lg:col-span-2 space-y-4">
        <div className="text-sm text-neutral-500">Version en cours : {v}</div>
        <div className="rounded-xl overflow-hidden border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="aperçu" className="w-full h-auto" />
        </div>
      </div>

      {/* Panneau d'édition à droite */}
      <aside className="space-y-4">
        <div className="p-4 rounded-xl border bg-white">
          <div className="font-medium mb-2">Demander une modification</div>
          <p className="text-sm text-neutral-600 mb-2">
            Indique précisément le rendu souhaité (ex. “ajouter un halo doré discret et renforcer le contraste”).
          </p>
          <textarea
            defaultValue={prompt}
            placeholder="Votre demande d'édition…"
            className="w-full h-28 resize-y rounded-lg border px-3 py-2"
            id="editPrompt"
          />
          <button
            onClick={onApply}
            disabled={busy}
            className="mt-3 w-full rounded-lg px-3 py-2 bg-black text-white disabled:opacity-50"
          >
            {busy ? 'Application…' : 'Appliquer l’édition'}
          </button>
        </div>

        <div className="p-4 rounded-xl border bg-white">
          <div className="font-medium mb-2">Guidage créatif</div>
          <label className="block text-sm mb-1">Variation (respect de l’image d’origine)</label>
          <input type="range" min={0} max={100} defaultValue={35} className="w-full" />
          <label className="block text-sm mt-3 mb-1">Guidance (fidélité au brief)</label>
          <input type="range" min={0} max={100} defaultValue={60} className="w-full" />
        </div>
      </aside>
    </div>
  );
}
