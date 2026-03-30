'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import PreviewBanner from './PreviewBanner';
import PostPreview from './PostPreview';
import { DEMO_DM_CONVERSATIONS, DEMO_EMAILS, DEMO_CONTENT_POSTS, DEMO_REVIEWS, DEMO_COMMENTS, DEMO_ADS_STATS, DEMO_FINANCE_STATS, DEMO_RH_STATS, DEMO_CHATBOT_STATS, DEMO_WHATSAPP_STATS, DEMO_TIKTOK_STATS, DEMO_IG_COMMENTS } from './AgentPreviewData';

// ─── Social Connect Banners — shown in agent dashboards ─────────────
const SOCIAL_NETWORKS = {
  instagram: {
    name: 'Instagram',
    icon: '\u{1F4F7}',
    color: '#E1306C',
    gradient: 'from-pink-600 to-purple-600',
    oauthUrl: '/api/auth/instagram-oauth',
    description: 'Publie, reponds aux DMs et commentaires',
  },
  tiktok: {
    name: 'TikTok',
    icon: '\u{1F3B5}',
    color: '#00f2ea',
    gradient: 'from-cyan-500 to-gray-900',
    oauthUrl: '/api/auth/tiktok-oauth',
    description: 'Publie des videos et engage ta communaute',
  },
  linkedin: {
    name: 'LinkedIn',
    icon: '\u{1F4BC}',
    color: '#0A66C2',
    gradient: 'from-blue-600 to-blue-800',
    oauthUrl: '/api/auth/linkedin-oauth',
    description: 'Publie et developpe ton reseau pro',
  },
} as const;

