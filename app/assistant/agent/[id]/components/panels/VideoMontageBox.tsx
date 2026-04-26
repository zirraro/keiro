'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/lib/i18n/context';

/**
 * VideoMontageBox — collapsible card on the content workspace that
 * lets the founder pick 2-6 uploaded videos/images and build a
 * crossfade/fade/cut montage via /api/me/video-montage.
 *
 * Only shown when there are at least 2 video uploads available
 * (otherwise the feature wouldn't do anything useful).
 */
export default function VideoMontageBox() {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [open, setOpen] = useState(false);
  const [uploads, setUploads] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [transition, setTransition] = useState<'cut' | 'crossfade' | 'fade'>('crossfade');
  const [format, setFormat] = useState<'portrait' | 'square' | 'landscape'>('portrait');
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUploads = useCallback(async () => {
    try {
      // Reuse the existing agent-files endpoint to list the user's uploads
      const res = await fetch('/api/agents/agent-files?agent_id=content', { credentials: 'include' });
      const j = await res.json();
      const all = j?.files || [];
      // Keep only image + video uploads (we can mix in the montage)
      const visualOnly = all.filter((u: any) => {
        const ft = (u.file_type || '').toLowerCase();
        return ft.startsWith('video/') || ft.startsWith('image/');
      });
      setUploads(visualOnly);
    } catch {}
  }, []);

  useEffect(() => { if (open) loadUploads(); }, [open, loadUploads]);

  const videoCount = uploads.filter((u: any) => (u.file_type || '').startsWith('video/')).length;
  if (videoCount < 2) return null; // Hide the feature when not useful

  const toggle = (id: string) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 6) return prev; // cap at 6
      return [...prev, id];
    });
  };

  const submit = async () => {
    if (selected.length < 2) return;
    setBusy(true);
    setError(null);
    setResultUrl(null);
    try {
      const res = await fetch('/api/me/video-montage', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadIds: selected,
          transition,
          format,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        setError(j.error || 'Échec montage');
      } else {
        setResultUrl(j.url);
      }
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 mb-3 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 min-h-[48px] flex items-center justify-between hover:bg-cyan-500/10 transition"
      >
        <div className="flex items-center gap-2 text-left">
          <span className="text-base">🎬</span>
          <div>
            <div className="text-xs font-bold text-white">{en ? 'Video montage' : 'Faire un montage vidéo'}</div>
            <div className="text-[10px] text-white/60">
              {en
                ? `${videoCount} video${videoCount > 1 ? 's' : ''} uploaded — combine into a Reel/TikTok ready clip`
                : `${videoCount} vidéo${videoCount > 1 ? 's' : ''} uploadée${videoCount > 1 ? 's' : ''} — combine en un Reel/TikTok prêt à publier`}
            </div>
          </div>
        </div>
        <span className="text-white/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-3 border-t border-cyan-500/10 pt-3">
          {/* Selectable thumbnails */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-white/60 mb-1.5">
              {en ? `Pick 2-6 clips (${selected.length} selected)` : `Choisis 2 à 6 clips (${selected.length} sélectionnés)`}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
              {uploads.slice(0, 24).map((u: any, i: number) => {
                const isSelected = selected.includes(u.id);
                const order = isSelected ? selected.indexOf(u.id) + 1 : 0;
                const isVideo = (u.file_type || '').startsWith('video/');
                return (
                  <button
                    key={u.id}
                    onClick={() => toggle(u.id)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${isSelected ? 'border-cyan-400 ring-2 ring-cyan-500/30' : 'border-white/10 hover:border-white/30'}`}
                  >
                    {u.file_url && !isVideo && <img src={u.file_url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                    {u.file_url && isVideo && (
                      <>
                        {u.ai_analysis?.keyframe_url ? (
                          <img src={u.ai_analysis.keyframe_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/50 to-blue-900/50" />
                        )}
                        <span className="absolute bottom-1 right-1 text-[8px] px-1 bg-black/60 text-white rounded">▶</span>
                      </>
                    )}
                    {isSelected && (
                      <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {order}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60 mb-1">{en ? 'Transition' : 'Transition'}</div>
              <select value={transition} onChange={e => setTransition(e.target.value as any)} className="w-full bg-black/30 border border-white/10 rounded px-2 py-2 text-xs text-white/90 min-h-[40px]">
                <option value="crossfade">{en ? 'Crossfade' : 'Crossfade'}</option>
                <option value="fade">{en ? 'Fade to black' : 'Fade au noir'}</option>
                <option value="cut">{en ? 'Hard cut' : 'Cut sec'}</option>
              </select>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60 mb-1">{en ? 'Format' : 'Format'}</div>
              <select value={format} onChange={e => setFormat(e.target.value as any)} className="w-full bg-black/30 border border-white/10 rounded px-2 py-2 text-xs text-white/90 min-h-[40px]">
                <option value="portrait">{en ? 'Portrait (Reel/TikTok)' : 'Portrait (Reel/TikTok)'}</option>
                <option value="square">{en ? 'Square (Feed)' : 'Carré (Feed)'}</option>
                <option value="landscape">{en ? 'Landscape (LinkedIn)' : 'Paysage (LinkedIn)'}</option>
              </select>
            </div>
          </div>

          {/* Action */}
          <button
            onClick={submit}
            disabled={busy || selected.length < 2}
            className="w-full px-4 py-3 min-h-[48px] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-bold rounded-lg shadow disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {en ? 'Building montage…' : 'Montage en cours…'}</>
              : <>🎬 {en ? `Build (${selected.length} clips)` : `Lancer le montage (${selected.length} clips)`}</>}
          </button>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          {resultUrl && (
            <div className="space-y-2">
              <p className="text-[11px] text-emerald-400 font-semibold">{en ? '✓ Montage ready' : '✓ Montage prêt'}</p>
              <video src={resultUrl} controls playsInline className="w-full rounded-lg max-h-[60vh] bg-black" />
              <div className="flex gap-2 flex-wrap">
                <a href={resultUrl} target="_blank" rel="noopener" download className="flex-1 text-center px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg">
                  {en ? '⬇ Download' : '⬇ Télécharger'}
                </a>
                <button
                  onClick={() => { setSelected([]); setResultUrl(null); }}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/60 text-xs rounded-lg"
                >
                  {en ? 'New montage' : 'Nouveau montage'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
