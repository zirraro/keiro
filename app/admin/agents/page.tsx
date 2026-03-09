'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';

type Tab = 'dashboard' | 'campagnes' | 'seo' | 'briefs' | 'ordres' | 'logs';

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

export default function AdminAgentsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Dashboard state
  const [metrics, setMetrics] = useState<MetricCard[]>([]);

  // Test email state
  const [testEmail, setTestEmail] = useState('');
  const [testStep, setTestStep] = useState(1);
  const [testCategory, setTestCategory] = useState('agence');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

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

  // Campagnes state
  type CampaignEntry = {
    id: string;
    date: string;
    agent: string;
    action: string;
    total: number;
    success: number;
    failed: number;
    byBusinessType: Record<string, { sent?: number; count?: number; failed?: number; steps?: number[]; handles?: string[] }>;
    dmExamples?: Array<{ name: string; type?: string; comment?: string }>;
    results?: Array<{ prospect_id: string; step: number; success: boolean; error?: string }>;
  };
  const [campaigns, setCampaigns] = useState<CampaignEntry[]>([]);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [campaignDateFilter, setCampaignDateFilter] = useState<string>('7d');

  // DM queue preview
  type DMQueueItem = {
    id: string;
    channel: string;
    handle: string;
    message: string;
    personalization: string;
    business_type: string;
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

  // Logs state
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [logPage, setLogPage] = useState(0);
  const [logTotal, setLogTotal] = useState(0);

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
      setLoading(false);
      loadDashboard();
      loadCeoHistory();
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

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

      // Emails 24h
      const { count: emailsCount } = await supabase
        .from('agent_logs')
        .select('*', { count: 'exact', head: true })
        .eq('agent', 'email')
        .eq('action', 'send_email')
        .gte('created_at', yesterdayISO);

      // Taux ouverture réel (from Brevo webhook logs)
      const { count: totalEmailsSent } = await supabase
        .from('agent_logs')
        .select('*', { count: 'exact', head: true })
        .eq('agent', 'email')
        .in('action', ['email_sent', 'send_email']);

      const { count: totalOpened } = await supabase
        .from('agent_logs')
        .select('*', { count: 'exact', head: true })
        .eq('agent', 'email')
        .eq('action', 'webhook_opened');

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

      // Prospects chauds
      const { count: hotProspects } = await supabase
        .from('crm_prospects')
        .select('*', { count: 'exact', head: true })
        .eq('temperature', 'hot');

      // Pipeline total
      const { count: pipelineCount } = await supabase
        .from('crm_prospects')
        .select('*', { count: 'exact', head: true })
        .in('status', ['new', 'contacted', 'interested']);

      // Clients actifs
      const { count: activeClients } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .neq('plan', 'free')
        .not('plan', 'is', null);

      // MRR (from profiles with plan)
      const { data: paidProfiles } = await supabase
        .from('profiles')
        .select('plan')
        .neq('plan', 'free')
        .not('plan', 'is', null);

      const planPrices: Record<string, number> = {
        pro: 89,
        fondateurs: 149,
        standard: 199,
        business: 349,
        elite: 999,
      };

      let mrr = 0;
      if (paidProfiles) {
        for (const p of paidProfiles) {
          mrr += planPrices[p.plan as string] || 0;
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
          label: 'Prospects chauds',
          value: hotProspects ?? 0,
          icon: '\uD83D\uDD25',
          trend: '',
          trendUp: true,
        },
        {
          label: 'Pipeline total',
          value: pipelineCount ?? 0,
          icon: '\uD83D\uDCCA',
          trend: '',
          trendUp: true,
        },
        {
          label: 'Clients actifs',
          value: activeClients ?? 0,
          icon: '\u2705',
          trend: '',
          trendUp: true,
        },
        {
          label: 'MRR estim\u00E9',
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

  // ─── Campagnes ───────────────────────────────────────────
  const loadCampaigns = async (filter = 'all') => {
    try {
      let query = supabase
        .from('agent_logs')
        .select('*')
        .in('action', ['daily_cold', 'daily_warm', 'daily_preparation', 'comments_prepared'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter === 'email') query = query.eq('agent', 'email');
      else if (filter === 'dm_instagram') query = query.eq('agent', 'dm_instagram');
      else if (filter === 'tiktok') query = query.eq('agent', 'tiktok_comments');

      const { data, error } = await query;
      if (error) throw error;

      const entries: CampaignEntry[] = (data || []).map((log: any) => ({
        id: log.id,
        date: log.created_at,
        agent: log.agent,
        action: log.action,
        total: log.data?.total || log.data?.prepared || 0,
        success: log.data?.success || log.data?.prepared || 0,
        failed: log.data?.failed || 0,
        byBusinessType: log.data?.by_business_type || {},
        dmExamples: log.data?.comments || log.data?.prepared_names?.map((n: string) => ({ name: n })) || [],
        results: log.data?.results || [],
      }));
      setCampaigns(entries);

      // Also load DM queue for preview
      const { data: queueData } = await supabase
        .from('dm_queue')
        .select('id, channel, handle, message, personalization, business_type, created_at, prospect_id')
        .order('created_at', { ascending: false })
        .limit(20);

      if (queueData) {
        // Fetch prospect names
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
    } catch (err) {
      console.error('[Admin Agents] Campaigns load error:', err);
    }
  };

  // ─── Tab change handler ────────────────────────────────
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    switch (tab) {
      case 'dashboard':
        loadDashboard();
        loadCeoHistory();
        break;
      case 'campagnes':
        loadCampaigns(campaignFilter);
        break;
      case 'briefs':
        loadBriefs();
        break;
      case 'ordres':
        loadOrders();
        break;
      case 'seo':
        loadSeoData();
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
        body: JSON.stringify({ action: 'generate_article' }),
      });
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
        body: JSON.stringify({ action: 'publish', article_id: articleId }),
      });
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
    const cls =
      status === 'pending'
        ? 'bg-amber-100 text-amber-700'
        : status === 'completed'
        ? 'bg-green-100 text-green-700'
        : status === 'failed'
        ? 'bg-red-100 text-red-700'
        : 'bg-neutral-100 text-neutral-600';
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls}`}>
        {status}
      </span>
    );
  };

  // ─── Helper: agent badge ──────────────────────────────
  const agentBadge = (agent: string) => {
    const cls =
      agent === 'ceo'
        ? 'bg-purple-100 text-purple-700'
        : agent === 'chatbot'
        ? 'bg-blue-100 text-blue-700'
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
        ? 'bg-blue-100 text-blue-700'
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
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'campagnes', label: 'Campagnes' },
    { key: 'seo', label: 'SEO Blog' },
    { key: 'briefs', label: 'Briefs CEO' },
    { key: 'ordres', label: 'Ordres' },
    { key: 'logs', label: 'Logs' },
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
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-700 to-blue-600 bg-clip-text text-transparent">
              Agents IA
            </h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Supervision du syst\u00E8me multi-agents KeiroAI
            </p>
          </div>
          <Link
            href="/mon-compte"
            className="text-sm text-neutral-600 hover:text-neutral-900 px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-all"
          >
            Retour
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-neutral-100 rounded-xl p-1 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white shadow-sm text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== TAB DASHBOARD ===== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {metrics.map((m, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{m.icon}</span>
                    {m.trend && (
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          m.trendUp
                            ? 'bg-green-50 text-green-600'
                            : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {m.trend}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-neutral-900">{m.value}</p>
                  <p className="text-xs text-neutral-500 mt-1">{m.label}</p>
                </div>
              ))}
            </div>

            {/* Test email section */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <h3 className="text-sm font-semibold text-neutral-900 mb-4">
                Tester un email
              </h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-neutral-500 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="mrzirraro@gmail.com"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Cat{'\u00E9'}gorie</label>
                  <select
                    value={testCategory}
                    onChange={(e) => setTestCategory(e.target.value)}
                    className="px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="restaurant">Restaurant</option>
                    <option value="boutique">Boutique</option>
                    <option value="coach">Coach</option>
                    <option value="coiffeur">Coiffeur</option>
                    <option value="caviste">Caviste</option>
                    <option value="fleuriste">Fleuriste</option>
                    <option value="traiteur">Traiteur</option>
                    <option value="freelance">Freelance</option>
                    <option value="services">Services</option>
                    <option value="professionnel">Professionnel</option>
                    <option value="agence">Agence</option>
                    <option value="pme">PME</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Step</label>
                  <select
                    value={testStep}
                    onChange={(e) => setTestStep(Number(e.target.value))}
                    className="px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value={1}>Email 1 (intro)</option>
                    <option value={2}>Email 2 (relance)</option>
                    <option value={3}>Email 3 (dernier)</option>
                    <option value={10}>Email warm (chatbot)</option>
                  </select>
                </div>
                <button
                  onClick={sendTestEmail}
                  disabled={testSending || !testEmail.trim()}
                  className="px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all"
                >
                  {testSending ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Envoi...
                    </span>
                  ) : (
                    'Tester'
                  )}
                </button>
              </div>
              {testResult && (
                <div
                  className={`mt-3 text-sm px-4 py-2.5 rounded-lg ${
                    testResult.ok
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {testResult.message}
                </div>
              )}
            </div>

            {/* CEO Chat */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="p-4 border-b border-neutral-100 bg-gradient-to-r from-purple-50 to-blue-50">
                <h3 className="text-sm font-semibold text-neutral-900">
                  Discuter avec le CEO Agent
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Pose des questions, demande des changements ou discute strategie
                </p>
              </div>

              {/* Messages */}
              <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
                {ceoMessages.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-neutral-400">Aucun message. Demande au CEO ce que tu veux.</p>
                    <div className="flex flex-wrap gap-2 justify-center mt-3">
                      {[
                        'Quel est le statut des campagnes ?',
                        'On peut envoyer 200 emails/jour ?',
                        'Quels business convertissent le mieux ?',
                        'Augmente le niveau du commercial',
                      ].map((q) => (
                        <button
                          key={q}
                          onClick={() => { setCeoInput(q); }}
                          className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full hover:bg-purple-100 transition-all"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {ceoMessages.map((msg, i) => {
                  // Detect [ACTION:xxx] patterns in assistant messages
                  const actions = msg.role === 'assistant'
                    ? (msg.content.match(/\[ACTION:([^\]]+)\]/g) || []).map(a => a.replace(/^\[ACTION:/, '').replace(/\]$/, ''))
                    : [];
                  const displayContent = msg.role === 'assistant'
                    ? msg.content.replace(/\[ACTION:[^\]]+\]/g, '').trim()
                    : msg.content;

                  return (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                        msg.role === 'user'
                          ? 'bg-purple-600 text-white'
                          : 'bg-neutral-100 text-neutral-800'
                      }`}>
                        <p className="whitespace-pre-wrap">{displayContent}</p>
                        {actions.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-neutral-200 space-y-1">
                            {actions.map((action, j) => (
                              <div key={j} className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg">
                                <span className="text-base">&#9889;</span>
                                <span className="font-medium">Action proposee:</span>
                                <span>{action}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {ceoLoading && (
                  <div className="flex justify-start">
                    <div className="bg-neutral-100 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-3 border-t border-neutral-100 flex gap-2">
                <input
                  type="text"
                  value={ceoInput}
                  onChange={(e) => setCeoInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCeoMessage(); } }}
                  placeholder="Demande au CEO..."
                  className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
                <button
                  onClick={sendCeoMessage}
                  disabled={ceoLoading || !ceoInput.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all"
                >
                  Envoyer
                </button>
              </div>
            </div>
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
                <select
                  value={campaignFilter}
                  onChange={(e) => {
                    setCampaignFilter(e.target.value);
                    loadCampaigns(e.target.value);
                  }}
                  className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="all">Tous les canaux</option>
                  <option value="email">Email</option>
                  <option value="dm_instagram">DM Instagram</option>
                  <option value="tiktok">TikTok</option>
                </select>
                <button
                  onClick={() => loadCampaigns(campaignFilter)}
                  className="text-xs text-purple-600 hover:underline"
                >
                  Actualiser
                </button>
              </div>
            </div>

            {/* DM Queue Preview */}
            {dmQueue.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="p-4 border-b border-neutral-100 bg-gradient-to-r from-purple-50 to-blue-50">
                  <h3 className="text-sm font-semibold text-neutral-900">File d'attente DM ({dmQueue.length} derniers)</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Messages en attente d'envoi par canal et business type</p>
                </div>
                <div className="divide-y divide-neutral-100">
                  {dmQueue.slice(0, 10).map((dm) => (
                    <div key={dm.id} className="p-4 hover:bg-neutral-50 transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          dm.channel === 'instagram' ? 'bg-pink-100 text-pink-700' :
                          dm.channel === 'tiktok' ? 'bg-neutral-900 text-white' :
                          'bg-blue-100 text-blue-700'
                        }`}>{dm.channel}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 text-neutral-600">
                          {dm.business_type || 'N/A'}
                        </span>
                        <span className="text-xs font-medium text-neutral-800">{dm.prospect_name}</span>
                        <span className="text-xs text-neutral-400 ml-auto">@{dm.handle}</span>
                      </div>
                      <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-100">
                        <p className="text-sm text-neutral-700 whitespace-pre-wrap">{dm.message}</p>
                      </div>
                      {dm.personalization && (
                        <p className="text-[10px] text-neutral-400 mt-1">Perso: {dm.personalization}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Campaign History */}
            {(() => {
              const dateMap: Record<string, number> = { '1d': 1, '3d': 3, '7d': 7, '30d': 30 };
              const days = dateMap[campaignDateFilter] || 0;
              const cutoff = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : '';
              const filteredCampaigns = cutoff ? campaigns.filter(c => c.date >= cutoff) : campaigns;
              return filteredCampaigns.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center text-neutral-400">
                Aucune campagne pour le moment
              </div>
            ) : (
              filteredCampaigns.map((campaign) => {
                const isExpanded = expandedCampaign === campaign.id;
                const channelLabel = campaign.agent === 'email'
                  ? (campaign.action === 'daily_warm' ? 'Email (warm)' : 'Email (cold)')
                  : campaign.agent === 'dm_instagram'
                  ? 'DM Instagram'
                  : 'TikTok';
                const channelColor = campaign.agent === 'email'
                  ? 'bg-green-100 text-green-700'
                  : campaign.agent === 'dm_instagram'
                  ? 'bg-pink-100 text-pink-700'
                  : 'bg-neutral-900 text-white';

                return (
                  <div key={campaign.id} className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                    <button
                      onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}
                      className="w-full text-left p-5 hover:bg-neutral-50 transition-all"
                    >
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
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-lg font-bold text-neutral-900">{campaign.success}</span>
                            <span className="text-xs text-neutral-400 ml-1">envoy{campaign.agent === 'email' ? 'es' : 'es'}</span>
                          </div>
                          {campaign.failed > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                              {campaign.failed} echec
                            </span>
                          )}
                          <svg className={`w-5 h-5 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {/* Business type summary */}
                      {Object.keys(campaign.byBusinessType).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {Object.entries(campaign.byBusinessType).map(([type, data]) => (
                            <span key={type} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                              {type}: {data.sent || data.count || 0}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-neutral-100 p-5 bg-neutral-50 space-y-4">
                        {/* Business type breakdown */}
                        {Object.keys(campaign.byBusinessType).length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-2">Par type de business</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {Object.entries(campaign.byBusinessType).map(([type, data]) => (
                                <div key={type} className="bg-white rounded-lg border p-3">
                                  <p className="text-sm font-bold text-neutral-900">{data.sent || data.count || 0}</p>
                                  <p className="text-xs text-neutral-600 capitalize">{type}</p>
                                  {data.steps && data.steps.length > 0 && (
                                    <p className="text-[10px] text-neutral-400 mt-1">
                                      Steps: {[...new Set(data.steps)].join(', ')}
                                    </p>
                                  )}
                                  {data.handles && data.handles.length > 0 && (
                                    <p className="text-[10px] text-neutral-400 mt-1">
                                      {data.handles.slice(0, 3).map((h: string) => `@${h}`).join(', ')}
                                      {data.handles.length > 3 && ` +${data.handles.length - 3}`}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* DM/Comment examples */}
                        {campaign.dmExamples && campaign.dmExamples.length > 0 && campaign.dmExamples[0]?.comment && (
                          <div>
                            <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-2">
                              Exemples de messages ({campaign.agent === 'tiktok_comments' ? 'commentaires' : 'DMs'})
                            </h4>
                            <div className="space-y-2">
                              {campaign.dmExamples.filter((d: any) => d.comment).slice(0, 5).map((dm: any, i: number) => (
                                <div key={i} className="bg-white rounded-lg border p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-neutral-800">{dm.name}</span>
                                    {dm.type && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">{dm.type}</span>
                                    )}
                                  </div>
                                  <p className="text-sm text-neutral-600 bg-neutral-50 rounded p-2 whitespace-pre-wrap">
                                    {dm.comment}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Email results detail */}
                        {campaign.agent === 'email' && campaign.results && campaign.results.length > 0 && (
                          <details className="text-xs">
                            <summary className="text-neutral-500 cursor-pointer hover:text-neutral-700 font-semibold uppercase">
                              Details ({campaign.results.length} emails)
                            </summary>
                            <div className="mt-2 space-y-1">
                              {campaign.results.slice(0, 20).map((r: any, i: number) => (
                                <div key={i} className={`flex items-center gap-2 py-1 px-2 rounded ${r.success ? 'bg-green-50' : 'bg-red-50'}`}>
                                  <span className={`w-2 h-2 rounded-full ${r.success ? 'bg-green-400' : 'bg-red-400'}`} />
                                  <span className="text-neutral-600">Step {r.step}</span>
                                  <span className="text-neutral-400 truncate">{r.prospect_id?.slice(0, 8)}...</span>
                                  {r.error && <span className="text-red-500 truncate">{r.error}</span>}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            );
            })()}
          </div>
        )}

        {/* ===== TAB SEO BLOG ===== */}
        {activeTab === 'seo' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Articles total', value: seoStats.total, icon: '📝' },
                { label: 'Publiés', value: seoStats.published, icon: '✅' },
                { label: 'Brouillons', value: seoStats.drafts, icon: '📋' },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 text-center">
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className="text-2xl font-bold text-neutral-900">{s.value}</div>
                  <div className="text-xs text-neutral-500">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Actions + Filter */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSeoGenerate}
                  disabled={seoGenerating}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {seoGenerating ? 'Generation...' : 'Generer un article'}
                </button>
                <button
                  onClick={loadSeoData}
                  className="text-sm text-purple-600 hover:underline"
                >
                  Actualiser
                </button>
              </div>
              <select
                value={seoStatusFilter}
                onChange={(e) => setSeoStatusFilter(e.target.value)}
                className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">Tous les statuts</option>
                <option value="published">Publiés</option>
                <option value="draft">Brouillons</option>
              </select>
            </div>

            {/* Articles list */}
            {seoArticles.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center text-neutral-400">
                Aucun article. Clique sur &quot;Generer un article&quot; pour commencer.
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="grid grid-cols-6 gap-2 px-4 py-3 bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold text-neutral-500 uppercase">
                  <span className="col-span-2">Titre</span>
                  <span>Mot-cle</span>
                  <span>Statut</span>
                  <span>Date</span>
                  <span>Actions</span>
                </div>
                {seoArticles.filter(a => seoStatusFilter === 'all' || a.status === seoStatusFilter).map((article) => (
                  <div
                    key={article.id}
                    className="grid grid-cols-6 gap-2 px-4 py-3 items-center border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-all"
                  >
                    <span className="col-span-2 text-sm font-medium text-neutral-900 truncate">
                      {article.title}
                    </span>
                    <span className="text-xs text-neutral-600 truncate">
                      {article.keywords_primary}
                    </span>
                    <span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        article.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : article.status === 'draft'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}>
                        {article.status === 'published' ? 'Publie' : article.status === 'draft' ? 'Brouillon' : article.status}
                      </span>
                    </span>
                    <span className="text-xs text-neutral-500">
                      {new Date(article.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-2">
                      {article.status === 'draft' && (
                        <button
                          onClick={() => handleSeoPublish(article.id)}
                          disabled={seoPublishing === article.id}
                          className="text-xs text-green-600 hover:underline disabled:opacity-50"
                        >
                          {seoPublishing === article.id ? '...' : 'Publier'}
                        </button>
                      )}
                      {article.status === 'published' && (
                        <a
                          href={`/blog/${article.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 hover:underline"
                        >
                          Voir
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB BRIEFS CEO ===== */}
        {activeTab === 'briefs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                Briefs CEO ({briefs.length})
              </h2>
              <button
                onClick={executeCeoBrief}
                disabled={executingCeo}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all"
              >
                {executingCeo ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Ex\u00E9cution...
                  </span>
                ) : (
                  'Ex\u00E9cuter maintenant'
                )}
              </button>
            </div>

            {briefs.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center text-neutral-400">
                Aucun brief CEO pour le moment
              </div>
            ) : (
              briefs.map((brief) => {
                const meta = brief.data || {};
                const isExpanded = expandedBrief === brief.id;
                // Support both new (brief_text) and legacy (brief object) format
                const briefText = meta.brief_text || (typeof meta.brief === 'string' ? meta.brief : null);
                const isNaturalLanguage = !!briefText;
                // Extract preview: first non-empty, non-heading line
                const previewLine = briefText
                  ? briefText.split('\n').find((l: string) => l.trim() && !l.startsWith('##'))?.trim() || ''
                  : meta.brief_fondateur || '';

                return (
                  <div
                    key={brief.id}
                    className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedBrief(isExpanded ? null : brief.id)}
                      className="w-full text-left p-5 hover:bg-neutral-50 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-neutral-900">
                            {new Date(brief.created_at).toLocaleDateString('fr-FR', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </span>
                          {!isNaturalLanguage && performanceBadge(meta.performance_globale || meta.performance)}
                        </div>
                        <svg
                          className={`w-5 h-5 text-neutral-400 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>

                      {previewLine && (
                        <p className="text-sm text-neutral-600 line-clamp-2">
                          {previewLine}
                        </p>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-neutral-100 p-5 bg-neutral-50">
                        {isNaturalLanguage ? (
                          /* New natural language brief display */
                          <div className="prose prose-sm max-w-none">
                            <div className="text-sm text-neutral-800 leading-relaxed">
                              {briefText.split('\n').map((line: string, i: number) => {
                                if (line.startsWith('## ')) {
                                  return <h4 key={i} className="text-sm font-bold text-purple-700 mt-4 mb-2 uppercase">{line.replace('## ', '')}</h4>;
                                }
                                if (line.startsWith('- ')) {
                                  const content = line.substring(2);
                                  return <p key={i} className="text-sm text-neutral-700 ml-3 my-0.5">&bull; {content}</p>;
                                }
                                if (line.trim() === '') return <div key={i} className="h-2" />;
                                // Bold **text**
                                const parts = line.split(/(\*\*.*?\*\*)/g);
                                return (
                                  <p key={i} className="text-sm text-neutral-700 my-0.5">
                                    {parts.map((part, j) =>
                                      part.startsWith('**') && part.endsWith('**')
                                        ? <strong key={j} className="font-semibold text-neutral-900">{part.slice(2, -2)}</strong>
                                        : part
                                    )}
                                  </p>
                                );
                              })}
                            </div>

                            {/* Metrics summary from stored data */}
                            {meta.metrics_24h && (
                              <details className="mt-4 text-xs">
                                <summary className="text-neutral-500 cursor-pointer hover:text-neutral-700 font-semibold uppercase">Donnees brutes 24h</summary>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                                  {Object.entries(meta.metrics_24h).filter(([k]) => typeof meta.metrics_24h[k] === 'number').map(([key, val]: [string, any]) => (
                                    <div key={key} className="bg-white rounded-lg border p-2 text-center">
                                      <p className="text-lg font-bold text-neutral-900">{val}</p>
                                      <p className="text-[10px] text-neutral-500">{key.replace(/_/g, ' ')}</p>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        ) : (
                          /* Legacy JSON-based brief display (for old briefs) */
                          <div className="space-y-4">
                            {meta.metriques_resumees && (
                              <div>
                                <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-2">KPIs 24h</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {Object.entries(meta.metriques_resumees).map(([key, val]: [string, any]) => (
                                    <div key={key} className="bg-white rounded-lg border p-2 text-center">
                                      <p className="text-lg font-bold text-neutral-900">{typeof val === 'number' ? val : String(val)}</p>
                                      <p className="text-[10px] text-neutral-500">{key.replace(/_/g, ' ')}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {meta.analyse && (
                              <div>
                                <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-2">Analyse</h4>
                                <p className="text-sm text-neutral-700 whitespace-pre-wrap">{typeof meta.analyse === 'string' ? meta.analyse : JSON.stringify(meta.analyse, null, 2)}</p>
                              </div>
                            )}
                            <details className="text-xs">
                              <summary className="text-neutral-500 cursor-pointer hover:text-neutral-700 font-semibold uppercase">JSON brut (debug)</summary>
                              <pre className="text-neutral-600 bg-white p-3 rounded-lg border border-neutral-200 overflow-x-auto max-h-64 overflow-y-auto mt-2">
                                {JSON.stringify(meta, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
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
                  <option value="email">Email</option>
                  <option value="chatbot">Chatbot</option>
                  <option value="commercial">Commercial</option>
                  <option value="dm_instagram">DM Instagram</option>
                  <option value="seo">SEO</option>
                </select>
                {selectedOrders.size > 0 && (
                  <button
                    onClick={executeSelectedOrders}
                    disabled={executingOrders}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all"
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
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-8 gap-2 px-4 py-3 bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold text-neutral-500 uppercase">
                  <span className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedOrders.size > 0 && selectedOrders.size === orders.filter(o => o.status === 'pending').length}
                      onChange={selectAllPendingOrders}
                      className="w-3.5 h-3.5 rounded border-neutral-300 text-purple-600 focus:ring-purple-500"
                    />
                  </span>
                  <span>Date</span>
                  <span>De \u2192 Vers</span>
                  <span>Type</span>
                  <span>Priorit\u00E9</span>
                  <span>Action</span>
                  <span>Statut</span>
                  <span></span>
                </div>

                {/* Table body */}
                {orders.filter(o =>
                  (orderFilterStatus === 'all' || o.status === orderFilterStatus) &&
                  (orderFilterAgent === 'all' || o.to_agent === orderFilterAgent || o.from_agent === orderFilterAgent)
                ).map((order) => {
                  const isExpanded = expandedOrder === order.id;
                  const isPending = order.status === 'pending';
                  return (
                    <div key={order.id}>
                      <div
                        className="w-full grid grid-cols-8 gap-2 px-4 py-3 items-center text-left hover:bg-neutral-50 transition-all border-b border-neutral-100 last:border-0 cursor-pointer"
                      >
                        <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                          {isPending ? (
                            <input
                              type="checkbox"
                              checked={selectedOrders.has(order.id)}
                              onChange={() => toggleOrderSelection(order.id)}
                              className="w-3.5 h-3.5 rounded border-neutral-300 text-purple-600 focus:ring-purple-500"
                            />
                          ) : (
                            <span className="w-3.5" />
                          )}
                        </span>
                        <span className="text-xs text-neutral-600" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                          {new Date(order.created_at).toLocaleDateString('fr-FR')}
                        </span>
                        <span className="text-xs font-medium text-neutral-800" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                          {order.from_agent} \u2192 {order.to_agent}
                        </span>
                        <span className="text-xs text-neutral-600" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                          {order.order_type}
                        </span>
                        <span onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>{priorityBadge(order.priority)}</span>
                        <span className="text-xs text-neutral-700 truncate" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                          {order.order_type}
                        </span>
                        <span onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>{statusBadge(order.status)}</span>
                        <span className="text-right" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                          <svg
                            className={`w-4 h-4 text-neutral-400 inline-block transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                          <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-1">
                            Payload
                          </h4>
                          <pre className="text-xs text-neutral-600 bg-white p-3 rounded-lg border border-neutral-200 overflow-x-auto max-h-48 overflow-y-auto">
                            {JSON.stringify(order.payload, null, 2)}
                          </pre>
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
      </main>
    </div>
  );
}
