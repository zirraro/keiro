'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ClientAgent } from '@/lib/agents/client-context';
import { CLIENT_AGENTS } from '@/lib/agents/client-context';

const CrmDashboard = dynamic(() => import('./components/CrmDashboard'), { ssr: false });
const AgentDashboard = dynamic(() => import('./components/AgentDashboard'), { ssr: false });

const AGENTS_WITH_DASHBOARD = [
  'marketing', 'commercial', 'email', 'content', 'seo', 'ads', 'comptable',
  'rh', 'onboarding', 'dm_instagram', 'tiktok_comments', 'gmaps', 'chatbot',
];

// ─── Types ─────────────────────────────────────────────────

interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; created_at: string; }
interface AgentInfo { name: string; avatar_url: string; avatar_3d_url: string; title: string; gradient_from: string; gradient_to: string; }
interface UploadedFile { id: string; name: string; size: number; uploaded_at: string; url?: string; }
interface AgentTask { id: string; type: string; description: string; status: string; result?: string; created_at: string; agent?: string; }

// ─── Agent settings config per role ─────────────────────────

interface SettingField { key: string; label: string; type: 'toggle' | 'select' | 'time' | 'number'; options?: { value: string; label: string }[]; default: any; description: string; }

function getAgentSettings(agentId: string): SettingField[] {
  const common: SettingField[] = [
    { key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'auto', label: 'Automatique' }, { value: 'notify', label: 'Notification avant action' }, { value: 'manual', label: 'Manuel' }], default: 'notify', description: 'Automatique = agit seul. Notification = demande avant. Manuel = vous decidez.' },
    { key: 'active', label: 'Agent actif', type: 'toggle', default: true, description: 'Desactiver pour mettre en pause' },
  ];
  const byAgent: Record<string, SettingField[]> = {
    email: [
      { key: 'send_hour', label: 'Heure d\'envoi', type: 'time', default: '09:00', description: 'Heure optimale pour envoyer les emails' },
      { key: 'max_per_day', label: 'Max emails/jour', type: 'number', default: 10, description: 'Limite d\'emails envoyes par jour' },
      { key: 'auto_relance', label: 'Relance auto', type: 'toggle', default: true, description: 'Relancer automatiquement les non-reponses' },
      { key: 'relance_delay', label: 'Delai relance (jours)', type: 'number', default: 3, description: 'Jours entre chaque relance' },
      { key: 'tone', label: 'Ton', type: 'select', options: [{ value: 'friendly', label: 'Amical (tutoiement)' }, { value: 'formal', label: 'Professionnel (vouvoiement)' }, { value: 'casual', label: 'Decontracte' }], default: 'friendly', description: 'Style d\'ecriture des emails' },
    ],
    content: [
      { key: 'posts_per_week', label: 'Posts/semaine', type: 'number', default: 3, description: 'Nombre de publications par semaine' },
      { key: 'platforms', label: 'Plateforme prioritaire', type: 'select', options: [{ value: 'instagram', label: 'Instagram' }, { value: 'tiktok', label: 'TikTok' }, { value: 'both', label: 'Les deux' }], default: 'instagram', description: 'Ou publier en priorite' },
      { key: 'publish_hour', label: 'Heure de publication', type: 'time', default: '12:00', description: 'Meilleur creneau pour publier' },
      { key: 'auto_publish', label: 'Publication auto', type: 'toggle', default: false, description: 'Publier sans validation manuelle' },
    ],
    dm_instagram: [
      { key: 'max_dms_day', label: 'Max DMs/jour', type: 'number', default: 20, description: 'Limite de DMs envoyes par jour' },
      { key: 'target', label: 'Cible', type: 'select', options: [{ value: 'new_followers', label: 'Nouveaux abonnes' }, { value: 'engaged', label: 'Utilisateurs engages' }, { value: 'prospects', label: 'Prospects CRM' }], default: 'new_followers', description: 'A qui envoyer les DMs' },
      { key: 'response_time', label: 'Reponse auto', type: 'toggle', default: true, description: 'Repondre automatiquement aux DMs recus' },
    ],
    commercial: [
      { key: 'scoring_threshold', label: 'Seuil score contact', type: 'number', default: 30, description: 'Score minimum pour contacter un prospect' },
      { key: 'auto_qualify', label: 'Qualification auto', type: 'toggle', default: true, description: 'Qualifier automatiquement les prospects' },
    ],
    seo: [
      { key: 'articles_per_month', label: 'Articles/mois', type: 'number', default: 4, description: 'Nombre d\'articles SEO par mois' },
      { key: 'auto_publish_blog', label: 'Publication auto blog', type: 'toggle', default: false, description: 'Publier les articles sans validation' },
    ],
    ads: [
      { key: 'daily_budget', label: 'Budget quotidien (EUR)', type: 'number', default: 20, description: 'Budget max par jour pour les campagnes' },
      { key: 'auto_optimize', label: 'Optimisation auto', type: 'toggle', default: true, description: 'Ajuster automatiquement les encheres' },
    ],
    tiktok_comments: [
      { key: 'comments_per_day', label: 'Commentaires/jour', type: 'number', default: 15, description: 'Nombre de commentaires strategiques par jour' },
      { key: 'engage_hour', label: 'Heure d\'engagement', type: 'time', default: '18:00', description: 'Meilleur creneau pour engager' },
    ],
    chatbot: [
      { key: 'greeting', label: 'Message d\'accueil', type: 'select', options: [{ value: 'default', label: 'Standard' }, { value: 'promo', label: 'Avec offre promo' }, { value: 'minimal', label: 'Minimal' }], default: 'default', description: 'Premier message affiche aux visiteurs' },
      { key: 'collect_email', label: 'Collecter email', type: 'toggle', default: true, description: 'Demander l\'email dans la conversation' },
    ],
  };
  return [...common, ...(byAgent[agentId] || [])];
}

