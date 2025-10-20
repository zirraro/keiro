'use client';

import { useEffect, useState } from 'react';

type Brand = {
  id: string;
  name: string;
  user_id: string | null;
  tone: any;
  created_at: string;
};

export default function Demo() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [name, setName] = useState('');
  const [voice, setVoice] = useState('fun-nature-luxe');
  const [userId, setUserId] = useState('');

  async function load() {
    const res = await fetch('/api/brands', { cache: 'no-store' });
    const json = await res.json();
    setBrands(json.data ?? []);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = { name, tone: { voice } };
    if (userId.trim()) payload.user_id = userId.trim();
    const res = await fetch('/api/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.error) {
      setName('');
      setUserId('');
      await load();
    } else {
      alert(json.error?.message ?? 'Erreur');
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Demo Brands</h1>

      <form onSubmit={onSubmit} className="space-y-3 border rounded-xl p-4">
        <div>
          <label className="block text-sm font-medium">Name *</label>
          <input
            className="w-full border rounded-md px-3 py-2"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Mushu"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Tone / voice</label>
          <input
            className="w-full border rounded-md px-3 py-2"
            value={voice}
            onChange={e => setVoice(e.target.value)}
            placeholder="fun-nature-luxe"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">
            user_id (optionnel, unique si présent)
          </label>
          <input
            className="w-full border rounded-md px-3 py-2"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            placeholder="11111111-1111-1111-1111-111111111111"
          />
        </div>

        <button className="px-4 py-2 rounded-md bg-black text-white">Créer</button>
      </form>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Brands</h2>
        <ul className="space-y-2">
          {brands.map(b => (
            <li key={b.id} className="border rounded-lg p-3">
              <div className="font-medium">{b.name}</div>
              <div className="text-sm text-neutral-600">
                user_id: {b.user_id ?? '—'} • voice: {typeof b.tone === 'string' ? b.tone : b.tone?.voice ?? '—'}
              </div>
              <div className="text-xs text-neutral-500">id: {b.id}</div>
            </li>
          ))}
          {brands.length === 0 && <li className="text-sm text-neutral-500">Aucune brand</li>}
        </ul>
      </section>
    </main>
  );
}
