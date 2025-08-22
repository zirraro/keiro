'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';

/* --- Design system maison (shadcn-like) --- */
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

/* --- Types & presets --- */
type Objective = 'promo' | 'event' | 'leads';
type Sector = 'restaurant' | 'cafe' | 'bar' | 'ecommerce' | 'beauty' | 'fitness' | 'other';
type Platform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'x';
type APIResp =
  | { images: string[]; demo?: boolean; note?: string }
  | { error?: string; details?: string; message?: string };

const TREND_SUGGESTIONS = ['Canicule', 'Match des Bleus', 'Rentrée', 'Black Friday'];
const DEFAULT_CTA: Record<Objective, string> = { promo: 'Découvrir', event: 'Réserver', leads: 'Contact' };
const DEFAULT_HEADLINE: Record<Objective, string> = {
  promo: 'À ne pas manquer',
  event: 'C’est maintenant',
  leads: 'On vous écoute',
};
const SECTOR_LABEL: Record<Exclude<Sector, 'other'>, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  ecommerce: 'E‑commerce',
  beauty: 'Beauté',
  fitness: 'Fitness',
};
const SECTOR_PRESETS: Record<Exclude<Sector, 'other'>, { highlight: string }> = {
  restaurant: { highlight: 'Nouveautés d’été' },
  cafe: { highlight: 'Boissons glacées maison' },
  bar: { highlight: 'Soirée du week‑end' },
  ecommerce: { highlight: 'Nouveautés en stock' },
  beauty: { highlight: 'Soin signature' },
  fitness: { highlight: 'Coaching express' },
};
const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
};

