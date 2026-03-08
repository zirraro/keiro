'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';

type Tab = 'dashboard' | 'briefs' | 'ordres' | 'logs';

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
    };
    init();
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
        solo: 49,
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

  // ─── Tab change handler ────────────────────────────────
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    switch (tab) {
      case 'dashboard':
        loadDashboard();
        break;
      case 'briefs':
        loadBriefs();
        break;
      case 'ordres':
        loadOrders();
        break;
      case 'logs':
        loadLogs(0, logFilter);
        break;
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
                          {performanceBadge(meta.performance_globale || meta.performance)}
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

                      {meta.brief_fondateur && (
                        <p className="text-sm text-neutral-600 line-clamp-2">
                          {meta.brief_fondateur}
                        </p>
                      )}

                      {(meta.alertes || meta.alerts) && (meta.alertes || meta.alerts).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {(meta.alertes || meta.alerts).map((alert: any, j: number) => {
                            const level = alert?.level || 'info';
                            const msg = alert?.message || (typeof alert === 'string' ? alert : JSON.stringify(alert));
                            const colorMap: Record<string, string> = { critique: 'bg-red-50 text-red-600', attention: 'bg-orange-50 text-orange-600', info: 'bg-blue-50 text-blue-600' };
                            return (
                              <span key={j} className={`text-[10px] px-2 py-0.5 rounded-full ${colorMap[level] || colorMap.info}`}>
                                {level === 'critique' ? '🔴' : level === 'attention' ? '🟡' : '🟢'} {msg}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-neutral-100 p-5 bg-neutral-50">
                        <div className="space-y-4">

                          {/* Métriques résumées */}
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

                          {/* Analyse en langage naturel */}
                          {meta.analyse && (
                            <div>
                              <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-2">Analyse</h4>
                              {typeof meta.analyse === 'string' ? (
                                <p className="text-sm text-neutral-700 whitespace-pre-wrap">{meta.analyse}</p>
                              ) : (
                                <div className="space-y-2">
                                  {meta.analyse.points_forts && (
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                      <p className="text-xs font-semibold text-green-700 mb-1">Points forts</p>
                                      {Array.isArray(meta.analyse.points_forts)
                                        ? meta.analyse.points_forts.map((p: string, i: number) => <p key={i} className="text-sm text-green-800">• {p}</p>)
                                        : <p className="text-sm text-green-800">{meta.analyse.points_forts}</p>}
                                    </div>
                                  )}
                                  {meta.analyse.points_faibles && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                      <p className="text-xs font-semibold text-red-700 mb-1">Points faibles</p>
                                      {Array.isArray(meta.analyse.points_faibles)
                                        ? meta.analyse.points_faibles.map((p: string, i: number) => <p key={i} className="text-sm text-red-800">• {p}</p>)
                                        : <p className="text-sm text-red-800">{meta.analyse.points_faibles}</p>}
                                    </div>
                                  )}
                                  {meta.analyse.bottleneck && (
                                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                                      <p className="text-xs font-semibold text-orange-700 mb-1">Bottleneck</p>
                                      <p className="text-sm text-orange-800">{meta.analyse.bottleneck}</p>
                                    </div>
                                  )}
                                  {meta.analyse.tendance_7j && (
                                    <p className="text-sm text-neutral-600">Tendance 7j : {meta.analyse.tendance_7j}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Ordres en langage naturel */}
                          {(meta.ordres || meta.orders) && (meta.ordres || meta.orders).length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-2">Ordres ({(meta.ordres || meta.orders).length})</h4>
                              <div className="space-y-2">
                                {(meta.ordres || meta.orders).map((o: any, i: number) => (
                                  <div key={i} className="bg-white rounded-lg border p-3 flex items-start gap-3">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                      o.priority === 'haute' ? 'bg-red-100 text-red-700' : o.priority === 'basse' ? 'bg-neutral-100 text-neutral-600' : 'bg-blue-100 text-blue-700'
                                    }`}>{o.priority || 'moyenne'}</span>
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-neutral-900">
                                        → {o.to_agent || o.target_agent} : {o.action || o.type}
                                      </p>
                                      {o.reason && <p className="text-xs text-neutral-500 mt-0.5">{o.reason}</p>}
                                      {o.expected_impact && <p className="text-xs text-green-600 mt-0.5">Impact attendu : {o.expected_impact}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Suggestions en langage naturel */}
                          {(meta.suggestions || meta.suggestions_fondateur) && (
                            <div>
                              <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-2">Suggestions</h4>
                              {(() => {
                                const sug = meta.suggestions_fondateur || meta.suggestions;
                                if (typeof sug === 'string') return <p className="text-sm text-neutral-700">{sug}</p>;
                                return (
                                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-1">
                                    {sug.terrain && <p className="text-sm text-purple-800">🎯 {sug.terrain}</p>}
                                    {sug.priority_du_jour && <p className="text-sm text-purple-800">⚡ Priorité : {sug.priority_du_jour}</p>}
                                    {sug.opportunité && <p className="text-sm text-purple-800">💡 Opportunité : {sug.opportunité}</p>}
                                    {sug.opportunite && <p className="text-sm text-purple-800">💡 Opportunité : {sug.opportunite}</p>}
                                    {Array.isArray(sug) && sug.map((s: any, i: number) => (
                                      <p key={i} className="text-sm text-purple-800">• {typeof s === 'string' ? s : s.message || s.suggestion || JSON.stringify(s)}</p>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* A/B Tests */}
                          {meta.ab_tests_en_cours && meta.ab_tests_en_cours.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-2">A/B Tests en cours</h4>
                              <div className="space-y-2">
                                {meta.ab_tests_en_cours.map((test: any, i: number) => (
                                  <div key={i} className="bg-white rounded-lg border p-3">
                                    <p className="text-sm font-medium text-neutral-900">{test.test || test.name}</p>
                                    <p className="text-xs text-neutral-500 mt-1">
                                      A: {test.variante_a} vs B: {test.variante_b} — {test.status} ({test.jours_restants || test.days_remaining}j restants)
                                    </p>
                                    {test.resultat_preliminaire && <p className="text-xs text-blue-600 mt-0.5">{test.resultat_preliminaire}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* JSON complet (replié par défaut) */}
                          <details className="text-xs">
                            <summary className="text-neutral-500 cursor-pointer hover:text-neutral-700 font-semibold uppercase">JSON brut (debug)</summary>
                            <pre className="text-neutral-600 bg-white p-3 rounded-lg border border-neutral-200 overflow-x-auto max-h-64 overflow-y-auto mt-2">
                              {JSON.stringify(meta, null, 2)}
                            </pre>
                          </details>
                        </div>
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
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                Ordres ({orders.length})
              </h2>
              <div className="flex items-center gap-3">
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
                {orders.map((order) => {
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
