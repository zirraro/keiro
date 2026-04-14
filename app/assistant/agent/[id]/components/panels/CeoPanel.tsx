'use client';

/**
 * Noah — CEO strategic overview panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmt,
  KpiCard, SectionTitle, ActionButton,
} from './Primitives';
import type { PanelProps } from './types';

export function CeoPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  // Extract data from various sources
  const prospects = (data as any).prospects?.length || (data as any).stats?.total || 0;
  const hot = (data as any).stats?.hot || 0;
  const emailsSent = (data as any).emailStats?.sent || 0;
  const openRate = (data as any).emailStats?.openRate || 0;
  const dmsSent = (data as any).dmStats?.sent || 0;
  const publications = (data as any).contentStats?.published || 0;
  const recentLogs = (data as any).recentLogs || [];

  // Agent status from logs
  const agentStatus = recentLogs.reduce((acc: Record<string, string>, log: any) => {
    if (!acc[log.agent]) acc[log.agent] = log.status === 'error' ? 'erreur' : 'actif';
    return acc;
  }, {} as Record<string, string>);

  const AGENT_NAMES: Record<string, string> = {
    content: 'Lena', email: 'Hugo', dm_instagram: 'Jade', commercial: 'Leo',
    seo: 'Oscar', gmaps: 'Theo', chatbot: 'Max', rh: 'Sara', comptable: 'Louis',
  };

  return (
    <>
      {/* KPI strategiques */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Prospects" value={fmt(prospects)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Chauds" value={fmt(hot)} gradientFrom="#ef4444" gradientTo="#f97316" />
        <KpiCard label="Emails envoyes" value={fmt(emailsSent)} gradientFrom="#06b6d4" gradientTo="#0891b2" />
        <KpiCard label="Taux ouverture" value={`${openRate}%`} gradientFrom="#10b981" gradientTo="#22c55e" />
      </div>

      {/* Vision strategique */}
      <SectionTitle>Performance des agents</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(AGENT_NAMES).map(([id, name]) => {
          const status = agentStatus[id];
          return (
            <div key={id} className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl p-2.5">
              <div className={`w-2 h-2 rounded-full ${status === 'erreur' ? 'bg-red-400' : status === 'actif' ? 'bg-green-400' : 'bg-white/20'}`} />
              <span className="text-xs text-white/70 font-medium">{name}</span>
              <span className={`text-[9px] ml-auto ${status === 'erreur' ? 'text-red-400' : status === 'actif' ? 'text-green-400' : 'text-white/20'}`}>
                {status || 'en attente'}
              </span>
            </div>
          );
        })}
      </div>

      <SectionTitle>Canaux actifs</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-lg font-bold text-pink-400">{fmt(dmsSent)}</div>
          <div className="text-[9px] text-white/40">DMs envoyes</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-lg font-bold text-purple-400">{fmt(publications)}</div>
          <div className="text-[9px] text-white/40">Publications</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-lg font-bold text-cyan-400">{fmt(emailsSent)}</div>
          <div className="text-[9px] text-white/40">Emails</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-lg font-bold text-amber-400">{fmt(hot)}</div>
          <div className="text-[9px] text-white/40">Prospects chauds</div>
        </div>
      </div>

      {/* Strategy in effect */}
      <SectionTitle>Strategie en cours</SectionTitle>
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        {(() => {
          const strategy = typeof window !== 'undefined' ? localStorage.getItem('keiro_strategy_done') : null;
          const STRAT_NAMES: Record<string, string> = {
            instagram: '\u{1F4F8} Instagram Focus',
            tiktok: '\u{1F3B5} TikTok Focus',
            prospection: '\u{1F3AF} Prospection',
            reputation: '\u2B50 Reputation',
            seo: '\u{1F50D} SEO',
            chatbot: '\u{1F916} Chatbot',
            linkedin: '\u{1F4BC} LinkedIn B2B',
          };
          const focuses = (strategy || '').split('+').filter(Boolean);
          return focuses.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {focuses.map(f => (
                <span key={f} className="px-2 py-1 bg-cyan-500/20 text-cyan-300 text-[10px] font-medium rounded-lg">{STRAT_NAMES[f] || f}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/40">Aucune strategie definie — va dans Clara pour en choisir une</p>
          );
        })()}
      </div>

      {/* Quick tip from Noah */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mt-3">
        <p className="text-xs text-white/50 italic">
          {hot > 0
            ? `\u{1F525} ${hot} prospect${hot > 1 ? 's' : ''} chaud${hot > 1 ? 's' : ''} — contacte-les en priorite via Hugo (email) ou Jade (DM).`
            : emailsSent > 0
            ? `\u{1F4E7} ${emailsSent} emails envoyes. Continue la prospection pour generer des prospects chauds.`
            : `\u{1F680} Active tes agents pour commencer a prospecter. Parle-moi pour definir ta strategie.`}
        </p>
      </div>

      <ActionButton label="Parler a Noah" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}
