'use client';
import { useState } from 'react';

export default function GeneratePage() {
  const [sector, setSector] = useState<'restaurant' | 'coach' | 'ecommerce'>('restaurant');
  const [context, setContext] = useState('canicule');
  const [offer, setOffer] = useState('Granité maison');
  const [headline, setHeadline] = useState('Besoin de frais ?');
  const [cta, setCta] = useState('Réserver');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    alert(
      `OK !\nSecteur: ${sector}\nContexte: ${context}\nOffre: ${offer}\nAccroche: ${headline}\nCTA: ${cta}\n\n➡️ Demain on branchera l’IA ici.`
    );

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Générer une image</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Secteur */}
          <div>
            <label className="block text-sm mb-1">Secteur</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value as any)}
              className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
            >
              <option value="restaurant">Restaurant</option>
              <option value="coach">Coach</option>
              <option value="ecommerce">E-commerce</option>
            </select>
          </div>

          {/* Contexte */}
          <div>
            <label className="block text-sm mb-1">Contexte</label>
            <input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder='Ex: "canicule", "festival", "journée du chocolat"…'
              className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
            />
          </div>

          {/* Offre */}
          <div>
            <label className="block text-sm mb-1">Offre</label>
            <input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder='Ex: "Granité maison", "Menu -20%"…'
              className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
            />
          </div>

          {/* Accroche + CTA */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Accroche</label>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder='Ex: "Besoin de frais ?"'
                className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">CTA</label>
              <input
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder='Ex: "Réserver"'
                className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-5 py-2 rounded bg-white text-black font-semibold disabled:opacity-50"
          >
            {loading ? 'Préparation…' : 'Générer 3 images (bientôt)'}
          </button>
        </form>
      </div>
    </main>
  );
}