function SocialConnectBanners({ agentId, networks }: { agentId: string; networks: Array<keyof typeof SOCIAL_NETWORKS> }) {
  const storageKey = `keiro_socials_${agentId}`;
  const [hidden, setHidden] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load saved state
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed._hidden) { setHidden(true); return; }
        setEnabled(parsed);
      }
    } catch {}
    // Check connected networks
    fetch('/api/instagram/check-token', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.valid || d.connected) setConnected(prev => new Set([...prev, 'instagram'])); })
      .catch(() => {});
  }, [storageKey]);

  const save = useCallback((state: Record<string, boolean>) => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
  }, [storageKey]);

  const toggle = useCallback((key: string) => {
    setEnabled(prev => {
      const next = { ...prev, [key]: !prev[key] };
      save(next);
      return next;
    });
  }, [save]);

  const hideAll = useCallback(() => {
    setHidden(true);
    try { localStorage.setItem(storageKey, JSON.stringify({ _hidden: true })); } catch {}
  }, [storageKey]);

  if (hidden) return null;
  // If all networks are connected, don't show
  if (networks.every(n => connected.has(n))) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold text-white/70">Reseaux sociaux</h4>
        <button onClick={hideAll} className="text-white/20 hover:text-white/50 transition" title="Masquer">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="space-y-2">
        {networks.map(key => {
          const net = SOCIAL_NETWORKS[key];
          const isConnected = connected.has(key);
          const isEnabled = enabled[key] || isConnected;
          return (
            <div key={key} className="flex items-center gap-3 py-1.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: `${net.color}20` }}>
                {net.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white/80">{net.name}</div>
                <div className="text-[9px] text-white/30">{net.description}</div>
              </div>
              {isConnected ? (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full flex-shrink-0">
                  {'\u2713'} Connecte
                </span>
              ) : isEnabled ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={net.oauthUrl} className={`px-2.5 py-1 bg-gradient-to-r ${net.gradient} text-white text-[10px] font-bold rounded-lg hover:opacity-90 transition`}>
                    Connecter
                  </a>
                  <button onClick={() => toggle(key)} className="w-10 h-6 rounded-full bg-emerald-500 relative transition-colors flex-shrink-0" title="Desactiver">
                    <div className="absolute right-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[9px] text-white/20">Desactive</span>
                  <button onClick={() => toggle(key)} className="w-10 h-6 rounded-full bg-white/15 relative transition-colors flex-shrink-0" title="Activer">
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white/40 shadow transition-all" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-white/20 mt-3 text-center">
        Pas encore de compte ? Active plus tard dans les parametres de l&apos;agent
      </p>
    </div>
  );
}

// Email connection banner — encourage client to connect their Gmail/Outlook
function EmailConnectBanner({ connections }: { connections?: Record<string, boolean> }) {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agents/email/check-connection', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setGmailConnected(d.gmail_connected || false);
        setGmailEmail(d.gmail_email || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (gmailConnected) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 mb-3 flex items-center gap-3">
        <span className="text-lg">{'\u2709\uFE0F'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-emerald-400">Email connecte</p>
          <p className="text-[10px] text-white/50">Les emails partent de <strong className="text-white/80">{gmailEmail}</strong></p>
        </div>
        <span className="text-emerald-400 text-xs">{'\u2713'}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-3">
      <div className="flex items-start gap-3">
        <span className="text-xl">{'\u{1F4E7}'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white mb-1">Connecte ton email pour plus d&apos;impact</p>
          <p className="text-[10px] text-white/50 mb-3 leading-relaxed">
            Hugo envoie actuellement depuis contact@keiroai.com. Connecte ton Gmail ou Outlook pour que les emails partent de <strong className="text-white/70">ton propre email</strong> — meilleur taux d&apos;ouverture et plus de confiance.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/auth/gmail-oauth" className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold rounded-lg transition min-h-[36px]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"><path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z"/><path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987Z"/><path fill="#4A90D9" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21Z"/><path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067Z"/></svg>
              Connecter Gmail
            </a>
            <div className="text-[9px] text-white/30 self-center">Outlook bientot</div>
          </div>
          <p className="text-[9px] text-white/25 mt-2">
            Pas de Gmail ? Tu peux aussi creer un gmail dedie a ta prospection (ex: contact@tonbusiness.com) ou <a href="https://cal.com" className="underline hover:text-white/40">prendre un RDV</a> pour qu&apos;on configure ton domaine custom.
          </p>
        </div>
      </div>
    </div>
  );
}

// Hot prospects notification — shown directly in agent dashboard
function HotProspectsAlert({ source, gradientFrom }: { source?: string; gradientFrom: string }) {
  const [prospects, setProspects] = useState<Array<{ id: string; company: string; email: string; temperature: string; status: string; type: string }>>([]);

  useEffect(() => {
    fetch('/api/crm/export?format=json', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const hot = (d.prospects || []).filter((p: any) => p.temperature === 'hot').slice(0, 5);
        setProspects(hot);
      }).catch(() => {});
  }, []);

  if (prospects.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{'\u{1F525}'}</span>
        <span className="text-xs font-bold text-amber-400">{prospects.length} prospect{prospects.length > 1 ? 's' : ''} chaud{prospects.length > 1 ? 's' : ''} — a contacter en priorite !</span>
      </div>
      <div className="space-y-2">
        {prospects.map(p => (
          <div key={p.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
            <span className="text-xs text-amber-400">{'\u{1F525}'}</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-white">{p.company || p.email}</span>
              {p.type && <span className="text-[9px] text-white/30 ml-2">{p.type}</span>}
            </div>
            <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">{p.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Jade tabs: DMs + Comments switch
function JadeTabs({ gradientFrom, gradientTo }: { gradientFrom: string; gradientTo: string }) {
  const [tab, setTab] = useState<'dms' | 'comments'>('dms');

  return (
    <div>
      <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10 mb-3">
        <button
          onClick={() => setTab('dms')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
            tab === 'dms' ? 'bg-white/10 text-white shadow' : 'text-white/40 hover:text-white/60'
          }`}
        >
          {'\u{1F4AC}'} DMs
        </button>
        <button
          onClick={() => setTab('comments')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
            tab === 'comments' ? 'bg-white/10 text-white shadow' : 'text-white/40 hover:text-white/60'
          }`}
        >
          {'\u{1F4AC}'} Commentaires
        </button>
      </div>

      {tab === 'dms' && (
        <div data-tour="dm-conversations">
          <DmConversationsLive />
        </div>
      )}

      {tab === 'comments' && (
        <div data-tour="dm-comments">
          <LenaCommentsSection />
        </div>
      )}
    </div>
  );
}

// Live Instagram DM conversations component
function DmConversationsLive() {
  const [convs, setConvs] = useState<Array<{
    id: string;
    participant: { username: string; id: string };
    updated_time?: string;
    messages: Array<{ message: string; from: string; fromMe: boolean; created_time: string; status?: string }>;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(() => {
    fetch('/api/agents/dm-instagram/conversations', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.conversations) { setApiResponded(true); setConvs(d.conversations); }
        if (d.conversations?.length === 0) {
          // Retry after 3s in case token just got saved
          setTimeout(() => {
            fetch('/api/agents/dm-instagram/conversations', { credentials: 'include' })
              .then(r2 => r2.json())
              .then(d2 => { if (d2.conversations) setConvs(d2.conversations); })
              .catch(() => {});
          }, 3000);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Initial load + auto-refresh every 15s
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Auto-scroll to bottom of messages (within container, not page)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedConv, convs]);

  const sendReply = useCallback(async () => {
    const selected = convs.find(c => c.id === selectedConv);
    if (!selected || !replyText.trim()) return;
    setSending(true);
    const msgText = replyText;
    setReplyText('');

    // Optimistic UI update
    setConvs(prev => prev.map(c => c.id === selected.id ? {
      ...c,
      messages: [...c.messages, { message: msgText, from: 'moi', fromMe: true, created_time: new Date().toISOString(), status: 'sending' }],
    } : c));

    try {
      const res = await fetch('/api/agents/dm-instagram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipient_id: selected.participant.id,
          message: msgText,
        }),
      });
      const data = await res.json();

      // Update message status
      setConvs(prev => prev.map(c => c.id === selected.id ? {
        ...c,
        messages: c.messages.map((m, i) =>
          i === c.messages.length - 1 && m.status === 'sending'
            ? { ...m, status: data.sent ? 'sent' : 'prepared' }
            : m
        ),
      } : c));
    } catch {
      setConvs(prev => prev.map(c => c.id === selected.id ? {
        ...c,
        messages: c.messages.map((m, i) =>
          i === c.messages.length - 1 && m.status === 'sending'
            ? { ...m, status: 'error' }
            : m
        ),
      } : c));
    } finally {
      setSending(false);
    }
  }, [convs, selectedConv, replyText]);

  const [apiResponded, setApiResponded] = useState(false);

  if (loading) return <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400 mx-auto" /><div className="text-white/30 text-[10px] mt-2">Chargement des conversations...</div></div>;

  // isDemo only if API didn't respond with conversations AND we haven't confirmed connectivity
  const isDemo = convs.length === 0 && !apiResponded;
  const displayConvs = isDemo ? DEMO_DM_CONVERSATIONS : convs;
  const selected = displayConvs.find(c => c.id === selectedConv);

  return (
    <div>
    {isDemo && (
      <PreviewBanner
        agentName="Jade"
        connectLabel="Connecter Instagram"
        connectUrl="/api/auth/instagram-oauth"
        claraMessage="Voici a quoi ressembleront tes conversations DM une fois Instagram connecte. Jade repondra automatiquement et prospection en DM pour toi !"
        gradientFrom="#e11d48"
        gradientTo="#be123c"
      />
    )}
    <div className={`rounded-xl border-2 ${isDemo ? 'border-amber-500/20 opacity-90' : 'border-purple-500/20'} bg-gradient-to-b from-purple-900/10 to-transparent overflow-hidden shadow-lg shadow-purple-500/5 h-[calc(60vh-60px)] md:h-[420px] mb-16 lg:mb-0`}>
      <div className="flex h-full">
        {/* Conversation list */}
        <div className={`${selectedConv ? 'hidden sm:block' : ''} w-full sm:w-56 border-r border-white/10 overflow-y-auto`}>
          <div className="px-3 py-2.5 border-b border-purple-500/20 bg-purple-900/20">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-300/60">{'\u{1F4AC}'} Conversations</span>
          </div>
          {displayConvs.map(conv => {
            const lastMsg = conv.messages[conv.messages.length - 1];
            const isUnread = lastMsg && !lastMsg.fromMe;
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv.id)}
                className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${selectedConv === conv.id ? 'bg-purple-500/10 border-l-2 border-l-purple-500' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {isUnread && <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse flex-shrink-0" />}
                  <span className="text-xs font-medium text-white">@{conv.participant.username}</span>
                </div>
                <div className="text-[10px] text-white/30 truncate mt-0.5 pl-4">
                  {lastMsg?.fromMe ? 'Toi: ' : ''}{lastMsg?.message?.substring(0, 50) || '...'}
                </div>
                {conv.updated_time && (
                  <div className="text-[9px] text-white/15 mt-0.5 pl-4">
                    {new Date(conv.updated_time).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Messages */}
        {selected ? (
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
              <button onClick={() => setSelectedConv(null)} className="sm:hidden text-white/40 hover:text-white/60 text-lg p-1 min-w-[44px] min-h-[44px] flex items-center justify-center">{'\u2190'}</button>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-[10px] text-white font-bold">
                {selected.participant.username[0]?.toUpperCase()}
              </div>
              <div>
                <span className="text-xs font-bold text-white">@{selected.participant.username}</span>
                <div className="text-[9px] text-white/20">{selected.messages.length} messages</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-[9px] text-green-400/60">Direct</span>
              </div>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
              {selected.messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                    msg.fromMe
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-md'
                      : 'bg-white/10 text-white/80 rounded-bl-md'
                  } ${msg.status === 'sending' ? 'opacity-60' : ''}`}>
                    {msg.message || <span className="italic text-white/30">[media]</span>}
                    <div className={`flex items-center gap-1 mt-0.5 ${msg.fromMe ? 'justify-end' : ''}`}>
                      <span className={`text-[10px] ${msg.fromMe ? 'text-purple-200/60' : 'text-white/20'}`}>
                        {new Date(msg.created_time).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.fromMe && msg.status === 'sending' && <span className="text-[10px] text-yellow-300/60">envoi...</span>}
                      {msg.fromMe && msg.status === 'sent' && <span className="text-[10px] text-green-300/60">{'\u2713'} envoye</span>}
                      {msg.fromMe && msg.status === 'prepared' && <span className="text-[10px] text-amber-300/60">prepare</span>}
                      {msg.fromMe && msg.status === 'error' && <span className="text-[10px] text-red-300/60">echec</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {/* Reply input */}
            <div className="border-t border-white/5 px-3 py-2.5 flex gap-2 bg-white/[0.02]">
              <input
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Ecrire un message..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) { e.preventDefault(); sendReply(); } }}
              />
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white text-xs font-medium rounded-xl disabled:opacity-40 transition-all active:scale-95"
              >
                {sending ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 text-xs gap-2 py-8">
            <svg className="w-8 h-8 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Selectionne une conversation
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// Reply card for DMs and emails
function DmCard({ dm, statusColors }: { dm: { target: string; status: string; message?: string; date: string }; statusColors: Record<string, string> }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReply = useCallback(async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await fetch('/api/crm/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prospect_id: dm.target, message: replyText, channel: 'dm_instagram' }),
      });
      setSent(true);
      setTimeout(() => { setSent(false); setShowReply(false); setReplyText(''); }, 2000);
    } catch {} finally { setSending(false); }
  }, [replyText, dm.target]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-3 sm:p-4 flex items-center gap-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${statusColors[dm.status] ?? '#a78bfa'}22`, color: statusColors[dm.status] ?? '#a78bfa' }}>
          {dm.status}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-white/80 truncate block">@{dm.target}</span>
          {dm.message && <span className="text-[10px] text-white/40 truncate block">{dm.message}</span>}
        </div>
        <button onClick={() => setShowReply(!showReply)} className="text-[10px] px-2 py-1 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0">
          {showReply ? 'Fermer' : 'Repondre'}
        </button>
      </div>
      {showReply && (
        <div className="px-3 sm:px-4 pb-3 border-t border-white/5 pt-2 flex gap-2">
          <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Ecrire une reponse..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50" onKeyDown={e => { if (e.key === 'Enter') handleReply(); }} />
          <button onClick={handleReply} disabled={sending || !replyText.trim()} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0 ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-600 text-white hover:bg-purple-700'} disabled:opacity-40`}>
            {sent ? '\u2713' : sending ? '...' : 'Envoyer'}
          </button>
        </div>
      )}
    </div>
  );
}

// Generic auto-mode toggle for any agent
function AutoModeToggle({ agentId, autoLabel, manualLabel, autoDesc, manualDesc }: {
  agentId: string;
  autoLabel: string;
  manualLabel: string;
  autoDesc: string;
  manualDesc: string;
}) {
  const storageKey = `keiro_auto_${agentId}`;
  const [auto, setAuto] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { const saved = localStorage.getItem(storageKey); if (saved) setAuto(saved === 'true'); } catch {}
    // Also check server
    fetch(`/api/agents/settings?agent_id=${agentId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.auto_mode !== undefined) setAuto(d.auto_mode); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [agentId, storageKey]);

  const toggle = useCallback(async () => {
    const newVal = !auto;
    setAuto(newVal);
    try { localStorage.setItem(storageKey, String(newVal)); } catch {}
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, auto_mode: newVal }),
      });
    } catch { setAuto(!newVal); }
  }, [auto, agentId, storageKey]);

  if (!loaded) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base sm:text-lg">{auto ? '\u{1F916}' : '\u{270D}\uFE0F'}</span>
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-medium text-white/80">{auto ? autoLabel : manualLabel}</div>
          <div className="text-[10px] text-white/40">{auto ? autoDesc : manualDesc}</div>
        </div>
      </div>
      <button
        onClick={toggle}
        className={`w-12 h-7 rounded-full relative transition-colors flex-shrink-0 ${auto ? 'bg-emerald-500' : 'bg-white/15'}`}
      >
        <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${auto ? 'right-0.5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

// Review card with AI reply generation + direct Google reply for Google reviews
function ReviewCard({ review, gradientFrom }: { review: { name?: string; author: string; rating: number; text: string; date: string; replied: boolean }; gradientFrom: string }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const generateReply = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: 'gmaps',
          message: `Genere une reponse professionnelle et chaleureuse a cet avis Google (${review.rating}/5 etoiles) de ${review.author}: "${review.text}". Reponse courte (2-3 phrases max), en francais, qui remercie et montre qu'on prend en compte le feedback. Pas de formule type, sois naturel.`,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.reply) setReplyText(d.reply);
      }
    } catch {} finally { setGenerating(false); }
  }, [review]);

  const copyReply = useCallback(() => {
    navigator.clipboard.writeText(replyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [replyText]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60">
              {review.author?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-sm text-white/80 font-medium">{review.author}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, s) => (
                <svg key={s} className="w-3 h-3" viewBox="0 0 24 24" fill={s < review.rating ? '#fbbf24' : 'rgba(255,255,255,0.15)'}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{
                backgroundColor: review.replied ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                color: review.replied ? '#34d399' : '#fbbf24',
              }}
            >
              {review.replied ? 'Repondu' : 'En attente'}
            </span>
            {!review.replied && (
              <button onClick={() => { setShowReply(!showReply); if (!showReply && !replyText) generateReply(); }} className="text-xs px-3 py-2 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0 min-h-[36px]">
                {showReply ? 'Fermer' : 'Repondre'}
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-white/60 line-clamp-3">{review.text}</p>
        <p className="text-[10px] text-white/30 mt-1">{fmtDate(review.date)}</p>
      </div>

      {showReply && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-white/40">{replyText && !generating ? 'Modifie ou envoie :' : 'Reponse IA generee :'}</span>
            {generating && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-400" />}
          </div>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder={generating ? 'Generation en cours...' : 'Ecris ta reponse ou clique Regenerer pour une suggestion IA...'}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={generateReply}
              disabled={generating}
              className="px-3 py-2 text-xs font-medium bg-white/10 text-white/60 rounded-lg hover:bg-white/15 disabled:opacity-40 min-h-[36px]"
            >
              {generating ? 'Generation...' : '\u2728 Regenerer'}
            </button>
            {/* Direct reply via Google Business API */}
            {review.name && (
              <button
                onClick={async () => {
                  if (!replyText.trim()) return;
                  setSending(true);
                  try {
                    const res = await fetch('/api/agents/google-reviews', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ review_name: review.name, reply: replyText }),
                    });
                    const d = await res.json();
                    if (d.sent) { setSent(true); setTimeout(() => { setSent(false); setShowReply(false); }, 2000); }
                  } catch {} finally { setSending(false); }
                }}
                disabled={sending || !replyText.trim()}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:opacity-90'} disabled:opacity-40`}
              >
                {sent ? '\u2713 Publie !' : sending ? '...' : '\u{1F4E8} Publier sur Google'}
              </button>
            )}
            <button
              onClick={copyReply}
              disabled={!replyText.trim()}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white hover:opacity-90'} disabled:opacity-40`}
            >
              {copied ? '\u2713 Copie !' : '\u{1F4CB} Copier'}
            </button>
            <a
              href="https://business.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-[10px] font-medium bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 ml-auto"
            >
              Google Business {'\u2197'}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function EmailCard({ email }: { email: { prospect: string; type: string; status: string; date: string } }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const statusColors: Record<string, string> = { envoye: '#60a5fa', ouvert: '#fbbf24', repondu: '#34d399', auto_reply: '#a78bfa' };

  const handleReply = useCallback(async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await fetch('/api/crm/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prospect_id: email.prospect, message: replyText, channel: 'email' }),
      });
      setSent(true);
      setTimeout(() => { setSent(false); setShowReply(false); setReplyText(''); }, 2000);
    } catch {} finally { setSending(false); }
  }, [replyText, email.prospect]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-3 sm:p-4 flex items-center gap-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${statusColors[email.status] ?? '#60a5fa'}22`, color: statusColors[email.status] ?? '#60a5fa' }}>
          {email.status}
        </span>
        <span className="text-sm text-white/80 truncate flex-1">{email.prospect}</span>
        <span className="text-[10px] text-white/30 shrink-0">{email.type?.replace('step_', 'Etape ')}</span>
        <button onClick={() => setShowReply(!showReply)} className="text-[10px] px-2 py-1 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0">
          {showReply ? 'Fermer' : 'Repondre'}
        </button>
      </div>
      {showReply && (
        <div className="px-3 sm:px-4 pb-3 border-t border-white/5 pt-2 flex gap-2">
          <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Repondre par email..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50" onKeyDown={e => { if (e.key === 'Enter') handleReply(); }} />
          <button onClick={handleReply} disabled={sending || !replyText.trim()} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0 ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-600 text-white hover:bg-cyan-700'} disabled:opacity-40`}>
            {sent ? '\u2713' : sending ? '...' : 'Envoyer'}
          </button>
        </div>
      )}
    </div>
  );
}

interface AgentDashboardProps {
  agentId: string;
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
  data: {
    recentChats?: number;
    totalMessages?: number;
    recommendations?: Array<{ action: string; data: any; created_at: string }>;
    emailStats?: {
      sent: number;
      opened: number;
      clicked: number;
      openRate: number;
      clickRate: number;
      sequences: Record<string, number>;
    };
    contentStats?: {
      postsGenerated: number;
      scheduledPosts: number;
      recentContent: Array<{ type: string; title: string; created_at: string }>;
    };
    seoStats?: {
      blogPosts: number;
      keywordsTracked: number;
      recentActions: Array<{ action: string; data: any; created_at: string }>;
    };
    adsStats?: {
      campaigns: number;
      totalSpend: number;
      avgRoas: number;
      recentCampaigns: Array<{ name: string; spend: number; roas: number; status: string }>;
    };
    financeStats?: {
      revenue: number;
      expenses: number;
      margin: number;
      recentTransactions: Array<{ description: string; amount: number; type: string; date: string }>;
    };
    // Sara (rh)
    rhStats?: {
      docsGenerated: number;
      questionsAnswered: number;
      activeContracts: number;
      recentDocs: Array<{ type: string; title: string; created_at: string }>;
    };
    // Clara (onboarding)
    onboardingStats?: {
      currentStep: number;
      totalSteps: number;
      completionPercent: number;
      agentsActivated: number;
      totalAgents: number;
      steps: Array<{ name: string; completed: boolean }>;
    };
    // Jade (dm_instagram)
    dmStats?: {
      dmsSent: number;
      responses: number;
      responseRate: number;
      rdvGenerated: number;
      recentDms: Array<{ target: string; status: string; date: string }>;
    };
    // Axel (tiktok_comments)
    tiktokStats?: {
      commentsPosted: number;
      newFollowers: number;
      views: number;
      engagementRate: number;
      recentActions: Array<{ action: string; target: string; date: string }>;
    };
    // Theo (gmaps)
    gmapsStats?: {
      reviewsAnswered: number;
      googleRating: number;
      totalReviews: number;
      gmbClicks: number;
      recentReviews: Array<{ author: string; rating: number; text: string; date: string; replied: boolean }>;
    };
    // Max (chatbot)
    chatbotStats?: {
      visitorsGreeted: number;
      leadsCaptured: number;
      conversionRate: number;
      recentSessions: Array<{ visitor: string; outcome: string; date: string }>;
    };
    // Stella (whatsapp)
    whatsappStats?: {
      messagesSent: number;
      messagesReceived: number;
      responseRate: number;
      leadsGenerated: number;
      conversationsActive: number;
      recentConversations: Array<{ contact: string; lastMessage: string; status: string; date: string }>;
    };
    // Ami global dashboard
    globalStats?: {
      commercial: { leadsWeek: number; conversions: number; estimatedRevenue: number };
      visibility: { traffic: number; followers: number; googleRating: number };
      finance: { adBudget: number; roas: number; forecast: number };
      recommendation: string;
      recentTeamActivity: Array<{ agent: string; action: string; date: string }>;
    };
  };
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return '0';
  return n.toLocaleString('fr-FR');
}

function fmtCurrency(n: number | undefined): string {
  if (n === undefined || n === null) return '0 \u20ac';
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function fmtPercent(n: number | undefined): string {
  if (n === undefined || n === null) return '0 %';
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/* ------------------------------------------------------------------ */
/*  Reusable micro-components                                          */
/* ------------------------------------------------------------------ */

function KpiCard({
  label,
  value,
  gradientFrom,
  gradientTo,
}: {
  label: string;
  value: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4 flex flex-col gap-1.5 relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 opacity-[0.07]" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }} />
      <span className="relative text-[10px] text-white/50 uppercase tracking-wider font-semibold">{label}</span>
      <span
        className="relative text-2xl font-bold bg-clip-text text-transparent"
        style={{ backgroundImage: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
      >
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-8 mb-4">
      <div className="h-px flex-1 bg-white/10" />
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider px-2">{children}</h3>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function EmptyState({ agentName }: { agentName: string }) {
  return (
    <div className="rounded-2xl border border-white/10 p-8 text-center bg-white/[0.02]">
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      </div>
      <p className="text-white/40 text-sm">Aucune donnee pour le moment.</p>
      <p className="text-white/25 text-xs mt-1">Discutez avec {agentName} pour commencer !</p>
    </div>
  );
}

function ActionButton({
  label,
  gradientFrom,
  gradientTo,
  onClick,
}: {
  label: string;
  gradientFrom: string;
  gradientTo: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full mt-4 py-3 px-6 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
    >
      {label}
    </button>
  );
}

// ─── Visual chart components ─────────────────────────────

function DonutChart({ segments, size = 100, label }: {
  segments: Array<{ value: number; color: string; label: string }>;
  size?: number;
  label?: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div className="text-white/20 text-xs text-center py-4">Pas de donnees</div>;

  let offset = 0;
  const r = 36;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dashLength = circumference * pct;
          const dashOffset = circumference * offset;
          offset += pct;
          return (
            <circle
              key={i}
              cx="50" cy="50" r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="12"
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              className="transition-all duration-500"
            />
          );
        })}
        {label && <text x="50" y="50" textAnchor="middle" dy="0.35em" className="fill-white text-[10px] font-bold">{label}</text>}
      </svg>
      <div className="flex flex-wrap justify-center gap-2">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-[9px] text-white/50">{seg.label} ({seg.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-white/50">{label}</span>
        <span className="text-white/70 font-bold">{value}/{max}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ActivityFeed({
  items,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  items: Array<{ label: string; detail?: string; date: string }>;
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  if (items.length === 0) return <EmptyState agentName={agentName} />;
  return (
    <div className="flex flex-col gap-2">
      {items.slice(0, 5).map((item, i) => (
        <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-start gap-3">
          <div
            className="w-2 h-2 rounded-full mt-1.5 shrink-0"
            style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/80 break-words">{item.label}</p>
            {item.detail && <p className="text-xs text-white/50 mt-0.5">{item.detail}</p>}
            <p className="text-xs text-white/40 mt-1">{fmtDate(item.date)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CircularProgress({
  value,
  label,
  gradientFrom,
  gradientTo,
}: {
  value: number;
  label: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const clamp = Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (clamp / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="88" height="88" viewBox="0 0 88 88" className="drop-shadow-lg">
        <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={gradientFrom} />
            <stop offset="100%" stopColor={gradientTo} />
          </linearGradient>
        </defs>
        <circle
          cx="44"
          cy="44"
          r="36"
          fill="none"
          stroke={`url(#grad-${label})`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 44 44)"
        />
        <text x="44" y="44" textAnchor="middle" dominantBaseline="central" className="fill-white text-sm font-bold">
          {fmtPercent(value)}
        </text>
      </svg>
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent-specific panels                                              */
/* ------------------------------------------------------------------ */

function MarketingPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const gs = data.globalStats;
  const recs = data.recommendations ?? [];

  // If globalStats is available, show the master dashboard
  if (gs) {
    return (
      <>
        {/* Connect social networks — hide if already connected */}
        {!(data as any).connections?.instagram && <SocialConnectBanners agentId="marketing" networks={['instagram', 'tiktok', 'linkedin']} />}

        {/* Hot prospects alert */}
        <HotProspectsAlert gradientFrom={gradientFrom} />

        {/* Commercial bloc */}
        <SectionTitle>Commercial</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Leads semaine" value={fmt(gs.commercial.leadsWeek)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="Conversions" value={fmt(gs.commercial.conversions)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="CA estime" value={fmtCurrency(gs.commercial.estimatedRevenue)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        </div>

        {/* Workflow visual — pipeline Commercial */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mt-4">
          <div className="flex items-center justify-between gap-1 text-center">
            {[
              { label: 'Prospects identifies', value: gs.commercial.leadsWeek + gs.commercial.conversions, icon: '\u{1F465}', color: '#94a3b8' },
              { label: 'Contactes', value: gs.commercial.leadsWeek, icon: '\u{1F4E8}', color: '#60a5fa' },
              { label: 'Qualifies', value: Math.round(gs.commercial.leadsWeek * 0.6), icon: '\u{1F3AF}', color: '#fbbf24' },
              { label: 'Clients', value: gs.commercial.conversions, icon: '\u{1F525}', color: '#22c55e' },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center flex-1">
                <div className="flex-1 text-center">
                  <div className="text-lg mb-1">{step.icon}</div>
                  <div className="text-sm font-bold text-white" style={{ color: step.color }}>{step.value}</div>
                  <div className="text-[9px] text-white/40 mt-0.5">{step.label}</div>
                </div>
                {i < 3 && <div className="text-white/20 text-xs mx-1">{'\u2192'}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2 mt-3">
          <a href="/assistant/crm" className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
            {'\u{1F4CA}'} Voir le CRM
          </a>
          <a href="/generate" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
            {'\u2728'} Generer du contenu
          </a>
        </div>

        {/* Visibilite bloc */}
        <SectionTitle>Visibilite</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Trafic" value={fmt(gs.visibility.traffic)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="Followers" value={fmt(gs.visibility.followers)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="Note Google" value={`${(gs.visibility.googleRating || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        </div>

        {/* Instagram engagement bloc */}
        <SectionTitle>Instagram</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Posts publies" value={fmt((gs.visibility as any)?.postsCount || gs.visibility.traffic || 0)} gradientFrom="#8b5cf6" gradientTo="#6d28d9" />
          <KpiCard label="Likes total" value={fmt((gs.visibility as any)?.totalLikes || 0)} gradientFrom="#ec4899" gradientTo="#f43f5e" />
          <KpiCard label="Reach moyen" value={fmt((gs.visibility as any)?.avgReach || 0)} gradientFrom="#06b6d4" gradientTo="#0891b2" />
          <KpiCard label="Engagement" value={`${((gs.visibility as any)?.engagementRate || 0).toFixed?.(1) || '0'}%`} gradientFrom="#10b981" gradientTo="#059669" />
        </div>

        {/* Finance bloc */}
        <SectionTitle>Finance</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Budget pub" value={fmtCurrency(gs.finance.adBudget)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="ROAS" value={`${(gs.finance.roas || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}x`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
          <KpiCard label="Prevision tresorerie" value={fmtCurrency(gs.finance.forecast)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        </div>

        {/* Recommendation AMI */}
        {gs.recommendation && (
          <>
            <SectionTitle>Recommandation AMI</SectionTitle>
            <div
              className="rounded-xl border p-4"
              style={{
                borderColor: `${gradientFrom}44`,
                background: `linear-gradient(135deg, ${gradientFrom}11, ${gradientTo}11)`,
              }}
            >
              <p className="text-sm text-white/90 font-medium">{gs.recommendation}</p>
            </div>
          </>
        )}

        {/* Visual charts */}
        <SectionTitle>Vue d&apos;ensemble</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
            <h4 className="text-white/50 text-[10px] uppercase tracking-wider mb-3 text-center">Repartition activite</h4>
            <DonutChart
              segments={[
                { value: gs.commercial.leadsWeek, color: '#3b82f6', label: 'Leads' },
                { value: gs.commercial.conversions, color: '#22c55e', label: 'Conversions' },
                { value: gs.visibility.traffic, color: '#a855f7', label: 'Trafic' },
                { value: gs.visibility.followers, color: '#f59e0b', label: 'Followers' },
              ]}
              label={`${gs.commercial.leadsWeek + gs.commercial.conversions + gs.visibility.traffic + gs.visibility.followers}`}
            />
          </div>
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
            <h4 className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Objectifs</h4>
            <ProgressBar value={gs.commercial.conversions} max={Math.max(gs.commercial.leadsWeek, 1)} color="#22c55e" label="Taux conversion" />
            <ProgressBar value={Math.round(gs.visibility.googleRating * 20)} max={100} color="#f59e0b" label={`Note Google (${gs.visibility.googleRating}/5)`} />
            <ProgressBar value={Math.min(Math.round(gs.finance.roas * 33), 100)} max={100} color="#a855f7" label={`ROAS (${gs.finance.roas}x)`} />
          </div>
        </div>

        {/* Feed equipe temps reel */}
        <SectionTitle>Feed equipe temps reel</SectionTitle>
        <ActivityFeed
          items={(gs.recentTeamActivity ?? []).map((a) => ({
            label: a.action,
            detail: a.agent,
            date: a.date,
          }))}
          agentName={agentName}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </>
    );
  }

  // Fallback: original marketing panel
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Messages echanges" value={fmt(data.totalMessages)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Recommandations" value={fmt(recs.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Score engagement" value="--" gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Recommandations recentes</SectionTitle>
      {recs.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {recs.slice(0, 8).map((r, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-start gap-3">
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/80 break-words">{r.action}</p>
                <p className="text-xs text-white/40 mt-1">{fmtDate(r.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white/5 rounded-xl border border-white/10 p-4 mt-4">
        <p className="text-xs text-white/50 italic">
          {agentName} a analyse {fmt(data.totalMessages ?? 0)} donnees cette semaine.
        </p>
      </div>
    </>
  );
}

function EmailPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.emailStats || { sent: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0, sequences: {}, recentEmails: [] };

  const seqEntries = Object.entries(stats.sequences ?? {});
  const seqTotal = seqEntries.reduce((s, [, v]) => s + v, 0) || 1;

  // Derive approximate counts for workflow
  const emailProspects = stats.sent + Math.round(stats.sent * 0.2); // prospects > sent
  const emailReplied = Math.round(stats.opened * 0.15); // rough estimate of replies

  return (
    <>
      {/* Auto mode toggle */}
      <div data-tour="auto-toggle"><AutoModeToggle agentId="email" autoLabel="Emails automatiques" manualLabel="Emails manuels" autoDesc="Hugo envoie les sequences email automatiquement" manualDesc="Tu valides chaque email avant envoi" /></div>

      {/* Email connection banner */}
      <EmailConnectBanner connections={(data as any).connections} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Emails envoyes" value={fmt(stats.sent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Taux ouverture" value={fmtPercent(stats.openRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Taux clic" value={fmtPercent(stats.clickRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Sequences actives" value={fmt(seqEntries.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Workflow visual — pipeline Email */}
      <SectionTitle>Workflow Email</SectionTitle>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-1 text-center">
          {[
            { label: 'Prospects', value: emailProspects, icon: '\u{1F465}', color: '#94a3b8' },
            { label: 'Email envoye', value: stats.sent, icon: '\u{1F4E7}', color: '#60a5fa' },
            { label: 'Ouvert', value: stats.opened, icon: '\u{1F4EC}', color: '#fbbf24' },
            { label: 'Clique', value: stats.clicked, icon: '\u{1F517}', color: '#a855f7' },
            { label: 'Repondu', value: emailReplied, icon: '\u{1F4AC}', color: '#22c55e' },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center flex-1">
              <div className="flex-1 text-center">
                <div className="text-lg mb-1">{step.icon}</div>
                <div className="text-sm font-bold text-white" style={{ color: step.color }}>{step.value}</div>
                <div className="text-[9px] text-white/40 mt-0.5">{step.label}</div>
              </div>
              {i < 4 && <div className="text-white/20 text-xs mx-1">{'\u2192'}</div>}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
          <span className="text-[10px] text-cyan-400">{'\u{1F4E8}'}</span>
          <span className="text-[10px] text-white/50">Les prospects qui <strong className="text-cyan-400">repondent</strong> sont automatiquement signales dans le CRM</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer un template email
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

      <SectionTitle>Taux de performance</SectionTitle>
      <div className="flex justify-center gap-8">
        <CircularProgress value={stats.openRate} label="Ouverture" gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <CircularProgress value={stats.clickRate} label="Clic" gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Pipeline sequences</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        {seqEntries.length === 0 ? (
          <p className="text-sm text-white/40 text-center">Aucune sequence active</p>
        ) : (
          <>
            <div className="flex h-6 rounded-full overflow-hidden">
              {seqEntries.map(([name, count], i) => (
                <div
                  key={name}
                  className="h-full flex items-center justify-center text-[10px] font-medium text-white"
                  style={{
                    width: `${(count / seqTotal) * 100}%`,
                    background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                    opacity: 1 - i * 0.15,
                  }}
                  title={`${name}: ${count}`}
                >
                  {count > 0 ? name : ''}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {seqEntries.map(([name, count]) => (
                <span key={name} className="text-xs text-white/50">
                  {name}: <span className="text-white/80 font-medium">{fmt(count)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <SectionTitle>Performance recente</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="flex items-end gap-1 h-24">
          {[stats.sent, stats.opened, stats.clicked].map((val, i) => {
            const max = Math.max(stats.sent, 1);
            const labels = ['Envoyes', 'Ouverts', 'Cliques'];
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md"
                  style={{
                    height: `${(val / max) * 100}%`,
                    minHeight: 4,
                    background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})`,
                  }}
                />
                <span className="text-[10px] text-white/50">{labels[i]}</span>
                <span className="text-xs text-white/70 font-medium">{fmt(val)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hot prospects — direct notification */}
      <HotProspectsAlert source="email" gradientFrom={gradientFrom} />

      {/* Email Inbox */}
      <div data-tour="email-inbox">
        <SectionTitle>Boite de reception</SectionTitle>
        <EmailInbox emails={(data as any).recentEmails || (stats as any).recentEmails || []} gradientFrom={gradientFrom} />
      </div>
    </>
  );
}

// ─── Campaign Creator (mini flow) ──────────────────────────────────
function CampaignCreator() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState('all_prospects');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const generateEmail = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: 'email', message: `Genere un email de campagne marketing pour ${target === 'hot' ? 'mes prospects chauds' : target === 'new' ? 'mes nouveaux contacts' : 'tous mes prospects'}. Objet accrocheur + corps court et percutant en francais. Format: OBJET: ...\n\nCORPS: ...` }),
      });
      if (res.ok) {
        const d = await res.json();
        const text = d.reply || '';
        const subMatch = text.match(/OBJET:\s*(.*?)(\n|CORPS)/i);
        const bodyMatch = text.match(/CORPS:\s*([\s\S]*)/i);
        if (subMatch) setSubject(subMatch[1].trim());
        if (bodyMatch) setBody(bodyMatch[1].trim());
      }
    } catch {} finally { setGenerating(false); }
  }, [target]);

  if (sent) {
    return (
      <div id="campaign-modal" className="rounded-xl border border-emerald-500/20 bg-emerald-900/10 p-4 mb-3 text-center">
        <span className="text-lg">{'\u2705'}</span>
        <p className="text-xs text-emerald-400 font-bold mt-1">Campagne planifiee !</p>
        <button onClick={() => { setSent(false); setOpen(false); setStep(0); setSubject(''); setBody(''); }} className="text-[10px] text-white/40 mt-2 hover:text-white/60">Fermer</button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full py-2.5 mb-3 rounded-xl border border-dashed border-cyan-500/30 bg-cyan-900/5 text-cyan-400 text-xs font-medium hover:bg-cyan-900/10 transition-all">
        {'\u{1F4E7}'} Creer une nouvelle campagne email
      </button>
    );
  }

  return (
    <div id="campaign-modal" className="rounded-xl border border-cyan-500/20 bg-cyan-900/10 p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold text-cyan-300">{'\u{1F4E7}'} Nouvelle campagne email</h4>
        <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>

      {step === 0 && (
        <div className="space-y-2">
          <label className="text-[10px] text-white/50">Cible</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'all_prospects', label: 'Tous', icon: '\u{1F465}' },
              { key: 'hot', label: 'Prospects chauds', icon: '\u{1F525}' },
              { key: 'new', label: 'Nouveaux', icon: '\u2728' },
            ].map(t => (
              <button key={t.key} onClick={() => setTarget(t.key)} className={`p-2 rounded-lg text-[10px] font-medium text-center transition-all ${target === t.key ? 'bg-cyan-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                <div className="text-base mb-0.5">{t.icon}</div>{t.label}
              </button>
            ))}
          </div>
          <button onClick={() => { setStep(1); if (!subject) generateEmail(); }} className="w-full mt-2 py-2 bg-cyan-600 text-white text-xs font-bold rounded-lg">Suivant</button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-white/50">Objet</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={generating ? 'Generation IA...' : 'Objet de l\'email'} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 mt-1" />
          </div>
          <div>
            <label className="text-[10px] text-white/50">Corps</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={generating ? 'Generation IA en cours...' : 'Corps de l\'email'} rows={4} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 mt-1 resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(0)} className="px-3 py-2 bg-white/10 text-white/50 text-xs rounded-lg">Retour</button>
            <button onClick={generateEmail} disabled={generating} className="px-3 py-2 bg-white/10 text-white/50 text-xs rounded-lg disabled:opacity-40">{generating ? '...' : '\u2728 Regenerer'}</button>
            <button
              onClick={async () => {
                if (!subject.trim() || !body.trim()) return;
                setSending(true);
                try {
                  await fetch('/api/agents/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'schedule_campaign', target, subject, body }) });
                  setSent(true);
                } catch {} finally { setSending(false); }
              }}
              disabled={sending || !subject.trim() || !body.trim()}
              className="flex-1 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-bold rounded-lg disabled:opacity-40"
            >
              {sending ? '...' : '\u{1F680} Lancer la campagne'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

}

// ─── Email Inbox Component ─────────────────────────────────────────
function EmailInbox({ emails, gradientFrom }: { emails: any[]; gradientFrom: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [threadProspect, setThreadProspect] = useState<any>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'inbox' | 'sent' | 'auto'>('all');
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Filter emails by type
  const filteredEmails = emails.filter(e => {
    if (inboxFilter === 'inbox') return e.direction === 'incoming';
    if (inboxFilter === 'sent') return e.direction === 'outgoing' && !e.type?.includes('auto');
    if (inboxFilter === 'auto') return e.type?.includes('auto') || e.type?.includes('step_');
    return true;
  });

  const inboxCount = emails.filter(e => e.direction === 'incoming').length;
  const sentCount = emails.filter(e => e.direction === 'outgoing' && !e.type?.includes('auto')).length;
  const autoCount = emails.filter(e => e.type?.includes('auto') || e.type?.includes('step_')).length;

  // Group emails by prospect
  const byProspect = filteredEmails.reduce((acc: Record<string, any[]>, e: any) => {
    const key = e.prospect_id || e.prospect || e.email || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const prospectList = Object.entries(byProspect).map(([key, msgs]) => {
    const latest = msgs[0];
    const hasIncoming = msgs.some((m: any) => m.direction === 'incoming');
    return { key, name: latest.prospect || key, email: latest.email, msgs, latest, hasIncoming, prospect_id: latest.prospect_id };
  }).sort((a, b) => new Date(b.latest.date).getTime() - new Date(a.latest.date).getTime());

  const loadThread = useCallback(async (prospectId: string) => {
    if (!prospectId) return;
    setSelectedId(prospectId);
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/crm/thread?prospect_id=${prospectId}`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setThread(d.thread || []);
        setThreadProspect(d.prospect || null);
      }
    } catch {} finally { setLoadingThread(false); }
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  const sendReply = useCallback(async () => {
    if (!replyText.trim() || !threadProspect) return;
    setSending(true);
    try {
      const res = await fetch('/api/crm/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prospect_id: threadProspect.id, message: replyText, channel: 'email' }),
      });
      if (res.ok) {
        setSent(true);
        setThread(prev => [...prev, { id: `new_${Date.now()}`, type: 'email', direction: 'outgoing', message: replyText, channel: 'email', date: new Date().toISOString(), auto: false }]);
        setReplyText('');
        setTimeout(() => setSent(false), 2000);
      }
    } catch {} finally { setSending(false); }
  }, [replyText, threadProspect]);

  const isDemo = emails.length === 0;
  const displayEmails = isDemo ? DEMO_EMAILS : emails;

  // Re-filter with demo data
  const reFilteredEmails = displayEmails.filter((e: any) => {
    if (inboxFilter === 'inbox') return e.direction === 'incoming';
    if (inboxFilter === 'sent') return e.direction === 'outgoing' && !e.type?.includes('auto');
    if (inboxFilter === 'auto') return e.type?.includes('auto') || e.type?.includes('step_');
    return true;
  });

  // Re-group
  const reByProspect = reFilteredEmails.reduce((acc: Record<string, any[]>, e: any) => {
    const key = e.prospect_id || e.prospect || e.email || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});
  const reProspectList = Object.entries(reByProspect).map(([key, msgs]) => {
    const latest = msgs[0];
    const hasIncoming = msgs.some((m: any) => m.direction === 'incoming');
    return { key, name: latest.prospect || key, email: latest.email, msgs, latest, hasIncoming, prospect_id: latest.prospect_id };
  }).sort((a, b) => new Date(b.latest.date).getTime() - new Date(a.latest.date).getTime());

  return (
    <div>
    {isDemo && (
      <PreviewBanner
        agentName="Hugo"
        connectLabel="Importer des contacts"
        connectUrl="/assistant/crm"
        claraMessage="Hugo peut envoyer les emails depuis ton propre Gmail pour plus d'impact ! Connecte ton email ci-dessus, ou il enverra depuis contact@keiroai.com en attendant."
        gradientFrom="#06b6d4"
        gradientTo="#0891b2"
      />
    )}
    <div>
      {/* Filter tabs + new campaign button */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: `Tous (${emails.length})` },
          { key: 'inbox', label: `Recus (${inboxCount})` },
          { key: 'sent', label: `Envoyes (${sentCount})` },
          { key: 'auto', label: `Sequences (${autoCount})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setInboxFilter(tab.key as any)}
            className={`px-3 py-1.5 text-[10px] sm:text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
              inboxFilter === tab.key ? 'bg-cyan-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="text-[10px] text-white/20 ml-auto">{'\u{1F4E7}'} Campagne: voir ci-dessous</span>
      </div>

    {/* Campaign creation */}
    <div data-tour="email-campaign"><CampaignCreator /></div>

    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden h-[calc(55vh-60px)] md:h-[420px] mb-16 lg:mb-0">
      <div className="flex h-full">
        {/* Email list */}
        <div className={`${selectedId ? 'hidden sm:block' : ''} w-full sm:w-56 border-r border-white/5 overflow-y-auto`}>
          <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{(isDemo ? reProspectList : prospectList).length} conversations</span>
          </div>
          {(isDemo ? reProspectList : prospectList).map(p => (
            <button
              key={p.key}
              onClick={() => p.prospect_id ? loadThread(p.prospect_id) : setSelectedId(p.key)}
              className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${selectedId === (p.prospect_id || p.key) ? 'bg-purple-500/10 border-l-2 border-l-cyan-500' : ''}`}
            >
              <div className="flex items-center gap-2">
                {p.hasIncoming && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />}
                <span className="text-xs font-medium text-white truncate">{p.name}</span>
              </div>
              {p.email && <div className="text-[9px] text-white/20 truncate mt-0.5">{p.email}</div>}
              <div className="text-[10px] text-white/30 truncate mt-0.5">
                {p.latest.direction === 'incoming' ? '\u2709\uFE0F ' : ''}{p.latest.message?.substring(0, 50) || p.latest.type}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  p.latest.status === 'repondu' ? 'bg-emerald-400/15 text-emerald-400' :
                  p.latest.status === 'ouvert' ? 'bg-amber-400/15 text-amber-400' :
                  p.latest.status === 'clique' ? 'bg-purple-400/15 text-purple-400' :
                  'bg-blue-400/15 text-blue-400'
                }`}>{p.latest.status}</span>
                <span className="text-[9px] text-white/15">{new Date(p.latest.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Thread view */}
        {selectedId ? (
          <div className="flex-1 flex flex-col">
            <div className="px-3 py-2.5 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
              <button onClick={() => { setSelectedId(null); setThread([]); setThreadProspect(null); }} className="sm:hidden text-white/40 hover:text-white/60 text-sm">{'\u2190'}</button>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-[10px] text-white font-bold">
                {(threadProspect?.company || threadProspect?.first_name || '?')[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-white">{threadProspect?.company || threadProspect?.first_name || 'Prospect'}</span>
                {threadProspect?.email && <div className="text-[9px] text-white/30 truncate">{threadProspect.email}</div>}
              </div>
              {threadProspect?.temperature && (
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  threadProspect.temperature === 'hot' ? 'bg-red-400/15 text-red-400' :
                  threadProspect.temperature === 'warm' ? 'bg-amber-400/15 text-amber-400' :
                  'bg-blue-400/15 text-blue-400'
                }`}>{threadProspect.temperature}</span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ maxHeight: 350 }}>
              {loadingThread ? (
                <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-400" /></div>
              ) : thread.length === 0 ? (
                <div className="text-center py-8 text-white/20 text-xs">Aucun echange pour ce prospect</div>
              ) : (
                thread.map((msg, i) => (
                  <div key={msg.id || i} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.direction === 'outgoing'
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white rounded-br-md'
                        : 'bg-white/10 text-white/80 rounded-bl-md'
                    }`}>
                      {msg.direction === 'incoming' && <div className="text-[9px] text-cyan-300/60 mb-0.5">{'\u2709\uFE0F'} Reponse recue</div>}
                      {msg.auto && <div className="text-[9px] text-white/40 mb-0.5">{'\u{1F916}'} Auto</div>}
                      <div className="whitespace-pre-wrap">{msg.message || '[pas de contenu]'}</div>
                      <div className={`text-[10px] mt-1 ${msg.direction === 'outgoing' ? 'text-cyan-200/50' : 'text-white/20'}`}>
                        {new Date(msg.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Reply */}
            {threadProspect?.email && (
              <div className="border-t border-white/5 px-3 py-2.5 flex gap-2 bg-white/[0.02]">
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={`Repondre a ${threadProspect.email}...`}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) { e.preventDefault(); sendReply(); } }}
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !replyText.trim()}
                  className={`px-4 py-2 text-xs font-medium rounded-xl transition-all ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white hover:opacity-90'} disabled:opacity-40`}
                >
                  {sent ? '\u2713' : sending ? '...' : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 text-xs gap-2 py-8">
            <svg className="w-8 h-8 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Selectionne un email
          </div>
        )}
      </div>
    </div>
    </div>
    </div>
  );
}

function ContentPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.contentStats || { postsGenerated: 0, scheduledPosts: 0, recentContent: [] };

  const typeBadgeColor: Record<string, string> = {
    Reel: '#e879f9',
    Carousel: '#60a5fa',
    Story: '#fbbf24',
    Post: '#34d399',
  };

  // Last 7 days activity dots
  const now = new Date();
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toISOString().slice(0, 10);
    const hasActivity = stats.recentContent.some((c) => c.created_at.slice(0, 10) === dayStr);
    return { label: d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3), hasActivity };
  });

  return (
    <>
      {/* Connect social networks — hide if already connected */}
      {!(data as any).connections?.instagram && <SocialConnectBanners agentId="content" networks={['instagram', 'tiktok', 'linkedin']} />}

      {/* Auto mode toggle */}
      <div data-tour="auto-toggle"><AutoModeToggle agentId="content" autoLabel="Publication automatique" manualLabel="Publication manuelle" autoDesc="Lena publie automatiquement selon ton calendrier" manualDesc="Tu valides chaque post avant publication" /></div>

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Posts publies" value={fmt(stats.postsGenerated)} gradientFrom="#8b5cf6" gradientTo="#6d28d9" />
        <KpiCard label="Likes total" value={fmt((data as any).igLikes || 0)} gradientFrom="#ec4899" gradientTo="#f43f5e" />
        <KpiCard label="Reach moyen" value={fmt((data as any).igReach || 0)} gradientFrom="#06b6d4" gradientTo="#0891b2" />
        <KpiCard label="Engagement" value={`${((data as any).igEngagement || 0).toFixed?.(1) || '0'}%`} gradientFrom="#10b981" gradientTo="#059669" />
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
        <KpiCard label="Programmes" value={fmt(stats.scheduledPosts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Cette semaine" value={fmt(stats.recentContent.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Visual: content type distribution */}
      <SectionTitle>Repartition du contenu</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={[
              { value: stats.recentContent.filter(c => c.type === 'Reel' || c.type === 'reel').length, color: '#e879f9', label: 'Reels' },
              { value: stats.recentContent.filter(c => c.type === 'Carousel' || c.type === 'carrousel').length, color: '#60a5fa', label: 'Carrousels' },
              { value: stats.recentContent.filter(c => c.type === 'Post' || c.type === 'post').length, color: '#34d399', label: 'Posts' },
              { value: stats.recentContent.filter(c => c.type === 'Story' || c.type === 'story').length, color: '#fbbf24', label: 'Stories' },
            ]}
            label={`${stats.postsGenerated}`}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={stats.postsGenerated} max={Math.max(stats.postsGenerated + stats.scheduledPosts, 1)} color={gradientFrom} label="Generes" />
          <ProgressBar value={stats.scheduledPosts} max={Math.max(stats.postsGenerated + stats.scheduledPosts, 1)} color={gradientTo} label="Programmes" />
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
      {stats.postsGenerated === 0 && (data as any).connections?.instagram && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-900/10 p-4 mb-3 text-center">
          <span className="text-lg">{'\u2705'}</span>
          <p className="text-xs text-emerald-400 font-bold mt-1">Instagram connecte !</p>
          <p className="text-[10px] text-white/50 mt-1">Lena prepare ton premier post... Il apparaitra ici dans quelques instants.</p>
        </div>
      )}
      <ContentWorkflow />

      </div>{/* close content-workflow data-tour */}

      {/* Calendar view by platform — 7 days past + 7 days future */}
      <SectionTitle>Calendrier editorial</SectionTitle>
      <div data-tour="content-calendar" className="bg-white/5 rounded-xl border border-white/10 p-3 sm:p-4 overflow-x-auto">
        <div className="min-w-[400px]">
          {/* Header: dates */}
          <div className="grid grid-cols-[80px_repeat(14,1fr)] gap-0.5 mb-1">
            <div />
            {Array.from({ length: 14 }, (_, i) => {
              const d = new Date(now);
              d.setDate(d.getDate() - 7 + i);
              const isToday = d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
              return (
                <div key={i} className={`text-center text-[10px] sm:text-[9px] py-1 ${isToday ? 'text-purple-300 font-bold' : i < 7 ? 'text-white/30' : 'text-white/50'}`}>
                  {d.toLocaleDateString('fr-FR', { weekday: 'narrow' })}{d.getDate()}
                </div>
              );
            })}
          </div>
          {/* Rows: platforms */}
          {['instagram', 'tiktok', 'linkedin'].map(platform => {
            const platformIcon = platform === 'instagram' ? '\u{1F4F7}' : platform === 'tiktok' ? '\u{1F3B5}' : '\u{1F4BC}';
            return (
              <div key={platform} className="grid grid-cols-[80px_repeat(14,1fr)] gap-0.5 mb-0.5">
                <div className="flex items-center gap-1 text-[10px] text-white/50 pr-1">
                  <span>{platformIcon}</span>
                  <span className="truncate capitalize">{platform}</span>
                </div>
                {Array.from({ length: 14 }, (_, i) => {
                  const d = new Date(now);
                  d.setDate(d.getDate() - 7 + i);
                  const dayStr = d.toISOString().slice(0, 10);
                  const isToday = dayStr === now.toISOString().slice(0, 10);
                  const dayPosts = stats.recentContent.filter((c: any) => c.created_at?.slice(0, 10) === dayStr && (c.platform === platform || (!c.platform && platform === 'instagram')));
                  const hasPost = dayPosts.length > 0;
                  return (
                    <div
                      key={i}
                      className={`h-6 sm:h-7 rounded-sm flex items-center justify-center text-[10px] font-bold ${
                        hasPost
                          ? 'bg-gradient-to-br from-purple-500/40 to-blue-500/40 text-white/80'
                          : isToday
                          ? 'bg-white/10 border border-purple-500/30'
                          : 'bg-white/[0.03]'
                      }`}
                      title={hasPost ? `${dayPosts.length} post(s) ${platform}` : ''}
                    >
                      {hasPost ? dayPosts.length : ''}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {/* Legend */}
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-gradient-to-br from-purple-500/40 to-blue-500/40" /><span className="text-[9px] text-white/30">Publie</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-white/10 border border-purple-500/30" /><span className="text-[9px] text-white/30">Aujourd&apos;hui</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-white/[0.03]" /><span className="text-[9px] text-white/30">Vide</span></div>
          </div>
        </div>
      </div>

      {/* Instagram Comments moved to Jade (DM agent) via JadeTabs */}
    </>
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

// Content workflow: fetch posts by status, allow approve/skip/schedule
function ContentWorkflow() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/agents/content?action=calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'calendar' }) })
      .then(r => r.json())
      .then(d => { if (d.posts || d.calendar) setPosts(d.posts || d.calendar || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAction = useCallback(async (postId: string, action: string) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, _loading: true } : p));
    try {
      await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, post_id: postId }),
      });
      // Update status locally
      const newStatus = action === 'approve' ? 'approved' : action === 'skip' ? 'skipped' : action === 'publish_single' ? 'published' : 'draft';
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: newStatus, _loading: false } : p));
    } catch {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, _loading: false } : p));
    }
  }, []);

  if (loading) return <div className="text-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-400 mx-auto" /></div>;

  const isDemo = posts.length === 0;
  const displayPosts = isDemo ? DEMO_CONTENT_POSTS : posts;

  const statusConfig: Record<string, { color: string; label: string; icon: string }> = {
    draft: { color: '#fbbf24', label: 'A valider', icon: '\u{1F4DD}' },
    approved: { color: '#60a5fa', label: 'Programme', icon: '\u{1F4C5}' },
    published: { color: '#34d399', label: 'Publie', icon: '\u2705' },
    skipped: { color: '#94a3b8', label: 'Ignore', icon: '\u23ED\uFE0F' },
    video_generating: { color: '#e879f9', label: 'Video en cours', icon: '\u{1F3AC}' },
  };

  // Status counts
  const counts = displayPosts.reduce((acc: Record<string, number>, p: any) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
  const filtered = filter === 'all' ? displayPosts : displayPosts.filter((p: any) => p.status === filter);

  return (
    <div>
      {/* Status filter tabs */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {[
          { key: 'all', label: `Tous (${posts.length})` },
          { key: 'draft', label: `A valider (${counts.draft || 0})` },
          { key: 'approved', label: `Programmes (${counts.approved || 0})` },
          { key: 'published', label: `Publies (${counts.published || 0})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 text-[10px] sm:text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
              filter === tab.key ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Post cards — Instagram/TikTok/LinkedIn-like preview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
        {filtered.slice(0, 12).map((post: any) => (
          <PostPreview
            key={post.id}
            post={post}
            compact
            onApprove={post.status === 'draft' ? () => handleAction(post.id, 'approve') : undefined}
            onPublish={post.status === 'draft' ? () => handleAction(post.id, 'publish_single') : undefined}
            onSkip={post.status === 'draft' ? () => handleAction(post.id, 'skip') : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// Inline comments section for Lena
function LenaCommentsSection() {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agents/instagram-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'fetch_comments' }),
    })
      .then(r => r.json())
      .then(d => { if (d.comments) setComments(d.comments); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-4"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400 mx-auto" /></div>;

  const displayComments = comments.length > 0 ? comments : DEMO_IG_COMMENTS;
  const isDemo = comments.length === 0;

  return (
    <div className={isDemo ? 'opacity-80' : ''}>
      {isDemo && <p className="text-[10px] text-amber-400/60 mb-2">{'\u{1F4F8}'} Apercu — connecte Instagram pour voir tes vrais commentaires</p>}
      <div className="space-y-2 max-h-[250px] overflow-y-auto">
        {displayComments.slice(0, 6).map((c: any, i: number) => (
          <div key={i} className="bg-white/5 rounded-lg border border-white/10 p-3 flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
              {(c.username || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-white/80">@{c.username}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.replied ? 'bg-emerald-400/15 text-emerald-400' : 'bg-amber-400/15 text-amber-400'}`}>
                  {c.replied ? 'Repondu' : 'En attente'}
                </span>
              </div>
              <p className="text-[10px] text-white/50 mt-0.5 line-clamp-2">{c.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SeoPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const isDemo = !data.seoStats;
  const stats: any = data.seoStats || { blogPosts: 3, keywordsTracked: 8, pagesOptimized: 3, keywordsRanked: 8, avgPosition: 12.4, trafficIncrease: 15, recentActions: [
    { type: 'audit', title: 'Audit SEO complet du site', action: 'Audit SEO complet du site', created_at: new Date(Date.now() - 86400000).toISOString() },
    { type: 'keyword', title: 'Optimisation mots-cles page accueil', action: 'Optimisation mots-cles', created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
  ] };

  // Derive approximate counts for SEO workflow
  const seoIndexed = Math.round((stats.blogPosts || 0) * 0.8);
  const seoTraffic = Math.round(seoIndexed * 12);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Articles blog" value={fmt(stats.blogPosts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Mots-cles suivis" value={fmt(stats.keywordsTracked)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Actions SEO" value={fmt(stats.recentActions.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Workflow visual — pipeline SEO */}
      <SectionTitle>Workflow SEO</SectionTitle>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-1 text-center">
          {[
            { label: 'Mots-cles', value: stats.keywordsTracked, icon: '\u{1F50D}', color: '#94a3b8' },
            { label: 'Articles', value: stats.blogPosts, icon: '\u{1F4DD}', color: '#60a5fa' },
            { label: 'Indexes', value: seoIndexed, icon: '\u2705', color: '#fbbf24' },
            { label: 'Trafic', value: seoTraffic, icon: '\u{1F4C8}', color: '#22c55e' },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center flex-1">
              <div className="flex-1 text-center">
                <div className="text-lg mb-1">{step.icon}</div>
                <div className="text-sm font-bold text-white" style={{ color: step.color }}>{step.value}</div>
                <div className="text-[9px] text-white/40 mt-0.5">{step.label}</div>
              </div>
              {i < 3 && <div className="text-white/20 text-xs mx-1">{'\u2192'}</div>}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
          <span className="text-[10px] text-emerald-400">{'\u{1F331}'}</span>
          <span className="text-[10px] text-white/50">Les articles <strong className="text-emerald-400">indexes</strong> generent du trafic organique en continu</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/blog" className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u{1F4DD}'} Voir le blog
        </a>
        <a href="/generate" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u2728'} Generer un article
        </a>
      </div>

      <SectionTitle>Actions SEO recentes</SectionTitle>
      {stats.recentActions.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentActions.slice(0, 8).map((a: any, i: number) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-start gap-3">
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/80 break-words">{a.action}</p>
                <p className="text-xs text-white/40 mt-1">{fmtDate(a.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Suivi mots-cles</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-6 text-center">
        <p className="text-sm text-white/50">Le suivi detaille des mots-cles arrive bientot.</p>
        <p className="text-xs text-white/40 mt-1">Demandez a {agentName} vos positions actuelles.</p>
      </div>
    </>
  );
}

function AdsPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats: any = data.adsStats || { campaigns: 3, totalSpend: DEMO_ADS_STATS.totalSpend, avgRoas: DEMO_ADS_STATS.roas, roas: DEMO_ADS_STATS.roas, totalConversions: DEMO_ADS_STATS.totalConversions, totalImpressions: DEMO_ADS_STATS.totalImpressions, recentCampaigns: DEMO_ADS_STATS.recentCampaigns };

  const totalSpend = stats.recentCampaigns.reduce((s: number, c: any) => s + c.spend, 0) || 1;
  const statusColors: Record<string, string> = {
    active: '#34d399',
    paused: '#fbbf24',
    ended: '#f87171',
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Campagnes actives" value={fmt(stats.campaigns)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Budget total" value={fmtCurrency(stats.totalSpend)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="ROAS moyen" value={`${(stats.avgRoas || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}x`} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Visual: budget & ROAS */}
      <SectionTitle>Performance visuelle</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={stats.recentCampaigns.slice(0, 5).map((c: any, i: number) => ({
              value: c.spend,
              color: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'][i % 5],
              label: c.name.substring(0, 15),
            }))}
            label={fmtCurrency(stats.totalSpend)}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={Math.min(Math.round(stats.avgRoas * 33), 100)} max={100} color="#22c55e" label={`ROAS moyen (${stats.avgRoas}x)`} />
          <ProgressBar value={stats.campaigns} max={10} color={gradientFrom} label="Campagnes actives" />
          {stats.recentCampaigns.slice(0, 3).map((c: any, i: number) => (
            <ProgressBar key={i} value={Math.round(c.roas * 33)} max={100} color={['#3b82f6', '#22c55e', '#f59e0b'][i]} label={`${c.name.substring(0, 20)} (${c.roas}x)`} />
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer une campagne
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

      <SectionTitle>Campagnes</SectionTitle>
      {stats.recentCampaigns.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentCampaigns.slice(0, 8).map((c: any, i: number) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/80 font-medium truncate flex-1 mr-2">{c.name}</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: `${statusColors[c.status] ?? '#a78bfa'}22`,
                    color: statusColors[c.status] ?? '#a78bfa',
                  }}
                >
                  {c.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-white/50">
                <span>Depense: <span className="text-white/70 font-medium">{fmtCurrency(c.spend)}</span></span>
                <span>ROAS: <span className="text-white/70 font-medium">{(c.roas || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}x</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Repartition budget</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        {stats.recentCampaigns.length === 0 ? (
          <p className="text-sm text-white/40 text-center">Aucune campagne</p>
        ) : (
          <>
            <div className="flex h-6 rounded-full overflow-hidden">
              {stats.recentCampaigns.map((c: any, i: number) => (
                <div
                  key={i}
                  className="h-full"
                  style={{
                    width: `${(c.spend / totalSpend) * 100}%`,
                    background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                    opacity: 1 - i * 0.12,
                  }}
                  title={`${c.name}: ${fmtCurrency(c.spend)}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {stats.recentCampaigns.map((c: any, i: number) => (
                <span key={i} className="text-xs text-white/50">
                  {c.name}: <span className="text-white/80 font-medium">{fmtCurrency(c.spend)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function FinancePanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats: any = data.financeStats || { revenue: DEMO_FINANCE_STATS.revenue, expenses: DEMO_FINANCE_STATS.expenses, profit: DEMO_FINANCE_STATS.profit, profitMargin: DEMO_FINANCE_STATS.profitMargin, recentTransactions: DEMO_FINANCE_STATS.recentTransactions };

  const maxBar = Math.max(stats.revenue, stats.expenses, 1);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Chiffre d'affaires" value={fmtCurrency(stats.revenue)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Depenses" value={fmtCurrency(stats.expenses)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard
          label="Marge"
          value={`${fmtCurrency(stats.margin)} (${stats.revenue > 0 ? fmtPercent((stats.margin / stats.revenue) * 100) : '0 %'})`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </div>

      <SectionTitle>Revenus vs Depenses</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 w-20 shrink-0">Revenus</span>
          <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(stats.revenue / maxBar) * 100}%`,
                background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
              }}
            />
          </div>
          <span className="text-xs text-white/70 font-medium w-20 text-right shrink-0">{fmtCurrency(stats.revenue)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 w-20 shrink-0">Depenses</span>
          <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(stats.expenses / maxBar) * 100}%`,
                background: 'linear-gradient(90deg, #f87171, #ef4444)',
              }}
            />
          </div>
          <span className="text-xs text-white/70 font-medium w-20 text-right shrink-0">{fmtCurrency(stats.expenses)}</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/assistant/crm" className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u{1F4CA}'} Voir le CRM
        </a>
        <a href="/generate" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u2728'} Generer un rapport
        </a>
      </div>

      <SectionTitle>Transactions recentes</SectionTitle>
      {stats.recentTransactions.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentTransactions.slice(0, 10).map((t: any, i: number) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  backgroundColor: t.type === 'income' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                  color: t.type === 'income' ? '#34d399' : '#f87171',
                }}
              >
                {t.type === 'income' ? '+' : '-'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/80 truncate">{t.description}</p>
                <p className="text-xs text-white/40">{fmtDate(t.date)}</p>
              </div>
              <span
                className="text-sm font-medium shrink-0"
                style={{ color: t.type === 'income' ? '#34d399' : '#f87171' }}
              >
                {t.type === 'income' ? '+' : '-'}{fmtCurrency(Math.abs(t.amount))}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Sara (rh) - Expert Juridique & RH                            */
/* ------------------------------------------------------------------ */

function RhPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats: any = data.rhStats || { contractsGenerated: DEMO_RH_STATS.contractsGenerated, rgpdCompliant: true, alertsCount: 0, recentDocs: DEMO_RH_STATS.recentDocs };

  const docTypeBadge: Record<string, string> = {
    contrat: '#60a5fa',
    avenant: '#e879f9',
    fiche_paie: '#34d399',
    attestation: '#fbbf24',
    reglement: '#f87171',
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Docs generes" value={fmt(stats.docsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Questions repondues" value={fmt(stats.questionsAnswered)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Contrats actifs" value={fmt(stats.activeContracts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Documents recents</SectionTitle>
      {stats.recentDocs.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentDocs.slice(0, 5).map((doc: any, i: number) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  backgroundColor: `${docTypeBadge[doc.type] ?? '#a78bfa'}22`,
                  color: docTypeBadge[doc.type] ?? '#a78bfa',
                }}
              >
                {doc.type}
              </span>
              <span className="text-sm text-white/80 truncate flex-1">{doc.title}</span>
              <span className="text-xs text-white/40 shrink-0">{fmtDate(doc.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Generer un document
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

      <ActionButton label="Generer un document" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Clara (onboarding) - Guide de Demarrage                      */
/* ------------------------------------------------------------------ */

function OnboardingPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats: any = data.onboardingStats || { completionPercent: 25, agentsActivated: 2, totalAgents: 18, steps: [{ name: 'Profil business', completed: true }, { name: 'Connecter Instagram', completed: false }, { name: 'Premier post', completed: false }] };

  const defaultSteps = stats.steps.length > 0
    ? stats.steps
    : [
        { name: 'Identite marque', completed: false },
        { name: 'Connexion reseaux', completed: false },
        { name: 'Objectifs', completed: false },
        { name: 'Agents actives', completed: false },
        { name: 'Premier lancement', completed: false },
      ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard
          label="Etape onboarding"
          value={`${stats.currentStep}/${stats.totalSteps}`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
        <KpiCard label="% complete" value={fmtPercent(stats.completionPercent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard
          label="Agents actives"
          value={`${stats.agentsActivated}/${stats.totalAgents}`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </div>

      {/* Progress bar */}
      <SectionTitle>Progression</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="h-4 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${stats.completionPercent}%`,
              background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
            }}
          />
        </div>
        <p className="text-xs text-white/50 mt-2 text-center">
          {stats.completionPercent < 100
            ? `Encore ${100 - stats.completionPercent}% pour terminer l'onboarding`
            : 'Onboarding termine !'}
        </p>
      </div>

      {/* Checklist */}
      <SectionTitle>Checklist</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col gap-3">
        {defaultSteps.map((step: any, i: number) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
              style={{
                background: step.completed
                  ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`
                  : 'rgba(255,255,255,0.06)',
                color: step.completed ? '#fff' : 'rgba(255,255,255,0.3)',
              }}
            >
              {step.completed ? '\u2713' : i + 1}
            </div>
            <span
              className={`text-sm ${step.completed ? 'text-white/80 line-through' : 'text-white/60'}`}
            >
              {step.name}
            </span>
          </div>
        ))}
      </div>

      <ActionButton label="Reprendre l'onboarding" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Jade (dm_instagram) - Experte DM Instagram                   */
/* ------------------------------------------------------------------ */

function DmInstagramPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.dmStats || {
    dmsSent: 0,
    responses: 0,
    rdvGenerated: 0,
    responseRate: 0,
    prospectsGenerated: 0,
    recentDms: [],
  };

  const statusColors: Record<string, string> = {
    envoye: '#60a5fa',
    repondu: '#34d399',
    rdv: '#e879f9',
    ignore: '#f87171',
  };

  return (
    <>
      {/* Connect + Toggle inline — hide connect if already connected */}
      <div className="flex flex-col lg:flex-row gap-3 mb-3">
        {!(data as any).connections?.instagram && <div className="flex-1"><SocialConnectBanners agentId="dm_instagram" networks={['instagram']} /></div>}
        <div data-tour="auto-toggle" className={!(data as any).connections?.instagram ? 'lg:w-72' : 'flex-1'}><AutoModeToggle agentId="dm_instagram" autoLabel="DMs automatiques" manualLabel="DMs manuels" autoDesc="Jade repond auto aux DMs" manualDesc="Tu valides chaque DM" /></div>
      </div>

      {/* KPIs + CRM link — horizontal bar */}
      <div data-tour="dm-stats" className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-blue-400 font-bold text-sm">{fmt(stats.dmsSent)}</span>
          <span className="text-white/30 text-[10px]">DMs</span>
        </div>
        <span className="text-white/15 text-xs">{'\u2192'}</span>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-amber-400 font-bold text-sm">{fmt(stats.responses)}</span>
          <span className="text-white/30 text-[10px]">Reponses</span>
        </div>
        <span className="text-white/15 text-xs">{'\u2192'}</span>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-emerald-400 font-bold text-sm">{fmt(stats.rdvGenerated)}</span>
          <span className="text-white/30 text-[10px]">RDV</span>
        </div>
        <a href="/assistant/crm" className="ml-auto px-3 py-2 bg-purple-600/20 text-purple-300 text-xs font-medium rounded-lg hover:bg-purple-600/30 transition border border-purple-500/20">
          {'\u{1F4CA}'} CRM
        </a>
      </div>

      {/* Hot prospects */}
      <HotProspectsAlert source="dm_instagram" gradientFrom={gradientFrom} />

      {/* DMs / Comments switch */}
      <JadeTabs gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Axel (tiktok_comments) - Expert TikTok Engagement            */
/* ------------------------------------------------------------------ */

function TiktokCommentsPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats: any = data.tiktokStats || { videosPosted: DEMO_TIKTOK_STATS.videosPosted, totalViews: DEMO_TIKTOK_STATS.totalViews, avgEngagement: DEMO_TIKTOK_STATS.avgEngagement, followers: DEMO_TIKTOK_STATS.followers, recentComments: DEMO_TIKTOK_STATS.recentComments || [] };

  return (
    <>
      {/* Connect TikTok if not connected */}
      {!(data as any).connections?.tiktok && <SocialConnectBanners agentId="tiktok_comments" networks={['tiktok']} />}

      {/* Auto mode */}
      <AutoModeToggle agentId="tiktok_comments" autoLabel="Engagement automatique" manualLabel="Engagement manuel" autoDesc="Axel commente et engage automatiquement" manualDesc="Tu valides chaque interaction" />

      {/* KPIs horizontal */}
      <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="font-bold text-sm" style={{ color: gradientFrom }}>{fmt(stats.videosPosted || 0)}</span>
          <span className="text-white/30 text-[10px]">Videos</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-cyan-400 font-bold text-sm">{fmt(stats.totalViews || 0)}</span>
          <span className="text-white/30 text-[10px]">Vues</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-emerald-400 font-bold text-sm">{(stats.avgEngagement || 0).toFixed(1)}%</span>
          <span className="text-white/30 text-[10px]">Engagement</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-purple-400 font-bold text-sm">{fmt(stats.followers || 0)}</span>
          <span className="text-white/30 text-[10px]">Followers</span>
        </div>
      </div>

      {/* TikTok Comments */}
      <SectionTitle>Commentaires TikTok</SectionTitle>
      <div className="space-y-2 max-h-[200px] overflow-y-auto mb-3">
        {(stats.recentComments || DEMO_TIKTOK_STATS.recentComments || []).slice(0, 5).map((c: any, i: number) => (
          <div key={i} className="bg-white/5 rounded-lg border border-white/10 p-3 flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-black flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
              {(c.author || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-white/80">@{c.author}</span>
              <p className="text-[10px] text-white/50 mt-0.5">{c.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent actions */}
      <SectionTitle>Actions recentes</SectionTitle>
      <ActivityFeed
        items={(stats.recentActions ?? []).map((a: any) => ({
          label: a.action,
          detail: a.target,
          date: a.date,
        }))}
        agentName={agentName}
        gradientFrom={gradientFrom}
        gradientTo={gradientTo}
      />

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer du contenu TikTok
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

      <ActionButton label="Configurer l'engagement" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Theo (gmaps) - Expert Google Maps                            */
/* ------------------------------------------------------------------ */

function GmapsPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats = data.gmapsStats || { reviewsAnswered: 0, googleRating: 0, totalReviews: 0, gmbClicks: 0, recentReviews: [] };

  // Fetch real Google reviews if connected
  const [googleReviews, setGoogleReviews] = useState<any[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);

  useEffect(() => {
    setLoadingReviews(true);
    fetch('/api/agents/google-reviews', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.connected && d.reviews?.length > 0) {
          setGoogleReviews(d.reviews);
          setGoogleConnected(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingReviews(false));
  }, []);

  // Star rating visual
  const fullStars = Math.floor(stats.googleRating);
  const hasHalf = stats.googleRating - fullStars >= 0.25;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Avis repondus" value={fmt(stats.reviewsAnswered)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard
          label="Note Google"
          value={`${(stats.googleRating || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5`}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
        <KpiCard label="Clics fiche GMB" value={fmt(stats.gmbClicks)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Star rating visual */}
      <SectionTitle>Note moyenne ({fmt(stats.totalReviews)} avis)</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center justify-center gap-1">
        {Array.from({ length: fullStars }).map((_, i) => (
          <svg key={`full-${i}`} className="w-7 h-7" viewBox="0 0 24 24" fill={gradientFrom}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ))}
        {hasHalf && (
          <svg className="w-7 h-7" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="half-star-grad">
                <stop offset="50%" stopColor={gradientFrom} />
                <stop offset="50%" stopColor="rgba(255,255,255,0.15)" />
              </linearGradient>
            </defs>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="url(#half-star-grad)" />
          </svg>
        )}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <svg key={`empty-${i}`} className="w-7 h-7" viewBox="0 0 24 24" fill="rgba(255,255,255,0.15)">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ))}
        <span className="ml-3 text-lg font-bold text-white/80">
          {(stats.googleRating || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        </span>
      </div>

      {/* Single preview banner if not connected */}
      {!googleConnected && !loadingReviews && (
        <PreviewBanner
          agentName="Theo"
          connectLabel="Connecter Google Business"
          connectUrl="/api/auth/google-oauth"
          claraMessage="Voici un apercu de ton espace avis Google. Tu pourras voir tes avis, repondre avec l'IA et meme activer les reponses automatiques. 1 clic et c'est parti !"
          gradientFrom="#f59e0b"
          gradientTo="#d97706"
        />
      )}

      {/* Auto-reply toggle — always visible (demo or real) */}
      <AutoModeToggle agentId="gmaps" autoLabel="Reponses automatiques" manualLabel="Reponses manuelles" autoDesc="Theo repond a chaque nouvel avis automatiquement" manualDesc="Tu choisis quand et quoi repondre" />

      {/* Google reviews: real data or demo */}
      <div data-tour="google-reviews">
      <SectionTitle>{googleConnected ? `Avis Google (${googleReviews.length})` : 'Avis Google (apercu)'}</SectionTitle>
      <div className={`flex flex-col gap-2 ${!googleConnected ? 'opacity-90' : ''}`}>
        {(googleConnected ? googleReviews : DEMO_REVIEWS).slice(0, 10).map((review: any, i: number) => (
          <ReviewCard key={i} review={review} gradientFrom={gradientFrom} />
        ))}
      </div>

      </div>{/* close google-reviews data-tour */}

      {/* Bottom padding for mobile nav */}
      <div className="pb-16 lg:pb-0" />

      {/* Fallback: cached reviews from agent_logs */}
      {(stats.recentReviews?.length || 0) > 0 && <SectionTitle>Avis recents</SectionTitle>}
      {(stats.recentReviews?.length || 0) > 0 && (
        <div className="flex flex-col gap-2">
          {stats.recentReviews.slice(0, 5).map((review: any, i: number) => (
            <ReviewCard key={i} review={review} gradientFrom={gradientFrom} />
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-amber-600 to-yellow-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Generer des reponses
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

      <ActionButton label="Voir ma fiche Google" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  NEW: Max (chatbot) - Chatbot Site Web                             */
/* ------------------------------------------------------------------ */

function ChatbotPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats: any = data.chatbotStats || { totalVisitors: DEMO_CHATBOT_STATS.totalVisitors, leadsGenerated: DEMO_CHATBOT_STATS.leadsGenerated, avgSessionDuration: DEMO_CHATBOT_STATS.avgSessionDuration, conversionRate: DEMO_CHATBOT_STATS.conversionRate, recentSessions: DEMO_CHATBOT_STATS.recentSessions };

  // Conversion funnel mini visual
  const funnelSteps = [
    { label: 'Visiteurs', value: stats.visitorsGreeted },
    { label: 'Leads', value: stats.leadsCaptured },
    { label: 'Convertis', value: Math.round(stats.leadsCaptured * (stats.conversionRate / 100)) },
  ];
  const maxFunnel = Math.max(stats.visitorsGreeted, 1);

  const outcomeColors: Record<string, string> = {
    lead: '#34d399',
    conversion: '#e879f9',
    abandon: '#f87171',
    question: '#60a5fa',
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Visiteurs accueillis" value={fmt(stats.visitorsGreeted)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Leads captes" value={fmt(stats.leadsCaptured)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Taux conversion" value={fmtPercent(stats.conversionRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Conversion funnel */}
      <SectionTitle>Entonnoir de conversion</SectionTitle>
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col gap-3">
        {funnelSteps.map((step, i) => {
          const widthPct = Math.max((step.value / maxFunnel) * 100, 8);
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">{step.label}</span>
                <span className="text-xs text-white/70 font-medium">{fmt(step.value)}</span>
              </div>
              <div className="h-5 bg-white/5 rounded-full overflow-hidden flex justify-center">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${widthPct}%`,
                    background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
                    opacity: 1 - i * 0.2,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent chatbot sessions */}
      <SectionTitle>Sessions recentes</SectionTitle>
      {stats.recentSessions.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {stats.recentSessions.slice(0, 5).map((session: any, i: number) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  backgroundColor: `${outcomeColors[session.outcome] ?? '#a78bfa'}22`,
                  color: outcomeColors[session.outcome] ?? '#a78bfa',
                }}
              >
                {session.outcome}
              </span>
              <span className="text-sm text-white/80 truncate flex-1">{session.visitor}</span>
              <span className="text-xs text-white/40 shrink-0">{fmtDate(session.date)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Personnaliser les messages
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>

      <ActionButton label="Configurer le chatbot" gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Generic fallback panel                                             */
/* ------------------------------------------------------------------ */

function GenericPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Messages echanges" value={fmt(data.totalMessages)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Recommandations" value={fmt(data.recommendations?.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Score engagement" value={data.recentChats ? `${data.recentChats}` : '--'} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>Recommandations recentes</SectionTitle>

      {data.recommendations && data.recommendations.length > 0 ? (
        <div className="space-y-2">
          {data.recommendations.slice(0, 5).map((rec, i) => (
            <div key={i} className="rounded-xl border border-white/10 p-3 flex items-start gap-3" style={{ background: `linear-gradient(135deg, ${gradientFrom}08, ${gradientTo}05)` }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `linear-gradient(135deg, ${gradientFrom}30, ${gradientTo}30)` }}>
                <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-xs">{rec.action}</p>
                <p className="text-white/30 text-[10px] mt-0.5">{fmtDate(rec.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState agentName={agentName} />
      )}

      {/* Weekly summary */}
      <div className="mt-4 rounded-xl border border-white/10 p-4" style={{ background: `linear-gradient(135deg, ${gradientFrom}08, transparent)` }}>
        <p className="text-white/40 text-xs italic">
          {agentName} a analyse {fmt(data.totalMessages || 0)} donnees cette semaine.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Generer du contenu
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  WhatsApp Panel (Stella)                                            */
/* ------------------------------------------------------------------ */

function WhatsAppPanel({
  data,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  data: AgentDashboardProps['data'];
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const stats: any = data.whatsappStats || { conversations: DEMO_WHATSAPP_STATS.conversations, activeConversations: DEMO_WHATSAPP_STATS.activeConversations, leadsGenerated: DEMO_WHATSAPP_STATS.leadsGenerated, responseRate: DEMO_WHATSAPP_STATS.responseRate, recentChats: DEMO_WHATSAPP_STATS.recentChats || [] };

  const statusColors: Record<string, string> = {
    active: '#34d399',
    replied: '#60a5fa',
    converted: '#e879f9',
    waiting: '#fbbf24',
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Messages envoyes" value={fmt(stats.messagesSent)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Messages recus" value={fmt(stats.messagesReceived)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Taux reponse" value={fmtPercent(stats.responseRate)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Leads generes" value={fmt(stats.leadsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      {/* Performance visuelle */}
      <SectionTitle>Performance</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02]">
          <DonutChart
            segments={[
              { value: stats.messagesSent, color: '#25D366', label: 'Envoyes' },
              { value: stats.messagesReceived, color: '#128C7E', label: 'Recus' },
              { value: stats.leadsGenerated, color: '#fbbf24', label: 'Leads' },
            ]}
            label={`${stats.responseRate}%`}
          />
        </div>
        <div className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-3">
          <ProgressBar value={stats.messagesReceived} max={Math.max(stats.messagesSent, 1)} color="#25D366" label="Taux reponse" />
          <ProgressBar value={stats.leadsGenerated} max={Math.max(stats.messagesReceived, 1)} color="#fbbf24" label="Conversion leads" />
          <ProgressBar value={stats.conversationsActive} max={Math.max(stats.messagesSent, 1)} color="#128C7E" label="Conversations actives" />
        </div>
      </div>

      {/* Active conversations */}
      <SectionTitle>Conversations actives ({stats.conversationsActive})</SectionTitle>
      {stats.recentConversations && stats.recentConversations.length > 0 ? (
        <div className="space-y-2">
          {stats.recentConversations.map((conv: any, i: number) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#25D366]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-sm">{'\uD83D\uDCF2'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{conv.contact}</div>
                <div className="text-xs text-white/40 truncate">{conv.lastMessage}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[conv.status] || '#6b7280' }} />
                <span className="text-[10px] text-white/40">{new Date(conv.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-white/30 text-sm">Aucune conversation recente</div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <a href="/generate" className="px-4 py-2 bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-all">
          {'\u2728'} Creer un template WhatsApp
        </a>
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} Voir le CRM
        </a>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Instagram Comments Panel                                           */
/* ------------------------------------------------------------------ */

function InstagramCommentsPanel({ data, agentName, gradientFrom, gradientTo }: { data: AgentDashboardProps['data']; agentName: string; gradientFrom: string; gradientTo: string }) {
  const [comments, setComments] = useState<Array<{ comment_id: string; text: string; username: string; timestamp: string; replied: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [autoReplying, setAutoReplying] = useState(false);

  // Fetch comments on mount
  useEffect(() => {
    fetch('/api/agents/instagram-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'fetch_comments' }),
    }).then(r => r.json()).then(d => {
      if (d.comments) setComments(d.comments);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleReply = async (commentId: string) => {
    if (!replyText.trim()) return;
    try {
      await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reply_comment', comment_id: commentId, message: replyText }),
      });
      setComments(prev => prev.map(c => c.comment_id === commentId ? { ...c, replied: true } : c));
      setReplying(null);
      setReplyText('');
    } catch {}
  };

  const handleAutoReply = async () => {
    setAutoReplying(true);
    try {
      const res = await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'auto_reply_all' }),
      });
      const d = await res.json();
      if (d.replied > 0) {
        setComments(prev => prev.map(c => ({ ...c, replied: true })));
      }
    } catch {} finally { setAutoReplying(false); }
  };

  const unreplied = comments.filter(c => !c.replied).length;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Commentaires" value={fmt(comments.length)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label="Sans reponse" value={fmt(unreplied)} gradientFrom={unreplied > 0 ? '#ef4444' : gradientFrom} gradientTo={unreplied > 0 ? '#dc2626' : gradientTo} />
        <KpiCard label="Repondus" value={fmt(comments.length - unreplied)} gradientFrom="#22c55e" gradientTo="#16a34a" />
      </div>

      {unreplied > 0 && (
        <button onClick={handleAutoReply} disabled={autoReplying} className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl mt-3 disabled:opacity-50">
          {autoReplying ? 'Reponses IA en cours...' : `\u{1F916} Repondre automatiquement (${unreplied} en attente)`}
        </button>
      )}

      <SectionTitle>Commentaires recents</SectionTitle>
      {loading ? (
        <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400 mx-auto" /></div>
      ) : (comments.length === 0 ? DEMO_IG_COMMENTS : comments).length === 0 ? null : (
        <div className="flex flex-col gap-2">
          {(comments.length === 0 ? (
            <>
              <PreviewBanner agentName="Commentaires IG" connectLabel="Connecter Instagram" connectUrl="/api/auth/instagram-oauth" claraMessage="Voici un apercu de tes commentaires Instagram. Tu pourras repondre automatiquement ou manuellement a chaque commentaire." gradientFrom="#e11d48" gradientTo="#be123c" />
            </>
          ) : null)}
          {(comments.length === 0 ? DEMO_IG_COMMENTS : comments).slice(0, 10).map(c => (
            <div key={c.comment_id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="p-3 flex items-start gap-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${c.replied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {c.replied ? '\u2713' : 'NEW'}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-white/50">@{c.username}</span>
                  <p className="text-sm text-white/80 mt-0.5">{c.text}</p>
                </div>
                {!c.replied && (
                  <button onClick={() => setReplying(replying === c.comment_id ? null : c.comment_id)} className="text-[10px] px-2 py-1 bg-white/10 rounded-lg text-white/60 hover:bg-white/15 shrink-0">
                    Repondre
                  </button>
                )}
              </div>
              {replying === c.comment_id && (
                <div className="px-3 pb-3 border-t border-white/5 pt-2 flex gap-2">
                  <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Repondre au commentaire..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none" onKeyDown={e => { if (e.key === 'Enter') handleReply(c.comment_id); }} />
                  <button onClick={() => handleReply(c.comment_id)} className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg">Envoyer</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Mapping agentId -> panel + subtitle                                */
/* ------------------------------------------------------------------ */

const AGENT_CONFIG: Record<string, { subtitle: string; Panel: typeof MarketingPanel }> = {
  marketing: { subtitle: 'Dashboard Global', Panel: MarketingPanel },
  email: { subtitle: 'Performance Email', Panel: EmailPanel },
  content: { subtitle: 'Publications & Contenu', Panel: ContentPanel },
  seo: { subtitle: 'Visibilite & SEO', Panel: SeoPanel },
  ads: { subtitle: 'Publicite & ROAS', Panel: AdsPanel },
  finance: { subtitle: 'Finance & Tresorerie', Panel: FinancePanel },
  rh: { subtitle: 'Expert Juridique & RH', Panel: RhPanel },
  onboarding: { subtitle: 'Guide de Demarrage', Panel: OnboardingPanel },
  dm_instagram: { subtitle: 'Experte DM Instagram', Panel: DmInstagramPanel },
  instagram_comments: { subtitle: 'Commentaires Instagram', Panel: InstagramCommentsPanel },
  tiktok_comments: { subtitle: 'Expert TikTok Engagement', Panel: TiktokCommentsPanel },
  gmaps: { subtitle: 'Reputation & Avis Clients', Panel: GmapsPanel },
  chatbot: { subtitle: 'Chatbot Site Web', Panel: ChatbotPanel },
  whatsapp: { subtitle: 'WhatsApp Business', Panel: WhatsAppPanel },
  linkedin: { subtitle: 'LinkedIn & Reseau Pro', Panel: GenericPanel },
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

// Admin supervision names
const ADMIN_NAMES: Record<string, { name: string; subtitle: string }> = {
  marketing: { name: 'AMI Strategie Marketing Group', subtitle: 'Supervision Marketing — Tous clients' },
  email: { name: 'Hugo Email Group', subtitle: 'Supervision Email — Tous clients' },
  content: { name: 'Lena Contenu Group', subtitle: 'Supervision Contenu — Tous clients' },
  dm_instagram: { name: 'Jade DM Group', subtitle: 'Supervision DM Instagram — Tous clients' },
  commercial: { name: 'Leo Commercial Group', subtitle: 'Supervision Prospection — Tous clients' },
  seo: { name: 'Oscar SEO Group', subtitle: 'Supervision SEO — Tous clients' },
  ads: { name: 'Felix Ads Group', subtitle: 'Supervision Publicite — Tous clients' },
  gmaps: { name: 'Theo Avis Group', subtitle: 'Supervision Avis Google — Tous clients' },
  chatbot: { name: 'Max Chatbot Group', subtitle: 'Supervision Chatbot — Tous clients' },
  whatsapp: { name: 'Stella WhatsApp Group', subtitle: 'Supervision WhatsApp — Tous clients' },
  onboarding: { name: 'Clara Onboarding Group', subtitle: 'Supervision Onboarding — Tous clients' },
  tiktok_comments: { name: 'Axel TikTok Group', subtitle: 'Supervision TikTok — Tous clients' },
  instagram_comments: { name: 'Commentaires IG Group', subtitle: 'Supervision Commentaires — Tous clients' },
  linkedin: { name: 'Emma LinkedIn Group', subtitle: 'Supervision LinkedIn — Tous clients' },
  rh: { name: 'Sara RH Group', subtitle: 'Supervision Juridique — Tous clients' },
  finance: { name: 'Louis Finance Group', subtitle: 'Supervision Finance — Tous clients' },
};

export default function AgentDashboard({ agentId, agentName, gradientFrom, gradientTo, data }: AgentDashboardProps) {
  const config = AGENT_CONFIG[agentId];
  const isAdmin = !!(data as any).supervision?.isAdmin;
  const adminOverride = isAdmin ? ADMIN_NAMES[agentId] : null;
  const displayName = adminOverride?.name || agentName;
  const subtitle = adminOverride?.subtitle || config?.subtitle || 'Tableau de bord';
  const Panel = config?.Panel ?? GenericPanel;

  return (
    <div className="overflow-y-auto w-full">
      {/* Agent identity band */}
      <div className="rounded-t-2xl px-5 py-4 mb-0" style={{ background: `linear-gradient(135deg, ${gradientFrom}25, ${gradientTo}15)`, borderBottom: `2px solid ${gradientFrom}40` }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{displayName}</h2>
            <p className="text-sm font-medium" style={{ color: gradientFrom }}>{subtitle}</p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${gradientFrom}30, ${gradientTo}30)` }}>
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: gradientFrom }} />
          </div>
        </div>
      </div>

      {/* Admin supervision panel — cross-client view */}
      {(data as any).supervision?.isAdmin && (
        <div className="mx-5 mt-3 rounded-xl border border-indigo-500/20 bg-indigo-900/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">{'\u{1F6E1}\uFE0F'}</span>
            <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Supervision cross-clients</h3>
            <span className="ml-auto text-[10px] text-indigo-400/50">24h</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-indigo-900/20 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-white">{(data as any).supervision.totalActions24h}</div>
              <div className="text-[9px] text-indigo-300/60">Actions</div>
            </div>
            <div className="bg-indigo-900/20 rounded-lg p-2 text-center">
              <div className={`text-lg font-bold ${(data as any).supervision.totalErrors24h > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {(data as any).supervision.totalErrors24h}
              </div>
              <div className="text-[9px] text-indigo-300/60">Erreurs</div>
            </div>
            <div className="bg-indigo-900/20 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-white">{(data as any).supervision.clients?.length || 0}</div>
              <div className="text-[9px] text-indigo-300/60">Clients</div>
            </div>
          </div>
          {(data as any).supervision.clients?.length > 0 && (
            <div className="space-y-1">
              {(data as any).supervision.clients.map((c: any) => (
                <div key={c.user_id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${c.errors > 0 ? 'bg-red-400' : 'bg-emerald-400'}`} />
                    <span className="text-xs text-white/70">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-white/40">{c.actions} actions</span>
                    {c.errors > 0 && <span className="text-[10px] text-red-400 font-bold">{c.errors} err</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview banner for agents that need setup — Clara guides */}
      {!(data as any)[Object.keys(data).find(k => k.endsWith('Stats')) || ''] && !['marketing', 'onboarding', 'dm_instagram', 'email', 'content', 'gmaps', 'instagram_comments'].includes(agentId) && !(data as any).supervision?.isAdmin && !(data as any).connections?.instagram && (
        <div className="px-5 pt-3">
          {(() => {
            const previews: Record<string, { label: string; url: string; msg: string }> = {
              seo: { label: 'Renseigner ton site web', url: '#', msg: 'Voici un apercu de ce qu\'Oscar peut faire pour ton SEO. Renseigne ton site web et il analysera tout automatiquement.' },
              ads: { label: 'Connecter Meta Ads', url: '#', msg: 'Voici un apercu de Felix en action. Connecte tes comptes pub et il optimisera ton ROAS automatiquement.' },
              finance: { label: 'Activer le suivi', url: '#', msg: 'Voici un apercu du suivi financier par Louis. Le suivi est actif automatiquement avec ton abonnement.' },
              rh: { label: 'Activer Sara', url: '#', msg: 'Voici un apercu des documents que Sara peut generer : contrats, CGV, RGPD. Active-la pour commencer.' },
              chatbot: { label: 'Installer Max sur ton site', url: '#', msg: 'Voici un apercu des conversations que Max aura avec tes visiteurs. Installe le widget sur ton site pour demarrer.' },
              whatsapp: { label: 'Configurer WhatsApp', url: '#', msg: 'Voici un apercu de Stella en action. Configure ton numero WhatsApp pour activer les reponses automatiques.' },
              tiktok_comments: { label: 'Connecter TikTok', url: '/api/auth/tiktok-oauth', msg: 'Voici un apercu de l\'engagement TikTok par Axel. Connecte TikTok pour activer.' },
              instagram_comments: { label: 'Connecter Instagram', url: '/api/auth/instagram-oauth', msg: 'Voici un apercu des reponses automatiques a tes commentaires Instagram.' },
            };
            const cfg = previews[agentId];
            if (!cfg) return null;
            return <PreviewBanner agentName={agentName} connectLabel={cfg.label} connectUrl={cfg.url} claraMessage={cfg.msg} gradientFrom={gradientFrom} gradientTo={gradientTo} />;
          })()}
        </div>
      )}

      {/* Dashboard content — compact, no scroll needed */}
      <div data-tour="agent-dashboard" className="p-3 sm:p-4">
        <Panel data={data} agentName={agentName} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>
    </div>
  );
}
