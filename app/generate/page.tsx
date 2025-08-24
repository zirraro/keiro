'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

type Mode = 'image' | 'video';

export default function GenerateSimple() {
  const [mode, setMode] = useState<Mode>('image');
  const [prompt, setPrompt] = useState('Un café cosy en lumière naturelle, b-roll cinématique');
  const [imageUrl, setImageUrl] = useState('https://replicate.delivery/pbxt/8o3w3vN9/test-square.png');
  const [ratio, setRatio] = useState<'16:9' | '1:1' | '9:16'>('1:1');
  const [duration, setDuration] = useState<number>(5);

  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Polling state
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [predictionStatus, setPredictionStatus] = useState<string | null>(null);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function pollPrediction(id: string) {
    // Clear any previous timer
    if (pollTimer.current) clearInterval(pollTimer.current);

    setPredictionStatus('starting');

    pollTimer.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/replicate/prediction/${id}`, { cache: 'no-store' });
        const json = await r.json();

        setPredictionStatus(json?.status || 'unknown');

        if (json?.status === 'succeeded') {
          if (pollTimer.current) clearInterval(pollTimer.current);

          // Normaliser la sortie en tableau d’urls
          let urls: string[] = [];
          if (Array.isArray(json?.output)) {
            urls = json.output.filter(Boolean);
          } else if (typeof json?.output === 'string') {
            urls = [json.output];
          } else if (json?.output?.length) {
            urls = [...json.output];
          }

          setVideos(urls);
          setLoading(false);
          setPredictionId(null);
          return;
        }

        if (json?.status === 'failed' || json?.error) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setError(json?.error || 'La génération a échoué.');
          setLoading(false);
          setPredictionId(null);
          return;
        }
      } catch (e: any) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setError(e?.message || 'Erreur pendant le polling.');
        setLoading(false);
        setPredictionId(null);
      }
    }, 3000);
  }

  async function generate() {
    setLoading(true);
    setImages([]);
    setVideos([]);
    setError(null);
    setPredictionId(null);
    setPredictionStatus(null);

    try {
      if (mode === 'image') {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        const json = await res.json();
        if (json?.images?.length) {
          setImages(json.images);
          setLoading(false);
        } else {
          setError(json?.error || 'Erreur API image');
          setLoading(false);
        }
      } else {
        const payload = imageUrl
          ? { prompt, imageUrl, ratio, duration }
          : { prompt, ratio, duration };

        const res = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        // 3 cas:
        // 1) vidéos prêtes (urls)
        if (json?.videos?.length) {
          setVideos(json.videos);
          setLoading(false);
          return;
        }
        // 2) id renvoyé -> on poll
        if (json?.id) {
          setPredictionId(json.id);
          setPredictionStatus('starting');
          pollPrediction(json.id);
          return;
        }
        // 3) erreur
        setError(json?.detail || json?.error || 'Erreur API video');
        setLoading(false);
      }
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau');
      setLoading(false);
    }
  }

  return (
    <main className="relative z-50 pointer-events-auto min-h-screen p-6 bg-neutral-950">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Générer</h1>
          <div className="text-sm text-neutral-400">Keiro · Démo cliquable</div>
        </header>

        {/* Toggle mode */}
        <div className="flex gap-2">
          <Button type="button" variant={mode === 'image' ? 'primary' : 'outline'} onClick={() => setMode('image')}>
            Image
          </Button>
          <Button type="button" variant={mode === 'video' ? 'primary' : 'outline'} onClick={() => setMode('video')}>
            Vidéo
          </Button>
        </div>

        {/* Form */}
        <div className="space-y-4 rounded-lg border border-neutral-800 p-4">
          <div>
            <label className="text-sm text-neutral-300">Prompt</label>
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Décris ta scène…" />
          </div>

          {mode === 'video' && (
            <>
              <div>
                <label className="text-sm text-neutral-300">Image (optionnel pour text→video)</label>
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="URL image pour image→vidéo" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button type="button" variant={ratio === '16:9' ? 'primary' : 'outline'} onClick={() => setRatio('16:9')}>16:9</Button>
                <Button type="button" variant={ratio === '1:1' ? 'primary' : 'outline'} onClick={() => setRatio('1:1')}>1:1</Button>
                <Button type="button" variant={ratio === '9:16' ? 'primary' : 'outline'} onClick={() => setRatio('9:16')}>9:16</Button>
              </div>
              <div>
                <label className="text-sm text-neutral-300">Durée (sec)</label>
                <Input type="number" min={2} max={8} value={duration} onChange={(e) => setDuration(parseInt(e.target.value || '5', 10))} />
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button type="button" onClick={generate} disabled={loading}>
              {loading ? 'Génération…' : (mode === 'image' ? 'Générer image' : 'Générer vidéo')}
            </Button>
          </div>
        </div>

        {/* Statut du polling */}
        {predictionId && (
          <div className="text-sm text-neutral-300">
            Requête envoyée (id: <span className="font-mono">{predictionId}</span>) — statut: <span className="font-semibold">{predictionStatus}</span>…<br/>
            La page rafraîchira automatiquement la vidéo dès qu’elle est prête.
          </div>
        )}

        {/* Erreur */}
        {error && <div className="text-sm text-red-400">{error}</div>}

        {/* Résultats */}
        {images.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4">
            {images.map((src, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-neutral-800">
                <img src={src} alt={`img-${i}`} className="w-full h-auto" />
                <div className="p-2 text-xs">
                  <a href={src} download className="underline">Télécharger</a>
                </div>
              </div>
            ))}
          </div>
        )}

        {videos.length > 0 && (
          <div className="space-y-4">
            {videos.map((src, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-neutral-800">
                <video src={src} controls className="w-full h-auto"></video>
                <div className="p-2 text-xs">
                  <a href={src} download className="underline">Télécharger</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
