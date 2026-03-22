'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ClientAgent } from '@/lib/agents/client-context';
import { CLIENT_AGENTS } from '@/lib/agents/client-context';

// Lazy-load dashboard components
const CrmDashboard = dynamic(() => import('./components/CrmDashboard'), { ssr: false });
const AgentDashboard = dynamic(() => import('./components/AgentDashboard'), { ssr: false });

// Agents that have dashboards
const AGENTS_WITH_DASHBOARD = ['marketing', 'commercial', 'email', 'content', 'seo', 'ads', 'comptable'];

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

// ─── Markdown-like renderer ────────────────────────────────

function renderContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let codeBlock: string[] | null = null;
  let codeKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trim().startsWith('```')) {
      if (codeBlock !== null) {
        elements.push(
          <pre
            key={`code-${codeKey++}`}
            className="bg-black/30 border border-white/10 rounded-lg p-3 text-xs font-mono text-green-300 overflow-x-auto my-2"
          >
            <code>{codeBlock.join('\n')}</code>
          </pre>
        );
        codeBlock = null;
      } else {
        codeBlock = [];
      }
      continue;
    }

    if (codeBlock !== null) {
      codeBlock.push(line);
      continue;
    }

    // Unordered list
    if (/^[\-\*]\s/.test(line.trim())) {
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2">
          <span className="text-purple-400 mt-0.5 flex-shrink-0">&#8226;</span>
          <span>{renderInline(line.trim().slice(2))}</span>
        </div>
      );
      continue;
    }

    // Ordered list
    const olMatch = line.trim().match(/^(\d+)\.\s(.+)/);
    if (olMatch) {
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2">
          <span className="text-purple-400 font-medium flex-shrink-0 min-w-[1.2em] text-right">{olMatch[1]}.</span>
          <span>{renderInline(olMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Empty line = spacing
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={i} className={i > 0 ? 'mt-1' : ''}>
        {renderInline(line)}
      </p>
    );
  }

  // Unclosed code block
  if (codeBlock !== null) {
    elements.push(
      <pre
        key={`code-${codeKey}`}
        className="bg-black/30 border border-white/10 rounded-lg p-3 text-xs font-mono text-green-300 overflow-x-auto my-2"
      >
        <code>{codeBlock.join('\n')}</code>
      </pre>
    );
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  // Bold **text** and inline code `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Bold
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);

    let firstMatch: { index: number; length: number; node: React.ReactNode } | null = null;

    if (codeMatch && codeMatch.index !== undefined) {
      firstMatch = {
        index: codeMatch.index,
        length: codeMatch[0].length,
        node: (
          <code key={`ic-${key++}`} className="px-1.5 py-0.5 bg-white/10 rounded text-xs font-mono text-purple-300">
            {codeMatch[1]}
          </code>
        ),
      };
    }

    if (boldMatch && boldMatch.index !== undefined) {
      const idx = boldMatch.index;
      if (!firstMatch || idx < firstMatch.index) {
        firstMatch = {
          index: idx,
          length: boldMatch[0].length,
          node: <strong key={`b-${key++}`} className="font-semibold text-white">{boldMatch[1]}</strong>,
        };
      }
    }

    if (firstMatch) {
      if (firstMatch.index > 0) {
        parts.push(remaining.slice(0, firstMatch.index));
      }
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

  // State
  const [agent, setAgent] = useState<ClientAgent | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Files
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Dashboard tab
  const hasDashboard = AGENTS_WITH_DASHBOARD.includes(agentId);
  const [activeTab, setActiveTab] = useState<'chat' | 'dashboard'>('chat');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inlineFileInputRef = useRef<HTMLInputElement>(null);

  // ─── Find agent from local registry ──────────────────────
  useEffect(() => {
    const found = CLIENT_AGENTS.find((a) => a.id === agentId);
    if (found) {
      setAgent(found);
    }
  }, [agentId]);

  // ─── Load chat history + agent info ──────────────────────
  useEffect(() => {
    if (!agentId) return;

    async function load() {
      try {
        const res = await fetch(`/api/agents/client-chat?agent_id=${agentId}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.messages && Array.isArray(data.messages)) {
            setMessages(
              data.messages.map((m: any, i: number) => ({
                id: m.id || `hist_${i}`,
                role: m.role,
                content: m.content,
                created_at: m.created_at || m.timestamp || new Date().toISOString(),
              }))
            );
          }
          if (data.agent) {
            setAgentInfo(data.agent);
          }
          if (data.files && Array.isArray(data.files)) {
            setFiles(data.files);
          }
        }
      } catch {
        // Silent — start fresh
      } finally {
        setPageLoading(false);
      }
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
      } catch {
        // Silent
      }
    }
    if (agent) loadAvatar();
  }, [agent, agentId, agentInfo]);

  // ─── Load dashboard data when tab switches ─────────────
  useEffect(() => {
    if (activeTab !== 'dashboard' || !hasDashboard || dashboardData) return;

    async function loadDashboard() {
      setDashboardLoading(true);
      try {
        const res = await fetch(`/api/agents/dashboard?agent_id=${agentId}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setDashboardData(data);
        }
      } catch {
        // Silent — dashboard will show empty state
      } finally {
        setDashboardLoading(false);
      }
    }
    loadDashboard();
  }, [activeTab, agentId, hasDashboard, dashboardData]);

  // ─── Auto-scroll ─────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ─── Focus input ─────────────────────────────────────────
  useEffect(() => {
    if (!pageLoading) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [pageLoading]);

  // ─── Keyboard shortcuts ──────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobile && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobile, sidebarOpen]);

  // ─── Send message ────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, message: text }),
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: data.message || data.reply || 'Reponse recue.',
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: `Merci pour ton message ! Je traite ta demande. Si le probleme persiste, reessaie dans un instant.`,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch {
      setError('Probleme de connexion. Verifie ta connexion internet.');
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Oups, probleme de connexion. Verifie ta connexion internet et reessaie.',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, agentId]);

  // ─── File upload ─────────────────────────────────────────
  const handleFileUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setUploading(true);

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('agent_id', agentId);

        try {
          const res = await fetch('/api/agents/agent-files', {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            const uploaded: UploadedFile = {
              id: data.id || generateId(),
              name: file.name,
              size: file.size,
              uploaded_at: new Date().toISOString(),
              url: data.url,
            };
            setFiles((prev) => [...prev, uploaded]);
          }
        } catch {
          // Silent fail for individual file
        }
      }

      setUploading(false);
    },
    [agentId]
  );

  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      try {
        await fetch(`/api/agents/agent-files?id=${fileId}&agent_id=${agentId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
      } catch {
        // Silent
      }
    },
    [agentId]
  );

  // ─── Drag & drop ─────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  // ─── Export ──────────────────────────────────────────────
  const handleExport = useCallback(
    async (format: 'pdf' | 'xlsx') => {
      try {
        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
        const queryParams = new URLSearchParams({
          agent_id: agentId,
          format,
          ...(lastUserMsg ? { context: lastUserMsg.content } : {}),
        });

        const res = await fetch(`/api/agents/export?${queryParams.toString()}`, {
          credentials: 'include',
        });

        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${agentDisplayName}-export.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch {
        // Silent
      }
    },
    [agentId, messages]
  );

  // ─── Textarea auto-resize ────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Derived values ──────────────────────────────────────
  const agentDisplayName = agent?.displayName || agentInfo?.name || agentId;
  const agentTitle = agent?.title || agentInfo?.title || '';
  const gradientFrom = agent?.gradientFrom || agentInfo?.gradient_from || '#8b5cf6';
  const gradientTo = agent?.gradientTo || agentInfo?.gradient_to || '#6d28d9';
  const avatarUrl = agentInfo?.avatar_3d_url || agentInfo?.avatar_url || null;
  const agentIcon = agent?.icon || '🤖';

  // ─── Loading state ───────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="fixed inset-0 bg-[#0c1a3a] flex items-center justify-center" style={{ height: '100dvh' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400 mx-auto mb-4" />
          <p className="text-white/60 text-sm">Chargement de l&apos;espace de travail...</p>
        </div>
      </div>
    );
  }

  // ─── Sidebar content (shared between mobile/desktop) ─────
  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Agent info card — compact */}
      <div
        className="p-3 flex-shrink-0"
        style={{ background: `linear-gradient(145deg, ${gradientFrom}, ${gradientTo})` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/15 flex items-center justify-center shadow-lg flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt={agentDisplayName} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
            ) : (
              <span className="text-2xl">{agentIcon}</span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-white font-bold text-sm leading-tight truncate">{agentDisplayName}</h2>
            <p className="text-white/70 text-[11px] truncate">{agentTitle}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-white/60 text-[10px]">En ligne</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-3 py-2 border-b border-white/10 flex-shrink-0">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
            <div className="text-white font-bold text-xs">{messages.length}</div>
            <div className="text-white/40 text-[9px]">Messages</div>
          </div>
          <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
            <div className="text-white font-bold text-xs">{files.length}</div>
            <div className="text-white/40 text-[9px]">Fichiers</div>
          </div>
        </div>
      </div>

      {/* Files section — scrollable */}
      <div className="px-3 py-2 flex-1 overflow-y-auto min-h-0">
        <h3 className="text-white/60 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
          Fichiers
        </h3>

        {/* Upload zone — compact */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-2.5 text-center cursor-pointer transition-all mb-2
            ${dragOver
              ? 'border-purple-400 bg-purple-500/10'
              : 'border-white/15 hover:border-white/30 hover:bg-white/5'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-purple-400" />
              <span className="text-white/50 text-[11px]">Upload...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-white/40 text-[11px]">Ajouter un fichier</p>
            </div>
          )}
        </div>

        {/* File list */}
        <div className="space-y-1">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5 group hover:bg-white/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-[11px] font-medium truncate">{file.name}</p>
                <p className="text-white/30 text-[9px]">
                  {formatFileSize(file.size)} &middot; {formatDate(file.uploaded_at)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFile(file.id);
                }}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20 transition-all flex-shrink-0"
                aria-label="Supprimer"
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

      {/* Export section — compact */}
      <div className="px-3 py-2 border-t border-white/10 flex-shrink-0">
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('pdf')}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] text-white/80 font-medium transition-all"
          >
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] text-white/80 font-medium transition-all"
          >
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Excel
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#0c1a3a] flex overflow-hidden" style={{ height: '100dvh' }}>
      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — narrower on desktop, full slide on mobile */}
      <aside
        className={`
          bg-[#0a1628] border-r border-white/10 flex-shrink-0 flex flex-col z-50
          transition-transform duration-300 ease-in-out
          ${isMobile
            ? `fixed inset-y-0 left-0 w-[260px] ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
            : 'w-[240px] relative'
          }
        `}
        style={isMobile ? { height: '100dvh' } : undefined}
      >
        {sidebarContent}
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header bar — compact */}
        <div
          className="flex items-center gap-2 px-3 py-2 flex-shrink-0 border-b border-white/10"
          style={{
            background: `linear-gradient(135deg, ${gradientFrom}20, ${gradientTo}20)`,
          }}
        >
          {/* Mobile hamburger */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-8 h-8 rounded-lg bg-white/10 active:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
              aria-label="Ouvrir le panneau"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          {/* Back button */}
          <button
            onClick={() => router.push('/assistant')}
            className="w-8 h-8 rounded-lg bg-white/10 active:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Retour"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Agent mini info */}
          <div className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/10">
            {avatarUrl ? (
              <img src={avatarUrl} alt={agentDisplayName} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
            ) : (
              <span className="text-xs">{agentIcon}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-semibold text-sm leading-tight truncate">{agentDisplayName}</h1>
            <p className="text-white/50 text-[10px] truncate">{agentTitle}</p>
          </div>

          {/* Tab switcher */}
          {hasDashboard && (
            <div className="flex items-center bg-white/5 rounded-lg p-0.5 flex-shrink-0">
              <button
                onClick={() => setActiveTab('chat')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  activeTab === 'chat'
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                {agentId === 'commercial' ? 'CRM' : 'Stats'}
              </button>
            </div>
          )}

          {!isMobile && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-white/50 text-[10px]">En ligne</span>
            </div>
          )}
        </div>

        {/* Dashboard view */}
        {activeTab === 'dashboard' && hasDashboard && (
          <div className="flex-1 overflow-y-auto min-h-0">
            {dashboardLoading ? (
              <div className="flex items-center justify-center h-full">
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

        {/* Chat view — Messages */}
        <div className={`flex-1 overflow-y-auto p-3 lg:p-5 space-y-3 min-h-0 ${activeTab !== 'chat' ? 'hidden' : ''}`}>
          {/* Empty state */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-3">
              <div
                className="w-16 h-16 lg:w-20 lg:h-20 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
                style={{ background: `linear-gradient(135deg, ${gradientFrom}50, ${gradientTo}50)` }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={agentDisplayName} className="w-full h-full rounded-2xl object-cover" style={{ objectPosition: 'top center' }} />
                ) : (
                  <span className="text-3xl lg:text-4xl">{agentIcon}</span>
                )}
              </div>
              <h2 className="text-white font-bold text-base lg:text-lg mb-1">Bienvenue chez {agentDisplayName}</h2>
              <p className="text-white/50 text-xs lg:text-sm max-w-md">
                {agent?.description || `Posez vos questions et ${agentDisplayName} vous accompagnera.`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  `Que peux-tu faire pour moi ?`,
                  `Analyse mes performances`,
                  `Propose-moi une strategie`,
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 bg-white/5 active:bg-white/15 border border-white/10 rounded-full text-white/60 text-xs transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-md overflow-hidden flex items-center justify-center flex-shrink-0 mr-2 mt-1 bg-white/10">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={agentDisplayName} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
                  ) : (
                    <span className="text-[10px]">{agentIcon}</span>
                  )}
                </div>
              )}
              <div className={`max-w-[85%] lg:max-w-[65%]`}>
                <div
                  className={`rounded-2xl px-3 py-2.5 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-md'
                      : 'bg-white/[0.07] text-white/90 rounded-bl-md border border-white/5'
                  }`}
                >
                  {msg.role === 'assistant' ? renderContent(msg.content) : (
                    msg.content.split('\n').map((line, j) => (
                      <p key={j} className={j > 0 ? 'mt-1' : ''}>{line}</p>
                    ))
                  )}
                </div>
                <p className={`text-[9px] mt-0.5 ${msg.role === 'user' ? 'text-right text-white/20' : 'text-white/20'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-md overflow-hidden flex items-center justify-center flex-shrink-0 mr-2 mt-1 bg-white/10">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={agentDisplayName} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
                ) : (
                  <span className="text-[10px]">{agentIcon}</span>
                )}
              </div>
              <div className="bg-white/[0.07] rounded-2xl rounded-bl-md px-3 py-2.5 border border-white/5">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="flex justify-center">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 text-red-400 text-xs">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area — safe area padding for mobile bottom nav (hidden on dashboard) */}
        <div className={`border-t border-white/10 bg-[#0a1628] p-2 lg:p-3 flex-shrink-0 ${activeTab !== 'chat' ? 'hidden' : ''}`} style={isMobile ? { paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' } : undefined}>
          <div className="flex items-end gap-1.5 max-w-4xl mx-auto">
            {/* Paperclip file attach */}
            <button
              onClick={() => inlineFileInputRef.current?.click()}
              className="w-9 h-9 rounded-lg bg-white/5 active:bg-white/15 border border-white/10 flex items-center justify-center transition-all flex-shrink-0"
              aria-label="Joindre un fichier"
            >
              <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={inlineFileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
            />

            {/* Textarea */}
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={`Message a ${agentDisplayName}...`}
                rows={1}
                className="w-full px-3 py-2 border border-white/15 rounded-lg text-[13px] text-white placeholder-white/35 bg-white/5 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 outline-none transition-all resize-none"
                style={{ maxHeight: 100 }}
                disabled={isLoading}
              />
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="w-9 h-9 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 text-white flex items-center justify-center active:from-purple-500 active:to-purple-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0 shadow-lg shadow-purple-500/20"
              aria-label="Envoyer"
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
      </main>
    </div>
  );
}
