'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ClientAgent } from '@/lib/agents/client-context';
import { CLIENT_AGENTS } from '@/lib/agents/client-context';

// Lazy-load dashboard components
const CrmDashboard = dynamic(() => import('./components/CrmDashboard'), { ssr: false });
const AgentDashboard = dynamic(() => import('./components/AgentDashboard'), { ssr: false });

const AGENTS_WITH_DASHBOARD = [
  'marketing', 'commercial', 'email', 'content', 'seo', 'ads', 'comptable',
  'rh', 'onboarding', 'dm_instagram', 'tiktok_comments', 'gmaps', 'chatbot',
];

// ─── Types ─────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface AgentInfo {
  name: string;
  avatar_url: string;
  avatar_3d_url: string;
  title: string;
  gradient_from: string;
  gradient_to: string;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploaded_at: string;
  url?: string;
}

// ─── Helpers ───────────────────────────────────────────────

function generateId(): string {
  return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
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

// ─── Agent-specific suggestions ──────────────────────────────

function getAgentSuggestions(agentId: string): string[] {
  const suggestions: Record<string, string[]> = {
    marketing: ['Analyse mes KPIs et recommande des actions', 'Cree-moi un plan marketing ce mois-ci'],
    commercial: ['Montre-moi mes prospects chauds a relancer', 'Analyse mon taux de conversion pipeline'],
    email: ['Lance une sequence email pour mes prospects froids', 'Analyse les taux d\'ouverture'],
    content: ['Genere mon calendrier editorial de la semaine', 'Propose 5 idees de posts Instagram'],
    seo: ['Analyse le SEO de mon site', 'Quels mots-cles cibler en priorite ?'],
    ads: ['Cree une campagne Meta Ads', 'Optimise mon budget ads pour un meilleur ROAS'],
    comptable: ['Fais un point sur ma tresorerie', 'Alerte-moi sur les factures en retard'],
    rh: ['Genere un contrat de prestation', 'Verifie ma conformite RGPD'],
    onboarding: ['Guide-moi pour configurer mon espace', 'Quels agents activer pour mon business ?'],
    dm_instagram: ['Lance une campagne de DMs', 'Propose-moi des messages d\'approche'],
    tiktok_comments: ['Engage ma communaute sur mes dernieres videos', 'Analyse l\'engagement TikTok'],
    gmaps: ['Analyse ma fiche Google Maps', 'Reponds aux derniers avis clients'],
    chatbot: ['Montre-moi les leads captures aujourd\'hui', 'Optimise mes reponses automatiques'],
  };
  return suggestions[agentId] || ['Que peux-tu faire pour moi ?', 'Analyse mes performances'];
}

// ─── Markdown renderer ───────────────────────────────────────

function renderContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[\-\*]\s/.test(line.trim())) {
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2">
          <span className="text-purple-400 mt-0.5 flex-shrink-0">&#8226;</span>
          <span>{renderInline(line.trim().slice(2))}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className={i > 0 ? 'mt-1' : ''}>{renderInline(line)}</p>);
    }
  }
  return elements;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    let firstMatch: { index: number; length: number; node: React.ReactNode } | null = null;
    if (codeMatch && codeMatch.index !== undefined) {
      firstMatch = { index: codeMatch.index, length: codeMatch[0].length, node: <code key={`c-${key++}`} className="px-1.5 py-0.5 bg-white/10 rounded text-xs font-mono text-purple-300">{codeMatch[1]}</code> };
    }
    if (boldMatch && boldMatch.index !== undefined && (!firstMatch || boldMatch.index < firstMatch.index)) {
      firstMatch = { index: boldMatch.index, length: boldMatch[0].length, node: <strong key={`b-${key++}`} className="font-semibold text-white">{boldMatch[1]}</strong> };
    }
    if (firstMatch) {
      if (firstMatch.index > 0) parts.push(remaining.slice(0, firstMatch.index));
      parts.push(firstMatch.node);
      remaining = remaining.slice(firstMatch.index + firstMatch.length);
    } else {
      parts.push(remaining);
      break;
    }
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ─── Main Page Component ───────────────────────────────────

