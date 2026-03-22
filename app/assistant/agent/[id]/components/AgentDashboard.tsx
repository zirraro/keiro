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
  const recs = data.recommendations ?? [];

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
/*  Mapping agentId → panel + subtitle                                 */
/* ------------------------------------------------------------------ */

const AGENT_CONFIG: Record<string, { subtitle: string; Panel: typeof MarketingPanel }> = {
  marketing: { subtitle: 'Strategie & Performance', Panel: MarketingPanel },
  email: { subtitle: 'Performance Email', Panel: EmailPanel },
  content: { subtitle: 'Publications & Contenu', Panel: ContentPanel },
  seo: { subtitle: 'Visibilite & SEO', Panel: SeoPanel },
  ads: { subtitle: 'Publicite & ROAS', Panel: AdsPanel },
  finance: { subtitle: 'Finance & Tresorerie', Panel: FinancePanel },
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
