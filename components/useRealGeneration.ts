'use client';
import { useEffect, useRef, useState } from 'react';

type GenType = 'image' | 'video';

type PreviewResp =
  | { ready: true; url?: string; blobPath?: string }
  | { ready: false }
  | { error: string };

async function signBlobPath(blobPath: string): Promise<string | null> {
  try {
    const r = await fetch('/api/img?path=' + encodeURIComponent(blobPath));
    if (r.ok) {
      const j = await r.json();
      return j?.url || j?.signedUrl || null;
    }
  } catch (_) {}
  try {
    const r = await fetch('/api/img', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ path: blobPath }),
    });
    if (r.ok) {
      const j = await r.json();
      return j?.url || j?.signedUrl || null;
    }
  } catch (_) {}
  return null;
}

export function useRealGeneration() {
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function pollPreview(jobId: string, timeoutMs = 90_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await new Promise(r => setTimeout(r, 2500));
      const r = await fetch('/api/preview?jobId=' + encodeURIComponent(jobId));
      if (!r.ok) continue;

      const j = (await r.json()) as PreviewResp;
      if ('error' in j) throw new Error(j.error);
      if (j.ready === false) { setProgress('Rendu en cours…'); continue; }
      if (j.ready === true) {
        if (j.url) return j.url;
        if (j.blobPath) {
          const signed = await signBlobPath(j.blobPath);
          if (signed) return signed;
        }
        throw new Error('Prévisualisation prête mais aucune URL');
      }
    }
    throw new Error('Temps dépassé (aperçu non disponible)');
  }

  async function generate(type: GenType, payload: Record<string, any>) {
    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setIsLoading(true);
      setError(null);
      setProgress('Envoi de la demande…');
      setPreviewUrl(null);

      const endpoint = type === 'image' ? '/api/generate' : '/api/generate-video';
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: abortRef.current.signal,
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json?.message || 'Échec de génération');

      if (json.previewUrl) { setPreviewUrl(json.previewUrl); setProgress(null); return; }

      const jobId: string | undefined = json.jobId || json.id || json.taskId;
      if (!jobId) { setProgress(null); throw new Error('Génération demandée mais aucun jobId reçu'); }

      setProgress('Rendu en file…');
      const url = await pollPreview(jobId);
      setPreviewUrl(url);
      setProgress(null);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setError(e?.message || 'Erreur inconnue');
      setProgress(null);
    } finally {
      setIsLoading(false);
    }
  }

  function resetPreview() { setPreviewUrl(null); setError(null); setProgress(null); }
  function cancel() { abortRef.current?.abort(); setIsLoading(false); setProgress(null); }

  return { isLoading, previewUrl, error, progress, generate, resetPreview, cancel };
}
