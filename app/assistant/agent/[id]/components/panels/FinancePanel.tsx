'use client';

/**
 * Louis — Finance & comptable dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmtCurrency, fmtPercent, fmtDate,
  KpiCard, SectionTitle, EmptyState,
} from './Primitives';
import type { PanelProps } from './types';

export function FinancePanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const stats: any = data.financeStats || { revenue: 0, expenses: 0, profit: 0, profitMargin: 0, recentTransactions: [] };

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
          {'\u2728'} Générer un rapport
        </a>
      </div>

      <SectionTitle>Transactions recentes</SectionTitle>
      {stats.recentTransactions.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {(stats.recentTransactions || []).slice(0, 10).map((t: any, i: number) => (
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
