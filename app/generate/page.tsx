'use client';

import Image from 'next/image';
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';

type Sector =
  | 'restaurant' | 'cafe' | 'bar'
  | 'coach' | 'fitness' | 'beauty'
  | 'ecommerce' | 'fashion' | 'tech'
  | 'real_estate' | 'automotive' | 'events';

type Platform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'x';
type Aspect = '1:1' | '4:5' | '9:16' | '16:9';
type StylePreset =
  | 'minimal' | 'bold' | 'elegant' | 'playful'
  | 'futuristic' | 'retro' | 'photo' | 'flat-illustration';

type Goal = 'awareness' | 'promotion' | 'leadgen' | 'event';
type Tone = 'punchy' | 'friendly' | 'premium' | 'fun' | 'urgent';

type OpenAIImageItem = { b64_json: string };
type APIOk =
  | { data?: { data?: OpenAIImageItem[] } }
  | { demo?: true; url?: string; note?: string };

function Chip({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 py-1 rounded-full border text-sm transition',
        selected ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-200 hover:bg-neutral-800',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

const sectorOptions: { value: Sector; label: string }[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Café' },
  { value: 'bar', label: 'Bar' },
  { value: 'coach', label: 'Coach/Consultant' },
  { value: 'fitness', label: 'Fitness/Santé' },
  { value: 'beauty', label: 'Beauté/Coiffure' },
  { value: 'ecommerce', label: 'E‑commerce' },
  { value: 'fashion', label: 'Mode/Créateurs' },
  { value: 'tech', label: 'Tech/SaaS' },
  { value: 'real_estate', label: 'Immobilier' },
  { value: 'automotive', label: 'Auto/Moto' },
  { value: 'events', label: 'Événementiel' },
];
const platformOptions: { value: Platform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'x', label: 'X (Twitter)' },
];
const aspectOptions: { value: Aspect; label: string }[] = [
  { value: '1:1', label: 'Carré (1:1)' },
  { value: '4:5', label: 'Portrait (4:5 IG)' },
  { value: '9:16', label: 'Story/Reel (9:16)' },
  { value: '16:9', label: 'Paysage (16:9)' },
];
const styleOptions: { value: StylePreset; label: string }[] = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'bold', label: 'Bold / Impact' },
  { value: 'elegant', label: 'Élégant' },
  { value: 'playful', label: 'Ludique' },
  { value: 'futuristic', label: 'Futuriste' },
  { value: 'retro', label: 'Rétro' },
  { value: 'photo', label: 'Photo réaliste' },
  { value: 'flat-illustration', label: 'Flat illustration' },
];
const goalOptions: { value: Goal; label: string }[] = [
  { value: 'awareness', label: 'Notoriété' },
  { value: 'promotion', label: 'Promo / Offre' },
  { value: 'leadgen', label: 'Génération de leads' },
  { value: 'event', label: 'Événement' },
];
const toneOptions: { value: Tone; label: string }[] = [
  { value: 'punchy', label: 'Punchy' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'premium', label: 'Premium' },
  { value: 'fun', label: 'Fun' },
  { value: 'urgent', label: 'Urgent' },
];

