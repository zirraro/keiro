'use client';

/**
 * PlanningReviewFlow — "feuilletage" jour par jour du planning Léna.
 *
 * Founder ask (02/07) : pouvoir afficher un jour, voir les posts prévus
 * (1/2, 2/2), modifier / régénérer, puis "Suivant" ou "Valider → suivant",
 * avec la date de publication affichée. Dispo que le toggle auto-publish
 * soit ON ou OFF (on peut toujours feuilleter + retoucher).
 *
 * Réutilise les actions existantes de /api/agents/content (toutes en postId):
 *   - regenerate_visual  → nouvelle image
 *   - update_post        → nouvelle légende
 *   - approve            → valide le post (status=approved)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

interface Post {
  id: string;
  visual_url?: string;
  caption?: string;
  hook?: string;
  platform?: string;
  format?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  status?: string;
}

export default function PlanningReviewFlow() {
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draftCaption, setDraftCaption] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/agents/content?action=calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action: 'calendar' }),
    })
      .then(r => r.json())
      .then(d => {
        const all = (d.posts || d.calendar || []) as Post[];
        const today = new Date().toISOString().slice(0, 10);
        // À venir + encore modifiables (on exclut publié/passé/en cours).
        const up = all
          .filter(p => p.scheduled_date && p.scheduled_date >= today
            && !['published', 'skipped', 'archived', 'publishing'].includes(p.status || ''))
          .sort((a, b) => (`${a.scheduled_date}${a.scheduled_time || ''}`).localeCompare(`${b.scheduled_date}${b.scheduled_time || ''}`));
        setPosts(up);
        setIdx(0);
        setEditing(false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const cur = posts[idx];

  // Position dans la journée (1/2, 2/2).
  const dayInfo = useMemo(() => {
    if (!cur) return { pos: 0, total: 0 };
    const sameDay = posts.filter(p => p.scheduled_date === cur.scheduled_date);
    return { pos: sameDay.findIndex(p => p.id === cur.id) + 1, total: sameDay.length };
  }, [cur, posts]);

  const act = useCallback(async (action: string, extra: Record<string, any> = {}) => {
    if (!cur) return null;
    setBusy(action);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action, postId: cur.id, ...extra }),
      });
      const d = await res.json();
      if (d?.post) setPosts(prev => prev.map(p => (p.id === cur.id ? { ...p, ...d.post } : p)));
      else if (d?.visual_url) setPosts(prev => prev.map(p => (p.id === cur.id ? { ...p, visual_url: d.visual_url } : p)));
      return d;
    } catch { return null; } finally { setBusy(''); }
  }, [cur]);

  const goNext = () => { setEditing(false); setIdx(i => Math.min(posts.length - 1, i + 1)); };
  const goPrev = () => { setEditing(false); setIdx(i => Math.max(0, i - 1)); };

  const validateAndNext = async () => {
    if (!cur) return;
    await act('approve');
    setPosts(prev => prev.map(p => (p.id === cur.id ? { ...p, status: 'approved' } : p)));
    if (idx < posts.length - 1) goNext();
  };

  const saveCaption = async () => {
    await act('update_post', { caption: draftCaption });
    setEditing(false);
  };

  const fmtDay = (d?: string) => {
    if (!d) return '';
    return new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 mb-3 rounded-xl border border-dashed border-cyan-500/40 bg-cyan-900/10 text-cyan-300 text-xs font-bold hover:bg-cyan-900/20 transition"
      >
        📖 Feuilleter &amp; valider jour par jour
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-white/[0.02] p-3 sm:p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-white">📖 Feuilletage du planning</h3>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-white/40 hover:text-white/70 text-[11px]" aria-label="Rafraîchir">↻</button>
          <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white text-[11px]">Fermer ✕</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8"><div className="animate-spin h-5 w-5 border-b-2 border-cyan-400 rounded-full mx-auto" /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-8 text-white/40 text-xs">Aucun post à venir à valider. Génère un planning ci-dessus (7 à 30 jours).</div>
      ) : cur ? (
        <>
          {/* Progression globale */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-cyan-400 transition-all" style={{ width: `${((idx + 1) / posts.length) * 100}%` }} />
            </div>
            <span className="text-[10px] text-white/40 tabular-nums">{idx + 1}/{posts.length}</span>
          </div>

          {/* Jour + date prévue */}
          <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-2 mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-cyan-200 capitalize truncate">{fmtDay(cur.scheduled_date)}</div>
              <div className="text-[10px] text-white/50">Publication prévue{cur.scheduled_time ? ` à ${cur.scheduled_time.slice(0, 5)}` : ''}</div>
            </div>
            {dayInfo.total > 1 && (
              <span className="shrink-0 text-[11px] font-bold text-cyan-300 bg-cyan-500/15 px-2 py-1 rounded-full">Post {dayInfo.pos}/{dayInfo.total} du jour</span>
            )}
          </div>

          {/* Aperçu du post */}
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20 mb-2">
            {cur.visual_url
              ? <img src={cur.visual_url} alt="" className="w-full aspect-square object-cover" />
              : <div className="aspect-square flex items-center justify-center text-white/30 text-xs">Pas d&apos;image</div>}
            <div className="p-2.5">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 capitalize">{cur.platform || 'instagram'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">{cur.format || 'post'}</span>
                {cur.status === 'approved' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">✓ validé</span>}
              </div>
              {editing ? (
                <div>
                  <textarea
                    value={draftCaption}
                    onChange={e => setDraftCaption(e.target.value)}
                    rows={5}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={saveCaption} disabled={busy === 'update_post'} className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-cyan-600 text-white disabled:opacity-40">
                      {busy === 'update_post' ? '...' : 'Enregistrer'}
                    </button>
                    <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-[10px] rounded-lg bg-white/10 text-white/60">Annuler</button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-white/70 whitespace-pre-wrap line-clamp-6">{cur.caption || cur.hook || '(pas de légende)'}</p>
              )}
            </div>
          </div>

          {/* Actions sur le post */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <button
              onClick={() => { setDraftCaption(cur.caption || cur.hook || ''); setEditing(true); }}
              disabled={!!busy}
              className="px-2 py-2 min-h-[40px] text-[10px] font-medium rounded-lg bg-white/10 text-white/70 hover:bg-white/15 disabled:opacity-40"
            >✏️ Modifier</button>
            <button
              onClick={() => act('regenerate_visual')}
              disabled={!!busy}
              className="px-2 py-2 min-h-[40px] text-[10px] font-medium rounded-lg bg-white/10 text-white/70 hover:bg-white/15 disabled:opacity-40"
            >{busy === 'regenerate_visual' ? '...' : '🔄 Régénérer'}</button>
            <button
              onClick={validateAndNext}
              disabled={!!busy}
              className="px-2 py-2 min-h-[40px] text-[10px] font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:opacity-90 disabled:opacity-40"
            >{busy === 'approve' ? '...' : '✓ Valider'}</button>
          </div>

          {/* Navigation feuilletage */}
          <div className="flex items-center justify-between">
            <button onClick={goPrev} disabled={idx === 0} className="px-3 py-2 min-h-[40px] text-xs rounded-lg bg-white/10 text-white/70 hover:bg-white/15 disabled:opacity-30">← Précédent</button>
            <button onClick={goNext} disabled={idx === posts.length - 1} className="px-3 py-2 min-h-[40px] text-xs rounded-lg bg-white/10 text-white/70 hover:bg-white/15 disabled:opacity-30">Suivant →</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
