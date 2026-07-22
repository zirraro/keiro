'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';

/**
 * Reusable upload panel for any agent workspace. Handles drag-drop +
 * click-to-select + FOLDER drops (webkitGetAsEntry traversal / webkitdirectory)
 * so the client's own folder/subfolder classification is preserved. Posts to
 * /api/agents/uploads, shows live progress + a per-type summary
 * (X images, X vidéos, X fichiers), and a grid of prior uploads grouped by folder.
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
  caption?: string | null; // porte le chemin de dossier relatif quand fourni
  ai_analysis?: any;
  analyzed_at?: string | null;
  created_at: string;
}

type Picked = { file: File; folder: string };

const kind = (f: { type?: string; name?: string }): 'image' | 'video' | 'file' => {
  const t = f.type || '';
  const n = f.name || '';
  if (t.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(n)) return 'image';
  if (t.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv)$/i.test(n)) return 'video';
  return 'file';
};

// Traverse un DataTransferItemList (drag-drop de dossiers) en préservant les chemins.
async function readEntries(items: DataTransferItemList): Promise<Picked[]> {
  const out: Picked[] = [];
  const walk = (entry: any, path: string): Promise<void> => new Promise((resolve) => {
    if (!entry) return resolve();
    if (entry.isFile) {
      entry.file((file: File) => {
        // path = dossier parent (sans le nom de fichier)
        out.push({ file, folder: path.replace(/\/$/, '') });
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all: any[] = [];
      const readBatch = () => reader.readEntries((batch: any[]) => {
        if (!batch.length) {
          Promise.all(all.map((e) => walk(e, `${path}${entry.name}/`))).then(() => resolve());
          return;
        }
        all.push(...batch);
        readBatch();
      }, () => resolve());
      readBatch();
    } else resolve();
  });
  const entries: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const entry = it.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  await Promise.all(entries.map((e) => walk(e, '')));
  return out;
}

export default function AgentUploadsPanel({
  agentId,
  title,
  hint,
  accept = 'image/*,video/*,application/pdf,.doc,.docx,.txt',
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{ images: number; videos: number; files: number } | null>(null);
  const [organizeHint, setOrganizeHint] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const defaultTitle = en ? 'Photos, videos & brand documents' : 'Photos, vidéos & documents de marque';
  const defaultHint = en
    ? 'Drop files OR whole folders — your folder structure is kept. Each file is analysed so agents reference the REAL decor, palette and voice.'
    : 'Dépose des fichiers OU des dossiers entiers — ton classement est conservé. Chaque fichier est analysé pour que tes agents référencent ta VRAIE décoration, palette et voix.';

  const load = useCallback(async () => {
    try {
      const url = agentId === 'content'
        ? `/api/agents/uploads?agent_id=${agentId}&cross_agent=true`
        : `/api/agents/uploads?agent_id=${agentId}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setUploads(data.uploads || []);
      if (typeof data.limit === 'number') setLimit(data.limit);
    } catch {}
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const upload = useCallback(async (picked: Picked[]) => {
    if (!picked.length) return;
    setError(null);
    setSummary(null);
    setBusy(true);
    const counts = { images: 0, videos: 0, files: 0 };
    let hadFolders = false;
    let current = uploads.length;
    setProgress({ done: 0, total: picked.length });
    try {
      for (let i = 0; i < picked.length; i++) {
        const { file, folder } = picked[i];
        if (folder) hadFolders = true;
        if (current >= limit) {
          setError(en ? `Limit reached (${limit} max).` : `Limite atteinte (${limit} max).`);
          break;
        }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('agent_id', agentId);
        if (folder) fd.append('folder', folder);
        const res = await fetch('/api/agents/uploads', { method: 'POST', body: fd, credentials: 'include' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({} as any));
          setError(data?.error || (en ? 'Upload failed' : 'Échec de l\'upload'));
        } else {
          const k = kind(file);
          if (k === 'image') counts.images++; else if (k === 'video') counts.videos++; else counts.files++;
          current++;
        }
        setProgress({ done: i + 1, total: picked.length });
      }
      await load();
      setSummary(counts);
      // Dépôt en vrac (aucun dossier) + plusieurs fichiers → suggestion OPTIONNELLE de ranger.
      setOrganizeHint(!hadFolders && picked.length > 3);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [agentId, en, limit, load, uploads.length]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const items = e.dataTransfer.items;
    // Si des dossiers sont déposés, on traverse pour préserver la structure.
    if (items && items.length && typeof items[0].webkitGetAsEntry === 'function') {
      const picked = await readEntries(items);
      if (picked.length) { upload(picked); return; }
    }
    if (e.dataTransfer.files?.length) {
      upload(Array.from(e.dataTransfer.files).map((file) => ({ file, folder: '' })));
    }
  }, [upload]);

  // Sélection de dossier via <input webkitdirectory> : webkitRelativePath porte le chemin.
  const onFolderPick = useCallback((list: FileList) => {
    const picked: Picked[] = Array.from(list).map((file) => {
      const rel = (file as any).webkitRelativePath || '';
      const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      return { file, folder };
    });
    upload(picked);
  }, [upload]);

  const remove = async (id: string) => {
    await fetch(`/api/agents/uploads?id=${id}`, { method: 'DELETE', credentials: 'include' });
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  // Regroupe les uploads par dossier (caption) pour restituer le classement du client.
  const groups = uploads.reduce<Record<string, UploadRow[]>>((acc, u) => {
    const g = (u.caption || '').trim() || '__root__';
    (acc[g] ||= []).push(u);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups).sort((a, b) => (a === '__root__' ? -1 : b === '__root__' ? 1 : a.localeCompare(b)));

  const summaryLabel = summary && (() => {
    const parts: string[] = [];
    if (summary.images) parts.push(`${summary.images} ${en ? (summary.images > 1 ? 'images' : 'image') : (summary.images > 1 ? 'images' : 'image')}`);
    if (summary.videos) parts.push(`${summary.videos} ${en ? (summary.videos > 1 ? 'videos' : 'video') : (summary.videos > 1 ? 'vidéos' : 'vidéo')}`);
    if (summary.files) parts.push(`${summary.files} ${en ? (summary.files > 1 ? 'files' : 'file') : (summary.files > 1 ? 'fichiers' : 'fichier')}`);
    if (!parts.length) return null;
    return en ? `${parts.join(', ')} uploaded ✅` : `${parts.join(', ')} téléchargé${(summary.images + summary.videos + summary.files) > 1 ? 's' : ''} ✅`;
  })();

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
        onClick={() => { if (!busy) fileInputRef.current?.click(); }}
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
          onChange={e => { if (e.target.files?.length) upload(Array.from(e.target.files).map((file) => ({ file, folder: '' }))); e.target.value = ''; }}
        />
        {/* Sélecteur de DOSSIER (préserve la structure) */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          // webkitdirectory/directory : attributs non standard (sélection de dossier)
          {...({ webkitdirectory: '', directory: '' } as any)}
          onChange={e => { if (e.target.files?.length) onFolderPick(e.target.files); e.target.value = ''; }}
        />
        {busy && progress ? (
          <>
            <p className="text-sm text-white/80">
              {en ? 'Uploading…' : 'Téléchargement en cours…'} {progress.done}/{progress.total}
            </p>
            <div className="mt-2 mx-auto max-w-xs h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }} />
            </div>
            <p className="text-[10px] text-white/40 mt-1">{en ? 'Analysing each file…' : 'Analyse de chaque fichier…'}</p>
          </>
        ) : (
          <>
            <p className="text-sm text-white/70">
              {en ? 'Drop files or folders here, or click to select' : 'Dépose fichiers ou dossiers ici, ou clique pour sélectionner'}
            </p>
            <p className="text-[10px] text-white/40 mt-1">
              {en ? 'Images · videos · PDF/docs — folders keep their structure' : 'Images · vidéos · PDF/docs — les dossiers gardent leur structure'}
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
              className="mt-2 text-[11px] text-emerald-300/80 hover:text-emerald-200 underline underline-offset-2"
            >
              {en ? '📂 Import a whole folder' : '📂 Importer un dossier entier'}
            </button>
          </>
        )}
      </div>

      {/* Confirmation compteur après upload */}
      {summaryLabel && (
        <div className="mt-2 px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200">
          {summaryLabel}
        </div>
      )}

      {/* Suggestion OPTIONNELLE de rangement quand dépôt en vrac */}
      {organizeHint && (
        <div className="mt-2 px-3 py-2 rounded bg-white/[0.04] border border-white/10 text-[11px] text-white/60 flex items-center justify-between gap-2">
          <span>{en
            ? 'Tip: import your files inside folders to keep them organised (optional).'
            : 'Astuce : importe tes fichiers dans des dossiers pour garder ton classement (optionnel).'}</span>
          <button onClick={() => setOrganizeHint(false)} className="text-white/30 hover:text-white/60 shrink-0">✕</button>
        </div>
      )}

      {error && (
        <div className="mt-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-[11px] text-red-300">
          {error}
        </div>
      )}

      {/* Uploaded files — groupés par dossier (classement conservé) */}
      {uploads.length > 0 && (
        <div className="mt-4 space-y-3">
          {groupKeys.map((gk) => (
            <div key={gk}>
              {gk !== '__root__' && (
                <div className="text-[11px] font-semibold text-white/60 mb-1.5 flex items-center gap-1">
                  {'\u{1F4C2}'} {gk}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {groups[gk].map(u => {
                  const isImg = (u.file_type || '').startsWith('image/');
                  const isVid = (u.file_type || '').startsWith('video/');
                  const analysis = u.ai_analysis || {};
                  const palette: string[] = Array.isArray(analysis.color_palette)
                    ? analysis.color_palette
                    : Array.isArray(analysis.brand_colors) ? analysis.brand_colors : [];
                  return (
                    <div key={u.id} className="rounded-lg overflow-hidden border border-white/10 bg-black/30">
                      {isImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.file_url} alt="" className="w-full h-28 object-cover" loading="lazy" />
                      ) : isVid ? (
                        <video src={u.file_url} className="w-full h-28 object-cover" muted playsInline preload="metadata" />
                      ) : (
                        <div className="w-full h-28 flex items-center justify-center bg-white/5 text-white/40 text-xs px-1 text-center">
                          {'\u{1F4C4}'} {u.file_name || 'Doc'}
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
                          <a href={u.file_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-white/30 hover:text-white/60">
                            {en ? 'Open' : 'Ouvrir'}
                          </a>
                          <button onClick={() => remove(u.id)} className="text-[10px] text-white/30 hover:text-red-400/70">
                            {en ? 'Remove' : 'Supprimer'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