// ─── Helpers ───────────────────────────────────────────────

function generateId() { return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
function formatFileSize(bytes: number) { if (bytes < 1024) return bytes + ' o'; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko'; return (bytes / (1024 * 1024)).toFixed(1) + ' Mo'; }
function formatDate(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
function formatDateTime(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => { const c = () => setM(window.innerWidth < 1024); c(); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c); }, []);
  return m;
}

function getAgentSuggestions(agentId: string): string[] {
  const s: Record<string, string[]> = {
    marketing: ['Analyse mes KPIs', 'Plan marketing ce mois-ci'],
    commercial: ['Prospects chauds a relancer', 'Taux de conversion pipeline'],
    email: ['Sequence email prospects froids', 'Taux d\'ouverture'],
    content: ['Calendrier editorial semaine', '5 idees posts Instagram'],
    seo: ['Analyse SEO mon site', 'Mots-cles a cibler'],
    ads: ['Campagne Meta Ads', 'Optimise budget ROAS'],
    comptable: ['Point tresorerie', 'Factures en retard'],
    rh: ['Contrat de prestation', 'Conformite RGPD'],
    onboarding: ['Configurer mon espace', 'Agents a activer'],
    dm_instagram: ['Campagne DMs', 'Messages d\'approche'],
    tiktok_comments: ['Engager communaute', 'Engagement TikTok'],
    gmaps: ['Fiche Google Maps', 'Repondre avis clients'],
    chatbot: ['Leads captures', 'Optimiser reponses auto'],
  };
  return s[agentId] || ['Que peux-tu faire ?', 'Analyse performances'];
}

function renderContent(content: string) {
  return content.split('\n').map((line, i) => {
    if (/^[\-\*]\s/.test(line.trim())) return <div key={i} className="flex items-start gap-2 ml-2"><span className="text-purple-400">&#8226;</span><span>{line.trim().slice(2)}</span></div>;
    if (line.trim() === '') return <div key={i} className="h-2" />;
    return <p key={i} className={i > 0 ? 'mt-1' : ''}>{line}</p>;
  });
}

// ─── Day names for planning ─────────────────────────────────

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ─── Main Component ─────────────────────────────────────────

export default function AgentWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const agentId = params.id as string;

  // Core
  const [agent, setAgent] = useState<ClientAgent | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  // Tabs: dashboard | planning | history | settings
  const [activeTab, setActiveTab] = useState<'dashboard' | 'planning' | 'history' | 'settings'>('dashboard');

  // Chat (slide-over)
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Files
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Dashboard
  const hasDashboard = AGENTS_WITH_DASHBOARD.includes(agentId);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // History (tasks done by agent)
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Settings
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Init agent ────────────────────────────────────────
  useEffect(() => { const f = CLIENT_AGENTS.find(a => a.id === agentId); if (f) setAgent(f); }, [agentId]);

  // ─── Load chat + agent info ────────────────────────────
  useEffect(() => {
    if (!agentId) return;
    async function load() {
      try {
        const res = await fetch(`/api/agents/client-chat?agent_id=${agentId}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.messages) setMessages(data.messages.map((m: any, i: number) => ({ id: m.id || `h_${i}`, role: m.role, content: m.content, created_at: m.created_at || new Date().toISOString() })));
          if (data.agent) setAgentInfo(data.agent);
          if (data.files) setFiles(data.files);
        }
      } catch {} finally { setPageLoading(false); }
    }
    load();
  }, [agentId]);

  // ─── Load avatar fallback ─────────────────────────────
  useEffect(() => {
    if (agentInfo || !agent) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/avatars');
        const data = await res.json();
        const m = data.avatars?.find((a: any) => a.id === agentId);
        if (m) setAgentInfo({ name: agent.displayName, avatar_url: m.avatar_url || '', avatar_3d_url: m.avatar_3d_url || '', title: agent.title || '', gradient_from: agent.gradientFrom || '#8b5cf6', gradient_to: agent.gradientTo || '#6d28d9' });
      } catch {}
    })();
  }, [agent, agentId, agentInfo]);

  // ─── Load dashboard ───────────────────────────────────
  useEffect(() => {
    if (!hasDashboard || dashboardData) return;
    setDashboardLoading(true);
    (async () => {
      try { const res = await fetch(`/api/agents/dashboard?agent_id=${agentId}`, { credentials: 'include' }); if (res.ok) setDashboardData(await res.json()); } catch {} finally { setDashboardLoading(false); }
    })();
  }, [agentId, hasDashboard, dashboardData]);

  // ─── Load task history ────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'history' || tasks.length > 0) return;
    setTasksLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/agents/dashboard?agent_id=${agentId}&type=logs`, { credentials: 'include' });
        if (res.ok) { const data = await res.json(); setTasks(data.logs || data.recommendations || []); }
      } catch {} finally { setTasksLoading(false); }
    })();
  }, [activeTab, agentId, tasks.length]);

  // ─── Load settings from localStorage ──────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`keiro_agent_settings_${agentId}`);
      if (stored) { setSettings(JSON.parse(stored)); return; }
    } catch {}
    // Init defaults
    const fields = getAgentSettings(agentId);
    const defaults: Record<string, any> = {};
    fields.forEach(f => { defaults[f.key] = f.default; });
    setSettings(defaults);
  }, [agentId]);

  // ─── Save settings ───────────────────────────────────
  const handleSaveSettings = useCallback(() => {
    try { localStorage.setItem(`keiro_agent_settings_${agentId}`, JSON.stringify(settings)); } catch {}
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }, [agentId, settings]);

  // ─── Chat handlers ───────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  const handleSend = useCallback(async () => {
    const text = input.trim(); if (!text || isLoading) return;
    setMessages(prev => [...prev, { id: generateId(), role: 'user', content: text, created_at: new Date().toISOString() }]);
    setInput(''); setIsLoading(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    try {
      const res = await fetch('/api/agents/client-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ agent_id: agentId, message: text }) });
      const replyContent = res.ok ? ((await res.json()).message || 'Reponse recue.') : 'Merci ! Je traite ta demande.';
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: replyContent, created_at: new Date().toISOString() }]);
    } catch { setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: 'Oups, probleme de connexion.', created_at: new Date().toISOString() }]); }
    finally { setIsLoading(false); }
  }, [input, isLoading, agentId]);

  // ─── File handlers ───────────────────────────────────
  const handleFileUpload = useCallback(async (fl: FileList | null) => {
    if (!fl?.length) return; setUploading(true);
    for (let i = 0; i < fl.length; i++) {
      const fd = new FormData(); fd.append('file', fl[i]); fd.append('agent_id', agentId);
      try { const r = await fetch('/api/agents/agent-files', { method: 'POST', credentials: 'include', body: fd }); if (r.ok) { const d = await r.json(); setFiles(p => [...p, { id: d.id || generateId(), name: fl[i].name, size: fl[i].size, uploaded_at: new Date().toISOString(), url: d.url }]); } } catch {}
    } setUploading(false);
  }, [agentId]);

  const handleDeleteFile = useCallback(async (fid: string) => {
    try { await fetch(`/api/agents/agent-files?id=${fid}&agent_id=${agentId}`, { method: 'DELETE', credentials: 'include' }); setFiles(p => p.filter(f => f.id !== fid)); } catch {}
  }, [agentId]);

  // ─── Derived ──────────────────────────────────────────
  const dn = agent?.displayName || agentInfo?.name || agentId;
  const title = agent?.title || agentInfo?.title || '';
  const gf = agent?.gradientFrom || agentInfo?.gradient_from || '#8b5cf6';
  const gt = agent?.gradientTo || agentInfo?.gradient_to || '#6d28d9';
  const av = agentInfo?.avatar_3d_url || agentInfo?.avatar_url || null;
  const icon = agent?.icon || '\uD83E\uDD16';
  const desc = agent?.description || '';

  // ─── Planning mock data (from tasks/activities) ───────
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - d.getDay() + 1 + i);
    return d;
  });

  // ─── Loading ──────────────────────────────────────────
  if (pageLoading) return (
    <div className="min-h-screen bg-[#0c1a3a] pt-16 flex items-center justify-center">
      <div className="text-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400 mx-auto mb-4" /><p className="text-white/60 text-sm">Chargement...</p></div>
    </div>
  );

  const settingFields = getAgentSettings(agentId);

  // ─── RENDER ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0c1a3a] pt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:pb-8">

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/assistant')} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 shadow-lg" style={{ background: `linear-gradient(135deg, ${gf}, ${gt})`, padding: '2.5px' }}>
            <div className="w-full h-full rounded-2xl overflow-hidden bg-gray-900 flex items-center justify-center">
              {av ? <img src={av} alt={dn} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} /> : <span className="text-2xl">{icon}</span>}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-xl lg:text-2xl leading-tight">{dn}</h1>
            <p className="text-white/50 text-sm">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-green-500/15 border border-green-500/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-300 text-[10px] font-medium">Actif</span>
            </div>
            <button onClick={() => setChatOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Chat
            </button>
          </div>
        </div>

        {/* ═══ TABS ═══ */}
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10 mb-6 overflow-x-auto">
          {([
            { key: 'dashboard' as const, label: 'Dashboard', icon: '\uD83D\uDCCA' },
            { key: 'planning' as const, label: 'Planning', icon: '\uD83D\uDCC5' },
            { key: 'history' as const, label: 'Historique', icon: '\u26A1' },
            { key: 'settings' as const, label: 'Parametres', icon: '\u2699\uFE0F' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-white shadow-md'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
              style={activeTab === tab.key ? { background: `linear-gradient(135deg, ${gf}, ${gt})` } : undefined}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ TAB: DASHBOARD ═══ */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {hasDashboard && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                  {dashboardLoading ? (
                    <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto" /></div>
                  ) : agentId === 'commercial' ? (
                    <CrmDashboard data={dashboardData || { prospects: [], activities: [], pipeline: {}, stats: { total: 0, hot: 0, warm: 0, cold: 0, converted: 0, conversionRate: 0 } }} />
                  ) : (
                    <AgentDashboard agentId={agentId} agentName={dn} gradientFrom={gf} gradientTo={gt} data={dashboardData || {}} />
                  )}
                </div>
              )}
              {/* Quick actions */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Actions rapides
                </h3>
                <div className="flex flex-wrap gap-2">
                  {getAgentSuggestions(agentId).map(s => (
                    <button key={s} onClick={() => { setInput(s); setChatOpen(true); }} className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/60 text-xs transition-all">{s}</button>
                  ))}
                </div>
              </div>
            </div>
            {/* Sidebar */}
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-3">Stats</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded-lg px-3 py-2 text-center"><div className="text-white font-bold text-lg">{messages.length}</div><div className="text-white/40 text-[10px]">Messages</div></div>
                  <div className="bg-white/5 rounded-lg px-3 py-2 text-center"><div className="text-white font-bold text-lg">{files.length}</div><div className="text-white/40 text-[10px]">Fichiers</div></div>
                </div>
              </div>
              {/* Files */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-3">Fichiers</h3>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all mb-3 ${dragOver ? 'border-purple-400 bg-purple-500/10' : 'border-white/15 hover:border-white/30'}`}
                >
                  <input ref={fileInputRef} type="file" className="hidden" multiple onChange={e => handleFileUpload(e.target.files)} />
                  <span className="text-white/40 text-xs">{uploading ? 'Upload...' : 'Ajouter un fichier'}</span>
                </div>
                <div className="space-y-1.5">
                  {files.map(f => (
                    <div key={f.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-2 group hover:bg-white/10">
                      <div className="flex-1 min-w-0"><p className="text-white/80 text-[11px] font-medium truncate">{f.name}</p><p className="text-white/30 text-[9px]">{formatFileSize(f.size)}</p></div>
                      <button onClick={() => handleDeleteFile(f.id)} className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20"><svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                  ))}
                  {files.length === 0 && <p className="text-white/20 text-[10px] text-center">Aucun fichier</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB: PLANNING ═══ */}
        {activeTab === 'planning' && (
          <div className="space-y-6">
            {/* Weekly planner */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-sm">{'\uD83D\uDCC5'} Planning de la semaine</h3>
                <span className="text-white/30 text-xs">Semaine du {weekDays[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day, i) => {
                  const isToday = day.toDateString() === today.toDateString();
                  const isPast = day < today && !isToday;
                  const dayTasks = tasks.filter(t => {
                    const td = new Date(t.created_at);
                    return td.toDateString() === day.toDateString();
                  });
                  return (
                    <div key={i} className={`rounded-xl p-3 min-h-[120px] transition-all ${isToday ? 'bg-purple-600/15 border border-purple-500/30' : isPast ? 'bg-white/[0.02] border border-white/5' : 'bg-white/[0.04] border border-white/10'}`}>
                      <div className={`text-center mb-2 ${isToday ? 'text-purple-300' : 'text-white/40'}`}>
                        <div className="text-[10px] font-semibold uppercase">{DAYS[i]}</div>
                        <div className={`text-lg font-bold ${isToday ? 'text-purple-300' : 'text-white/60'}`}>{day.getDate()}</div>
                      </div>
                      {dayTasks.length > 0 ? (
                        <div className="space-y-1">
                          {dayTasks.slice(0, 3).map((t, j) => (
                            <div key={j} className={`text-[9px] px-1.5 py-1 rounded-md truncate ${t.status === 'success' ? 'bg-green-500/15 text-green-300' : t.status === 'pending' ? 'bg-amber-500/15 text-amber-300' : 'bg-white/10 text-white/50'}`}>
                              {t.description?.substring(0, 30) || t.type || 'Tache'}
                            </div>
                          ))}
                          {dayTasks.length > 3 && <div className="text-[8px] text-white/30 text-center">+{dayTasks.length - 3} autres</div>}
                        </div>
                      ) : (
                        <div className="text-[9px] text-white/15 text-center mt-2">{isPast ? 'Aucune' : '\u2014'}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scheduled actions */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-white font-bold text-sm mb-3">{'\uD83D\uDD52'} Prochaines actions programmees</h3>
              {settings.mode === 'auto' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.04] rounded-xl">
                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    <div className="flex-1 min-w-0"><div className="text-white text-xs font-medium">Mode automatique actif</div><div className="text-white/40 text-[10px]">{dn} execute les taches selon votre parametrage</div></div>
                    <span className="text-green-400 text-[10px] font-medium px-2 py-0.5 bg-green-500/15 rounded-full">Auto</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-white/30 text-xs mb-2">Aucune action programmee</p>
                  <button onClick={() => setChatOpen(true)} className="text-purple-400 text-xs font-medium hover:text-purple-300 transition-colors">
                    Demander a {dn} de planifier {'\u2192'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: HISTORY ═══ */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">{'\u26A1'} Actions effectuees par {dn}</h3>
              <span className="text-white/30 text-xs">{tasks.length} action{tasks.length !== 1 ? 's' : ''}</span>
            </div>

            {tasksLoading ? (
              <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>
            ) : tasks.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
                <div className="text-3xl mb-3">{icon}</div>
                <p className="text-white/40 text-sm mb-1">Aucune action pour le moment</p>
                <p className="text-white/20 text-xs">Discutez avec {dn} pour lancer des actions</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task, i) => (
                  <div key={task.id || i} className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${
                      task.status === 'success' ? 'bg-green-500/20 text-green-400' : task.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/40'
                    }`}>
                      {task.status === 'success' ? '\u2713' : task.status === 'error' ? '\u2717' : '\u2022'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-medium">{task.description || task.type || 'Action'}</div>
                      {task.result && <div className="text-white/40 text-[10px] mt-0.5 truncate">{task.result}</div>}
                      <div className="text-white/20 text-[10px] mt-1">{formatDateTime(task.created_at)}</div>
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full flex-shrink-0 ${
                      task.status === 'success' ? 'bg-green-500/15 text-green-400' : task.status === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-white/40'
                    }`}>
                      {task.status === 'success' ? 'Termine' : task.status === 'error' ? 'Erreur' : task.status || 'En cours'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: SETTINGS ═══ */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-sm">{'\u2699\uFE0F'} Parametrage de {dn}</h3>
                <p className="text-white/40 text-xs mt-0.5">Configurez le comportement de l&apos;agent selon vos besoins</p>
              </div>
              <button
                onClick={handleSaveSettings}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
                  settingsSaved
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                }`}
              >
                {settingsSaved ? '\u2713 Sauvegarde !' : 'Sauvegarder'}
              </button>
            </div>

            {/* Recommended badge */}
            <div className="rounded-xl bg-gradient-to-r from-purple-600/10 to-blue-600/10 border border-purple-500/20 px-4 py-3 flex items-center gap-3">
              <span className="text-lg">{'\uD83D\uDCA1'}</span>
              <div className="flex-1">
                <div className="text-purple-300 text-xs font-semibold">Parametrage recommande actif</div>
                <div className="text-white/40 text-[10px]">Basé sur votre type de business et les meilleures pratiques</div>
              </div>
            </div>

            {/* Settings fields */}
            <div className="space-y-3">
              {settingFields.map(field => (
                <div key={field.key} className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-medium">{field.label}</div>
                      <div className="text-white/30 text-[10px] mt-0.5">{field.description}</div>
                    </div>

                    {field.type === 'toggle' && (
                      <button
                        onClick={() => setSettings(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                        className={`w-11 h-6 rounded-full flex-shrink-0 transition-all relative ${settings[field.key] ? 'bg-purple-600' : 'bg-white/15'}`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${settings[field.key] ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    )}

                    {field.type === 'select' && (
                      <select
                        value={settings[field.key] || field.default}
                        onChange={e => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 appearance-none flex-shrink-0 min-w-[140px]"
                      >
                        {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}

                    {field.type === 'time' && (
                      <input
                        type="time"
                        value={settings[field.key] || field.default}
                        onChange={e => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 flex-shrink-0"
                      />
                    )}

                    {field.type === 'number' && (
                      <input
                        type="number"
                        value={settings[field.key] ?? field.default}
                        onChange={e => setSettings(prev => ({ ...prev, [field.key]: parseInt(e.target.value) || 0 }))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 flex-shrink-0 w-20 text-center"
                        min={0}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ FLOATING CHAT BUTTON ═══ */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)} className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-2xl hover:scale-105 flex items-center justify-center transition-all lg:bottom-8 lg:right-8" style={{ background: `linear-gradient(135deg, ${gf}, ${gt})` }}>
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          {messages.length > 0 && <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-green-400 border-2 border-[#0c1a3a] flex items-center justify-center"><span className="text-[8px] text-green-900 font-bold">{messages.length}</span></div>}
        </button>
      )}

      {/* ═══ CHAT SLIDE-OVER ═══ */}
      {chatOpen && (
        <>
          {isMobile && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setChatOpen(false)} />}
          <div className={`fixed z-50 flex flex-col ${isMobile ? 'inset-0' : 'top-20 right-4 bottom-4 w-[420px] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden'}`} style={{ animation: 'slideIn 0.25s ease-out' }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: `linear-gradient(135deg, ${gf}, ${gt})` }}>
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/15">
                {av ? <img src={av} alt={dn} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} /> : <span className="text-lg">{icon}</span>}
              </div>
              <div className="flex-1 min-w-0"><h3 className="text-white font-semibold text-sm">{dn}</h3><div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-400" /><span className="text-white/60 text-[10px]">En ligne</span></div></div>
              <button onClick={() => setChatOpen(false)} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0a1628]">
              {messages.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: `linear-gradient(135deg, ${gf}40, ${gt}40)` }}><span className="text-3xl">{icon}</span></div>
                  <h4 className="text-white font-semibold text-sm mb-1">Discute avec {dn}</h4>
                  <p className="text-white/50 text-xs max-w-[260px]">{desc}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 justify-center">{getAgentSuggestions(agentId).map(s => <button key={s} onClick={() => setInput(s)} className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/50 text-[10px] hover:bg-white/10">{s}</button>)}</div>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[85%]">
                    <div className={`rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${msg.role === 'user' ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-sm' : 'bg-white/[0.07] text-white/90 rounded-bl-sm border border-white/5'}`}>
                      {msg.role === 'assistant' ? renderContent(msg.content) : msg.content.split('\n').map((l, j) => <p key={j} className={j > 0 ? 'mt-1' : ''}>{l}</p>)}
                    </div>
                    <p className={`text-[9px] mt-0.5 ${msg.role === 'user' ? 'text-right' : ''} text-white/20`}>{new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
              {isLoading && <div className="flex justify-start"><div className="bg-white/[0.07] rounded-xl px-4 py-3 rounded-bl-sm"><div className="flex gap-1.5"><div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" /><div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} /><div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} /></div></div></div>}
              <div ref={messagesEndRef} />
            </div>
            {/* Input */}
            <div className="border-t border-white/10 bg-[#0f1f3d] p-3 flex-shrink-0">
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={input} onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={`Message a ${dn}...`} rows={1} className="flex-1 px-3 py-2.5 border border-white/15 rounded-xl text-[13px] text-white placeholder-white/35 bg-white/5 focus:ring-2 focus:ring-purple-500/50 outline-none resize-none" style={{ maxHeight: 100 }} disabled={isLoading} />
                <button onClick={handleSend} disabled={isLoading || !input.trim()} className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white flex items-center justify-center disabled:opacity-30 transition-all flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}
