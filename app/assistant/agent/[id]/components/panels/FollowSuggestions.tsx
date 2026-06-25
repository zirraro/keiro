'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';

/**
 * Comptes à suivre — un compte qui suit sa niche paraît ACTIF (signal de
 * crédibilité → meilleure portée de NOS contenus). Vrais handles du CRM
 * vérifiés (zéro inventé) + recherches. Bouton "Fait" → marque le suivi en CRM
 * + alimente la donnée d'ACCOMPLISSEMENT du client (preuve qu'il applique la
 * stratégie). 2026-06-24/25 : dans Jade, TikTok + Instagram (+ LinkedIn).
 */
export default function FollowSuggestions({ platform }: { platform: string }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setDone(new Set());
    if (platform !== 'instagram' && platform !== 'tiktok' && platform !== 'linkedin') return;
    fetch(`/api/agents/content/follow-suggestions?platform=${platform}`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d?.ok) { setData(d); setDone(new Set((d.doneHandles || []).map((h: string) => h.toLowerCase()))); }
      }).catch(() => {});
  }, [platform]);

  if (!data) return null;
  const profileUrl = (h: string) => platform === 'instagram' ? `https://www.instagram.com/${h}` : platform === 'linkedin' ? `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(h)}` : `https://www.tiktok.com/@${h}`;

  const toggleDone = async (handle: string, prospectId: string | null) => {
    const key = handle.toLowerCase();
    const next = !done.has(key);
    setBusy(key);
    setDone(prev => { const s = new Set(prev); next ? s.add(key) : s.delete(key); return s; });
    try {
      await fetch('/api/agents/content/follow-suggestions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ platform, handle, prospectId, done: next }),
      });
    } catch { /* keep optimistic state */ } finally { setBusy(null); }
  };

  const doneCount = done.size;
  const recommended = data.realHandles?.length || 0;

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <span className="text-xs font-semibold text-white/80">
          {en ? '👥 Accounts to follow — activate your account' : '👥 Comptes à suivre — active ton compte'}
          {recommended > 0 && <span className="ml-2 text-[10px] text-emerald-300/80">{doneCount}/{recommended} {en ? 'followed' : 'suivis'} ✓</span>}
        </span>
        <span className="text-white/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-[10px] text-white/40">{data.note}</p>

          {Array.isArray(data.warmingSteps) && data.warmingSteps.length > 0 && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2.5">
              <div className="text-[11px] font-semibold text-amber-200 mb-1">{en ? '🔥 Warm up your account (max reach)' : '🔥 Réchauffe ton compte (portée max)'}</div>
              <ul className="space-y-1">
                {data.warmingSteps.map((s: string, i: number) => (
                  <li key={i} className="text-[10px] text-white/55 flex gap-1.5"><span className="text-amber-300">{i + 1}.</span><span>{s}</span></li>
                ))}
              </ul>
            </div>
          )}

          {recommended > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1">{en ? 'Peers / local — follow then mark done' : 'Confrères / locaux — suis puis marque "Fait"'} ({data.sector})</div>
              <div className="space-y-1.5">
                {data.realHandles.map((h: any) => {
                  const isDone = done.has(h.handle.toLowerCase());
                  return (
                    <div key={h.handle} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${isDone ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
                      <a href={profileUrl(h.handle)} target="_blank" rel="noopener noreferrer" title={h.company} className="flex-1 min-w-0 text-[11px] font-medium text-white/80 hover:text-emerald-300 truncate">@{h.handle} <span className="text-[10px] text-white/30">↗</span></a>
                      <button
                        type="button" disabled={busy === h.handle.toLowerCase()}
                        onClick={() => toggleDone(h.handle, h.prospectId || null)}
                        className={`text-[10px] px-2 py-1 rounded-md font-semibold transition disabled:opacity-50 ${isDone ? 'bg-emerald-600 text-white' : 'border border-white/15 text-white/60 hover:border-emerald-500/50 hover:text-emerald-300'}`}
                      >
                        {isDone ? (en ? '✓ Done' : '✓ Fait') : (en ? 'Mark done' : 'Fait')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Array.isArray(data.categories) && data.categories.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1">{en ? 'Explore & follow' : 'À explorer & suivre'}</div>
              <div className="space-y-1.5">
                {data.categories.map((c: any, i: number) => (
                  <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 hover:border-emerald-500/40">
                    <div className="text-[11px] font-medium text-white/80">{c.label} ↗</div>
                    <div className="text-[10px] text-white/40">{c.why}</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
