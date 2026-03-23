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
// Set to true to show everything as "coming soon" for regular users
// Admins bypass this automatically
const COMING_SOON_MODE_DEFAULT = true;

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

  // Chat state
  const [selectedAgent, setSelectedAgent] = useState<ClientAgent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState<string | null>(null);

  // Notify modal state
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifySubmitted, setNotifySubmitted] = useState(false);

  // View mode (removed — both grid and teams shown together)

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

  // View tab (must be before any conditional returns)
  const [viewTab, setViewTab] = useState<'equipe' | 'agent' | 'offre'>('equipe');

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

  // ─── Load agents based on plan (AMI first as star) ──────
  useEffect(() => {
    const visible = getVisibleAgents(userPlan, isAdmin);
    // Put AMI (marketing) first as the star agent
    const amiIndex = visible.findIndex(a => a.id === 'marketing');
    if (amiIndex > 0) {
      const ami = visible.splice(amiIndex, 1)[0];
      visible.unshift(ami);
    }
    setAgents(visible);
  }, [userPlan, isAdmin]);

  // ─── Load AMI dashboard stats ─────────────────────────
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

  // ─── Load publishing streak ──────────────────────────
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

  // ─── Load avatars from admin API ────────────────────────
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
      } catch {
        // Silent fail — cards will show emoji fallback
      }
    }
    loadAvatars();
  }, []);

  // ─── Load chat history when selecting an agent ──────────
  useEffect(() => {
    if (!selectedAgent || !user) return;
    if (historyLoaded === selectedAgent.id) return;
    if (COMING_SOON_MODE) return; // Skip loading in coming-soon mode

    async function loadHistory() {
      try {
        const res = await fetch(`/api/agents/client-chat?agent_id=${selectedAgent!.id}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.messages && Array.isArray(data.messages)) {
            setMessages(data.messages.map((m: any, i: number) => ({
              id: m.id || `hist_${i}`,
              role: m.role,
              content: m.content,
              created_at: m.created_at || m.timestamp || new Date().toISOString(),
            })));
          }
        }
      } catch {
        // History not available — start fresh
      }
      setHistoryLoaded(selectedAgent!.id);
    }
    loadHistory();
  }, [selectedAgent, user, historyLoaded]);

  // ─── Select agent ───────────────────────────────────────
  const handleSelectAgent = useCallback((agent: ClientAgent) => {
    if (COMING_SOON_MODE) {
      // In coming-soon mode, show the chat panel with overlay
      setSelectedAgent(agent);
      setMessages([]);
      return;
    }
    if (agent.visibility === 'coming_soon') return;
    // Navigate to dedicated agent workspace
    router.push(`/assistant/agent/${agent.id}`);
  }, [COMING_SOON_MODE, router]);

  const handleBack = useCallback(() => {
    setSelectedAgent(null);
    setMessages([]);
    setHistoryLoaded(null);
  }, []);

  // ─── Send message ───────────────────────────────────────
  const handleSendMessage = useCallback(async (text: string) => {
    if (!selectedAgent || !text.trim()) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: selectedAgent.id,
          message: text,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: data.message || data.reply || 'Reponse recue.',
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        // API doesn't exist yet or errored
        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: `Merci pour ton message ! Cette fonctionnalite est en cours de deploiement. ${selectedAgent.displayName} sera bientot disponible pour t'aider.`,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch {
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Oups, probleme de connexion. Verifie ta connexion internet et reessaie.',
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } finally {
      setChatLoading(false);
    }
  }, [selectedAgent]);

  // ─── Notify handler ─────────────────────────────────────
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

  // ─── Loading state ──────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c1a3a] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400 mx-auto mb-4" />
          <p className="text-white/60 text-sm">Chargement de votre equipe...</p>
        </div>
      </div>
    );
  }

  // ─── Not logged in ──────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0c1a3a] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🤖</span>
          </div>
          <h1 className="text-white font-bold text-xl mb-2">Votre Equipe IA</h1>
          <p className="text-white/60 text-sm mb-6">
            Connectez-vous pour acceder a votre equipe d&apos;agents IA personnalises.
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
          >
            Se connecter
          </a>
        </div>
      </div>
    );
  }

  // Clara avatar for dossier banner
  const claraAvatarUrl = avatars['onboarding'] || null;

  // ─── Mobile: show chat full screen if agent selected ────
  if (isMobile && selectedAgent) {
    return (
      <AgentChatPanel
        agent={selectedAgent}
        avatarUrl={avatars[selectedAgent.id] || null}
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={chatLoading}
        onBack={handleBack}
        isMobile={true}
        comingSoonMode={COMING_SOON_MODE}
      />
    );
  }

  // Team definitions aligned with CRM architecture
  const TEAMS = [
    {
      name: 'Commercial',
      icon: '💼',
      color: 'from-blue-500 to-cyan-500',
      description: 'Prospection, emails, DMs, chatbot',
      agentIds: ['commercial', 'email', 'dm_instagram', 'chatbot'],
    },
    {
      name: 'Visibilite',
      icon: '📱',
      color: 'from-purple-500 to-violet-600',
      description: 'Contenu, SEO, TikTok, Google Maps',
      agentIds: ['content', 'seo', 'tiktok_comments', 'gmaps'],
    },
    {
      name: 'Finance & Admin',
      icon: '🏦',
      color: 'from-amber-500 to-orange-500',
      description: 'Compta, RH, publicite',
      agentIds: ['comptable', 'rh', 'ads'],
    },
    {
      name: 'Strategie',
      icon: '🧠',
      color: 'from-pink-500 to-rose-500',
      description: 'Direction marketing & onboarding',
      agentIds: ['marketing', 'onboarding'],
    },
  ];

  // ─── Main layout ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0c1a3a]">
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:pb-8">

        {/* Header + Tabs */}
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-white font-bold text-2xl lg:text-3xl">
              Votre Equipe IA
            </h1>
            {isAdmin && (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded-full border border-green-500/30">
                ADMIN
              </span>
            )}
          </div>
          <p className="text-white/50 text-sm mb-3">
            {COMING_SOON_MODE
              ? `${agents.length} agents IA qui automatisent votre business`
              : `${agents.filter(a => a.visibility === 'active').length} agents actifs — automatisation & intelligence`
            }
          </p>

          {/* Tabs: Par équipe / Par agent / Par offre */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
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

          {/* Publishing streak */}
          {streak > 0 && !COMING_SOON_MODE && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 rounded-full">
              <span className="text-base">🔥</span>
              <span className="text-orange-300 text-xs font-bold">{streak} jour{streak > 1 ? 's' : ''} consecutif{streak > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Coming soon banner */}
        {COMING_SOON_MODE && <ComingSoonBanner />}

        {/* Dossier banner */}
        <DossierBanner profile={profile} claraAvatarUrl={claraAvatarUrl} />

        {/* ═══ TAB: Par équipe ═══ */}
        {viewTab === 'equipe' && (
          <div className="space-y-4">
            {TEAMS.map((team) => {
              const teamAgents = team.agentIds
                .map(id => agents.find(a => a.id === id))
                .filter(Boolean) as ClientAgent[];

              return (
                <div key={team.name} className="rounded-2xl border border-white/15 bg-white/[0.03] overflow-hidden">
                  {/* Team header */}
                  <div className={`px-4 py-3 bg-gradient-to-r ${team.color}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2">
                        <span>{team.icon}</span> {team.name}
                      </h3>
                      <span className="text-white/70 text-[10px]">{team.description}</span>
                    </div>
                  </div>
                  {/* Team agents */}
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {teamAgents.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => handleSelectAgent(agent)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] transition-all text-left"
                      >
                        <div
                          className="w-10 h-10 rounded-full flex-shrink-0"
                          style={{ background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})`, padding: '2px' }}
                        >
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
                          <div className="text-gray-400 text-[10px] truncate">{agent.title}</div>
                        </div>
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-green-400" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ TAB: Par agent ═══ */}
        {viewTab === 'agent' && (
          <div className="flex gap-6">
            {/* Agent grid */}
            <div className={`${selectedAgent && !isMobile ? 'w-1/2' : 'w-full'} transition-all duration-300`}>
              <div className={`grid ${selectedAgent && !isMobile ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'} gap-3`}>
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    avatarUrl={avatars[agent.id] || null}
                    isSelected={selectedAgent?.id === agent.id}
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
            </div>

            {/* Desktop chat panel */}
            {selectedAgent && !isMobile && (
              <div className="w-1/2">
                <div className="sticky top-6">
                  <AgentChatPanel
                    agent={selectedAgent}
                    avatarUrl={avatars[selectedAgent.id] || null}
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    isLoading={chatLoading}
                    onBack={handleBack}
                    isMobile={false}
                    comingSoonMode={COMING_SOON_MODE}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: Par offre ═══ */}
        {viewTab === 'offre' && (
          <AgentTeams agents={agents} userPlan={userPlan} avatars={avatars} />
        )}
      </div>

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
