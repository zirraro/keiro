'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';

/**
 * Reusable upload panel for any agent workspace. Handles drag-drop +
 * click-to-select + direct URL paste, posts to /api/agents/uploads,
 * and shows a grid of prior uploads with their extracted palette +
 * summary so the client can visually confirm Jade/Hugo/Théo actually
 * understood the material.
 *
 * Props:
 *   agentId — 'content' | 'email' | 'dm_instagram' | 'gmaps' | ...
 *   title  — optional override of the panel header
 *   hint   — optional override of the instructional copy
 */

interface UploadRow {
  id: string;
  agent_id: string;
  file_url: string;
  file_type: string;
  file_name?: string | null;
  caption?: string | null;
  ai_analysis?: any;
  analyzed_at?: string | null;
  created_at: string;
}

export default function AgentUploadsPanel({
  agentId,
  title,
  hint,
  accept = 'image/*,application/pdf',
}: {
  agentId: string;
  title?: string;
  hint?: string;
  accept?: string;
}) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultTitle = en ? 'Photos & brand documents' : 'Photos & documents de marque';
  const defaultHint = en
    ? 'Drop photos of your space, product shots, or your brand guidelines PDF. Each file is analysed so agents reference the REAL decor, palette and voice in every post, email and reply.'
    : 'Dépose des photos de ton lieu, de tes produits, ou ton PDF de guidelines. Chaque fichier est analysé pour que tes agents référencent ta VRAIE décoration, palette et voix dans chaque post, email et réponse.';

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/uploads?agent_id=${agentId}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setUploads(data.uploads || []);
      if (typeof data.limit === 'number') setLimit(data.limit);
    } catch {}
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | File[]) => {
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (uploads.length >= limit) {
          setError(en
            ? `Limit reached (${limit} uploads max).`
            : `Limite atteinte (${limit} uploads max).`);
          break;
        }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('agent_id', agentId);
        const res = await fetch('/api/agents/uploads', { method: 'POST', body: fd, credentials: 'include' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({} as any));
          setError(data?.error || (en ? 'Upload failed' : 'Échec de l\'upload'));
          continue;
        }
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads.length]);

  const remove = async (id: string) => {
    await fetch(`/api/agents/uploads?id=${id}`, { method: 'DELETE', credentials: 'include' });
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mb-3">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div>
          <h3 className="text-white font-bold text-sm flex items-center gap-1.5">
            {'\u{1F4C1}'} {title || defaultTitle}
          </h3>
          <p className="text-[11px] text-white/50 mt-0.5 leading-relaxed max-w-xl">
            {hint || defaultHint}
          </p>
        </div>
        <span className="text-[10px] text-white/40 shrink-0">
          {uploads.length} / {limit}
        </span>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mt-3 rounded-lg border-2 border-dashed transition cursor-pointer p-6 text-center ${
          dragActive ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/15 bg-black/20 hover:bg-black/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }}
        />
        <p className="text-sm text-white/70">
          {busy
            ? (en ? 'Uploading & analysing…' : 'Upload & analyse en cours…')
            : (en ? 'Drop files here or click to select' : 'Dépose tes fichiers ici ou clique pour sélectionner')}
        </p>
        <p className="text-[10px] text-white/40 mt-1">
          {en ? 'Images (JPG/PNG/WEBP) or PDF · max 15 MB each' : 'Images (JPG/PNG/WEBP) ou PDF · 15 Mo max chacun'}
        </p>
      </div>

      {error && (
        <div className="mt-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-[11px] text-red-300">
          {error}
        </div>
      )}

      {/* Uploaded files grid — shows preview + extracted palette/summary */}
      {uploads.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {uploads.map(u => {
            const isImg = (u.file_type || '').startsWith('image/');
            const analysis = u.ai_analysis || {};
            const palette: string[] = Array.isArray(analysis.color_palette)
              ? analysis.color_palette
              : Array.isArray(analysis.brand_colors) ? analysis.brand_colors : [];
            return (
              <div key={u.id} className="rounded-lg overflow-hidden border border-white/10 bg-black/30">
                {isImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.file_url} alt="" className="w-full h-28 object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-28 flex items-center justify-center bg-white/5 text-white/40 text-xs">
                    {'\u{1F4C4}'} {u.file_name || 'PDF'}
                  </div>
                )}
                <div className="p-2">
                  {palette.length > 0 && (
                    <div className="flex gap-0.5 mb-1">
                      {palette.slice(0, 5).map((c, i) => (
                        <div key={i} className="w-4 h-4 rounded-sm border border-white/10" style={{ backgroundColor: c }} title={c} />
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-white/60 line-clamp-2">
                    {analysis.summary || analysis.ambiance || u.file_name || (en ? 'Awaiting analysis…' : 'Analyse en attente…')}
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <a href={u.file_url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-white/30 hover:text-white/60">
                      {en ? 'Open' : 'Ouvrir'}
                    </a>
                    <button onClick={() => remove(u.id)} className="text-[9px] text-white/30 hover:text-red-400/70">
                      {en ? 'Remove' : 'Supprimer'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
