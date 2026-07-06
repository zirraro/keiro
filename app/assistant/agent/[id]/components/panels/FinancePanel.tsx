'use client';

/**
 * Louis — Finance & comptable dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmtCurrency, fmtPercent, fmtDate,
  KpiCard, SectionTitle, EmptyState,
} from './Primitives';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

export function FinancePanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t, locale } = useLanguage();
  const isEn = locale === 'en';
  const p = t.panels;
  const stats: any = data.financeStats || { revenue: 0, expenses: 0, profit: 0, profitMargin: 0, recentTransactions: [] };
  // Ouvre le chat de Louis avec une demande pré-remplie (le doc se génère dans
  // la conversation, puis export Excel/PowerPoint à ta marque). Founder 06/07.
  const askLouis = (prompt: string) => {
    try { window.dispatchEvent(new CustomEvent('keiro:agent-chat', { detail: { agent: 'comptable', prompt } })); } catch { /* noop */ }
    const el = document.querySelector('[data-agent-chat-input]') as HTMLTextAreaElement | HTMLInputElement | null;
    if (el) { (el as any).value = prompt; el.focus(); }
  };

  const maxBar = Math.max(stats.revenue, stats.expenses, 1);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={p.financeKpiRevenue} value={fmtCurrency(stats.revenue)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.financeKpiExpenses} value={fmtCurrency(stats.expenses)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard
          label={p.financeKpiMargin}
          value={`${fmtCurrency(stats.margin)} (${stats.revenue > 0 ? fmtPercent((stats.margin / stats.revenue) * 100) : '0 %'})`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </div>

      <SectionTitle>{p.financeSectionPerf}</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 w-20 shrink-0">{p.financeLabelRevenue}</span>
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
          <span className="text-xs text-white/50 w-20 shrink-0">{p.financeLabelExpenses}</span>
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

      {/* Catalogue de documents Louis — Excel ET PowerPoint (founder 06/07) */}
      {(() => {
        const docs = [
          { icon: '📊', fmt: 'Excel + PPT', title: isEn ? 'Business plan' : 'Business plan', ex: isEn ? 'Full plan + 3-yr forecast, ready for the bank/investors' : 'Plan complet + prévisionnel 3 ans, prêt banque/investisseurs', ask: isEn ? 'Build my business plan (Excel forecast + PowerPoint deck)' : 'Construis mon business plan (prévisionnel Excel + présentation PowerPoint)' },
          { icon: '📈', fmt: 'PowerPoint', title: isEn ? 'Investor pitch deck' : 'Pitch deck investisseurs', ex: isEn ? '10-12 slides: problem, solution, market, numbers, ask' : '10-12 slides : problème, solution, marché, chiffres, demande', ask: isEn ? 'Create an investor pitch deck (PowerPoint)' : 'Crée un pitch deck investisseurs (PowerPoint)' },
          { icon: '💶', fmt: 'Excel', title: isEn ? '3-year financial forecast' : 'Prévisionnel financier 3 ans', ex: isEn ? 'Revenue, costs, cash-flow, break-even' : 'CA, charges, trésorerie, seuil de rentabilité', ask: isEn ? 'Build a 3-year financial forecast in Excel' : 'Fais un prévisionnel financier 3 ans en Excel' },
          { icon: '🏦', fmt: 'Excel', title: isEn ? 'Cash-flow plan' : 'Plan de trésorerie', ex: isEn ? 'Monthly in/out, running balance, alerts' : 'Entrées/sorties mensuelles, solde, alertes', ask: isEn ? 'Create a monthly cash-flow plan in Excel' : 'Crée un plan de trésorerie mensuel en Excel' },
          { icon: '🎤', fmt: 'PowerPoint', title: isEn ? 'Sales presentation' : 'Présentation commerciale', ex: isEn ? 'Your offer, cases, pricing — client-ready' : 'Ton offre, cas clients, tarifs — prête à présenter', ask: isEn ? 'Make a client sales presentation (PowerPoint)' : 'Fais une présentation commerciale client (PowerPoint)' },
          { icon: '🧾', fmt: 'Excel', title: isEn ? 'Quote / invoice template' : 'Modèle devis / facture', ex: isEn ? 'Branded, auto-totals, VAT-ready' : 'À ta marque, totaux auto, TVA prête', ask: isEn ? 'Create a branded quote and invoice template (Excel)' : 'Crée un modèle de devis et facture à ma marque (Excel)' },
        ];
        return (
          <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3 sm:p-4">
            <div className="text-sm font-semibold text-white/90 mb-1">{isEn ? '📁 Documents Louis generates' : '📁 Les documents que Louis génère'}</div>
            <p className="text-[11px] text-white/45 mb-3">{isEn ? 'Pick one — Louis builds it in the chat, exports to Excel / PowerPoint, ready in your brand (logo + colors).' : 'Choisis-en un — Louis le construit dans le chat, l’exporte en Excel / PowerPoint, prêt à ta marque (logo + couleurs).'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {docs.map((d, i) => (
                <button key={i} type="button" onClick={() => askLouis(d.ask)} className="text-left rounded-lg border border-white/10 bg-white/[0.03] p-2.5 hover:border-cyan-400/40 hover:bg-cyan-500/[0.06] transition">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[12px] font-semibold text-white/85">{d.icon} {d.title}</span>
                    <span className="text-[9px] uppercase tracking-wide text-cyan-300/70 shrink-0">{d.fmt}</span>
                  </div>
                  <div className="text-[10px] italic text-cyan-200/70 leading-relaxed">{d.ex}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Q&A finance que Louis sait traiter */}
      {(() => {
        const qa = [
          { q: isEn ? 'How do I compute my break-even point?' : 'Comment calculer mon seuil de rentabilité ?', a: isEn ? 'Fixed costs ÷ margin rate → the revenue where you stop losing money.' : 'Charges fixes ÷ taux de marge → le CA à partir duquel tu ne perds plus d’argent.' },
          { q: isEn ? 'How do I present my plan to the bank?' : 'Comment présenter mon business plan à la banque ?', a: isEn ? 'Clear story + realistic 3-yr numbers + cash-flow + your contribution. Louis formats it.' : 'Récit clair + chiffres réalistes 3 ans + trésorerie + ton apport. Louis te le met en forme.' },
          { q: isEn ? 'Which VAT scheme fits me?' : 'TVA : quel régime pour moi ?', a: isEn ? 'Depends on turnover: franchise, simplified or normal — Louis guides and sets up the tracking.' : 'Selon ton CA : franchise, réel simplifié ou normal — Louis t’oriente et prépare le suivi.' },
          { q: isEn ? 'How much cash buffer should I keep?' : 'Quelle trésorerie de sécurité garder ?', a: isEn ? 'Aim for 2-3 months of fixed costs; Louis builds the cash-flow to see it.' : 'Vise 2-3 mois de charges fixes ; Louis construit la trésorerie pour le visualiser.' },
        ];
        return (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
            <div className="text-sm font-semibold text-white/90 mb-2">{isEn ? '💬 Finance questions Louis can answer' : '💬 Des questions finance que Louis sait traiter'}</div>
            <div className="space-y-2">
              {qa.map((x, i) => (
                <button key={i} type="button" onClick={() => askLouis(x.q)} className="w-full text-left rounded-lg border border-white/10 bg-white/[0.03] p-2.5 hover:border-white/20 transition">
                  <div className="text-[11px] font-medium text-white/85">💰 {x.q}</div>
                  <div className="text-[10px] text-white/45 leading-relaxed mt-0.5">{x.a}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/assistant/crm" className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
        <a href="/generate" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u2728'} {p.generateReport}
        </a>
      </div>

      <SectionTitle>{p.financeSectionRecent}</SectionTitle>
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
