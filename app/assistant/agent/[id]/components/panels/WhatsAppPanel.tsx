'use client';

/**
 * Stella — WhatsApp Business dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmt, fmtPercent,
  KpiCard, SectionTitle, DonutChart, ProgressBar,
} from './Primitives';
import { DEMO_WHATSAPP_STATS } from '../AgentPreviewData';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

export function WhatsAppPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const stats: any = data.whatsappStats || {
    conversations: DEMO_WHATSAPP_STATS.conversations,
    activeConversations: DEMO_WHATSAPP_STATS.activeConversations,
    leadsGenerated: DEMO_WHATSAPP_STATS.leadsGenerated,
    responseRate: DEMO_WHATSAPP_STATS.responseRate,
    recentChats: DEMO_WHATSAPP_STATS.recentChats || [],
  };

  const statusColors: Record<string, string> = {
    active: '#34d399',
    replied: '#60a5fa',
    converted: '#e879f9',
    waiting: '#fbbf24',
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <KpiCard label={p.whatsappKpiSent} value={fmt(stats.messagesSent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.whatsappKpiReceived} value={fmt(stats.messagesReceived)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.whatsappKpiRate} value={fmtPercent(stats.responseRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.whatsappKpiLeads} value={fmt(stats.leadsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Performance visuelle */}
      <SectionTitle>{p.whatsappSectionPerf}</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={[
              { value: stats.messagesSent, color: '#25D366', label: p.whatsappLabelSent },
              { value: stats.messagesReceived, color: '#128C7E', label: p.whatsappLabelReceived },
              { value: stats.leadsGenerated, color: '#fbbf24', label: p.whatsappLabelLeads },
            ]}
            label={`${stats.responseRate}%`}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={stats.messagesReceived} max={Math.max(stats.messagesSent, 1)} color="#25D366" label={p.whatsappKpiRate} />
          <ProgressBar value={stats.leadsGenerated} max={Math.max(stats.messagesReceived, 1)} color="#fbbf24" label={p.whatsappLabelLeadRate} />
          <ProgressBar value={stats.conversationsActive} max={Math.max(stats.messagesSent, 1)} color="#128C7E" label={p.whatsappLabelConvsActive} />
        </div>
      </div>

      {/* Active conversations */}
      <SectionTitle>{p.whatsappSectionActive.replace('{n}', String(stats.conversationsActive))}</SectionTitle>
      {stats.recentConversations && stats.recentConversations.length > 0 ? (
        <div className="space-y-2">
          {(stats.recentConversations || []).map((conv: any, i: number) => (
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
        <div className="text-center py-6 text-white/30 text-sm">{p.whatsappNoConvs}</div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} {p.whatsappBtnCreateTemplate}
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
      </div>
    </>
  );
}