export default function GeneratePage() {
  /* Étapes */
  const [step, setStep] = useState<1 | 2 | 3>(1);

  /* Choix guidés */
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [objective, setObjective] = useState<Objective>('promo');
  const [sector, setSector] = useState<Sector>('restaurant');
  const [otherSector, setOtherSector] = useState<string>('');
  const [businessType, setBusinessType] = useState<string>('');

  const [context, setContext] = useState<string>('Canicule');
  const [highlight, setHighlight] = useState<string>(SECTOR_PRESETS['restaurant'].highlight); // “Mise en avant”
  const [headline, setHeadline] = useState<string>(DEFAULT_HEADLINE['promo']);
  const [cta, setCta] = useState<string>(DEFAULT_CTA['promo']);
  const [brandColor, setBrandColor] = useState<string>('#2b82f6');

  const [variants, setVariants] = useState<1 | 3>(1); // 1 ou 3 propositions

  /* Résultats */
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  /* Helpers */
  function onObjective(o: Objective) {
    setObjective(o);
    setHeadline(DEFAULT_HEADLINE[o]);
    setCta(DEFAULT_CTA[o]);
  }
  function onSector(next: Sector) {
    setSector(next);
    if (next !== 'other') {
      setOtherSector('');
      setHighlight(SECTOR_PRESETS[next].highlight);
    }
  }
  function inspireMe() {
    const sectors: Sector[] = ['restaurant', 'cafe', 'bar', 'ecommerce', 'beauty', 'fitness'];
    const rndSector = sectors[Math.floor(Math.random() * sectors.length)] as Exclude<Sector, 'other'>;
    onSector(rndSector);
    const objs: Objective[] = ['promo', 'event', 'leads'];
    onObjective(objs[Math.floor(Math.random() * objs.length)]);
    setContext(TREND_SUGGESTIONS[Math.floor(Math.random() * TREND_SUGGESTIONS.length)]);
    if (!businessType) {
      setBusinessType(
        rndSector === 'restaurant' ? 'restaurant italien' :
        rndSector === 'beauty' ? 'salon de coiffure' :
        ''
      );
    }
  }

  const sectorDisplay = useMemo(() => {
    if (sector === 'other') return otherSector.trim() || 'Autre';
    return SECTOR_LABEL[sector];
  }, [sector, otherSector]);

  const brief = useMemo(
    () =>
      [
        `Plateforme: ${PLATFORM_LABEL[platform]}`,
        `Objectif: ${objective}`,
        `Secteur: ${sectorDisplay}${businessType ? ` — ${businessType}` : ''}`,
        `Contexte: ${context}`,
        `Mise en avant: ${highlight}`,
        `Accroche: "${headline}"`,
        `CTA: "${cta}"`,
        `Couleur: ${brandColor}`,
        `Propositions: ${variants}`,
      ].join('\n'),
    [platform, objective, sectorDisplay, businessType, context, highlight, headline, cta, brandColor, variants]
  );

  async function onGenerate() {
    setLoading(true);
    setImages([]);
    setNote(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector: sectorDisplay,
          context,
          offer: highlight, // mapping “mise en avant”
          headline,
          cta,
          meta: { objective, brandColor, businessType, platform },
          variants,
        }),
      });
      const json = (await res.json()) as APIResp;

      if ('images' in json) {
        setImages(json.images || []);
        if ('note' in json && json.note) setNote(json.note as string);
      } else {
        const msg = (json as any).details || (json as any).error || (json as any).message || 'Erreur API';
        alert(msg);
        console.error(json);
      }
    } catch (e: any) {
      alert(e?.message || 'Erreur réseau');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(59,130,246,.14),transparent)] bg-neutral-950 text-neutral-100">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header simple */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-500" />
            <h1 className="text-2xl sm:text-3xl font-bold">Keiro — Générer un visuel</h1>
          </div>
          <a href="/" className="text-sm text-neutral-300 hover:text-white">Accueil</a>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`px-3 py-1 rounded-full border ${
                step === n ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-300'
              }`}
            >
              Étape {n}
            </span>
          ))}
          <span className="text-neutral-500 ml-2">Guidé • <span className="opacity-60">Mode libre (bientôt)</span></span>
        </div>

        {/* ÉTAPE 1 */}
        {step === 1 && (
          <Card className="p-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Plateforme */}
              <section>
                <h2 className="text-sm text-neutral-300 mb-2">Plateforme</h2>
                <div className="grid grid-cols-5 gap-2">
                  {(['instagram','tiktok','facebook','linkedin','x'] as Platform[]).map((p) => (
                    <Button
                      key={p}
                      variant={platform === p ? 'primary' : 'outline'}
                      onClick={() => setPlatform(p)}
                      className="w-full"
                    >
                      {PLATFORM_LABEL[p]}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-2">Format choisi automatiquement selon le réseau.</p>
              </section>

              {/* Objectif */}
              <section>
                <h2 className="text-sm text-neutral-300 mb-2">Objectif</h2>
                <div className="grid grid-cols-3 gap-2">
                  {(['promo','event','leads'] as Objective[]).map((o) => (
                    <Button
                      key={o}
                      variant={objective === o ? 'primary' : 'outline'}
                      onClick={() => onObjective(o)}
                      className="text-left"
                    >
                      {o === 'promo' ? 'Mise en avant' : o === 'event' ? 'Événement / Actu' : 'Contact / RDV'}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-2">CTA suggéré : {DEFAULT_CTA[objective]}</p>
              </section>

              {/* Secteur */}
              <section className="lg:col-span-2">
                <h2 className="text-sm text-neutral-300 mb-2">Secteur</h2>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(['restaurant','cafe','bar','ecommerce','beauty','fitness'] as Exclude<Sector,'other'>[]).map((s) => (
                    <Button
                      key={s}
                      variant={sector === s ? 'primary' : 'outline'}
                      onClick={() => onSector(s)}
                      className="w-full"
                    >
                      {SECTOR_LABEL[s]}
                    </Button>
                  ))}
                  <Button
                    variant={sector === 'other' ? 'primary' : 'outline'}
                    onClick={() => onSector('other')}
                    className="w-full"
                  >
                    Autre
                  </Button>
                </div>
                {sector === 'other' && (
                  <div className="mt-3">
                    <Input
                      value={otherSector}
                      onChange={(e) => setOtherSector(e.target.value)}
                      placeholder='Ex : "pharmacie", "librairie", "salle d’escalade"…'
                    />
                    <p className="text-xs text-neutral-500 mt-1">Astuce : ajoutez un mot‑clé (italien, bio, local…)</p>
                  </div>
                )}
              </section>

              {/* Type de business */}
              <section className="lg:col-span-2">
                <h2 className="text-sm text-neutral-300 mb-2">Type de business (précision)</h2>
                <Input
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  placeholder='Ex : "restaurant italien", "salon de coiffure bio", "boutique sneakers"…'
                />
              </section>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="outline" onClick={inspireMe}>🎲 Inspire‑moi</Button>
              <Button onClick={() => setStep(2)}>Continuer</Button>
            </div>
          </Card>
        )}

        {/* ÉTAPE 2 */}
        {step === 2 && (
          <Card className="p-6">
            <div className="space-y-6">
              <section>
                <h2 className="text-sm text-neutral-300 mb-2">Tendances du moment</h2>
                <div className="flex flex-wrap gap-2">
                  {TREND_SUGGESTIONS.map((t) => (
                    <Badge key={t} active={context === t} onClick={() => setContext(t)}>
                      {t}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-1">Ex : “Canicule”, “Rentrée”, “Match des Bleus”…</p>
              </section>

              <section>
                <h2 className="text-sm text-neutral-300 mb-2">Mise en avant</h2>
                <Input
                  value={highlight}
                  onChange={(e) => setHighlight(e.target.value)}
                  placeholder='Ex : "Nouvelle terrasse", "Nouveautés d’été", "Ouvert 7j/7"…'
                />
                <p className="text-xs text-neutral-500 mt-1">Pas obligé de faire une promo — mettez ce que vous voulez montrer.</p>
              </section>

              <div className="grid sm:grid-cols-2 gap-3">
                <section>
                  <h2 className="text-sm text-neutral-300 mb-2">Accroche</h2>
                  <Input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder='Ex : "On se rafraîchit ?"'
                  />
                </section>
                <section>
                  <h2 className="text-sm text-neutral-300 mb-2">CTA (bouton)</h2>
                  <Input
                    value={cta}
                    onChange={(e) => setCta(e.target.value)}
                    placeholder='Ex : "Réserver", "Découvrir"'
                  />
                </section>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>← Retour</Button>
                <Button onClick={() => setStep(3)}>Continuer</Button>
              </div>
            </div>
          </Card>
        )}

        {/* ÉTAPE 3 */}
        {step === 3 && (
          <Card className="p-6">
            <div className="space-y-6">
              <section>
                <h2 className="text-sm text-neutral-300 mb-2">Couleur de marque (optionnel)</h2>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-12 h-10 p-0 border border-neutral-700 rounded bg-neutral-900"
                  />
                  <Input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                  />
                </div>
              </section>

              <section>
                <h2 className="text-sm text-neutral-300 mb-2">Nombre de propositions</h2>
                <div className="flex gap-2">
                  {[1, 3].map((n) => (
                    <Badge key={n} active={variants === n} onClick={() => setVariants(n as 1 | 3)}>
                      {n}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-1">3 variantes = 3 appels IA (crédits).</p>
              </section>

              <section className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/40">
                <p className="text-sm text-neutral-300 mb-2">Brief envoyé à l’IA :</p>
                <pre className="text-xs whitespace-pre-wrap text-neutral-300">{brief}</pre>
              </section>

              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>← Retour</Button>
                <Button onClick={onGenerate} disabled={loading}>
                  {loading ? 'Génération…' : 'Générer'}
                </Button>
                {note && <span className="text-sm text-yellow-400">{note}</span>}
              </div>
            </div>
          </Card>
        )}

        {/* Résultats */}
        <div className="mt-2">
          {loading && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(variants)].map((_, i) => (
                <div key={i} className="h-64 rounded-xl bg-neutral-800 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && images.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {images.map((src, i) => (
                <Card key={i} className="overflow-hidden">
                  <Image src={src} alt={`gen-${i}`} width={1024} height={1024} className="w-full h-auto" unoptimized priority={i===0}/>
                  <div className="flex items-center gap-4 p-3 text-sm">
                    <a href={src} download={`keiro-${i + 1}.png`} className="underline underline-offset-4 hover:opacity-80">
                      Télécharger
                    </a>
                    <button className="underline underline-offset-4 hover:opacity-80" onClick={() => navigator.clipboard.writeText(src)}>
                      Copier l’URL
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
