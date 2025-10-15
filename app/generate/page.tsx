'use client';
import React from 'react';
import Image from 'next/image';

export default function GeneratePage() {
  const [prompt, setPrompt] = React.useState('');
  const [imageUrl, setImageUrl] = React.useState('');
  const [editPrompt, setEditPrompt] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const generateImage = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/ark/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          size: '1024x1024',
          response_format: 'url',
          guidance_scale: 3,
          watermark: false,
        }),
      });
      const data = await res.json();
      if (data.url) setImageUrl(data.url);
      else throw new Error(data.message || 'Erreur génération');
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const editImage = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/ark/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editPrompt,
          image: imageUrl,
          response_format: 'url',
          size: 'adaptive',
          guidance_scale: 4,
          watermark: false,
        }),
      });
      const data = await res.json();
      if (data.url) setImageUrl(data.url);
      else throw new Error(data.message || 'Erreur édition');
    } catch (e: any) {
      setError(e.message || 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Génération & édition Seedream (Ark)</h1>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Décris l'image à créer..."
        className="w-full border rounded-md p-3 mb-3"
        rows={3}
      />
      <button
        onClick={generateImage}
        disabled={loading}
        className="px-4 py-2 bg-black text-white rounded hover:bg-neutral-800"
      >
        {loading ? '⏳ Génération...' : 'Générer l’image'}
      </button>

      {error && <p className="text-red-500 mt-3">{error}</p>}

      {imageUrl && (
        <div className="mt-8 flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <h2 className="text-lg font-medium mb-2">Aperçu généré</h2>
            <Image
              src={imageUrl}
              alt="Aperçu"
              width={512}
              height={512}
              className="rounded-md border shadow"
            />
          </div>

          <div className="flex-1">
            <h2 className="text-lg font-medium mb-2">Édition Seedream</h2>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="Décris les modifications à appliquer..."
              className="w-full border rounded-md p-3 mb-3"
              rows={3}
            />
            <button
              onClick={editImage}
              disabled={loading}
              className="px-4 py-2 bg-black text-white rounded hover:bg-neutral-800"
            >
              {loading ? '⏳ Modification...' : 'Appliquer les modifications'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
