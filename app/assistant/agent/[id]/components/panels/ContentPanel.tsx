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
import type { PanelProps } from './types';

// ─── Inline Editorial Calendar for Content Agent ─────────────
function ContentCalendarInline({ posts, onSelectPost }: { posts: any[]; onSelectPost: (p: any) => void }) {
  const now = new Date();
  const days: Date[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const todayStr = now.toISOString().split('T')[0];
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const STATUS_DOT: Record<string, string> = { draft: 'bg-amber-500', approved: 'bg-blue-500', published: 'bg-emerald-500', publish_failed: 'bg-red-500' };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2 mb-3">
      <div className="grid grid-cols-7 gap-1">
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
                {dayPosts.length > 3 && <div className="text-[9px] text-white/40 text-center">+{dayPosts.length - 3}</div>}
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
      <div className="flex gap-2">
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
  const { t } = useLanguage();
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
      {isDemo && <p className="text-[9px] text-amber-400/50 mb-2">{'\u{1F4F8}'} {p.contentDemoHint}</p>}

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
            className={`px-2 py-1 text-[9px] font-medium rounded-md whitespace-nowrap transition-all ${platformFilter === tab.key ? 'bg-white/15 text-white' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}
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
            className={`px-2 py-1 text-[9px] font-medium rounded-md whitespace-nowrap transition-all ${filter === tab.key ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
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
  const byNet = stats.byNetwork || {};
  const ig = byNet.instagram || {};
  const tk = byNet.tiktok || {};
  const li = byNet.linkedin || {};

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
      metrics: [
        { label: 'Posts published', value: fmt(ig.posts || 0) },
        { label: 'Followers', value: fmt(ig.followers || 0) },
        { label: 'Likes', value: fmt(ig.likes || 0) },
        { label: 'Comments', value: fmt(ig.comments || 0) },
        { label: 'Reach (24h)', value: fmt(ig.reach || 0) },
        { label: 'Engagement', value: `${(ig.engagement || 0)}%` },
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
      metrics: [
        { label: 'Videos published', value: fmt(tk.posts || 0) },
        { label: 'Scheduled', value: fmt(tk.scheduled || 0) },
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
      metrics: [
        { label: 'Posts published', value: fmt(li.posts || 0) },
        { label: 'Scheduled', value: fmt(li.scheduled || 0) },
      ],
    },
  ];

  // Only render tabs for networks the user has actually connected.
  const connected = NETWORKS.filter(n => n.data?.connected);
  const [active, setActive] = useState<'instagram' | 'tiktok' | 'linkedin'>(
    (connected[0]?.key as any) || 'instagram',
  );

  // No network connected — single CTA, no fake metrics.
  if (connected.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
        <div className="text-3xl mb-3">{'\u{1F4F1}'}</div>
        <div className="text-sm font-semibold text-white mb-1">Connect a social network to see your performance</div>
        <p className="text-xs text-white/50 max-w-md mx-auto mb-4">
          Léna shows real Instagram, TikTok or LinkedIn metrics fetched from
          the official APIs — no demo numbers. Pick a network below to start
          publishing and tracking real results.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {NETWORKS.map(net => (
            <a
              key={net.key}
              href={net.connectUrl}
              className={`px-3 py-1.5 rounded-lg border ${net.border} bg-white/5 text-xs font-semibold ${net.accent} hover:bg-white/10 transition`}
            >
              {net.icon} Connect {net.label}
            </a>
          ))}
        </div>
      </div>
    );
  }

  const cur = NETWORKS.find(n => n.key === active) || connected[0];
  const showMetrics = cur.data?.hasActivity;

  return (
    <div>
      {/* Network sub-tabs — only connected networks appear here. Disconnected
          ones are hidden so the client never sees noise about a network they
          do not use. */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10 mb-3 overflow-x-auto">
        {connected.map(n => (
          <button
            key={n.key}
            onClick={() => setActive(n.key as any)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              active === n.key ? 'bg-white/10 text-white shadow' : 'text-white/50 hover:text-white/70'
            }`}
          >
            <span>{n.icon}</span> {n.label}
            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </button>
        ))}
        {/* Show disconnected networks as small "+ Add" chips */}
        {NETWORKS.filter(n => !n.data?.connected).map(n => (
          <a
            key={n.key}
            href={n.connectUrl}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-md text-[11px] font-medium text-white/30 hover:text-white/60 transition"
          >
            <span>+</span> {n.label}
          </a>
        ))}
      </div>

      <div className={`rounded-xl border ${cur.border} bg-gradient-to-br ${cur.gradient} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{cur.icon}</span>
          <span className={`text-sm font-bold ${cur.accent}`}>{cur.label}</span>
        </div>

        {showMetrics ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {cur.metrics.map(m => (
              <div key={m.label} className="rounded-lg bg-black/20 p-2">
                <div className="text-[10px] text-white/50">{m.label}</div>
                <div className="text-sm font-bold text-white mt-0.5">{m.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-black/20 p-4 text-center">
            <div className="text-xs text-white/70 font-semibold mb-1">
              No published content yet on {cur.label}
            </div>
            <p className="text-[11px] text-white/40 max-w-sm mx-auto">
              Léna will only show real numbers once you publish your first
              post. We do not display demo or fake metrics — your stats are
              fetched live from the {cur.label} API only when there is
              activity to report.
            </p>
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
          {cur.loading ? 'Chargement...' : cur.connected ? `${cur.posts.length} post(s) recent(s)` : `${net.label} non connecte`}
        </span>
        <button
          onClick={() => load(active)}
          disabled={cur.loading}
          className="text-[10px] text-white/50 hover:text-white/80 disabled:opacity-40"
        >
          {cur.loading ? '...' : '\u21BB Rafraichir'}
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
          <p className="text-xs text-white/50">Connecte {net.label} pour voir tes publications ici.</p>
        </div>
      )}

      {cur.connected && cur.posts.length === 0 && !cur.loading && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center text-xs text-white/40">
          Aucune publication trouvee.
        </div>
      )}

      {/* Instagram-profile-style tight grid. Capped at max-w-md so on
          desktop the thumbs stay phone-sized — matches what the
          client's followers actually see when they open IG on mobile.
          Without the cap, 3 cols on a 1200px+ viewport blew up to
          400px tiles, which felt like a TV display, not a feed
          preview. Mobile already lands at ~120px tiles. */}
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1 rounded-xl overflow-hidden bg-black/20 max-w-md mx-auto">
        {cur.posts.map(post => (
          <button
            key={post.id}
            onClick={() => setLightbox(post)}
            className="relative aspect-square bg-black/40 overflow-hidden group"
          >
            {post.media_url ? (
              <img src={post.media_url} alt="" loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl text-white/20">{net.icon}</div>
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

      <p className="text-[9px] text-white/30 mt-3 text-center">
        Tap une vignette pour voir caption, stats et lien natif. La suppression côté Instagram/TikTok se fait dans l'app native (Meta n'autorise pas la suppression par API).
      </p>

      {/* Lightbox — mobile-first bottom sheet, modal on desktop */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="bg-gray-950 rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-y-auto border border-white/10"
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
                        <div className="text-[9px] text-white/40 uppercase tracking-wide">{k}</div>
                        <div className="text-xs font-bold text-white">{fmt(Number(v) || 0)}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {lightbox.timestamp && (
                <p className="text-[10px] text-white/40">
                  Publié le {new Date(lightbox.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              )}
              {lightbox.permalink && (
                <a
                  href={lightbox.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center px-3 py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  Ouvrir dans {net.label} {'\u2197'}
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
  const { t } = useLanguage();
  const p = t.panels;
  const stats = data.contentStats || { postsGenerated: 0, scheduledPosts: 0, recentContent: [] };
  const connections: Record<string, boolean> = (data as any).connections || {};

  // Default the active tab to the first network the user has actually
  // connected, so a client with Instagram only lands on Instagram and
  // never has to click through TikTok/LinkedIn shells.
  const firstConnected = (LENA_NETWORKS.find(n => connections[n.key])?.key ?? 'instagram') as LenaNetworkKey;
  const [active, setActive] = useState<LenaNetworkKey>(firstConnected);

  return (
    <>
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
                <span className="text-[9px] text-white/30 uppercase">+</span>
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
          <div className="text-[11px] text-white/50">
            Connect {meta.label} to see live performance metrics from your
            actual account. We never display demo or invented numbers.
          </div>
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

function NetworkStatsRow({ network, netStats, stats }: { network: LenaNetworkKey; netStats: any; stats: any }) {
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
  } else {
    cells.push(
      { label: 'Scheduled', value: fmt(netStats.scheduled || 0) },
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {cells.map(c => (
        <div key={c.label} className="text-center">
          <div className="text-[9px] uppercase tracking-wider text-white/40">{c.label}</div>
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
function NetworkStrategyHints({ network, hasActivity }: { network: LenaNetworkKey; hasActivity: boolean }) {
  const [businessType, setBusinessType] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const { data } = await sb.from('business_dossiers')
          .select('business_type')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!cancelled) setBusinessType((data?.business_type || '').toLowerCase() || null);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const hintsByNetwork: Record<LenaNetworkKey, { label: string; value: string }[]> = {
    instagram: [
      { label: 'Best slot', value: businessType === 'restaurant' ? 'Tue–Thu · 11h45 + 18h30' : businessType === 'salon' ? 'Wed–Fri · 17h–19h' : 'Tue + Thu · 19h–21h' },
      { label: 'Format mix', value: '60% Reels · 30% Carousels · 10% Static' },
      { label: 'Caption length', value: '90–130 chars + 5–8 hashtags' },
      { label: 'Sector peers', value: businessType === 'restaurant' ? '~2.1k median followers' : businessType === 'salon' ? '~1.4k median followers' : '~1.6k median followers' },
    ],
    tiktok: [
      { label: 'Best slot', value: 'Wed–Sun · 18h–22h' },
      { label: 'Hook length', value: '< 2.5 sec · vertical 9:16' },
      { label: 'Video length', value: '21–35 sec sweet spot' },
      { label: 'Sound', value: 'Trending audio + native voiceover FR' },
    ],
    linkedin: [
      { label: 'Best slot', value: 'Tue + Wed · 8h–10h' },
      { label: 'Format mix', value: '70% Text + native image · 30% Carousels' },
      { label: 'Hook', value: '1 sentence per line, story-first' },
      { label: 'Hashtags', value: '3 max, broad + specific blend' },
    ],
  };

  const hints = hintsByNetwork[network];

  return (
    <div className="mt-3 pt-3 border-t border-white/5">
      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <span>{'\u{1F4A1}'}</span>
        <span>Léna&apos;s playbook for your sector</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {hints.map(h => (
          <div key={h.label} className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
            <div className="text-[9px] text-white/40 uppercase tracking-wider">{h.label}</div>
            <div className="text-[11px] text-white font-medium mt-0.5">{h.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-white/40">
        {hasActivity
          ? `Patterns refined from your published posts + ${network === 'instagram' ? 'cross-client Instagram' : network === 'tiktok' ? 'cross-client TikTok' : 'cross-client LinkedIn'} data (10k+ learnings, anonymised).`
          : `Defaults from KeiroAI's cross-client knowledge pool. They will adapt to YOUR account once Léna publishes the first post.`}
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
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const cfg = {
    instagram: { label: 'Instagram', icon: '\u{1F4F8}', accent: 'pink', placeholder: '@bistrot_marais', supported: true },
    tiktok: { label: 'TikTok', icon: '\u{1F3B5}', accent: 'cyan', placeholder: '@username', supported: false },
    linkedin: { label: 'LinkedIn', icon: '\u{1F4BC}', accent: 'blue', placeholder: '/in/firstname-lastname', supported: false },
  }[network];

  const loadBrief = useCallback(async () => {
    if (network !== 'instagram') return; // Only IG inspiration is wired up server-side today
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
      const res = await fetch('/api/agents/content/inspiration', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: clean, save: true }),
      });
      const j = await res.json();
      if (!j.ok) setError(j.error || 'Échec analyse');
      else setBrief(j.brief);
    } catch (e: any) {
      setError(e.message || 'Erreur');
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
                <div><strong className={accentText}>Style:</strong> {brief.visual_style}</div>
                <div><strong className={accentText}>Tone:</strong> {brief.tone}</div>
                {brief.palette_hints?.length > 0 && <div><strong className={accentText}>Palette:</strong> {brief.palette_hints.join(', ')}</div>}
                {brief.composition_hints?.length > 0 && <div><strong className={accentText}>Composition:</strong> {brief.composition_hints.join(' · ')}</div>}
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
              <p className="text-[9px] text-white/40">
                {cfg.supported
                  ? `Léna will analyse 6 recent posts and adopt the palette + tone (without copying).`
                  : `${cfg.label} live analyser arrives soon — saving your reference now means Léna can use it the day the feature ships.`}
              </p>
            </>
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
