'use client';

/**
 * LÉO — Onglet Prospection / Session de démarchage (founder 13/07).
 * Un espace dédié : lancer une session paramétrée → liste de prospects à
 * appeler, éditer la fiche CRM en inline (sans ouvrir le CRM), marquer le
 * résultat, et suivre les STATS + l'HISTORIQUE ("j'ai appelé X, Y ont répondu").
 *
 * Réutilise les endpoints existants : call-list (liste), call-outcome (résultat),
 * update-fiche (commentaire/statut → lu par tous les agents), prospection-stats.
 */

import { useState, useCallback, useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/context';

type Stats = { called: number; reached: number; interested: number; callback: number; not_interested: number; no_answer: number };

const TEMP: Record<string, string> = {
  hot: 'bg-red-500/20 text-red-300', warm: 'bg-amber-500/20 text-amber-200',
  cold: 'bg-white/10 text-white/50', dead: 'bg-white/5 text-white/30',
};

export default function ProspectionSession() {
  const { locale } = useLanguage();
  const en = locale === 'en';

  // Paramètres de session
  const [sector, setSector] = useState('');
  const [city, setCity] = useState('');
  const [temp, setTemp] = useState('');
  const [count, setCount] = useState(20);

  const [list, setList] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [openEdit, setOpenEdit] = useState<Record<string, boolean>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  const [stats, setStats] = useState<{ today: Stats; week: Stats; reachRate: number; interestRate: number; history: any[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/agents/commercial/prospection-stats', { credentials: 'include' });
      if (r.ok) setStats(await r.json());
    } catch { /* noop */ }
  }, []);

  const launch = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        ...(sector ? { sector } : {}), ...(city ? { city } : {}),
        ...(temp ? { temperature: temp } : {}), limit: String(count),
      }).toString();
      const res = await fetch(`/api/agents/commercial/call-list?${qs}`, { credentials: 'include' });
      const d = await res.json();
      setList(d?.ok ? d.callList : []);
    } catch { setList([]); }
    setLoading(false);
  }, [sector, city, temp, count]);

  useEffect(() => { loadStats(); launch(); }, [loadStats]); // eslint-disable-line react-hooks/exhaustive-deps

  const mark = useCallback(async (id: string, outcome: string) => {
    setBusy(id);
    try {
      await fetch('/api/agents/commercial/call-outcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ prospectId: id, outcome, note: noteDraft[id] || undefined }),
      });
      setList(prev => (prev || []).filter(p => p.id !== id));
      loadStats();
    } catch { /* noop */ }
    setBusy(null);
  }, [noteDraft, loadStats]);

  const saveFiche = useCallback(async (id: string, patch: { comment?: string; status?: string; temperature?: string }) => {
    setBusy(id);
    try {
      const r = await fetch('/api/agents/commercial/update-fiche', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ prospectId: id, ...patch }),
      });
      if (r.ok) {
        setList(prev => (prev || []).map(p => p.id === id ? { ...p, temperature: patch.temperature || p.temperature, status: patch.status || p.status } : p));
        if (patch.comment) setNoteDraft(prev => ({ ...prev, [id]: '' }));
        setSavedId(id); setTimeout(() => setSavedId(s => s === id ? null : s), 1500);
      }
    } catch { /* noop */ }
    setBusy(null);
  }, []);

  const StatCard = ({ label, value, accent }: { label: string; value: number | string; accent?: string }) => (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-2.5 text-center">
      <div className={`text-lg sm:text-xl font-bold ${accent || 'text-white'}`}>{value}</div>
      <div className="text-[10px] text-white/50">{label}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ── STATS SESSION ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-white">{en ? '📊 Your prospecting' : '📊 Ton démarchage'}</h3>
          <button onClick={() => setShowHistory(s => !s)} className="text-[11px] text-orange-300 hover:text-orange-200 font-medium">
            {showHistory ? (en ? 'Hide history' : "Masquer l'historique") : (en ? 'See history' : "Voir l'historique")}
          </button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <StatCard label={en ? 'Called today' : "Appelés aujourd'hui"} value={stats?.today.called ?? 0} accent="text-orange-300" />
          <StatCard label={en ? 'Called (7d)' : 'Appelés (7j)'} value={stats?.week.called ?? 0} />
          <StatCard label={en ? 'Reached' : 'Joints'} value={stats?.week.reached ?? 0} accent="text-cyan-300" />
          <StatCard label={en ? 'Interested' : 'Intéressés'} value={stats?.week.interested ?? 0} accent="text-emerald-300" />
          <StatCard label={en ? 'Reach rate' : 'Taux de contact'} value={`${stats?.reachRate ?? 0}%`} />
          <StatCard label={en ? 'To follow up' : 'À relancer'} value={stats?.week.callback ?? 0} accent="text-amber-300" />
        </div>
        {showHistory && (
          <div className="mt-2 rounded-xl bg-black/20 border border-white/10 p-2 max-h-52 overflow-y-auto">
            {(stats?.history || []).length === 0
              ? <p className="text-[11px] text-white/40 text-center py-3">{en ? 'No call logged yet.' : 'Aucun appel enregistré pour le moment.'}</p>
              : (stats?.history || []).map((h, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 text-[11px] border-b border-white/5 last:border-0">
                  <span className="whitespace-nowrap">{h.label}</span>
                  {h.note && <span className="text-white/50 truncate flex-1">— {h.note}</span>}
                  <span className="text-white/30 ml-auto whitespace-nowrap">{(h.at || '').slice(0, 10)}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── LANCER UNE SESSION ── */}
      <div className="rounded-xl border border-orange-500/25 bg-orange-500/[0.05] p-3">
        <div className="text-xs font-bold text-orange-200 mb-1">{en ? '🎯 Launch a prospecting session' : '🎯 Lancer une session de démarchage'}</div>
        <p className="text-[11px] text-white/50 mb-2">{en ? 'Pick your targeting — Léo stacks the prospects to call, with the recommended action per fiche.' : 'Choisis ton ciblage — Léo empile les prospects à appeler, avec l\'action recommandée par fiche.'}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input value={sector} onChange={e => setSector(e.target.value)} placeholder={en ? 'Activity (e.g. beauty)' : 'Activité (ex : institut)'} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30" />
          <input value={city} onChange={e => setCity(e.target.value)} placeholder={en ? 'Region / city' : 'Région / ville'} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30" />
          <select value={temp} onChange={e => setTemp(e.target.value)} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm">
            <option value="">{en ? 'All temps' : 'Toutes T°'}</option>
            <option value="hot">🔥 {en ? 'Hot' : 'Chauds'}</option>
            <option value="warm">🌤️ {en ? 'Warm' : 'Tièdes'}</option>
            <option value="cold">❄️ {en ? 'Cold' : 'Froids'}</option>
          </select>
          <select value={count} onChange={e => setCount(Number(e.target.value))} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm">
            {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n} {en ? 'prospects' : 'prospects'}</option>)}
          </select>
        </div>
        <button onClick={launch} disabled={loading} className="mt-2 w-full py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold disabled:opacity-50 active:scale-[0.99] transition-all">
          {loading ? '…' : (en ? '🚀 Launch the session' : '🚀 Lancer la session')}
        </button>
      </div>

      {/* ── LISTE À APPELER ── */}
      {list && list.length === 0 && (
        <p className="text-xs text-white/40 py-4 text-center">{en ? 'No prospect to call for this targeting. Widen the filters or run Léo to source more.' : 'Aucun prospect à appeler pour ce ciblage. Élargis les filtres ou lance Léo pour en sourcer davantage.'}</p>
      )}
      <div className="flex flex-col gap-2">
        {(list || []).map((p: any) => (
          <div key={p.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{p.name}</span>
                  {p.company && <span className="text-xs text-white/50">· {p.company}</span>}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TEMP[p.temperature] || TEMP.cold}`}>{p.temperature}</span>
                </div>
                <div className="text-[11px] text-white/40 mt-0.5">{[p.business_type, p.city].filter(Boolean).join(' · ')}</div>
              </div>
              <a href={`tel:${p.phone}`} className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300 text-sm font-semibold whitespace-nowrap active:scale-95">📞 {p.phone}</a>
            </div>
            <div className="mt-2 text-[11px] text-orange-200 bg-orange-500/10 border border-orange-500/15 rounded-lg px-2 py-1.5">
              <strong>{en ? 'Action:' : 'Action :'}</strong> {p.recommended_action}
            </div>
            {(p.fiche?.notes || p.fiche?.summary) && (
              <p className="mt-1.5 text-[11px] text-white/50 line-clamp-2">{p.fiche.summary || p.fiche.notes}</p>
            )}
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { k: 'reached_interested', l: en ? '✅ Interested' : '✅ Intéressé' },
                { k: 'follow_up', l: en ? '🔁 Follow up' : '🔁 À relancer' },
                { k: 'not_reached', l: en ? '📵 No answer' : '📵 Pas joint' },
                { k: 'reached_not_interested', l: en ? '🚫 Not interested' : '🚫 Pas intéressé' },
              ].map(o => (
                <button key={o.k} onClick={() => mark(p.id, o.k)} disabled={busy === p.id}
                  className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-[11px] font-medium disabled:opacity-40 active:scale-95 transition-all">
                  {o.l}
                </button>
              ))}
            </div>
            <button onClick={() => setOpenEdit(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
              className="mt-2 text-[11px] text-orange-300 hover:text-orange-200 font-medium">
              {openEdit[p.id] ? (en ? '▾ Close fiche' : '▾ Fermer la fiche') : (en ? '✏️ Edit fiche (note, status)' : '✏️ Modifier la fiche (note, statut)')}
            </button>
            {openEdit[p.id] && (
              <div className="mt-2 space-y-2 rounded-lg bg-black/20 border border-white/10 p-2.5">
                <textarea value={noteDraft[p.id] ?? ''} onChange={e => setNoteDraft(prev => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder={en ? 'Comment (read by all agents: Hugo follow-ups, Léna…)' : 'Commentaire (lu par tous les agents : relances Hugo, Léna…)'}
                  rows={2} className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-[12px] placeholder-white/30 resize-y focus:outline-none focus:ring-1 focus:ring-orange-500/40" />
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={p.status || 'identifie'} onChange={e => saveFiche(p.id, { status: e.target.value })} className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 text-[11px]">
                    {[
                      { v: 'identifie', l: en ? 'Identified' : 'Identifié' }, { v: 'contacte', l: en ? 'Contacted' : 'Contacté' },
                      { v: 'repondu', l: en ? 'Replied' : 'A répondu' }, { v: 'demo', l: en ? 'Demo' : 'Démo' },
                      { v: 'sprint', l: en ? 'Negotiation' : 'Négociation' }, { v: 'client', l: 'Client' }, { v: 'perdu', l: en ? 'Lost' : 'Perdu' },
                    ].map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    {[{ v: 'hot', e: '🔥' }, { v: 'warm', e: '🌤️' }, { v: 'cold', e: '❄️' }].map(tp => (
                      <button key={tp.v} onClick={() => saveFiche(p.id, { temperature: tp.v })}
                        className={`w-7 h-7 rounded-lg text-sm transition-all ${p.temperature === tp.v ? 'bg-orange-500/30 border border-orange-400/40' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}>{tp.e}</button>
                    ))}
                  </div>
                  <button onClick={() => saveFiche(p.id, { comment: (noteDraft[p.id] || '').trim() })} disabled={busy === p.id || !(noteDraft[p.id] || '').trim()}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-orange-500/80 hover:bg-orange-500 text-white text-[11px] font-semibold disabled:opacity-40 active:scale-95">
                    {busy === p.id ? '…' : savedId === p.id ? (en ? '✓ Saved' : '✓ Enregistré') : (en ? '💾 Save note' : '💾 Enregistrer')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
