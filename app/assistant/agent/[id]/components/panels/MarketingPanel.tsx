'use client';

/**
 * Ami — Marketing strategy master dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmt, fmtCurrency, fmtDate,
  KpiCard, SectionTitle, EmptyState, DonutChart, ProgressBar, ActivityFeed,
} from './Primitives';
import { SocialConnectBanners } from './SharedBanners';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

export function MarketingPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const gs = data.globalStats;
  const recs = data.recommendations ?? [];

  // If globalStats is available, show the master dashboard
  if (gs) {
    return (
      <>
        {/* Connect social networks — hide if already connected */}
        <SocialConnectBanners agentId="marketing" networks={['instagram', 'tiktok', 'linkedin']} connections={(data as any).connections} />

        {/* Hot prospects alert */}
        {/* HotProspectsAlert removed — too much space, only useful for visitor mode */}

        {/* Commercial bloc */}
        <SectionTitle>{p.marketingSectionProspection}</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label={p.marketingLabelTotalProspects} value={fmt(gs.commercial?.totalProspects || 0)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label={p.marketingLabelThisWeek} value={`+${fmt(gs.commercial?.prospectsThisWeek || 0)}`} gradientFrom="#06b6d4" gradientTo="#0891b2" />
          <KpiCard label={p.marketingLabelClients} value={fmt(gs.commercial?.conversions || 0)} gradientFrom="#10b981" gradientTo="#22c55e" />
          <KpiCard label={p.marketingLabelConversion} value={`${gs.commercial?.conversionRate || 0}%`} gradientFrom="#f59e0b" gradientTo="#d97706" />
        </div>

        {/* Funnel */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mt-4">
          <div className="flex items-center justify-between gap-1 text-center">
            {[
              { label: p.marketingFunnelIdentified, value: gs.commercial?.totalProspects || 0, icon: '\u{1F465}', color: '#94a3b8' },
              { label: p.marketingFunnelContacted, value: gs.commercial?.prospectsThisWeek || 0, icon: '\u{1F4E8}', color: '#60a5fa' },
              { label: p.marketingFunnelQualified, value: Math.round((gs.commercial?.prospectsThisWeek || 0) * 0.6), icon: '\u{1F3AF}', color: '#fbbf24' },
              { label: p.marketingFunnelClients, value: gs.commercial?.conversions || 0, icon: '\u{1F525}', color: '#22c55e' },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center flex-1">
                <div className="flex-1 text-center">
                  <div className="text-lg mb-1">{step.icon}</div>
                  <div className="text-sm font-bold text-white" style={{ color: step.color }}>{step.value}</div>
                  <div className="text-[9px] text-white/40 mt-0.5">{step.label}</div>
                </div>
                {i < 3 && <div className="text-white/20 text-xs mx-1">{'\u2192'}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2 mt-3">
          <a href="/assistant/crm" className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
            {'\u{1F4CA}'} {p.viewCrm}
          </a>
          <a href="/generate" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
            {'\u2728'} {p.createContent}
          </a>
        </div>

        {/* Visibilite bloc */}
        <SectionTitle>{p.marketingSectionVisibility}</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard label={p.marketingLabelFollowers} value={fmt((gs as any).instagram?.followersCount || gs.visibility?.traffic || 0)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label={p.marketingLabelActions} value={fmt(gs.visibility?.totalActions || 0)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label={p.marketingLabelRecommendation} value={gs.recommendation ? '1' : '0'} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        </div>

        {/* Instagram engagement bloc */}
        <SectionTitle>{p.marketingSectionInstagram}</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          <KpiCard label={p.marketingLabelPosts} value={fmt((gs as any).instagram?.postsCount || 0)} gradientFrom="#8b5cf6" gradientTo="#6d28d9" />
          <KpiCard label={p.marketingLabelLikes} value={fmt((gs as any).instagram?.likes || 0)} gradientFrom="#ec4899" gradientTo="#f43f5e" />
          <KpiCard label={p.marketingLabelReach} value={fmt((gs as any).instagram?.reach || 0)} gradientFrom="#06b6d4" gradientTo="#0891b2" />
          <KpiCard label={p.marketingLabelEngagement} value={`${((gs as any).instagram?.engagement || 0).toFixed?.(1) || '0'}%`} gradientFrom="#10b981" gradientTo="#059669" />
        </div>

        {/* Finance bloc */}
        <SectionTitle>{p.marketingSectionFinance}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard label={p.marketingLabelAdBudget} value={fmtCurrency(gs.finance.adBudget)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label={p.marketingLabelRoas} value={`${(gs.finance.roas || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}x`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label={p.marketingLabelForecast} value={fmtCurrency(gs.finance.forecast)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        </div>

        {/* Recommendation AMI */}
        {gs.recommendation && (
          <>
            <SectionTitle>{p.marketingSectionRec}</SectionTitle>
            <div
              className="rounded-xl border p-4"
              style={{
                borderColor: `${gradientFrom}44`,
                background: `linear-gradient(135deg, ${gradientFrom}11, ${gradientTo}11)`,
              }}
            >
              <p className="text-sm text-white/90 font-medium">{gs.recommendation}</p>
            </div>
          </>
        )}

        {/* Visual charts */}
        <SectionTitle>{p.marketingSectionOverview}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
            <h4 className="text-white/50 text-[10px] uppercase tracking-wider mb-3 text-center">{p.marketingOverviewBreakdown}</h4>
            <DonutChart
              segments={[
                { value: gs.commercial.leadsWeek, color: '#3b82f6', label: p.marketingOverviewLeads },
                { value: gs.commercial.conversions, color: '#22c55e', label: p.marketingOverviewConversions },
                { value: gs.visibility.traffic, color: '#a855f7', label: p.marketingOverviewTraffic },
                { value: gs.visibility.followers, color: '#f59e0b', label: p.marketingOverviewFollowers },
              ]}
              label={`${gs.commercial.leadsWeek + gs.commercial.conversions + gs.visibility.traffic + gs.visibility.followers}`}
            />
          </div>
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
            <h4 className="text-white/50 text-[10px] uppercase tracking-wider mb-1">{p.marketingOverviewObjectives}</h4>
            <ProgressBar value={gs.commercial.conversions} max={Math.max(gs.commercial.leadsWeek, 1)} color="#22c55e" label={p.marketingLabelConversion} />
            <ProgressBar value={Math.round(gs.visibility.googleRating * 20)} max={100} color="#f59e0b" label={`Google (${gs.visibility.googleRating}/5)`} />
            <ProgressBar value={Math.min(Math.round(gs.finance.roas * 33), 100)} max={100} color="#a855f7" label={`ROAS (${gs.finance.roas}x)`} />
          </div>
        </div>

        {/* Feed equipe temps reel */}
        <SectionTitle>{p.marketingSectionTeamFeed}</SectionTitle>
        {/* Ami's recommendation */}
        {gs.recommendation && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 mt-3">
            <div className="flex items-start gap-2">
              <span className="text-lg">{'\u{1F4A1}'}</span>
              <div>
                <p className="text-xs font-bold text-cyan-400 mb-1">{p.marketingSectionRec}</p>
                <p className="text-xs text-white/70 leading-relaxed">{gs.recommendation}</p>
              </div>
            </div>
          </div>
        )}

        <ActivityFeed
          items={((gs as any).teamActivity ?? gs.recentTeamActivity ?? []).map((a: any) => ({
            label: a.action,
            detail: a.agent,
            date: a.date || a.created_at,
          }))}
          agentName={agentName}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </>
    );
  }

  // Fallback: original marketing panel
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={p.genericKpiMessages} value={fmt(data.totalMessages)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.genericKpiRec} value={fmt(recs.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.genericKpiScore} value="--" gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>{p.genericSectionRec}</SectionTitle>
      {recs.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {recs.slice(0, 8).map((r, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-start gap-3">
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/80 break-words">{r.action}</p>
                <p className="text-xs text-white/40 mt-1">{fmtDate(r.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white/5 rounded-xl border border-white/10 p-4 mt-4">
        <p className="text-xs text-white/50 italic">
          {agentName} a analyse {fmt(data.totalMessages ?? 0)} donnees cette semaine.
        </p>
      </div>
    </>
  );
}
