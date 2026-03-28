'use client';

import { useState, useCallback } from 'react';

// Reply card for DMs and emails
function DmCard({ dm, statusColors }: { dm: { target: string; status: string; message?: string; date: string }; statusColors: Record<string, string> }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReply = useCallback(async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await fetch('/api/crm/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prospect_id: dm.target, message: replyText, channel: 'dm_instagram' }),
      });
      setSent(true);
      setTimeout(() => { setSent(false); setShowReply(false); setReplyText(''); }, 2000);
    } catch {} finally { setSending(false); }
  }, [replyText, dm.target]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-3 sm:p-4 flex items-center gap-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${statusColors[dm.status] ?? '#a78bfa'}22`, color: statusColors[dm.status] ?? '#a78bfa' }}>
          {dm.status}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-white/80 truncate block">@{dm.target}</span>
          {dm.message && <span className="text-[10px] text-white/40 truncate block">{dm.message}</span>}
        </div>
        <button onClick={() => setShowReply(!showReply)} className="text-[10px] px-2 py-1 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0">
          {showReply ? 'Fermer' : 'Repondre'}
        </button>
      </div>
      {showReply && (
        <div className="px-3 sm:px-4 pb-3 border-t border-white/5 pt-2 flex gap-2">
          <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Ecrire une reponse..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50" onKeyDown={e => { if (e.key === 'Enter') handleReply(); }} />
          <button onClick={handleReply} disabled={sending || !replyText.trim()} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0 ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-600 text-white hover:bg-purple-700'} disabled:opacity-40`}>
            {sent ? '\u2713' : sending ? '...' : 'Envoyer'}
          </button>
        </div>
      )}
    </div>
  );
}

