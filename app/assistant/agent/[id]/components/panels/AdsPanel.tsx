'use client';

/**
 * Ads campaign dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmt, fmtCurrency,
  KpiCard, SectionTitle, EmptyState, DonutChart, ProgressBar,
} from './Primitives';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

export function AdsPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const stats: any = data.adsStats || { campaigns: 0, totalSpend: 0, avgRoas: 0, roas: 0, totalConversions: 0, totalImpressions: 0, recentCampaigns: [] };

  const totalSpend = (stats.recentCampaigns || []).reduce((s: number, c: any) => s + c.spend, 0) || 1;
  const statusColors: Record<string, string> = {
    active: '#34d399',
    paused: '#fbbf24',
    ended: '#f87171',
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={p.adsKpiActive} value={fmt(stats.campaigns)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.adsKpiBudget} value={fmtCurrency(stats.totalSpend)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.adsKpiRoas} value={`${(stats.avgRoas || 0).toLocaleString(typeof window !== 'undefined' && localStorage.getItem('keiro_language') === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1 })}x`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Visual: budget & ROAS */}
      <SectionTitle>{p.adsSectionPerf}</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={(stats.recentCampaigns || []).slice(0, 5).map((c: any, i: number) => ({
              value: c.spend,
              color: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'][i % 5],
              label: (c.name || '').substring(0, 15),
            }))}
            label={fmtCurrency(stats.totalSpend)}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={Math.min(Math.round(stats.avgRoas * 33), 100)} max={100} color="#22c55e" label={`ROAS moyen (${stats.avgRoas}x)`} />
          <ProgressBar value={stats.campaigns} max={10} color={gradientFrom} label={p.adsKpiActive} />
          {(stats.recentCampaigns || []).slice(0, 3).map((c: any, i: number) => (
            <ProgressBar key={i} value={Math.round(c.roas * 33)} max={100} color={['#3b82f6', '#22c55e', '#f59e0b'][i]} label={`${(c.name || '').substring(0, 20)} (${c.roas}x)`} />
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} {p.adsBtnCreate}
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
      </div>

      <SectionTitle>{p.adsSectionCampaigns}</SectionTitle>
      {(stats.recentCampaigns || []).length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {(stats.recentCampaigns || []).slice(0, 8).map((c: any, i: number) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/80 font-medium truncate flex-1 mr-2">{c.name}</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: `${statusColors[c.status] ?? '#a78bfa'}22`,
                    color: statusColors[c.status] ?? '#a78bfa',
                  }}
                >
                  {c.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-white/50">
                <span>Depense: <span className="text-white/70 font-medium">{fmtCurrency(c.spend)}</span></span>
                <span>ROAS: <span className="text-white/70 font-medium">{(c.roas || 0).toLocaleString(typeof window !== 'undefined' && localStorage.getItem('keiro_language') === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1 })}x</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>{p.adsSectionBudget}</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        {(stats.recentCampaigns || []).length === 0 ? (
          <p className="text-sm text-white/40 text-center">{p.adsNoCampaign}</p>
        ) : (
          <>
            <div className="flex h-6 rounded-full overflow-hidden">
              {(stats.recentCampaigns || []).map((c: any, i: number) => (
                <div
                  key={i}
                  className="h-full"
                  style={{
                    width: `${(c.spend / totalSpend) * 100}%`,
                    background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                    opacity: 1 - i * 0.12,
                  }}
                  title={`${c.name}: ${fmtCurrency(c.spend)}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {(stats.recentCampaigns || []).map((c: any, i: number) => (
                <span key={i} className="text-xs text-white/50">
                  {c.name}: <span className="text-white/80 font-medium">{fmtCurrency(c.spend)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
