'use client';

/**
 * Max — Chatbot site web dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmt, fmtPercent, fmtDate,
  KpiCard, SectionTitle, EmptyState, ActionButton,
} from './Primitives';
import type { PanelProps } from './types';

export function ChatbotPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const stats: any = data.chatbotStats || { totalVisitors: 0, leadsWithEmail: 0, conversionRate: 0, recentSessions: [] };

  const visitors = stats.totalVisitors || stats.visitorsGreeted || 0;
  const leads = stats.leadsWithEmail || stats.leadsCaptured || 0;

  // Conversion funnel mini visual
  const funnelSteps = [
    { label: 'Visiteurs', value: visitors },
    { label: 'Leads', value: leads },
    { label: 'Convertis', value: Math.round(leads * (stats.conversionRate / 100)) },
  ];
  const maxFunnel = Math.max(visitors, 1);

  const outcomeColors: Record<string, string> = {
    lead: '#34d399',
    conversion: '#e879f9',
    abandon: '#f87171',
    question: '#60a5fa',
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Visiteurs accueillis" value={fmt(visitors)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Leads captes" value={fmt(leads)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
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
          {(stats.recentSessions || []).slice(0, 5).map((session: any, i: number) => (
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
