'use client';

/**
 * Ami — Marketing strategy master dashboard panel.
 * Network selector at the top (parity with Léna and Jade): the user
 * picks IG / TT / LI and the insights below adapt to that network.
 * Cross-network KPIs (commercial pipeline, finance, team feed) live
 * outside the selector since they aggregate across all networks.
 */

import { useState, useCallback } from 'react';
import {
  fmt, fmtCurrency, fmtDate,
  KpiCard, SectionTitle, EmptyState, DonutChart, ProgressBar, ActivityFeed,
} from './Primitives';
import { SocialConnectBanners } from './SharedBanners';
import { InstagramAssetBadge } from './InstagramAssetBadge';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

type AmiNetwork = 'instagram' | 'tiktok' | 'linkedin';

const AMI_NETWORKS: { key: AmiNetwork; label: string; icon: string; color: string }[] = [
  { key: 'instagram', label: 'Instagram', icon: '\u{1F4F8}', color: '#ec4899' },
  { key: 'tiktok', label: 'TikTok', icon: '\u{1F3B5}', color: '#00f2ea' },
  { key: 'linkedin', label: 'LinkedIn', icon: '\u{1F4BC}', color: '#0A66C2' },
];

export function MarketingPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const gs = data.globalStats;
  const recs = data.recommendations ?? [];
  const [network, setNetwork] = useState<AmiNetwork>('instagram');

  // If globalStats is available, show the master dashboard
  if (gs) {
    return (
      <>
        {/* Network selector — TOP of page (parity with L\u00e9na/Jade).
            AMI is an insights / strategy surface, so the network choice
            frames everything below. The cross-network sections (pipeline,
            recommendations, team feed) live further down and only show
            when there's something meaningful to display. */}
        <div className="flex gap-2 mb-4">
          {AMI_NETWORKS.map(n => (
            <button
              key={n.key}
              onClick={() => setNetwork(n.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                network === n.key
                  ? 'bg-white/10 text-white border border-white/20 shadow'
                  : 'bg-white/[0.03] text-white/40 border border-white/5 hover:text-white/70'
              }`}
              style={network === n.key ? { borderColor: n.color + '60' } : {}}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </div>

        {/* Selected network insight section */}
        {network === 'instagram' && (
          <NetworkInsightSection
            network="instagram"
            label="Instagram"
            stats={(gs as any).instagram}
            connectUrl="/api/auth/instagram-oauth"
            icon={'\u{1F4F8}'}
            labelLikes={p.marketingLabelLikes}
            labelEngagement={p.marketingLabelEngagement}
            labelFollowers={p.marketingLabelFollowers}
            labelPosts={p.marketingLabelPosts}
            labelReach={p.marketingLabelReach}
          />
        )}
        {network === 'tiktok' && (
          <NetworkInsightSection
            network="tiktok"
            label="TikTok"
            stats={(gs as any).tiktok}
            connectUrl="/api/auth/tiktok-oauth"
            icon={'\u{1F3B5}'}
            labelLikes="Likes totaux"
            labelEngagement={p.marketingLabelEngagement}
            labelFollowers="Abonn\u00e9s"
            labelPosts="Vid\u00e9os"
          />
        )}
        {network === 'linkedin' && (
          <NetworkInsightSection
            network="linkedin"
            label="LinkedIn"
            stats={(gs as any).linkedin}
            connectUrl="/api/auth/linkedin-oauth"
            icon={'\u{1F4BC}'}
            labelLikes="R\u00e9actions"
            labelEngagement={p.marketingLabelEngagement}
            labelFollowers="Connexions"
            labelPosts="Posts publi\u00e9s"
          />
        )}

        {/* Audit log link \u2014 Meta App Review compliance evidence */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 mt-3 mb-4">
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

        {/* SECTION : AMI t\u2019interpr\u00e8te + Actions orchestr\u00e9es
            AMI is autonomous and pushes directives to all agents. The
            recommendation block becomes actionable: clicking "Appliquer
            aux agents" calls /api/agents/orchestrate-directive which
            saves the directive into org_agent_configs so each agent
            picks it up on the next run. Founder rule: "AMI donne des
            ordres aux agents en ajustant les actions de chacun". */}
        {gs.recommendation && (
          <>
            <SectionTitle>AMI t&apos;interpr\u00e8te</SectionTitle>
            <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-purple-500/5 p-4 mb-3">
              <div className="flex items-start gap-2 mb-3">
                <span className="text-lg">{'\u{1F4A1}'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-cyan-300 mb-1 uppercase tracking-wider">Analyse strat\u00e9gique</p>
                  <p className="text-xs text-white/85 leading-relaxed">{gs.recommendation}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <AmiOrchestrateButton recommendation={gs.recommendation} />
                <span className="text-[10px] text-white/40">
                  Pousse la directive vers tous les agents concern\u00e9s. Chaque agent l&apos;applique sur sa prochaine ex\u00e9cution.
                </span>
              </div>
            </div>
          </>
        )}

        {/* Cross-network commercial pipeline — only when there ARE
            prospects. Showing 0/0/0/0 funnels is noise that the founder
            explicitly flagged: "il faut revoir et verifier que les data
            apparaissent bien et soient pas doublon". */}
        {(gs.commercial?.totalProspects || 0) > 0 && (
          <>
            <SectionTitle>{p.marketingSectionProspection}</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <KpiCard label={p.marketingLabelTotalProspects} value={fmt(gs.commercial.totalProspects)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
              <KpiCard label={p.marketingLabelThisWeek} value={`+${fmt(gs.commercial.prospectsThisWeek || 0)}`} gradientFrom="#06b6d4" gradientTo="#0891b2" />
              <KpiCard label={p.marketingLabelClients} value={fmt(gs.commercial.conversions || 0)} gradientFrom="#10b981" gradientTo="#22c55e" />
              <KpiCard label={p.marketingLabelConversion} value={`${gs.commercial.conversionRate || 0}%`} gradientFrom="#f59e0b" gradientTo="#d97706" />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mb-4">
              <div className="flex items-center justify-between gap-1 text-center">
                {[
                  { label: p.marketingFunnelIdentified, value: gs.commercial.totalProspects, icon: '\u{1F465}', color: '#94a3b8' },
                  { label: p.marketingFunnelContacted, value: gs.commercial.prospectsThisWeek || 0, icon: '\u{1F4E8}', color: '#60a5fa' },
                  { label: p.marketingFunnelQualified, value: Math.round((gs.commercial.prospectsThisWeek || 0) * 0.6), icon: '\u{1F3AF}', color: '#fbbf24' },
                  { label: p.marketingFunnelClients, value: gs.commercial.conversions || 0, icon: '\u{1F525}', color: '#22c55e' },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-center flex-1">
                    <div className="flex-1 text-center">
                      <div className="text-lg mb-1">{step.icon}</div>
                      <div className="text-sm font-bold" style={{ color: step.color }}>{step.value}</div>
                      <div className="text-[9px] text-white/40 mt-0.5">{step.label}</div>
                    </div>
                    {i < 3 && <div className="text-white/20 text-xs mx-1">{'\u2192'}</div>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Finance \u2014 only when there's an ad budget tracked. Removed
            the always-zero finance bloc when nothing is running. */}
        {gs.finance && (gs.finance.adBudget > 0 || gs.finance.roas > 0) && (
          <>
            <SectionTitle>{p.marketingSectionFinance}</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <KpiCard label={p.marketingLabelAdBudget} value={fmtCurrency(gs.finance.adBudget)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
              <KpiCard label={p.marketingLabelRoas} value={`${(gs.finance.roas || 0).toFixed(1)}x`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
              <KpiCard label={p.marketingLabelForecast} value={fmtCurrency(gs.finance.forecast)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
            </div>
          </>
        )}

        {/* Team activity feed \u2014 keeps AMI useful as a "what just
            happened across all agents" pulse. Only renders if there's
            recent activity. */}
        {(((gs as any).teamActivity?.length || 0) > 0 || (gs.recentTeamActivity?.length || 0) > 0) && (
          <>
            <SectionTitle>{p.marketingSectionTeamFeed}</SectionTitle>
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
        )}
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

// AMI orchestration button — pushes the current strategic
// recommendation to all relevant agents as a durable directive.
// Calls /api/agents/orchestrate-directive which uses Sonnet to
// detect which agents the directive applies to and saves it into
// org_agent_configs.<agent>_directives so each agent picks it up
// on next run.
function AmiOrchestrateButton({ recommendation }: { recommendation: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/agents/orchestrate-directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ source: 'ami', directive: recommendation }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setError(j.error || 'Échec'); return; }
      setDone(true);
      setTimeout(() => setDone(false), 4000);
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau');
    } finally {
      setBusy(false);
    }
  }, [recommendation, busy]);

  return (
    <button
      onClick={apply}
      disabled={busy || done}
      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition flex-shrink-0 ${
        done
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          : error
            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30'
      }`}
    >
      {busy ? '…' : done ? '✓ Appliqué aux agents' : error ? `⚠ ${error}` : '⚡ Appliquer aux agents'}
    </button>
  );
}
