'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';

/* Types */
type Objective = 'promo' | 'event' | 'leads';
type Sector = 'restaurant' | 'cafe' | 'bar' | 'ecommerce' | 'beauty' | 'fitness' | 'other';
type Platform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'x';
type AdvancedFormat = 'auto' | 'square' | 'vertical' | 'wide';

type APIDemo = { demo?: true; url?: string; note?: string };
type OpenAIItem = { b64_json: string };
type APIOk = { data?: { data?: OpenAIItem[] } };
type APIResp = (APIOk & APIDemo) | { error?: string; details?: string; message?: string };

/* Presets concis */
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

/* Mapping format auto par plateforme */
function autoFormatFor(platform: Platform): AdvancedFormat {
  switch (platform) {
    case 'instagram': return 'square';   // feed carré par défaut (1:1)
    case 'tiktok':    return 'vertical'; // 9:16
    case 'facebook':  return 'square';   // polyvalent (1:1)
    case 'linkedin':  return 'wide';     // 1.91:1
    case 'x':         return 'wide';     // 16:9 approx
    default:          return 'square';
  }
}

export default function GeneratePage() {
  /* Étapes */
  const [step, setStep] = useState<1 | 2 | 3>(1);

  /* Choix guidés */
  const [objective, setObjective] = useState<Objective>('promo');
  const [platform, setPlatform] = useState<Platform>('instagram'); // ✅ on demande juste la plateforme
  const [sector, setSector] = useState<Sector>('restaurant');
  const [otherSector, setOtherSector] = useState<string>('');
  const [businessType, setBusinessType] = useState<string>('');

  const [context, setContext] = useState<string>('Canicule');
  const [highlight, setHighlight] = useState<string>(SECTOR_PRESETS['restaurant'].highlight); // “Mise en avant”
  const [headline, setHeadline] = useState<string>(DEFAULT_HEADLINE['promo']);
  const [cta, setCta] = useState<string>(DEFAULT_CTA['promo']);
  const [brandColor, setBrandColor] = useState<string>('#2b82f6');

  /* Options avancées (repliées) */
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advFormat, setAdvFormat] = useState<AdvancedFormat>('auto'); // Auto par défaut

  /* Résultat */
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  /* Sync */
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
    setObjective(objs[Math.floor(Math.random() * objs.length)]);
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

  /* Format effectif (auto ou avancé) */
  const effectiveFormat: AdvancedFormat = useMemo(() => {
    if (advFormat === 'auto') return autoFormatFor(platform);
    return advFormat;
  }, [platform, advFormat]);

  const brief = useMemo(
    () =>
      [
        `Plateforme: ${PLATFORM_LABEL[platform]} (format: ${effectiveFormat})`,
        `Objectif: ${objective}`,
        `Secteur: ${sectorDisplay}${businessType ? ` — ${businessType}` : ''}`,
        `Contexte: ${context}`,
        `Mise en avant: ${highlight}`,
        `Accroche: "${headline}"`,
        `CTA: "${cta}"`,
        `Couleur: ${brandColor}`,
      ].join('\n'),
    [platform, effectiveFormat, objective, sectorDisplay, businessType, context, highlight, headline, cta, brandColor]
  );

  /* Appel API (1 image) */
  async function generateOnce(): Promise<string | null> {
    // mapping : “highlight” -> “offer” pour la route existante
    const body = {
      sector: sectorDisplay,
      context,
      offer: highlight,
      headline,
      cta,
      meta: {
        objective,
        brandColor,
        businessType,
        platform,
        format: effectiveFormat, // on passe le format effectif (auto-résolu)
      },
    };

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as APIResp;

    if (!('data' in json) && !('demo' in json)) {
      const msg = (json as any).details || (json as any).error || (json as any).message || 'Erreur API';
      throw new Error(msg);
    }
    if ((json as any).demo && (json as any).url) {
      if ((json as any).note) setNote((json as any).note as string);
      return (json as any).url as string;
    }
    const item = (json as any).data?.data?.[0] as OpenAIItem | undefined;
    if (!item?.b64_json) return null;
    return `data:image/png;base64,${item.b64_json}`;
  }

  async function onGenerate() {
    setLoading(true);
    setImages([]);
    setNote(null);
    try {
      const img = await generateOnce();
      if (img) setImages([img]);
    } catch (e: any) {
      alert(e.message || 'Erreur');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Créer un visuel</h1>

        {/* Étapes */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          {[1, 2, 3].map((n) => (
            <span key={n} className={`px-3 py-1 rounded-full border ${step === n ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-300'}`}>
              Étape {n}
            </span>
          ))}
          <span className="text-neutral-500 ml-2">Guidé • <span className="opacity-60">Mode libre (bientôt)</span></span>
        </div>

        {/* ÉTAPE 1 — Plateforme + Objectif + Secteur */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Plateforme */}
            <div>
              <p className="text-sm text-neutral-300 mb-2">Plateforme</p>
              <div className="grid grid-cols-5 gap-2">
                {(['instagram','tiktok','facebook','linkedin','x'] as Platform[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`p-3 rounded-lg border text-center ${platform === p ? 'bg-white text-black border-white' : 'border-neutral-700 hover:bg-neutral-900'}`}
                    title={PLATFORM_LABEL[p]}
                  >
                    {PLATFORM_LABEL[p]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-500 mt-2">Le bon format est choisi automatiquement pour chaque plateforme.</p>
            </div>

            {/* Objectif */}
            <div>
              <p className="text-sm text-neutral-300 mb-2">Objectif</p>
              <div className="grid grid-cols-3 gap-2">
                {(['promo', 'event', 'leads'] as Objective[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => onObjective(o)}
                    className={`p-4 rounded-lg border text-left ${objective === o ? 'bg-white text-black border-white' : 'border-neutral-700 hover:bg-neutral-900'}`}
                  >
                    <div className="font-semibold capitalize">
                      {o === 'promo' ? 'Mise en avant' : o === 'event' ? 'Événement / Actu' : 'Contact / RDV'}
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">CTA suggéré : {DEFAULT_CTA[o]}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Secteur */}
            <div>
              <p className="text-sm text-neutral-300 mb-2">Secteur</p>
              <div className="grid grid-cols-3 gap-2">
                {(['restaurant', 'cafe', 'bar', 'ecommerce', 'beauty', 'fitness'] as Exclude<Sector, 'other'>[]).map(
                  (s) => (
                    <button
                      key={s}
                      onClick={() => onSector(s)}
                      className={`p-4 rounded-lg border ${sector === s ? 'bg-white text-black border-white' : 'border-neutral-700 hover:bg-neutral-900'}`}
                    >
                      {SECTOR_LABEL[s]}
                    </button>
                  )
                )}
                <button
                  onClick={() => onSector('other')}
                  className={`p-4 rounded-lg border ${sector === 'other' ? 'bg-white text-black border-white' : 'border-neutral-700 hover:bg-neutral-900'}`}
                >
                  Autre (préciser)
                </button>
              </div>

              {sector === 'other' && (
                <div className="mt-3">
                  <input
                    value={otherSector}
                    onChange={(e) => setOtherSector(e.target.value)}
                    placeholder='Ex : "pharmacie", "salle d’escalade", "librairie"…'
                    className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
                  />
                  <p className="text-xs text-neutral-500 mt-1">Astuce : ajoutez un mot‑clé (ex. “italien”, “bio”, “local”…)</p>
                </div>
              )}
            </div>

            {/* Type de business */}
            <div>
              <label className="block text-sm mb-1">Type de business (précision)</label>
              <input
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                placeholder='Ex : "restaurant italien", "salon de coiffure bio", "boutique sneakers"…'
                className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
              />
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => inspireMe()} className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900">🎲 Inspire‑moi</button>
              <button onClick={() => setStep(2)} className="px-5 py-2 rounded bg-white text-black font-semibold">Continuer</button>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 — Tendance + Mise en avant + Accroche/CTA */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <p className="text-sm text-neutral-300 mb-2">Tendances du moment</p>
              <div className="flex flex-wrap gap-2">
                {TREND_SUGGESTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setContext(t)}
                    className={`px-3 py-1 rounded-full border text-sm ${context === t ? 'bg-white text-black border-white' : 'border-neutral-700 hover:bg-neutral-900'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-500 mt-1">Ex : “Canicule”, “Rentrée”, “Match des Bleus”…</p>
            </div>

            <div>
              <label className="block text-sm mb-1">Mise en avant</label>
              <input
                value={highlight}
                onChange={(e) => setHighlight(e.target.value)}
                placeholder='Ex : "Nouvelle terrasse", "Nouveautés d’été", "Ouvert 7j/7"…'
                className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
              />
              <p className="text-xs text-neutral-500 mt-1">Pas obligé de faire une promo — mettez ce que vous voulez montrer.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Accroche</label>
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder='Ex : "On se rafraîchit ?"'
                  className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">CTA (bouton)</label>
                <input
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  placeholder='Ex : "Réserver", "Découvrir"'
                  className="w-full p-2 rounded border border-neutral-700 bg-neutral-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(1)} className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900">← Retour</button>
              <button onClick={() => setStep(3)} className="px-5 py-2 rounded bg-white text-black font-semibold">Continuer</button>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 — Couleur & Options avancées & Génération */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <p className="text-sm text-neutral-300 mb-2">Couleur de marque (optionnel)</p>
              <div className="flex items-center gap-3">
                <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-12 h-10 p-0 border border-neutral-700 rounded bg-neutral-900" />
                <input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="flex-1 p-2 rounded border border-neutral-700 bg-neutral-900" />
              </div>
            </div>

            {/* Options avancées minimalistes */}
            <div className="border border-neutral-800 rounded-lg">
              <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-neutral-900">
                Options avancées (facultatif)
                <span className="text-neutral-400">{showAdvanced ? '−' : '+'}</span>
              </button>
              {showAdvanced && (
                <div className="px-4 pb-4">
                  <label className="block text-sm mb-2">Format (par défaut : Auto selon la plateforme)</label>
                  <div className="flex gap-2">
                    {(['auto', 'square', 'vertical', 'wide'] as AdvancedFormat[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setAdvFormat(f)}
                        className={`px-3 py-1 rounded-full border text-sm ${
                          advFormat === f ? 'bg-white text-black border-white' : 'border-neutral-700 hover:bg-neutral-900'
                        }`}
                      >
                        {f === 'auto' ? 'Auto' : f === 'square' ? 'Carré' : f === 'vertical' ? 'Vertical' : 'Large'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">
                    Auto = {PLATFORM_LABEL[platform]} → {autoFormatFor(platform)}.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/40">
              <p className="text-sm text-neutral-300 mb-2">Brief envoyé à l’IA :</p>
              <pre className="text-xs whitespace-pre-wrap text-neutral-300">{brief}</pre>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setStep(2)} className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900">← Retour</button>
              <button onClick={onGenerate} disabled={loading} className="px-5 py-2 rounded bg-white text-black font-semibold disabled:opacity-50">
                {loading ? 'Génération…' : 'Générer'}
              </button>
              {note && <span className="text-sm text-yellow-400">{note}</span>}
            </div>
          </div>
        )}

        {/* Résultats */}
        <div className="mt-10">
          {loading && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-64 rounded-lg bg-neutral-800 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && images.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {images.map((src, i) => (
                <div key={i} className="rounded overflow-hidden border border-neutral-800">
                  <Image src={src} alt={`gen-${i}`} width={1024} height={1024} className="w-full h-auto" unoptimized priority={i === 0} />
                  <div className="flex items-center gap-4 p-2 text-sm">
                    <a href={src} download={`keiro-${i + 1}.png`} className="underline underline-offset-4 hover:opacity-80">Télécharger</a>
                    <button className="underline underline-offset-4 hover:opacity-80" onClick={() => navigator.clipboard.writeText(src)}>Copier l’URL</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
