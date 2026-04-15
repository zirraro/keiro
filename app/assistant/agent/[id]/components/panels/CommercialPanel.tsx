'use client';

/**
 * Léo — Commercial prospection dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import { useState, useCallback } from 'react';
import {
  fmt, fmtDate,
  KpiCard, SectionTitle,
} from './Primitives';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

// Internal helper — standalone launch button for Leo's proactive scraping.
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
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-xl font-bold text-white">{today}</div>
          <div className="text-[10px] text-white/40">{p.commercialLabelToday}</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-xl font-bold text-white">{thisWeek}</div>
          <div className="text-[10px] text-white/40">{p.commercialLabelThisWeek}</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-xl font-bold text-white">{thisMonth}</div>
          <div className="text-[10px] text-white/40">{p.commercialLabelThisMonth}</div>
        </div>
      </div>

      <SectionTitle>{p.commercialSectionChannel}</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2 text-center">
          <div className="text-lg font-bold text-blue-400">{stats.withEmail || 0}</div>
          <div className="text-[9px] text-blue-400/60">{p.commercialWithEmail}</div>
          <div className="text-[8px] text-blue-400/40">{stats.emailNotStarted || 0} a contacter</div>
        </div>
        <div className="rounded-lg bg-pink-500/10 border border-pink-500/20 p-2 text-center">
          <div className="text-lg font-bold text-pink-400">{stats.withInstagram || 0}</div>
          <div className="text-[9px] text-pink-400/60">{p.commercialWithInstagram}</div>
          <div className="text-[8px] text-pink-400/40">{stats.dmNotStarted || 0} a DM</div>
        </div>
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2 text-center">
          <div className="text-lg font-bold text-purple-400">{stats.withTiktok || 0}</div>
          <div className="text-[9px] text-purple-400/60">{p.commercialWithTiktok}</div>
        </div>
        <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-2 text-center">
          <div className="text-lg font-bold text-cyan-400">{stats.withLinkedin || 0}</div>
          <div className="text-[9px] text-cyan-400/60">{p.commercialWithLinkedin}</div>
        </div>
      </div>

      <SectionTitle>{p.commercialSectionFunnel}</SectionTitle>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2 text-center">
          <div className="text-lg font-bold text-blue-400">{stats.total}</div>
          <div className="text-[9px] text-blue-400/60">{p.commercialLabelIdentified}</div>
        </div>
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2 text-center">
          <div className="text-lg font-bold text-purple-400">{contactes}</div>
          <div className="text-[9px] text-purple-400/60">{p.commercialLabelContacted}</div>
        </div>
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
          <div className="text-lg font-bold text-emerald-400">{qualifies}</div>
          <div className="text-[9px] text-emerald-400/60">{p.commercialLabelQualified}</div>
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

      {/* Launch prospection button */}
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
                <span className="text-[9px] text-white/25">{fmtDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
