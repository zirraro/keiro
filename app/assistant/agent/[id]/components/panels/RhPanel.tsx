'use client';

/**
 * Sara — RH & juridique dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmt, fmtDate,
  KpiCard, SectionTitle, EmptyState, ActionButton,
} from './Primitives';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

export function RhPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const stats: any = data.rhStats || { docsGenerated: 0, questionsAnswered: 0, activeContracts: 0, rgpdCompliant: true, alertsCount: 0, recentDocs: [] };

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
        <KpiCard label={p.rhKpiDocs} value={fmt(stats.docsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.rhKpiQuestions} value={fmt(stats.questionsAnswered)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.rhKpiContracts} value={fmt(stats.activeContracts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>{p.rhSectionRecent}</SectionTitle>
      {stats.recentDocs.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {(stats.recentDocs || []).slice(0, 5).map((doc: any, i: number) => (
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
              <span className="text-xs text-white/40 shrink-0">{fmtDate(doc.date || doc.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Comment \u00e7a marche \u2014 Sara g\u00e9n\u00e8re les docs dans la conversation */}
      <div className="mt-3 rounded-xl border border-fuchsia-500/15 bg-fuchsia-500/[0.04] p-3">
        <p className="text-[11px] text-white/70 leading-relaxed">
          {'\u{1F4AC}'} Demande \u00e0 Sara dans le chat : <span className="text-white/90 font-medium">\u00ab r\u00e9dige une promesse d&apos;embauche \u00bb</span>, <span className="text-white/90 font-medium">\u00ab un avenant temps partiel \u00bb</span>, <span className="text-white/90 font-medium">\u00ab une attestation employeur \u00bb</span>\u2026 Elle g\u00e9n\u00e8re le document, tu le mets au format de ta marque (logo + couleurs) et tu l&apos;exportes en PDF/Word.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <ActionButton label={p.rhBtnGenerate} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
      </div>
    </>
  );
}
