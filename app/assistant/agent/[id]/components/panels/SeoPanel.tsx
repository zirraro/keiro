'use client';

/**
 * Oscar — SEO & blog dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import { useState } from 'react';
import {
  fmt, fmtDate,
  KpiCard, SectionTitle, EmptyState,
} from './Primitives';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

// Analyse SEO du site web du client (à la demande) — levier d'upsell Pro.
function SiteAnalysisCard() {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const run = async (force = false) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/agents/seo/analyze-site${force ? '?force=1' : ''}`, { credentials: 'include' });
      setRes(await r.json());
    } catch { setRes({ ok: false, reason: 'error' }); } finally { setLoading(false); }
  };
  const sevColor = (s: string) => s === 'haute' ? '#ef4444' : s === 'moyenne' ? '#f59e0b' : '#94a3b8';
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 mt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold text-white">{en ? '🔍 Analyze my website (SEO)' : '🔍 Analyser mon site (SEO)'}</div>
          <div className="text-[11px] text-white/50">{en ? 'On-demand audit of your site: issues to fix + article ideas.' : 'Audit à la demande de ton site : points à corriger + idées d\'articles.'}</div>
        </div>
        <button onClick={() => run(!!res)} disabled={loading}
          className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:opacity-90 disabled:opacity-50 min-h-[36px]">
          {loading ? (en ? 'Analyzing…' : 'Analyse…') : res ? (en ? '↻ Re-analyze' : '↻ Relancer') : (en ? 'Analyze' : 'Analyser')}
        </button>
      </div>

      {res && res.ok === false && (
        <p className="text-[11px] text-amber-300/80 mt-2">{res.message || (en ? 'Analysis unavailable. Add your site URL in onboarding.' : 'Analyse indisponible. Ajoute l\'URL de ton site dans l\'onboarding.')}</p>
      )}

      {res && res.ok && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            {typeof res.score === 'number' && (
              <div className="text-2xl font-extrabold" style={{ color: res.score >= 70 ? '#22c55e' : res.score >= 45 ? '#f59e0b' : '#ef4444' }}>{res.score}<span className="text-xs text-white/40">/100</span></div>
            )}
            <div className="text-[11px] text-white/70 flex-1">{res.summary}</div>
          </div>

          {res.locked ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
              <p className="text-[11px] text-amber-200 font-semibold">{res.upsell}</p>
              <a href="/checkout/upsell" className="inline-block mt-2 px-3 py-1.5 text-[11px] font-bold rounded-md bg-amber-500 text-black hover:opacity-90">{en ? 'Upgrade to Pro' : 'Passer au pack Pro'}</a>
            </div>
          ) : (
            <>
              {Array.isArray(res.issues) && res.issues.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1">{en ? 'Issues to fix' : 'À corriger'}</div>
                  <div className="space-y-1">
                    {res.issues.map((it: any, i: number) => (
                      <div key={i} className="rounded-lg bg-white/[0.03] border border-white/10 p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${sevColor(it.severity)}22`, color: sevColor(it.severity) }}>{it.severity}</span>
                          <span className="text-[11px] font-medium text-white/80">{it.title}</span>
                        </div>
                        {it.fix && <div className="text-[10px] text-white/50 mt-0.5">→ {it.fix}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(res.articleTopics) && res.articleTopics.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1 mt-2">{en ? 'Article ideas for you' : 'Idées d\'articles pour toi'}</div>
                  <div className="flex flex-wrap gap-1">
                    {res.articleTopics.map((tpc: string, i: number) => (
                      <span key={i} className="text-[10px] text-emerald-200/80 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">{tpc}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SeoPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const stats: any = data.seoStats || { blogPosts: 0, keywordsTracked: 0, pagesOptimized: 0, keywordsRanked: 0, avgPosition: 0, trafficIncrease: 0, recentActions: [] };

  const seoIndexed = stats.blogPosts || 0;
  const seoTraffic = 0; // Real traffic requires Google Analytics integration

  return (
    <>
      <SiteAnalysisCard />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={p.seoKpiArticles} value={fmt(stats.blogPosts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.seoKpiKeywords} value={fmt(stats.keywordsTracked)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.seoKpiActions} value={fmt((stats.recentActions || []).length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Workflow visual — pipeline SEO */}
      <SectionTitle>{p.seoSectionWorkflow}</SectionTitle>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-1 text-center">
          {[
            { label: p.seoLabelKeywords, value: stats.keywordsTracked, icon: '\u{1F50D}', color: '#94a3b8' },
            { label: p.seoLabelArticles, value: stats.blogPosts, icon: '\u{1F4DD}', color: '#60a5fa' },
            { label: p.seoLabelIndexed, value: seoIndexed, icon: '\u2705', color: '#fbbf24' },
            { label: p.seoLabelTraffic, value: seoTraffic, icon: '\u{1F4C8}', color: '#22c55e' },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center flex-1">
              <div className="flex-1 text-center">
                <div className="text-lg mb-1">{step.icon}</div>
                <div className="text-sm font-bold text-white" style={{ color: step.color }}>{step.value}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{step.label}</div>
              </div>
              {i < 3 && <div className="text-white/45 text-xs mx-1">{'\u2192'}</div>}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
          <span className="text-[10px] text-emerald-400">{'\u{1F331}'}</span>
          <span className="text-[10px] text-white/50">{p.seoWorkflowNote}</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/blog" className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u{1F4DD}'} {p.seoBtnViewBlog}
        </a>
        <a href="/generate" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u2728'} {p.seoBtnGenerateArticle}
        </a>
      </div>

      <SectionTitle>{p.seoSectionActions}</SectionTitle>
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

      <SectionTitle>{p.seoSectionTracking}</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-6 text-center">
        <p className="text-sm text-white/50">{p.seoTrackingComingSoon}</p>
        <p className="text-xs text-white/40 mt-1">{p.seoTrackingAsk.replace('{agent}', agentName)}</p>
      </div>
    </>
  );
}
