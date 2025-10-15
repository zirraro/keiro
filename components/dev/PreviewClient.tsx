'use client';
import React from 'react';

type JobResp = { jobId: string };
type PreviewResp = {
  status: 'queued' | 'running' | 'done' | 'error',
  fileUrl?: string,
  error?: string
};

export default function PreviewClient() {
  const [jobId, setJobId] = React.useState<string>();
  const [status, setStatus] = React.useState<string>('idle');
  const [fileUrl, setFileUrl] = React.useState<string>();
  const [logs, setLogs] = React.useState<string[]>([]);
  const [kind, setKind] = React.useState<'image' | 'video'>('image');

  async function start(k: 'image' | 'video') {
    setKind(k);
    setLogs(l => [...l, `→ POST /api/mock/generate kind=${k}`]);
    setStatus('starting');
    setFileUrl(undefined);
    try {
      const r = await fetch('/api/mock/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: k })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as JobResp;
      setJobId(data.jobId);
      setLogs(l => [...l, `✓ jobId=${data.jobId}`]);
      poll(data.jobId);
    } catch (e: any) {
      setStatus('error');
      setLogs(l => [...l, `✗ ${String(e)}`]);
    }
  }

  function poll(id: string) {
    setStatus('running');
    const it = setInterval(async () => {
      try {
        const r = await fetch(`/api/preview?jobId=${encodeURIComponent(id)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const p = await r.json() as PreviewResp;
        setLogs(l => [...l, `… ${p.status}${p.fileUrl ? ` (${p.fileUrl})` : ''}`]);
        if (p.status === 'done') {
          setStatus('done');
          setFileUrl(p.fileUrl);
          clearInterval(it);
        } else if (p.status === 'error') {
          setStatus('error');
          clearInterval(it);
        }
      } catch (e: any) {
        setLogs(l => [...l, `✗ poll ${String(e)}`]);
        clearInterval(it);
      }
    }, 1500);
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => start('image')}
          >
            Générer une image
          </button>
          <button
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => start('video')}
          >
            Générer une vidéo
          </button>
        </div>
        <div className="rounded border bg-white p-3 text-sm">
          <div><b>jobId:</b> {jobId ?? '—'}</div>
          <div><b>status:</b> {status}</div>
          <div className="mt-2 max-h-56 overflow-auto text-xs text-gray-600 space-y-1">
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      </div>

      <div className="md:col-span-2 rounded border bg-white p-3">
        <div className="mb-2 text-sm font-medium">Aperçu du rendu</div>
        {!fileUrl && (
          <div className="grid h-72 place-items-center text-sm text-gray-400">
            L’aperçu s’affiche ici après génération.
          </div>
        )}
        {fileUrl && kind === 'image' && (
          <img src={fileUrl} alt="preview" className="mx-auto max-h-80 rounded" />
        )}
        {fileUrl && kind === 'video' && (
          <video src={fileUrl} controls className="mx-auto max-h-80 rounded" />
        )}
      </div>
    </div>
  );
}
