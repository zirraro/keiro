'use client';
import { useEffect, useState } from 'react';

export default function ClientPreview({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<string>('queued');
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/generate/status?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;

        if (data?.error) {
          setStatus('error');
          setError(data.error);
          setTimeout(poll, 1500);
          return;
        }

        setStatus(data?.status ?? 'unknown');

        if (data?.status === 'done') {
          setImgSrc(`/api/preview?jobId=${encodeURIComponent(jobId)}`);
          return; // stop polling
        }

        setTimeout(poll, 1500);
      } catch (e: any) {
        setError(e?.message ?? 'network error');
        setTimeout(poll, 1500);
      }
    }

    poll();
    return () => { cancelled = true; };
  }, [jobId]);

  return (
    <div style={{display:'grid', gap:12}}>
      <div>
        <b>jobId:</b> <code>{jobId}</code> — <b>status:</b> {status}
        {error ? <span style={{color:'crimson'}}> — {error}</span> : null}
      </div>
      <div style={{minHeight:260, border:'1px solid #eee', borderRadius:8, display:'grid', placeItems:'center'}}>
        {imgSrc
          ? <img src={imgSrc} alt="preview" style={{maxWidth:'100%', height:'auto', borderRadius:8}} />
          : <small>L’aperçu s’affichera quand le job sera terminé…</small>}
      </div>
    </div>
  );
}
