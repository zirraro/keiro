'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Modal } from '../../components/ui/modal';
import { Stepper } from '../../components/ui/stepper';
import { TiltCard } from '../../components/ui/tilt-card';
import { SectionReveal } from '../../components/ui/section-reveal';

type Objective = 'promo' | 'event' | 'leads';
type Sector = 'restaurant' | 'cafe' | 'bar' | 'ecommerce' | 'beauty' | 'fitness' | 'other';
type Platform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'x';

type APIImageResp =
  | { images: string[]; demo?: boolean; note?: string }
  | { error?: string; details?: string; message?: string };

type APIVideoCreate =
  | { ok: true; predictionId?: string; videos?: string[]; model?: string }
  | { ok: false; error?: string; detail?: string };

type APIVideoStatus = {
  ok: boolean;
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'canceled' | 'failed' | 404;
  output: string[] | null;
  error: string | null;
  logs: string;
  metrics: unknown;
};

const TREND_SUGGESTIONS = ['Canicule', 'Match des Bleus', 'Rentrée', 'Black Friday', 'Journée du chocolat'];
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
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [platform, setPlatform] = useState<Platform>('instagram');
  const [objective, setObjective] = useState<Objective>('promo');
  const [sector, setSector] = useState<Sector>('restaurant');
  const [otherSector, setOtherSector] = useState<string>('');
  const [businessType, setBusinessType] = useState<string>('');

  const [context, setContext] = useState<string>('Canicule');
  const [highlight, setHighlight] = useState<string>(SECTOR_PRESETS['restaurant'].highlight);
  const [headline, setHeadline] = useState<string>(DEFAULT_HEADLINE['promo']);
  const [cta, setCta] = useState<string>(DEFAULT_CTA['promo']);
  const [brandColor, setBrandColor] = useState<string>('#2b82f6');

  const [variants, setVariants] = useState<1 | 3>(1);

  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);

  // ---- ÉTAT VIDÉO (nouveau) ----
  const [videoPrompt, setVideoPrompt] = useState<string>('cinématique, léger mouvement de caméra');
  const [videoImageUrl, setVideoImageUrl] = useState<string>(''); // facultatif : si tu mets une image → image-to-video
  const [videoRatio, setVideoRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [videoDuration, setVideoDuration] = useState<number>(5);
  const [videoPredictionId, setVideoPredictionId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<'idle'|'starting'|'processing'|'succeeded'|'failed'>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearVideoPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }
  useEffect(() => {
    return () => clearVideoPoll();
  }, []);

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
      setBusinessType(rndSector === 'restaurant' ? 'restaurant italien' : rndSector === 'beauty' ? 'salon de coiffure' : '');
    }
    alert('Brief mis à jour ✨');
  }

  async function onGenerateImages() {
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
          offer: highlight,
          headline,
          cta,
          meta: { objective, brandColor, businessType, platform },
          variants,
        }),
      });
      const json = (await res.json()) as APIImageResp;

      if ('images' in json) {
        setImages(json.images || []);
        if ('note' in json && json.note) setNote(json.note as string);
        setStep(3);
      } else {
        const msg =
          (json as { details?: string; error?: string; message?: string }).details ||
          (json as { error?: string }).error ||
          (json as { message?: string }).message ||
          'Erreur API (image)';
        alert(typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2));
        console.error(json);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      alert(err?.message || 'Erreur réseau (image)');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ---------- VIDÉO : création + polling ----------
  async function onGenerateVideo() {
    try {
      setVideoUrl(null);
      setVideoStatus('starting');
      setVideoPredictionId(null);

      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt && videoPrompt.trim().length ? videoPrompt : `${headline} — ${highlight}`,
          imageUrl: videoImageUrl?.trim() || undefined,
          ratio: videoRatio,
          duration: videoDuration,
        }),
      });

      const json = (await res.json()) as APIVideoCreate;
      if (!json || (json as any).error) {
        setVideoStatus('failed');
        alert((json as any)?.error || (json as any)?.detail || 'Erreur API vidéo');
        return;
      }

      // Deux cas : l’API renvoie déjà des URLs (demo/safe) ou un predictionId (prod)
      if ((json as any).videos && Array.isArray((json as any).videos) && (json as any).videos.length > 0) {
        setVideoUrl((json as any).videos[0]);
        setVideoStatus('succeeded');
        setStep(3);
        return;
      }

      const predictionId = (json as any).predictionId as string | undefined;
      if (!predictionId) {
        setVideoStatus('failed');
        alert('Erreur API vidéo : pas de predictionId');
        return;
      }

      setVideoPredictionId(predictionId);
      setVideoStatus('processing');
      setStep(3);

      // Polling toutes les 5s
      clearVideoPoll();
      pollRef.current = setInterval(async () => {
        try {
          const st = await fetch(`/api/replicate/prediction/${predictionId}`);
          const status = (await st.json()) as APIVideoStatus;

          if (status.status === 'succeeded' && status.output && status.output.length) {
            clearVideoPoll();
            setVideoUrl(status.output[0]);
            setVideoStatus('succeeded');
          } else if (status.status === 'failed') {
            clearVideoPoll();
            setVideoStatus('failed');
            alert(status.error || 'La génération vidéo a échoué.');
          } else {
            // starting / processing → on continue
            setVideoStatus(status.status === 404 ? 'failed' : (status.status as any));
          }
        } catch (err) {
          console.error(err);
        }
      }, 5000);
    } catch (e: any) {
      setVideoStatus('failed');
      alert(e?.message || 'Erreur vidéo');
      console.error(e);
    }
  }

  const isVideoBusy = videoStatus === 'starting' || videoStatus === 'processing';

  return (
    <main className="min-h-screen p-6 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(59,130,246,.14),transparent)] bg-neutral-950 text-neutral-100">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold">Créer un visuel / vidéo</h1>
          <div className="text-xs sm:text-sm text-neutral-400">Keiro · Génération IA</div>
        </div>

        <Stepper step={step} total={3} />

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Colonne gauche */}
          <div className="lg:col-span-2 space-y-6">
            {step === 1 && (
              <SectionReveal>
                <TiltCard className="p-6">
                  <div className="grid lg:grid-cols-2 gap-6">
                    <section>
                      <h2 className="text-sm text-neutral-300 mb-2">Plateforme</h2>
                      <div className="grid grid-cols-5 gap-2">
                        {(['instagram','tiktok','facebook','linkedin','x'] as Platform[]).map((p) => (
                          <Button
                            key={p}
                            type="button"
                            variant={platform===p ? 'primary' : 'outline'}
                            onClick={(e)=>{e.preventDefault(); setPlatform(p);}}
                            className="w-full"
                          >
                            {PLATFORM_LABEL[p]}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-neutral-500 mt-2">Format adapté automatiquement.</p>
                    </section>

                    <section>
                      <h2 className="text-sm text-neutral-300 mb-2">Objectif</h2>
                      <div className="grid grid-cols-3 gap-2">
                        {(['promo','event','leads'] as Objective[]).map((o) => (
                          <Button
                            key={o}
                            type="button"
                            variant={objective===o ? 'primary' : 'outline'}
                            onClick={() => onObjective(o)}
                            className="text-left"
                          >
                            {o === 'promo' ? 'Mise en avant' : o === 'event' ? 'Événement / Actu' : 'Contact / RDV'}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-neutral-500 mt-2">CTA suggéré : {DEFAULT_CTA[objective]}</p>
                    </section>

                    <section className="lg:col-span-2">
                      <h2 className="text-sm text-neutral-300 mb-2">Secteur</h2>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {(['restaurant','cafe','bar','ecommerce','beauty','fitness'] as Exclude<Sector,'other'>[]).map((s) => (
                          <Button
                            key={s}
                            type="button"
                            variant={sector === s ? 'primary' : 'outline'}
                            onClick={() => onSector(s)}
                            className="w-full"
                          >
                            {SECTOR_LABEL[s]}
                          </Button>
                        ))}
                        <Button
                          type="button"
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
                    <Button type="button" variant="outline" onClick={inspireMe}>🎲 Inspire‑moi</Button>
                    <Button type="button" onClick={() => setStep(2)}>Continuer</Button>
                  </div>
                </TiltCard>
              </SectionReveal>
            )}

            {step === 2 && (
              <SectionReveal>
                <TiltCard className="p-6">
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
                    </section>

                    <section>
                      <h2 className="text-sm text-neutral-300 mb-2">Mise en avant</h2>
                      <Input
                        value={highlight}
                        onChange={(e) => setHighlight(e.target.value)}
                        placeholder='Ex : "Nouvelle terrasse", "Nouveautés d’été", "Ouvert 7j/7"…'
                      />
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

                    <div className="grid sm:grid-cols-2 gap-3">
                      <section>
                        <h2 className="text-sm text-neutral-300 mb-2">Couleur de marque</h2>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={brandColor}
                            onChange={(e) => setBrandColor(e.target.value)}
                            className="w-12 h-10 p-0 border border-neutral-700 rounded bg-neutral-900"
                          />
                          <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
                        </div>
                      </section>

                      <section>
                        <h2 className="text-sm text-neutral-300 mb-2">Nombre de propositions (images)</h2>
                        <div className="flex gap-2">
                          {[1, 3].map((n) => (
                            <Badge key={n} active={variants === n as 1 | 3} onClick={() => setVariants(n as 1 | 3)}>
                              {n}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-neutral-500 mt-1">3 variantes = 3 appels IA (crédits).</p>
                      </section>
                    </div>

                    {/* Bloc vidéo (nouveau) */}
                    <section className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/40">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm text-neutral-300">Vidéo (beta)</h2>
                        <div className="text-xs text-neutral-400">
                          Modèle: Replicate (ex: luma/ray)
                        </div>
                      </div>
                      <div className="mt-3 grid sm:grid-cols-2 gap-3">
                        <Input
                          value={videoPrompt}
                          onChange={(e)=>setVideoPrompt(e.target.value)}
                          placeholder='Prompt vidéo — ex: "plan cinématique, lumière naturelle, doux mouvement"'
                        />
                        <Input
                          value={videoImageUrl}
                          onChange={(e)=>setVideoImageUrl(e.target.value)}
                          placeholder='Image (optionnel) — URL pour image→vidéo'
                        />
                        <div className="flex gap-2">
                          {(['16:9','1:1','9:16'] as const).map(r => (
                            <Button
                              key={r}
                              type="button"
                              variant={videoRatio===r ? 'primary' : 'outline'}
                              onClick={()=>setVideoRatio(r)}
                            >
                              {r}
                            </Button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-neutral-300">Durée (s):</span>
                          <Input
                            value={String(videoDuration)}
                            onChange={(e)=>setVideoDuration(Math.max(2, Math.min(10, Number(e.target.value) || 5)))}
                            placeholder="5"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-2">
                        Lancement = création de prédiction → polling automatique jusqu’à disponibilité de l’URL vidéo.
                      </p>
                    </section>

                    <section className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/40">
                      <p className="text-sm text-neutral-300 mb-2">Brief envoyé à l’IA (image) :</p>
                      <pre className="text-xs whitespace-pre-wrap text-neutral-300">{brief}</pre>
                    </section>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => setStep(1)}>← Retour</Button>
                        <Button type="button" onClick={onGenerateImages} disabled={loading}>
                          {loading ? 'Génération images…' : 'Générer images'}
                        </Button>
                      </div>
                      <Button type="button" variant="primary" onClick={onGenerateVideo} disabled={isVideoBusy}>
                        {isVideoBusy ? 'Génération vidéo…' : 'Générer la vidéo'}
                      </Button>
                    </div>
                  </div>
                </TiltCard>
              </SectionReveal>
            )}

            {step === 3 && (
              <SectionReveal>
                <TiltCard className="p-6 space-y-6">
                  <h2 className="text-lg font-semibold">Résultats</h2>

                  {/* Résultats images */}
                  <div>
                    <h3 className="text-sm text-neutral-300 mb-3">Images</h3>
                    {loading ? (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[...Array(variants)].map((_, i) => (
                          <Skeleton key={i} className="h-64" />
                        ))}
                      </div>
                    ) : images.length > 0 ? (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {images.map((src, i) => (
                          <TiltCard key={i} className="overflow-hidden">
                            <button onClick={() => { setPreviewIdx(i); setPreviewOpen(true); }}>
                              <Image src={src} alt={`gen-${i}`} width={1024} height={1024} className="w-full h-auto" unoptimized />
                            </button>
                            <div className="flex items-center gap-4 p-3 text-sm">
                              <a
                                href={src}
                                download={`keiro-${i + 1}.png`}
                                className="underline underline-offset-4 hover:opacity-80"
                                onClick={() => alert('Image téléchargée ✅')}
                              >
                                Télécharger
                              </a>
                              <button
                                className="underline underline-offset-4 hover:opacity-80"
                                onClick={() => {
                                  navigator.clipboard.writeText(src);
                                  alert('Lien copié');
                                }}
                              >
                                Copier l’URL
                              </button>
                            </div>
                          </TiltCard>
                        ))}
                      </div>
                    ) : (
                      <p className="text-neutral-400">Aucune image pour le moment.</p>
                    )}
                  </div>

                  {/* Résultat vidéo */}
                  <div>
                    <h3 className="text-sm text-neutral-300 mb-3">Vidéo</h3>
                    {videoStatus === 'failed' && (
                      <p className="text-red-400 text-sm">La génération vidéo a échoué.</p>
                    )}
                    {isVideoBusy && (
                      <div className="text-neutral-400 text-sm">Génération vidéo en cours…</div>
                    )}
                    {videoUrl ? (
                      <div className="space-y-3">
                        <video
                          src={videoUrl}
                          controls
                          autoPlay
                          loop
                          className="rounded-lg shadow-md w-full"
                        />
                        <div className="flex gap-3 text-sm">
                          <a
                            href={videoUrl}
                            download="keiro-video.mp4"
                            className="underline underline-offset-4 hover:opacity-80"
                          >
                            Télécharger la vidéo
                          </a>
                          <button
                            className="underline underline-offset-4 hover:opacity-80"
                            onClick={() => { navigator.clipboard.writeText(videoUrl); alert('URL vidéo copiée'); }}
                          >
                            Copier l’URL
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-neutral-400 text-sm">Aucune vidéo encore disponible.</p>
                    )}
                  </div>
                </TiltCard>
              </SectionReveal>
            )}
          </div>

          {/* Colonne droite — résumé sticky */}
          <SectionReveal className="lg:col-span-1">
            <TiltCard className="p-5 lg:sticky lg:top-20">
              <div className="text-sm text-neutral-400">Résumé</div>
              <div className="mt-2 text-sm space-y-1">
                <div><span className="text-neutral-400">Plateforme :</span> {PLATFORM_LABEL[platform]}</div>
                <div><span className="text-neutral-400">Objectif :</span> {objective}</div>
                <div><span className="text-neutral-400">Secteur :</span> {sectorDisplay}{businessType ? ` — ${businessType}` : ''}</div>
                <div><span className="text-neutral-400">Contexte :</span> {context}</div>
                <div><span className="text-neutral-400">Mise en avant :</span> {highlight}</div>
                <div><span className="text-neutral-400">Couleur :</span> {brandColor}</div>
                <div><span className="text-neutral-400">Variantes (images) :</span> {variants}</div>
                <div className="pt-3 border-t border-neutral-800">
                  <div className="text-neutral-400">Vidéo</div>
                  <div className="text-xs text-neutral-500">
                    Ratio: {videoRatio} · Durée: {videoDuration}s
                    {videoPredictionId && <><br/>Prediction ID: <span className="text-neutral-400">{videoPredictionId}</span></>}
                    <br/>Statut: <span className="text-neutral-400">{videoStatus}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                {step < 3 ? (
                  <Button type="button" onClick={() => (step === 1 ? setStep(2) : onGenerateImages())} className="w-full">
                    {step === 1 ? 'Continuer' : (loading ? 'Génération images…' : 'Générer images')}
                  </Button>
                ) : (
                  <a href="/generate"><Button type="button" className="w-full">Recommencer</Button></a>
                )}
              </div>
              {note && <div className="mt-3 text-xs text-yellow-400">{note}</div>}
            </TiltCard>
          </SectionReveal>
        </div>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)}>
        <div className="p-3 flex items-center justify-between border-b border-neutral-900">
          <div className="text-sm text-neutral-300">Prévisualisation</div>
          <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>Fermer</Button>
        </div>
        <div className="p-4">
          {images[previewIdx] && (
            <Image
              src={images[previewIdx]}
              alt="preview"
              width={1280}
              height={1280}
              className="w-full h-auto rounded-lg"
              unoptimized
            />
          )}
        </div>
      </Modal>
    </main>
  );
}
