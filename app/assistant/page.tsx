'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { getVisibleAgents, CLIENT_AGENTS, type ClientAgent } from '@/lib/agents/client-context';
import AgentCard from './components/AgentCard';
import AgentChatPanel, { type ChatMessage } from './components/AgentChatPanel';
import DossierBanner from './components/DossierBanner';
import ComingSoonBanner from './components/ComingSoonBanner';
import AgentTeams from './components/AgentTeams';
import WorkspaceCrm from './components/WorkspaceCrm';
import NotificationBell, { AgentNotifBadge } from './components/NotificationBell';
import InstagramTokenAlert from './components/InstagramTokenAlert';
import StrategyOnboarding from './components/StrategyOnboarding';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLanguage } from '@/lib/i18n/context';

// Translation key per agent id — falls back to the client-context `title`
// when no localised override is present (keeps legacy agents working).
const AGENT_TITLE_KEYS: Record<string, string> = {
  onboarding: 'agentTitleOnboarding',
  content: 'agentTitleContent',
  dm_instagram: 'agentTitleDmInstagram',
  email: 'agentTitleEmail',
  commercial: 'agentTitleCommercial',
  seo: 'agentTitleSeo',
  marketing: 'agentTitleMarketing',
  chatbot: 'agentTitleChatbot',
  retention: 'agentTitleRetention',
  comptable: 'agentTitleComptable',
  ads: 'agentTitleAds',
  rh: 'agentTitleRh',
  ceo: 'agentTitleCeo',
  whatsapp: 'agentTitleWhatsapp',
  linkedin: 'agentTitleLinkedin',
};

function getAgentTitle(agent: ClientAgent, notif: Record<string, string>): string {
  const key = AGENT_TITLE_KEYS[agent.id];
  if (key && notif[key]) return notif[key];
  return agent.title;
}

// ─── Sortable Agent Row for Team view (drag & drop) ────────
function SortableTeamAgentRow({ agent, avatars, agentStats: _agentStats, onClick, onChat, isActivated, onToggle, agentTitle, dragLabel, activeLabel, inactiveLabel }: {
  agent: ClientAgent; avatars: Record<string, string | null>; agentStats: any; onClick: () => void; onChat: () => void; isActivated?: boolean; onToggle?: () => void;
  agentTitle: string; dragLabel: string; activeLabel: string; inactiveLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: agent.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : 'auto' as any };

  return (
    <div ref={setNodeRef} style={style} {...attributes}
      className="rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-all overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Drag handle */}
        <div className="cursor-grab active:cursor-grabbing text-white/20 hover:text-white/50 transition" {...listeners} title={dragLabel}>⠿</div>
        <button onClick={onClick} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})`, padding: '2px' }}>
            <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
              {avatars[agent.id] ? (
                <img src={avatars[agent.id]!} alt={agent.displayName} className="w-full h-full object-cover scale-[1.15]" style={{ objectPosition: 'center 15%' }} />
              ) : (
                <span className="text-base">{agent.icon}</span>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white font-semibold text-xs">{agent.displayName}</div>
            <div className="text-gray-400 text-[10px] truncate">{agentTitle}</div>
          </div>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          className={`relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors ${isActivated ? 'bg-green-500/40' : 'bg-white/10'}`}
          title={isActivated ? activeLabel : inactiveLabel}
        >
          <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all ${isActivated ? 'left-[15px] bg-green-400' : 'left-[2px] bg-white/30'}`} />
        </button>
        <button onClick={onChat} className="text-white/30 hover:text-white/70 transition text-sm px-2 py-1.5 rounded-lg hover:bg-white/10">{'\u{1F4AC}'}</button>
      </div>
    </div>
  );
}

// ─── Sortable Agent Card (drag & drop) ──────────────────────

