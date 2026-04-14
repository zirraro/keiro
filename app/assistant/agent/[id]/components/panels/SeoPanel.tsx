'use client';

/**
 * Oscar — SEO & blog dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmt, fmtDate,
  KpiCard, SectionTitle, EmptyState,
} from './Primitives';
import type { PanelProps } from './types';

export function SeoPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const stats: any = data.seoStats || { blogPosts: 0, keywordsTracked: 0, pagesOptimized: 0, keywordsRanked: 0, avgPosition: 0, trafficIncrease: 0, recentActions: [] };

  const seoIndexed = stats.blogPosts || 0;
  const seoTraffic = 0; // Real traffic requires Google Analytics integration

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Articles blog" value={fmt(stats.blogPosts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Mots-cles suivis" value={fmt(stats.keywordsTracked)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Actions SEO" value={fmt((stats.recentActions || []).length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
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
          {'\u2728'} Générer un article
        </a>
      </div>

      <SectionTitle>Actions SEO recentes</SectionTitle>
      {(stats.recentActions || []).length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {(stats.recentActions || []).slice(0, 8).map((a: any, i: number) => (
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
