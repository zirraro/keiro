'use client';

import { useState } from 'react';
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

  async function generate() {
    setLoading(true);
    setImages([]);
    setVideos([]);
    setError(null);
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
        } else {
          setError(json?.error || 'Erreur API image');
        }
      } else {
        const isImg2Vid = Boolean(imageUrl);
        const res = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isImg2Vid
              ? { prompt, imageUrl, ratio, duration }
              : { prompt, ratio, duration }
          ),
        });
        const json = await res.json();
        if (json?.videos?.length) {
          setVideos(json.videos);
        } else if (json?.id) {
          // Mode "id" (polling côté client si nécessaire)
          setError(`Requête envoyée (id=${json.id}). Ajoute du polling pour récupérer la vidéo finale.`);
        } else {
          setError(json?.detail || json?.error || 'Erreur API video');
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau');
    } finally {
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