function SortableAgentCard({ agent, avatars, summary: _summary, onClick, isActivated, onToggle, agentTitle, dragLabel, activeLabel, inactiveLabel }: {
  agent: ClientAgent;
  avatars: Record<string, string | null>;
  summary: any;
  onClick: () => void;
  isActivated?: boolean;
  onToggle?: () => void;
  agentTitle: string;
  dragLabel: string;
  activeLabel: string;
  inactiveLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: agent.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto' as any,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="w-full rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.06] transition-all text-left overflow-hidden group relative">
        {/* Drag handle — top gradient bar */}
        <div
          className="h-2 cursor-grab active:cursor-grabbing hover:h-3 transition-all"
          style={{ background: `linear-gradient(90deg, ${agent.gradientFrom}, ${agent.gradientTo})` }}
          {...listeners}
          title={dragLabel}
        />
        {/* Clickable content → opens agent. Mini per-agent counters were
            removed here: they were showing 0 for most rows because our
            backend summary only hydrates a few agent-specific metrics,
            which looked broken. Card now stays clean — full metrics live
            in the agent's own workspace. */}
        <button onClick={onClick} className="w-full text-left p-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})`, padding: '2px' }}>
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                {avatars[agent.id] ? (
                  <img src={avatars[agent.id]!} alt={agent.displayName} className="w-full h-full object-cover scale-[1.15]" style={{ objectPosition: 'center 15%' }} />
                ) : (
                  <span className="text-base">{agent.icon}</span>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white font-bold text-xs truncate">{agent.displayName}</div>
              <div className="text-white/30 text-[9px] truncate">{agentTitle}</div>
            </div>
            {/* Activation toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
              className={`relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors ${isActivated ? 'bg-green-500/40' : 'bg-white/10'}`}
              title={isActivated ? activeLabel : inactiveLabel}
            >
              <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all ${isActivated ? 'left-[15px] bg-green-400' : 'left-[2px] bg-white/30'}`} />
            </button>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Types ─────────────────────────────────────────────────

interface AvatarMap {
  [agentId: string]: string | null;
}

// ─── Helpers ───────────────────────────────────────────────

function generateId(): string {
  return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// ─── Coming Soon Mode OFF — all agents show preview data with connect CTA ───
const COMING_SOON_MODE_DEFAULT = false;

// ─── Team definitions ──────────────────────────────────────
const TEAMS = [
  {
    name: 'Commercial',
    icon: '\uD83D\uDCBC',
    color: 'from-blue-500 to-cyan-500',
    description: 'Prospection, emails, DMs, chatbot',
    agentIds: ['commercial', 'email', 'dm_instagram', 'chatbot', 'whatsapp'],
  },
  {
    name: 'Visibilite',
    icon: '\uD83D\uDCF1',
    color: 'from-purple-500 to-violet-600',
    description: 'Contenu, SEO, TikTok, Google Maps',
    agentIds: ['content', 'seo', 'tiktok_comments', 'gmaps', 'linkedin'],
  },
  {
    name: 'Finance & Admin',
    icon: '\uD83C\uDFE6',
    color: 'from-amber-500 to-orange-500',
    description: 'Compta, RH, publicite',
    agentIds: ['comptable', 'rh', 'ads'],
  },
  {
    name: 'Strategie',
    icon: '\uD83E\uDDE0',
    color: 'from-pink-500 to-rose-500',
    description: 'Direction marketing & onboarding',
    agentIds: ['marketing', 'onboarding'],
  },
];

// ─── Main Page ─────────────────────────────────────────────

// ─── Planning Calendar ──────────────────────────────────────
function PlanningCalendar() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [weekOffset, setWeekOffset] = useState(0);

  // Calculate date range (2 weeks from offset)
  const now = new Date();
  const startDate = new Date(now.getTime() + weekOffset * 7 * 86400000);
  startDate.setDate(startDate.getDate() - startDate.getDay() + 1); // Monday
  const endDate = new Date(startDate.getTime() + 13 * 86400000); // 2 weeks

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/agents/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'calendar',
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
          }),
        });
        const data = await res.json();
        setPosts(data.posts || []);
      } catch {} finally { setLoading(false); }
    })();
  }, [weekOffset]);

  const days: Date[] = [];
  for (let i = 0; i < 14; i++) {
    days.push(new Date(startDate.getTime() + i * 86400000));
  }

  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const months = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
  const platforms = ['instagram', 'tiktok', 'linkedin'];
  const PLATFORM_ICONS: Record<string, string> = { instagram: '\uD83D\uDCF7', tiktok: '\uD83C\uDFB5', linkedin: '\uD83D\uDCBC' };
  const PLATFORM_COLORS: Record<string, string> = { instagram: '#E1306C', tiktok: '#00f2ea', linkedin: '#0A66C2' };
  const STATUS_DOT: Record<string, string> = { draft: 'bg-amber-500', approved: 'bg-blue-500', published: 'bg-emerald-500', publish_failed: 'bg-red-500' };

  const filtered = platformFilter === 'all' ? posts : posts.filter(p => (p.platform || 'instagram') === platformFilter);

  const getPostsForDay = (date: Date, platform?: string) => {
    const dateStr = date.toISOString().split('T')[0];
    return filtered.filter(p => {
      const match = p.scheduled_date === dateStr || (p.published_at && p.published_at.startsWith(dateStr));
      return match && (!platform || (p.platform || 'instagram') === platform);
    });
  };

  const today = new Date().toISOString().split('T')[0];

  const totalByPlatform = platforms.reduce((acc, p) => {
    acc[p] = posts.filter(post => (post.platform || 'instagram') === p).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-white font-bold text-sm">{'\uD83D\uDCC5'} Calendrier editorial</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(w => w - 2)} className="px-2 py-1 bg-white/10 rounded-lg text-xs text-white/60 hover:bg-white/15">{'\u2190'}</button>
          <button onClick={() => setWeekOffset(0)} className="px-2 py-1 bg-white/10 rounded-lg text-[10px] text-white/40 hover:bg-white/15">Aujourd'hui</button>
          <button onClick={() => setWeekOffset(w => w + 2)} className="px-2 py-1 bg-white/10 rounded-lg text-xs text-white/60 hover:bg-white/15">{'\u2192'}</button>
        </div>
      </div>

      {/* Platform filter */}
      <div className="flex gap-1 flex-wrap">
        <button onClick={() => setPlatformFilter('all')} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${platformFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
          Tous ({posts.length})
        </button>
        {platforms.map(p => (
          <button key={p} onClick={() => setPlatformFilter(p)} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${platformFilter === p ? 'text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`} style={platformFilter === p ? { backgroundColor: PLATFORM_COLORS[p] + '40', color: PLATFORM_COLORS[p] } : {}}>
            {PLATFORM_ICONS[p]} {p.charAt(0).toUpperCase() + p.slice(1)} ({totalByPlatform[p] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>
      ) : (
        <>
          {/* Calendar grid */}
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] sm:min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="w-16 px-2 py-2 text-[10px] text-white/30 font-medium text-left"></th>
                    {days.map((d, i) => {
                      const isToday = d.toISOString().split('T')[0] === today;
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <th key={i} className={`px-1 py-2 text-center ${isToday ? 'bg-purple-500/10' : isWeekend ? 'bg-white/[0.01]' : ''}`}>
                          <div className={`text-[9px] ${isToday ? 'text-purple-400 font-bold' : 'text-white/30'}`}>{dayNames[(d.getDay() + 6) % 7]}</div>
                          <div className={`text-[11px] font-bold ${isToday ? 'text-purple-400' : 'text-white/60'}`}>{d.getDate()}</div>
                          {(i === 0 || d.getDate() === 1) && <div className="text-[8px] text-white/20">{months[d.getMonth()]}</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(platformFilter === 'all' ? platforms : [platformFilter]).map(platform => (
                    <tr key={platform} className="border-b border-white/5">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px]">{PLATFORM_ICONS[platform]}</span>
                          <span className="text-[9px] text-white/40 uppercase tracking-wider">{platform.substring(0, 2).toUpperCase()}</span>
                        </div>
                      </td>
                      {days.map((d, i) => {
                        const dayPosts = getPostsForDay(d, platform);
                        const isToday = d.toISOString().split('T')[0] === today;
                        return (
                          <td key={i} className={`px-0.5 py-1 align-top ${isToday ? 'bg-purple-500/5' : ''}`}>
                            {dayPosts.length > 0 ? (
                              <div className="space-y-0.5">
                                {dayPosts.slice(0, 3).map((post, j) => (
                                  <div key={j} className="group relative">
                                    {post.visual_url ? (
                                      <div className="w-full aspect-square rounded-md overflow-hidden border border-white/10">
                                        <img src={post.visual_url} alt="" className="w-full h-full object-cover" />
                                        <div className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${STATUS_DOT[post.status] || 'bg-gray-500'}`} />
                                      </div>
                                    ) : (
                                      <div className={`w-full aspect-square rounded-md border border-white/10 flex items-center justify-center text-[8px] text-white/30 ${STATUS_DOT[post.status]?.replace('bg-', 'bg-') + '/10' || 'bg-white/5'}`}>
                                        {post.format === 'reel' ? '\uD83C\uDFAC' : post.format === 'story' ? '\uD83D\uDCF1' : '\uD83D\uDCDD'}
                                      </div>
                                    )}
                                    {/* Tooltip on hover */}
                                    <div className="hidden group-hover:block absolute z-50 bottom-full left-0 mb-1 w-40 bg-gray-900 border border-white/20 rounded-lg p-2 shadow-xl">
                                      <div className="text-[9px] text-white/80 font-medium line-clamp-2">{post.hook || post.caption?.substring(0, 60) || 'Sans titre'}</div>
                                      <div className="text-[8px] text-white/30 mt-1">{post.format} | {post.status}{post.scheduled_time ? ` | ${post.scheduled_time}` : ''}</div>
                                    </div>
                                  </div>
                                ))}
                                {dayPosts.length > 3 && <div className="text-[8px] text-white/20 text-center">+{dayPosts.length - 3}</div>}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[9px] text-white/30">
            <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />Brouillon</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />En attente</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Publie</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Echec</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { t } = useLanguage();
  const nt = (t as any).notif || {}; // i18n keys for this page live under notif

  // Auth & profile
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [userPlan, setUserPlan] = useState<string>('gratuit');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [loading, setLoading] = useState(true);

  // Coming soon only for free users without active trial
  // Admin, paying users, and trial users all see active agents
  const hasPaidPlan = !['gratuit', 'free', ''].includes(userPlan);
  const COMING_SOON_MODE = COMING_SOON_MODE_DEFAULT && !isAdmin && !hasPaidPlan && !isTrialActive;

  // Agent grid
  const [agents, setAgents] = useState<ClientAgent[]>([]);
  // Notification badges per agent
  const [notifBadges, setNotifBadges] = useState<Record<string, number>>({});
  const [totalNotifs, setTotalNotifs] = useState(0);
  const [avatars, setAvatars] = useState<AvatarMap>({});

  // Multi-chat state
  interface ChatInstance {
    agent: ClientAgent;
    messages: ChatMessage[];
    isLoading: boolean;
    historyLoaded: boolean;
    minimized: boolean;
  }
  const [chats, setChats] = useState<Record<string, ChatInstance>>({});
  const [activeChatId, setActiveChatId] = useState<string | null>(null); // agent id of open chat

  // Notify modal state
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifySubmitted, setNotifySubmitted] = useState(false);

  // AMI dashboard stats
  const [amiStats, setAmiStats] = useState<{
    postsThisWeek: number; avgEngagement: number; avgViews: number;
    avgLikes: number; topCategory: string; improvement: number; totalPosts: number;
  } | null>(null);
  const [amiChartData, setAmiChartData] = useState<{
    engagementTrend: { date: string; views: number; likes: number; engagement: number }[];
  } | null>(null);

  // Publishing streak
  const [streak, setStreak] = useState(0);

  // View tab
  const [viewTab, setViewTab] = useState<'suivi' | 'equipe' | 'agent' | 'campagnes' | 'pipeline' | 'offre' | 'planning'>('suivi');

  // Team agent ordering (per team) — initialized from localStorage via useEffect
  const [teamOrders, setTeamOrders] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (agents.length === 0) return;
    const TEAMS_KEYS = ['commercial', 'visibilite', 'finance', 'strategie'];
    const newOrders: Record<string, string[]> = {};
    TEAMS_KEYS.forEach(teamKey => {
      try {
        const stored = localStorage.getItem(`keiro_team_order_${teamKey}`);
        if (stored) { newOrders[teamKey] = JSON.parse(stored); }
      } catch {}
    });
    if (Object.keys(newOrders).length > 0) setTeamOrders(prev => ({ ...prev, ...newOrders }));
  }, [agents]);
  const handleTeamDragEnd = useCallback((teamKey: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTeamOrders(prev => {
      const order = prev[teamKey] || [];
      const oldIndex = order.indexOf(active.id as string);
      const newIndex = order.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const newOrder = arrayMove(order, oldIndex, newIndex);
      try { localStorage.setItem(`keiro_team_order_${teamKey}`, JSON.stringify(newOrder)); } catch {}
      return { ...prev, [teamKey]: newOrder };
    });
  }, []);

  // Dashboard summary data
  const [summary, setSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Agent activation states (auto_mode per agent)
  const [agentActivations, setAgentActivations] = useState<Record<string, boolean>>({});

  // Agent questions/notifications
  const [agentQuestions, setAgentQuestions] = useState<Array<{ agent: string; agent_name: string; question: string; id: string }>>([]);

  // Agent order (drag & drop)
  const [agentOrder, setAgentOrder] = useState<string[]>([]);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Init agent order from agents list or localStorage
  useEffect(() => {
    if (agents.length === 0) return;
    const visible = agents.filter(a => a.visibility !== 'background');
    try {
      const stored = localStorage.getItem('keiro_agent_order');
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        // Merge: keep stored order, add new agents at end
        const merged = [...parsed.filter(id => visible.some(a => a.id === id)), ...visible.filter(a => !parsed.includes(a.id)).map(a => a.id)];
        setAgentOrder(merged);
        return;
      }
    } catch {}
    setAgentOrder(visible.map(a => a.id));
  }, [agents]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setAgentOrder(prev => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      const newOrder = arrayMove(prev, oldIndex, newIndex);
      try { localStorage.setItem('keiro_agent_order', JSON.stringify(newOrder)); } catch {}
      return newOrder;
    });
  }, []);

  // CRM expanded state
  const [crmExpanded, setCrmExpanded] = useState(false);

  // ─── Auth check ─────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('subscription_plan, company_name, company_description, website, target_audience, main_products, brand_tone, social_goals_monthly, content_themes, competitors, posting_frequency, is_admin, created_at, credits_expires_at')
          .eq('id', user.id)
          .single();

        if (profileData) {
          setProfile(profileData);
          setUserPlan(profileData.subscription_plan || 'gratuit');
          if (profileData.is_admin) setIsAdmin(true);

          // Check if user is in 7-day trial period
          const createdAt = new Date(profileData.created_at);
          const trialEnd = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
          const creditsExpiry = profileData.credits_expires_at ? new Date(profileData.credits_expires_at) : null;
          const now = new Date();
          if (now < trialEnd || (creditsExpiry && now < creditsExpiry)) {
            setIsTrialActive(true);
          }
        }
      }

      setLoading(false);
    }
    init();
  }, []);

  // ─── Load agents based on plan ──────────────────────────
  // During trial: all agents unlocked. After trial: by plan.
  useEffect(() => {
    const allUnlocked = isAdmin || isTrialActive;
    const visible = getVisibleAgents(allUnlocked ? 'agence' : userPlan, isAdmin);
    const amiIndex = visible.findIndex(a => a.id === 'marketing');
    if (amiIndex > 0) {
      const ami = visible.splice(amiIndex, 1)[0];
      visible.unshift(ami);
    }
    // Sort: active agents first, coming_soon last
    visible.sort((a, b) => {
      if (a.visibility === 'active' && b.visibility !== 'active') return -1;
      if (a.visibility !== 'active' && b.visibility === 'active') return 1;
      return 0;
    });
    setAgents(visible);
  }, [userPlan, isAdmin, isTrialActive]);

  // ─── Load AMI dashboard stats ───────────────────────────
  useEffect(() => {
    if (!user) return;
    async function loadStats() {
      try {
        const res = await fetch('/api/assistant/stats', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setAmiStats(data.stats);
            setAmiChartData(data.chartData);
          }
        }
      } catch { /* silent */ }
    }
    loadStats();
  }, [user]);

  // ─── Load publishing streak ─────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function loadStreak() {
      try {
        const res = await fetch('/api/assistant/streak', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) setStreak(data.streak || 0);
        }
      } catch { /* silent */ }
    }
    loadStreak();
  }, [user]);

  // ─── Load dashboard summary ─────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function loadSummary() {
      setSummaryLoading(true);
      try {
        const loc = typeof window !== 'undefined' ? (localStorage.getItem('keiro_language') || 'fr') : 'fr';
        const res = await fetch(`/api/agents/dashboard/summary?locale=${loc}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) setSummary(data);
        }
      } catch { /* silent */ }
      setSummaryLoading(false);
    }
    loadSummary();
    // Auto-refresh summary every 90s for real-time agent activity
    const interval = setInterval(loadSummary, 90000);
    return () => clearInterval(interval);
  }, [user]);

  // ─── Load agent activation states ───────────────────────
  useEffect(() => {
    if (!user || agents.length === 0) return;
    const loadActivations = async () => {
      const activations: Record<string, boolean> = {};
      try {
        const promises = agents.filter(a => a.visibility !== 'background').map(a =>
          fetch(`/api/agents/settings?agent_id=${a.id}`, { credentials: 'include' })
            .then(r => r.json())
            .then(d => { activations[a.id] = !!(d.settings?.auto_mode || d.settings?.setup_completed); })
            .catch(() => { activations[a.id] = false; })
        );
        await Promise.all(promises);
        setAgentActivations(activations);
      } catch {}
    };
    loadActivations();
  }, [user, agents]);

  const toggleAgentActivation = useCallback(async (agentId: string) => {
    const current = agentActivations[agentId] || false;
    const newState = !current;
    // Optimistic update
    setAgentActivations(prev => ({ ...prev, [agentId]: newState }));
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, auto_mode: newState, setup_completed: newState }),
      });
      // First activation → spotlight tutorial on agent page
      if (newState && !localStorage.getItem(`keiro_agent_activated_${agentId}`)) {
        localStorage.setItem(`keiro_agent_activated_${agentId}`, 'true');
        sessionStorage.setItem('keiro_show_spotlight', agentId);
        // Navigate to agent page so spotlight tour plays
        router.push(`/assistant/agent/${agentId}`);
      }
    } catch {
      // Revert on error
      setAgentActivations(prev => ({ ...prev, [agentId]: current }));
    }
  }, [agentActivations]);

  // ─── Load agent questions (notifications) ──────────────
  useEffect(() => {
    if (!user) return;
    async function loadQuestions() {
      try {
        const supabase = (await import('@/lib/supabase/client')).supabaseBrowser();
        const { data } = await supabase
          .from('agent_logs')
          .select('id, agent, data')
          .eq('action', 'question_to_client')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5);
        if (data) {
          setAgentQuestions(data.map((q: any) => ({
            id: q.id,
            agent: q.agent,
            agent_name: q.data?.agent_name || q.agent,
            question: q.data?.question || '',
          })));
        }
      } catch { /* silent */ }
    }
    loadQuestions();
  }, [user]);

  // ─── Load notification badges ────────────────────────────
  useEffect(() => {
    if (!user) return;
    const loadNotifs = () => {
      fetch('/api/notifications', { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          if (d.badges) setNotifBadges(d.badges);
          setTotalNotifs(d.totalPending || d.unreadCount || 0);
        }).catch(() => {});
    };
    loadNotifs();
    const interval = setInterval(loadNotifs, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [user]);

  // ─── Load avatars ───────────────────────────────────────
  useEffect(() => {
    async function loadAvatars() {
      try {
        const res = await fetch('/api/admin/avatars');
        const data = await res.json();
        if (data.avatars) {
          const map: AvatarMap = {};
          for (const a of data.avatars) {
            map[a.id] = a.avatar_3d_url || a.avatar_url || null;
          }
          setAvatars(map);
        }
      } catch { /* silent */ }
    }
    loadAvatars();
  }, []);

  // ─── Load chat history for a chat instance ─────────────
  const loadChatHistory = useCallback(async (agentId: string) => {
    if (COMING_SOON_MODE || !user) return;
    try {
      const res = await fetch(`/api/agents/client-chat?agent_id=${agentId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.messages && Array.isArray(data.messages)) {
          const msgs: ChatMessage[] = data.messages.map((m: any, i: number) => ({
            id: m.id || `hist_${i}`,
            role: m.role,
            content: m.content,
            created_at: m.created_at || m.timestamp || new Date().toISOString(),
          }));
          setChats(prev => ({
            ...prev,
            [agentId]: prev[agentId] ? { ...prev[agentId], messages: msgs, historyLoaded: true } : prev[agentId],
          }));
        }
      }
    } catch { /* silent */ }
  }, [COMING_SOON_MODE, user]);

  // ─── Select agent (navigate to workspace) ─────────────
  const handleSelectAgent = useCallback((agent: ClientAgent) => {
    if (COMING_SOON_MODE) {
      // Open chat in coming-soon mode
      setChats(prev => ({
        ...prev,
        [agent.id]: prev[agent.id] || { agent, messages: [], isLoading: false, historyLoaded: false, minimized: false },
      }));
      setActiveChatId(agent.id);
      return;
    }
    // All agents navigate to workspace (preview mode handles unconnected state)
    router.push(`/assistant/agent/${agent.id}`);
  }, [COMING_SOON_MODE, router]);

  // ─── Open chat with agent ─────────────────────────────
  const handleOpenChat = useCallback((agent: ClientAgent) => {
    const existing = chats[agent.id];
    if (existing) {
      // Re-open existing chat
      setChats(prev => ({ ...prev, [agent.id]: { ...prev[agent.id], minimized: false } }));
      setActiveChatId(agent.id);
    } else {
      // Create new chat instance
      setChats(prev => ({
        ...prev,
        [agent.id]: { agent, messages: [], isLoading: false, historyLoaded: false, minimized: false },
      }));
      setActiveChatId(agent.id);
      loadChatHistory(agent.id);
    }
  }, [chats, loadChatHistory]);

  // ─── Minimize chat ────────────────────────────────────
  const handleMinimizeChat = useCallback((agentId: string) => {
    setChats(prev => ({
      ...prev,
      [agentId]: { ...prev[agentId], minimized: true },
    }));
    setActiveChatId(null);
  }, []);

  // ─── Close chat (remove it) ───────────────────────────
  const handleCloseChat = useCallback((agentId: string) => {
    setChats(prev => {
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
    if (activeChatId === agentId) setActiveChatId(null);
  }, [activeChatId]);

  // ─── Restore minimized chat ───────────────────────────
  const handleRestoreChat = useCallback((agentId: string) => {
    setChats(prev => ({
      ...prev,
      [agentId]: { ...prev[agentId], minimized: false },
    }));
    setActiveChatId(agentId);
  }, []);

  const handleBack = useCallback(() => {
    if (activeChatId) {
      handleCloseChat(activeChatId);
    }
  }, [activeChatId, handleCloseChat]);

  // ─── Send message ─────────────────────────────────────
  const handleSendMessage = useCallback(async (text: string) => {
    if (!activeChatId || !text.trim()) return;
    const chat = chats[activeChatId];
    if (!chat) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setChats(prev => ({
      ...prev,
      [activeChatId]: { ...prev[activeChatId], messages: [...prev[activeChatId].messages, userMsg], isLoading: true },
    }));

    try {
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: activeChatId,
          message: text,
        }),
      });

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: res.ok
          ? ((await res.json()).message || 'Reponse recue.')
          : `Merci pour ton message ! Pour activer ${chat.agent.displayName}, demarre ton essai gratuit 7 jours sur keiroai.com/pricing`,
        created_at: new Date().toISOString(),
      };
      setChats(prev => ({
        ...prev,
        [activeChatId]: { ...prev[activeChatId], messages: [...prev[activeChatId].messages, assistantMsg], isLoading: false },
      }));
    } catch {
      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Oups, probleme de connexion. Verifie ta connexion internet et reessaie.',
        created_at: new Date().toISOString(),
      };
      setChats(prev => ({
        ...prev,
        [activeChatId]: { ...prev[activeChatId], messages: [...prev[activeChatId].messages, errorMsg], isLoading: false },
      }));
    }
  }, [activeChatId, chats]);

  // ─── Notify handler ───────────────────────────────────
  const handleNotifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyEmail.trim()) return;
    try {
      const stored = JSON.parse(localStorage.getItem('keiro_agent_notify_emails') || '[]');
      if (!stored.includes(notifyEmail)) {
        stored.push(notifyEmail);
        localStorage.setItem('keiro_agent_notify_emails', JSON.stringify(stored));
      }
    } catch { /* silent */ }
    setNotifySubmitted(true);
    setTimeout(() => {
      setShowNotifyModal(false);
      setNotifySubmitted(false);
      setNotifyEmail('');
    }, 2000);
  };

  // ─── Computed values ──────────────────────────────────
  const activeAgents = Object.values(agentActivations).filter(Boolean).length;
  const totalActions = summary?.teams
    ? Object.values(summary.teams).reduce((sum: number, t: any) => sum + (t?.totalActions ?? 0), 0)
    : 0;
  const totalProspects = summary?.crm?.total ?? 0;
  const totalClients = summary?.crm?.clients ?? 0;
  const conversionRate = summary?.crm?.conversionRate ?? 0;

  // ─── Loading state ────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c1a3a] pt-16 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400 mx-auto mb-4" />
          <p className="text-white/60 text-sm">Chargement de votre espace de travail...</p>
        </div>
      </div>
    );
  }

  // ─── Visitor mode (not logged in) — show agents in demo ──
  const isVisitor = !user;

  const claraAvatarUrl = avatars['onboarding'] || null;

  // ─── Main workspace layout ────────────────────────────
  return (
    <div className="min-h-screen bg-[#0c1a3a] pt-16">
      {/* Strategy onboarding popup — shows once for new paying clients */}
      <StrategyOnboarding />

      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:pb-8">

        {/* ═══ WORKSPACE HEADER ═══ */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <h1 className="text-white font-bold text-2xl lg:text-3xl">
                Espace de travail
              </h1>
              {isAdmin && (
                <>
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded-full border border-green-500/30">
                    ADMIN
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/agents/qa?mode=full', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ''}` } });
                        if (!res.ok) { alert('QA lancé via cron — vérifiez email'); return; }
                        const data = await res.json();
                        alert(`QA Score: ${data.score}/100 | ${data.summary?.critical || 0} critical, ${data.summary?.fail || 0} fail`);
                      } catch { alert('QA check lancé — rapport par email'); }
                    }}
                    className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded-full border border-blue-500/30 hover:bg-blue-500/30 transition cursor-pointer"
                    title="Lancer un check QA complet"
                  >
                    🧪 QA
                  </button>
                </>
              )}
            </div>
            {/* Quick actions */}
            <div className="flex items-center gap-2">
              {isVisitor && (
                <a
                  href="/login"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-lg text-purple-300 text-xs font-medium transition-colors hover:bg-purple-600/30"
                >
                  Se connecter
                </a>
              )}
              {isAdmin && (
                <button
                  onClick={() => router.push('/admin/agents')}
                  className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 text-xs transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Admin
                </button>
              )}
              {!isVisitor && (
                <button
                  onClick={() => router.push('/assistant/dossier')}
                  className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 text-xs transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Mon dossier
                </button>
              )}
            </div>
          </div>
          {/* Performance bar */}
          {summary?.globalStats && !COMING_SOON_MODE && !isVisitor ? (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-white/50 text-sm">{activeAgents} agents actifs</span>
              <span className="text-white/20">|</span>
              <span className="text-cyan-400 text-sm font-medium">+{summary.globalStats.prospectsToday || 0} prospects</span>
              <span className="text-white/20">|</span>
              <span className="text-blue-400 text-sm font-medium">{summary.globalStats.emailsSent || 0} emails</span>
              <span className="text-white/20">|</span>
              <span className="text-purple-400 text-sm font-medium">{summary.globalStats.contentPublished || 0} posts</span>
              {summary.globalStats.emailOpenRate > 0 && (
                <>
                  <span className="text-white/20">|</span>
                  <span className="text-emerald-400 text-sm font-medium">{summary.globalStats.emailOpenRate}% ouverture</span>
                </>
              )}
            </div>
          ) : (
            <p className="text-white/50 text-sm">
              {COMING_SOON_MODE ? `${agents.length} agents IA` : `${activeAgents} agents actifs`}
            </p>
          )}

          {/* Publishing streak */}
          {streak > 0 && !COMING_SOON_MODE && !isVisitor && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 rounded-full">
              <span className="text-base">{'\uD83D\uDD25'}</span>
              <span className="text-orange-300 text-xs font-bold">{streak} jour{streak > 1 ? 's' : ''} consecutif{streak > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* ═══ VISITOR BANNER ═══ */}
        {isVisitor && (
          <div className="mb-6 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-600/10 to-blue-600/10 p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-white font-bold text-base mb-1">
                  {'\uD83D\uDC4B'} Mode decouverte — Explorez votre future equipe IA
                </h2>
                <p className="text-white/50 text-xs">
                  Decouvrez les agents qui automatisent votre business. Connectez-vous pour activer votre espace personnalise.
                </p>
              </div>
              <a
                href="/login"
                className="flex-shrink-0 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition-all"
              >
                Se connecter
              </a>
            </div>
          </div>
        )}

        {/* ═══ AGENT QUESTIONS (notifications) ═══ */}
        {agentQuestions.length > 0 && (
          <div className="mb-4 space-y-2">
            {agentQuestions.map(q => {
              const agentInfo = agents.find(a => a.id === q.agent);
              return (
                <button
                  key={q.id}
                  onClick={() => {
                    if (agentInfo) handleOpenChat(agentInfo);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
                    style={{ background: agentInfo ? `linear-gradient(135deg, ${agentInfo.gradientFrom}, ${agentInfo.gradientTo})` : '#f59e0b' }}>
                    {avatars[q.agent] ? <img src={avatars[q.agent]!} alt="" className="w-full h-full object-cover" /> : <span className="text-sm">{agentInfo?.icon || '\uD83E\uDD16'}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 text-xs font-bold">{q.agent_name} a besoin de vous</span>
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    </div>
                    <p className="text-white/60 text-[11px] truncate">{q.question}</p>
                  </div>
                  <span className="text-amber-400/60 text-[10px] flex-shrink-0">Repondre {'\u2192'}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ═══ NOAH + AMI — Conseillers dedies ═══ */}
        {!isVisitor && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* NOAH — Conseiller strategique */}
            <div className="rounded-2xl border border-indigo-500/20 overflow-hidden cursor-pointer hover:border-indigo-500/40 transition-all"
              onClick={() => { const ceo = CLIENT_AGENTS.find(a => a.id === 'ceo'); if (ceo) handleSelectAgent(ceo); }}>
              <div className="bg-gradient-to-r from-indigo-600/20 to-blue-600/15 px-4 py-3 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'linear-gradient(135deg, #6366f1, #3b82f6)', padding: '2px' }}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                    {avatars['ceo'] ? <img src={avatars['ceo']} alt="Noah" className="w-full h-full object-cover scale-[1.15]" style={{ objectPosition: 'center 15%' }} /> : <span className="text-lg">{'\uD83E\uDDE0'}</span>}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm">Noah — Votre Strategiste</div>
                  <div className="text-indigo-300/60 text-[10px]">Conseille sur les priorites du jour et la strategie globale</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); const ceo = CLIENT_AGENTS.find(a => a.id === 'ceo'); if (ceo) handleOpenChat(ceo); }} className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg text-indigo-300 text-[10px] font-medium transition-all flex-shrink-0">
                  💬 Chat
                </button>
              </div>
              <div className="px-4 py-3 bg-white/[0.02]">
                {summary?.activityFeed?.find((a: any) => a.agent === 'ceo') ? (
                  <p className="text-white/50 text-xs leading-relaxed">{'\uD83C\uDFAF'} {(summary.activityFeed.find((a: any) => a.agent === 'ceo') as any)?.action || 'Analyse en cours...'}</p>
                ) : (
                  <p className="text-white/30 text-xs italic">Noah prepare votre brief strategique du jour...</p>
                )}
              </div>
            </div>

            {/* AMI — Directrice Marketing */}
            <div className="rounded-2xl border border-purple-500/20 overflow-hidden cursor-pointer hover:border-purple-500/40 transition-all"
              onClick={() => { const ami = CLIENT_AGENTS.find(a => a.id === 'marketing'); if (ami) handleSelectAgent(ami); }}>
              <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/15 px-4 py-3 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', padding: '2px' }}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                    {avatars['marketing'] ? <img src={avatars['marketing']} alt="AMI" className="w-full h-full object-cover scale-[1.15]" style={{ objectPosition: 'center 15%' }} /> : <span className="text-lg">{'\u{1F4CA}'}</span>}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm">AMI — Directrice Marketing</div>
                  <div className="text-purple-300/60 text-[10px]">Analyse les performances et optimise la strategie de tous les agents</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); const ami = CLIENT_AGENTS.find(a => a.id === 'marketing'); if (ami) handleOpenChat(ami); }} className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-lg text-purple-300 text-[10px] font-medium transition-all flex-shrink-0">
                  {'\u{1F4AC}'} Chat
                </button>
              </div>
              <div className="px-4 py-3 bg-white/[0.02]">
                {summary?.activityFeed?.find((a: any) => a.agent === 'marketing') ? (
                  <p className="text-white/50 text-xs leading-relaxed">{'\u{1F4C8}'} {(summary.activityFeed.find((a: any) => a.agent === 'marketing') as any)?.action || 'Analyse en cours...'}</p>
                ) : (
                  <p className="text-white/30 text-xs italic">AMI analyse les performances de vos agents...</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ KPI CARDS — Vue d'ensemble rapide ═══ */}
        {!COMING_SOON_MODE && !isVisitor && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">{nt.kpiActiveAgents || 'Active agents'}</span>
              </div>
              <div className="text-white text-2xl font-bold">{activeAgents}</div>
              <div className="text-white/30 text-[10px] mt-0.5">{(nt.kpiActiveAgentsOf || 'of {n} agents').replace('{n}', String(agents.length))}</div>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">{nt.kpiActions || 'Actions'}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-cyan-400 text-2xl font-bold">+{summary?.globalStats?.actionsToday ?? 0}</div>
                <div className="text-white/30 text-[10px]">/ {summary?.globalStats?.actionsTotal ?? totalActions}</div>
              </div>
              <div className="text-white/30 text-[10px] mt-0.5">{(nt.kpiActionsToday as string) || (summary?.locale === 'en' ? 'today · total' : "aujourd'hui · total")}</div>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">{nt.kpiProspects || 'Prospects'}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-cyan-400 text-2xl font-bold">+{summary?.globalStats?.prospectsToday ?? 0}</div>
                <div className="text-white/30 text-[10px]">/ {totalProspects}</div>
              </div>
              <div className="text-white/30 text-[10px] mt-0.5">{(nt.kpiProspectsToday as string) || (summary?.locale === 'en' ? 'today · in pipeline' : "aujourd'hui · en pipeline")}</div>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">{nt.kpiClients || 'Clients'}</span>
              </div>
              <div className="text-white text-2xl font-bold">{totalClients}</div>
              <div className="text-green-400/70 text-[10px] mt-0.5 font-medium">{(nt.kpiConversion || '{n}% conversion').replace('{n}', String(conversionRate))}</div>
            </div>
          </div>
        )}

        {/* AMI Performance: moved to agent workspace /assistant/agent/marketing */}

        {/* Coming soon banner */}
        {COMING_SOON_MODE && <ComingSoonBanner />}

        {/* Dossier banner */}
        <DossierBanner profile={profile} claraAvatarUrl={claraAvatarUrl} />

        {/* Instagram token check — popup si expire */}
        {!isVisitor && <InstagramTokenAlert />}

        {/* Notification bell — floating above tabs */}
        <div className="flex justify-end mb-2">
          <NotificationBell />
        </div>

        {/* ═══ TABS ═══ */}
        <div className="relative">
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10 mb-5 overflow-x-auto whitespace-nowrap scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {([
            { key: 'suivi' as const, label: `\uD83D\uDCCB ${nt.tabCentral || 'Central view'}`, shortLabel: nt.tabCentralShort || 'Central' },
            { key: 'equipe' as const, label: `\uD83D\uDC65 ${nt.tabTeam || 'By team'}`, shortLabel: nt.tabTeamShort || 'Teams' },
            { key: 'agent' as const, label: `\uD83E\uDD16 ${nt.tabAgent || 'By agent'}`, shortLabel: nt.tabAgentShort || 'Agents' },
            { key: 'campagnes' as const, label: `\u{1F3AF} ${nt.tabCampaigns || 'Campaigns'}`, shortLabel: nt.tabCampaignsShort || 'Campaigns' },
            { key: 'pipeline' as const, label: `\uD83D\uDCCA ${nt.tabCrm || 'My CRM'}`, shortLabel: nt.tabCrmShort || 'CRM' },
            { key: 'offre' as const, label: `\uD83D\uDCB0 ${nt.tabOffer || 'By offer'}`, shortLabel: nt.tabOfferShort || 'Offers' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setViewTab(tab.key)}
              className={`flex-shrink-0 px-2 sm:px-3 lg:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap ${
                viewTab === tab.key
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <span className="hidden lg:inline">{tab.label}</span>
              <span className="lg:hidden">{tab.shortLabel}</span>
            </button>
          ))}
        </div>
        {/* Scroll fade indicator for mobile */}
        <div className="absolute right-0 top-0 bottom-5 w-6 bg-gradient-to-l from-[#0c1a3a] to-transparent pointer-events-none rounded-r-xl sm:hidden" />
        </div>

        {/* ═══ TAB: SUIVI CENTRAL — Supra-elite visual ═══ */}
        {viewTab === 'suivi' && (
          <div className="space-y-5">
            {summaryLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400" />
              </div>
            ) : (
              <>
                {/* Agent cards — drag & drop grid */}
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={agentOrder} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {agentOrder.map(agentId => {
                        const agent = agents.find(a => a.id === agentId);
                        if (!agent || agent.visibility === 'background') return null;
                        // Noah + AMI are featured above — skip in grid
                        if (agent.id === 'ceo' || agent.id === 'marketing') return null;
                        return (
                          <SortableAgentCard
                            key={agent.id}
                            agent={agent}
                            avatars={avatars}
                            summary={summary}
                            onClick={() => handleSelectAgent(agent)}
                            isActivated={agentActivations[agent.id] || false}
                            onToggle={() => toggleAgentActivation(agent.id)}
                            agentTitle={getAgentTitle(agent, nt)}
                            dragLabel={nt.dragToReorder || 'Drag to reorder'}
                            activeLabel={nt.agentToggleActive || 'Agent active'}
                            inactiveLabel={nt.agentToggleInactive || 'Agent inactive'}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>

                {/* Bottom section: Actions recommandées */}
                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5">
                  <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                    <span>{'\u{1F3AF}'}</span> {nt.nextActionsTitle || 'Next actions'}
                  </h3>
                  {summary?.actions?.length > 0 ? (
                    <div className="space-y-2.5">
                      {(summary.actions as Array<{ icon: string; text: string; cta?: string; link?: string }>).slice(0, 5).map((action, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl hover:bg-white/[0.06] transition">
                          <span className="text-lg shrink-0">{action.icon}</span>
                          <p className="text-white/70 text-xs flex-1">{action.text}</p>
                          {action.cta && action.link && (
                            <a href={action.link} className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-[10px] font-bold rounded-lg hover:opacity-90 transition shrink-0">
                              {action.cta}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <span className="text-2xl">{'\u2705'}</span>
                      <p className="text-white/40 text-xs mt-2">{nt.allInOrder || 'All good! Your agents are at work.'}</p>
                    </div>
                  )}

                  {/* Live agent pulse — remplace le mini-stats redondant.
                      Montre les 3 dernières actions avec nom d'agent + délai
                      relatif. Adaptive, accurate, change à chaque exécution. */}
                  {summary?.activityFeed && summary.activityFeed.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="text-white/40 text-[10px] uppercase tracking-wider font-semibold mb-2">
                        {summary?.locale === 'en' ? 'Live pulse' : 'En direct'}
                      </div>
                      <div className="space-y-1.5">
                        {summary.activityFeed.slice(0, 3).map((log: any, i: number) => {
                          const agentLabel = (() => {
                            const a = (log.agent || '').toLowerCase();
                            if (a === 'content') return '🎨 Jade';
                            if (a === 'dm_instagram' || a === 'instagram_comments' || a === 'tiktok_comments') return '💬 Léna';
                            if (a === 'email') return '✉️ Hugo';
                            if (a === 'commercial' || (a === 'gmaps' && (log.action || '').includes('scan'))) return '🎯 Léo';
                            if (a === 'gmaps' && (log.action || '').includes('review')) return '⭐ Théo';
                            if (a === 'gmaps') return '🎯 Léo';
                            if (a === 'ceo') return '🧠 Noah';
                            if (a === 'marketing') return '📊 Ami';
                            if (a === 'seo') return '🔍 Oscar';
                            if (a === 'retention') return '💎 Théo';
                            return `· ${log.agent}`;
                          })();
                          const whenMs = log.date || log.created_at ? Date.now() - new Date(log.date || log.created_at).getTime() : 0;
                          const when = (() => {
                            const s = Math.round(whenMs / 1000);
                            if (s < 60) return summary?.locale === 'en' ? `${s}s ago` : `il y a ${s}s`;
                            const m = Math.round(s / 60);
                            if (m < 60) return summary?.locale === 'en' ? `${m}m ago` : `il y a ${m}m`;
                            const h = Math.round(m / 60);
                            if (h < 24) return summary?.locale === 'en' ? `${h}h ago` : `il y a ${h}h`;
                            const d = Math.round(h / 24);
                            return summary?.locale === 'en' ? `${d}d ago` : `il y a ${d}j`;
                          })();
                          const dot = log.status === 'success' || log.status === 'ok' ? 'bg-emerald-400' : log.status === 'error' ? 'bg-red-400' : 'bg-amber-400';
                          return (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                              <span className="text-white/80 font-medium">{agentLabel}</span>
                              <span className="text-white/50 flex-1 truncate">{log.action}</span>
                              <span className="text-white/30 flex-shrink-0">{when}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ TAB: PIPELINE CRM CENTRALISE ═══ */}
        {viewTab === 'campagnes' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-sm">{'\u{1F3AF}'} {nt.activeCampaignsTitle || 'Active campaigns'}</h2>
              <span className="text-white/30 text-xs">{nt.activeCampaignsSubtitle || 'All your agents\u2019 activity'}</span>
            </div>

            {/* Agent activity cards */}
            {agents.filter(a => a.visibility === 'active').map(agent => {
              const agentLogs = summary?.activityFeed?.filter((l: any) => l.agent === agent.id) || [];
              if (agentLogs.length === 0) return null;
              return (
                <div key={agent.id} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2" style={{ background: `linear-gradient(135deg, ${agent.gradientFrom}15, ${agent.gradientTo}15)` }}>
                    <span className="text-sm">{agent.icon}</span>
                    <span className="text-white text-xs font-bold">{agent.displayName}</span>
                    <span className="text-white/30 text-[10px] ml-auto">{agentLogs.length} actions</span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {agentLogs.slice(0, 5).map((log: any, i: number) => (
                      <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${log.status === 'success' || log.status === 'ok' ? 'bg-emerald-400' : log.status === 'error' ? 'bg-red-400' : 'bg-amber-400'}`} />
                        <span className="text-white/70 text-xs flex-1 truncate">{log.action || log.message || 'Action'}</span>
                        <span className="text-white/20 text-[9px] flex-shrink-0">{log.created_at ? new Date(log.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {(!summary?.activityFeed || summary.activityFeed.length === 0) && (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">{'\u{1F3AF}'}</p>
                <p className="text-white/50 text-sm">Aucune campagne en cours</p>
                <p className="text-white/30 text-xs mt-1">Tes agents demarreront automatiquement</p>
              </div>
            )}
          </div>
        )}

        {viewTab === 'pipeline' && typeof window !== 'undefined' && (() => { window.location.href = '/assistant/crm'; return null; })()}

        {/* ═══ TAB: Par equipe (avec dashboards + CRM) ═══ */}
        {viewTab === 'equipe' && (
          <div className="space-y-5">
            {summaryLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" />
              </div>
            )}

            {TEAMS.map((team) => {
              const teamAgents = team.agentIds
                .map(id => agents.find(a => a.id === id))
                .filter(Boolean) as ClientAgent[];
              const teamKey = team.name === 'Commercial' ? 'commercial'
                : team.name === 'Visibilite' ? 'visibilite'
                : team.name === 'Finance & Admin' ? 'finance' : 'strategie';
              const teamStats = summary?.teams?.[teamKey];
              const isCommercial = team.name === 'Commercial';

              return (
                <div key={team.name} className="rounded-2xl border border-white/15 bg-white/[0.03] overflow-hidden">
                  {/* Team header with KPIs */}
                  <div className={`px-4 py-3 bg-gradient-to-r ${team.color}`}>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2">
                        <span>{team.icon}</span> {team.name}
                      </h3>
                      <span className="text-white/70 text-[10px]">{team.description}</span>
                    </div>
                    {teamStats && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-white/90 text-[11px] font-medium">{teamStats.totalActions ?? 0} actions</span>
                        {isCommercial && (
                          <>
                            <span className="text-white/50 text-[10px]">|</span>
                            <span className="text-white/90 text-[11px]">{teamStats.prospects ?? 0} prospects</span>
                            <span className="text-white/50 text-[10px]">|</span>
                            <span className="text-emerald-200 text-[11px] font-bold">{teamStats.clients ?? 0} clients ({teamStats.conversionRate ?? 0}%)</span>
                          </>
                        )}
                        {teamKey === 'visibilite' && (
                          <>
                            <span className="text-white/50 text-[10px]">|</span>
                            <span className="text-white/90 text-[11px]">{teamStats.contentPublished ?? 0} publies</span>
                            <span className="text-white/50 text-[10px]">|</span>
                            <span className="text-white/90 text-[11px]">{teamStats.seoArticles ?? 0} articles SEO</span>
                          </>
                        )}
                        {teamKey === 'finance' && teamStats.adSpend > 0 && (
                          <>
                            <span className="text-white/50 text-[10px]">|</span>
                            <span className="text-white/90 text-[11px]">{teamStats.adSpend}{'\u20AC'} depenses</span>
                          </>
                        )}
                        {teamKey === 'strategie' && (
                          <>
                            <span className="text-white/50 text-[10px]">|</span>
                            <span className="text-white/90 text-[11px]">Dossier {teamStats.dossierScore ?? 0}%</span>
                            <span className="text-white/50 text-[10px]">|</span>
                            <span className="text-white/90 text-[11px]">{teamStats.agentsDiscovered ?? 0} agents actifs</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Agent cards with mini dashboards + drag & drop */}
                  <div className="p-3 space-y-2">
                    <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleTeamDragEnd(teamKey)}>
                      <SortableContext items={teamOrders[teamKey] || teamAgents.map(a => a.id)} strategy={rectSortingStrategy}>
                        {(teamOrders[teamKey] || teamAgents.map(a => a.id)).map(agentId => {
                          const agent = teamAgents.find(a => a.id === agentId);
                          if (!agent) return null;
                          return (
                            <SortableTeamAgentRow
                              key={agent.id}
                              agent={agent}
                              avatars={avatars}
                              agentStats={summary?.agents?.[agent.id]}
                              onClick={() => handleSelectAgent(agent)}
                              onChat={() => {/* handled below if chat exists */}}
                              isActivated={agentActivations[agent.id] || false}
                              onToggle={() => toggleAgentActivation(agent.id)}
                              agentTitle={getAgentTitle(agent, nt)}
                              dragLabel={nt.dragToReorder || 'Drag'}
                              activeLabel={nt.agentActiveTitle || 'Active'}
                              inactiveLabel={nt.agentInactiveTitle || 'Inactive'}
                            />
                          );
                        })}
                      </SortableContext>
                    </DndContext>
                    {/* Agent cards rendered by SortableTeamAgentRow above */}
                  </div>

                  {/* CRM button (Commercial team only) — opens full screen */}
                  {isCommercial && (
                    <div className="border-t border-white/10">
                      <button
                        onClick={() => setCrmExpanded(true)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
                      >
                        <span className="text-white font-bold text-xs flex items-center gap-2">
                          <span>{'\uD83D\uDCCA'}</span> CRM Pipeline
                          {summary?.crm && (
                            <span className="text-white/40 font-normal">{'\u2014'} {summary.crm.total} prospects, {summary.crm.clients} clients</span>
                          )}
                        </span>
                        <span className="text-purple-400 text-[10px] font-medium">Ouvrir {'\u2192'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Activity feed */}
            {summary?.activityFeed?.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/10">
                  <h3 className="text-white font-bold text-xs flex items-center gap-2">
                    <span>{'\u26A1'}</span> Activite recente de l&apos;equipe
                  </h3>
                </div>
                <div className="divide-y divide-white/5">
                  {(summary.activityFeed as Array<{ agent: string; action: string; date: string }>).map((a, i) => {
                    const agentInfo = agents.find(ag => ag.id === a.agent);
                    return (
                      <div key={i} className="px-4 py-2 flex items-center gap-2.5">
                        <div
                          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px]"
                          style={{ background: agentInfo ? `linear-gradient(135deg, ${agentInfo.gradientFrom}, ${agentInfo.gradientTo})` : '#4B5563' }}
                        >
                          {agentInfo?.icon || '\uD83E\uDD16'}
                        </div>
                        <span className="text-white text-[11px] font-medium">{agentInfo?.displayName || a.agent}</span>
                        <span className="text-white/30 text-[10px] flex-1 truncate">{a.action}</span>
                        <span className="text-white/20 text-[9px] flex-shrink-0">
                          {new Date(a.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: Par agent ═══ */}
        {viewTab === 'agent' && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                avatarUrl={avatars[agent.id] || null}
                isSelected={!!chats[agent.id]}
                onClick={() => (agent as any).notReleased ? undefined : handleSelectAgent(agent)}
                comingSoonMode={COMING_SOON_MODE}
                isComingSoon={(agent as any).notReleased === true}
                badgeCount={notifBadges[agent.id] || 0}
                onNotifyClick={() => {
                  if (COMING_SOON_MODE) {
                    setShowNotifyModal(true);
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* ═══ TAB: Par offre ═══ */}
        {viewTab === 'offre' && (
          <AgentTeams agents={agents} userPlan={userPlan} avatars={avatars} />
        )}
      </div>

      {/* ═══ MINIMIZED CHAT BUBBLES ═══ */}
      {(() => {
        const minimizedChats = Object.entries(chats).filter(([, c]) => c.minimized);
        const chatCount = Object.keys(chats).length;
        return (
          <div className="fixed bottom-20 right-4 z-40 flex flex-col-reverse items-end gap-2 lg:bottom-8 lg:right-8">
            {/* Minimized chat bubbles */}
            {minimizedChats.map(([agentId, chat]) => (
              <button
                key={agentId}
                onClick={() => handleRestoreChat(agentId)}
                className="group relative w-12 h-12 rounded-full shadow-xl hover:scale-110 transition-all flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${chat.agent.gradientFrom}, ${chat.agent.gradientTo})` }}
                title={`Ouvrir le chat avec ${chat.agent.displayName}`}
              >
                {avatars[agentId] ? (
                  <img src={avatars[agentId]!} alt={chat.agent.displayName} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-lg">{chat.agent.icon}</span>
                )}
                {/* Close mini button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleCloseChat(agentId); }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                {/* Unread dot */}
                {chat.messages.length > 0 && (
                  <div className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#0c1a3a]" />
                )}
              </button>
            ))}

            {/* Main chat floating button (show when no active full-size chat) */}
            {!activeChatId && (
              <button
                onClick={() => {
                  const ami = agents.find(a => a.id === 'marketing');
                  if (ami) handleOpenChat(ami);
                }}
                className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-2xl shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 flex items-center justify-center transition-all"
                title="Discuter avec un agent"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {chatCount > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-green-400 border-2 border-[#0c1a3a] flex items-center justify-center">
                    <span className="text-[10px] text-green-900 font-bold">{chatCount}</span>
                  </div>
                )}
              </button>
            )}
          </div>
        );
      })()}

      {/* ═══ ACTIVE CHAT PANEL (slide-over) ═══ */}
      {activeChatId && chats[activeChatId] && !chats[activeChatId].minimized && (() => {
        const chat = chats[activeChatId];
        return (
          <>
            {/* Backdrop (mobile only) */}
            {isMobile && (
              <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={() => handleMinimizeChat(activeChatId)}
              />
            )}

            {/* Chat panel with custom header for minimize/close */}
            <div
              className={`fixed z-50 flex flex-col ${
                isMobile
                  ? 'inset-0'
                  : 'top-20 right-4 bottom-4 w-[420px] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden'
              }`}
              style={{ animation: 'slideInRight 0.25s ease-out', ...(isMobile ? { paddingTop: 'env(safe-area-inset-top, 0px)' } : {}) }}
            >
              {/* Single header — AgentChatPanel handles it */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <AgentChatPanel
                  agent={chat.agent}
                  avatarUrl={avatars[activeChatId] || null}
                  messages={chat.messages}
                  onSendMessage={handleSendMessage}
                  isLoading={chat.isLoading}
                  onBack={() => handleMinimizeChat(activeChatId)}
                  isMobile={isMobile}
                  comingSoonMode={COMING_SOON_MODE}
                />
              </div>
            </div>
          </>
        );
      })()}

      {/* Slide-in animation */}
      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* ═══ CRM FULL SCREEN MODAL ═══ */}
      {crmExpanded && (
        <div className="fixed inset-0 z-50 bg-[#0c1a3a] pt-16 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-6">
            {/* CRM Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCrmExpanded(false)}
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-white font-bold text-xl lg:text-2xl">{'\uD83D\uDCCA'} CRM Pipeline Commercial</h1>
                  <p className="text-white/40 text-sm">Gerez vos prospects et suivez votre pipeline</p>
                </div>
              </div>
              <button
                onClick={() => setCrmExpanded(false)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* CRM Content */}
            <WorkspaceCrm isAdmin={isAdmin} />
          </div>
        </div>
      )}

      {/* Notify modal */}
      {showNotifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f1f3d] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3 className="text-white font-bold text-base">Soyez prevenu du lancement</h3>
              <p className="text-white/50 text-xs mt-1">
                Recevez un email des que votre equipe IA sera disponible.
              </p>
            </div>

            {!notifySubmitted ? (
              <form onSubmit={handleNotifySubmit}>
                <input
                  type="email"
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-white/40 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none mb-3"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNotifyModal(false)}
                    className="flex-1 py-2.5 bg-white/10 text-white/70 text-sm font-medium rounded-xl hover:bg-white/20 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all"
                  >
                    Me notifier
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4">
                <svg className="w-8 h-8 text-green-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-green-400 text-sm font-medium">On te previent des le lancement !</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