export default function AgentWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const agentId = params.id as string;

  // Core state
  const [agent, setAgent] = useState<ClientAgent | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  // Chat state (hidden by default)
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Files
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Dashboard
  const hasDashboard = AGENTS_WITH_DASHBOARD.includes(agentId);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Find agent from local registry ──────────────────────
  useEffect(() => {
    const found = CLIENT_AGENTS.find((a) => a.id === agentId);
    if (found) setAgent(found);
  }, [agentId]);

  // ─── Load chat history + agent info ──────────────────────
  useEffect(() => {
    if (!agentId) return;
    async function load() {
      try {
        const res = await fetch(`/api/agents/client-chat?agent_id=${agentId}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.messages && Array.isArray(data.messages)) {
            setMessages(data.messages.map((m: any, i: number) => ({
              id: m.id || `hist_${i}`, role: m.role, content: m.content,
              created_at: m.created_at || m.timestamp || new Date().toISOString(),
            })));
          }
          if (data.agent) setAgentInfo(data.agent);
          if (data.files && Array.isArray(data.files)) setFiles(data.files);
        }
      } catch { /* silent */ }
      finally { setPageLoading(false); }
    }
    load();
  }, [agentId]);

  // ─── Load avatar from admin API as fallback ──────────────
  useEffect(() => {
    if (agentInfo) return;
    async function loadAvatar() {
      try {
        const res = await fetch('/api/admin/avatars');
        const data = await res.json();
        if (data.avatars) {
          const match = data.avatars.find((a: any) => a.id === agentId);
          if (match) {
            setAgentInfo({
              name: agent?.displayName || agentId,
              avatar_url: match.avatar_url || '',
              avatar_3d_url: match.avatar_3d_url || '',
              title: agent?.title || '',
              gradient_from: agent?.gradientFrom || '#8b5cf6',
              gradient_to: agent?.gradientTo || '#6d28d9',
            });
          }
        }
      } catch { /* silent */ }
    }
    if (agent) loadAvatar();
  }, [agent, agentId, agentInfo]);

  // ─── Load dashboard data on mount ─────────────────────
  useEffect(() => {
    if (!hasDashboard || dashboardData) return;
    async function loadDashboard() {
      setDashboardLoading(true);
      try {
        const res = await fetch(`/api/agents/dashboard?agent_id=${agentId}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setDashboardData(data);
        }
      } catch { /* silent */ }
      finally { setDashboardLoading(false); }
    }
    loadDashboard();
  }, [agentId, hasDashboard, dashboardData]);

  // ─── Auto-scroll chat ─────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ─── Send message ──────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const userMsg: ChatMessage = { id: generateId(), role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    try {
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, message: text }),
      });
      const assistantMsg: ChatMessage = {
        id: generateId(), role: 'assistant',
        content: res.ok ? ((await res.json()).message || 'Reponse recue.') : 'Merci ! Je traite ta demande.',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setError('Probleme de connexion.');
      setMessages((prev) => [...prev, { id: generateId(), role: 'assistant', content: 'Oups, probleme de connexion.', created_at: new Date().toISOString() }]);
    } finally { setIsLoading(false); }
  }, [input, isLoading, agentId]);

  // ─── File upload ───────────────────────────────────────
  const handleFileUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('agent_id', agentId);
      try {
        const res = await fetch('/api/agents/agent-files', { method: 'POST', credentials: 'include', body: formData });
        if (res.ok) {
          const data = await res.json();
          setFiles((prev) => [...prev, { id: data.id || generateId(), name: file.name, size: file.size, uploaded_at: new Date().toISOString(), url: data.url }]);
        }
      } catch { /* silent */ }
    }
    setUploading(false);
  }, [agentId]);

  const handleDeleteFile = useCallback(async (fileId: string) => {
    try {
      await fetch(`/api/agents/agent-files?id=${fileId}&agent_id=${agentId}`, { method: 'DELETE', credentials: 'include' });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch { /* silent */ }
  }, [agentId]);

  // ─── Export ────────────────────────────────────────────
  const handleExport = useCallback(async (format: 'pdf' | 'xlsx') => {
    try {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      const queryParams = new URLSearchParams({ agent_id: agentId, format, ...(lastUserMsg ? { context: lastUserMsg.content } : {}) });
      const res = await fetch(`/api/agents/export?${queryParams.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${agentDisplayName}-export.${format}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      }
    } catch { /* silent */ }
  }, [agentId, messages]);

  // ─── Input handlers ────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ─── Derived ───────────────────────────────────────────
  const agentDisplayName = agent?.displayName || agentInfo?.name || agentId;
  const agentTitle = agent?.title || agentInfo?.title || '';
  const gradientFrom = agent?.gradientFrom || agentInfo?.gradient_from || '#8b5cf6';
  const gradientTo = agent?.gradientTo || agentInfo?.gradient_to || '#6d28d9';
  const avatarUrl = agentInfo?.avatar_3d_url || agentInfo?.avatar_url || null;
  const agentIcon = agent?.icon || '\uD83E\uDD16';
  const agentDescription = agent?.description || '';

  // ─── Loading ───────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[#0c1a3a] pt-16 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400 mx-auto mb-4" />
          <p className="text-white/60 text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  // ─── WORKSPACE LAYOUT ─────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0c1a3a] pt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:pb-8">

        {/* ═══ WORKSPACE HEADER ═══ */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            {/* Back button */}
            <button
              onClick={() => router.push('/assistant')}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Agent avatar */}
            <div
              className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`, padding: '2px' }}
            >
              <div className="w-full h-full rounded-2xl overflow-hidden bg-gray-900 flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={agentDisplayName} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
                ) : (
                  <span className="text-2xl">{agentIcon}</span>
                )}
              </div>
            </div>

            {/* Agent info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-white font-bold text-xl lg:text-2xl leading-tight">{agentDisplayName}</h1>
              <p className="text-white/50 text-sm">{agentTitle}</p>
            </div>

            {/* Status + actions */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/15 border border-green-500/20 rounded-full">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-300 text-[10px] font-medium">Actif</span>
              </div>
            </div>
          </div>

          {/* Description */}
          {agentDescription && (
            <p className="text-white/40 text-sm max-w-2xl">{agentDescription}</p>
          )}
        </div>

        {/* ═══ QUICK ACTIONS BAR ═══ */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          <button
            onClick={() => setChatOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Discuter avec {agentDisplayName}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/60 text-xs font-medium transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export PDF
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/60 text-xs font-medium transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Export Excel
          </button>
        </div>

        {/* ═══ WORKSPACE CONTENT GRID ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ─── LEFT: Dashboard (2/3 width) ─── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Dashboard */}
            {hasDashboard && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                {dashboardLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto mb-3" />
                      <p className="text-white/50 text-sm">Chargement du tableau de bord...</p>
                    </div>
                  </div>
                ) : agentId === 'commercial' ? (
                  <CrmDashboard data={dashboardData || { prospects: [], activities: [], pipeline: {}, stats: { total: 0, hot: 0, warm: 0, cold: 0, converted: 0, conversionRate: 0 } }} />
                ) : (
                  <AgentDashboard
                    agentId={agentId}
                    agentName={agentDisplayName}
                    gradientFrom={gradientFrom}
                    gradientTo={gradientTo}
                    data={dashboardData || {}}
                  />
                )}
              </div>
            )}

            {/* Suggestions rapides */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Actions rapides
              </h3>
              <div className="flex flex-wrap gap-2">
                {getAgentSuggestions(agentId).map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); setChatOpen(true); setTimeout(() => inputRef.current?.focus(), 300); }}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 rounded-xl text-white/60 text-xs transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── RIGHT: Sidebar (1/3 width) ─── */}
          <div className="space-y-5">
            {/* Agent stats */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-3">Statistiques</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 rounded-lg px-3 py-2 text-center">
                  <div className="text-white font-bold text-lg">{messages.length}</div>
                  <div className="text-white/40 text-[10px]">Messages</div>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2 text-center">
                  <div className="text-white font-bold text-lg">{files.length}</div>
                  <div className="text-white/40 text-[10px]">Fichiers</div>
                </div>
              </div>
            </div>

            {/* Files */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-3">Fichiers</h3>

              {/* Upload zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all mb-3 ${
                  dragOver ? 'border-purple-400 bg-purple-500/10' : 'border-white/15 hover:border-white/30 hover:bg-white/5'
                }`}
              >
                <input ref={fileInputRef} type="file" className="hidden" multiple onChange={(e) => handleFileUpload(e.target.files)} />
                {uploading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400" />
                    <span className="text-white/50 text-xs">Upload...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-white/40 text-xs">Ajouter un fichier</span>
                  </div>
                )}
              </div>

              {/* File list */}
              <div className="space-y-1.5">
                {files.map((file) => (
                  <div key={file.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-2 group hover:bg-white/10 transition-colors">
                    <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80 text-[11px] font-medium truncate">{file.name}</p>
                      <p className="text-white/30 text-[9px]">{formatFileSize(file.size)} &middot; {formatDate(file.uploaded_at)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20 transition-all flex-shrink-0"
                    >
                      <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {files.length === 0 && (
                  <p className="text-white/20 text-[10px] text-center py-1">Aucun fichier</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ FLOATING CHAT BUTTON ═══ */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-2xl shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 flex items-center justify-center transition-all lg:bottom-8 lg:right-8"
          style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
          title={`Discuter avec ${agentDisplayName}`}
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {messages.length > 0 && (
            <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-green-400 border-2 border-[#0c1a3a] flex items-center justify-center">
              <span className="text-[8px] text-green-900 font-bold">{messages.length}</span>
            </div>
          )}
        </button>
      )}

      {/* ═══ CHAT SLIDE-OVER ═══ */}
      {chatOpen && (
        <>
          {/* Backdrop (mobile) */}
          {isMobile && (
            <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setChatOpen(false)} />
          )}

          <div
            className={`fixed z-50 flex flex-col ${
              isMobile
                ? 'inset-0'
                : 'top-4 right-4 bottom-4 w-[420px] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden'
            }`}
            style={{ animation: 'slideInRight 0.25s ease-out' }}
          >
            {/* Chat header */}
            <div
              className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
            >
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/15">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={agentDisplayName} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
                ) : (
                  <span className="text-lg">{agentIcon}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold text-sm leading-tight">{agentDisplayName}</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-white/60 text-[10px]">En ligne</span>
                </div>
              </div>
              {/* Minimize */}
              <button
                onClick={() => setChatOpen(false)}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                title="Reduire"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0a1628]">
              {messages.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: `linear-gradient(135deg, ${gradientFrom}40, ${gradientTo}40)` }}
                  >
                    <span className="text-3xl">{agentIcon}</span>
                  </div>
                  <h4 className="text-white font-semibold text-sm mb-1">Discute avec {agentDisplayName}</h4>
                  <p className="text-white/50 text-xs max-w-[260px]">{agentDescription}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                    {getAgentSuggestions(agentId).map((s) => (
                      <button
                        key={s}
                        onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 100); }}
                        className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/50 text-[10px] hover:bg-white/10 transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-md overflow-hidden flex items-center justify-center flex-shrink-0 mr-2 mt-1 bg-white/10">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={agentDisplayName} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
                      ) : (
                        <span className="text-[10px]">{agentIcon}</span>
                      )}
                    </div>
                  )}
                  <div className="max-w-[85%]">
                    <div className={`rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-sm'
                        : 'bg-white/[0.07] text-white/90 rounded-bl-sm border border-white/5'
                    }`}>
                      {msg.role === 'assistant' ? renderContent(msg.content) : (
                        msg.content.split('\n').map((line, j) => <p key={j} className={j > 0 ? 'mt-1' : ''}>{line}</p>)
                      )}
                    </div>
                    <p className={`text-[9px] mt-0.5 ${msg.role === 'user' ? 'text-right' : ''} text-white/20`}>
                      {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.07] rounded-xl px-4 py-3 rounded-bl-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex justify-center">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 text-red-400 text-xs">{error}</div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-white/10 bg-[#0f1f3d] p-3 flex-shrink-0">
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message a ${agentDisplayName}...`}
                    rows={1}
                    className="w-full px-3 py-2.5 border border-white/15 rounded-xl text-[13px] text-white placeholder-white/35 bg-white/5 focus:ring-2 focus:ring-purple-500/50 outline-none resize-none"
                    style={{ maxHeight: 100 }}
                    disabled={isLoading}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white flex items-center justify-center disabled:opacity-30 transition-all flex-shrink-0"
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Animation */}
      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
