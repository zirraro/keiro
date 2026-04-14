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
import type { PanelProps } from './types';

export function TiktokCommentsPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
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
      <AutoModeToggle agentId="tiktok_comments" autoLabel="Engagement automatique" manualLabel="Engagement manuel" autoDesc="Axel commente et engage automatiquement" manualDesc="Tu valides chaque interaction" />

      {/* KPIs horizontal */}
      <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="font-bold text-sm" style={{ color: gradientFrom }}>{fmt(stats.videosPosted || 0)}</span>
          <span className="text-white/30 text-[10px]">Videos</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-cyan-400 font-bold text-sm">{fmt(stats.totalViews || 0)}</span>
          <span className="text-white/30 text-[10px]">Vues</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-emerald-400 font-bold text-sm">{(stats.avgEngagement || 0).toFixed(1)}%</span>
          <span className="text-white/30 text-[10px]">Engagement</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-purple-400 font-bold text-sm">{fmt(stats.followers || 0)}</span>
          <span className="text-white/30 text-[10px]">Followers</span>
        </div>
      </div>

      {/* TikTok Comments */}
      <SectionTitle>Commentaires TikTok</SectionTitle>
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
      <SectionTitle>Actions recentes</SectionTitle>
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

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer du contenu TikTok
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

      <ActionButton label="Configurer l'engagement" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}
