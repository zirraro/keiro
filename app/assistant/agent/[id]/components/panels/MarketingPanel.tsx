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
import { InstagramAssetBadge } from './InstagramAssetBadge';
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
        {/* Asset badge / connect prompts removed from Marketing — they live in
            the dedicated Jade (DM) and Léna (Content) panels. Showing the same
            "Connect Instagram" / asset card on every agent created visual
            redundancy. The marketing panel focuses on cross-network KPIs. */}

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

        {/* Visibilité bloc — only the metrics that are decoupled from
            Instagram activity belong here. Followers were previously double-
            counted as both "Followers" (this section) and "Posts" (next
            section), and the value silently fell back to gs.visibility.traffic
            which was itself the same IG followers count — leaking organic
            audience figures even when no KeiroAI content had been published. */}
        <SectionTitle>{p.marketingSectionVisibility}</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard label={p.marketingLabelActions} value={fmt(gs.visibility?.totalActions || 0)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label={p.marketingLabelRecommendation} value={gs.recommendation ? '1' : '0'} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        </div>

        {/* Multi-network insights — Instagram, TikTok, LinkedIn parallel.
            Each section follows the same 3-state pattern (not connected /
            connected no-activity / connected with metrics). This is the
            "Insights" experience demonstrated for Meta App Review's
            instagram_business_manage_insights permission. */}
        <SectionTitle>Performance par r\u00e9seau</SectionTitle>
        <div className="space-y-3">
          <NetworkInsightSection
            network="instagram"
            label="Instagram"
            stats={(gs as any).instagram}
            connectUrl="/api/auth/instagram-oauth"
            icon="\u{1F4F8}"
            labelLikes={p.marketingLabelLikes}
            labelEngagement={p.marketingLabelEngagement}
            labelFollowers={p.marketingLabelFollowers}
            labelPosts={p.marketingLabelPosts}
            labelReach={p.marketingLabelReach}
          />
          <NetworkInsightSection
            network="tiktok"
            label="TikTok"
            stats={(gs as any).tiktok}
            connectUrl="/api/auth/tiktok-oauth"
            icon="\u{1F3B5}"
            labelLikes="Likes totaux"
            labelEngagement={p.marketingLabelEngagement}
            labelFollowers="Abonn\u00e9s"
            labelPosts="Vid\u00e9os"
          />
          <NetworkInsightSection
            network="linkedin"
            label="LinkedIn"
            stats={(gs as any).linkedin}
            connectUrl="/api/auth/linkedin-oauth"
            icon="\u{1F4BC}"
            labelLikes="R\u00e9actions"
            labelEngagement={p.marketingLabelEngagement}
            labelFollowers="Connexions"
            labelPosts="Posts publi\u00e9s"
          />
        </div>

        {/* Audit log link \u2014 Meta App Review compliance evidence */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 mt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-blue-300">Audit Graph API</div>
              <div className="text-[10px] text-white/50 mt-0.5">
                Toutes les lectures Insights sont trac\u00e9es avec le tag <code className="text-[9px] text-blue-200">instagram_business_manage_insights</code> dans /meta-audit
              </div>
            </div>
            <a
              href="/meta-audit?lang=en"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-[10px] font-semibold transition flex-shrink-0"
            >
              Voir l&apos;audit \u2197
            </a>
          </div>
        </div>

        {/* Finance bloc */}
        <SectionTitle>{p.marketingSectionFinance}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard label={p.marketingLabelAdBudget} value={fmtCurrency(gs.finance.adBudget)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label={p.marketingLabelRoas} value={`${(gs.finance.roas || 0).toLocaleString(typeof window !== 'undefined' && localStorage.getItem('keiro_language') === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1 })}x`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
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

// Network insight section — same 3-state pattern across IG, TT, LI:
// (1) not connected: focused Connect CTA
// (2) connected, no KeiroAI activity: empty state explaining
//     metrics will come once Léna publishes the first post
// (3) connected + activity: real stats from Graph API
//
// Used in the AMI/Marketing dashboard as the "Insights" demo
// surface for Meta App Review (instagram_business_manage_insights).
function NetworkInsightSection({
  network, label, stats, connectUrl, icon,
  labelLikes, labelEngagement, labelFollowers, labelPosts, labelReach,
}: {
  network: 'instagram' | 'tiktok' | 'linkedin';
  label: string;
  stats: any;
  connectUrl: string;
  icon: string;
  labelLikes: string;
  labelEngagement: string;
  labelFollowers: string;
  labelPosts: string;
  labelReach?: string;
}) {
  if (!stats?.connected) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">{icon}</span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">{label}</div>
              <div className="text-[10px] text-white/50">Connecte {label} pour voir tes vraies metrics live via API</div>
            </div>
          </div>
          <a
            href={connectUrl}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white text-[10px] font-bold flex-shrink-0 transition"
          >
            Connecter →
          </a>
        </div>
      </div>
    );
  }

  if (!stats?.hasActivity) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white">{label}</div>
            <div className="text-[10px] text-amber-300">Connecté · pas encore d&apos;activité KeiroAI</div>
          </div>
        </div>
        <p className="text-[10px] text-white/50 mt-1">
          Les metrics {label} (followers, likes, engagement, reach) s&apos;afficheront ici dès que Léna publie le premier post via KeiroAI. On ne mélange jamais les chiffres organiques avec ceux produits par les agents.
        </p>
      </div>
    );
  }

  // Real metrics view
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">{label}</div>
          <div className="text-[10px] text-emerald-400">Live data via API</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard label={labelFollowers} value={fmt(stats.followersCount || 0)} gradientFrom="#3b82f6" gradientTo="#2563eb" />
        <KpiCard label={labelPosts} value={fmt(stats.postsCount || 0)} gradientFrom="#8b5cf6" gradientTo="#6d28d9" />
        <KpiCard label={labelLikes} value={fmt(stats.likes || 0)} gradientFrom="#ec4899" gradientTo="#f43f5e" />
        <KpiCard label={labelEngagement} value={`${(stats.engagement || 0).toFixed?.(1) || '0'}%`} gradientFrom="#10b981" gradientTo="#059669" />
      </div>
      {labelReach && stats.reach > 0 && (
        <div className="mt-2 text-[10px] text-white/50 flex items-center gap-1.5">
          <span>{'\u{1F4E1}'}</span>
          <span>{labelReach} : <strong className="text-white">{fmt(stats.reach)}</strong> (24h)</span>
        </div>
      )}
    </div>
  );
}
