'use client';

/**
 * Noah — CEO strategic overview panel.
 * Extracted from AgentDashboard.tsx.
 */

import { useState, useCallback } from 'react';
import {
  fmt,
  KpiCard, SectionTitle, ActionButton,
} from './Primitives';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

const FREQUENCY_OPTIONS = [
  { value: 'daily', labelFr: 'Quotidien', labelEn: 'Daily' },
  { value: 'every_2_days', labelFr: 'Tous les 2 jours', labelEn: 'Every 2 days' },
  { value: 'weekly', labelFr: 'Hebdomadaire', labelEn: 'Weekly' },
  { value: 'biweekly', labelFr: 'Toutes les 2 semaines', labelEn: 'Biweekly' },
  { value: 'monthly', labelFr: 'Mensuel', labelEn: 'Monthly' },
] as const;

function ReportFrequencyPicker() {
  const { t, locale } = useLanguage();
  const p = t.panels;
  const [freq, setFreq] = useState<string>('daily');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load current setting on mount
  useState(() => {
    fetch('/api/agents/settings?agent_id=ceo', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.settings?.report_frequency) setFreq(d.settings.report_frequency); })
      .catch(() => {});
  });

  const save = useCallback(async (newFreq: string) => {
    setFreq(newFreq);
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: 'ceo', report_frequency: newFreq }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/50 uppercase tracking-wider font-bold">
          {locale === 'fr' ? 'Fréquence du rapport Noah' : 'Noah report frequency'}
        </span>
        {saved && <span className="text-[9px] text-emerald-400">✓</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FREQUENCY_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => save(opt.value)}
            disabled={saving}
            className={`px-2.5 py-1.5 text-[10px] font-medium rounded-lg transition ${
              freq === opt.value
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
            }`}
          >
            {locale === 'fr' ? opt.labelFr : opt.labelEn}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CeoPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
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
        <KpiCard label={p.ceoKpiProspects} value={fmt(prospects)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.ceoKpiHot} value={fmt(hot)} gradientFrom="#ef4444" gradientTo="#f97316" />
        <KpiCard label={p.ceoKpiEmailsSent} value={fmt(emailsSent)} gradientFrom="#06b6d4" gradientTo="#0891b2" />
        <KpiCard label={p.ceoKpiOpenRate} value={`${openRate}%`} gradientFrom="#10b981" gradientTo="#22c55e" />
      </div>

      {/* Vision strategique */}
      <SectionTitle>{p.ceoSectionAgents}</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(AGENT_NAMES).map(([id, name]) => {
          const status = agentStatus[id];
          return (
            <div key={id} className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl p-2.5">
              <div className={`w-2 h-2 rounded-full ${status === 'erreur' ? 'bg-red-400' : status === 'actif' ? 'bg-green-400' : 'bg-white/20'}`} />
              <span className="text-xs text-white/70 font-medium">{name}</span>
              <span className={`text-[9px] ml-auto ${status === 'erreur' ? 'text-red-400' : status === 'actif' ? 'text-green-400' : 'text-white/20'}`}>
                {status === 'erreur' ? p.ceoStatusError : status === 'actif' ? p.ceoStatusActive : p.ceoStatusWaiting}
              </span>
            </div>
          );
        })}
      </div>

      <SectionTitle>{p.ceoSectionChannels}</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-lg font-bold text-pink-400">{fmt(dmsSent)}</div>
          <div className="text-[9px] text-white/40">{p.ceoStatDmsSent}</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-lg font-bold text-purple-400">{fmt(publications)}</div>
          <div className="text-[9px] text-white/40">{p.ceoStatPublications}</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-lg font-bold text-cyan-400">{fmt(emailsSent)}</div>
          <div className="text-[9px] text-white/40">{p.ceoStatEmails}</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
          <div className="text-lg font-bold text-amber-400">{fmt(hot)}</div>
          <div className="text-[9px] text-white/40">{p.ceoStatHotProspects}</div>
        </div>
      </div>

      {/* Strategy in effect */}
      <SectionTitle>{p.ceoSectionStrategy}</SectionTitle>
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
            <p className="text-xs text-white/40">{p.ceoStrategyEmpty}</p>
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

      {/* Report frequency config */}
      <ReportFrequencyPicker />

      <ActionButton label={p.ceoBtnTalk} gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}
