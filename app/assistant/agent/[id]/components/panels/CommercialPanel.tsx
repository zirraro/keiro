'use client';

/**
 * Léo — Commercial prospection dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  fmt, fmtDate,
  KpiCard, SectionTitle,
} from './Primitives';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

// Direction controls — let the founder steer Léo toward a sector + city.
// Hits gmaps with a custom query and persists the focus to agent_settings
// so the next cron pass keeps targeting the same niche. Replaces the
// generic "lance une recherche" button which had no memory.
function LeoDirectionPanel() {
  const [sector, setSector] = useState('');
  const [city, setCity] = useState('');
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [persistedFocus, setPersistedFocus] = useState<{ sector?: string; city?: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('keiro_leo_focus');
      if (raw) {
        const f = JSON.parse(raw);
        if (f && (f.sector || f.city)) {
          setPersistedFocus(f);
          setSector(f.sector || '');
          setCity(f.city || '');
        }
      }
    } catch {}
    fetch('/api/agents/commercial/focus', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const f = d?.focus;
        if (f && (f.sector || f.city)) {
          setPersistedFocus(f);
          setSector(f.sector || '');
          setCity(f.city || '');
        }
      })
      .catch(() => {});
  }, []);

  const SECTORS = ['restaurant', 'boutique', 'coach', 'coiffeur', 'fleuriste', 'caviste', 'salon de beaute', 'traiteur', 'photographe'];

  const launch = useCallback(async () => {
    setLaunching(true);
    setResult(null);
    const q = [sector, city].filter(Boolean).join(' ');
    try {
      const res = await fetch('/api/agents/gmaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: q || undefined }),
      });
      const data = await res.json();
      setResult({
        ok: data.ok !== false,
        message: data.message || data.error || `${data.imported || 0} prospects ajoutes depuis Google Maps`,
      });
    } catch (e: any) {
      setResult({ ok: false, message: e.message });
    } finally { setLaunching(false); }
  }, [sector, city]);

  const saveFocus = useCallback(async () => {
    setPersisting(true);
    const focus = { sector, city };
    try {
      try { localStorage.setItem('keiro_leo_focus', JSON.stringify(focus)); } catch {}
      await fetch('/api/agents/commercial/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(focus),
      });
      setPersistedFocus(focus);
    } catch {}
    finally { setPersisting(false); }
  }, [sector, city]);

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-900/10 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-bold text-blue-300">{'🎯'} Diriger Léo</h4>
        {persistedFocus && (persistedFocus.sector || persistedFocus.city) && (
          <span className="text-[10px] text-blue-300/60">
            Focus actuel : <strong>{persistedFocus.sector || 'tous secteurs'}</strong>
            {persistedFocus.city && <> · {persistedFocus.city}</>}
          </span>
        )}
      </div>
      <p className="text-[11px] text-white/50">Concentre la prospection sur un secteur et/ou une ville. Léo prospectera ces cibles en priorité à chaque passage (toutes les 6h).</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-white/40 uppercase font-bold mb-1 block">Secteur</label>
          <input
            list="leo-sector-options"
            type="text"
            value={sector}
            onChange={e => setSector(e.target.value)}
            placeholder="ex: coach, restaurant..."
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <datalist id="leo-sector-options">
            {SECTORS.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label className="text-[10px] text-white/40 uppercase font-bold mb-1 block">Ville</label>
          <input
            type="text"
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="ex: Amiens, Paris..."
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={launch}
          disabled={launching}
          className="flex-1 min-w-[160px] px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 min-h-[44px]"
        >
          {launching ? 'Recherche...' : `${'🔍'} Lancer une recherche maintenant`}
        </button>
        <button
          onClick={saveFocus}
          disabled={persisting || (!sector && !city)}
          className="px-4 py-2 bg-white/10 text-white/80 text-xs font-bold rounded-xl hover:bg-white/15 transition-all disabled:opacity-40 min-h-[44px]"
        >
          {persisting ? '...' : `${'💾'} Sauvegarder le focus`}
        </button>
      </div>

      {result && (
        <div className={`text-[10px] px-3 py-2 rounded-lg ${result.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}

import { completeness as fiCompleteness } from '@/lib/agents/fiche-completeness';

// Profile completeness — type-aware. Defers to the shared helper so
// the UI, Hugo's visual gate, and Léo's enrichment trigger agree on
// what "70% complete" means per business type.
function completeness(p: any): { pct: number; missing: string[] } {
  const c = fiCompleteness(p);
  return { pct: c.pct, missing: c.missingEssentials };
}

// Internal helper — standalone launch button for Leo's proactive scraping.
// LÉO — Prospection téléphonique (founder 10/07) : sélectionne secteur/zone →
// Léo empile les prospects à appeler avec l'action recommandée + les infos de
// fiche ; le founder marque le résultat → la fiche se met à jour.
function PhoneProspection() {
  const { locale } = useLanguage();
  const isEn = locale === 'en';
  const [sector, setSector] = useState('');
  const [city, setCity] = useState('');
  const [list, setList] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ ...(sector ? { sector } : {}), ...(city ? { city } : {}) }).toString();
      const res = await fetch(`/api/agents/commercial/call-list?${qs}`, { credentials: 'include' });
      const d = await res.json();
      setList(d?.ok ? d.callList : []);
    } catch { setList([]); }
    setLoading(false);
  }, [sector, city]);

  const mark = useCallback(async (id: string, outcome: string) => {
    setBusy(id);
    try {
      await fetch('/api/agents/commercial/call-outcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ prospectId: id, outcome }),
      });
      setList(prev => (prev || []).filter(p => p.id !== id)); // retiré de la file
    } catch { /* noop */ }
    setBusy(null);
  }, []);

  const TEMP: Record<string, string> = { hot: 'bg-red-500/20 text-red-300', warm: 'bg-amber-500/20 text-amber-200', cold: 'bg-white/10 text-white/50', dead: 'bg-white/5 text-white/30' };

  return (
    <div className="mt-4">
      <SectionTitle>{isEn ? '📞 Phone prospecting — your call list' : '📞 Prospection téléphonique — ta liste à appeler'}</SectionTitle>
      <p className="text-[11px] text-white/50 mb-2">{isEn ? 'Pick a sector/zone, Léo stacks the prospects to call (with a recommended action). Mark each result — the fiche updates and feeds the strategy.' : 'Choisis un secteur/zone, Léo empile les prospects à appeler (avec l\'action recommandée). Marque chaque résultat — la fiche se met à jour et nourrit la stratégie.'}</p>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input value={sector} onChange={e => setSector(e.target.value)} placeholder={isEn ? 'Sector (e.g. beauty)' : 'Secteur (ex : institut)'} className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30" />
        <input value={city} onChange={e => setCity(e.target.value)} placeholder={isEn ? 'City/zone' : 'Ville/zone'} className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30" />
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-all">
          {loading ? '…' : (isEn ? 'Load list' : 'Charger la liste')}
        </button>
      </div>

      {list && list.length === 0 && (
        <p className="text-xs text-white/40 py-3 text-center">{isEn ? 'No prospect to call for this selection.' : 'Aucun prospect à appeler pour cette sélection.'}</p>
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
              <strong>{isEn ? 'Action:' : 'Action :'}</strong> {p.recommended_action}
            </div>
            {(p.fiche?.notes || p.fiche?.summary) && (
              <p className="mt-1.5 text-[11px] text-white/50 line-clamp-2">{p.fiche.summary || p.fiche.notes}</p>
            )}
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { k: 'reached_interested', l: isEn ? '✅ Interested' : '✅ Intéressé' },
                { k: 'follow_up', l: isEn ? '🔁 Follow up' : '🔁 À relancer' },
                { k: 'not_reached', l: isEn ? '📵 No answer' : '📵 Pas joint' },
                { k: 'reached_not_interested', l: isEn ? '🚫 Not interested' : '🚫 Pas intéressé' },
              ].map(o => (
                <button key={o.k} onClick={() => mark(p.id, o.k)} disabled={busy === p.id}
                  className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-[11px] font-medium disabled:opacity-40 active:scale-95 transition-all">
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LaunchProspectionButton() {
  const { t } = useLanguage();
  const p = t.panels;
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [query, setQuery] = useState('');

  const launch = useCallback(async () => {
    setLaunching(true);
    setResult(null);
    try {
      const res = await fetch('/api/agents/gmaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: query || undefined }),
      });
      const data = await res.json();
      setResult({ ok: data.ok !== false, message: data.message || data.error || `${data.imported || 0} prospects trouves sur Google Maps` });
    } catch (e: any) {
      setResult({ ok: false, message: e.message });
    } finally { setLaunching(false); }
  }, [query]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={p.commercialLaunchInput}
          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
        <button
          onClick={launch}
          disabled={launching}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-1 whitespace-nowrap min-h-[44px]"
        >
          {launching ? <span className="animate-spin">{'...'}</span> : <>{'\uD83D\uDD0D'} {p.commercialLaunchBtn}</>}
        </button>
      </div>
      {result && (
        <div className={`text-[10px] px-2 py-1 rounded-lg ${result.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}

export function CommercialPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const prospects = (data as any).prospects || [];
  const pipeline = (data as any).pipeline || {};
  const stats = (data as any).stats || { total: 0, hot: 0, warm: 0, cold: 0, conversionRate: 0 };

  // Stats par période
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const today = prospects.filter((p: any) => new Date(p.created_at).getTime() > now - oneDay).length;
  const thisWeek = prospects.filter((p: any) => new Date(p.created_at).getTime() > now - 7 * oneDay).length;
  const thisMonth = prospects.filter((p: any) => new Date(p.created_at).getTime() > now - 30 * oneDay).length;

  const contactes = prospects.filter((p: any) => p.status && !['identifie'].includes(p.status)).length;
  const qualifies = prospects.filter((p: any) => p.temperature === 'hot' || p.temperature === 'warm').length;

  const PIPELINE_ORDER = ['identifie', 'contacte', 'relance_1', 'relance_2', 'relance_3', 'repondu', 'client', 'perdu'];
  const PIPELINE_COLORS: Record<string, string> = { identifie: '#94a3b8', contacte: '#3b82f6', relance_1: '#38bdf8', relance_2: '#818cf8', relance_3: '#a78bfa', repondu: '#8b5cf6', client: '#10b981', perdu: '#ef4444' };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <KpiCard label={p.commercialKpiTotal} value={fmt(stats.total)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.commercialKpiToday} value={fmt(stats.todayCount || today)} gradientFrom="#06b6d4" gradientTo="#0891b2" />
        <KpiCard label={p.commercialKpiHot} value={fmt(stats.hot)} gradientFrom="#ef4444" gradientTo="#f97316" />
        <KpiCard label={p.commercialKpiWarm} value={fmt(stats.warm)} gradientFrom="#f59e0b" gradientTo="#eab308" />
        <KpiCard label={p.commercialKpiConversion} value={`${stats.conversionRate}%`} gradientFrom="#10b981" gradientTo="#22c55e" />
      </div>

      <SectionTitle>{p.commercialSectionPeriod}</SectionTitle>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-2 sm:p-3 text-center">
          <div className="text-lg sm:text-xl font-bold text-white">{today}</div>
          <div className="text-[10px] text-white/50">{p.commercialLabelToday}</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-2 sm:p-3 text-center">
          <div className="text-lg sm:text-xl font-bold text-white">{thisWeek}</div>
          <div className="text-[10px] text-white/50">{p.commercialLabelThisWeek}</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-2 sm:p-3 text-center">
          <div className="text-lg sm:text-xl font-bold text-white">{thisMonth}</div>
          <div className="text-[10px] text-white/50">{p.commercialLabelThisMonth}</div>
        </div>
      </div>

      {/* Prospection téléphonique — action PRIMAIRE, remontée en haut (founder :
          l'onglet était trop bas/invisible). Le founder appelle, marque le résultat. */}
      <PhoneProspection />

      <SectionTitle>{p.commercialSectionChannel}</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2 text-center">
          <div className="text-lg font-bold text-blue-400">{stats.withEmail || 0}</div>
          <div className="text-[10px] text-blue-400/60">{p.commercialWithEmail}</div>
          <div className="text-[10px] text-blue-300/60">{stats.emailNotStarted || 0} à contacter</div>
        </div>
        <div className="rounded-lg bg-pink-500/10 border border-pink-500/20 p-2 text-center">
          <div className="text-lg font-bold text-pink-400">{stats.withInstagram || 0}</div>
          <div className="text-[10px] text-pink-400/60">{p.commercialWithInstagram}</div>
          <div className="text-[10px] text-pink-300/60">{stats.dmNotStarted || 0} à DM</div>
        </div>
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2 text-center">
          <div className="text-lg font-bold text-purple-400">{stats.withTiktok || 0}</div>
          <div className="text-[10px] text-purple-400/60">{p.commercialWithTiktok}</div>
        </div>
        <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-2 text-center">
          <div className="text-lg font-bold text-cyan-400">{stats.withLinkedin || 0}</div>
          <div className="text-[10px] text-cyan-400/60">{p.commercialWithLinkedin}</div>
        </div>
      </div>

      <SectionTitle>{p.commercialSectionFunnel}</SectionTitle>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2 text-center">
          <div className="text-lg font-bold text-blue-400">{stats.total}</div>
          <div className="text-[10px] text-blue-400/60">{p.commercialLabelIdentified}</div>
        </div>
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2 text-center">
          <div className="text-lg font-bold text-purple-400">{contactes}</div>
          <div className="text-[10px] text-purple-400/60">{p.commercialLabelContacted}</div>
        </div>
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
          <div className="text-lg font-bold text-emerald-400">{qualifies}</div>
          <div className="text-[10px] text-emerald-400/60">{p.commercialLabelQualified}</div>
        </div>
      </div>

      <SectionTitle>{p.commercialSectionPipeline}</SectionTitle>
      <div className="space-y-2">
        {PIPELINE_ORDER.filter(s => pipeline[s]).map(status => {
          const count = pipeline[status] || 0;
          const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
          const color = PIPELINE_COLORS[status] || '#6b7280';
          return (
            <div key={status} className="flex items-center gap-2">
              <span className="text-[10px] text-white/50 w-16 text-right capitalize">{status.replace(/_/g, ' ')}</span>
              <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
              <span className="text-[10px] text-white/40 w-12">{count} ({pct}%)</span>
            </div>
          );
        })}
      </div>

      {/* Direction controls — what to prospect & how to focus */}
      <SectionTitle>Direction de Léo</SectionTitle>
      <LeoDirectionPanel />

      {/* Latest additions — proves Léo is working, shows quality */}
      <SectionTitle>{'📋'} Derniers ajouts de Léo</SectionTitle>
      {prospects.length === 0 ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-900/5 p-4 text-center">
          <div className="text-2xl mb-1">{'⏳'}</div>
          <p className="text-xs text-amber-300 font-bold">Aucun prospect pour le moment</p>
          <p className="text-[10px] text-white/40 mt-1">Léo prospecte automatiquement toutes les 6h. Lance une recherche ciblée ci-dessus pour démarrer immédiatement.</p>
        </div>
      ) : (
        <>
          {(() => {
            const avgCompleteness = Math.round(
              prospects.slice(0, 50).reduce((s: number, p: any) => s + completeness(p).pct, 0) / Math.min(50, prospects.length)
            );
            const exhaustive = prospects.slice(0, 50).filter((p: any) => completeness(p).pct >= 70).length;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
                  <div className="text-lg font-bold text-emerald-400">{avgCompleteness}%</div>
                  <div className="text-[10px] text-emerald-400/60">Complétude moyenne</div>
                </div>
                <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2 text-center">
                  <div className="text-lg font-bold text-blue-400">{exhaustive}/{Math.min(50, prospects.length)}</div>
                  <div className="text-[10px] text-blue-400/60">Fiches exhaustives (70%+)</div>
                </div>
                <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2 text-center col-span-2 sm:col-span-1">
                  <div className="text-lg font-bold text-purple-400">{today}</div>
                  <div className="text-[10px] text-purple-400/60">Ajoutés aujourd'hui</div>
                </div>
              </div>
            );
          })()}
          <div className="space-y-2">
            {prospects.slice(0, 8).map((pr: any) => {
              const comp = completeness(pr);
              const tempColor = pr.temperature === 'hot' ? '#ef4444' : pr.temperature === 'warm' ? '#f59e0b' : pr.temperature === 'cold' ? '#3b82f6' : '#6b7280';
              return (
                <a
                  key={pr.id}
                  href={`/assistant/crm?prospect=${pr.id}`}
                  className="block rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition-all"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${tempColor}22`, color: tempColor }}
                    >
                      {pr.temperature || 'unscored'}
                    </span>
                    <span className="text-sm font-bold text-white truncate flex-1">{pr.company || '(sans nom)'}</span>
                    <span className="text-[10px] text-white/30 shrink-0">{fmtDate(pr.created_at)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/50">
                    {pr.type && <span className="px-1.5 py-0.5 rounded bg-white/5">{pr.type}</span>}
                    {pr.email && <span>{'📧'}</span>}
                    {pr.instagram && pr.instagram !== 'A_VERIFIER' && <span>{'📷'}</span>}
                    {pr.linkedin_url && <span>{'💼'}</span>}
                    {pr.tiktok_handle && <span>{'🎵'}</span>}
                    <span className="ml-auto flex items-center gap-1.5">
                      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${comp.pct}%`,
                            backgroundColor: comp.pct >= 70 ? '#10b981' : comp.pct >= 40 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-white/40">{comp.pct}%</span>
                    </span>
                  </div>
                  {comp.missing.length > 0 && comp.pct < 70 && (
                    <div className="text-[10px] text-white/30 mt-1">
                      Manque : {comp.missing.slice(0, 3).join(', ')}{comp.missing.length > 3 ? `, +${comp.missing.length - 3}` : ''}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
          {prospects.length > 8 && (
            <a href="/assistant/crm" className="block text-center mt-3 py-2 text-xs text-blue-400 hover:underline">
              Voir les {prospects.length - 8} autres prospects dans le CRM →
            </a>
          )}
        </>
      )}

      {/* Quick action: launch one-shot prospection without focus */}
      <SectionTitle>{p.commercialSectionQuickActions}</SectionTitle>
      <LaunchProspectionButton />

      {/* Recent activities */}
      {(data as any).activities?.length > 0 && (
        <>
          <SectionTitle>{p.recentActions}</SectionTitle>
          <div className="space-y-1">
            {((data as any).activities || []).slice(0, 5).map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03]">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span className="text-[10px] text-white/60 flex-1 truncate">{a.description || a.type}</span>
                <span className="text-[10px] text-white/50">{fmtDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
