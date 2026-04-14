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
import { SocialConnectBanners } from './SharedBanners';
import { NetworkAutoModeToggles } from './AutoModeToggle';
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
              <div className={`text-center text-[8px] ${isToday ? 'text-purple-400 font-bold' : 'text-white/30'}`}>{dayNames[d.getDay()]}</div>
              <div className={`text-center text-[10px] font-bold mb-1 ${isToday ? 'text-purple-400' : 'text-white/50'}`}>{d.getDate()}</div>
              <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
                {dayPosts.slice(0, 3).map((p, j) => (
                  <button key={j} onClick={() => onSelectPost(p)} className="w-full aspect-square rounded overflow-hidden bg-white/5 hover:ring-1 hover:ring-purple-500/50 transition relative">
                    {p.visual_url ? <img src={p.visual_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[7px] text-white/30">{p.format === 'reel' ? '\uD83C\uDFAC' : '\uD83D\uDCDD'}</div>}
                    <div className={`absolute top-0 right-0 w-1.5 h-1.5 rounded-full ${STATUS_DOT[p.status] || 'bg-gray-500'}`} />
                  </button>
                ))}
                {dayPosts.length > 3 && <div className="text-[7px] text-white/20 text-center">+{dayPosts.length - 3}</div>}
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
        <span className="text-xs font-medium text-white/70">Un sujet a mettre en avant cette semaine ?</span>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={direction}
          onChange={e => setDirection(e.target.value)}
          placeholder="Ex: Notre nouveau menu, une promo, un evenement..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
        />
        <button
          onClick={save}
          disabled={!direction.trim() || direction === existing}
          className={`px-3 py-2 text-xs font-bold rounded-lg transition min-h-[36px] ${saved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-600 text-white hover:bg-purple-500'} disabled:opacity-30`}
        >
          {saved ? '\u2713' : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}

// Content workflow: fetch posts by status, allow approve/skip/schedule — Instagram grid style
function ContentWorkflow({ isConnected }: { isConnected?: boolean }) {
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
        <p className="text-xs text-white/50 mt-2">Aucun post pour le moment</p>
        <p className="text-[10px] text-white/30 mt-1">Clique sur {'\u26A1'} Lancer une campagne pour que Lena commence a creer du contenu !</p>
      </div>
    );
  }

  // Apply platform filter
  const platformFiltered = platformFilter === 'all' ? displayPosts : displayPosts.filter((p: any) => (p.platform || 'instagram') === platformFilter);
  const platformCounts = displayPosts.reduce((acc: Record<string, number>, p: any) => { const pl = p.platform || 'instagram'; acc[pl] = (acc[pl] || 0) + 1; return acc; }, {});

  return (
    <div>
      {isDemo && <p className="text-[9px] text-amber-400/50 mb-2">{'\u{1F4F8}'} Apercu — connecte tes reseaux pour voir tes vrais posts</p>}

      {/* Generation in progress indicator */}
      {generating && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg animate-pulse">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400" />
          <span className="text-xs text-purple-300">Post en cours de generation... Il apparaitra ici dans quelques secondes</span>
        </div>
      )}

      {/* Calendar + gallery removed — everything in Planning tab */}

      {/* Gallery removed — use Planning tab. Hidden below to keep state/logic intact */}
      <div style={{ display: 'none' }}>
      {/* Platform filter */}
      <div className="flex gap-1 mb-1.5 overflow-x-auto">
        {[
          { key: 'all', label: 'Tous', icon: '' },
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
          { key: 'all', label: `Tous (${platformFiltered.length})` },
          { key: 'draft', label: `Brouillons (${pCounts.draft || 0})` },
          { key: 'approved', label: `En attente (${pCounts.approved || 0})` },
          { key: 'published', label: `Publies (${pCounts.published || 0})` },
          ...((pCounts.publish_failed || 0) > 0 ? [{ key: 'publish_failed', label: `Echec (${pCounts.publish_failed})` }] : []),
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
            <div className="absolute bottom-0.5 left-0.5 text-[7px] font-bold text-white/60 bg-black/40 px-1 rounded">
              {post.platform === 'tiktok' ? 'TT' : post.platform === 'linkedin' ? 'LI' : 'IG'}
            </div>
            {/* Scheduled date for approved posts */}
            {post.status === 'approved' && post.scheduled_date && (
              <div className="absolute bottom-0.5 right-0.5 text-[6px] text-white/50 bg-black/50 px-0.5 rounded">
                {post.scheduled_date.substring(5)}{post.scheduled_time ? ` ${post.scheduled_time}` : ''}
              </div>
            )}
            {/* Hover: reel/carousel indicator */}
            {(post.format === 'reel' || post.format === 'video') && (
              <div className="absolute top-1 left-1 text-[8px] text-white/70">{'\u{1F3AC}'}</div>
            )}
            {(post.format === 'carrousel' || post.format === 'carousel') && (
              <div className="absolute top-1 left-1 text-[8px] text-white/70">{'\u{1F4DA}'}</div>
            )}
          </button>
        ))}
      </div>

      {/* Voir plus / Voir moins */}
      {(filter === 'all' ? platformFiltered : platformFiltered.filter((p: any) => p.status === filter)).length > 12 && (
        <button onClick={() => setShowAll(!showAll)} className="w-full mt-2 py-2 text-center text-[10px] text-purple-400 hover:text-purple-300 transition flex items-center justify-center gap-1">
          {showAll ? '\u2191 Voir moins' : `\u2193 Voir plus (${(filter === 'all' ? platformFiltered : platformFiltered.filter((p: any) => p.status === filter)).length - 12} posts)`}
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

export function ContentPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const stats = data.contentStats || { postsGenerated: 0, scheduledPosts: 0, recentContent: [] };

  return (
    <>
      {/* Connect social networks — hide if already connected */}
      <SocialConnectBanners agentId="content" networks={['instagram', 'tiktok', 'linkedin']} connections={(data as any).connections} />

      {/* Auto mode toggles per network */}
      <div data-tour="auto-toggle">
        <NetworkAutoModeToggles agentId="content" />
      </div>

      {/* Content direction — client can guide what to publish */}
      <ContentDirectionInput />

      {/* Stories suggestion tip */}
      <div className="rounded-lg border border-purple-500/10 bg-purple-500/5 px-3 py-2 mb-3 flex items-center gap-2">
        <span className="text-sm">{'\u{1F4A1}'}</span>
        <p className="text-[10px] text-white/50">
          <strong className="text-purple-300">Astuce :</strong> Les Stories Instagram generent 2x plus de visites sur ton profil. Lena peut en creer automatiquement — active le format Stories dans les parametres.
        </p>
      </div>

      {/* Instagram KPIs */}
      <SectionTitle>Performance Instagram</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <KpiCard label="Posts publiés" value={fmt((stats as any).publishedPosts || stats.postsGenerated || 0)} gradientFrom="#8b5cf6" gradientTo="#6d28d9" />
        <KpiCard label="Likes total" value={fmt((stats as any).totalLikes || 0)} gradientFrom="#ec4899" gradientTo="#f43f5e" />
        <KpiCard label="Reach" value={fmt((stats as any).reach || 0)} gradientFrom="#06b6d4" gradientTo="#0891b2" />
        <KpiCard label="Engagement" value={`${((stats as any).accountsEngaged || 0)}%`} gradientFrom="#10b981" gradientTo="#059669" />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer un nouveau visuel
        </a>
        <a href="/library" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4DA}'} Ma galerie
        </a>
      </div>

      <SectionTitle>Production</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Posts generes" value={fmt(stats.postsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Programmés" value={fmt(stats.scheduledPosts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Cette semaine" value={fmt(stats.recentContent.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Visual: content type distribution */}
      <SectionTitle>Repartition du contenu</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={[
              { value: (stats.recentContent || []).filter(c => c.type === 'Reel' || c.type === 'reel').length, color: '#e879f9', label: 'Reels' },
              { value: (stats.recentContent || []).filter(c => c.type === 'Carousel' || c.type === 'carrousel').length, color: '#60a5fa', label: 'Carrousels' },
              { value: (stats.recentContent || []).filter(c => c.type === 'Post' || c.type === 'post').length, color: '#34d399', label: 'Posts' },
              { value: (stats.recentContent || []).filter(c => c.type === 'Story' || c.type === 'story').length, color: '#fbbf24', label: 'Stories' },
            ]}
            label={`${stats.postsGenerated}`}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={stats.postsGenerated} max={Math.max(stats.postsGenerated + stats.scheduledPosts, 1)} color={gradientFrom} label="Generes" />
          <ProgressBar value={stats.scheduledPosts} max={Math.max(stats.postsGenerated + stats.scheduledPosts, 1)} color={gradientTo} label="Programmés" />
        </div>
      </div>

      {/* Content workflow: prepared → validate → scheduled → published */}
      <div data-tour="content-workflow"><SectionTitle>File de contenu</SectionTitle>
      {stats.postsGenerated === 0 && !(data as any).connections?.instagram && (
        <PreviewBanner
          agentName="Lena"
          connectLabel="Connecter tes reseaux"
          connectUrl="/api/auth/instagram-oauth"
          claraMessage="Connecte Instagram pour que Lena commence a preparer tes posts. Une fois connecte, ton premier post sera genere en quelques secondes !"
          gradientFrom="#8b5cf6"
          gradientTo="#6d28d9"
        />
      )}
      {/* Launch campaign — inside content panel, above posts */}
      <div data-tour="launch-campaign" className="flex items-center gap-2 mb-3">
        <button
          onClick={() => { try { (window as any).__openCampaignWizard?.(); } catch {} }}
          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/20 transition-all min-h-[44px] flex items-center gap-2"
        >
          <span>{'\u26A1'}</span> Lancer une campagne
        </button>
        {(data as any).connections?.instagram && <span className="text-[9px] text-emerald-400/50">{'\u2713'} Instagram connecte</span>}
      </div>
      <ContentWorkflow isConnected={!!(data as any).connections?.instagram} />

      </div>{/* close content-workflow data-tour */}

      {/* Calendar is inside ContentWorkflow (has access to setSelectedPost) */}

      {/* Instagram Comments moved to Jade (DM agent) via JadeTabs */}
    </>
  );
}
