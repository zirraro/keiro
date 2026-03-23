'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { getVisibleAgents, type ClientAgent } from '@/lib/agents/client-context';
import AgentCard from './components/AgentCard';
import AgentChatPanel, { type ChatMessage } from './components/AgentChatPanel';
import DossierBanner from './components/DossierBanner';
import ComingSoonBanner from './components/ComingSoonBanner';
import AgentTeams from './components/AgentTeams';
import WorkspaceCrm from './components/WorkspaceCrm';

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

// ─── Coming Soon Mode ──────────────────────────────────────
const COMING_SOON_MODE_DEFAULT = true;

// ─── Team definitions ──────────────────────────────────────
const TEAMS = [
  {
    name: 'Commercial',
    icon: '\uD83D\uDCBC',
    color: 'from-blue-500 to-cyan-500',
    description: 'Prospection, emails, DMs, chatbot',
    agentIds: ['commercial', 'email', 'dm_instagram', 'chatbot'],
  },
  {
    name: 'Visibilite',
    icon: '\uD83D\uDCF1',
    color: 'from-purple-500 to-violet-600',
    description: 'Contenu, SEO, TikTok, Google Maps',
    agentIds: ['content', 'seo', 'tiktok_comments', 'gmaps'],
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

export default function AssistantPage() {
  const isMobile = useIsMobile();
  const router = useRouter();

  // Auth & profile
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [userPlan, setUserPlan] = useState<string>('gratuit');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Admin bypasses coming-soon mode
  const COMING_SOON_MODE = COMING_SOON_MODE_DEFAULT && !isAdmin;

  // Agent grid
  const [agents, setAgents] = useState<ClientAgent[]>([]);
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
  const [viewTab, setViewTab] = useState<'equipe' | 'agent' | 'offre'>('equipe');

  // Dashboard summary data
  const [summary, setSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

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
          .select('subscription_plan, company_name, company_description, website, target_audience, main_products, brand_tone, social_goals_monthly, content_themes, competitors, posting_frequency, is_admin')
          .eq('id', user.id)
          .single();

        if (profileData) {
          setProfile(profileData);
          setUserPlan(profileData.subscription_plan || 'gratuit');
          if (profileData.is_admin) setIsAdmin(true);
        }
      }

      setLoading(false);
    }
    init();
  }, []);

  // ─── Load agents based on plan ──────────────────────────
  useEffect(() => {
    const visible = getVisibleAgents(userPlan, isAdmin);
    const amiIndex = visible.findIndex(a => a.id === 'marketing');
    if (amiIndex > 0) {
      const ami = visible.splice(amiIndex, 1)[0];
      visible.unshift(ami);
    }
    setAgents(visible);
  }, [userPlan, isAdmin]);

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
        const res = await fetch('/api/agents/dashboard/summary', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) setSummary(data);
        }
      } catch { /* silent */ }
      setSummaryLoading(false);
    }
    loadSummary();
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
    if (agent.visibility === 'coming_soon') return;
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
          : `Merci pour ton message ! ${chat.agent.displayName} sera bientot disponible.`,
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
  const activeAgents = agents.filter(a => a.visibility === 'active').length;
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
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:pb-8">

        {/* ═══ WORKSPACE HEADER ═══ */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <h1 className="text-white font-bold text-2xl lg:text-3xl">
                Espace de travail
              </h1>
              {isAdmin && (
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded-full border border-green-500/30">
                  ADMIN
                </span>
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
          <p className="text-white/50 text-sm">
            {COMING_SOON_MODE
              ? `${agents.length} agents IA qui automatisent votre business`
              : `${activeAgents} agents actifs — automatisation & intelligence`
            }
          </p>

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
                <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Agents actifs</span>
              </div>
              <div className="text-white text-2xl font-bold">{activeAgents}</div>
              <div className="text-white/30 text-[10px] mt-0.5">sur {agents.length} agents</div>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Actions</span>
              </div>
              <div className="text-white text-2xl font-bold">{totalActions}</div>
              <div className="text-white/30 text-[10px] mt-0.5">cette semaine</div>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Prospects</span>
              </div>
              <div className="text-white text-2xl font-bold">{totalProspects}</div>
              <div className="text-white/30 text-[10px] mt-0.5">dans le pipeline</div>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Clients</span>
              </div>
              <div className="text-white text-2xl font-bold">{totalClients}</div>
              <div className="text-green-400/70 text-[10px] mt-0.5 font-medium">{conversionRate}% conversion</div>
            </div>
          </div>
        )}

        {/* ═══ AMI Performance Widget ═══ */}
        {amiStats && !COMING_SOON_MODE && !isVisitor && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <span>{'\uD83C\uDFAF'}</span> Performance AMI
              </h3>
              <button
                onClick={() => {
                  const ami = agents.find(a => a.id === 'marketing');
                  if (ami) handleOpenChat(ami);
                }}
                className="text-purple-400 text-[10px] font-medium hover:text-purple-300 transition-colors"
              >
                Discuter avec AMI {'\u2192'}
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white/[0.04] rounded-lg px-3 py-2">
                <div className="text-white/40 text-[10px]">Posts cette semaine</div>
                <div className="text-white font-bold text-lg">{amiStats.postsThisWeek}</div>
              </div>
              <div className="bg-white/[0.04] rounded-lg px-3 py-2">
                <div className="text-white/40 text-[10px]">Engagement moy.</div>
                <div className="text-white font-bold text-lg">{amiStats.avgEngagement}%</div>
              </div>
              <div className="bg-white/[0.04] rounded-lg px-3 py-2">
                <div className="text-white/40 text-[10px]">Vues moy.</div>
                <div className="text-white font-bold text-lg">{amiStats.avgViews}</div>
              </div>
              <div className="bg-white/[0.04] rounded-lg px-3 py-2">
                <div className="text-white/40 text-[10px]">Categorie top</div>
                <div className="text-white font-bold text-sm mt-0.5">{amiStats.topCategory}</div>
              </div>
            </div>
            {amiStats.improvement > 0 && (
              <div className="mt-2 text-green-400/80 text-[11px] font-medium">
                {'\u2191'} +{amiStats.improvement}% d&apos;amelioration depuis le debut
              </div>
            )}
          </div>
        )}

        {/* Coming soon banner */}
        {COMING_SOON_MODE && <ComingSoonBanner />}

        {/* Dossier banner */}
        <DossierBanner profile={profile} claraAvatarUrl={claraAvatarUrl} />

        {/* ═══ TABS ═══ */}
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10 mb-5">
          {([
            { key: 'equipe' as const, label: 'Par equipe' },
            { key: 'agent' as const, label: 'Par agent' },
            { key: 'offre' as const, label: 'Par offre' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setViewTab(tab.key)}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                viewTab === tab.key
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

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

                  {/* Agent cards with mini dashboards + chat button */}
                  <div className="p-3 space-y-2">
                    {teamAgents.map((agent) => {
                      const agentStats = summary?.agents?.[agent.id];
                      return (
                        <div
                          key={agent.id}
                          className="rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-all overflow-hidden"
                        >
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <button
                              onClick={() => handleSelectAgent(agent)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <div
                                className="w-14 h-14 rounded-full flex-shrink-0"
                                style={{ background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})`, padding: '2.5px' }}
                              >
                                <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                                  {avatars[agent.id] ? (
                                    <img src={avatars[agent.id]!} alt={agent.displayName} className="w-full h-full object-cover scale-[1.15]" style={{ objectPosition: 'center 15%' }} />
                                  ) : (
                                    <span className="text-xl">{agent.icon}</span>
                                  )}
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-white font-semibold text-xs">{agent.displayName}</div>
                                <div className="text-gray-400 text-[10px] truncate">{agent.title}</div>
                              </div>
                            </button>

                            {/* Chat button + status */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenChat(agent);
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-lg text-purple-300 text-[10px] font-medium transition-all"
                                title={`Discuter avec ${agent.displayName}`}
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                Chat
                              </button>
                              <div className="w-2 h-2 rounded-full flex-shrink-0 bg-green-400" />
                            </div>
                          </div>

                          {/* Mini dashboard metrics */}
                          {agentStats?.metrics && agentStats.metrics.length > 0 && (
                            <div className="px-3 pb-2.5 flex items-center gap-3 flex-wrap">
                              {(agentStats.metrics as Array<{ label: string; value: string | number; icon: string }>).map((m, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <span className="text-[10px]">{m.icon}</span>
                                  <span className="text-white/80 text-[10px] font-bold">{m.value}</span>
                                  <span className="text-white/30 text-[9px]">{m.label}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                onClick={() => handleSelectAgent(agent)}
                comingSoonMode={COMING_SOON_MODE}
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
          <div className="fixed bottom-6 right-6 z-40 flex flex-col-reverse items-end gap-2 lg:bottom-8 lg:right-8">
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
                    <span className="text-[8px] text-green-900 font-bold">{chatCount}</span>
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
              style={{ animation: 'slideInRight 0.25s ease-out' }}
            >
              {/* Custom header with minimize + close buttons */}
              <div
                className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${chat.agent.gradientFrom}, ${chat.agent.gradientTo})` }}
              >
                <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/15">
                  {avatars[activeChatId] ? (
                    <img src={avatars[activeChatId]!} alt={chat.agent.displayName} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
                  ) : (
                    <span className="text-lg">{chat.agent.icon}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold text-sm leading-tight">{chat.agent.displayName}</h3>
                  <p className="text-white/70 text-xs">{chat.agent.title}</p>
                </div>
                <div className="flex items-center gap-1">
                  {/* Minimize button */}
                  <button
                    onClick={() => handleMinimizeChat(activeChatId)}
                    className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                    title="Reduire"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {/* Close button */}
                  <button
                    onClick={() => handleCloseChat(activeChatId)}
                    className="w-8 h-8 rounded-full bg-white/15 hover:bg-red-500/50 flex items-center justify-center transition-colors"
                    title="Fermer"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Chat body using AgentChatPanel but without its header */}
              <div className="flex-1 flex flex-col bg-[#0a1628] overflow-hidden">
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
