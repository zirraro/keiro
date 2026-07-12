'use client';

/**
 * Lena — Content & publications dashboard panel.
 * Extracted from AgentDashboard.tsx. Ships with three private helpers
 * used only by this panel: ContentCalendarInline, ContentDirectionInput,
 * and ContentWorkflow.
 */

import { useState, useEffect, useCallback } from 'react';
import PreviewBanner from '../PreviewBanner';
import PostPreviewModal from '../PostPreviewModal';
import { DEMO_CONTENT_POSTS } from '../AgentPreviewData';
import {
  fmt,
  KpiCard, SectionTitle, DonutChart, ProgressBar,
} from './Primitives';
import VideoMontageBox from './VideoMontageBox';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/i18n/context';
import { sampleFor } from '@/lib/meta/sample-insights';
import type { PanelProps } from './types';
import CadenceMixSlider from '@/components/CadenceMixSlider';

// ─── Inline Editorial Calendar for Content Agent ─────────────
function ContentCalendarInline({ posts, onSelectPost }: { posts: any[]; onSelectPost: (p: any) => void }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const now = new Date();
  const days: Date[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const todayStr = now.toISOString().split('T')[0];
  const dayNames = en ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const STATUS_DOT: Record<string, string> = { draft: 'bg-amber-500', approved: 'bg-blue-500', published: 'bg-emerald-500', publish_failed: 'bg-red-500' };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2 mb-3 overflow-x-auto">
      <div className="grid grid-cols-7 gap-1 min-w-[480px] sm:min-w-0">
        {days.map((d, i) => {
          const dateStr = d.toISOString().split('T')[0];
          const isToday = dateStr === todayStr;
          const dayPosts = posts.filter(p => p.scheduled_date === dateStr || (p.published_at && p.published_at.startsWith(dateStr)));
          return (
            <div key={i} className={`rounded-lg p-1 ${isToday ? 'bg-purple-500/10 border border-purple-500/20' : ''}`}>
              <div className={`text-center text-[10px] ${isToday ? 'text-purple-400 font-bold' : 'text-white/40'}`}>{dayNames[d.getDay()]}</div>
              <div className={`text-center text-xs font-bold mb-1 ${isToday ? 'text-purple-400' : 'text-white/60'}`}>{d.getDate()}</div>
              <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
                {dayPosts.slice(0, 3).map((p, j) => (
                  <button key={j} onClick={() => onSelectPost(p)} className="w-full aspect-square rounded overflow-hidden bg-white/5 hover:ring-1 hover:ring-purple-500/50 transition relative">
                    {p.visual_url ? <img src={p.visual_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40">{p.format === 'reel' ? '\uD83C\uDFAC' : '\uD83D\uDCDD'}</div>}
                    <div className={`absolute top-0 right-0 w-1.5 h-1.5 rounded-full ${STATUS_DOT[p.status] || 'bg-gray-500'}`} />
                  </button>
                ))}
                {dayPosts.length > 3 && <div className="text-[10px] text-white/40 text-center">+{dayPosts.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Content direction — let client guide what to publish this week
function ContentDirectionInput() {
  const { t } = useLanguage();
  const p = t.panels;
  const [direction, setDirection] = useState('');
  const [saved, setSaved] = useState(false);
  const [existing, setExisting] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('keiro_content_direction');
      if (saved) { setDirection(saved); setExisting(saved); }
    } catch {}
  }, []);

  const save = useCallback(async () => {
    if (!direction.trim()) return;
    try { localStorage.setItem('keiro_content_direction', direction); } catch {}
    // Save to business dossier custom_fields so CRON agents pick it up too
    try {
      await fetch('/api/business-dossier', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content_themes: direction, weekly_priority_topic: direction }),
      });
    } catch {}
    // Also send to content agent chat for immediate awareness
    try {
      await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: 'content',
          message: `[THEME PRIORITAIRE] Le client souhaite integrer ce theme dans ses prochaines publications : "${direction}". Integre ce sujet dans 1 a 2 posts sur les 5 prochains, en le mixant naturellement avec les autres themes habituels (tendances, conseils, coulisses, engagement). Ne fais pas TOUS les posts sur ce sujet — diversifie et garde de la creativite. Ce theme donne plus d'elements a mettre en valeur, pas une restriction.`,
        }),
      });
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [direction]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{'\u{1F4A1}'}</span>
        <span className="text-xs font-medium text-white/70">{p.contentDirectionTitle}</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={direction}
          onChange={e => setDirection(e.target.value)}
          placeholder={p.contentDirectionPlaceholder}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
        />
        <button
          onClick={save}
          disabled={!direction.trim() || direction === existing}
          className={`px-3 py-2 text-xs font-bold rounded-lg transition min-h-[36px] ${saved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-600 text-white hover:bg-purple-500'} disabled:opacity-30`}
        >
          {saved ? '\u2713' : p.contentDirectionSend}
        </button>
      </div>
    </div>
  );
}

// Content workflow: fetch posts by status, allow approve/skip/schedule — Instagram grid style
function ContentWorkflow({ isConnected }: { isConnected?: boolean }) {
  const { t, locale } = useLanguage();
  const en = locale === 'en';
  const p = t.panels;
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const loadPosts = useCallback(() => {
    fetch('/api/agents/content?action=calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'calendar' }) })
      .then(r => r.json())
      .then(d => { if (d.posts || d.calendar) setPosts(d.posts || d.calendar || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Listen for campaign generation start
  useEffect(() => {
    const handler = () => { setGenerating(true); setTimeout(() => { setGenerating(false); loadPosts(); }, 15000); };
    (window as any).__contentGenerating = handler;
    return () => { delete (window as any).__contentGenerating; };
  }, [loadPosts]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleAction = useCallback(async (postId: string, action: string) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, _loading: true } : p));
    try {
      await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, post_id: postId }),
      });
      const newStatus = action === 'approve' ? 'approved' : action === 'skip' ? 'skipped' : action === 'publish_single' ? 'published' : 'draft';
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: newStatus, _loading: false } : p));
    } catch {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, _loading: false } : p));
    }
  }, []);

  if (loading) return <div className="text-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-400 mx-auto" /></div>;

  // Show demo only if NOT connected — if connected but no posts yet, show empty state
  const isDemo = posts.length === 0 && !isConnected;
  const displayPosts = isDemo ? DEMO_CONTENT_POSTS : posts;
  const counts = displayPosts.reduce((acc: Record<string, number>, p: any) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
  const filtered = filter === 'all' ? displayPosts : displayPosts.filter((p: any) => p.status === filter);

  const STATUS_COLORS: Record<string, string> = { draft: 'bg-amber-500', approved: 'bg-blue-500', published: 'bg-emerald-500', publish_failed: 'bg-red-500', skipped: 'bg-gray-500', video_generating: 'bg-purple-500', publishing: 'bg-cyan-500' };

  // Connected but no posts yet — show helpful empty state
  if (isConnected && posts.length === 0) {
    return (
      <div className="text-center py-8 bg-white/[0.02] rounded-xl border border-white/5">
        <span className="text-2xl">{'\u{1F4F8}'}</span>
        <p className="text-xs text-white/50 mt-2">{p.contentEmptyTitle}</p>
        <p className="text-[10px] text-white/30 mt-1">{p.contentEmptySubtitle}</p>
      </div>
    );
  }

  // Apply platform filter
  const platformFiltered = platformFilter === 'all' ? displayPosts : displayPosts.filter((p: any) => (p.platform || 'instagram') === platformFilter);
  const platformCounts = displayPosts.reduce((acc: Record<string, number>, p: any) => { const pl = p.platform || 'instagram'; acc[pl] = (acc[pl] || 0) + 1; return acc; }, {});

  return (
    <div>
      {isDemo && <p className="text-[10px] text-amber-400/50 mb-2">{'\u{1F4F8}'} {p.contentDemoHint}</p>}

      {/* Generation in progress indicator */}
      {generating && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg animate-pulse">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400" />
          <span className="text-xs text-purple-300">{p.contentGeneratingInProgress}</span>
        </div>
      )}

      {/* Calendar + gallery removed — everything in Planning tab */}

      {/* Gallery removed — use Planning tab. Hidden below to keep state/logic intact */}
      <div style={{ display: 'none' }}>
      {/* Platform filter */}
      <div className="flex gap-1 mb-1.5 overflow-x-auto">
        {[
          { key: 'all', label: p.contentPlatformAll, icon: '' },
          { key: 'instagram', label: `IG (${platformCounts.instagram || 0})`, icon: '\u{1F4F8}' },
          { key: 'tiktok', label: `TT (${platformCounts.tiktok || 0})`, icon: '\u{1F3B5}' },
          { key: 'linkedin', label: `LI (${platformCounts.linkedin || 0})`, icon: '\u{1F4BC}' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setPlatformFilter(tab.key)}
            className={`px-2 py-1 text-[10px] font-medium rounded-md whitespace-nowrap transition-all ${platformFilter === tab.key ? 'bg-white/15 text-white' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}
          >{tab.icon} {tab.label}</button>
        ))}
      </div>

      {/* Status filter tabs — counts based on platform filter */}
      {(() => { const pCounts = platformFiltered.reduce((acc: Record<string, number>, p: any) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {}); return (
      <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: `${p.contentTabAll} (${platformFiltered.length})` },
          { key: 'draft', label: `${p.contentTabDraft} (${pCounts.draft || 0})` },
          { key: 'approved', label: `${p.contentTabApproved} (${pCounts.approved || 0})` },
          { key: 'published', label: `${p.contentTabPublished} (${pCounts.published || 0})` },
          ...((pCounts.publish_failed || 0) > 0 ? [{ key: 'publish_failed', label: `${p.contentTabFailed} (${pCounts.publish_failed})` }] : []),
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={`px-2 py-1 text-[10px] font-medium rounded-md whitespace-nowrap transition-all ${filter === tab.key ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
          >{tab.label}</button>
        ))}
      </div>
      ); })()}

      {/* Instagram-style grid — latest first */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-0.5">
        {(filter === 'all' ? platformFiltered : platformFiltered.filter((p: any) => p.status === filter))
          .sort((a: any, b: any) => new Date(b.published_at || b.scheduled_date || b.created_at || 0).getTime() - new Date(a.published_at || a.scheduled_date || a.created_at || 0).getTime())
          .slice(0, showAll ? 30 : 12).map((post: any) => (
          <button key={post.id} onClick={() => setSelectedPost(post)} className="relative aspect-square bg-white/5 rounded-md overflow-hidden hover:opacity-80 transition group">
            {post.visual_url ? (
              <img src={post.visual_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-pink-900/30">
                <span className="text-[10px] text-white/50 px-1 text-center line-clamp-2">{(post.hook || post.caption || '').substring(0, 40)}</span>
              </div>
            )}
            {/* Status dot */}
            <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${STATUS_COLORS[post.status] || 'bg-gray-500'}`} />
            {/* Platform badge */}
            <div className="absolute bottom-0.5 left-0.5 text-[10px] font-bold text-white bg-black/55 px-1.5 py-0.5 rounded">
              {post.platform === 'tiktok' ? 'TT' : post.platform === 'linkedin' ? 'LI' : 'IG'}
            </div>
            {/* Scheduled date for approved posts */}
            {post.status === 'approved' && post.scheduled_date && (
              <div className="absolute bottom-0.5 right-0.5 text-[10px] text-white/85 bg-black/55 px-1.5 py-0.5 rounded">
                {post.scheduled_date.substring(5)}{post.scheduled_time ? ` ${post.scheduled_time.slice(0, 5)}` : ''}
              </div>
            )}
            {/* Hover: reel/carousel indicator */}
            {(post.format === 'reel' || post.format === 'video') && (
              <div className="absolute top-1 left-1 text-xs text-white drop-shadow">{'\u{1F3AC}'}</div>
            )}
            {(post.format === 'carrousel' || post.format === 'carousel') && (
              <div className="absolute top-1 left-1 text-xs text-white drop-shadow">{'\u{1F4DA}'}</div>
            )}
            {/* 2026-06-07 — Boost badge on TikTok reels: toggles boost_mode
                so the cron skips auto-publish and emails the client to
                drop a CML trending sound in-app for max reach. */}
            {post.platform === 'tiktok' && (post.format === 'reel' || post.format === 'video') && post.status !== 'published' && (
              <div
                role="button"
                tabIndex={0}
                onClick={async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  try {
                    const sb = (await import('@/lib/supabase/client')).supabaseBrowser();
                    const newVal = !post.boost_mode;
                    await sb.from('content_calendar').update({ boost_mode: newVal }).eq('id', post.id);
                    (post as any).boost_mode = newVal;
                    // Force re-render by triggering a small state bump
                    setSelectedPost({ ...post });
                    setTimeout(() => setSelectedPost(null), 50);
                  } catch {}
                }}
                title={post.boost_mode ? (en ? '🚀 Boost ON — manual CML sound in TikTok app' : '🚀 Boost ON — son CML manuel TikTok app') : (en ? 'Enable boost — manual trending CML sound' : 'Active boost — son trending CML manuel')}
                className={`absolute bottom-0.5 right-0.5 text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                  post.boost_mode
                    ? 'bg-orange-500/90 text-white font-bold ring-1 ring-orange-200'
                    : 'bg-black/40 text-white/60 hover:bg-orange-500/50 hover:text-white'
                }`}
              >
                {post.boost_mode ? '🚀 BOOST' : '🚀'}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Voir plus / Voir moins */}
      {(filter === 'all' ? platformFiltered : platformFiltered.filter((post: any) => post.status === filter)).length > 12 && (
        <button onClick={() => setShowAll(!showAll)} className="w-full mt-2 py-2 text-center text-[10px] text-purple-400 hover:text-purple-300 transition flex items-center justify-center gap-1">
          {showAll ? `\u2191 ${p.contentSeeLess}` : `\u2193 ${p.contentSeeMore} (${(filter === 'all' ? platformFiltered : platformFiltered.filter((post: any) => post.status === filter)).length - 12} posts)`}
        </button>
      )}

      </div>{/* end hidden gallery */}

      {/* Post preview modal — opens from calendar clicks */}
      {selectedPost && (
        <PostPreviewModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onApprove={selectedPost.status === 'draft' ? () => handleAction(selectedPost.id, 'approve') : undefined}
          onPublish={(selectedPost.status === 'draft' || selectedPost.status === 'approved') ? () => handleAction(selectedPost.id, 'publish_single') : undefined}
          onSkip={selectedPost.status === 'draft' ? () => handleAction(selectedPost.id, 'skip') : undefined}
        />
      )}
    </div>
  );
}

// ─── Per-network performance cards ───────────────────────────
// Grouped view so the client sees each social at a glance — better UX
// than a single blended engagement number that hides whether growth is
// on Instagram or TikTok.
function PerNetworkStats({ stats }: { stats: any }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const byNet = stats.byNetwork || {};
  const ig = byNet.instagram || {};
  const tk = byNet.tiktok || {};
  const li = byNet.linkedin || {};

  // Sample fallbacks for disconnected networks — keeps the panel from
  // looking empty on first visit. The "Sample" badge makes it obvious
  // the numbers are placeholders and a Connect CTA is rendered alongside.
  const igSample = sampleFor('instagram');
  const tkSample = sampleFor('tiktok');
  const liSample = sampleFor('linkedin');

  const NETWORKS = [
    {
      key: 'instagram' as const,
      label: 'Instagram',
      icon: '\u{1F4F8}',
      connectUrl: '/api/auth/instagram-oauth',
      gradient: 'from-pink-500/20 to-purple-500/20',
      border: 'border-pink-500/30',
      accent: 'text-pink-300',
      data: ig,
      metrics: ig.connected ? [
        { label: 'Posts published', value: fmt(ig.posts || 0) },
        { label: 'Followers', value: fmt(ig.followers || 0) },
        { label: 'Likes', value: fmt(ig.likes || 0) },
        { label: 'Comments', value: fmt(ig.comments || 0) },
        { label: 'Reach (24h)', value: fmt(ig.reach || 0) },
        { label: 'Engagement', value: `${(ig.engagement || 0)}%` },
      ] : [
        { label: 'Posts published', value: fmt(igSample.postsCount) },
        { label: 'Followers', value: fmt(igSample.followersCount) },
        { label: 'Likes', value: fmt(igSample.likes) },
        { label: 'Comments', value: fmt(igSample.comments) },
        { label: 'Reach (24h)', value: fmt(igSample.reach) },
        { label: 'Engagement', value: `${igSample.engagement}%` },
      ],
    },
    {
      key: 'tiktok' as const,
      label: 'TikTok',
      icon: '\u{1F3B5}',
      connectUrl: '/api/auth/tiktok-oauth',
      gradient: 'from-cyan-500/20 to-emerald-500/20',
      border: 'border-cyan-500/30',
      accent: 'text-cyan-300',
      data: tk,
      metrics: tk.connected ? [
        { label: 'Videos published', value: fmt(tk.posts || 0) },
        { label: 'Scheduled', value: fmt(tk.scheduled || 0) },
      ] : [
        { label: 'Videos published', value: fmt(tkSample.postsCount) },
        { label: 'Followers', value: fmt(tkSample.followersCount) },
        { label: 'Likes', value: fmt(tkSample.likes) },
        { label: 'Engagement', value: `${tkSample.engagement}%` },
      ],
    },
    {
      key: 'linkedin' as const,
      label: 'LinkedIn',
      icon: '\u{1F4BC}',
      connectUrl: '/api/auth/linkedin-oauth',
      gradient: 'from-blue-500/20 to-sky-500/20',
      border: 'border-blue-500/30',
      accent: 'text-blue-300',
      data: li,
      metrics: li.connected ? [
        { label: 'Posts published', value: fmt(li.posts || 0) },
        { label: 'Scheduled', value: fmt(li.scheduled || 0) },
      ] : [
        { label: 'Posts published', value: fmt(liSample.postsCount) },
        { label: 'Connections', value: fmt(liSample.followersCount) },
        { label: 'Reactions', value: fmt(liSample.likes) },
        { label: 'Engagement', value: `${liSample.engagement}%` },
      ],
    },
  ];

  // Show ALL networks now (connected or not) so the user always sees data
  // — real when connected, sample (with badge + Connect CTA) when not.
  const [active, setActive] = useState<'instagram' | 'tiktok' | 'linkedin'>(
    (NETWORKS.find(n => n.data?.connected)?.key as any) || 'instagram',
  );

  const cur = NETWORKS.find(n => n.key === active) || NETWORKS[0];
  const curConnected = !!cur.data?.connected;
  const usingSample = !curConnected;

  return (
    <div>
      {/* Tabs for every network — connected ones get a green dot, the
          others a faded "Sample" label so the user can still inspect
          what the panel would show. */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10 mb-3 overflow-x-auto">
        {NETWORKS.map(n => {
          const c = !!n.data?.connected;
          return (
            <button
              key={n.key}
              onClick={() => setActive(n.key as any)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                active === n.key ? 'bg-white/10 text-white shadow' : 'text-white/50 hover:text-white/70'
              }`}
            >
              <span>{n.icon}</span> {n.label}
              <span className={`ml-1 w-1.5 h-1.5 rounded-full ${c ? 'bg-emerald-400' : 'bg-amber-400/60'}`} />
            </button>
          );
        })}
      </div>

      <div className={`rounded-xl border ${usingSample ? 'border-amber-400/30 bg-amber-500/[0.04]' : `${cur.border} bg-gradient-to-br ${cur.gradient}`} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{cur.icon}</span>
          <span className={`text-sm font-bold ${usingSample ? 'text-amber-200' : cur.accent}`}>{cur.label}</span>
          {usingSample ? (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
              Sample
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
              {cur.data?.hasActivity ? 'Live · KeiroAI active' : 'Live · organic'}
            </span>
          )}
          {usingSample && (
            <a
              href={cur.connectUrl}
              className="ml-auto px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white text-[10px] font-bold transition"
            >
              {en ? 'Connect →' : 'Connecter →'}
            </a>
          )}
        </div>

        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${usingSample ? 'opacity-70' : ''}`}>
          {cur.metrics.map(m => (
            <div key={m.label} className="rounded-lg bg-black/20 p-2">
              <div className="text-[10px] text-white/50">{m.label}</div>
              <div className="text-sm font-bold text-white mt-0.5">{m.value}</div>
            </div>
          ))}
        </div>

        {usingSample && (
          <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-400/20 px-3 py-2 text-[11px] text-amber-200/90">
            {en
              ? <>Sample data. Connect {cur.label} to see your real numbers updated live (on every connection, post, like, comment).</>
              : <>Données d&apos;exemple. Connecte {cur.label} pour voir tes vrais chiffres mis à jour en live (à chaque connexion, publication, like, commentaire).</>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Network preview tab (Instagram / TikTok / LinkedIn) ───────
// Shows the most recent posts on each connected network with live metrics
// and a native deep-link so the client can jump straight into the platform
// (only place where posts can actually be deleted — none of the APIs we use
// authorize DELETE for IG or TikTok).
function NetworkPreviewTab({
  initialNetwork,
  singleNetwork,
}: {
  initialNetwork?: 'instagram' | 'tiktok' | 'linkedin';
  // When set, hide the inner network sub-tabs entirely — used by the
  // top-level Léna restructure where the parent already drives which
  // network is active. Showing nested IG/TT/LI tabs underneath the page
  // selector creates visual duplication and lets the user end up on a
  // mismatched network inside the per-network section.
  singleNetwork?: boolean;
} = {}) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const NETWORKS = [
    { key: 'instagram', label: 'Instagram', color: '#e1306c', icon: '\u{1F4F8}' },
    { key: 'tiktok', label: 'TikTok', color: '#00f2ea', icon: '\u{1F3B5}' },
    { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2', icon: '\u{1F4BC}' },
  ];
  const [active, setActive] = useState<'instagram' | 'tiktok' | 'linkedin'>(initialNetwork ?? 'instagram');
  // Keep `active` in sync with the parent's selection in single-network mode.
  useEffect(() => {
    if (singleNetwork && initialNetwork) setActive(initialNetwork);
  }, [singleNetwork, initialNetwork]);
  const [lightbox, setLightbox] = useState<any>(null);
  const [state, setState] = useState<Record<string, { loading: boolean; connected: boolean; posts: any[]; error?: string }>>({
    instagram: { loading: true, connected: false, posts: [] },
    tiktok: { loading: true, connected: false, posts: [] },
    linkedin: { loading: true, connected: false, posts: [] },
  });

  const load = useCallback((net: string) => {
    setState(prev => ({ ...prev, [net]: { ...prev[net], loading: true, error: undefined } }));
    fetch(`/api/agents/content/network-preview?network=${net}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setState(prev => ({
        ...prev,
        [net]: {
          loading: false,
          connected: !!d.connected,
          posts: Array.isArray(d.posts) ? d.posts : [],
          error: d.ok === false ? d.error : undefined,
        },
      })))
      .catch(e => setState(prev => ({ ...prev, [net]: { loading: false, connected: false, posts: [], error: e.message } })));
  }, []);

  useEffect(() => { load(active); }, [active, load]);

  const cur = state[active];
  const net = NETWORKS.find(n => n.key === active)!;

  return (
    <div>
      {!singleNetwork && (
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10 mb-3">
          {NETWORKS.map(n => (
            <button
              key={n.key}
              onClick={() => setActive(n.key as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                active === n.key ? 'bg-white/10 text-white shadow' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <span>{n.icon}</span> {n.label}
              {state[n.key].connected && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/40">
          {cur.loading ? (en ? 'Loading...' : 'Chargement...') : cur.connected ? (en ? `${cur.posts.length} recent post(s)` : `${cur.posts.length} post(s) recent(s)`) : (en ? `${net.label} not connected` : `${net.label} non connecte`)}
        </span>
        <button
          onClick={() => load(active)}
          disabled={cur.loading}
          className="text-[10px] text-white/50 hover:text-white/80 disabled:opacity-40"
        >
          {cur.loading ? '...' : (en ? '\u21BB Refresh' : '\u21BB Rafraichir')}
        </button>
      </div>

      {cur.error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 text-[10px] text-red-300 p-2 mb-2">
          {cur.error}
        </div>
      )}

      {!cur.loading && !cur.connected && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
          <div className="text-xl mb-1">{net.icon}</div>
          <p className="text-xs text-white/50">{en ? `Connect ${net.label} to see your posts here.` : `Connecte ${net.label} pour voir tes publications ici.`}</p>
        </div>
      )}

      {cur.connected && cur.posts.length === 0 && !cur.loading && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center text-xs text-white/40">
          {en ? 'No posts found.' : 'Aucune publication trouvee.'}
        </div>
      )}

      {/* Instagram-profile-style tight grid. Capped at max-w-md so on
          desktop the thumbs stay phone-sized — matches what the
          client's followers actually see when they open IG on mobile.
          Without the cap, 3 cols on a 1200px+ viewport blew up to
          400px tiles, which felt like a TV display, not a feed
          preview. Mobile already lands at ~120px tiles. */}
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1 rounded-xl overflow-hidden bg-black/20 max-w-[95vw] sm:max-w-md mx-auto">
        {cur.posts.map(post => (
          <button
            key={post.id}
            onClick={() => setLightbox(post)}
            className="relative aspect-square bg-black/40 overflow-hidden group"
          >
            {post.media_url ? (
              <img src={post.media_url} alt="" loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl text-white/45">{net.icon}</div>
            )}
            {post.media_type === 'VIDEO' && (
              <div className="absolute top-1 right-1 text-white text-xs drop-shadow-lg">{'\u25B6\uFE0F'}</div>
            )}
            {post.media_type === 'CAROUSEL_ALBUM' && (
              <div className="absolute top-1 right-1 text-white text-xs drop-shadow-lg">{'\u29C9'}</div>
            )}
          </button>
        ))}
      </div>

      <p className="text-[10px] text-white/30 mt-3 text-center">
        {en
          ? <>Tap a thumbnail to see the caption, stats and link. To delete a post on Instagram or TikTok, do it directly in the app — we&apos;ll open it for you.</>
          : <>Touche une vignette pour voir la légende, les stats et le lien. Pour supprimer un post sur Instagram ou TikTok, ça se fait directement dans l&apos;app — on t&apos;y emmène.</>}
      </p>

      {/* Lightbox — mobile-first bottom sheet, modal on desktop */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="bg-gray-950 rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-md w-full max-h-[92vh] overflow-y-auto border border-white/10"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-base">{net.icon}</span>
                <span className="text-xs font-bold text-white/80">{net.label}</span>
              </div>
              <button
                onClick={() => setLightbox(null)}
                className="text-white/40 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10"
              >×</button>
            </div>
            {lightbox.media_url && (
              <div className="aspect-square bg-black/40 overflow-hidden">
                <img src={lightbox.media_url} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-4 space-y-3">
              {lightbox.caption && (
                <p className="text-xs text-white/80 whitespace-pre-wrap leading-relaxed">{lightbox.caption}</p>
              )}
              {(() => {
                const m = lightbox.metrics || {};
                const entries: Array<[string, any]> = Object.entries(m).filter(([, v]) => v !== null && v !== undefined);
                if (entries.length === 0) return null;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {entries.slice(0, 8).map(([k, v]) => (
                      <div key={k} className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-center">
                        <div className="text-[10px] text-white/40 uppercase tracking-wide">{k}</div>
                        <div className="text-xs font-bold text-white">{fmt(Number(v) || 0)}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {lightbox.timestamp && (
                <p className="text-[10px] text-white/40">
                  {en ? 'Published on ' : 'Publié le '}{new Date(lightbox.timestamp).toLocaleDateString(en ? 'en-US' : 'fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              )}
              {lightbox.permalink && (
                <a
                  href={lightbox.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center px-3 py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  {en ? 'Open in ' : 'Ouvrir dans '}{net.label} {'\u2197'}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Léna restructured by social network ──────────────────────
// The whole panel is driven by ONE network selector at the top. Everything
// below (connection card, discrete stats, inspiration, topic-of-the-week,
// recent posts preview) belongs to the network the user just clicked.
//
// Why: previously the workspace had three "Connect Instagram" entry points
// (asset badge, NetworkControls row, network preview tab) plus an
// IG-only inspiration box, which felt scattered. Grouping everything per
// network removes the redundancy and lets the page adapt automatically:
// a client connected to Instagram only never sees TikTok/LinkedIn empty
// shells.

const LENA_NETWORKS = [
  {
    key: 'instagram' as const,
    label: 'Instagram',
    icon: '\u{1F4F8}',
    color: '#e1306c',
    accent: 'pink',
    gradient: 'from-pink-500/20 to-purple-500/20',
    border: 'border-pink-500/30',
    accentText: 'text-pink-300',
    accentBtn: 'bg-gradient-to-r from-pink-500 to-purple-600',
    oauth: '/api/auth/instagram-oauth',
  },
  {
    key: 'tiktok' as const,
    label: 'TikTok',
    icon: '\u{1F3B5}',
    color: '#00f2ea',
    accent: 'cyan',
    gradient: 'from-cyan-500/20 to-emerald-500/20',
    border: 'border-cyan-500/30',
    accentText: 'text-cyan-300',
    accentBtn: 'bg-gradient-to-r from-cyan-500 to-emerald-600',
    oauth: '/api/auth/tiktok-oauth',
  },
  {
    key: 'linkedin' as const,
    label: 'LinkedIn',
    icon: '\u{1F4BC}',
    color: '#0A66C2',
    accent: 'blue',
    gradient: 'from-blue-500/20 to-sky-500/20',
    border: 'border-blue-500/30',
    accentText: 'text-blue-300',
    accentBtn: 'bg-gradient-to-r from-blue-600 to-sky-600',
    oauth: '/api/auth/linkedin-oauth',
  },
];

type LenaNetworkKey = 'instagram' | 'tiktok' | 'linkedin';

export function ContentPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t, locale } = useLanguage();
  const en = locale === 'en';
  const p = t.panels;
  const stats = data.contentStats || { postsGenerated: 0, scheduledPosts: 0, recentContent: [] };
  const connections: Record<string, boolean> = (data as any).connections || {};

  // Default the active tab to the first network the user has actually
  // connected, so a client with Instagram only lands on Instagram and
  // never has to click through TikTok/LinkedIn shells.
  const firstConnected = (LENA_NETWORKS.find(n => connections[n.key])?.key ?? 'instagram') as LenaNetworkKey;
  const [active, setActive] = useState<LenaNetworkKey>(firstConnected);

  // 2026-06-04 — Founder ask: "planning fait en avance chaque semaine ce
  // qui lui laisse l'occasion de supprimer ou changer avant la date et
  // heure de publication". Bouton "Plan ma semaine" qui déclenche
  // /api/agents/content action=generate_weekly. La cron Sunday 18:00
  // UTC le fait déjà auto, mais le bouton manuel laisse au client le
  // contrôle (regen quand il veut).
  const [planningWeekly, setPlanningWeekly] = useState(false);
  const [planningWeeks, setPlanningWeeks] = useState<number | null>(null); // which option is in flight
  const [weeklyToast, setWeeklyToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const planWeek = async (weeks: 1 | 2 | 3 | 4) => {
    if (planningWeekly) return;
    const daysLabel = en
      ? (weeks === 1 ? '7 days' : weeks === 2 ? '14 days' : weeks === 3 ? '21 days' : '30 days (1 month)')
      : (weeks === 1 ? '7 jours' : weeks === 2 ? '14 jours' : weeks === 3 ? '21 jours' : '30 jours (1 mois)');
    if (!window.confirm(en
      ? `Léna will plan ${daysLabel} of content (IG + TikTok + LinkedIn depending on what's connected).\n\nYou can edit or delete each post before its publication date.\n\nStart generation?`
      : `Léna va planifier ${daysLabel} de contenu (IG + TikTok + LinkedIn selon ce qui est connecté).\n\nTu pourras modifier ou supprimer chaque post avant sa date de publication.\n\nDémarrer la génération ?`)) return;
    setPlanningWeekly(true);
    setPlanningWeeks(weeks);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_weekly', weeks }),
      });
      const d = await res.json();
      if (d.ok) {
        setWeeklyToast({ kind: 'ok', msg: en
          ? `✓ ${d.inserted || 0} posts planned over ${daysLabel}. Edit or delete each post before its date in Planning.`
          : `✓ ${d.inserted || 0} posts planifiés sur ${daysLabel}. Édite ou supprime chaque post avant sa date dans le Planning.` });
      } else {
        setWeeklyToast({ kind: 'err', msg: en ? `Error: ${d.error || 'unknown'}` : `Erreur : ${d.error || 'inconnu'}` });
      }
    } catch (e: any) {
      setWeeklyToast({ kind: 'err', msg: e?.message || 'Plan failed' });
    } finally {
      setPlanningWeekly(false);
      setPlanningWeeks(null);
      setTimeout(() => setWeeklyToast(null), 8000);
    }
  };

  return (
    <>
      {/* Planning à l'avance + Valider toggle DÉPLACÉS dans l'onglet
          Planning (founder ask 2026-06-09 : "toute cette partie la
          doit etre dans l onglet planning pas dashboard"). */}
      {weeklyToast && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${weeklyToast.kind === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'}`}>
          {weeklyToast.msg}
        </div>
      )}

      {/* Slider mix image/vidéo COMPACT (juste les chiffres
          + crédits restants + upsell pack si quota faible). */}
      <div className="mb-3">
        <CadenceMixSlider
          plan={((data as any).clientPlan || 'createur').toLowerCase()}
          initialRatio={((data as any).contentVideoRatio as number) || 40}
          onBuyPack={() => {
            // Le parent (agent/[id]/page.tsx) écoute cet event et ouvre
            // le CreditPackModal avec reason='quota_exhausted'.
            window.dispatchEvent(new CustomEvent('keiro:openCreditModal', { detail: { reason: 'quota_exhausted', source: 'content_mix_slider' } }));
          }}
          onUpgradePlan={() => {
            // Redirige vers /pricing pour upgrade du plan
            window.location.href = '/pricing#plans';
          }}
          onApply={async (ratio) => {
            try {
              const res = await fetch('/api/agents/content', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_video_ratio', video_ratio: ratio }),
              });
              const j = await res.json();
              if (j.ok) {
                // 2026-06-09 — si crédits insuffisants, déclencher modal upsell
                if (j.credits_alert) {
                  setWeeklyToast({ kind: 'err', msg: j.message });
                  window.dispatchEvent(new CustomEvent('keiro:openCreditModal', {
                    detail: {
                      reason: j.credits_alert.kind === 'upgrade' ? 'quota_exhausted' : 'budget_red',
                      source: 'content_mix_slider_apply',
                    },
                  }));
                } else {
                  setWeeklyToast({ kind: 'ok', msg: j.message || (en ? `✓ Mix ${ratio}% applied — Léna regenerates the next 7 days.` : `✓ Mix ${ratio}% appliqué — Léna régénère les 7 prochains jours.`) });
                }
              } else {
                setWeeklyToast({ kind: 'err', msg: en ? `Error: ${j.error || 'unknown'}` : `Erreur : ${j.error || 'inconnu'}` });
              }
            } catch (e: any) {
              setWeeklyToast({ kind: 'err', msg: e?.message || 'set failed' });
            }
            setTimeout(() => setWeeklyToast(null), 8000);
          }}
        />
      </div>

      {/* ValidatePublicationsToggle déplacé dans la card "Planning à
          l'avance" — section planning de Léna (founder ask 2026-06-09). */}

      {/* Network selector — always visible, single source of truth for the
          rest of the panel. Connected networks have a green dot; not-yet
          connected networks remain clickable (they take you to their own
          empty section with a Connect CTA). */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10 mb-3 overflow-x-auto">
        {LENA_NETWORKS.map(n => {
          const isConnected = !!connections[n.key];
          const isActive = active === n.key;
          return (
            <button
              key={n.key}
              onClick={() => setActive(n.key)}
              className={`flex-1 min-w-[110px] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md text-xs font-medium transition-all ${
                isActive ? 'bg-white/10 text-white shadow' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
              {isConnected ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              ) : (
                <span className="text-[10px] text-white/30 uppercase">+</span>
              )}
            </button>
          );
        })}
      </div>

      <NetworkSection
        network={active}
        connected={!!connections[active]}
        stats={stats}
        data={data}
        gradientFrom={gradientFrom}
        gradientTo={gradientTo}
        p={p}
      />

      {/* Cross-network: video montage CTA stays available because it doesn't
          target a specific platform and uses uploaded clips. */}
      <VideoMontageBox />
    </>
  );
}

function NetworkSection({
  network,
  connected,
  stats,
  data,
  gradientFrom,
  gradientTo,
  p,
}: {
  network: LenaNetworkKey;
  connected: boolean;
  stats: any;
  data: any;
  gradientFrom: string;
  gradientTo: string;
  p: any;
}) {
  const meta = LENA_NETWORKS.find(n => n.key === network)!;
  const byNet = stats.byNetwork || {};
  const netStats = byNet[network] || {};
  const hasActivity = !!netStats.hasActivity;

  return (
    <div className={`rounded-2xl border ${meta.border} bg-gradient-to-br ${meta.gradient} p-4`}>
      {/* Section 1 — Connection card. When connected we surface the actual
          handle / page name / follower count + per-network auto-mode toggle
          + disconnect link, so the bottom-of-page InstagramAssetBadge and
          NetworkControls duplications can be removed cleanly.
          When disconnected, single Connect CTA. */}
      <NetworkConnectionCard network={network} connected={connected} />

      {/* Section 2 — Stats + strategic insights.
          We mix the user's real live numbers (followers / likes / reach
          pulled live from the platform API + cached profile fallback)
          WITH actionable strategic insights coming out of KeiroAI's
          cross-client knowledge pool (best post time, recommended
          frequency, opportunity score). The strategic block is what
          gives the client immediate confidence on day 1 — even with
          zero KeiroAI-published content, they see Léna already knows
          their sector. */}
      <div className="rounded-xl bg-black/20 border border-white/5 p-3 mb-4">
        {!connected ? (
          <>
            {/* Sample preview before connection — clearly labelled so
                the user understands these are typical numbers, not their
                own. Switches to the live API + cached counts as soon as
                the network is connected. */}
            <div className="flex items-center gap-2 mb-2 text-[10px]">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">Sample data</span>
              <span className="text-white/40">
                Typical {meta.label} numbers — replaced by YOUR live stats once you connect.
              </span>
            </div>
            <NetworkStatsRow network={network} netStats={{}} stats={{}} sample />
            <NetworkStrategyHints network={network} hasActivity={false} />
          </>
        ) : (
          <>
            <NetworkStatsRow network={network} netStats={netStats} stats={stats} />
            <NetworkStrategyHints network={network} hasActivity={hasActivity} />
          </>
        )}
      </div>

      {/* Section 3 — Inspiration for THIS network */}
      <InspirationBox network={network} />

      {/* Section 4 — Topic of the week applies across all networks. */}
      <ContentDirectionInput />

      {/* Section 5 — Recent published posts on THIS network. singleNetwork
          tells the component to drop its own IG/TT/LI tab bar (the parent
          selector at the top of Léna already drives the active network) so
          the user does not see two stacked network selectors. */}
      <SectionTitle>{p.contentSectionPerf || 'Recent posts'}</SectionTitle>
      <NetworkPreviewTab initialNetwork={network} singleNetwork />

      {/* Production gallery + workflow lived here in the previous version
          but the actual gallery is now in /library + the Planning tab. The
          duplicate "Connect / NetworkControls" row that used to sit here
          is replaced by the inline auto-mode toggle in the connection card
          above. */}
    </div>
  );
}

function ValidatePublicationsToggle() {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [autoPublish, setAutoPublish] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const { data } = await sb
          .from('org_agent_configs')
          .select('config')
          .eq('user_id', user.id)
          .eq('agent_id', 'content')
          .limit(1)
          .maybeSingle();
        if (!cancelled) {
          // Default to true (auto-publish enabled = our value pitch).
          // The toggle reads as "Valider les publications": ON means
          // client validates manually → no auto-publish (auto_publish=false).
          // OFF means trust Léna → auto-publish.
          // So in DB: auto_publish === false ⟹ toggle ON (validate).
          //          auto_publish !== false ⟹ toggle OFF (trust Léna).
          setAutoPublish(data?.config?.auto_publish !== false);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = async () => {
    if (autoPublish === null || saving) return;
    setSaving(true);
    const next = !autoPublish;
    setAutoPublish(next);
    try {
      const sb = supabaseBrowser();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setSaving(false); return; }
      const { data: rows } = await sb
        .from('org_agent_configs')
        .select('id, config')
        .eq('user_id', user.id)
        .eq('agent_id', 'content');
      if (rows && rows.length > 0) {
        for (const r of rows) {
          const cfg = r.config || {};
          cfg.auto_publish = next;
          await sb.from('org_agent_configs').update({ config: cfg }).eq('id', r.id);
        }
      } else {
        await sb.from('org_agent_configs').insert({
          user_id: user.id,
          agent_id: 'content',
          config: { auto_publish: next },
        });
      }
    } catch (e) {
      setAutoPublish(!next); // revert on error
    } finally {
      setSaving(false);
    }
  };

  if (autoPublish === null) return null;

  // Toggle label flips the semantics for the user:
  // "Valider chaque publication" — ON means client validates (no auto-publish).
  // Under the hood: auto_publish stored as the OPPOSITE.
  const validateMode = !autoPublish; // true = validate, false = trust Léna
  return (
    <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-900/15 to-blue-900/15 p-3 mb-3">
      <div className="flex items-center gap-3">
        <div className="text-2xl">{validateMode ? '✋' : '⚡'}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">{en ? 'Validate each publication' : 'Valider chaque publication'}</div>
          <div className="text-[11px] text-white/50">
            {validateMode
              ? (en ? 'Léna prepares the posts in the planning. YOU validate each post manually before publishing (IG/TikTok/LinkedIn).' : 'Léna prépare les posts dans le planning. TU valides chaque post manuellement avant publication (IG/TikTok/LinkedIn).')
              : (en ? 'Léna publishes automatically at the scheduled times. No manual validation.' : 'Léna publie automatiquement aux horaires planifiés. Pas de validation manuelle.')}
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
            validateMode ? 'bg-cyan-500' : 'bg-white/20'
          } ${saving ? 'opacity-50' : ''}`}
          aria-label={en ? 'Toggle validate publications' : 'Toggle valider publications'}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              validateMode ? 'translate-x-6' : ''
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function NetworkConnectionCard({ network, connected }: { network: LenaNetworkKey; connected: boolean }) {
  const meta = LENA_NETWORKS.find(n => n.key === network)!;
  const [profile, setProfile] = useState<any>(null);
  const [autoMode, setAutoMode] = useState<boolean>(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);

  // Pull the live identity for the active network so the connection card
  // can show "@keiro_ai · 1.2k followers" — equivalent to the previous
  // bottom-of-page InstagramAssetBadge but inline where it belongs.
  // If the cached followers count is null/0 but the network is marked
  // connected (OAuth callback enrichment may have failed silently),
  // we hit /api/instagram/refresh-profile to repopulate live, then
  // re-read the row. This is what removes the "tout à 0 juste après
  // connexion" issue the founder caught.
  useEffect(() => {
    if (!connected) { setProfile(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const readProfile = async () => sb.from('profiles')
          .select('instagram_username, instagram_followers_count, instagram_profile_picture_url, facebook_page_name, tiktok_username, linkedin_username')
          .eq('id', user.id)
          .maybeSingle();
        let { data } = await readProfile();
        // Auto-refresh stale Instagram cache (followers null/0 but token exists).
        if (
          network === 'instagram' &&
          (!data || data.instagram_followers_count == null || data.instagram_followers_count === 0)
        ) {
          try {
            await fetch('/api/instagram/refresh-profile', { method: 'POST', credentials: 'include' });
            const fresh = await readProfile();
            if (!cancelled && fresh.data) data = fresh.data;
          } catch {}
        }
        if (!cancelled) setProfile(data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [network, connected]);

  // Auto-mode toggle (per-network) — same setting the previous
  // NetworkControls block exposed but scoped to the active tab.
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/agents/settings?agent_id=content', { credentials: 'include' });
        const j = await r.json();
        if (cancelled) return;
        const cfg = j.settings || {};
        setAutoMode(cfg[`auto_mode_${network}`] ?? cfg.auto_mode ?? false);
        setAutoLoaded(true);
      } catch { setAutoLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [network, connected]);

  const toggleAuto = useCallback(async () => {
    const next = !autoMode;
    setAutoMode(next);
    setSavingAuto(true);
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: 'content',
          auto_mode: next,
          [`auto_mode_${network}`]: next,
        }),
      });
    } catch { setAutoMode(!next); } finally { setSavingAuto(false); }
  }, [autoMode, network]);

  const disconnect = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.confirm(`Disconnect ${meta.label}?`)) return;
    try {
      await fetch('/api/agents/disconnect-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ network }),
      });
      window.location.reload();
    } catch {}
  }, [network, meta.label]);

  // Build the identity line for the currently selected network.
  let identity: string | null = null;
  let followers: number | null = null;
  if (connected && profile) {
    if (network === 'instagram') {
      identity = profile.instagram_username ? `@${profile.instagram_username}` : null;
      followers = typeof profile.instagram_followers_count === 'number' ? profile.instagram_followers_count : null;
    } else if (network === 'tiktok') {
      identity = profile.tiktok_username ? `@${profile.tiktok_username.replace(/^@/, '')}` : null;
    } else if (network === 'linkedin') {
      identity = profile.linkedin_username || null;
    }
  }

  return (
    <div className="flex items-center gap-3 mb-4">
      {network === 'instagram' && profile?.instagram_profile_picture_url ? (
        <img
          src={profile.instagram_profile_picture_url}
          alt={identity || 'Instagram account'}
          className="w-10 h-10 rounded-xl object-cover"
        />
      ) : (
        <div className={`w-10 h-10 rounded-xl ${meta.accentBtn} flex items-center justify-center text-lg`}>
          {meta.icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white truncate">
          {identity || meta.label}
        </div>
        {connected ? (
          <div className="text-[10px] text-emerald-300 flex items-center gap-2">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected</span>
            {followers !== null && <span className="text-white/50">· {fmt(followers)} followers</span>}
            {network === 'instagram' && profile?.facebook_page_name && (
              <span className="text-white/40 truncate">· FB {profile.facebook_page_name}</span>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-white/40">Not connected yet</div>
        )}
      </div>
      {!connected ? (
        <a
          href={meta.oauth}
          className={`px-3 py-2 rounded-lg ${meta.accentBtn} text-white text-[11px] font-bold hover:opacity-90 transition`}
        >
          ⚡ Connect {meta.label}
        </a>
      ) : (
        <div className="flex items-center gap-2">
          {autoLoaded && (
            <button
              onClick={toggleAuto}
              disabled={savingAuto}
              title={autoMode ? `Auto-publish on ${meta.label} is ON — click to disable` : `Auto-publish on ${meta.label} is OFF — click to enable`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition ${autoMode ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-white/50 border border-white/10 hover:text-white/80'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoMode ? 'bg-emerald-400' : 'bg-white/30'}`} />
              Auto-publish {autoMode ? 'ON' : 'OFF'}
            </button>
          )}
          <button
            onClick={disconnect}
            title={`Disconnect ${meta.label}`}
            className="text-white/30 hover:text-rose-400 text-xs px-1 transition"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function NetworkStatsRow({ network, netStats, stats, sample }: { network: LenaNetworkKey; netStats: any; stats: any; sample?: boolean }) {
  // Sample numbers shown before the network is connected, anchored to a
  // typical active small-business account so the founder/client sees
  // what a "good week" looks like even on day 1. Switched to the user's
  // real numbers (live API + cached profile) as soon as connected.
  const SAMPLE: Record<string, any> = {
    instagram: { posts: 24, followers: 1840, likes: 1320, engagement: 4.2, scheduled: 6 },
    tiktok:    { posts: 18, followers: 8400, views: 145000, engagement: 8.2, scheduled: 5 },
    linkedin:  { posts: 12, followers: 1240, reactions: 850, engagement: 3.8, scheduled: 3 },
  };
  if (sample) netStats = SAMPLE[network] || {};
  // When the dashboard API returned 0 (rate-limit / failed call) but
  // the cached profile row has real numbers (filled by OAuth callback
  // or by /api/instagram/refresh-profile), prefer the cached numbers
  // so the user never sees inconsistent "3 followers up top, 0 in the
  // stats row" — which is exactly the bug the founder caught.
  const [fallback, setFallback] = useState<{ followers: number | null; media: number | null }>({ followers: null, media: null });
  useEffect(() => {
    if (network !== 'instagram') return;
    let cancelled = false;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const { data } = await sb.from('profiles')
          .select('instagram_followers_count, instagram_media_count')
          .eq('id', user.id)
          .maybeSingle();
        if (!cancelled) setFallback({
          followers: typeof data?.instagram_followers_count === 'number' ? data.instagram_followers_count : null,
          media: typeof data?.instagram_media_count === 'number' ? data.instagram_media_count : null,
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [network]);

  const followersValue = (() => {
    if (network !== 'instagram') return null;
    if (netStats.followers && netStats.followers > 0) return netStats.followers;
    return fallback.followers ?? 0;
  })();
  const postsValue = (() => {
    if (netStats.posts && netStats.posts > 0) return netStats.posts;
    if (network === 'instagram' && fallback.media) return fallback.media;
    return 0;
  })();

  const cells: { label: string; value: string }[] = [
    { label: 'Posts', value: fmt(postsValue) },
  ];
  if (network === 'instagram') {
    cells.push(
      { label: 'Followers', value: fmt(followersValue ?? 0) },
      { label: 'Likes', value: fmt(netStats.likes || 0) },
      { label: 'Engagement', value: `${netStats.engagement || 0}%` },
    );
  } else if (network === 'tiktok') {
    cells.push(
      { label: 'Followers', value: fmt(netStats.followers || 0) },
      { label: 'Avg views', value: fmt(netStats.views || 0) },
      { label: 'Engagement', value: `${netStats.engagement || 0}%` },
    );
  } else if (network === 'linkedin') {
    cells.push(
      { label: 'Connections', value: fmt(netStats.followers || 0) },
      { label: 'Reactions', value: fmt(netStats.reactions || 0) },
      { label: 'Engagement', value: `${netStats.engagement || 0}%` },
    );
  } else {
    cells.push(
      { label: 'Scheduled', value: fmt(netStats.scheduled || 0) },
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {cells.map(c => (
        <div key={c.label} className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-white/40">{c.label}</div>
          <div className="text-base font-bold text-white">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// ContentProductionSection / PerNetworkStats removed: replaced by the
// per-network NetworkSection. The IG-style content gallery lives in /library
// and the Planning tab is the single place where the workflow timeline is shown.

// NetworkStrategyHints — actionable insights drawn from KeiroAI's
// cross-client knowledge pool. Visible the moment the user connects,
// even when the account has zero KeiroAI-published content. The goal:
// give the client immediate confidence ("Léna already knows my sector")
// and show Meta App Review concrete value beyond raw API metrics.
//
// The strings are intentionally generic per network so we never invent
// account-specific numbers — they describe what KeiroAI will DO with
// the permission, not pre-existing performance.
function NetworkStrategyHints({ network, hasActivity: _hasActivity }: { network: LenaNetworkKey; hasActivity: boolean }) {
  // Adaptive playbook: fetched live from /api/agents/content/playbook
  // which computes hints from (1) user's published posts, (2) sector
  // overrides, (3) network defaults. Replaces the static lookup table
  // — the founder's rule "Léna's playbook doit etre pertinent et bien
  // mis à jour pour la stratégie adaptive".
  const [hints, setHints] = useState<{ label: string; value: string; source?: string }[]>([]);
  const [basedOn, setBasedOn] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/agents/content/playbook?network=${network}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.ok) { setLoading(false); return; }
        setHints(d.hints || []);
        setBasedOn(d.based_on || '');
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [network]);

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-white/5">
        <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <span>{'\u{1F4A1}'}</span>
          <span>Léna&apos;s playbook for your sector</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-lg bg-white/[0.03] border border-white/5 p-2 animate-pulse h-12" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/5">
      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <span>{'\u{1F4A1}'}</span>
        <span>Léna&apos;s playbook for your sector</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {hints.map(h => (
          <div key={h.label} className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
            <div className="flex items-center gap-1 mb-0.5">
              <div className="text-[10px] text-white/40 uppercase tracking-wider flex-1">{h.label}</div>
              {h.source === 'your_data' && (
                <span className="text-[10px] text-emerald-400 font-bold" title="Computed from your real published posts">YOUR</span>
              )}
              {h.source === 'sector' && (
                <span className="text-[10px] text-cyan-400 font-bold" title="From cross-client sector data">SECTOR</span>
              )}
            </div>
            <div className="text-[11px] text-white font-medium">{h.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-white/40">
        {basedOn || `Defaults from KeiroAI's cross-client knowledge pool. They will adapt to YOUR account once Léna publishes the first post.`}
      </div>
    </div>
  );
}

// IG inspiration box — collapsed by default, lets the founder paste an
// IG handle and Léna analyses the visual style + tone, persisting it as
// a soft inspiration layer for future generations.
//
// Same component is now used for TikTok and LinkedIn — only the IG path
// runs the live analysis (Vision + Business Discovery); the others are
// placeholders that store the chosen handle so Léna can pick it up when
// the multi-network analyzer ships. This is intentional: ship the UI
// shape now so the workspace stops scattering "Connect IG" everywhere
// and groups every network choice under one consistent block.
type InspirationNetwork = 'instagram' | 'tiktok' | 'linkedin';

function InspirationBox({ network }: { network: InspirationNetwork }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  // "Paste a viral URL → extract the hook" (safe oEmbed, no scraping).
  const [hookUrl, setHookUrl] = useState('');
  const [hookCaption, setHookCaption] = useState('');
  const [hookBusy, setHookBusy] = useState(false);
  const [hookRes, setHookRes] = useState<any>(null);
  const [hookNeedCaption, setHookNeedCaption] = useState(false);
  const [hookErr, setHookErr] = useState<string | null>(null);

  const cfg = {
    instagram: { label: 'Instagram', icon: '\u{1F4F8}', accent: 'pink', placeholder: '@bistrot_marais', supported: true },
    tiktok: { label: 'TikTok', icon: '\u{1F3B5}', accent: 'cyan', placeholder: '@username', supported: true },
    linkedin: { label: 'LinkedIn', icon: '\u{1F4BC}', accent: 'blue', placeholder: '/in/firstname-lastname', supported: false },
  }[network];

  const loadBrief = useCallback(async () => {
    // IG uses dedicated /inspiration endpoint that persists; TikTok uses
    // /tiktok-analyze (no persistence yet). LinkedIn has no analyzer.
    if (network !== 'instagram') return;
    try {
      const res = await fetch('/api/agents/content/inspiration', { credentials: 'include' });
      const j = await res.json();
      if (j.ok) setBrief(j.brief || null);
    } catch {}
  }, [network]);

  useEffect(() => { if (open && brief === null) loadBrief(); }, [open, brief, loadBrief]);

  const submit = async () => {
    const clean = handle.replace(/^@/, '').trim();
    if (!clean) return;
    if (!cfg.supported) {
      setError(`${cfg.label} inspiration analyzer is rolling out soon. Your reference is saved and Léna will use it once the analyzer is live.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const endpoint = network === 'tiktok'
        ? '/api/agents/tiktok-analyze'
        : '/api/agents/content/inspiration';
      const body = network === 'tiktok'
        ? { handle: clean, intent: 'inspiration' }
        : { handle: clean, save: true };
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.ok) setError(j.error || (en ? 'Analysis failed' : 'Échec analyse'));
      else if (network === 'tiktok') {
        // Shape tiktok-analyze response into the brief format used by the UI
        setBrief({
          handle: clean,
          summary: j.verdict || j.summary || '',
          ambiance: j.ambiance,
          domaine: j.domaine,
          notes: j.notes,
        });
      } else {
        setBrief(j.brief);
      }
    } catch (e: any) {
      setError(e.message || (en ? 'Error' : 'Erreur'));
    } finally {
      setBusy(false);
    }
  };

  const removeBrief = async () => {
    if (!confirm(`Remove this ${cfg.label} inspiration?`)) return;
    setBusy(true);
    try {
      await fetch('/api/agents/content/inspiration', { method: 'DELETE', credentials: 'include' });
      setBrief(null);
      setHandle('');
    } finally {
      setBusy(false);
    }
  };

  const extractHook = async () => {
    const u = hookUrl.trim();
    if (!u) return;
    setHookBusy(true); setHookErr(null); setHookRes(null);
    try {
      const res = await fetch('/api/agents/hook-extract', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u, caption: hookCaption.trim() || undefined }),
      });
      const j = await res.json();
      if (j.ok) { setHookRes(j); setHookNeedCaption(false); }
      else if (j.needCaption) { setHookNeedCaption(true); setHookErr(j.message || (en ? 'Paste the caption too' : 'Colle aussi la légende')); }
      else setHookErr(j.error || (en ? 'Extraction failed' : 'Échec extraction'));
    } catch (e: any) { setHookErr(e.message); }
    finally { setHookBusy(false); }
  };

  const accent = cfg.accent === 'pink' ? 'border-pink-500/20 bg-pink-500/5' :
                 cfg.accent === 'cyan' ? 'border-cyan-500/20 bg-cyan-500/5' :
                 'border-blue-500/20 bg-blue-500/5';
  const accentText = cfg.accent === 'pink' ? 'text-pink-300' : cfg.accent === 'cyan' ? 'text-cyan-300' : 'text-blue-300';
  const accentBtn = cfg.accent === 'pink' ? 'bg-pink-600 hover:bg-pink-500' : cfg.accent === 'cyan' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-blue-600 hover:bg-blue-500';

  return (
    <div className={`rounded-xl border ${accent} mb-3 overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2 text-left">
          <span>{cfg.icon}</span>
          <div>
            <div className="text-xs font-bold text-white">{cfg.label} inspiration</div>
            <div className="text-[10px] text-white/60">
              {brief ? <>Léna draws from <strong className={accentText}>@{brief.handle}</strong></> : `Set a ${cfg.label} reference Léna will quietly draw style and tone from`}
            </div>
          </div>
        </div>
        <span className="text-white/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-white/10 pt-3">
          {brief ? (
            <div className="space-y-2">
              <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-[11px] text-white/80 space-y-1.5">
                {brief.visual_style && <div><strong className={accentText}>Style:</strong> {brief.visual_style}</div>}
                {brief.tone && <div><strong className={accentText}>Tone:</strong> {brief.tone}</div>}
                {brief.palette_hints?.length > 0 && <div><strong className={accentText}>Palette:</strong> {brief.palette_hints.join(', ')}</div>}
                {brief.composition_hints?.length > 0 && <div><strong className={accentText}>Composition:</strong> {brief.composition_hints.join(' · ')}</div>}
                {brief.ambiance && <div><strong className={accentText}>Ambiance:</strong> {Array.isArray(brief.ambiance) ? brief.ambiance.join(', ') : brief.ambiance}</div>}
                {brief.domaine && <div><strong className={accentText}>Domaine:</strong> {Array.isArray(brief.domaine) ? brief.domaine.join(', ') : brief.domaine}</div>}
                {brief.summary && <div className="text-white/70">{brief.summary}</div>}
                {brief.notes && <div className="text-white/60 text-[10px]">{brief.notes}</div>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={removeBrief} disabled={busy} className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1 disabled:opacity-50">Remove</button>
                <button onClick={() => { setBrief(null); setHandle(''); }} className="text-[10px] text-white/50 hover:text-white px-2 py-1">Change</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={handle}
                  onChange={e => setHandle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                  placeholder={cfg.placeholder}
                  className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/30"
                />
                <button onClick={submit} disabled={busy || !handle.trim()} className={`px-4 py-2 ${accentBtn} text-white text-xs font-bold rounded disabled:opacity-50`}>
                  {busy ? '...' : 'Analyse'}
                </button>
              </div>
              {error && <p className="text-[10px] text-amber-400">{error}</p>}
              <p className="text-[10px] text-white/40">
                {cfg.supported
                  ? `Léna will analyse 6 recent posts and adopt the palette + tone (without copying).`
                  : `${cfg.label} live analyser arrives soon — saving your reference now means Léna can use it the day the feature ships.`}
              </p>
            </>
          )}

          {/* Paste a viral URL → extract its hook (safe oEmbed, no scraping).
              The more URLs fed, the smarter Léna's auto hooks get. */}
          {network !== 'linkedin' && (
            <div className="mt-2 pt-3 border-t border-white/10 space-y-2">
              <div className="text-[10px] font-bold text-white/80">
                {en ? '🪝 Paste a viral video URL → extract its hook' : '🪝 Colle l\'URL d\'une vidéo virale → extrais son hook'}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hookUrl}
                  onChange={e => setHookUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') extractHook(); }}
                  placeholder={network === 'tiktok' ? 'https://www.tiktok.com/@.../video/...' : 'https://www.instagram.com/reel/...'}
                  className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/30"
                />
                <button onClick={extractHook} disabled={hookBusy || !hookUrl.trim()} className={`px-4 py-2 ${accentBtn} text-white text-xs font-bold rounded disabled:opacity-50`}>
                  {hookBusy ? '...' : (en ? 'Extract' : 'Extraire')}
                </button>
              </div>
              {hookNeedCaption && (
                <textarea
                  value={hookCaption}
                  onChange={e => setHookCaption(e.target.value)}
                  placeholder={en ? 'Paste the post caption here too…' : 'Colle aussi la légende du post ici…'}
                  rows={2}
                  className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/30"
                />
              )}
              {hookErr && <p className="text-[10px] text-amber-400">{hookErr}</p>}
              {hookRes && (
                <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-[11px] text-white/80 space-y-1.5">
                  {hookRes.source_hook && <div><strong className={accentText}>{en ? 'Source hook:' : 'Hook source :'}</strong> "{hookRes.source_hook}"</div>}
                  {hookRes.formula && <div><strong className={accentText}>{en ? 'Formula:' : 'Formule :'}</strong> {hookRes.formula}</div>}
                  {hookRes.why && <div className="text-white/60">{hookRes.why}</div>}
                  {hookRes.adapted_hook && <div className="mt-1 pt-1.5 border-t border-white/10"><strong className={accentText}>{en ? 'For you:' : 'Pour toi :'}</strong> "{hookRes.adapted_hook}"</div>}
                  <div className="text-[9px] text-white/40">{en ? 'Saved — Léna will draw from it on your next reels.' : 'Enregistré — Léna s\'en inspirera sur tes prochains reels.'}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Backwards-compatible alias for the original IG-only entry point.
function IgInspirationBox() {
  return <InspirationBox network="instagram" />;
}
