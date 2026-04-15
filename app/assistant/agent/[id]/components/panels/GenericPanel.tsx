'use client';

/**
 * Generic fallback panel used for agents without a dedicated dashboard.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmt, fmtDate,
  KpiCard, SectionTitle, EmptyState,
} from './Primitives';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

export function GenericPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label={p.genericKpiMessages} value={fmt(data.totalMessages)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.genericKpiRec} value={fmt(data.recommendations?.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.genericKpiScore} value={data.recentChats ? `${data.recentChats}` : '--'} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>{p.genericSectionRec}</SectionTitle>

      {data.recommendations && data.recommendations.length > 0 ? (
        <div className="space-y-2">
          {(data.recommendations || []).slice(0, 5).map((rec, i) => (
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
          {p.genericWeeklySummary.replace('{agent}', agentName).replace('{n}', fmt(data.totalMessages || 0))}
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} {p.createContent}
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
      </div>
    </>
  );
}
