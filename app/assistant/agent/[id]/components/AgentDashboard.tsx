'use client';

import { useState } from 'react';

interface AgentDashboardProps {
  agentId: string;
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
  data: {
    recentChats?: number;
    totalMessages?: number;
    recommendations?: Array<{ action: string; data: any; created_at: string }>;
    emailStats?: {
      sent: number;
      opened: number;
      clicked: number;
      openRate: number;
      clickRate: number;
      sequences: Record<string, number>;
    };
    contentStats?: {
      postsGenerated: number;
      scheduledPosts: number;
      recentContent: Array<{ type: string; title: string; created_at: string }>;
    };
    seoStats?: {
      blogPosts: number;
      keywordsTracked: number;
      recentActions: Array<{ action: string; data: any; created_at: string }>;
    };
    adsStats?: {
      campaigns: number;
      totalSpend: number;
      avgRoas: number;
      recentCampaigns: Array<{ name: string; spend: number; roas: number; status: string }>;
    };
    financeStats?: {
      revenue: number;
      expenses: number;
      margin: number;
      recentTransactions: Array<{ description: string; amount: number; type: string; date: string }>;
    };
    // Sara (rh)
    rhStats?: {
      docsGenerated: number;
      questionsAnswered: number;
      activeContracts: number;
      recentDocs: Array<{ type: string; title: string; created_at: string }>;
    };
    // Clara (onboarding)
    onboardingStats?: {
      currentStep: number;
      totalSteps: number;
      completionPercent: number;
      agentsActivated: number;
      totalAgents: number;
      steps: Array<{ name: string; completed: boolean }>;
    };
    // Jade (dm_instagram)
    dmStats?: {
      dmsSent: number;
      responses: number;
      responseRate: number;
      rdvGenerated: number;
      recentDms: Array<{ target: string; status: string; date: string }>;
    };
    // Axel (tiktok_comments)
    tiktokStats?: {
      commentsPosted: number;
      newFollowers: number;
      views: number;
      engagementRate: number;
      recentActions: Array<{ action: string; target: string; date: string }>;
    };
    // Theo (gmaps)
    gmapsStats?: {
      reviewsAnswered: number;
      googleRating: number;
      totalReviews: number;
      gmbClicks: number;
      recentReviews: Array<{ author: string; rating: number; text: string; date: string; replied: boolean }>;
    };
    // Max (chatbot)
    chatbotStats?: {
      visitorsGreeted: number;
      leadsCaptured: number;
      conversionRate: number;
      recentSessions: Array<{ visitor: string; outcome: string; date: string }>;
    };
    // Ami global dashboard
    globalStats?: {
      commercial: { leadsWeek: number; conversions: number; estimatedRevenue: number };
      visibility: { traffic: number; followers: number; googleRating: number };
      finance: { adBudget: number; roas: number; forecast: number };
      recommendation: string;
      recentTeamActivity: Array<{ agent: string; action: string; date: string }>;
    };
  };
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return '0';
  return n.toLocaleString('fr-FR');
}

