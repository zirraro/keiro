'use client';

import { Suspense, useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';
import AvatarEditor from './components/AvatarEditor';

type Tab = 'fiches' | 'briefs' | 'campagnes' | 'ordres' | 'logs' | 'avatars';
type FicheSubTab = 'overview' | 'chat' | 'ordres' | 'logs';

type AgentFiche = {
  id: string;
  name: string;
  icon: string;
  description: string;
  gradient: string;
  logAgents: string[];
  chatId: string;
};

const AGENT_FICHES: AgentFiche[] = [
  { id: 'ceo', name: 'Noah — Stratège', icon: '🧠', description: 'Stratégie globale, briefs quotidiens, alertes', gradient: 'from-purple-600 to-indigo-700', logAgents: ['ceo'], chatId: 'ceo' },
  { id: 'commercial', name: 'Léo — Commercial', icon: '🎯', description: 'Lead scraping, qualification, pipeline CRM', gradient: 'from-blue-600 to-cyan-600', logAgents: ['commercial', 'gmaps'], chatId: 'commercial' },
  { id: 'email', name: 'Hugo — Email', icon: '📧', description: 'Séquences cold/warm, relances, A/B testing', gradient: 'from-green-600 to-emerald-600', logAgents: ['email'], chatId: 'email' },
  { id: 'contenu_social', name: 'Léna — Contenu & Publication', icon: '⚡', description: 'Création, DMs, tendances, calendrier éditorial, scheduling', gradient: 'from-pink-600 to-rose-600', logAgents: ['content', 'dm_instagram', 'tiktok_comments', 'ops', 'scheduler'], chatId: 'content' },
  { id: 'seo', name: 'Oscar — SEO', icon: '🔍', description: 'Articles blog, mots-clés, référencement', gradient: 'from-amber-600 to-orange-600', logAgents: ['seo'], chatId: 'seo' },
  { id: 'onboarding', name: 'Clara — Onboarding', icon: '🚀', description: 'Activation, premier succès, conversion J0-J7', gradient: 'from-cyan-600 to-blue-600', logAgents: ['onboarding'], chatId: 'onboarding' },
  { id: 'retention', name: 'Théo — Rétention', icon: '💎', description: 'Fidélisation, win-back, santé clients', gradient: 'from-violet-600 to-purple-600', logAgents: ['retention'], chatId: 'retention' },
  { id: 'marketing', name: 'Ami — Marketing', icon: '📊', description: 'Intelligence marketing, analytics, stratégie', gradient: 'from-teal-600 to-green-600', logAgents: ['marketing'], chatId: 'marketing' },
  { id: 'ads', name: 'Félix — Publicité', icon: '🔥', description: 'Meta Ads, Google Ads, funnels, conversion', gradient: 'from-red-600 to-orange-600', logAgents: ['ads'], chatId: 'ads' },
  { id: 'rh', name: 'Sara — RH & Juridique', icon: '⚖️', description: 'Contrats, RGPD, CGV/CGU, conformité', gradient: 'from-slate-600 to-slate-700', logAgents: ['rh'], chatId: 'rh' },
  { id: 'comptable', name: 'Louis — Comptable', icon: '💰', description: 'Finance, dépenses, prévisions, inventaire, marge', gradient: 'from-cyan-700 to-cyan-900', logAgents: ['comptable'], chatId: 'comptable' },
];

type ServiceTeam = {
  id: string;
  name: string;
  icon: string;
  color: string;
  agents: string[]; // fiche IDs
};

const SERVICE_TEAMS: ServiceTeam[] = [
  { id: 'direction', name: 'Direction', icon: '👔', color: 'from-purple-600 to-indigo-700', agents: ['ceo', 'marketing'] },
  { id: 'commercial', name: 'Commercial', icon: '💼', color: 'from-blue-600 to-cyan-600', agents: ['commercial', 'email', 'ads'] },
  { id: 'marketing_contenu', name: 'Marketing & Contenu', icon: '🎨', color: 'from-pink-600 to-rose-600', agents: ['contenu_social', 'seo'] },
  { id: 'client', name: 'Service Client', icon: '🤝', color: 'from-cyan-600 to-blue-600', agents: ['onboarding', 'retention'] },
  { id: 'support', name: 'Support & Admin', icon: '🏢', color: 'from-slate-600 to-slate-700', agents: ['rh', 'comptable'] },
];

type MetricCard = {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  icon: string;
};

type Brief = {
  id: string;
  created_at: string;
  data: any;
};

type AgentOrder = {
  id: string;
  created_at: string;
  from_agent: string;
  to_agent: string;
  order_type: string;
  priority: string;
  action: string;
  status: string;
  payload: any;
  result: any;
  completed_at: string | null;
};

type AgentLog = {
  id: string;
  created_at: string;
  agent: string;
  action: string;
  status: string;
  target: string;
  data: any;
};

function AdminAgentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const initialTab = (searchParams.get('tab') as Tab) || 'fiches';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Fiche agent state
  const [focusedAgent, setFocusedAgent] = useState<string | null>(null);
  const [ficheSubTab, setFicheSubTab] = useState<FicheSubTab>('overview');
  const [agentStatuses, setAgentStatuses] = useState<Record<string, { lastRun: string | null; count24h: number; status: string }>>({});

  // Dashboard state
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [dashboardAgent, setDashboardAgent] = useState<string>('global');
  const [agentMetrics, setAgentMetrics] = useState<MetricCard[]>([]);
  const [agentMetricsLoading, setAgentMetricsLoading] = useState(false);

  // Test email state
  const [testEmail, setTestEmail] = useState('');
  const [testStep, setTestStep] = useState(1);
  const [testCategory, setTestCategory] = useState('agence');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Reset dead prospects state
  const [resettingDead, setResettingDead] = useState(false);
  const [resetResult, setResetResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Mini commercial dashboard state
  const [miniCrmStats, setMiniCrmStats] = useState<any>(null);
  const [miniCrmLoading, setMiniCrmLoading] = useState(false);

  // Warm/hot prospects list (call list)
  type WarmProspect = {
    id: string; company: string; email: string | null; phone: string | null;
    instagram_handle: string | null; type: string | null; temperature: string;
    score: number | null; status: string | null; quartier: string | null;
    email_sequence_step: number | null; email_sequence_status: string | null;
    last_email_sent_at: string | null; last_email_opened_at: string | null;
    last_email_clicked_at: string | null; created_at: string;
    notes: string | null; source: string | null;
  };
  const [warmProspects, setWarmProspects] = useState<WarmProspect[]>([]);
  const [warmLoading, setWarmLoading] = useState(false);
  const [selectedWarmProspect, setSelectedWarmProspect] = useState<WarmProspect | null>(null);
  const [warmActivities, setWarmActivities] = useState<any[]>([]);
  const [warmActivitiesLoading, setWarmActivitiesLoading] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Partial<WarmProspect>>({});
  const [savingProspect, setSavingProspect] = useState(false);

  // Briefs state
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const [executingCeo, setExecutingCeo] = useState(false);

  // Orders state
  const [orders, setOrders] = useState<AgentOrder[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [executingOrders, setExecutingOrders] = useState(false);
  const [orderFilterStatus, setOrderFilterStatus] = useState<string>('all');
  const [orderFilterAgent, setOrderFilterAgent] = useState<string>('all');

  // CEO Chat state
  const [ceoMessages, setCeoMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [ceoInput, setCeoInput] = useState('');
  const [ceoLoading, setCeoLoading] = useState(false);
  const [ceoHistoryLoaded, setCeoHistoryLoaded] = useState(false);
  const ceoMessagesEndRef = useRef<HTMLDivElement>(null);

  // Agent Chat state (multi-agent)
  const CHAT_AGENTS = [
    { id: 'ceo', name: 'Noah', icon: '🧠' },
    { id: 'commercial', name: 'Léo', icon: '🎯' },
    { id: 'email', name: 'Hugo', icon: '📧' },
    { id: 'content', name: 'Léna (Contenu+Publi)', icon: '⚡' },
    { id: 'seo', name: 'Oscar', icon: '🔍' },
    { id: 'social', name: 'DM & Comments', icon: '💬' },
    { id: 'onboarding', name: 'Clara', icon: '🚀' },
    { id: 'retention', name: 'Théo', icon: '💎' },
    { id: 'marketing', name: 'Ami', icon: '📊' },
    { id: 'ads', name: 'Félix', icon: '🔥' },
    { id: 'rh', name: 'Sara', icon: '⚖️' },
    { id: 'comptable', name: 'Louis', icon: '💰' },
  ];
  const [selectedAgent, setSelectedAgent] = useState('ceo');
  const [agentMessages, setAgentMessages] = useState<Record<string, Array<{ role: 'user' | 'assistant'; content: string }>>>({});
  const [agentInput, setAgentInput] = useState('');
  const [agentChatLoading, setAgentChatLoading] = useState(false);
  const [agentHistoryLoaded, setAgentHistoryLoaded] = useState<Record<string, boolean>>({});
  const agentMessagesEndRef = useRef<HTMLDivElement>(null);

  // Campagnes state
  type CampaignEntry = {
    id: string;
    date: string;
    agent: string;
    action: string;
    total: number;
    success: number;
    failed: number;
    message?: string;
    diagnostic?: Record<string, any>;
    data?: Record<string, any>;
    byBusinessType: Record<string, { sent?: number; count?: number; failed?: number; steps?: number[]; handles?: string[] }>;
    dmExamples?: Array<{ name: string; type?: string; comment?: string }>;
    results?: Array<{ prospect_id: string; step: number; success: boolean; error?: string }>;
  };
  const [campaigns, setCampaigns] = useState<CampaignEntry[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [campaignDateFilter, setCampaignDateFilter] = useState<string>('7d');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<string>('all');
  const [launchingCampaign, setLaunchingCampaign] = useState<string | null>(null);
  const [campaignLaunchResult, setCampaignLaunchResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Content campaign options
  const [showContentOptions, setShowContentOptions] = useState(false);
  const [contentPlatform, setContentPlatform] = useState<'all' | 'instagram' | 'tiktok' | 'linkedin'>('all');
  const [contentMode, setContentMode] = useState<'draft' | 'publish' | 'week'>('draft');
  const [emailMode, setEmailMode] = useState<'draft' | 'send'>('draft');
  const [showEmailOptions, setShowEmailOptions] = useState(false);
  const [showCommunityOptions, setShowCommunityOptions] = useState(false);
  const [showCommercialOptions, setShowCommercialOptions] = useState(false);
  const [showDmOptions, setShowDmOptions] = useState(false);
  const [communityPlatform, setCommunityPlatform] = useState<string>('instagram');
  const [contentCalendar, setContentCalendar] = useState<any[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // DM queue preview
  type DMQueueItem = {
    id: string;
    channel: string;
    handle: string;
    message: string;
    personalization: string;
    created_at: string;
    prospect_name?: string;
  };
  const [dmQueue, setDmQueue] = useState<DMQueueItem[]>([]);

  // SEO state
  type SeoArticle = { id: string; title: string; slug: string; keywords_primary: string; status: string; published_at: string | null; created_at: string; views: number };
  const [seoArticles, setSeoArticles] = useState<SeoArticle[]>([]);
  const [seoStats, setSeoStats] = useState({ total: 0, published: 0, drafts: 0 });
  const [seoGenerating, setSeoGenerating] = useState(false);
  const [seoPublishing, setSeoPublishing] = useState<string | null>(null);
  const [seoStatusFilter, setSeoStatusFilter] = useState<string>('all');

  // Onboarding state
  type OnboardingItem = { id: string; user_id: string; step_key: string; plan: string; scheduled_at: string; sent_at: string | null; status: string; message_text: string | null; first_name?: string; business_type?: string };
  const [onboardingItems, setOnboardingItems] = useState<OnboardingItem[]>([]);
  const [onboardingStats, setOnboardingStats] = useState({ pending: 0, sent: 0, alerts: 0 });
  const [onboardingFilter, setOnboardingFilter] = useState<string>('all');

  // Retention state
  type RetentionClient = { user_id: string; health_score: number; health_level: string; days_since_login: number; weekly_generations: number; plan: string; monthly_revenue: number; last_message_type: string | null; last_message_sent_at: string | null; first_name?: string; business_type?: string; email?: string; days_to_renewal?: number };
  const [retentionClients, setRetentionClients] = useState<RetentionClient[]>([]);
  const [retentionStats, setRetentionStats] = useState({ green: 0, yellow: 0, orange: 0, red: 0, mrrAtRisk: 0, totalClients: 0 });

  // Content state
  type ContentPost = { id: string; platform: string; format: string; pillar: string; hook: string | null; caption: string; visual_description: string | null; visual_url: string | null; video_url?: string | null; scheduled_date: string; scheduled_time: string; status: string; published_at: string | null; instagram_permalink?: string | null; tiktok_publish_id?: string | null; publish_error?: string | null; publish_diagnostic?: any };
  const [contentPosts, setContentPosts] = useState<ContentPost[]>([]);
  const [contentStats, setContentStats] = useState({ total: 0, published: 0, drafts: 0, approved: 0, byPlatform: { instagram: 0, tiktok: 0, linkedin: 0 } });
  const [contentGenerating, setContentGenerating] = useState(false);
  const [fixingCaptions, setFixingCaptions] = useState(false);
  const [contentDraftOnly, setContentDraftOnly] = useState(true);
  const [publishMode, setPublishMode] = useState<'auto' | 'notify'>('auto');
  const [previewPost, setPreviewPost] = useState<ContentPost | null>(null);

  // Logs state
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [logPage, setLogPage] = useState(0);
  const [logTotal, setLogTotal] = useState(0);

  // ─── Load agent statuses for fiche cards ───────────────
  const loadAgentStatuses = async () => {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabase
        .from('agent_logs')
        .select('agent, created_at, status')
        .order('created_at', { ascending: false })
        .limit(500);

      const statuses: Record<string, { lastRun: string | null; count24h: number; status: string }> = {};
      for (const fiche of AGENT_FICHES) {
        const agLogs = (recentLogs || []).filter((l: any) => fiche.logAgents.includes(l.agent));
        const lastRun = agLogs[0]?.created_at || null;
        const count24h = agLogs.filter((l: any) => l.created_at >= yesterday).length;
        const hoursAgo = lastRun ? (Date.now() - new Date(lastRun).getTime()) / 3600000 : Infinity;
        const hasError = agLogs.slice(0, 3).some((l: any) => l.status === 'error' || l.status === 'failed');
        statuses[fiche.id] = {
          lastRun,
          count24h,
          status: hasError ? 'error' : hoursAgo < 24 ? 'active' : hoursAgo < 48 ? 'idle' : 'inactive',
        };
      }
      setAgentStatuses(statuses);
    } catch (err) {
      console.error('[Agent Statuses] Load error:', err);
    }
  };

  // ─── Open a fiche agent detail view ────────────────────
  const openFiche = (agentId: string) => {
    setFocusedAgent(agentId);
    setFicheSubTab('overview');
    const fiche = AGENT_FICHES.find(f => f.id === agentId);
    if (!fiche) return;
    // Load agent-specific data
    loadAgentMetrics(fiche.logAgents[0] === 'content' ? 'content' : fiche.logAgents[0]);
    if (agentId === 'ceo') loadBriefs();
    if (agentId === 'seo') loadSeoData();
    if (agentId === 'onboarding') loadOnboardingData();
    if (agentId === 'retention') loadRetentionData();
    if (agentId === 'contenu_social') loadContentData();
    if (agentId === 'email') loadAgentMetrics('email');
    if (agentId === 'commercial') { loadAgentMetrics('commercial'); loadMiniCrmStats(); }
    loadAgentHistory(fiche.chatId);
  };

  // ─── Auth check ────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.push('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!profileData?.is_admin) { router.push('/'); return; }
      // Load publish mode preference from localStorage (fast) then sync from DB
      const savedMode = typeof window !== 'undefined' ? localStorage.getItem('keiro_publish_mode') : null;
      if (savedMode === 'notify') setPublishMode('notify');
      setLoading(false);
      loadDashboard();
      loadAgentStatuses();
      loadMiniCrmStats();
      loadWarmProspects();
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

  // Auto-scroll CEO chat to latest message
  useEffect(() => {
    ceoMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ceoMessages, ceoLoading]);

  // Auto-scroll agent chat
  useEffect(() => {
    agentMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentMessages, agentChatLoading, selectedAgent]);

  // ─── Dashboard metrics ─────────────────────────────────
  const loadDashboard = async () => {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayISO = yesterday.toISOString();

      // Conversations 24h
      const { count: convCount } = await supabase
        .from('chatbot_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterdayISO);

      // Leads 24h
      const { count: leadsCount } = await supabase
        .from('crm_prospects')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'chatbot')
        .gte('created_at', yesterdayISO);

      // Emails 24h (from crm_activities which tracks actual sends)
      const { count: emailsCount } = await supabase
        .from('crm_activities')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'email')
        .gte('created_at', yesterdayISO);

      // Taux ouverture réel (from crm_prospects.last_email_opened_at set by Brevo webhook)
      const { count: totalEmailsSent } = await supabase
        .from('crm_activities')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'email');

      const { count: totalOpened } = await supabase
        .from('crm_prospects')
        .select('*', { count: 'exact', head: true })
        .not('last_email_opened_at', 'is', null);

      const openRate = (totalEmailsSent && totalEmailsSent > 0)
        ? Math.round(((totalOpened ?? 0) / totalEmailsSent) * 100)
        : 0;

      // Comparaison 24h vs 24h précédentes pour trends réelles
      const twoDaysAgoISO = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { count: convCountPrev } = await supabase
        .from('chatbot_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', twoDaysAgoISO)
        .lt('created_at', yesterdayISO);

      const { count: leadsCountPrev } = await supabase
        .from('crm_prospects')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', twoDaysAgoISO)
        .lt('created_at', yesterdayISO);

      const calcTrend = (current: number, previous: number): { text: string; up: boolean } => {
        if (previous === 0) return current > 0 ? { text: '+100%', up: true } : { text: '—', up: true };
        const pct = Math.round(((current - previous) / previous) * 100);
        return { text: `${pct > 0 ? '+' : ''}${pct}%`, up: pct >= 0 };
      };

      const convTrend = calcTrend(convCount ?? 0, convCountPrev ?? 0);
      const leadsTrend = calcTrend(leadsCount ?? 0, leadsCountPrev ?? 0);

      // Prospects chauds (hot + warm)
      const { count: hotProspects } = await supabase
        .from('crm_prospects')
        .select('*', { count: 'exact', head: true })
        .in('temperature', ['hot', 'warm']);

      // Pipeline actif (statuts CRM réels — tous sauf perdu/client)
      const { count: pipelineCount } = await supabase
        .from('crm_prospects')
        .select('*', { count: 'exact', head: true })
        .in('status', ['identifie', 'contacte', 'relance_1', 'relance_2', 'relance_3', 'repondu', 'demo', 'sprint']);

      // Clients actifs
      const { count: activeClients } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .neq('subscription_plan', 'free')
        .not('subscription_plan', 'is', null);

      // MRR (from profiles with subscription_plan)
      const { data: paidProfiles } = await supabase
        .from('profiles')
        .select('subscription_plan')
        .neq('subscription_plan', 'free')
        .not('subscription_plan', 'is', null);

      // Monthly recurring revenue per plan (sprint is 3-day trial, not recurring)
      const planPrices: Record<string, number> = {
        sprint: 0,
        solo: 49,
        solo_promo: 49,
        fondateurs: 149,
        standard: 199,
        business: 349,
        elite: 999,
      };

      let mrr = 0;
      if (paidProfiles) {
        for (const p of paidProfiles) {
          mrr += planPrices[p.subscription_plan as string] || 0;
        }
      }

      setMetrics([
        {
          label: 'Conversations 24h',
          value: convCount ?? 0,
          icon: '\uD83D\uDCAC',
          trend: convTrend.text,
          trendUp: convTrend.up,
        },
        {
          label: 'Leads captur\u00E9s 24h',
          value: leadsCount ?? 0,
          icon: '\uD83C\uDFAF',
          trend: leadsTrend.text,
          trendUp: leadsTrend.up,
        },
        {
          label: 'Emails envoy\u00E9s 24h',
          value: emailsCount ?? 0,
          icon: '\u2709\uFE0F',
          trend: '',
          trendUp: true,
        },
        {
          label: "Taux d'ouverture",
          value: `${openRate}%`,
          icon: '\uD83D\uDCE8',
          trend: openRate > 25 ? 'Bon' : 'Am\u00E9liorer',
          trendUp: openRate > 25,
        },
        {
          label: 'Prospects chauds/warm',
          value: hotProspects ?? 0,
          icon: '\uD83D\uDD25',
          trend: '',
          trendUp: true,
        },
        {
          label: 'Pipeline actif',
          value: pipelineCount ?? 0,
          icon: '\uD83D\uDCCA',
          trend: '',
          trendUp: true,
        },
        {
          label: 'Clients payants',
          value: activeClients ?? 0,
          icon: '\u2705',
          trend: '',
          trendUp: true,
        },
        {
          label: 'MRR effectif',
          value: `${mrr.toLocaleString('fr-FR')}\u20AC`,
          icon: '\uD83D\uDCB0',
          trend: '',
          trendUp: true,
        },
      ]);
    } catch (err) {
      console.error('[Admin Agents] Dashboard load error:', err);
    }
  };

  // ─── Load warm/hot prospects (call list) ─────────────
  const loadWarmProspects = async () => {
    setWarmLoading(true);
    try {
      const { data } = await supabase
        .from('crm_prospects')
        .select('id, company, email, phone, instagram_handle, type, temperature, score, status, quartier, email_sequence_step, email_sequence_status, last_email_sent_at, last_email_opened_at, last_email_clicked_at, created_at, notes, source')
        .in('temperature', ['hot', 'warm'])
        .order('score', { ascending: false })
        .limit(50);
      setWarmProspects(data || []);
    } catch (e) {
      console.error('[WarmProspects] Load error:', e);
    }
    setWarmLoading(false);
  };

  const loadProspectActivities = async (prospectId: string) => {
    setWarmActivitiesLoading(true);
    try {
      const { data } = await supabase
        .from('crm_activities')
        .select('*')
        .eq('prospect_id', prospectId)
        .order('created_at', { ascending: false })
        .limit(30);
      setWarmActivities(data || []);
    } catch (e) {
      console.error('[ProspectActivities] Load error:', e);
    }
    setWarmActivitiesLoading(false);
  };

  const openWarmProspect = (p: WarmProspect) => {
    setSelectedWarmProspect(p);
    setEditingProspect({ company: p.company, email: p.email, phone: p.phone, instagram_handle: p.instagram_handle, notes: p.notes, type: p.type, quartier: p.quartier });
    loadProspectActivities(p.id);
  };

  const saveProspectEdits = async () => {
    if (!selectedWarmProspect) return;
    setSavingProspect(true);
    try {
      await supabase.from('crm_prospects').update({
        company: editingProspect.company,
        email: editingProspect.email,
        phone: editingProspect.phone,
        instagram_handle: editingProspect.instagram_handle,
        notes: editingProspect.notes,
        type: editingProspect.type,
        quartier: editingProspect.quartier,
      }).eq('id', selectedWarmProspect.id);
      // Refresh
      setSelectedWarmProspect({ ...selectedWarmProspect, ...editingProspect } as WarmProspect);
      loadWarmProspects();
    } catch (e) {
      console.error('[SaveProspect] Error:', e);
    }
    setSavingProspect(false);
  };

  // ─── Mini CRM stats for commercial overview ─────────────
  const loadMiniCrmStats = async () => {
    setMiniCrmLoading(true);
    try {
      const res = await fetch('/api/admin/crm/stats?type=all');
      const data = await res.json();
      if (data.ok) setMiniCrmStats(data);
    } catch (e) {
      console.error('[Mini CRM] Load error:', e);
    }
    setMiniCrmLoading(false);
  };



  // ─── Per-agent dashboard metrics ─────────────────────
  const loadAgentMetrics = async (agent: string) => {
    if (agent === 'global') { setAgentMetrics([]); return; }
    setAgentMetricsLoading(true);
    try {
      const now = new Date();
      const yesterdayISO = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const countLogs = async (agentName: string, action?: string, since?: string) => {
        let q = supabase.from('agent_logs').select('*', { count: 'exact', head: true }).eq('agent', agentName);
        if (action) q = q.eq('action', action);
        if (since) q = q.gte('created_at', since);
        const { count } = await q;
        return count ?? 0;
      };

      let cards: MetricCard[] = [];

      if (agent === 'email') {
        const sent24h = await countLogs('email', 'send_email', yesterdayISO);
        const totalSent = await countLogs('email', 'send_email');
        const totalOpened = await countLogs('email', 'webhook_opened');
        const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
        const bounces = await countLogs('email', 'webhook_bounced');
        const cold = await countLogs('email', 'daily_cold');
        const warm = await countLogs('email', 'daily_warm');
        cards = [
          { label: 'Emails envoyes 24h', value: sent24h, icon: '✉️' },
          { label: "Taux d'ouverture", value: `${openRate}%`, icon: '📨', trend: openRate > 25 ? 'Bon' : 'A ameliorer', trendUp: openRate > 25 },
          { label: 'Bounces total', value: bounces, icon: '⚠️' },
          { label: 'Campagnes cold', value: cold, icon: '❄️' },
          { label: 'Campagnes warm', value: warm, icon: '🔥' },
          { label: 'Total envoyes', value: totalSent, icon: '📧' },
        ];
      } else if (agent === 'commercial') {
        const enriched = await countLogs('commercial', 'enrichment_run');
        const { count: deadCount } = await supabase.from('crm_prospects').select('*', { count: 'exact', head: true }).eq('temperature', 'dead');
        const searches = await countLogs('commercial', 'google_search');
        const total = await countLogs('commercial');
        cards = [
          { label: 'Enrichissements lances', value: enriched, icon: '🔍' },
          { label: 'Prospects dead flagges', value: deadCount ?? 0, icon: '💀' },
          { label: 'Recherches Google', value: searches, icon: '🌐' },
          { label: 'Actions total', value: total, icon: '🎯' },
        ];
      } else if (agent === 'dm_instagram') {
        const prepared = await countLogs('dm_instagram', 'daily_preparation');
        const sent = await countLogs('dm_instagram', 'dm_sent');
        const responded = await countLogs('dm_instagram', 'dm_responded');
        const responseRate = sent > 0 ? Math.round((responded / sent) * 100) : 0;
        cards = [
          { label: 'DMs prepares', value: prepared, icon: '📩' },
          { label: 'DMs envoyes', value: sent, icon: '✅' },
          { label: 'Reponses recues', value: responded, icon: '💬' },
          { label: 'Taux de reponse', value: `${responseRate}%`, icon: '📊', trend: responseRate > 10 ? 'Bon' : 'A ameliorer', trendUp: responseRate > 10 },
        ];
      } else if (agent === 'tiktok_comments') {
        const prepared = await countLogs('tiktok_comments', 'comments_prepared');
        const posted = await countLogs('tiktok_comments', 'comment_posted');
        cards = [
          { label: 'Commentaires prepares', value: prepared, icon: '🎵' },
          { label: 'Commentaires postes', value: posted, icon: '✅' },
        ];
      } else if (agent === 'content') {
        const generated = await countLogs('content', 'daily_post_generated');
        const published = await countLogs('content', 'execute_publication');
        const planned = await countLogs('content', 'weekly_plan_generated');
        cards = [
          { label: 'Posts generes', value: generated, icon: '📱' },
          { label: 'Publications', value: published, icon: '✅' },
          { label: 'Plans semaine', value: planned, icon: '📅' },
        ];
      } else if (agent === 'seo') {
        const { count: totalArticles } = await supabase.from('blog_posts').select('*', { count: 'exact', head: true });
        const { count: publishedArticles } = await supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'published');
        const { count: draftArticles } = await supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'draft');
        const { data: viewsData } = await supabase.from('blog_posts').select('views');
        const totalViews = (viewsData || []).reduce((sum: number, a: any) => sum + (a.views || 0), 0);
        cards = [
          { label: 'Articles total', value: totalArticles ?? 0, icon: '📝' },
          { label: 'Publies', value: publishedArticles ?? 0, icon: '✅' },
          { label: 'Brouillons', value: draftArticles ?? 0, icon: '📋' },
          { label: 'Vues total', value: totalViews, icon: '👁️' },
        ];
      } else if (agent === 'onboarding') {
        const scheduled = await countLogs('onboarding', 'sequence_scheduled');
        const sent = await countLogs('onboarding', 'queue_processed');
        const completionRate = scheduled > 0 ? Math.round((sent / scheduled) * 100) : 0;
        cards = [
          { label: 'Sequences planifiees', value: scheduled, icon: '🚀' },
          { label: 'Envoyees', value: sent, icon: '✅' },
          { label: 'Taux completion', value: `${completionRate}%`, icon: '📊', trend: completionRate > 50 ? 'Bon' : 'A ameliorer', trendUp: completionRate > 50 },
        ];
      } else if (agent === 'retention') {
        const checks = await countLogs('retention', 'daily_check');
        // Count actual users at risk (orange + red health level from profiles, NOT crm_prospects)
        const { count: orangeUsers } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('health_level', 'orange');
        const { count: redUsers } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('health_level', 'red');
        const { count: totalUsers } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).not('plan', 'is', null).not('plan', 'eq', 'gratuit').not('plan', 'eq', 'free');
        const atRisk = (orangeUsers ?? 0) + (redUsers ?? 0);
        const winback = await countLogs('retention', 'winback_sent');
        cards = [
          { label: 'Checks effectues', value: checks, icon: '🔄' },
          { label: 'Utilisateurs payants', value: totalUsers ?? 0, icon: '👥' },
          { label: 'A risque (orange+red)', value: atRisk, icon: '⚠️' },
          { label: 'Win-back envoyes', value: winback, icon: '📧' },
        ];
      } else if (agent === 'ceo') {
        const briefs = await countLogs('ceo', 'daily_brief');
        cards = [
          { label: 'Briefs generes', value: briefs, icon: '👔' },
        ];
      } else if (agent === 'marketing') {
        const campaigns = await countLogs('marketing');
        const reports = await countLogs('marketing', 'report_to_ceo');
        cards = [
          { label: 'Actions marketing', value: campaigns, icon: '📊' },
          { label: 'Rapports envoyes', value: reports, icon: '📈' },
        ];
      }

      setAgentMetrics(cards);
    } catch (err) {
      console.error('[Admin Agents] Agent metrics load error:', err);
      setAgentMetrics([]);
    } finally {
      setAgentMetricsLoading(false);
    }
  };

  // ─── Send test email ──────────────────────────────────
  const sendTestEmail = async () => {
    if (!testEmail.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/agents/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: testEmail,
          step: testStep,
          category: testCategory,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, message: `Email envoy\u00E9 ! Sujet: "${data.subject}" (cat: ${data.category}, variant ${data.variant})` });
      } else {
        setTestResult({ ok: false, message: data.error || 'Erreur inconnue' });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'Erreur r\u00E9seau' });
    } finally {
      setTestSending(false);
    }
  };

  // ─── Reset dead prospects ────────────────────────────────
  const resetDeadProspects = async () => {
    if (!confirm('Remettre tous les prospects dead/perdu en identifié + cold pour relancer les séquences email ?')) return;
    setResettingDead(true);
    setResetResult(null);
    try {
      const res = await fetch('/api/agents/email/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reset_dead_prospects' }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error(await res.text().then(t => t.substring(0, 200)));
      const data = await res.json();
      if (data.ok) {
        setResetResult({ ok: true, message: `${data.reset} prospects remis en circulation (sur ${data.total_dead} dead).` });
        loadDashboard();
      } else {
        setResetResult({ ok: false, message: data.error || 'Erreur' });
      }
    } catch (err: any) {
      setResetResult({ ok: false, message: err.message || 'Erreur réseau' });
    } finally {
      setResettingDead(false);
    }
  };

  // ─── Briefs CEO ────────────────────────────────────────
  const loadBriefs = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_logs')
        .select('*')
        .eq('agent', 'ceo')
        .eq('action', 'daily_brief')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setBriefs(data || []);
    } catch (err) {
      console.error('[Admin Agents] Briefs load error:', err);
    }
  };

  const executeCeoBrief = async () => {
    setExecutingCeo(true);
    try {
      const res = await fetch('/api/agents/ceo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        await loadBriefs();
      } else {
        const data = await res.json();
        alert(`Erreur: ${data.error || 'Erreur inconnue'}`);
      }
    } catch (err) {
      console.error('[Admin Agents] CEO execution error:', err);
    } finally {
      setExecutingCeo(false);
    }
  };

  // ─── Orders ────────────────────────────────────────────
  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('[Admin Agents] Orders load error:', err);
    }
  };

  const toggleOrderSelection = (id: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllPendingOrders = () => {
    const pending = orders.filter(o => o.status === 'pending').map(o => o.id);
    setSelectedOrders(prev => prev.size === pending.length ? new Set() : new Set(pending));
  };

  const executeSelectedOrders = async () => {
    if (selectedOrders.size === 0) return;
    setExecutingOrders(true);
    try {
      const res = await fetch('/api/agents/orders/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ order_ids: Array.from(selectedOrders) }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedOrders(new Set());
        await loadOrders();
        alert(`${data.succeeded || 0} ordre(s) exécuté(s), ${data.failed || 0} échoué(s)`);
      } else {
        alert(`Erreur: ${data.error || 'Erreur inconnue'}`);
      }
    } catch (err) {
      console.error('[Admin Agents] Execute orders error:', err);
    } finally {
      setExecutingOrders(false);
    }
  };

  // ─── Logs ──────────────────────────────────────────────
  const loadLogs = async (page = 0, filter = 'all') => {
    try {
      let query = supabase
        .from('agent_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * 50, (page + 1) * 50 - 1);

      if (filter !== 'all') {
        query = query.eq('agent', filter);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setLogs(data || []);
      setLogTotal(count ?? 0);
    } catch (err) {
      console.error('[Admin Agents] Logs load error:', err);
    }
  };

  // ─── CEO Chat ────────────────────────────────────────────
  const loadCeoHistory = async () => {
    if (ceoHistoryLoaded) return;
    try {
      const res = await fetch('/api/agents/ceo?history=true', { credentials: 'include' });
      const data = await res.json();
      if (data.ok && data.messages?.length > 0) {
        setCeoMessages(data.messages);
      }
      setCeoHistoryLoaded(true);
    } catch (err) {
      console.error('[CEO Chat] Failed to load history:', err);
    }
  };

  const sendCeoMessage = async () => {
    if (!ceoInput.trim() || ceoLoading) return;
    const userMsg = ceoInput.trim();
    setCeoInput('');
    setCeoMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setCeoLoading(true);
    try {
      const res = await fetch('/api/agents/ceo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'chat',
          message: userMsg,
          history: ceoMessages,
        }),
      });
      const data = await res.json();
      if (data.ok && data.reply) {
        setCeoMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setCeoMessages(prev => [...prev, { role: 'assistant', content: `Erreur: ${data.error || 'Pas de reponse'}` }]);
      }
    } catch (err: any) {
      setCeoMessages(prev => [...prev, { role: 'assistant', content: `Erreur reseau: ${err.message}` }]);
    } finally {
      setCeoLoading(false);
    }
  };

  // ─── Agent Chat (multi-agent) ────────────────────────────
  const loadAgentHistory = async (agentId: string) => {
    if (agentHistoryLoaded[agentId]) return;
    try {
      const endpoint = agentId === 'ceo'
        ? '/api/agents/ceo?history=true'
        : `/api/agents/chat?agent=${agentId}`;
      const res = await fetch(endpoint, { credentials: 'include' });
      const data = await res.json();
      if (data.ok && data.messages?.length > 0) {
        setAgentMessages(prev => ({ ...prev, [agentId]: data.messages }));
      }
      setAgentHistoryLoaded(prev => ({ ...prev, [agentId]: true }));
    } catch (err) {
      console.error(`[Agent Chat] Failed to load history for ${agentId}:`, err);
    }
  };

  const sendAgentMessage = async () => {
    if (!agentInput.trim() || agentChatLoading) return;
    const userMsg = agentInput.trim();
    setAgentInput('');
    const currentMessages = agentMessages[selectedAgent] || [];
    setAgentMessages(prev => ({ ...prev, [selectedAgent]: [...currentMessages, { role: 'user', content: userMsg }] }));
    setAgentChatLoading(true);
    try {
      const endpoint = selectedAgent === 'ceo' ? '/api/agents/ceo' : '/api/agents/chat';
      const body = selectedAgent === 'ceo'
        ? { action: 'chat', message: userMsg, history: currentMessages }
        : { agent: selectedAgent, message: userMsg, history: currentMessages };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, error: `Réponse serveur invalide (${res.status}): ${text.substring(0, 200)}` };
      }
      if (data.ok && data.reply) {
        setAgentMessages(prev => {
          const msgs = prev[selectedAgent] || [];
          return { ...prev, [selectedAgent]: [...msgs, { role: 'assistant' as const, content: data.reply }] };
        });
      } else {
        setAgentMessages(prev => {
          const msgs = prev[selectedAgent] || [];
          return { ...prev, [selectedAgent]: [...msgs, { role: 'assistant' as const, content: `Erreur: ${data.error || 'Pas de réponse'}` }] };
        });
      }
    } catch (err: any) {
      setAgentMessages(prev => {
        const msgs = prev[selectedAgent] || [];
        return { ...prev, [selectedAgent]: [...msgs, { role: 'assistant', content: `Erreur réseau: ${err.message}` }] };
      });
    } finally {
      setAgentChatLoading(false);
    }
  };

  // Load history when switching agent
  useEffect(() => {
    if (activeTab === 'fiches' && focusedAgent) {
      const fiche = AGENT_FICHES.find(f => f.id === focusedAgent);
      if (fiche) loadAgentHistory(fiche.chatId);
    }
    if (activeTab === 'briefs' && briefs.length === 0) {
      loadBriefs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent, activeTab]);

  // ─── Campagnes ───────────────────────────────────────────
  const loadCampaigns = async (filter = 'all') => {
    try {
      let query = supabase
        .from('agent_logs')
        .select('*')
        .in('action', ['daily_cold', 'daily_warm', 'daily_preparation', 'comments_prepared', 'enrichment_run', 'daily_post_generated', 'weekly_plan_generated', 'execute_publication', 'article_generated', 'article_published', 'calendar_planned', 'queue_processed', 'sequence_scheduled', 'daily_check', 'daily_brief', 'report_to_ceo', 'reset_dead_prospects'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter === 'email') query = query.eq('agent', 'email');
      else if (filter === 'dm_instagram') query = query.eq('agent', 'dm_instagram');
      else if (filter === 'tiktok') query = query.eq('agent', 'tiktok_comments');
      else if (filter === 'content') query = query.eq('agent', 'content');
      else if (filter === 'commercial') query = query.eq('agent', 'commercial');
      else if (filter === 'seo') query = query.eq('agent', 'seo');
      else if (filter === 'onboarding') query = query.eq('agent', 'onboarding');
      else if (filter === 'retention') query = query.eq('agent', 'retention');
      else if (filter === 'ceo') query = query.eq('agent', 'ceo');
      else if (filter === 'marketing') query = query.eq('agent', 'marketing');

      const { data, error } = await query;
      if (error) throw error;

      const entries: CampaignEntry[] = (data || []).map((log: any) => {
        const d = log.data || {};
        // Handle different agent data structures
        let total = d.total || d.prepared || 0;
        let success = d.success || d.prepared || 0;
        let failed = d.failed || 0;

        // Commercial agent: phase1 + phase2 structure
        if (d.phase1_enrichment) {
          total = (d.phase1_enrichment.prospects_found || 0) + (d.phase2_social_search?.searched || 0);
          success = (d.phase1_enrichment.enriched || 0) + (d.phase2_social_search?.enriched || 0);
          failed = d.phase1_enrichment.flagged_dead || 0;
        }
        // Content agent: single post
        if (d.platform || d.format) {
          total = 1;
          success = 1;
        }

        return {
          id: log.id,
          date: log.created_at,
          agent: log.agent,
          action: log.action,
          total,
          success,
          failed,
          message: d.message || undefined,
          diagnostic: d.diagnostic || d.skipped || undefined,
          data: d,
          byBusinessType: d.by_business_type || {},
          dmExamples: d.comments || d.prepared_names?.map((n: string) => ({ name: n })) || [],
          results: d.results || d.details || [],
        };
      });
      setCampaigns(entries);

      // Load DM queue + content calendar for preview
      const { data: queueData } = await supabase
        .from('dm_queue')
        .select('id, channel, handle, message, personalization, created_at, prospect_id')
        .order('created_at', { ascending: false })
        .limit(20);

      if (queueData) {
        const prospectIds = [...new Set(queueData.map((q: any) => q.prospect_id))];
        const { data: prospects } = await supabase
          .from('crm_prospects')
          .select('id, company')
          .in('id', prospectIds);

        const nameMap: Record<string, string> = {};
        if (prospects) prospects.forEach((p: any) => { nameMap[p.id] = p.company; });

        setDmQueue(queueData.map((q: any) => ({
          ...q,
          prospect_name: nameMap[q.prospect_id] || 'Inconnu',
        })));
      }

      // Load content calendar posts
      const { data: contentData } = await supabase
        .from('content_calendar')
        .select('*')
        .order('scheduled_date', { ascending: false })
        .limit(20);
      if (contentData) setContentPosts(contentData);
    } catch (err) {
      console.error('[Admin Agents] Campaigns load error:', err);
    }
  };

  // Launch a campaign manually from the UI
  const launchCampaign = async (agentType: string) => {
    setLaunchingCampaign(agentType);
    setCampaignLaunchResult(null);
    try {
      const endpointMap: Record<string, { path: string; method: string }> = {
        'email_cold': { path: `/api/agents/email/daily?force=true${emailMode === 'draft' ? '&draft=true' : ''}`, method: 'GET' },
        'email_warm': { path: `/api/agents/email/daily?type=warm&force=true${emailMode === 'draft' ? '&draft=true' : ''}`, method: 'GET' },
        'dm_instagram': { path: '/api/agents/dm-instagram', method: 'POST' },
        'dm_tiktok': { path: '/api/agents/tiktok-comments', method: 'POST' },
        'tiktok_comments': { path: '/api/agents/tiktok-comments', method: 'POST' },
        'commercial': { path: '/api/agents/commercial', method: 'POST' },
        'commercial_verify': { path: '/api/agents/commercial', method: 'POST' },
        'commercial_prospect': { path: '/api/agents/commercial', method: 'POST' },
        'seo': { path: '/api/agents/seo', method: 'POST' },
        'onboarding': { path: '/api/agents/onboarding', method: 'GET' },
        'retention': { path: '/api/agents/retention', method: 'GET' },
        'content': { path: '/api/agents/content', method: 'POST' },
        'marketing': { path: '/api/agents/marketing', method: 'GET' },
        'community_follow': { path: '/api/agents/marketing', method: 'POST' },
        'community_comments': { path: '/api/agents/marketing', method: 'POST' },
        'community_engage': { path: '/api/agents/marketing', method: 'POST' },
      };
      const endpoint = endpointMap[agentType];
      if (!endpoint) throw new Error(`Agent inconnu: ${agentType}`);

      // Content agent needs specific action + options in body
      const bodyPayload = agentType === 'content'
        ? JSON.stringify(contentMode === 'week'
          ? { action: 'generate_week', platform: contentPlatform, publishAll: false }
          : contentMode === 'publish'
          ? { action: 'generate_post', platform: contentPlatform, draftOnly: false }
          : { action: 'generate_post', platform: contentPlatform, draftOnly: true })
        : agentType === 'seo'
        ? JSON.stringify({ action: 'generate_article' })
        : agentType === 'community_follow'
        ? JSON.stringify({ action: 'find_follow_targets', platform: communityPlatform, count: 20 })
        : agentType === 'community_comments'
        ? JSON.stringify({ action: 'prepare_comments', count: 10 })
        : agentType === 'community_engage'
        ? JSON.stringify({ action: 'engagement_plan' })
        : agentType === 'commercial_verify'
        ? JSON.stringify({ action: 'verify_crm' })
        : agentType === 'commercial_prospect'
        ? JSON.stringify({ action: 'prospect_external' })
        : endpoint.method === 'POST' ? JSON.stringify({}) : undefined;

      const res = await fetch(endpoint.path, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: bodyPayload,
      });
      // Handle non-JSON error responses (e.g. Vercel timeout, Next.js error pages)
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(text.substring(0, 200) || `Erreur serveur (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (data.ok) {
        const stats = data.stats || {};
        const emailDiag = data.diagnostic ? ` (CRM: ${data.diagnostic.total_crm}, avec email: ${data.diagnostic.with_email}, dead: ${data.diagnostic.dead}, perdu: ${data.diagnostic.perdu}, terminés: ${data.diagnostic.sequence_completed})` : '';
        const msg = agentType.startsWith('email')
          ? (data.draft
            ? `${stats.total || 0} brouillons générés — voir dans Logs`
            : `${stats.success || data.success || 0} emails envoyés, ${stats.failed || data.failed || 0} échoués${emailDiag}${data.message ? ' — ' + data.message : ''}`)
          : agentType === 'dm_instagram'
          ? `${data.prepared || data.count || 0} DMs préparés`
          : agentType === 'dm_tiktok' || agentType === 'tiktok_comments'
          ? `${data.prepared || data.count || 0} DMs/commentaires préparés`
          : agentType === 'gmaps'
          ? `${data.new_prospects || data.found || 0} prospects trouvés`
          : agentType === 'commercial' || agentType === 'commercial_verify' || agentType === 'commercial_prospect'
          ? `${data.enriched || 0} prospects enrichis${data.social_enriched ? `, ${data.social_enriched} social` : ''}`
          : agentType === 'content'
          ? `${data.postsPlanned || data.published || (data.post ? 1 : 0)} post(s) généré(s)`
          : agentType === 'community_follow'
          ? `${data.targets_inserted || 0} comptes à suivre trouvés (${data.targets_found || 0} total)`
          : agentType === 'community_comments'
          ? `${data.comments_inserted || 0} commentaires préparés (${data.posts_found || 0} posts trouvés)`
          : agentType === 'community_engage'
          ? 'Plan d\'engagement généré — voir dans Logs'
          : agentType === 'marketing'
          ? `Analyse marketing terminée (${data.learnings_extracted || 0} apprentissages)`
          : 'Tâche exécutée avec succès';
        setCampaignLaunchResult({ ok: true, message: msg });
        if (agentType === 'content') loadContentCalendar();
        // Reload campaigns to show new entry
        loadCampaigns(campaignFilter);
      } else {
        setCampaignLaunchResult({ ok: false, message: data.error || 'Erreur inconnue' });
      }
    } catch (err: any) {
      setCampaignLaunchResult({ ok: false, message: err.message || 'Erreur réseau' });
    } finally {
      setLaunchingCampaign(null);
    }
  };

  const loadContentCalendar = async () => {
    setLoadingCalendar(true);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'calendar', startDate: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0], endDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0] }),
      });
      const data = await res.json();
      if (data.ok) setContentCalendar(data.posts || []);
    } catch (e) { console.error(e); }
    setLoadingCalendar(false);
  };

  // ─── Tab change handler ────────────────────────────────
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setFocusedAgent(null);
    switch (tab) {
      case 'fiches':
        loadDashboard();
        loadAgentStatuses();
        break;
      case 'campagnes':
        loadCampaigns(campaignFilter);
        break;
      case 'ordres':
        loadOrders();
        break;
      case 'logs':
        loadLogs(0, logFilter);
        break;
    }
  };

  // ─── SEO data loader ────────────────────────────────
  const loadSeoData = async () => {
    try {
      const { data: articles } = await supabase
        .from('blog_posts')
        .select('id, title, slug, keywords_primary, status, published_at, created_at, views')
        .order('created_at', { ascending: false })
        .limit(50);

      setSeoArticles((articles || []) as SeoArticle[]);

      const all = articles || [];
      setSeoStats({
        total: all.length,
        published: all.filter((a: any) => a.status === 'published').length,
        drafts: all.filter((a: any) => a.status === 'draft').length,
      });
    } catch (err) {
      console.error('[Admin SEO] Error loading:', err);
    }
  };

  const handleSeoGenerate = async () => {
    setSeoGenerating(true);
    try {
      const res = await fetch('/api/agents/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'generate_article' }),
      });
      if (!res.ok && res.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`Erreur serveur (${res.status})`);
      }
      const data = await res.json();
      if (data.ok) {
        loadSeoData();
      } else {
        alert('Erreur: ' + (data.error || 'Echec generation'));
      }
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    } finally {
      setSeoGenerating(false);
    }
  };

  const handleSeoPublish = async (articleId: string) => {
    setSeoPublishing(articleId);
    try {
      const res = await fetch('/api/agents/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'publish', article_id: articleId }),
      });
      if (!res.ok && res.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`Erreur serveur (${res.status})`);
      }
      const data = await res.json();
      if (data.ok) {
        loadSeoData();
      } else {
        alert('Erreur: ' + (data.error || 'Echec publication'));
      }
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    } finally {
      setSeoPublishing(null);
    }
  };

  // ─── Onboarding data loader ────────────────────────────
  const loadOnboardingData = async () => {
    try {
      const { data: items } = await supabase
        .from('onboarding_queue')
        .select('id, user_id, step_key, plan, scheduled_at, sent_at, status, message_text')
        .order('scheduled_at', { ascending: false })
        .limit(50);

      // Enrich with profile names
      const enriched = [];
      for (const item of items || []) {
        const { data: profile } = await supabase.from('profiles').select('first_name, business_type').eq('id', item.user_id).single();
        enriched.push({ ...item, first_name: profile?.first_name, business_type: profile?.business_type });
      }
      setOnboardingItems(enriched as OnboardingItem[]);

      const pending = enriched.filter(i => i.status === 'pending').length;
      const sent = enriched.filter(i => i.status === 'sent').length;
      const alerts = enriched.filter(i => i.status === 'alert_sent').length;
      setOnboardingStats({ pending, sent, alerts });
    } catch (err) {
      console.error('Failed to load onboarding data:', err);
    }
  };

  // ─── Retention data loader ────────────────────────────
  const loadRetentionData = async () => {
    try {
      const res = await fetch('/api/agents/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'stats' }),
      });
      const statsData = await res.json();
      if (statsData.ok) setRetentionStats(statsData);

      const res2 = await fetch('/api/agents/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'clients' }),
      });
      const clientsData = await res2.json();
      if (clientsData.ok) setRetentionClients(clientsData.clients || []);
    } catch (err) {
      console.error('Failed to load retention data:', err);
    }
  };

  // ─── Content data loader ────────────────────────────
  const loadContentData = async () => {
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'stats' }),
      });
      const data = await res.json();
      if (data.ok) setContentStats(data.stats);

      const res2 = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'calendar' }),
      });
      const calData = await res2.json();
      if (calData.ok) setContentPosts(calData.posts || []);
    } catch (err) {
      console.error('Failed to load content data:', err);
    }
  };

  const handleContentGenerate = async (type: 'generate_weekly' | 'generate_post') => {
    setContentGenerating(true);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: type,
          ...(contentPlatform !== 'all' && { platform: contentPlatform }),
          draftOnly: contentDraftOnly,
          publish_mode: publishMode,
        }),
      });
      const data = await res.json();
      if (data.ok) loadContentData();
      else alert('Erreur: ' + (data.error || 'Echec'));
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    } finally {
      setContentGenerating(false);
    }
  };

  const handleFixCaptions = async () => {
    if (!confirm('Reformater toutes les captions (draft/approved/published) au nouveau format aéré ?')) return;
    setFixingCaptions(true);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'fix_captions', limit: 50 }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`✅ ${data.fixed}/${data.total} captions reformatées`);
        loadContentData();
      } else alert('Erreur: ' + (data.error || 'Echec'));
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    } finally {
      setFixingCaptions(false);
    }
  };

  const handleContentAction = async (postId: string, action: 'approve' | 'publish' | 'skip', platform?: string) => {
    try {
      const payload: any = { action, postId };
      if (platform) payload.platform = platform;
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        loadContentData();
        if (data.errors?.length) alert('Publié avec erreurs: ' + data.errors.join(', '));
      } else alert('Erreur: ' + (data.errors?.join(', ') || data.error));
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Supprimer ce post définitivement ?')) return;
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'delete_post', postId }),
      });
      const data = await res.json();
      if (data.ok) { setPreviewPost(null); loadContentData(); }
      else alert('Erreur: ' + data.error);
    } catch (err: any) { alert('Erreur: ' + err.message); }
  };

  const handleResetToDraft = async (postId: string) => {
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reset_to_draft', postId }),
      });
      const data = await res.json();
      if (data.ok) { setPreviewPost(null); loadContentData(); }
      else alert('Erreur: ' + data.error);
    } catch (err: any) { alert('Erreur: ' + err.message); }
  };

  const [modifyingPost, setModifyingPost] = useState<string | null>(null);
  const handleModifyPost = async (postId: string, instruction?: string) => {
    const instr = instruction || prompt('Instruction de modification (ex: "rends-le plus punchy", "ajoute un CTA"):', 'Améliore ce post pour le rendre plus engageant');
    if (!instr) return;
    setModifyingPost(postId);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'modify_post', postId, instruction: instr }),
      });
      const data = await res.json();
      if (data.ok) { setPreviewPost(null); loadContentData(); }
      else alert('Erreur: ' + data.error);
    } catch (err: any) { alert('Erreur: ' + err.message); }
    finally { setModifyingPost(null); }
  };

  // ─── Helper: priority badge ────────────────────────────
  const priorityBadge = (priority: string) => {
    const cls =
      priority === 'haute'
        ? 'bg-red-100 text-red-700'
        : priority === 'moyenne'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-green-100 text-green-700';
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls}`}>
        {priority}
      </span>
    );
  };

  // ─── Helper: status badge ─────────────────────────────
  const statusBadge = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminé',
      failed: 'Échoué',
    };
    const cls =
      status === 'pending'
        ? 'bg-amber-100 text-amber-700'
        : status === 'in_progress'
        ? 'bg-[#0c1a3a]/10 text-[#0c1a3a]'
        : status === 'completed'
        ? 'bg-green-100 text-green-700'
        : status === 'failed'
        ? 'bg-red-100 text-red-700'
        : 'bg-neutral-100 text-neutral-600';
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls} ${status === 'in_progress' ? 'animate-pulse' : ''}`}>
        {labels[status] || status}
      </span>
    );
  };

  // ─── Helper: agent badge ──────────────────────────────
  const agentBadge = (agent: string) => {
    const cls =
      agent === 'ceo'
        ? 'bg-purple-100 text-purple-700'
        : agent === 'chatbot'
        ? 'bg-[#0c1a3a]/10 text-[#0c1a3a]'
        : agent === 'email'
        ? 'bg-green-100 text-green-700'
        : 'bg-neutral-100 text-neutral-600';
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls}`}>
        {agent}
      </span>
    );
  };

  // ─── Helper: performance badge ─────────────────────────
  const performanceBadge = (perf: string | undefined) => {
    if (!perf) return null;
    const cls =
      perf === 'excellent'
        ? 'bg-green-100 text-green-700'
        : perf === 'bon'
        ? 'bg-[#0c1a3a]/10 text-[#0c1a3a]'
        : perf === 'moyen'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700';
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
        {perf}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'fiches', label: 'Agents' },
    { key: 'briefs', label: 'Briefs CEO' },
    { key: 'campagnes', label: 'Campagnes' },
    { key: 'ordres', label: 'Ordres' },
    { key: 'logs', label: 'Logs' },
    { key: 'avatars', label: 'Avatars' },
  ];

  return (
    <div className="bg-gradient-to-b from-neutral-50 to-white min-h-screen">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-neutral-500 mb-1">
              <Link href="/mon-compte" className="hover:text-neutral-700">
                Mon compte
              </Link>
              <span>/</span>
              <span className="text-purple-600 font-medium">Agents IA</span>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-700 to-[#1e3a5f] bg-clip-text text-transparent">
              Agents IA
            </h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Supervision du système multi-agents KeiroAI
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/crm"
              className="text-sm text-white bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-all font-medium shadow-sm"
            >
              CRM Commercial
            </Link>
            <Link
              href="/admin/dm-queue"
              className="text-sm text-purple-600 hover:text-purple-800 px-4 py-2 border border-purple-200 rounded-lg hover:bg-purple-50 transition-all font-medium"
            >
              Suivi & Publi
            </Link>
            <Link
              href="/mon-compte"
              className="text-sm text-neutral-600 hover:text-neutral-900 px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-all"
            >
              Retour
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-neutral-100 rounded-xl p-1 mb-6 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`shrink-0 py-2.5 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-white shadow-sm text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== TAB FICHES AGENTS ===== */}
        {activeTab === 'fiches' && !focusedAgent && (
          <div className="space-y-8">
            {/* Service teams with agent cards */}
            {SERVICE_TEAMS.map(team => {
              const teamFiches = AGENT_FICHES.filter(f => team.agents.includes(f.id));
              const teamActive = teamFiches.some(f => agentStatuses[f.id]?.status === 'active');
              const teamActions = teamFiches.reduce((sum, f) => sum + (agentStatuses[f.id]?.count24h || 0), 0);
              return (
                <div key={team.id} className="space-y-3">
                  {/* Team header */}
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${team.color} flex items-center justify-center text-base shadow-sm`}>
                      {team.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">{team.name}</h3>
                      <p className="text-[10px] text-neutral-500">{teamFiches.length} agents &middot; {teamActions} actions/24h</p>
                    </div>
                    <div className={`ml-auto w-2 h-2 rounded-full ${teamActive ? 'bg-green-500' : 'bg-neutral-300'}`} />
                  </div>
                  {/* Agent cards within team */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-2 border-l-2 border-neutral-100">
              {teamFiches.map(fiche => {
                const st = agentStatuses[fiche.id];
                const statusDot = st?.status === 'active' ? 'bg-green-500' : st?.status === 'idle' ? 'bg-yellow-500' : st?.status === 'error' ? 'bg-red-500' : 'bg-neutral-300';
                const statusLabel = st?.status === 'active' ? 'Actif' : st?.status === 'idle' ? 'Inactif 24h+' : st?.status === 'error' ? 'Erreur' : 'Hors ligne';
                const lastRunText = st?.lastRun ? new Date(st.lastRun).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Jamais';
                return (
                  <div
                    key={fiche.id}
                    onClick={() => openFiche(fiche.id)}
                    className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5 hover:shadow-lg hover:border-purple-300 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${fiche.gradient} flex items-center justify-center text-xl shadow-sm`}>
                        {fiche.icon}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${statusDot}`} />
                        <span className="text-[10px] text-neutral-500">{statusLabel}</span>
                      </div>
                    </div>
                    <h3 className="text-sm font-bold text-neutral-900 mb-1 group-hover:text-purple-700 transition-colors">{fiche.name}</h3>
                    <p className="text-xs text-neutral-500 mb-3 leading-relaxed">{fiche.description}</p>
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 border-t border-neutral-100 pt-3">
                      <span>Dernière exécution : {lastRunText}</span>
                      <span className="font-medium text-purple-600">{st?.count24h ?? 0} actions/24h</span>
                    </div>
                  </div>
                );
              })}
                  </div>
                </div>
              );
            })}

            {/* Global KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {metrics.map((m, i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">{m.icon}</span>
                    {m.trend && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${m.trendUp ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {m.trend}
                      </span>
                    )}
                  </div>
                  <p className="text-xl font-bold text-neutral-900">{m.value}</p>
                  <p className="text-[10px] text-neutral-500 mt-1">{m.label}</p>
                </div>
              ))}
            </div>

            {/* Quick tools */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">Tester un email</h3>
                <div className="flex flex-wrap gap-2 items-end">
                  <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="email@test.com" className="flex-1 min-w-[140px] px-3 py-1.5 border border-neutral-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" />
                  <select value={testCategory} onChange={(e) => setTestCategory(e.target.value)} className="px-2 py-1.5 border border-neutral-200 rounded-lg text-xs">
                    <option value="restaurant">Restaurant</option><option value="boutique">Boutique</option><option value="coach">Coach</option><option value="agence">Agence</option><option value="pme">PME</option>
                  </select>
                  <select value={testStep} onChange={(e) => setTestStep(Number(e.target.value))} className="px-2 py-1.5 border border-neutral-200 rounded-lg text-xs">
                    <option value={1}>Step 1</option><option value={2}>Step 2</option><option value={3}>Step 3</option><option value={10}>Warm</option>
                  </select>
                  <button onClick={sendTestEmail} disabled={testSending || !testEmail.trim()} className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50">
                    {testSending ? 'Envoi...' : 'Tester'}
                  </button>
                </div>
                {testResult && <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{testResult.message}</div>}
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-red-100 p-5">
                <h3 className="text-sm font-semibold text-neutral-900 mb-1">Pipeline bloqué ?</h3>
                <p className="text-[10px] text-neutral-500 mb-3">Remet les prospects dead/perdu en circulation.</p>
                <button onClick={resetDeadProspects} disabled={resettingDead} className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {resettingDead ? 'Reset...' : 'Reset prospects dead'}
                </button>
                {resetResult && <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${resetResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{resetResult.message}</div>}
              </div>
            </div>

            {/* ═══ WARM/HOT PROSPECTS — CALL LIST ═══ */}
            <div className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-orange-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔥</span>
                  <h3 className="text-sm font-bold text-neutral-900">Prospects chauds à appeler ({warmProspects.length})</h3>
                </div>
                <button onClick={loadWarmProspects} className="text-xs text-purple-600 hover:underline">Actualiser</button>
              </div>
              {warmLoading ? (
                <div className="p-6 text-center text-neutral-400 text-xs">Chargement...</div>
              ) : warmProspects.length === 0 ? (
                <div className="p-6 text-center text-neutral-400 text-xs">Aucun prospect chaud pour le moment</div>
              ) : (
                <div className="divide-y divide-neutral-100 max-h-[400px] overflow-y-auto">
                  {warmProspects.map(p => (
                    <div
                      key={p.id}
                      onClick={() => openWarmProspect(p)}
                      className="px-5 py-3 hover:bg-orange-50 cursor-pointer transition-colors flex items-center gap-4"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.temperature === 'hot' ? 'bg-red-500' : 'bg-orange-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-neutral-900 truncate">{p.company}</span>
                          {p.type && <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-500">{p.type}</span>}
                          {p.score && <span className="text-[10px] font-bold text-purple-600">{p.score}pts</span>}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-neutral-400 mt-0.5">
                          {p.email && <span>📧 {p.email}</span>}
                          {p.phone && <span>📞 {p.phone}</span>}
                          {p.instagram_handle && <span>📸 @{p.instagram_handle}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {p.last_email_opened_at && !p.last_email_clicked_at && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">📞 A ouvert le mail</span>
                        )}
                        {p.email_sequence_step && (
                          <span className="text-[9px] text-neutral-400">Step {p.email_sequence_step}</span>
                        )}
                        {p.status && (
                          <span className="text-[9px] text-neutral-400">{p.status}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ PROSPECT DETAIL SLIDE-OUT ═══ */}
        {selectedWarmProspect && (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedWarmProspect(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-full sm:max-w-[480px] bg-white shadow-2xl overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 z-10 bg-gradient-to-r from-orange-500 to-red-500 px-6 py-5 text-white">
                <button onClick={() => setSelectedWarmProspect(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">✕</button>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${selectedWarmProspect.temperature === 'hot' ? 'bg-red-600' : 'bg-orange-600'}`}>
                    {selectedWarmProspect.temperature === 'hot' ? '🔥' : '🌡️'}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{selectedWarmProspect.company}</h2>
                    <div className="flex items-center gap-2 text-white/80 text-xs">
                      {selectedWarmProspect.type && <span>{selectedWarmProspect.type}</span>}
                      {selectedWarmProspect.quartier && <span>• {selectedWarmProspect.quartier}</span>}
                      {selectedWarmProspect.score && <span>• {selectedWarmProspect.score} pts</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Editable contact info */}
              <div className="px-6 py-4 border-b border-neutral-100 space-y-3">
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Contact</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-neutral-400">Entreprise</label>
                    <input value={editingProspect.company || ''} onChange={e => setEditingProspect(p => ({ ...p, company: e.target.value }))} className="w-full text-sm border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-400">Type</label>
                    <input value={editingProspect.type || ''} onChange={e => setEditingProspect(p => ({ ...p, type: e.target.value }))} className="w-full text-sm border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-400">📧 Email</label>
                    <input value={editingProspect.email || ''} onChange={e => setEditingProspect(p => ({ ...p, email: e.target.value }))} className="w-full text-sm border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-400">📞 Téléphone</label>
                    <input value={editingProspect.phone || ''} onChange={e => setEditingProspect(p => ({ ...p, phone: e.target.value }))} className="w-full text-sm border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-400">📸 Instagram</label>
                    <input value={editingProspect.instagram_handle || ''} onChange={e => setEditingProspect(p => ({ ...p, instagram_handle: e.target.value }))} className="w-full text-sm border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-400">📍 Quartier</label>
                    <input value={editingProspect.quartier || ''} onChange={e => setEditingProspect(p => ({ ...p, quartier: e.target.value }))} className="w-full text-sm border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400">📝 Notes</label>
                  <textarea value={editingProspect.notes || ''} onChange={e => setEditingProspect(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full text-sm border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none" />
                </div>
                <button onClick={saveProspectEdits} disabled={savingProspect} className="w-full py-2 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
                  {savingProspect ? 'Sauvegarde...' : 'Sauvegarder les modifications'}
                </button>
              </div>

              {/* Email engagement tracking */}
              <div className="px-6 py-4 border-b border-neutral-100">
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Email tracking</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-neutral-50 rounded-lg p-3">
                    <div className="text-[10px] text-neutral-400">Séquence</div>
                    <div className="font-bold text-neutral-900">{selectedWarmProspect.email_sequence_status || 'Aucune'}</div>
                    <div className="text-neutral-500">Step {selectedWarmProspect.email_sequence_step || 0}</div>
                  </div>
                  <div className="bg-neutral-50 rounded-lg p-3">
                    <div className="text-[10px] text-neutral-400">Dernier envoi</div>
                    <div className="font-bold text-neutral-900">{selectedWarmProspect.last_email_sent_at ? new Date(selectedWarmProspect.last_email_sent_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                  </div>
                  {selectedWarmProspect.last_email_opened_at && (
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="text-[10px] text-green-600">Ouvert</div>
                      <div className="font-bold text-green-700">{new Date(selectedWarmProspect.last_email_opened_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  )}
                  {selectedWarmProspect.last_email_clicked_at && (
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-[10px] text-blue-600">Cliqué</div>
                      <div className="font-bold text-blue-700">{new Date(selectedWarmProspect.last_email_clicked_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  )}
                </div>
                {selectedWarmProspect.last_email_opened_at && !selectedWarmProspect.last_email_clicked_at && (
                  <div className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium">
                    📞 Ce prospect a ouvert le mail mais pas cliqué — bon moment pour appeler !
                  </div>
                )}
              </div>

              {/* Activity timeline */}
              <div className="px-6 py-4">
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Historique d&apos;activités</h3>
                {warmActivitiesLoading ? (
                  <div className="text-center text-neutral-400 text-xs py-4">Chargement...</div>
                ) : warmActivities.length === 0 ? (
                  <div className="text-center text-neutral-400 text-xs py-4">Aucune activité</div>
                ) : (
                  <div className="space-y-3">
                    {warmActivities.map((a, i) => {
                      const typeIcons: Record<string, string> = { email: '✉️', email_sent: '📤', email_opened: '📧', email_clicked: '🔗', email_replied: '💬', dm_sent: '📩', dm_replied: '💬', call: '📞', note: '📝', meeting: '📅', status_change: '🔄', webhook_opened: '👁️', webhook_clicked: '🖱️' };
                      return (
                        <div key={a.id || i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-xs">{typeIcons[a.type] || '📌'}</div>
                            {i < warmActivities.length - 1 && <div className="w-px flex-1 bg-neutral-200 mt-1" />}
                          </div>
                          <div className="flex-1 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-neutral-700">{a.type?.replace(/_/g, ' ')}</span>
                              <span className="text-[10px] text-neutral-400">{new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {a.description && <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">{a.description.substring(0, 200)}</p>}
                            {a.data && a.data.subject && <p className="text-[10px] text-purple-600 mt-0.5">Objet : {a.data.subject}</p>}
                            {a.result && <p className="text-[10px] text-neutral-400 mt-0.5">Résultat : {a.result}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== FOCUSED AGENT DETAIL VIEW ===== */}
        {activeTab === 'fiches' && focusedAgent && (() => {
          const fiche = AGENT_FICHES.find(f => f.id === focusedAgent);
          if (!fiche) return null;
          const ficheOrders = orders.filter(o => fiche.logAgents.includes(o.from_agent) || fiche.logAgents.includes(o.to_agent));
          return (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setFocusedAgent(null)} className="text-sm text-purple-600 hover:text-purple-800 font-medium">{'←'} Toutes les fiches</button>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${fiche.gradient} flex items-center justify-center text-xl shadow-sm`}>{fiche.icon}</div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">{fiche.name}</h2>
                  <p className="text-xs text-neutral-500">{fiche.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${agentStatuses[fiche.id]?.status === 'active' ? 'bg-green-500' : agentStatuses[fiche.id]?.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                <span className="text-xs text-neutral-500">{agentStatuses[fiche.id]?.count24h ?? 0} actions/24h</span>
              </div>
            </div>

            {/* Agent metrics */}
            {agentMetricsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : agentMetrics.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {agentMetrics.map((m, i) => (
                  <div key={i} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg">{m.icon}</span>
                      {m.trend && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${m.trendUp ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{m.trend}</span>}
                    </div>
                    <p className="text-xl font-bold text-neutral-900">{m.value}</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">{m.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Sub-tabs */}
            <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5">
              {([
                { key: 'overview', label: "Vue d'ensemble" },
                { key: 'chat', label: 'Chat' },
                { key: 'ordres', label: `Ordres (${ficheOrders.length})` },
                { key: 'logs', label: 'Logs' },
              ] as { key: FicheSubTab; label: string }[]).map(st => (
                <button key={st.key} onClick={() => {
                  setFicheSubTab(st.key);
                  if (st.key === 'ordres') loadOrders();
                  if (st.key === 'logs') { setLogFilter(fiche.logAgents[0]); loadLogs(0, fiche.logAgents[0]); }
                }} className={`py-2 px-4 rounded-md text-xs font-medium transition-all ${ficheSubTab === st.key ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
                  {st.label}
                </button>
              ))}
            </div>

            {/* ── Sub-tab: Overview ── */}
            {ficheSubTab === 'overview' && (
              <div className="space-y-6">
                {/* CEO: Briefs */}
                {focusedAgent === 'ceo' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-neutral-900">Briefs CEO</h3>
                      <button onClick={executeCeoBrief} disabled={executingCeo} className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50">
                        {executingCeo ? 'G\u00E9n\u00E9ration...' : 'G\u00E9n\u00E9rer brief'}
                      </button>
                    </div>
                    {briefs.length === 0 ? (
                      <div className="bg-white rounded-xl shadow-sm border p-6 text-center text-neutral-400 text-sm">Aucun brief.</div>
                    ) : briefs.slice(0, 5).map(b => (
                      <div key={b.id} className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-neutral-400">{new Date(b.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          <button onClick={() => setExpandedBrief(expandedBrief === b.id ? null : b.id)} className="text-xs text-purple-600 hover:underline">{expandedBrief === b.id ? 'Fermer' : 'D\u00E9tails'}</button>
                        </div>
                        {expandedBrief === b.id && <pre className="text-xs text-neutral-700 whitespace-pre-wrap bg-neutral-50 rounded p-3 mt-2 max-h-[400px] overflow-y-auto">{typeof b.data === 'string' ? b.data : JSON.stringify(b.data, null, 2)}</pre>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Commercial: Mini CRM */}
                {focusedAgent === 'commercial' && miniCrmStats && (
                  <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-neutral-900">Aper\u00E7u Commercial</h3>
                      <Link href="/admin/crm" className="text-xs text-white bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded-lg font-medium">Ouvrir CRM</Link>
                    </div>
                    {miniCrmStats.funnel?.stages && (
                      <div className="flex flex-wrap gap-2">
                        {miniCrmStats.funnel.stages.map((s: any, i: number) => {
                          const nextRate = miniCrmStats.funnel.conversionRates?.[i];
                          return (
                            <div key={s.stage} className="flex items-center gap-1">
                              <div className="text-center px-3 py-2 bg-neutral-50 rounded-lg border border-neutral-100 min-w-[70px]">
                                <p className="text-[10px] text-neutral-500 font-medium">{s.stage}</p>
                                <p className="text-lg font-bold text-neutral-900">{s.current}</p>
                              </div>
                              {nextRate && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${nextRate.rate > 15 ? 'text-green-700 bg-green-50' : nextRate.rate >= 5 ? 'text-yellow-700 bg-yellow-50' : 'text-red-700 bg-red-50'}`}>{nextRate.rate.toFixed(0)}%</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Email: Test + Reset */}
                {focusedAgent === 'email' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl shadow-sm border p-5">
                      <h3 className="text-sm font-bold text-neutral-900 mb-3">Tester un email</h3>
                      <div className="flex flex-wrap gap-2 items-end">
                        <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="email@test.com" className="flex-1 min-w-[160px] px-3 py-1.5 border border-neutral-200 rounded-lg text-xs" />
                        <select value={testCategory} onChange={(e) => setTestCategory(e.target.value)} className="px-2 py-1.5 border border-neutral-200 rounded-lg text-xs">
                          <option value="restaurant">Restaurant</option><option value="boutique">Boutique</option><option value="coach">Coach</option><option value="agence">Agence</option>
                        </select>
                        <select value={testStep} onChange={(e) => setTestStep(Number(e.target.value))} className="px-2 py-1.5 border border-neutral-200 rounded-lg text-xs">
                          <option value={1}>Step 1</option><option value={2}>Step 2</option><option value={3}>Step 3</option><option value={10}>Warm</option>
                        </select>
                        <button onClick={sendTestEmail} disabled={testSending || !testEmail.trim()} className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50">
                          {testSending ? 'Envoi...' : 'Tester'}
                        </button>
                      </div>
                      {testResult && <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{testResult.message}</div>}
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-red-100 p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-900">Pipeline bloqu\u00E9 ?</h3>
                          <p className="text-[10px] text-neutral-500 mt-1">Remet les prospects dead/perdu en circulation.</p>
                        </div>
                        <button onClick={resetDeadProspects} disabled={resettingDead} className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                          {resettingDead ? 'Reset...' : 'Reset dead'}
                        </button>
                      </div>
                      {resetResult && <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${resetResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{resetResult.message}</div>}
                    </div>
                  </div>
                )}

                {/* SEO: Articles */}
                {focusedAgent === 'seo' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">{seoStats.total} articles ({seoStats.published} publi\u00E9s, {seoStats.drafts} brouillons)</span>
                      <div className="flex gap-2">
                        <button onClick={handleSeoGenerate} disabled={seoGenerating} className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50">
                          {seoGenerating ? 'G\u00E9n\u00E9ration...' : 'G\u00E9n\u00E9rer article'}
                        </button>
                        <button onClick={loadSeoData} className="text-xs text-purple-600 hover:underline">Actualiser</button>
                      </div>
                    </div>
                    {seoArticles.length === 0 ? (
                      <div className="bg-white rounded-xl shadow-sm border p-6 text-center text-neutral-400 text-sm">Aucun article.</div>
                    ) : (
                      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        {seoArticles.map(a => (
                          <div key={a.id} className="px-4 py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-neutral-900">{a.title}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{a.status}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-neutral-400">{a.views} vues</span>
                                {a.status === 'draft' && <button onClick={() => handleSeoPublish(a.id)} disabled={seoPublishing === a.id} className="text-xs text-purple-600 hover:underline disabled:opacity-50">{seoPublishing === a.id ? 'Publication...' : 'Publier'}</button>}
                              </div>
                            </div>
                            <div className="text-[10px] text-neutral-400 mt-1">{a.keywords_primary} — {new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Onboarding */}
                {focusedAgent === 'onboarding' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'En attente', value: onboardingStats.pending, icon: '\u23F3', color: 'text-amber-600' },
                        { label: 'Envoy\u00E9s', value: onboardingStats.sent, icon: '\u2705', color: 'text-green-600' },
                        { label: 'Alertes', value: onboardingStats.alerts, icon: '\uD83D\uDEA8', color: 'text-red-600' },
                      ].map((s, i) => (
                        <div key={i} className="bg-white rounded-xl shadow-sm border p-3 text-center">
                          <div className="text-lg mb-1">{s.icon}</div>
                          <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                          <div className="text-[10px] text-neutral-500">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={loadOnboardingData} className="text-xs text-purple-600 hover:underline">Actualiser</button>
                      <select value={onboardingFilter} onChange={e => setOnboardingFilter(e.target.value)} className="text-xs border border-neutral-200 rounded-lg px-2 py-1">
                        <option value="all">Tous</option><option value="pending">En attente</option><option value="sent">Envoy\u00E9s</option><option value="alert_sent">Alertes</option>
                      </select>
                    </div>
                    {onboardingItems.filter(i => onboardingFilter === 'all' || i.status === onboardingFilter).length === 0 ? (
                      <div className="bg-white rounded-xl shadow-sm border p-6 text-center text-neutral-400 text-sm">Aucun onboarding.</div>
                    ) : (
                      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        {onboardingItems.filter(i => onboardingFilter === 'all' || i.status === onboardingFilter).map(item => (
                          <div key={item.id} className="px-4 py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{item.first_name || 'Client'}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{item.plan}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0c1a3a]/10 text-[#0c1a3a]">{item.step_key}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.status === 'sent' ? 'bg-green-100 text-green-700' : item.status === 'pending' ? 'bg-amber-100 text-amber-700' : item.status === 'alert_sent' ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-600'}`}>{item.status}</span>
                              </div>
                              <span className="text-[10px] text-neutral-400">{new Date(item.scheduled_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {item.message_text && <div className="text-xs text-neutral-600 bg-neutral-50 rounded p-2 mt-1 whitespace-pre-line">{item.message_text.substring(0, 200)}{item.message_text.length > 200 ? '...' : ''}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Retention */}
                {focusedAgent === 'retention' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {[
                        { label: 'Actifs', value: retentionStats.green, color: 'bg-green-500', textColor: 'text-green-700' },
                        { label: 'Baisse', value: retentionStats.yellow, color: 'bg-yellow-500', textColor: 'text-yellow-700' },
                        { label: 'Inactifs', value: retentionStats.orange, color: 'bg-orange-500', textColor: 'text-orange-700' },
                        { label: 'Danger', value: retentionStats.red, color: 'bg-red-500', textColor: 'text-red-700' },
                        { label: 'MRR en jeu', value: `${retentionStats.mrrAtRisk}\u20AC`, color: 'bg-purple-500', textColor: 'text-purple-700' },
                        { label: 'Total', value: retentionStats.totalClients, color: 'bg-neutral-500', textColor: 'text-neutral-700' },
                      ].map((s, i) => (
                        <div key={i} className="bg-white rounded-xl shadow-sm border p-3 text-center">
                          <div className={`w-3 h-3 rounded-full ${s.color} mx-auto mb-1`} />
                          <div className={`text-lg font-bold ${s.textColor}`}>{s.value}</div>
                          <div className="text-[10px] text-neutral-500">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <button onClick={loadRetentionData} className="text-xs text-purple-600 hover:underline">Actualiser</button>
                    {retentionClients.length === 0 ? (
                      <div className="bg-white rounded-xl shadow-sm border p-6 text-center text-neutral-400 text-sm">Aucun client \u00E0 risque.</div>
                    ) : (
                      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <div className="grid grid-cols-7 gap-2 px-4 py-2 bg-neutral-50 text-[10px] font-semibold text-neutral-500 uppercase">
                          <span>Client</span><span>Plan</span><span>Score</span><span>Inactif</span><span>Cr\u00E9ations/sem</span><span>Renouvellement</span><span>Dernier msg</span>
                        </div>
                        {retentionClients.map(c => (
                          <div key={c.user_id} className="grid grid-cols-7 gap-2 px-4 py-3 items-center border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                            <div>
                              <div className="text-sm font-medium">{c.first_name || 'Client'}</div>
                              <div className="text-[10px] text-neutral-400">{c.business_type || ''}</div>
                            </div>
                            <span className="text-xs">{c.plan}</span>
                            <div className="flex items-center gap-1">
                              <div className={`w-2 h-2 rounded-full ${c.health_level === 'green' ? 'bg-green-500' : c.health_level === 'yellow' ? 'bg-yellow-500' : c.health_level === 'orange' ? 'bg-orange-500' : 'bg-red-500'}`} />
                              <span className="text-xs font-medium">{c.health_score}/100</span>
                            </div>
                            <span className="text-xs">{c.days_since_login}j</span>
                            <span className="text-xs">{c.weekly_generations}</span>
                            <span className="text-xs">{c.days_to_renewal ? `${c.days_to_renewal}j` : '-'}</span>
                            <span className="text-[10px] text-neutral-400">{c.last_message_type || '-'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Contenu & Social */}
                {focusedAgent === 'contenu_social' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Total', value: contentStats.total, icon: '\uD83D\uDCF1' },
                        { label: 'Publi\u00E9s', value: contentStats.published, icon: '\u2705' },
                        { label: 'Approuv\u00E9s', value: contentStats.approved, icon: '\uD83D\uDC4D' },
                        { label: 'Brouillons', value: contentStats.drafts, icon: '\uD83D\uDCDD' },
                      ].map((s, i) => (
                        <div key={i} className="bg-white rounded-xl shadow-sm border p-3 text-center">
                          <div className="text-lg mb-1">{s.icon}</div>
                          <div className="text-xl font-bold text-neutral-900">{s.value}</div>
                          <div className="text-[10px] text-neutral-500">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-neutral-500">Par plateforme :</span>
                      <span className="px-2 py-0.5 rounded bg-pink-100 text-pink-700">IG: {contentStats.byPlatform?.instagram || 0}</span>
                      <span className="px-2 py-0.5 rounded bg-neutral-800 text-white">TK: {contentStats.byPlatform?.tiktok || 0}</span>
                      <span className="px-2 py-0.5 rounded bg-[#0c1a3a]/10 text-[#0c1a3a]">LI: {contentStats.byPlatform?.linkedin || 0}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5">
                        {(['all', 'instagram', 'tiktok', 'linkedin'] as const).map(val => (
                          <button key={val} onClick={() => setContentPlatform(val)} className={`text-xs px-2.5 py-1 rounded-md transition-all ${contentPlatform === val ? 'bg-white shadow text-neutral-900 font-medium' : 'text-neutral-500 hover:text-neutral-700'}`}>
                            {val === 'all' ? 'Tous' : val === 'instagram' ? 'Insta' : val === 'tiktok' ? 'TikTok' : 'LinkedIn'}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setContentDraftOnly(!contentDraftOnly)} className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${contentDraftOnly ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-green-300 bg-green-50 text-green-700'}`}>
                        {contentDraftOnly ? 'Brouillon' : 'Publication directe'}
                      </button>
                      <button onClick={async () => { const next = publishMode === 'auto' ? 'notify' : 'auto'; setPublishMode(next); localStorage.setItem('keiro_publish_mode', next); try { await fetch('/api/agents/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'set_publish_mode', publish_mode: next }) }); } catch {} }} className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${publishMode === 'notify' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-neutral-200 bg-neutral-50 text-neutral-500'}`}>
                        {publishMode === 'notify' ? 'Notification avant publi' : 'Auto-publish'}
                      </button>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={() => handleContentGenerate('generate_weekly')} disabled={contentGenerating} className="bg-gradient-to-r from-purple-600 to-[#1e3a5f] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
                        {contentGenerating ? 'G\u00E9n\u00E9ration...' : 'Planifier la semaine'}
                      </button>
                      <button onClick={() => handleContentGenerate('generate_post')} disabled={contentGenerating} className="text-xs text-purple-600 border border-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-50 disabled:opacity-50">Post du jour</button>
                      <button onClick={handleFixCaptions} disabled={fixingCaptions} className="text-xs text-amber-600 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-50 disabled:opacity-50">{fixingCaptions ? 'Reformatage...' : 'Fix Captions'}</button>
                      <button onClick={loadContentData} className="text-xs text-purple-600 hover:underline">Actualiser</button>
                    </div>
                    {contentPosts.length === 0 ? (
                      <div className="bg-white rounded-xl shadow-sm border p-6 text-center text-neutral-400 text-sm">Aucun contenu.</div>
                    ) : (
                      <div className="space-y-3">
                        {contentPosts.filter(p => contentPlatform === 'all' || p.platform === contentPlatform).sort((a, b) => `${b.scheduled_date}T${b.scheduled_time}`.localeCompare(`${a.scheduled_date}T${a.scheduled_time}`)).slice(0, 10).map(post => (
                          <div key={post.id} className="bg-white rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setPreviewPost(post)}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${post.platform === 'instagram' ? 'bg-pink-100 text-pink-700' : post.platform === 'tiktok' ? 'bg-neutral-800 text-white' : 'bg-[#0c1a3a]/10 text-[#0c1a3a]'}`}>{post.platform}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{post.format}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${post.status === 'published' ? 'bg-green-100 text-green-700' : post.status === 'publish_failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{post.status}</span>
                              </div>
                              <span className="text-[10px] text-neutral-400">{post.scheduled_date} {post.scheduled_time}</span>
                            </div>
                            {post.hook && <div className="text-sm font-semibold text-neutral-900 mb-1">{post.hook}</div>}
                            <div className="text-xs text-neutral-600 whitespace-pre-line">{post.caption?.substring(0, 150)}{(post.caption?.length || 0) > 150 ? '...' : ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Marketing / Ops fallback */}
                {(focusedAgent === 'marketing' || focusedAgent === 'ops') && agentMetrics.length === 0 && (
                  <div className="bg-white rounded-xl shadow-sm border p-6 text-center text-neutral-400 text-sm">Cet agent s&apos;active automatiquement. Voir les logs pour le d\u00E9tail.</div>
                )}
              </div>
            )}

            {/* ── Sub-tab: Chat ── */}
            {ficheSubTab === 'chat' && (
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-r ${fiche.gradient} px-4 py-3 text-white`}>
                  <h3 className="font-semibold text-sm">{fiche.icon} Chat avec {fiche.name}</h3>
                  <p className="text-xs text-white/70">Donne des ordres directs, pose des questions, demande des rapports</p>
                </div>
                <div className="h-[400px] overflow-y-auto p-4 space-y-3 bg-neutral-50">
                  {(agentMessages[fiche.chatId] || []).length === 0 && (
                    <div className="text-center text-neutral-400 text-sm py-8">Commence une conversation avec {fiche.name}</div>
                  )}
                  {(agentMessages[fiche.chatId] || []).map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-white border border-neutral-200 text-neutral-800'}`}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  ))}
                  {agentChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm text-neutral-500 animate-pulse">{fiche.name} r\u00E9fl\u00E9chit...</div>
                    </div>
                  )}
                  <div ref={agentMessagesEndRef} />
                </div>
                <div className="p-3 border-t border-neutral-200 bg-white">
                  <div className="flex gap-2">
                    <input type="text" value={agentInput} onChange={e => setAgentInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { setSelectedAgent(fiche.chatId); setTimeout(sendAgentMessage, 0); } }} placeholder={`Message \u00E0 ${fiche.name}...`} className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" disabled={agentChatLoading} />
                    <button onClick={() => { setSelectedAgent(fiche.chatId); setTimeout(sendAgentMessage, 0); }} disabled={agentChatLoading || !agentInput.trim()} className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50">
                      Envoyer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Sub-tab: Ordres ── */}
            {ficheSubTab === 'ordres' && (
              <div className="space-y-4">
                {ficheOrders.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border p-6 text-center text-neutral-400 text-sm">Aucun ordre pour {fiche.name}.</div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {ficheOrders.slice(0, 20).map(o => (
                      <div key={o.id} className="px-4 py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {agentBadge(o.from_agent)} <span className="text-neutral-400">\u2192</span> {agentBadge(o.to_agent)}
                            <span className="text-xs text-neutral-700">{o.action}</span>
                            {statusBadge(o.status)}
                            {priorityBadge(o.priority)}
                          </div>
                          <span className="text-[10px] text-neutral-400">{new Date(o.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Sub-tab: Logs ── */}
            {ficheSubTab === 'logs' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-700">Logs {fiche.name} ({logTotal})</span>
                  <button onClick={() => loadLogs(0, fiche.logAgents[0])} className="text-xs text-purple-600 hover:underline">Actualiser</button>
                </div>
                {logs.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border p-6 text-center text-neutral-400 text-sm">Aucun log.</div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-neutral-50 text-[10px] font-semibold text-neutral-500 uppercase">
                      <span>Date</span><span>Agent</span><span>Action</span><span>Statut</span><span>Cible</span>
                    </div>
                    {logs.map(log => (
                      <div key={log.id} className="grid grid-cols-5 gap-2 px-4 py-3 items-center border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                        <span className="text-xs text-neutral-600">{new Date(log.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{agentBadge(log.agent)}</span>
                        <span className="text-xs text-neutral-700">{log.action}</span>
                        <span>{statusBadge(log.status)}</span>
                        <span className="text-xs text-neutral-600 truncate">{log.target || '-'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {logTotal > 50 && (
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => { const p = Math.max(0, logPage - 1); setLogPage(p); loadLogs(p, fiche.logAgents[0]); }} disabled={logPage === 0} className="text-sm px-3 py-1.5 border rounded-lg hover:bg-neutral-50 disabled:opacity-40">Pr\u00E9c\u00E9dent</button>
                    <span className="text-sm text-neutral-500">Page {logPage + 1} / {Math.ceil(logTotal / 50)}</span>
                    <button onClick={() => { const p = Math.min(Math.ceil(logTotal / 50) - 1, logPage + 1); setLogPage(p); loadLogs(p, fiche.logAgents[0]); }} disabled={logPage >= Math.ceil(logTotal / 50) - 1} className="text-sm px-3 py-1.5 border rounded-lg hover:bg-neutral-50 disabled:opacity-40">Suivant</button>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })()}
        {/* ===== TAB BRIEFS CEO ===== */}
        {activeTab === 'briefs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Briefs CEO</h2>
              <button onClick={executeCeoBrief} disabled={executingCeo} className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-700 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
                {executingCeo ? 'Génération...' : 'Générer brief'}
              </button>
            </div>
            {briefs.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-neutral-400">Aucun brief CEO. Clique sur "Générer brief" pour lancer une analyse.</div>
            ) : briefs.map(b => {
              const d = typeof b.data === 'string' ? b.data : (b.data?.brief || b.data?.analysis || JSON.stringify(b.data, null, 2));
              return (
                <div key={b.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🧠</span>
                      <span className="text-sm font-semibold text-neutral-900">Brief du {new Date(b.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                    </div>
                    <span className="text-xs text-neutral-400">{new Date(b.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="p-5">
                    <pre className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">{d}</pre>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* ===== TAB CAMPAGNES ===== */}
        {activeTab === 'campagnes' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                Campagnes ({campaigns.length})
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={campaignDateFilter}
                  onChange={(e) => setCampaignDateFilter(e.target.value)}
                  className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="1d">Aujourd'hui</option>
                  <option value="3d">3 derniers jours</option>
                  <option value="7d">7 derniers jours</option>
                  <option value="30d">30 derniers jours</option>
                  <option value="all">Tout</option>
                </select>
                {[
                  { id: 'all', label: 'Tous', icon: '🌐' },
                  { id: 'email', label: 'Email', icon: '📧' },
                  { id: 'dm_instagram', label: 'DM Insta', icon: '📩' },
                  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
                  { id: 'content', label: 'Contenu', icon: '📱' },
                  { id: 'commercial', label: 'Commercial', icon: '🎯' },
                  { id: 'seo', label: 'SEO', icon: '🔍' },
                  { id: 'onboarding', label: 'Onboarding', icon: '🚀' },
                  { id: 'retention', label: 'Retention', icon: '🔄' },
                  { id: 'ceo', label: 'CEO', icon: '👔' },
                  { id: 'marketing', label: 'Marketing', icon: '📊' },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => {
                      setCampaignFilter(pill.id);
                      loadCampaigns(pill.id);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                      campaignFilter === pill.id
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:border-purple-300 hover:text-purple-700'
                    }`}
                  >
                    <span className="mr-0.5">{pill.icon}</span>
                    {pill.label}
                  </button>
                ))}
                <button
                  onClick={() => loadCampaigns(campaignFilter)}
                  className="text-xs text-purple-600 hover:underline"
                >
                  Actualiser
                </button>
              </div>
            </div>

            {/* Campaign Launch Buttons */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">Lancer une campagne</h3>
              <div className="flex flex-wrap gap-2">
                {/* Email with draft/send options */}
                <div className="relative">
                  <button
                    onClick={() => setShowEmailOptions(!showEmailOptions)}
                    disabled={launchingCampaign !== null}
                    className="px-3 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white text-xs font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {(launchingCampaign === 'email_cold' || launchingCampaign === 'email_warm') ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>✉️</span>
                    )}
                    Email
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showEmailOptions && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-neutral-200 p-3 z-50 w-56">
                      <div className="mb-2">
                        <label className="text-[10px] font-semibold text-neutral-500 uppercase">Mode</label>
                        <div className="flex gap-1 mt-1">
                          <button onClick={() => setEmailMode('draft')}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${emailMode === 'draft' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                            Brouillon
                          </button>
                          <button onClick={() => setEmailMode('send')}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${emailMode === 'send' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                            Envoi direct
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <button
                          onClick={() => { setShowEmailOptions(false); launchCampaign('email_cold'); }}
                          disabled={launchingCampaign !== null}
                          className="flex-1 px-2 py-1.5 bg-green-600 text-white text-[11px] font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          Cold
                        </button>
                        <button
                          onClick={() => { setShowEmailOptions(false); launchCampaign('email_warm'); }}
                          disabled={launchingCampaign !== null}
                          className="flex-1 px-2 py-1.5 bg-orange-500 text-white text-[11px] font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50"
                        >
                          Warm
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {/* DM agents with split options */}
                <div className="relative">
                  <button
                    onClick={() => setShowDmOptions(!showDmOptions)}
                    disabled={launchingCampaign !== null}
                    className="px-3 py-2 bg-gradient-to-r from-pink-500 to-pink-600 text-white text-xs font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {(launchingCampaign === 'dm_instagram' || launchingCampaign === 'dm_tiktok') ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>📩</span>
                    )}
                    DM / Social
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showDmOptions && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-neutral-200 p-3 z-50 w-56">
                      <div className="space-y-1.5">
                        <button
                          onClick={() => { setShowDmOptions(false); launchCampaign('dm_instagram'); }}
                          disabled={launchingCampaign !== null}
                          className="w-full px-2 py-1.5 bg-pink-600 text-white text-[11px] font-medium rounded-lg hover:bg-pink-700 disabled:opacity-50 text-left"
                        >
                          📩 DM Instagram
                        </button>
                        <button
                          onClick={() => { setShowDmOptions(false); launchCampaign('dm_tiktok'); }}
                          disabled={launchingCampaign !== null}
                          className="w-full px-2 py-1.5 bg-neutral-800 text-white text-[11px] font-medium rounded-lg hover:bg-neutral-900 disabled:opacity-50 text-left"
                        >
                          🎵 Commentaires TikTok
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {/* Commercial agent with split options */}
                <div className="relative">
                  <button
                    onClick={() => setShowCommercialOptions(!showCommercialOptions)}
                    disabled={launchingCampaign !== null}
                    className="px-3 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white text-xs font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {(launchingCampaign === 'commercial_verify' || launchingCampaign === 'commercial_prospect' || launchingCampaign === 'commercial') ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>🎯</span>
                    )}
                    Commercial
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showCommercialOptions && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-neutral-200 p-3 z-50 w-64">
                      <div className="space-y-1.5">
                        <button
                          onClick={() => { setShowCommercialOptions(false); launchCampaign('commercial_verify'); }}
                          disabled={launchingCampaign !== null}
                          className="w-full px-2 py-1.5 bg-purple-600 text-white text-[11px] font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 text-left"
                        >
                          🔍 Verification CRM (audit fiches)
                        </button>
                        <button
                          onClick={() => { setShowCommercialOptions(false); launchCampaign('commercial_prospect'); }}
                          disabled={launchingCampaign !== null}
                          className="w-full px-2 py-1.5 bg-indigo-600 text-white text-[11px] font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-left"
                        >
                          🌐 Prospection externe (Google Search)
                        </button>
                        <button
                          onClick={() => { setShowCommercialOptions(false); launchCampaign('commercial'); }}
                          disabled={launchingCampaign !== null}
                          className="w-full px-2 py-1.5 bg-neutral-600 text-white text-[11px] font-medium rounded-lg hover:bg-neutral-700 disabled:opacity-50 text-left"
                        >
                          ⚡ Les deux (complet)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {/* Community Manager button with options */}
                <div className="relative">
                  <button
                    onClick={() => setShowCommunityOptions(!showCommunityOptions)}
                    disabled={launchingCampaign !== null}
                    className="px-3 py-2 bg-gradient-to-r from-rose-500 to-rose-600 text-white text-xs font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {(launchingCampaign === 'community_follow' || launchingCampaign === 'community_comments' || launchingCampaign === 'community_engage' || launchingCampaign === 'marketing') ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>👥</span>
                    )}
                    Community
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showCommunityOptions && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-neutral-200 p-3 z-50 w-60">
                      <div className="mb-2">
                        <label className="text-[10px] font-semibold text-neutral-500 uppercase">Plateforme</label>
                        <div className="flex gap-1 mt-1">
                          {['instagram', 'tiktok'].map(p => (
                            <button key={p} onClick={() => setCommunityPlatform(p)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${communityPlatform === p ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                              {p === 'instagram' ? '📸 Instagram' : '🎵 TikTok'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5 mt-2">
                        <button
                          onClick={() => { setShowCommunityOptions(false); launchCampaign('community_comments'); }}
                          disabled={launchingCampaign !== null}
                          className="w-full px-2 py-1.5 bg-green-600 text-white text-[11px] font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 text-left"
                        >
                          💬 Preparer commentaires (posts reels)
                        </button>
                        <button
                          onClick={() => { setShowCommunityOptions(false); launchCampaign('community_follow'); }}
                          disabled={launchingCampaign !== null}
                          className="w-full px-2 py-1.5 bg-rose-600 text-white text-[11px] font-medium rounded-lg hover:bg-rose-700 disabled:opacity-50 text-left"
                        >
                          🎯 Trouver des comptes a follow
                        </button>
                        <button
                          onClick={() => { setShowCommunityOptions(false); launchCampaign('community_engage'); }}
                          disabled={launchingCampaign !== null}
                          className="w-full px-2 py-1.5 bg-amber-500 text-white text-[11px] font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 text-left"
                        >
                          📊 Plan engagement du jour
                        </button>
                        <button
                          onClick={() => { setShowCommunityOptions(false); launchCampaign('marketing'); }}
                          disabled={launchingCampaign !== null}
                          className="w-full px-2 py-1.5 bg-neutral-600 text-white text-[11px] font-medium rounded-lg hover:bg-neutral-700 disabled:opacity-50 text-left"
                        >
                          📊 Analyse marketing
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {/* Content button with options */}
                <div className="relative">
                  <button
                    onClick={() => setShowContentOptions(!showContentOptions)}
                    disabled={launchingCampaign !== null}
                    className="px-3 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white text-xs font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {launchingCampaign === 'content' ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>📱</span>
                    )}
                    Contenu
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showContentOptions && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-neutral-200 p-3 z-50 w-56">
                      <div className="mb-2">
                        <label className="text-[10px] font-semibold text-neutral-500 uppercase">Plateforme</label>
                        <div className="flex gap-1 mt-1">
                          {(['instagram', 'tiktok'] as const).map(p => (
                            <button key={p} onClick={() => setContentPlatform(p)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${contentPlatform === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                              {p === 'instagram' ? '📸 Instagram' : '🎵 TikTok'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="text-[10px] font-semibold text-neutral-500 uppercase">Mode</label>
                        <div className="flex gap-1 mt-1">
                          <button onClick={() => setContentMode('draft')}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${contentMode === 'draft' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                            Brouillon
                          </button>
                          <button onClick={() => setContentMode('publish')}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${contentMode === 'publish' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                            Publication directe
                          </button>
                          <button onClick={() => setContentMode('week')}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${contentMode === 'week' ? 'bg-[#0c1a3a] text-white border-[#0c1a3a]' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                            📅 Plan semaine
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => { setShowContentOptions(false); launchCampaign('content'); }}
                        disabled={launchingCampaign !== null}
                        className="w-full px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
                      >
                        Lancer
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {campaignLaunchResult && (
                <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${
                  campaignLaunchResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {campaignLaunchResult.ok ? '✓' : '✗'} {campaignLaunchResult.message}
                </div>
              )}
              {/* Planning moved to Suivi & Publications page */}
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <Link href="/admin/dm-queue?tab=planning" className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  <span>📅</span> Voir le planning contenu
                </Link>
              </div>
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500 font-medium">Statut :</span>
              {[
                { id: 'all', label: 'Tout' },
                { id: 'en_cours', label: 'En cours' },
                { id: 'termine', label: 'Termin\u00e9' },
                { id: 'echoue', label: '\u00c9chou\u00e9' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setCampaignStatusFilter(pill.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                    campaignStatusFilter === pill.id
                      ? pill.id === 'echoue' ? 'bg-red-600 text-white border-red-600 shadow-sm'
                        : pill.id === 'termine' ? 'bg-green-600 text-white border-green-600 shadow-sm'
                        : pill.id === 'en_cours' ? 'bg-yellow-500 text-white border-yellow-500 shadow-sm'
                        : 'bg-purple-600 text-white border-purple-600 shadow-sm'
                      : 'bg-white text-neutral-600 border-neutral-200 hover:border-purple-300 hover:text-purple-700'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Campaign History */}
            {(() => {
              const dateMap: Record<string, number> = { '1d': 1, '3d': 3, '7d': 7, '30d': 30 };
              const days = dateMap[campaignDateFilter] || 0;
              const cutoff = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : '';
              const dateCampaigns = cutoff ? campaigns.filter(c => c.date >= cutoff) : campaigns;
              const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
              const filteredCampaigns = campaignStatusFilter === 'all' ? dateCampaigns
                : campaignStatusFilter === 'en_cours' ? dateCampaigns.filter(c => c.date >= oneHourAgo && c.total > 0 && c.success === 0 && c.failed === 0)
                : campaignStatusFilter === 'termine' ? dateCampaigns.filter(c => c.success > 0 && c.failed === 0)
                : campaignStatusFilter === 'echoue' ? dateCampaigns.filter(c => c.failed > 0)
                : dateCampaigns;
              const actionLabels: Record<string, string> = {
                daily_cold: 'Email (cold)', daily_warm: 'Email chatbot',
                daily_preparation: 'DM Instagram', comments_prepared: 'DM TikTok',
                enrichment_run: 'Enrichissement', daily_post_generated: 'Post contenu',
                weekly_plan_generated: 'Plan contenu', execute_publication: 'Publication',
                article_generated: 'Article SEO', article_published: 'Article publie',
                calendar_planned: 'Calendrier SEO', queue_processed: 'Onboarding',
                sequence_scheduled: 'Sequence onboarding', daily_check: 'Retention',
                daily_brief: 'Brief CEO', report_to_ceo: 'Rapport',
                reset_dead_prospects: 'Reset prospects',
              };
              return filteredCampaigns.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center text-neutral-400">
                Aucune campagne pour le moment
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCampaigns.map((campaign) => {
                  const channelLabel = actionLabels[campaign.action] || campaign.agent;
                  const channelColor = campaign.agent === 'email'
                    ? 'bg-green-100 text-green-700'
                    : campaign.agent === 'content'
                    ? 'bg-orange-100 text-orange-700'
                    : campaign.agent === 'commercial'
                    ? 'bg-purple-100 text-purple-700'
                    : campaign.agent === 'dm_instagram'
                    ? 'bg-pink-100 text-pink-700'
                    : campaign.agent === 'seo'
                    ? 'bg-[#0c1a3a]/10 text-[#0c1a3a]'
                    : 'bg-neutral-900 text-white';

                  const contentPlatformFromData = campaign.data?.platform || campaign.data?.post?.platform;
                  const suiviHref = campaign.agent === 'dm_instagram'
                    ? '/admin/dm-queue?tab=dm_instagram'
                    : campaign.agent === 'tiktok_comments' || campaign.agent === 'dm_tiktok'
                    ? '/admin/dm-queue?tab=dm_tiktok'
                    : campaign.agent === 'content'
                    ? `/admin/dm-queue?tab=${contentPlatformFromData === 'tiktok' ? 'pub_tiktok' : 'pub_instagram'}`
                    : campaign.agent === 'seo'
                    ? '/admin/dm-queue?tab=seo'
                    : campaign.agent === 'email'
                    ? '/admin/dm-queue'
                    : null;

                  return (
                    <div
                      key={campaign.id}
                      className="block bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:bg-neutral-50 hover:border-purple-200 transition-all"
                    >
                      <Link href={`/admin/agents/campaign/${campaign.id}`} className="block">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${channelColor}`}>
                              {channelLabel}
                            </span>
                            <span className="text-sm font-semibold text-neutral-900">
                              {new Date(campaign.date).toLocaleDateString('fr-FR', {
                                weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                            {campaign.message && (
                              <span className="text-xs text-neutral-400 truncate max-w-[250px] hidden sm:inline">{campaign.message}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-lg font-bold text-neutral-900">{campaign.total > 0 ? campaign.success : '-'}</span>
                              {campaign.total > 0 && <span className="text-xs text-neutral-400 ml-1">/{campaign.total}</span>}
                            </div>
                            {campaign.failed > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                                {campaign.failed} echec
                              </span>
                            )}
                            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </Link>
                      <div className="flex items-center justify-between mt-2">
                        {Object.keys(campaign.byBusinessType).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(campaign.byBusinessType).map(([type, data]) => (
                              <span key={type} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                                {type}: {data.sent || data.count || 0}
                              </span>
                            ))}
                          </div>
                        ) : campaign.data?.pipeline ? (
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-medium">
                              Eligible: {campaign.data.pipeline.total_eligible || 0}
                            </span>
                            {campaign.data.pipeline.skipped_verification > 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
                                Verif: -{campaign.data.pipeline.skipped_verification}
                              </span>
                            )}
                            {campaign.data.pipeline.skipped_waiting_next_step > 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0c1a3a]/5 text-[#0c1a3a] font-medium">
                                Attente: -{campaign.data.pipeline.skipped_waiting_next_step}
                              </span>
                            )}
                          </div>
                        ) : campaign.data?.diagnostic ? (
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
                              CRM: {campaign.data.diagnostic.with_email || 0} emails, {campaign.data.diagnostic.dead || 0} dead, {campaign.data.diagnostic.email_seq_completed || 0} termines
                            </span>
                          </div>
                        ) : <div />}
                        {suiviHref && (
                          <Link
                            href={suiviHref}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition shrink-0"
                          >
                            Voir le contenu
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
            })()}
          </div>
        )}

        {/* ===== TAB ORDRES ===== */}
        {activeTab === 'ordres' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-neutral-900">
                Ordres ({orders.filter(o =>
                  (orderFilterStatus === 'all' || o.status === orderFilterStatus) &&
                  (orderFilterAgent === 'all' || o.to_agent === orderFilterAgent || o.from_agent === orderFilterAgent)
                ).length})
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={orderFilterStatus}
                  onChange={(e) => setOrderFilterStatus(e.target.value)}
                  className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="pending">En attente</option>
                  <option value="in_progress">En cours</option>
                  <option value="completed">Terminé</option>
                  <option value="failed">Échoué</option>
                </select>
                <select
                  value={orderFilterAgent}
                  onChange={(e) => setOrderFilterAgent(e.target.value)}
                  className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="all">Tous les agents</option>
                  <option value="ceo">CEO</option>
                  <option value="commercial">Commercial</option>
                  <option value="email">Email</option>
                  <option value="content">Contenu</option>
                  <option value="seo">SEO</option>
                  <option value="dm_instagram">DM Instagram</option>
                  <option value="tiktok_comments">TikTok</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="retention">Rétention</option>
                  <option value="chatbot">Chatbot</option>
                  <option value="admin">Admin (moi)</option>
                </select>
                {selectedOrders.size > 0 && (
                  <button
                    onClick={executeSelectedOrders}
                    disabled={executingOrders}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-[#1e3a5f] text-white text-xs font-medium rounded-lg hover:from-purple-700 hover:to-[#1e3a5f] disabled:opacity-50 transition-all"
                  >
                    {executingOrders ? (
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Exécution...
                      </span>
                    ) : (
                      `Exécuter maintenant (${selectedOrders.size})`
                    )}
                  </button>
                )}
                {orders.filter(o => o.status === 'failed').length > 0 && (
                  <button
                    onClick={async () => {
                      const failedIds = orders.filter(o => o.status === 'failed').map(o => o.id);
                      const ok = confirm(`Relancer les ${failedIds.length} ordres echoues ?`);
                      if (!ok) return;
                      for (const id of failedIds) {
                        await supabase.from('agent_orders').update({ status: 'pending', result: null }).eq('id', id);
                      }
                      loadOrders();
                    }}
                    className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-medium rounded-lg hover:bg-red-200 transition"
                  >
                    Relancer les echoues ({orders.filter(o => o.status === 'failed').length})
                  </button>
                )}
                <button
                  onClick={loadOrders}
                  className="text-xs text-purple-600 hover:underline"
                >
                  Actualiser
                </button>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center text-neutral-400">
                Aucun ordre pour le moment
              </div>
            ) : (
              <div className="space-y-2">
                {/* Select all pending */}
                {orders.some(o => o.status === 'pending') && (
                  <label className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                    <input type="checkbox" checked={selectedOrders.size > 0 && selectedOrders.size === orders.filter(o => o.status === 'pending').length}
                      onChange={selectAllPendingOrders} className="w-3.5 h-3.5 rounded border-neutral-300 text-purple-600 focus:ring-purple-500" />
                    Tout sélectionner (en attente)
                  </label>
                )}

                {orders.filter(o =>
                  (orderFilterStatus === 'all' || o.status === orderFilterStatus) &&
                  (orderFilterAgent === 'all' || o.to_agent === orderFilterAgent || o.from_agent === orderFilterAgent)
                ).map((order) => {
                  const isExpanded = expandedOrder === order.id;
                  const isPending = order.status === 'pending';
                  return (
                    <div key={order.id} className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                      <div
                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                        className="flex items-center gap-3 p-4 hover:bg-neutral-50 transition-all cursor-pointer"
                      >
                        {isPending && (
                          <span onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => toggleOrderSelection(order.id)}
                              className="w-3.5 h-3.5 rounded border-neutral-300 text-purple-600 focus:ring-purple-500" />
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 font-medium">{order.from_agent}</span>
                            <svg className="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">{order.to_agent}</span>
                            {priorityBadge(order.priority)}
                            {statusBadge(order.status)}
                          </div>
                          <p className="text-sm text-neutral-800 mt-1 truncate">{(order.payload as any)?.description || order.order_type}</p>
                        </div>
                        <span className="text-[10px] text-neutral-400 whitespace-nowrap">{new Date(order.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        <svg className={`w-4 h-4 text-neutral-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>

                      {isExpanded && (
                        <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100 space-y-3">
                          {/* Description de l'ordre */}
                          {(order.payload as any)?.description && (
                            <div>
                              <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-1">Description</h4>
                              <p className="text-sm text-neutral-700 bg-white p-3 rounded-lg border border-neutral-200">
                                {(order.payload as any).description}
                              </p>
                            </div>
                          )}

                          {/* Résultat d'exécution */}
                          {(order as any).result && (
                            <div>
                              <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-1">Résultat d&apos;exécution</h4>
                              <div className={`text-sm p-3 rounded-lg border ${
                                order.status === 'completed' ? 'bg-green-50 border-green-200 text-green-800' :
                                order.status === 'failed' ? 'bg-red-50 border-red-200 text-red-800' :
                                'bg-[#0c1a3a]/5 border-[#0c1a3a]/10 text-[#0c1a3a]'
                              }`}>
                                {typeof (order as any).result === 'object' ? (
                                  <>
                                    {(order as any).result.message && (
                                      <p className="font-medium">{(order as any).result.message}</p>
                                    )}
                                    {(order as any).result.error && (
                                      <p className="font-medium text-red-700">{(order as any).result.error}</p>
                                    )}
                                    {(order as any).result.executed_at && (
                                      <p className="text-xs mt-1 opacity-70">
                                        Exécuté le {new Date((order as any).result.executed_at).toLocaleString('fr-FR')}
                                        {(order as any).result.executed_by === 'admin_manual' && ' (manuel)'}
                                      </p>
                                    )}
                                    {(order as any).result.api_response && (
                                      <details className="mt-2">
                                        <summary className="text-xs cursor-pointer hover:underline opacity-70">Réponse API détaillée</summary>
                                        <pre className="text-xs mt-1 bg-white p-2 rounded border overflow-x-auto max-h-32 overflow-y-auto">
                                          {JSON.stringify((order as any).result.api_response, null, 2)}
                                        </pre>
                                      </details>
                                    )}
                                  </>
                                ) : (
                                  <p>{String((order as any).result)}</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Timeline */}
                          <div>
                            <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-1">Timeline</h4>
                            <div className="flex items-center gap-2 text-xs text-neutral-500">
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-neutral-300" />
                                Créé {new Date(order.created_at).toLocaleString('fr-FR')}
                              </span>
                              {(order as any).result?.started_at && (
                                <>
                                  <span className="text-neutral-300">→</span>
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-[#0c1a3a]" />
                                    Démarré {new Date((order as any).result.started_at).toLocaleString('fr-FR')}
                                  </span>
                                </>
                              )}
                              {(order as any).completed_at && (
                                <>
                                  <span className="text-neutral-300">→</span>
                                  <span className="flex items-center gap-1">
                                    <span className={`w-2 h-2 rounded-full ${order.status === 'completed' ? 'bg-green-400' : 'bg-red-400'}`} />
                                    {order.status === 'completed' ? 'Terminé' : 'Échoué'} {new Date((order as any).completed_at).toLocaleString('fr-FR')}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Retry failed orders */}
                          {(order.status === 'failed' || order.status === 'completed') && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const ok = confirm(`Relancer cet ordre vers ${order.to_agent} ?`);
                                if (!ok) return;
                                try {
                                  await supabase.from('agent_orders').update({
                                    status: 'pending',
                                    result: null,
                                  }).eq('id', order.id);
                                  loadOrders();
                                } catch (err) { console.error('Retry error:', err); }
                              }}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                                order.status === 'failed'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-[#0c1a3a]/10 text-[#0c1a3a] hover:bg-[#0c1a3a]/15'
                              }`}
                            >
                              {order.status === 'failed' ? 'Relancer cet ordre' : 'Re-executer'}
                            </button>
                          )}

                          {/* Payload brut */}
                          <details className="text-xs">
                            <summary className="text-neutral-500 cursor-pointer hover:text-neutral-700 font-semibold uppercase">Payload brut</summary>
                            <pre className="text-xs text-neutral-600 bg-white p-3 rounded-lg border border-neutral-200 overflow-x-auto max-h-48 overflow-y-auto mt-1">
                              {JSON.stringify(order.payload, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB LOGS ===== */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                Logs ({logTotal})
              </h2>
              <div className="flex items-center gap-2">
                {/* Agent filter */}
                <select
                  value={logFilter}
                  onChange={(e) => {
                    setLogFilter(e.target.value);
                    setLogPage(0);
                    loadLogs(0, e.target.value);
                  }}
                  className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="all">Tous les agents</option>
                  <option value="ceo">CEO</option>
                  <option value="chatbot">Chatbot</option>
                  <option value="email">Email</option>
                  <option value="commercial">Commercial</option>
                  <option value="dm_instagram">DM Instagram</option>
                  <option value="tiktok_comments">TikTok</option>
                  <option value="gmaps">GMaps</option>
                  <option value="seo">SEO</option>
                </select>
                <button
                  onClick={() => loadLogs(logPage, logFilter)}
                  className="text-xs text-purple-600 hover:underline"
                >
                  Actualiser
                </button>
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center text-neutral-400">
                Aucun log pour le moment
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-5 gap-2 px-4 py-3 bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold text-neutral-500 uppercase">
                  <span>Date</span>
                  <span>Agent</span>
                  <span>Action</span>
                  <span>Statut</span>
                  <span>Cible</span>
                </div>

                {/* Table body */}
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="grid grid-cols-5 gap-2 px-4 py-3 items-center border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-all"
                  >
                    <span className="text-xs text-neutral-600">
                      {new Date(log.created_at).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>{agentBadge(log.agent)}</span>
                    <span className="text-xs text-neutral-700">{log.action}</span>
                    <span>{statusBadge(log.status)}</span>
                    <span className="text-xs text-neutral-600 truncate">
                      {log.target || '-'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {logTotal > 50 && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    const newPage = Math.max(0, logPage - 1);
                    setLogPage(newPage);
                    loadLogs(newPage, logFilter);
                  }}
                  disabled={logPage === 0}
                  className="text-sm px-3 py-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Pr\u00E9c\u00E9dent
                </button>
                <span className="text-sm text-neutral-500">
                  Page {logPage + 1} / {Math.ceil(logTotal / 50)}
                </span>
                <button
                  onClick={() => {
                    const maxPage = Math.ceil(logTotal / 50) - 1;
                    const newPage = Math.min(maxPage, logPage + 1);
                    setLogPage(newPage);
                    loadLogs(newPage, logFilter);
                  }}
                  disabled={logPage >= Math.ceil(logTotal / 50) - 1}
                  className="text-sm px-3 py-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Suivant
                </button>
              </div>
            )}
          </div>
        )}
        {/* Post Preview Modal — Platform mockup */}
        {previewPost && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewPost(null)}>
            <div className="relative flex flex-col sm:flex-row gap-4 sm:gap-6 max-w-[820px] w-full items-center sm:items-start" onClick={e => e.stopPropagation()}>
              <button onClick={() => setPreviewPost(null)} className="absolute -top-10 right-0 text-white text-2xl font-bold hover:opacity-70 z-10">✕</button>

              {/* Phone frame */}
              <div className="w-[280px] sm:w-[340px] shrink-0">
                <div className={`rounded-[32px] shadow-2xl overflow-hidden border-[6px] border-neutral-800 ${previewPost.platform === 'tiktok' ? 'bg-black' : 'bg-white'}`} style={{ maxHeight: '680px' }}>
                  {/* Platform header */}
                  {previewPost.platform === 'tiktok' ? (
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="text-white/60 text-xs">Suivre</div>
                      <div className="flex gap-4 text-white text-xs font-semibold">
                        <span className="text-white/60">Suivis</span>
                        <span className="border-b-2 border-white pb-1">Pour toi</span>
                      </div>
                      <div className="text-white/60 text-xs">🔍</div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 border-b border-neutral-100">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-[2px]">
                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-neutral-900">K</div>
                      </div>
                      <div>
                        <div className="text-[12px] font-semibold text-neutral-900">keiroai</div>
                        <div className="text-[10px] text-neutral-400">Sponsorisé</div>
                      </div>
                      <div className="ml-auto text-neutral-400">•••</div>
                    </div>
                  )}

                  {/* Media */}
                  <div className="relative bg-neutral-900 flex items-center justify-center" style={{ minHeight: previewPost.platform === 'tiktok' ? '420px' : '340px', maxHeight: '460px' }}>
                    {previewPost.video_url ? (
                      <video src={previewPost.video_url} controls autoPlay muted loop className="w-full h-full object-cover" style={{ maxHeight: '460px' }} />
                    ) : previewPost.visual_url ? (
                      <img src={previewPost.visual_url} alt="" className="w-full h-full object-cover" style={{ maxHeight: '460px' }} />
                    ) : (
                      <div className="p-6 text-center text-neutral-500 text-sm">
                        <div className="text-4xl mb-2">{previewPost.format === 'reel' || previewPost.format === 'video' ? '🎬' : '🖼️'}</div>
                        <div>{previewPost.visual_description || 'Pas de visuel'}</div>
                      </div>
                    )}
                    {previewPost.platform === 'tiktok' && (
                      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5">
                        <div className="flex flex-col items-center"><div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-lg">♡</div><span className="text-white text-[10px] mt-1">24.5K</span></div>
                        <div className="flex flex-col items-center"><div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-lg">💬</div><span className="text-white text-[10px] mt-1">328</span></div>
                        <div className="flex flex-col items-center"><div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-lg">↗</div><span className="text-white text-[10px] mt-1">1.2K</span></div>
                      </div>
                    )}
                    {(previewPost.format === 'reel' || previewPost.format === 'video') && previewPost.platform !== 'tiktok' && (
                      <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">Reel</div>
                    )}
                  </div>

                  {/* Instagram engagement bar */}
                  {previewPost.platform !== 'tiktok' && (
                    <>
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-4">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                        </div>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                      </div>
                      <div className="px-3 pb-3 overflow-y-auto" style={{ maxHeight: '120px' }}>
                        <div className="text-[11px] text-neutral-900 mb-1"><span className="font-bold">keiroai</span> {previewPost.hook || ''}</div>
                        <div className="text-[11px] text-neutral-700 whitespace-pre-line leading-relaxed">{previewPost.caption}</div>
                      </div>
                    </>
                  )}

                  {/* TikTok caption overlay */}
                  {previewPost.platform === 'tiktok' && (
                    <div className="px-3 py-2 bg-black">
                      <div className="text-white text-[11px] font-semibold mb-1">@keiroai</div>
                      <div className="text-white/80 text-[11px] whitespace-pre-line leading-relaxed" style={{ maxHeight: '60px', overflow: 'hidden' }}>{previewPost.caption?.substring(0, 150)}{(previewPost.caption?.length || 0) > 150 ? '...' : ''}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Side panel — details + actions */}
              <div className="flex-1 min-w-[280px] bg-white rounded-2xl shadow-xl p-5 max-h-[680px] overflow-y-auto">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    previewPost.platform === 'instagram' ? 'bg-pink-100 text-pink-700'
                    : previewPost.platform === 'tiktok' ? 'bg-neutral-800 text-white'
                    : 'bg-[#0c1a3a]/10 text-[#0c1a3a]'
                  }`}>{previewPost.platform}</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600">{previewPost.format}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    previewPost.status === 'published' ? 'bg-green-100 text-green-700'
                    : previewPost.status === 'publish_failed' ? 'bg-red-100 text-red-700'
                    : previewPost.status === 'approved' ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                  }`}>{previewPost.status === 'publish_failed' ? 'Echec' : previewPost.status}</span>
                </div>

                <div className="text-xs text-neutral-400 mb-3">{previewPost.scheduled_date} {previewPost.scheduled_time} — {previewPost.pillar}</div>

                {previewPost.hook && <div className="text-sm font-bold text-neutral-900 mb-2">{previewPost.hook}</div>}
                <div className="text-xs text-neutral-700 whitespace-pre-line mb-4 max-h-[200px] overflow-y-auto leading-relaxed">{previewPost.caption}</div>

                {/* Error banner */}
                {previewPost.publish_error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs">
                    <div className="font-semibold text-red-700 mb-1">Erreur de publication</div>
                    <div className="text-red-600">{previewPost.publish_error}</div>
                    {previewPost.publish_diagnostic?.reason && (
                      <div className="text-red-500 mt-1">Diagnostic : {previewPost.publish_diagnostic.reason} — {previewPost.publish_diagnostic.detail}</div>
                    )}
                  </div>
                )}

                {/* Links */}
                {previewPost.instagram_permalink && (
                  <a href={previewPost.instagram_permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-pink-600 hover:underline block mb-2">Voir sur Instagram →</a>
                )}

                {/* Actions */}
                <div className="space-y-2 mt-4">
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold mb-1">Actions</div>
                  {(previewPost.status === 'draft' || previewPost.status === 'approved' || previewPost.status === 'publish_failed') && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => handleContentAction(previewPost.id, 'publish', 'instagram')} className="text-xs px-3 py-1.5 rounded-lg bg-pink-50 text-pink-600 hover:bg-pink-100 font-medium">Publier Insta</button>
                      <button onClick={() => handleContentAction(previewPost.id, 'publish', 'tiktok')} className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-800 hover:bg-neutral-200 font-medium">Publier TikTok</button>
                      <button onClick={() => handleContentAction(previewPost.id, 'publish', 'all')} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 font-medium">Publier Tous</button>
                    </div>
                  )}
                  {(previewPost.status === 'draft' || previewPost.status === 'approved') && (
                    <div className="flex flex-wrap gap-2">
                      {previewPost.status === 'draft' && <button onClick={() => handleContentAction(previewPost.id, 'approve')} className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">Approuver</button>}
                      <button onClick={() => handleModifyPost(previewPost.id)} disabled={modifyingPost === previewPost.id} className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 disabled:opacity-50">{modifyingPost === previewPost.id ? 'Modification...' : 'Modifier'}</button>
                      <button onClick={() => handleDeletePost(previewPost.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">Supprimer</button>
                    </div>
                  )}
                  {(previewPost.status === 'published' || previewPost.status === 'publish_failed') && (
                    <button onClick={() => handleResetToDraft(previewPost.id)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100">Repasser en brouillon</button>
                  )}
                  {previewPost.status === 'published' && !previewPost.instagram_permalink && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => handleContentAction(previewPost.id, 'publish', 'instagram')} className="text-xs px-3 py-1.5 rounded-lg bg-pink-50 text-pink-600 hover:bg-pink-100">Republier Insta</button>
                      <button onClick={() => handleContentAction(previewPost.id, 'publish', 'tiktok')} className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-800 hover:bg-neutral-200">Republier TikTok</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* ===== TAB AVATARS ===== */}
        {activeTab === 'avatars' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Avatars & Personnalités</h2>
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <AvatarEditor />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AdminAgentsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <AdminAgentsContent />
    </Suspense>
  );
}
