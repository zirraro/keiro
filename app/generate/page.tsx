'use client';

import Image from 'next/image';
import { useState, type ChangeEvent, type FormEvent } from 'react';

type Sector = 'restaurant' | 'coach' | 'ecommerce';
type OpenAIImageItem = { b64_json: string };
type OpenAIImageResponse = { data?: { data?: OpenAIImageItem[] } } | { demo?: true; url?: string; note?: string };

export default function GeneratePage() {
  const [sector, setSector] = useState<Sector>('restaurant');
  const [context, setContext] = useState<string>('canicule');
  const [offer, setOffer] = useState<string>('Granité maison');
  const [headline, setHeadline] = useState<string>('Besoin de frais ?');
  const [cta, setCta] = useState<string>('Réserver');

  const [loading, setLoading] = useState<boolean>(false);
  const [image, setImage] = useState<string | null>(null); // une seule image
  const [note, setNote] = useState<string | null>(null);

  function handleSectorChange(e: ChangeEvent<HTMLSelectElement>) {
    setSector(e.target.value as Sector);
  }
  function handleInput(setter: (v: string) => void) {
    return (e: ChangeEvent<HTMLInputElement>) => setter(e.target.value);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setImage(null);
    setNote(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector, context, offer, headline, cta }),
      });

      const json = (await res.json()) as OpenAIImageResponse & { error?: string; details?: string; message?: string };

      if (!res.ok) {
        const msg = (json as any)?.details || (json as any)?.error || (json as any)?.message || `Erreur HTTP ${res.status}`;
        alert(msg);
        console.error("API error:", json);
        return;
      }

      // ✅ Cas démo (fallback gratuit)
      if ((json as any).demo && (json as any).url) {
        setImage((json as any).url as string);
        if ((json as any).note) setNote((json as any).note as string);
        return;
      }

      const item = (json as any).data?.data?.[0] as OpenAIImageItem | undefined;
      if (!item?.b64_json) {
        alert("Réponse inattendue de l’IA");
        return;
      }
      setImage(`data:image/png;base64,${item.b64_json}`);
    } catch (err) {
      console.error(err);
      alert("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Générer une image</h1>

        <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
          <div>
            <label className="block text-sm mb-1">Secteur</label>
            <select
              value={sector}
              onChange={handleSectorChange}
              className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
            >
              <option value="restaurant">Restaurant</option>
              <option value="coach">Coach</option>
              <option value="ecommerce">E‑commerce</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Contexte (actualité / événement)</label>
            <input
              value={context}
              onChange={handleInput(setContext)}
              placeholder='Ex: "canicule", "festival de la ville", "journée du chocolat"…'
              className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Offre mise en avant</label>
            <input
              value={offer}
              onChange={handleInput(setOffer)}
              placeholder='Ex: "Granité maison", "Menu canicule -20%"…'
              className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Accroche</label>
              <input
                value={headline}
                onChange={handleInput(setHeadline)}
                placeholder='Ex: "Besoin de frais ?"'
                className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">CTA (bouton)</label>
              <input
                value={cta}
                onChange={handleInput(setCta)}
                placeholder='Ex: "Réserver", "Commander"…'
                className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-5 py-2 rounded bg-white text-black font-semibold disabled:opacity-50"
          >
            {loading ? 'Génération en cours…' : 'Générer 1 image'}
          </button>

          {note && <p className="text-sm text-yellow-400 mt-2">{note}</p>}
        </form>

        {image && (
          <div className="mt-8 max-w-md">
            <div className="rounded overflow-hidden border border-neutral-800">
              <Image
                src={image}
                alt="image générée"
                width={1024}
                height={1024}
                className="w-full h-auto"
                unoptimized
                priority
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