function EmailCard({ email }: { email: { prospect: string; type: string; status: string; date: string } }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const statusColors: Record<string, string> = { envoye: '#60a5fa', ouvert: '#fbbf24', repondu: '#34d399', auto_reply: '#a78bfa' };

  const handleReply = useCallback(async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await fetch('/api/crm/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prospect_id: email.prospect, message: replyText, channel: 'email' }),
      });
      setSent(true);
      setTimeout(() => { setSent(false); setShowReply(false); setReplyText(''); }, 2000);
    } catch {} finally { setSending(false); }
  }, [replyText, email.prospect]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-3 sm:p-4 flex items-center gap-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${statusColors[email.status] ?? '#60a5fa'}22`, color: statusColors[email.status] ?? '#60a5fa' }}>
          {email.status}
        </span>
        <span className="text-sm text-white/80 truncate flex-1">{email.prospect}</span>
        <span className="text-[10px] text-white/30 shrink-0">{email.type?.replace('step_', 'Etape ')}</span>
        <button onClick={() => setShowReply(!showReply)} className="text-[10px] px-2 py-1 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0">
          {showReply ? 'Fermer' : 'Repondre'}
        </button>
      </div>
      {showReply && (
        <div className="px-3 sm:px-4 pb-3 border-t border-white/5 pt-2 flex gap-2">
          <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Repondre par email..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50" onKeyDown={e => { if (e.key === 'Enter') handleReply(); }} />
          <button onClick={handleReply} disabled={sending || !replyText.trim()} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0 ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-600 text-white hover:bg-cyan-700'} disabled:opacity-40`}>
            {sent ? '\u2713' : sending ? '...' : 'Envoyer'}
          </button>
        </div>
      )}
    </div>
  );
}

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
    // Stella (whatsapp)
    whatsappStats?: {
      messagesSent: number;
      messagesReceived: number;
      responseRate: number;
      leadsGenerated: number;
      conversationsActive: number;
      recentConversations: Array<{ contact: string; lastMessage: string; status: string; date: string }>;
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
    <div className="rounded-xl border border-white/10 p-4 flex flex-col gap-1.5 relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 opacity-[0.07]" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }} />
      <span className="relative text-[10px] text-white/50 uppercase tracking-wider font-semibold">{label}</span>
      <span
        className="relative text-2xl font-bold bg-clip-text text-transparent"
        style={{ backgroundImage: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
      >
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-8 mb-4">
      <div className="h-px flex-1 bg-white/10" />
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider px-2">{children}</h3>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function EmptyState({ agentName }: { agentName: string }) {
  return (
    <div className="rounded-2xl border border-white/10 p-8 text-center bg-white/[0.02]">
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      </div>
      <p className="text-white/40 text-sm">Aucune donnee pour le moment.</p>
      <p className="text-white/25 text-xs mt-1">Discutez avec {agentName} pour commencer !</p>
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

// ─── Visual chart components ─────────────────────────────

function DonutChart({ segments, size = 100, label }: {
  segments: Array<{ value: number; color: string; label: string }>;
  size?: number;
  label?: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div className="text-white/20 text-xs text-center py-4">Pas de donnees</div>;

  let offset = 0;
  const r = 36;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dashLength = circumference * pct;
          const dashOffset = circumference * offset;
          offset += pct;
          return (
            <circle
              key={i}
              cx="50" cy="50" r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="12"
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              className="transition-all duration-500"
            />
          );
        })}
        {label && <text x="50" y="50" textAnchor="middle" dy="0.35em" className="fill-white text-[10px] font-bold">{label}</text>}
      </svg>
      <div className="flex flex-wrap justify-center gap-2">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-[9px] text-white/50">{seg.label} ({seg.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-white/50">{label}</span>
        <span className="text-white/70 font-bold">{value}/{max}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
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

        {/* Workflow visual — pipeline Commercial */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mt-4">
          <div className="flex items-center justify-between gap-1 text-center">
            {[
              { label: 'Prospects identifies', value: gs.commercial.leadsWeek + gs.commercial.conversions, icon: '\u{1F465}', color: '#94a3b8' },
              { label: 'Contactes', value: gs.commercial.leadsWeek, icon: '\u{1F4E8}', color: '#60a5fa' },
              { label: 'Qualifies', value: Math.round(gs.commercial.leadsWeek * 0.6), icon: '\u{1F3AF}', color: '#fbbf24' },
              { label: 'Clients', value: gs.commercial.conversions, icon: '\u{1F525}', color: '#22c55e' },
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
            {'\u{1F4CA}'} Voir le CRM
          </a>
          <a href="/generate" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
            {'\u2728'} Generer du contenu
          </a>
        </div>

        {/* Visibilite bloc */}
        <SectionTitle>Visibilite</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Trafic" value={fmt(gs.visibility.traffic)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="Followers" value={fmt(gs.visibility.followers)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="Note Google" value={`${gs.visibility.googleRating.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        </div>

        {/* Instagram engagement bloc */}
        <SectionTitle>Instagram</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Posts publies" value={fmt((gs.visibility as any)?.postsCount || gs.visibility.traffic || 0)} gradientFrom="#8b5cf6" gradientTo="#6d28d9" />
          <KpiCard label="Likes total" value={fmt((gs.visibility as any)?.totalLikes || 0)} gradientFrom="#ec4899" gradientTo="#f43f5e" />
          <KpiCard label="Reach moyen" value={fmt((gs.visibility as any)?.avgReach || 0)} gradientFrom="#06b6d4" gradientTo="#0891b2" />
          <KpiCard label="Engagement" value={`${((gs.visibility as any)?.engagementRate || 0).toFixed?.(1) || '0'}%`} gradientFrom="#10b981" gradientTo="#059669" />
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

        {/* Visual charts */}
        <SectionTitle>Vue d&apos;ensemble</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
            <h4 className="text-white/50 text-[10px] uppercase tracking-wider mb-3 text-center">Repartition activite</h4>
            <DonutChart
              segments={[
                { value: gs.commercial.leadsWeek, color: '#3b82f6', label: 'Leads' },
                { value: gs.commercial.conversions, color: '#22c55e', label: 'Conversions' },
                { value: gs.visibility.traffic, color: '#a855f7', label: 'Trafic' },
                { value: gs.visibility.followers, color: '#f59e0b', label: 'Followers' },
              ]}
              label={`${gs.commercial.leadsWeek + gs.commercial.conversions + gs.visibility.traffic + gs.visibility.followers}`}
            />
          </div>
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
            <h4 className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Objectifs</h4>
            <ProgressBar value={gs.commercial.conversions} max={Math.max(gs.commercial.leadsWeek, 1)} color="#22c55e" label="Taux conversion" />
            <ProgressBar value={Math.round(gs.visibility.googleRating * 20)} max={100} color="#f59e0b" label={`Note Google (${gs.visibility.googleRating}/5)`} />
            <ProgressBar value={Math.min(Math.round(gs.finance.roas * 33), 100)} max={100} color="#a855f7" label={`ROAS (${gs.finance.roas}x)`} />
          </div>
        </div>

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

  // Derive approximate counts for workflow
  const emailProspects = stats.sent + Math.round(stats.sent * 0.2); // prospects > sent
  const emailReplied = Math.round(stats.opened * 0.15); // rough estimate of replies

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Emails envoyes" value={fmt(stats.sent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Taux ouverture" value={fmtPercent(stats.openRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Taux clic" value={fmtPercent(stats.clickRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Sequences actives" value={fmt(seqEntries.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Workflow visual — pipeline Email */}
      <SectionTitle>Workflow Email</SectionTitle>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-1 text-center">
          {[
            { label: 'Prospects', value: emailProspects, icon: '\u{1F465}', color: '#94a3b8' },
            { label: 'Email envoye', value: stats.sent, icon: '\u{1F4E7}', color: '#60a5fa' },
            { label: 'Ouvert', value: stats.opened, icon: '\u{1F4EC}', color: '#fbbf24' },
            { label: 'Clique', value: stats.clicked, icon: '\u{1F517}', color: '#a855f7' },
            { label: 'Repondu', value: emailReplied, icon: '\u{1F4AC}', color: '#22c55e' },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center flex-1">
              <div className="flex-1 text-center">
                <div className="text-lg mb-1">{step.icon}</div>
                <div className="text-sm font-bold text-white" style={{ color: step.color }}>{step.value}</div>
                <div className="text-[9px] text-white/40 mt-0.5">{step.label}</div>
              </div>
              {i < 4 && <div className="text-white/20 text-xs mx-1">{'\u2192'}</div>}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
          <span className="text-[10px] text-cyan-400">{'\u{1F4E8}'}</span>
          <span className="text-[10px] text-white/50">Les prospects qui <strong className="text-cyan-400">repondent</strong> sont automatiquement signales dans le CRM</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer un template email
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
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

      {/* Recent emails with reply capability */}
      {(data as any).recentEmails && (data as any).recentEmails.length > 0 && (
        <>
          <SectionTitle>Emails recents</SectionTitle>
          <div className="flex flex-col gap-2">
            {(data as any).recentEmails.slice(0, 8).map((email: any, i: number) => (
              <EmailCard key={i} email={email} />
            ))}
          </div>
        </>
      )}
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
      {/* Instagram KPIs */}
      <SectionTitle>Performance Instagram</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Posts publies" value={fmt(stats.postsGenerated)} gradientFrom="#8b5cf6" gradientTo="#6d28d9" />
        <KpiCard label="Likes total" value={fmt((data as any).igLikes || 0)} gradientFrom="#ec4899" gradientTo="#f43f5e" />
        <KpiCard label="Reach moyen" value={fmt((data as any).igReach || 0)} gradientFrom="#06b6d4" gradientTo="#0891b2" />
        <KpiCard label="Engagement" value={`${((data as any).igEngagement || 0).toFixed?.(1) || '0'}%`} gradientFrom="#10b981" gradientTo="#059669" />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer un nouveau visuel
        </a>
        <a href="/library" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4DA}'} Ma galerie
        </a>
      </div>

      <SectionTitle>Production</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Posts generes" value={fmt(stats.postsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Programmes" value={fmt(stats.scheduledPosts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Cette semaine" value={fmt(stats.recentContent.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Visual: content type distribution */}
      <SectionTitle>Repartition du contenu</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={[
              { value: stats.recentContent.filter(c => c.type === 'Reel' || c.type === 'reel').length, color: '#e879f9', label: 'Reels' },
              { value: stats.recentContent.filter(c => c.type === 'Carousel' || c.type === 'carrousel').length, color: '#60a5fa', label: 'Carrousels' },
              { value: stats.recentContent.filter(c => c.type === 'Post' || c.type === 'post').length, color: '#34d399', label: 'Posts' },
              { value: stats.recentContent.filter(c => c.type === 'Story' || c.type === 'story').length, color: '#fbbf24', label: 'Stories' },
            ]}
            label={`${stats.postsGenerated}`}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={stats.postsGenerated} max={Math.max(stats.postsGenerated + stats.scheduledPosts, 1)} color={gradientFrom} label="Generes" />
          <ProgressBar value={stats.scheduledPosts} max={Math.max(stats.postsGenerated + stats.scheduledPosts, 1)} color={gradientTo} label="Programmes" />
        </div>
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

  // Derive approximate counts for SEO workflow
  const seoIndexed = Math.round(stats.blogPosts * 0.8); // ~80% indexed
  const seoTraffic = Math.round(seoIndexed * 12); // rough traffic estimate

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Articles blog" value={fmt(stats.blogPosts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Mots-cles suivis" value={fmt(stats.keywordsTracked)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Actions SEO" value={fmt(stats.recentActions.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Workflow visual — pipeline SEO */}
      <SectionTitle>Workflow SEO</SectionTitle>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-1 text-center">
          {[
            { label: 'Mots-cles', value: stats.keywordsTracked, icon: '\u{1F50D}', color: '#94a3b8' },
            { label: 'Articles', value: stats.blogPosts, icon: '\u{1F4DD}', color: '#60a5fa' },
            { label: 'Indexes', value: seoIndexed, icon: '\u2705', color: '#fbbf24' },
            { label: 'Trafic', value: seoTraffic, icon: '\u{1F4C8}', color: '#22c55e' },
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
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
          <span className="text-[10px] text-emerald-400">{'\u{1F331}'}</span>
          <span className="text-[10px] text-white/50">Les articles <strong className="text-emerald-400">indexes</strong> generent du trafic organique en continu</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/blog" className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u{1F4DD}'} Voir le blog
        </a>
        <a href="/generate" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u2728'} Generer un article
        </a>
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

      {/* Visual: budget & ROAS */}
      <SectionTitle>Performance visuelle</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={stats.recentCampaigns.slice(0, 5).map((c, i) => ({
              value: c.spend,
              color: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'][i % 5],
              label: c.name.substring(0, 15),
            }))}
            label={fmtCurrency(stats.totalSpend)}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={Math.min(Math.round(stats.avgRoas * 33), 100)} max={100} color="#22c55e" label={`ROAS moyen (${stats.avgRoas}x)`} />
          <ProgressBar value={stats.campaigns} max={10} color={gradientFrom} label="Campagnes actives" />
          {stats.recentCampaigns.slice(0, 3).map((c, i) => (
            <ProgressBar key={i} value={Math.round(c.roas * 33)} max={100} color={['#3b82f6', '#22c55e', '#f59e0b'][i]} label={`${c.name.substring(0, 20)} (${c.roas}x)`} />
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer une campagne
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
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

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/assistant/crm" className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u{1F4CA}'} Voir le CRM
        </a>
        <a href="/generate" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u2728'} Generer un rapport
        </a>
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

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Generer un document
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

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

      {/* Workflow visual — pipeline DM */}
      <SectionTitle>Workflow DM</SectionTitle>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-1 text-center">
          {[
            { label: 'Prospects', value: stats.dmsSent + (stats.responses || 0), icon: '\u{1F465}', color: '#94a3b8' },
            { label: 'DM envoye', value: stats.dmsSent, icon: '\u{1F4E8}', color: '#60a5fa' },
            { label: 'Reponse', value: stats.responses, icon: '\u{1F4AC}', color: '#fbbf24' },
            { label: 'RDV / Client', value: stats.rdvGenerated, icon: '\u{1F525}', color: '#22c55e' },
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
        {/* Escalade humaine */}
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
          <span className="text-[10px] text-amber-400">{'\u26A0\uFE0F'}</span>
          <span className="text-[10px] text-white/50">Les prospects <strong className="text-amber-400">chauds</strong> te sont signales pour que tu prennes le relais</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-pink-600 to-rose-600 text-white text-xs font-semibold rounded-xl hover:opacity-90">
          {'\u2728'} Creer un visuel pour DM
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

      {/* Funnel visual */}
      <SectionTitle>Entonnoir DM</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={[
              { value: stats.dmsSent - stats.responses, color: '#60a5fa', label: 'En attente' },
              { value: stats.responses - stats.rdvGenerated, color: '#fbbf24', label: 'Reponses' },
              { value: stats.rdvGenerated, color: '#22c55e', label: 'RDV' },
            ]}
            label={`${stats.responseRate}%`}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={stats.responses} max={Math.max(stats.dmsSent, 1)} color="#fbbf24" label="Taux reponse" />
          <ProgressBar value={stats.rdvGenerated} max={Math.max(stats.responses, 1)} color="#22c55e" label="Conversion RDV" />
        </div>
      </div>

      <SectionTitle>Taux de reponse</SectionTitle>
      <div className="flex justify-center">
        <CircularProgress
          value={stats.responseRate}
          label="Taux de reponse"
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </div>

      {/* Recent DM activity feed with reply */}
      <SectionTitle>Activite recente</SectionTitle>
      {stats.recentDms.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentDms.slice(0, 8).map((dm, i) => (
            <DmCard key={i} dm={dm} statusColors={statusColors} />
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

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer du contenu TikTok
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

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

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-amber-600 to-yellow-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Generer des reponses
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

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

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Personnaliser les messages
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Messages echanges" value={fmt(data.totalMessages)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Recommandations" value={fmt(data.recommendations?.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Score engagement" value={data.recentChats ? `${data.recentChats}` : '--'} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Recommandations recentes</SectionTitle>

      {data.recommendations && data.recommendations.length > 0 ? (
        <div className="space-y-2">
          {data.recommendations.slice(0, 5).map((rec, i) => (
            <div key={i} className="rounded-xl border border-white/10 p-3 flex items-start gap-3" style={{ background: `linear-gradient(135deg, ${gradientFrom}08, ${gradientTo}05)` }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `linear-gradient(135deg, ${gradientFrom}30, ${gradientTo}30)` }}>
                <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-xs">{rec.action}</p>
                <p className="text-white/30 text-[10px] mt-0.5">{fmtDate(rec.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState agentName={agentName} />
      )}

      {/* Weekly summary */}
      <div className="mt-4 rounded-xl border border-white/10 p-4" style={{ background: `linear-gradient(135deg, ${gradientFrom}08, transparent)` }}>
        <p className="text-white/40 text-xs italic">
          {agentName} a analyse {fmt(data.totalMessages || 0)} donnees cette semaine.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Generer du contenu
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  WhatsApp Panel (Stella)                                            */
/* ------------------------------------------------------------------ */

function WhatsAppPanel({
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
  const stats = data.whatsappStats;
  if (!stats) return <EmptyState agentName={agentName} />;

  const statusColors: Record<string, string> = {
    active: '#34d399',
    replied: '#60a5fa',
    converted: '#e879f9',
    waiting: '#fbbf24',
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Messages envoyes" value={fmt(stats.messagesSent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Messages recus" value={fmt(stats.messagesReceived)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Taux reponse" value={fmtPercent(stats.responseRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Leads generes" value={fmt(stats.leadsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Performance visuelle */}
      <SectionTitle>Performance</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={[
              { value: stats.messagesSent, color: '#25D366', label: 'Envoyes' },
              { value: stats.messagesReceived, color: '#128C7E', label: 'Recus' },
              { value: stats.leadsGenerated, color: '#fbbf24', label: 'Leads' },
            ]}
            label={`${stats.responseRate}%`}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={stats.messagesReceived} max={Math.max(stats.messagesSent, 1)} color="#25D366" label="Taux reponse" />
          <ProgressBar value={stats.leadsGenerated} max={Math.max(stats.messagesReceived, 1)} color="#fbbf24" label="Conversion leads" />
          <ProgressBar value={stats.conversationsActive} max={Math.max(stats.messagesSent, 1)} color="#128C7E" label="Conversations actives" />
        </div>
      </div>

      {/* Active conversations */}
      <SectionTitle>Conversations actives ({stats.conversationsActive})</SectionTitle>
      {stats.recentConversations && stats.recentConversations.length > 0 ? (
        <div className="space-y-2">
          {stats.recentConversations.map((conv, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#25D366]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-sm">{'\uD83D\uDCF2'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{conv.contact}</div>
                <div className="text-xs text-white/40 truncate">{conv.lastMessage}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[conv.status] || '#6b7280' }} />
                <span className="text-[10px] text-white/40">{new Date(conv.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-white/30 text-sm">Aucune conversation recente</div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer un template WhatsApp
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Instagram Comments Panel                                           */
/* ------------------------------------------------------------------ */

function InstagramCommentsPanel({ data, agentName, gradientFrom, gradientTo }: { data: AgentDashboardProps['data']; agentName: string; gradientFrom: string; gradientTo: string }) {
  const [comments, setComments] = useState<Array<{ comment_id: string; text: string; username: string; timestamp: string; replied: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [autoReplying, setAutoReplying] = useState(false);

  // Fetch comments on mount
  useState(() => {
    fetch('/api/agents/instagram-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'fetch_comments' }),
    }).then(r => r.json()).then(d => {
      if (d.comments) setComments(d.comments);
    }).catch(() => {}).finally(() => setLoading(false));
  });

  const handleReply = async (commentId: string) => {
    if (!replyText.trim()) return;
    try {
      await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reply_comment', comment_id: commentId, message: replyText }),
      });
      setComments(prev => prev.map(c => c.comment_id === commentId ? { ...c, replied: true } : c));
      setReplying(null);
      setReplyText('');
    } catch {}
  };

  const handleAutoReply = async () => {
    setAutoReplying(true);
    try {
      const res = await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'auto_reply_all' }),
      });
      const d = await res.json();
      if (d.replied > 0) {
        setComments(prev => prev.map(c => ({ ...c, replied: true })));
      }
    } catch {} finally { setAutoReplying(false); }
  };

  const unreplied = comments.filter(c => !c.replied).length;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Commentaires" value={fmt(comments.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Sans reponse" value={fmt(unreplied)} gradientFrom={unreplied > 0 ? '#ef4444' : gradientFrom} gradientTo={unreplied > 0 ? '#dc2626' : gradientTo} />
        <KpiCard label="Repondus" value={fmt(comments.length - unreplied)} gradientFrom="#22c55e" gradientTo="#16a34a" />
      </div>

      {unreplied > 0 && (
        <button onClick={handleAutoReply} disabled={autoReplying} className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl mt-3 disabled:opacity-50">
          {autoReplying ? 'Reponses IA en cours...' : `\u{1F916} Repondre automatiquement (${unreplied} en attente)`}
        </button>
      )}

      <SectionTitle>Commentaires recents</SectionTitle>
      {loading ? (
        <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400 mx-auto" /></div>
      ) : comments.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {comments.slice(0, 10).map(c => (
            <div key={c.comment_id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="p-3 flex items-start gap-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${c.replied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {c.replied ? '\u2713' : 'NEW'}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-white/50">@{c.username}</span>
                  <p className="text-sm text-white/80 mt-0.5">{c.text}</p>
                </div>
                {!c.replied && (
                  <button onClick={() => setReplying(replying === c.comment_id ? null : c.comment_id)} className="text-[10px] px-2 py-1 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0">
                    Repondre
                  </button>
                )}
              </div>
              {replying === c.comment_id && (
                <div className="px-3 pb-3 border-t border-white/5 pt-2 flex gap-2">
                  <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Repondre au commentaire..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none" onKeyDown={e => { if (e.key === 'Enter') handleReply(c.comment_id); }} />
                  <button onClick={() => handleReply(c.comment_id)} className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg">Envoyer</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
  instagram_comments: { subtitle: 'Commentaires Instagram', Panel: InstagramCommentsPanel },
  tiktok_comments: { subtitle: 'Expert TikTok Engagement', Panel: TiktokCommentsPanel },
  gmaps: { subtitle: 'Reputation & Avis Clients', Panel: GmapsPanel },
  chatbot: { subtitle: 'Chatbot Site Web', Panel: ChatbotPanel },
  whatsapp: { subtitle: 'WhatsApp Business', Panel: WhatsAppPanel },
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
      {/* Agent identity band */}
      <div className="rounded-t-2xl px-5 py-4 mb-0" style={{ background: `linear-gradient(135deg, ${gradientFrom}25, ${gradientTo}15)`, borderBottom: `2px solid ${gradientFrom}40` }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{agentName}</h2>
            <p className="text-sm font-medium" style={{ color: gradientFrom }}>{subtitle}</p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${gradientFrom}30, ${gradientTo}30)` }}>
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: gradientFrom }} />
          </div>
        </div>
      </div>

      {/* Dashboard content with padding */}
      <div className="p-5">
        <Panel data={data} agentName={agentName} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>
    </div>
  );
}