function fmtCurrency(n: number | undefined): string {
  if (n === undefined || n === null) return '0 \u20ac';
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function fmtPercent(n: number | undefined): string {
  if (n === undefined || n === null) return '0 %';
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/* ------------------------------------------------------------------ */
/*  Reusable micro-components                                          */
/* ------------------------------------------------------------------ */

function KpiCard({
  label,
  value,
  gradientFrom,
  gradientTo,
}: {
  label: string;
  value: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col gap-1">
      <span className="text-xs text-white/50 uppercase tracking-wider">{label}</span>
      <span
        className="text-2xl font-bold bg-clip-text text-transparent"
        style={{ backgroundImage: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
      >
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mt-6 mb-3">{children}</h3>;
}

function EmptyState({ agentName }: { agentName: string }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-6 text-center">
      <p className="text-white/50 text-sm">Aucune donnee pour le moment.</p>
      <p className="text-white/40 text-xs mt-1">Discutez avec {agentName} pour commencer !</p>
    </div>
  );
}

function ActionButton({
  label,
  gradientFrom,
  gradientTo,
  onClick,
}: {
  label: string;
  gradientFrom: string;
  gradientTo: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full mt-4 py-3 px-6 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
    >
      {label}
    </button>
  );
}

function ActivityFeed({
  items,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  items: Array<{ label: string; detail?: string; date: string }>;
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  if (items.length === 0) return <EmptyState agentName={agentName} />;
  return (
    <div className="flex flex-col gap-2">
      {items.slice(0, 5).map((item, i) => (
        <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-start gap-3">
          <div
            className="w-2 h-2 rounded-full mt-1.5 shrink-0"
            style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/80 break-words">{item.label}</p>
            {item.detail && <p className="text-xs text-white/50 mt-0.5">{item.detail}</p>}
            <p className="text-xs text-white/40 mt-1">{fmtDate(item.date)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CircularProgress({
  value,
  label,
  gradientFrom,
  gradientTo,
}: {
  value: number;
  label: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const clamp = Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (clamp / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="88" height="88" viewBox="0 0 88 88" className="drop-shadow-lg">
        <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={gradientFrom} />
            <stop offset="100%" stopColor={gradientTo} />
          </linearGradient>
        </defs>
        <circle
          cx="44"
          cy="44"
          r="36"
          fill="none"
          stroke={`url(#grad-${label})`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 44 44)"
        />
        <text x="44" y="44" textAnchor="middle" dominantBaseline="central" className="fill-white text-sm font-bold">
          {fmtPercent(value)}
        </text>
      </svg>
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent-specific panels                                              */
/* ------------------------------------------------------------------ */

function MarketingPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const gs = data.globalStats;
  const recs = data.recommendations ?? [];

  // If globalStats is available, show the master dashboard
  if (gs) {
    return (
      <>
        {/* Commercial bloc */}
        <SectionTitle>Commercial</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Leads semaine" value={fmt(gs.commercial.leadsWeek)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="Conversions" value={fmt(gs.commercial.conversions)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="CA estime" value={fmtCurrency(gs.commercial.estimatedRevenue)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        </div>

        {/* Visibilite bloc */}
        <SectionTitle>Visibilite</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Trafic" value={fmt(gs.visibility.traffic)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="Followers" value={fmt(gs.visibility.followers)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="Note Google" value={`${gs.visibility.googleRating.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        </div>

        {/* Finance bloc */}
        <SectionTitle>Finance</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Budget pub" value={fmtCurrency(gs.finance.adBudget)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="ROAS" value={`${gs.finance.roas.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}x`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="Prevision tresorerie" value={fmtCurrency(gs.finance.forecast)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        </div>

        {/* Recommendation AMI */}
        {gs.recommendation && (
          <>
            <SectionTitle>Recommandation AMI</SectionTitle>
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

        {/* Feed equipe temps reel */}
        <SectionTitle>Feed equipe temps reel</SectionTitle>
        <ActivityFeed
          items={(gs.recentTeamActivity ?? []).map((a) => ({
            label: a.action,
            detail: a.agent,
            date: a.date,
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
        <KpiCard label="Messages echanges" value={fmt(data.totalMessages)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Recommandations" value={fmt(recs.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Score engagement" value="--" gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Recommandations recentes</SectionTitle>
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

function EmailPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.emailStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  const seqEntries = Object.entries(stats.sequences ?? {});
  const seqTotal = seqEntries.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Emails envoyes" value={fmt(stats.sent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Taux ouverture" value={fmtPercent(stats.openRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Taux clic" value={fmtPercent(stats.clickRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Sequences actives" value={fmt(seqEntries.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Taux de performance</SectionTitle>
      <div className="flex justify-center gap-8">
        <CircularProgress value={stats.openRate} label="Ouverture" gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <CircularProgress value={stats.clickRate} label="Clic" gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Pipeline sequences</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        {seqEntries.length === 0 ? (
          <p className="text-sm text-white/40 text-center">Aucune sequence active</p>
        ) : (
          <>
            <div className="flex h-6 rounded-full overflow-hidden">
              {seqEntries.map(([name, count], i) => (
                <div
                  key={name}
                  className="h-full flex items-center justify-center text-[10px] font-medium text-white"
                  style={{
                    width: `${(count / seqTotal) * 100}%`,
                    background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                    opacity: 1 - i * 0.15,
                  }}
                  title={`${name}: ${count}`}
                >
                  {count > 0 ? name : ''}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {seqEntries.map(([name, count]) => (
                <span key={name} className="text-xs text-white/50">
                  {name}: <span className="text-white/80 font-medium">{fmt(count)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <SectionTitle>Performance recente</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="flex items-end gap-1 h-24">
          {[stats.sent, stats.opened, stats.clicked].map((val, i) => {
            const max = Math.max(stats.sent, 1);
            const labels = ['Envoyes', 'Ouverts', 'Cliques'];
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md"
                  style={{
                    height: `${(val / max) * 100}%`,
                    minHeight: 4,
                    background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})`,
                  }}
                />
                <span className="text-[10px] text-white/50">{labels[i]}</span>
                <span className="text-xs text-white/70 font-medium">{fmt(val)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ContentPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.contentStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  const typeBadgeColor: Record<string, string> = {
    Reel: '#e879f9',
    Carousel: '#60a5fa',
    Story: '#fbbf24',
    Post: '#34d399',
  };

  // Last 7 days activity dots
  const now = new Date();
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toISOString().slice(0, 10);
    const hasActivity = stats.recentContent.some((c) => c.created_at.slice(0, 10) === dayStr);
    return { label: d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3), hasActivity };
  });

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Posts generes" value={fmt(stats.postsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Posts programmes" value={fmt(stats.scheduledPosts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Streak publication" value="--" gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Contenu recent</SectionTitle>
      {stats.recentContent.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentContent.slice(0, 8).map((c, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  backgroundColor: `${typeBadgeColor[c.type] ?? '#a78bfa'}22`,
                  color: typeBadgeColor[c.type] ?? '#a78bfa',
                }}
              >
                {c.type}
              </span>
              <span className="text-sm text-white/80 truncate flex-1">{c.title}</span>
              <span className="text-xs text-white/40 shrink-0">{fmtDate(c.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Activite (7 derniers jours)</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="flex justify-between">
          {last7.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div
                className="w-6 h-6 rounded-full"
                style={{
                  background: d.hasActivity ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` : 'rgba(255,255,255,0.06)',
                }}
              />
              <span className="text-[10px] text-white/40">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SeoPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.seoStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Articles blog" value={fmt(stats.blogPosts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Mots-cles suivis" value={fmt(stats.keywordsTracked)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Actions SEO" value={fmt(stats.recentActions.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Actions SEO recentes</SectionTitle>
      {stats.recentActions.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentActions.slice(0, 8).map((a, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-start gap-3">
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/80 break-words">{a.action}</p>
                <p className="text-xs text-white/40 mt-1">{fmtDate(a.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Suivi mots-cles</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-6 text-center">
        <p className="text-sm text-white/50">Le suivi detaille des mots-cles arrive bientot.</p>
        <p className="text-xs text-white/40 mt-1">Demandez a {agentName} vos positions actuelles.</p>
      </div>
    </>
  );
}

function AdsPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.adsStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  const totalSpend = stats.recentCampaigns.reduce((s, c) => s + c.spend, 0) || 1;
  const statusColors: Record<string, string> = {
    active: '#34d399',
    paused: '#fbbf24',
    ended: '#f87171',
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Campagnes actives" value={fmt(stats.campaigns)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Budget total" value={fmtCurrency(stats.totalSpend)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="ROAS moyen" value={`${stats.avgRoas.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}x`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Campagnes</SectionTitle>
      {stats.recentCampaigns.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentCampaigns.slice(0, 8).map((c, i) => (
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
                <span>ROAS: <span className="text-white/70 font-medium">{c.roas.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}x</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Repartition budget</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        {stats.recentCampaigns.length === 0 ? (
          <p className="text-sm text-white/40 text-center">Aucune campagne</p>
        ) : (
          <>
            <div className="flex h-6 rounded-full overflow-hidden">
              {stats.recentCampaigns.map((c, i) => (
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
              {stats.recentCampaigns.map((c, i) => (
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

function FinancePanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.financeStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  const maxBar = Math.max(stats.revenue, stats.expenses, 1);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Chiffre d'affaires" value={fmtCurrency(stats.revenue)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Depenses" value={fmtCurrency(stats.expenses)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard
          label="Marge"
          value={`${fmtCurrency(stats.margin)} (${stats.revenue > 0 ? fmtPercent((stats.margin / stats.revenue) * 100) : '0 %'})`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </div>

      <SectionTitle>Revenus vs Depenses</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 w-20 shrink-0">Revenus</span>
          <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(stats.revenue / maxBar) * 100}%`,
                background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
              }}
            />
          </div>
          <span className="text-xs text-white/70 font-medium w-20 text-right shrink-0">{fmtCurrency(stats.revenue)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 w-20 shrink-0">Depenses</span>
          <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(stats.expenses / maxBar) * 100}%`,
                background: 'linear-gradient(90deg, #f87171, #ef4444)',
              }}
            />
          </div>
          <span className="text-xs text-white/70 font-medium w-20 text-right shrink-0">{fmtCurrency(stats.expenses)}</span>
        </div>
      </div>

      <SectionTitle>Transactions recentes</SectionTitle>
      {stats.recentTransactions.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentTransactions.slice(0, 10).map((t, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  backgroundColor: t.type === 'income' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                  color: t.type === 'income' ? '#34d399' : '#f87171',
                }}
              >
                {t.type === 'income' ? '+' : '-'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/80 truncate">{t.description}</p>
                <p className="text-xs text-white/40">{fmtDate(t.date)}</p>
              </div>
              <span
                className="text-sm font-medium shrink-0"
                style={{ color: t.type === 'income' ? '#34d399' : '#f87171' }}
              >
                {t.type === 'income' ? '+' : '-'}{fmtCurrency(Math.abs(t.amount))}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Sara (rh) - Expert Juridique & RH                            */
/* ------------------------------------------------------------------ */

function RhPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.rhStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  const docTypeBadge: Record<string, string> = {
    contrat: '#60a5fa',
    avenant: '#e879f9',
    fiche_paie: '#34d399',
    attestation: '#fbbf24',
    reglement: '#f87171',
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Docs generes" value={fmt(stats.docsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Questions repondues" value={fmt(stats.questionsAnswered)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Contrats actifs" value={fmt(stats.activeContracts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Documents recents</SectionTitle>
      {stats.recentDocs.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentDocs.slice(0, 5).map((doc, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  backgroundColor: `${docTypeBadge[doc.type] ?? '#a78bfa'}22`,
                  color: docTypeBadge[doc.type] ?? '#a78bfa',
                }}
              >
                {doc.type}
              </span>
              <span className="text-sm text-white/80 truncate flex-1">{doc.title}</span>
              <span className="text-xs text-white/40 shrink-0">{fmtDate(doc.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <ActionButton label="Generer un document" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Clara (onboarding) - Guide de Demarrage                      */
/* ------------------------------------------------------------------ */

function OnboardingPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.onboardingStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  const defaultSteps = stats.steps.length > 0
    ? stats.steps
    : [
        { name: 'Identite marque', completed: false },
        { name: 'Connexion reseaux', completed: false },
        { name: 'Objectifs', completed: false },
        { name: 'Agents actives', completed: false },
        { name: 'Premier lancement', completed: false },
      ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard
          label="Etape onboarding"
          value={`${stats.currentStep}/${stats.totalSteps}`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
        <KpiCard label="% complete" value={fmtPercent(stats.completionPercent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard
          label="Agents actives"
          value={`${stats.agentsActivated}/${stats.totalAgents}`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </div>

      {/* Progress bar */}
      <SectionTitle>Progression</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="h-4 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${stats.completionPercent}%`,
              background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
            }}
          />
        </div>
        <p className="text-xs text-white/50 mt-2 text-center">
          {stats.completionPercent < 100
            ? `Encore ${100 - stats.completionPercent}% pour terminer l'onboarding`
            : 'Onboarding termine !'}
        </p>
      </div>

      {/* Checklist */}
      <SectionTitle>Checklist</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col gap-3">
        {defaultSteps.map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
              style={{
                background: step.completed
                  ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`
                  : 'rgba(255,255,255,0.06)',
                color: step.completed ? '#fff' : 'rgba(255,255,255,0.3)',
              }}
            >
              {step.completed ? '\u2713' : i + 1}
            </div>
            <span
              className={`text-sm ${step.completed ? 'text-white/80 line-through' : 'text-white/60'}`}
            >
              {step.name}
            </span>
          </div>
        ))}
      </div>

      <ActionButton label="Reprendre l'onboarding" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Jade (dm_instagram) - Experte DM Instagram                   */
/* ------------------------------------------------------------------ */

function DmInstagramPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.dmStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  const statusColors: Record<string, string> = {
    envoye: '#60a5fa',
    repondu: '#34d399',
    rdv: '#e879f9',
    ignore: '#f87171',
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="DMs envoyes" value={fmt(stats.dmsSent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Reponses recues" value={fmt(stats.responses)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="RDV generes" value={fmt(stats.rdvGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Response rate visual */}
      <SectionTitle>Taux de reponse</SectionTitle>
      <div className="flex justify-center">
        <CircularProgress
          value={stats.responseRate}
          label="Taux de reponse"
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </div>

      {/* Recent DM activity feed */}
      <SectionTitle>Activite recente</SectionTitle>
      {stats.recentDms.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentDms.slice(0, 5).map((dm, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  backgroundColor: `${statusColors[dm.status] ?? '#a78bfa'}22`,
                  color: statusColors[dm.status] ?? '#a78bfa',
                }}
              >
                {dm.status}
              </span>
              <span className="text-sm text-white/80 truncate flex-1">@{dm.target}</span>
              <span className="text-xs text-white/40 shrink-0">{fmtDate(dm.date)}</span>
            </div>
          ))}
        </div>
      )}

      <ActionButton label="Lancer une campagne DM" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Axel (tiktok_comments) - Expert TikTok Engagement            */
/* ------------------------------------------------------------------ */

function TiktokCommentsPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.tiktokStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Commentaires postes" value={fmt(stats.commentsPosted)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Nouveaux followers" value={fmt(stats.newFollowers)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Vues" value={fmt(stats.views)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Engagement rate */}
      <SectionTitle>Taux d&apos;engagement</SectionTitle>
      <div className="flex justify-center">
        <CircularProgress
          value={stats.engagementRate}
          label="Engagement"
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </div>

      {/* Recent TikTok actions feed */}
      <SectionTitle>Actions recentes</SectionTitle>
      <ActivityFeed
        items={(stats.recentActions ?? []).map((a) => ({
          label: a.action,
          detail: a.target,
          date: a.date,
        }))}
        agentName={agentName}
        gradientFrom={gradientFrom}
        gradientTo={gradientTo}
      />

      <ActionButton label="Configurer l'engagement" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Theo (gmaps) - Expert Google Maps                            */
/* ------------------------------------------------------------------ */

function GmapsPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.gmapsStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  // Star rating visual
  const fullStars = Math.floor(stats.googleRating);
  const hasHalf = stats.googleRating - fullStars >= 0.25;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Avis repondus" value={fmt(stats.reviewsAnswered)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard
          label="Note Google"
          value={`${stats.googleRating.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
        <KpiCard label="Clics fiche GMB" value={fmt(stats.gmbClicks)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Star rating visual */}
      <SectionTitle>Note moyenne ({fmt(stats.totalReviews)} avis)</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center justify-center gap-1">
        {Array.from({ length: fullStars }).map((_, i) => (
          <svg key={`full-${i}`} className="w-7 h-7" viewBox="0 0 24 24" fill={gradientFrom}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ))}
        {hasHalf && (
          <svg className="w-7 h-7" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="half-star-grad">
                <stop offset="50%" stopColor={gradientFrom} />
                <stop offset="50%" stopColor="rgba(255,255,255,0.15)" />
              </linearGradient>
            </defs>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="url(#half-star-grad)" />
          </svg>
        )}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <svg key={`empty-${i}`} className="w-7 h-7" viewBox="0 0 24 24" fill="rgba(255,255,255,0.15)">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ))}
        <span className="ml-3 text-lg font-bold text-white/80">
          {stats.googleRating.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        </span>
      </div>

      {/* Recent reviews feed */}
      <SectionTitle>Avis recents</SectionTitle>
      {stats.recentReviews.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentReviews.slice(0, 5).map((review, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/80 font-medium">{review.author}</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <svg key={s} className="w-3 h-3" viewBox="0 0 24 24" fill={s < review.rating ? '#fbbf24' : 'rgba(255,255,255,0.15)'}>
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    ))}
                  </div>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: review.replied ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                    color: review.replied ? '#34d399' : '#fbbf24',
                  }}
                >
                  {review.replied ? 'Repondu' : 'En attente'}
                </span>
              </div>
              <p className="text-xs text-white/60 line-clamp-2">{review.text}</p>
              <p className="text-xs text-white/40 mt-1">{fmtDate(review.date)}</p>
            </div>
          ))}
        </div>
      )}

      <ActionButton label="Voir ma fiche Google" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Max (chatbot) - Chatbot Site Web                             */
/* ------------------------------------------------------------------ */

function ChatbotPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.chatbotStats;

  if (!stats) return <EmptyState agentName={agentName} />;

  // Conversion funnel mini visual
  const funnelSteps = [
    { label: 'Visiteurs', value: stats.visitorsGreeted },
    { label: 'Leads', value: stats.leadsCaptured },
    { label: 'Convertis', value: Math.round(stats.leadsCaptured * (stats.conversionRate / 100)) },
  ];
  const maxFunnel = Math.max(stats.visitorsGreeted, 1);

  const outcomeColors: Record<string, string> = {
    lead: '#34d399',
    conversion: '#e879f9',
    abandon: '#f87171',
    question: '#60a5fa',
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Visiteurs accueillis" value={fmt(stats.visitorsGreeted)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Leads captes" value={fmt(stats.leadsCaptured)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Taux conversion" value={fmtPercent(stats.conversionRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Conversion funnel */}
      <SectionTitle>Entonnoir de conversion</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col gap-3">
        {funnelSteps.map((step, i) => {
          const widthPct = Math.max((step.value / maxFunnel) * 100, 8);
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">{step.label}</span>
                <span className="text-xs text-white/70 font-medium">{fmt(step.value)}</span>
              </div>
              <div className="h-5 bg-white/5 rounded-full overflow-hidden flex justify-center">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${widthPct}%`,
                    background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
                    opacity: 1 - i * 0.2,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent chatbot sessions */}
      <SectionTitle>Sessions recentes</SectionTitle>
      {stats.recentSessions.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentSessions.slice(0, 5).map((session, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  backgroundColor: `${outcomeColors[session.outcome] ?? '#a78bfa'}22`,
                  color: outcomeColors[session.outcome] ?? '#a78bfa',
                }}
              >
                {session.outcome}
              </span>
              <span className="text-sm text-white/80 truncate flex-1">{session.visitor}</span>
              <span className="text-xs text-white/40 shrink-0">{fmtDate(session.date)}</span>
            </div>
          ))}
        </div>
      )}

      <ActionButton label="Configurer le chatbot" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Generic fallback panel                                             */
/* ------------------------------------------------------------------ */

function GenericPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Messages echanges" value={fmt(data.totalMessages)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Derniere interaction" value="--" gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 p-6 text-center mt-6">
        <div
          className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-sm text-white/60 font-medium">Dashboard en preparation</p>
        <p className="text-xs text-white/40 mt-1">
          Le tableau de bord de {agentName} sera bientot disponible.
          <br />
          En attendant, discutez directement avec l&apos;agent !
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Mapping agentId -> panel + subtitle                                */
/* ------------------------------------------------------------------ */

const AGENT_CONFIG: Record<string, { subtitle: string; Panel: typeof MarketingPanel }> = {
  marketing: { subtitle: 'Dashboard Global', Panel: MarketingPanel },
  email: { subtitle: 'Performance Email', Panel: EmailPanel },
  content: { subtitle: 'Publications & Contenu', Panel: ContentPanel },
  seo: { subtitle: 'Visibilite & SEO', Panel: SeoPanel },
  ads: { subtitle: 'Publicite & ROAS', Panel: AdsPanel },
  finance: { subtitle: 'Finance & Tresorerie', Panel: FinancePanel },
  rh: { subtitle: 'Expert Juridique & RH', Panel: RhPanel },
  onboarding: { subtitle: 'Guide de Demarrage', Panel: OnboardingPanel },
  dm_instagram: { subtitle: 'Experte DM Instagram', Panel: DmInstagramPanel },
  tiktok_comments: { subtitle: 'Expert TikTok Engagement', Panel: TiktokCommentsPanel },
  gmaps: { subtitle: 'Expert Google Maps', Panel: GmapsPanel },
  chatbot: { subtitle: 'Chatbot Site Web', Panel: ChatbotPanel },
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function AgentDashboard({ agentId, agentName, gradientFrom, gradientTo, data }: AgentDashboardProps) {
  const config = AGENT_CONFIG[agentId];
  const subtitle = config?.subtitle ?? 'Tableau de bord';
  const Panel = config?.Panel ?? GenericPanel;

  return (
    <div className="overflow-y-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white">{agentName}</h2>
        <p
          className="text-sm font-medium bg-clip-text text-transparent"
          style={{ backgroundImage: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
        >
          {subtitle}
        </p>
      </div>

      {/* Agent panel */}
      <Panel data={data} agentName={agentName} gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </div>
  );
}
