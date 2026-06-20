'use client';

/**
 * Axel — TikTok engagement & comments dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmt,
  SectionTitle, ActionButton, ActivityFeed,
} from './Primitives';
import { AutoModeToggle } from './AutoModeToggle';
import { SocialConnectBanners } from './SharedBanners';
import { DEMO_TIKTOK_STATS } from '../AgentPreviewData';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

export function TiktokCommentsPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
  const stats: any = data.tiktokStats || {
    videosPosted: DEMO_TIKTOK_STATS.videosPosted,
    totalViews: DEMO_TIKTOK_STATS.totalViews,
    avgEngagement: DEMO_TIKTOK_STATS.avgEngagement,
    followers: DEMO_TIKTOK_STATS.followers,
    recentComments: DEMO_TIKTOK_STATS.recentComments || [],
  };

  return (
    <>
      {/* Connect TikTok if not connected */}
      <SocialConnectBanners agentId="tiktok_comments" networks={['tiktok']} connections={(data as any).connections} />

      {/* Auto mode */}
      <AutoModeToggle agentId="tiktok_comments" autoLabel={p.tiktokToggleAutoLabel} manualLabel={p.tiktokToggleManualLabel} autoDesc={p.tiktokToggleAutoDesc} manualDesc={p.tiktokToggleManualDesc} />

      {/* KPIs horizontal */}
      <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="font-bold text-sm" style={{ color: gradientFrom }}>{fmt(stats.videosPosted || 0)}</span>
          <span className="text-white/30 text-[10px]">{p.tiktokKpiVideos}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-cyan-400 font-bold text-sm">{fmt(stats.totalViews || 0)}</span>
          <span className="text-white/30 text-[10px]">{p.tiktokKpiViews}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-emerald-400 font-bold text-sm">{(stats.avgEngagement || 0).toFixed(1)}%</span>
          <span className="text-white/30 text-[10px]">{p.tiktokKpiEngagement}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-purple-400 font-bold text-sm">{fmt(stats.followers || 0)}</span>
          <span className="text-white/30 text-[10px]">{p.tiktokKpiFollowers}</span>
        </div>
      </div>

      {/* TikTok Comments */}
      <SectionTitle>{p.tiktokSectionComments}</SectionTitle>
      <div className="space-y-2 max-h-[200px] overflow-y-auto mb-3">
        {(stats.recentComments || DEMO_TIKTOK_STATS.recentComments || []).slice(0, 5).map((c: any, i: number) => (
          <div key={i} className="bg-white/5 rounded-lg border border-white/10 p-3 flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-black flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
              {(c.author || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-white/80">@{c.author}</span>
              <p className="text-[10px] text-white/50 mt-0.5">{c.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent actions */}
      <SectionTitle>{p.recentActions}</SectionTitle>
      <ActivityFeed
        items={(stats.recentActions ?? []).map((a: any) => ({
          label: a.action,
          detail: a.target,
          date: a.date,
        }))}
        agentName={agentName}
        gradientFrom={gradientFrom}
        gradientTo={gradientTo}
      />

      {/* Services TikTok — ce qui est automatisé vs manuel (honnête + cohérent) */}
      <SectionTitle>Services TikTok</SectionTitle>
      <div className="space-y-2 mb-3">
        <div className="bg-white/5 rounded-lg border border-white/10 p-3">
          <div className="flex items-center gap-2 text-[11px]"><span>✅</span><span className="text-white/80 font-semibold">Publication automatique</span></div>
          <p className="text-white/45 text-[10px] mt-1">Tes reels sont générés en qualité contrôlée et publiés automatiquement selon une cadence saine. En récupération algorithmique, la diffusion passe en pause protectrice quelques jours — normal et temporaire, ça repart plus fort.</p>
        </div>
        <div className="bg-white/5 rounded-lg border border-white/10 p-3">
          <div className="flex items-center gap-2 text-[11px]"><span>✅</span><span className="text-white/80 font-semibold">Réponses aux commentaires</span></div>
          <p className="text-white/45 text-[10px] mt-1">Les commentaires reçus sont traités automatiquement (mode auto ci-dessus).</p>
        </div>
        <div className="bg-white/5 rounded-lg border border-white/10 p-3">
          <div className="flex items-center gap-2 text-[11px]"><span>✋</span><span className="text-white/80 font-semibold">Suivre des comptes / prospection — manuel</span></div>
          <p className="text-white/45 text-[10px] mt-1">L&apos;API TikTok n&apos;autorise pas le follow ni le DM automatiques. On te <strong className="text-white/70">prépare</strong> les comptes pertinents à suivre (scoring persona) ; tu les ouvres et suis en 1 clic. Préparation par Keiro, action par toi.</p>
          <a href="/assistant/crm" className="inline-block mt-2 px-3 py-1.5 bg-white/10 text-white/70 text-[10px] rounded-lg hover:bg-white/15 transition-all">Voir les comptes à suivre →</a>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} {p.tiktokBtnCreate}
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
      </div>

      <ActionButton label={p.tiktokBtnConfigure} gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}