export default function GeneratePage() {
  const [sector, setSector] = useState<Sector>('restaurant');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [goal, setGoal] = useState<Goal>('promotion');
  const [tone, setTone] = useState<Tone>('punchy');

  const [context, setContext] = useState<string>('canicule / météo très chaude');
  const [offer, setOffer] = useState<string>('Menu fraîcheur -20%');
  const [headline, setHeadline] = useState<string>('Besoin de frais ?');
  const [cta, setCta] = useState<string>('Réserver');

  const [brandColor, setBrandColor] = useState<string>('#2b82f6');
  const [styles, setStyles] = useState<StylePreset[]>(['bold']);

  const [loading, setLoading] = useState<boolean>(false);
  const [image, setImage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const promptPreview = useMemo(() => {
    const stylesTxt = styles.join(', ');
    return `Secteur: ${sector} | Plateforme: ${platform} | Format: ${aspect}
Objectif: ${goal} | Ton: ${tone}
Contexte: ${context}
Offre: ${offer}
Accroche: "${headline}" | CTA: "${cta}"
Styles: ${stylesTxt} | Couleur marque: ${brandColor}`;
  }, [sector, platform, aspect, goal, tone, context, offer, headline, cta, styles, brandColor]);

  function toggleStyle(p: StylePreset) {
    setStyles(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
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
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector, context, offer, headline, cta,
          meta: { platform, aspect, goal, tone, brandColor, styles },
        }),
      });

      const json = await res.json() as APIOk & { error?: string; details?: string; message?: string };

      if (!res.ok) {
        const msg = (json as any)?.details || (json as any)?.error || (json as any)?.message || `Erreur HTTP ${res.status}`;
        alert(msg);
        console.error('API error:', json);
        return;
      }

      if ((json as any).demo && (json as any).url) {
        setImage((json as any).url as string);
        if ((json as any).note) setNote((json as any).note as string);
        return;
      }

      const item = (json as any).data?.data?.[0] as OpenAIImageItem | undefined;
      if (!item?.b64_json) {
        alert('Réponse inattendue de l’IA');
        return;
      }
      setImage(`data:image/png;base64,${item.b64_json}`);
    } catch (err) {
      console.error(err);
      alert('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Générer une image</h1>

        <form onSubmit={onSubmit} className="grid md:grid-cols-2 gap-8">
          {/* Colonne gauche */}
          <div className="space-y-5">
            <div>
              <label className="block text-sm mb-2">Secteur</label>
              <select value={sector} onChange={(e) => setSector(e.target.value as Sector)} className="w-full p-2 rounded border border-neutral-700 bg-neutral-900">
                {sectorOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm mb-2">Contexte (actualité / événement)</label>
              <input value={context} onChange={handleInput(setContext)} placeholder='Ex: "canicule", "Fête de la musique", "Journée du chocolat"…' className="w-full p-2 rounded border border-neutral-700 bg-neutral-900" />
            </div>

            <div>
              <label className="block text-sm mb-2">Offre mise en avant</label>
              <input value={offer} onChange={handleInput(setOffer)} placeholder='Ex: "Menu fraîcheur -20%"' className="w-full p-2 rounded border border-neutral-700 bg-neutral-900" />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-2">Accroche</label>
                <input value={headline} onChange={handleInput(setHeadline)} placeholder='Ex: "Besoin de frais ?"' className="w-full p-2 rounded border border-neutral-700 bg-neutral-900" />
              </div>
              <div>
                <label className="block text-sm mb-2">CTA (bouton)</label>
                <input value={cta} onChange={handleInput(setCta)} placeholder='Ex: "Réserver", "Commander"…' className="w-full p-2 rounded border border-neutral-700 bg-neutral-900" />
              </div>
            </div>
          </div>

          {/* Colonne droite */}
          <div className="space-y-5">
            <div>
              <label className="block text-sm mb-2">Plateforme cible</label>
              <div className="flex flex-wrap gap-2">
                {platformOptions.map(p => (
                  <Chip key={p.value} label={p.label} selected={platform === p.value} onClick={() => setPlatform(p.value)} />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2">Format</label>
              <div className="flex flex-wrap gap-2">
                {aspectOptions.map(a => (
                  <Chip key={a.value} label={a.label} selected={aspect === a.value} onClick={() => setAspect(a.value)} />
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-2">Objectif</label>
                <select value={goal} onChange={(e) => setGoal(e.target.value as Goal)} className="w-full p-2 rounded border border-neutral-700 bg-neutral-900">
                  {goalOptions.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Ton</label>
                <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className="w-full p-2 rounded border border-neutral-700 bg-neutral-900">
                  {toneOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2">Styles visuels</label>
              <div className="flex flex-wrap gap-2">
                {styleOptions.map(s => (
                  <Chip key={s.value} label={s.label} selected={styles.includes(s.value)} onClick={() => toggleStyle(s.value)} />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2">Couleur de marque (primaire)</label>
              <div className="flex items-center gap-3">
                <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-12 h-10 p-0 border border-neutral-700 rounded bg-neutral-900" />
                <input value={brandColor} onChange={handleInput(setBrandColor)} className="flex-1 p-2 rounded border border-neutral-700 bg-neutral-900" />
              </div>
            </div>
          </div>

          {/* Footer du formulaire */}
          <div className="md:col-span-2">
            <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/40">
              <p className="text-sm text-neutral-300 mb-2">Aperçu du brief envoyé à l’IA :</p>
              <pre className="text-xs whitespace-pre-wrap text-neutral-300">{promptPreview}</pre>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button type="submit" disabled={loading} className="px-5 py-2 rounded bg-white text-black font-semibold disabled:opacity-50">
                {loading ? 'Génération en cours…' : 'Générer 1 image'}
              </button>
              {note && <span className="text-sm text-yellow-400">{note}</span>}
            </div>
          </div>
        </form>

        {/* Résultat */}
        <div className="mt-10">
          {loading && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-64 rounded-lg bg-neutral-800 animate-pulse" />
              ))}
            </div>
          )}

          {image && !loading && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="rounded overflow-hidden border border-neutral-800">
                <Image src={image} alt="image générée" width={1024} height={1024} className="w-full h-auto" unoptimized priority />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
