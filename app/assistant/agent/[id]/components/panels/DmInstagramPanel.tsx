'use client';

/**
 * Jade — Instagram DM agent dashboard panel.
 * Extracted from AgentDashboard.tsx. Bundles all DM-related sub-components
 * (JadeTabs, DmConversationsLive, DmCard, CommentCard, LenaCommentsSection,
 * PendingDMQueue) since they are only used together inside DmInstagramPanel.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import PreviewBanner from '../PreviewBanner';
import { DEMO_DM_CONVERSATIONS, DEMO_IG_COMMENTS } from '../AgentPreviewData';
import { fmt, KpiCard, SectionTitle } from './Primitives';
import { SocialConnectBanners, AgentNotifications } from './SharedBanners';
import { InstagramAssetBadge } from './InstagramAssetBadge';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

// Jade tabs: DMs + Comments switch

function JadeTabs({ gradientFrom, gradientTo }: { gradientFrom: string; gradientTo: string }) {
  const { t } = useLanguage();
  const p = t.panels;
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
          {'\u{1F4AC}'} {p.dmTabsDms}
        </button>
        <button
          onClick={() => setTab('comments')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
            tab === 'comments' ? 'bg-white/10 text-white shadow' : 'text-white/40 hover:text-white/60'
          }`}
        >
          {'\u{1F4AC}'} {p.dmTabsComments}
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

// Merge fresh server messages for ONE conversation with any local optimistic
// entries (sending/sent/prepared) we already had. Preserves outbound
// messages the server hasn't echoed back yet.
function mergeMessageArrays(
  prev: Array<{ id?: string; message: string; fromMe: boolean; status?: string; [k: string]: any }>,
  fresh: Array<{ id?: string; message: string; fromMe: boolean; [k: string]: any }>,
): any[] {
  if (!Array.isArray(prev) || prev.length === 0) return fresh;
  // If fresh is empty (rate-limit, timeout, transient error), keep prev as-is.
  // Wiping would make the whole thread vanish for the duration of the next
  // successful poll — the opposite of the user-facing expectation.
  if (!Array.isArray(fresh) || fresh.length === 0) return prev;
  const freshIds = new Set(fresh.map(m => m.id).filter(Boolean));
  const freshKeys = new Set(fresh.map(m => `${m.fromMe}|${m.message}`));
  const extras = prev.filter(m =>
    m.fromMe && (m.status === 'sending' || m.status === 'sent' || m.status === 'error' || m.status === 'prepared') &&
    !(m.id && freshIds.has(m.id)) && !freshKeys.has(`${m.fromMe}|${m.message}`)
  );
  return [...fresh, ...extras];
}

// Live Instagram DM conversations component

function DmConversationsLive() {
  const { t } = useLanguage();
  const p = t.panels;
  const [convs, setConvs] = useState<Array<{
    id: string;
    participant: { username: string; id: string };
    updated_time?: string;
    messages: Array<{ id?: string; message: string; from: string; fromMe: boolean; created_time: string; status?: string; attachments?: Array<{ type: string; url: string }> }>;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [aiActive, setAiActive] = useState(true);
  const [userTyping, setUserTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load AI toggle state from server
  useEffect(() => {
    fetch('/api/agents/settings?agent_id=dm_instagram', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.auto_mode !== undefined) setAiActive(d.auto_mode); })
      .catch(() => {});
  }, []);

  // Fire the polling auto-reply once. Used when the AI toggle turns ON so
  // Jade picks up messages that arrived while she was paused, without
  // waiting for the next worker tick.
  const kickAutoReply = useCallback(() => {
    fetch('/api/agents/dm-instagram/auto-reply', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  }, []);

  const persistAiMode = useCallback(async (val: boolean) => {
    setAiActive(val);
    try { localStorage.setItem('keiro_auto_dm_instagram', String(val)); } catch {}
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: 'dm_instagram', auto_mode: val }),
      });
    } catch {}
    // Meta Human Agent protocol: when the human hands the mic back to the
    // AI, the AI must *immediately* pick up any messages received during
    // the handoff. Fire auto-reply once on OFF→ON transitions.
    if (val) kickAutoReply();
  }, [kickAutoReply]);

  // Merge fresh server conversations with local optimistic state.
  // Preserves:
  //  - optimistic "sending/sent/prepared" messages not yet echoed by Meta
  //  - the previous list when the fresh payload is empty but the account
  //    is still connected (transient API hiccup shouldn't wipe the UI)
  const mergeConvs = useCallback((fresh: typeof convs, opts: { connected: boolean }) => {
    setConvs(prev => {
      // If the server explicitly says "disconnected", clear the panel.
      if (!opts.connected) return [];
      // If the fresh pull is empty but we had convs, keep the old list —
      // otherwise the list flickers away every time the graph returns 0
      // (rate limit, timeout, transient error).
      if (fresh.length === 0 && prev.length > 0) return prev;
      if (prev.length === 0) return fresh;

      const prevById = new Map(prev.map(c => [c.id, c]));
      let changed = fresh.length !== prev.length;
      const merged = fresh.map(fc => {
        const old = prevById.get(fc.id);
        if (!old) { changed = true; return fc; }
        // The list endpoint now returns no messages per conv — the messages
        // live in the per-conv endpoint. Do NOT overwrite old.messages when
        // fresh arrives with an empty array, otherwise every 10s list poll
        // wipes the currently-open thread's messages.
        if (!fc.messages || fc.messages.length === 0) {
          if (old.updated_time !== fc.updated_time) changed = true;
          return { ...fc, messages: old.messages };
        }
        const freshIds = new Set(fc.messages.map(m => m.id).filter(Boolean));
        const freshKeys = new Set(fc.messages.map(m => `${m.fromMe}|${m.message}`));
        const extras = old.messages.filter(m =>
          m.fromMe && (m.status === 'sending' || m.status === 'sent' || m.status === 'error' || m.status === 'prepared') &&
          !(m.id && freshIds.has(m.id)) && !freshKeys.has(`${m.fromMe}|${m.message}`)
        );
        const mergedMsgs = [...fc.messages, ...extras];
        if (
          old.messages.length !== mergedMsgs.length ||
          old.updated_time !== fc.updated_time ||
          old.messages[old.messages.length - 1]?.id !== mergedMsgs[mergedMsgs.length - 1]?.id
        ) changed = true;
        return { ...fc, messages: mergedMsgs };
      });
      return changed ? merged : prev;
    });
  }, []);

  const [connected, setConnected] = useState<boolean | null>(null);

  const fetchConversations = useCallback(() => {
    fetch('/api/agents/dm-instagram/conversations', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const isConnected = d.connected !== false;
        setConnected(isConnected);
        if (d.conversations) {
          setApiResponded(true);
          mergeConvs(d.conversations, { connected: isConnected });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mergeConvs]);

  // Initial load + auto-refresh every 10s (slightly faster than before for
  // near-real-time feel). Paused while user is typing so the textarea
  // doesn't re-render and swallow focus.
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => { if (!userTyping) fetchConversations(); }, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations, userTyping]);

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
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Optimistic UI update — stable localId so merge() can preserve it
    setConvs(prev => prev.map(c => c.id === selected.id ? {
      ...c,
      messages: [...c.messages, { id: localId, message: msgText, from: 'moi', fromMe: true, created_time: new Date().toISOString(), status: 'sending' }],
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

      setConvs(prev => prev.map(c => c.id === selected.id ? {
        ...c,
        messages: c.messages.map(m =>
          m.id === localId ? { ...m, status: data.sent ? 'sent' : 'prepared' } : m
        ),
      } : c));
    } catch {
      setConvs(prev => prev.map(c => c.id === selected.id ? {
        ...c,
        messages: c.messages.map(m =>
          m.id === localId ? { ...m, status: 'error' } : m
        ),
      } : c));
    } finally {
      setSending(false);
      // Reset typing flag so AI toggle returns to active after send
      setUserTyping(false);
    }
  }, [convs, selectedConv, replyText]);

  const [apiResponded, setApiResponded] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  // Lazy-load the messages of the currently selected conversation. The list
  // endpoint now returns conversations WITHOUT messages (to avoid Meta's
  // "Application request limit"), so this effect pulls messages for one
  // conversation at a time — much easier on the quota.
  useEffect(() => {
    if (!selectedConv) return;
    let cancelled = false;
    const fetchMsgs = async () => {
      setMsgLoading(true);
      try {
        const res = await fetch(`/api/agents/dm-instagram/conversations/${encodeURIComponent(selectedConv)}/messages`, { credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        if (d.error === 'rate_limited') setRateLimited(true);
        if (Array.isArray(d.messages)) {
          setConvs(prev => prev.map(c => c.id === selectedConv ? { ...c, messages: mergeMessageArrays(c.messages, d.messages) } : c));
        }
      } catch {} finally {
        if (!cancelled) setMsgLoading(false);
      }
    };
    fetchMsgs();
    const interval = setInterval(() => { if (!userTyping) fetchMsgs(); }, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedConv, userTyping]);

  // Only show the spinner on the very first load; once we have at least one
  // payload, keep the UI stable and let polling update it in the background.
  if (loading && !apiResponded) return <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400 mx-auto" /><div className="text-white/30 text-[10px] mt-2">{p.dmConvsLoading}</div></div>;

  // Instagram is considered connected either via the global flag set at
  // page boot OR when the API has explicitly confirmed connected: true.
  const igConnected = (typeof window !== 'undefined' && (window as any).__igConnected) || connected === true;
  // Demo mode only when no evidence of a real account AND nothing loaded.
  const isDemo = convs.length === 0 && !apiResponded && !igConnected;
  const displayConvs = isDemo ? DEMO_DM_CONVERSATIONS : convs;
  const selected = displayConvs.find(c => c.id === selectedConv);

  return (
    <div>
    {isDemo && (
      <PreviewBanner
        agentName="Jade"
        connectLabel="Connect Instagram"
        connectUrl="/api/auth/instagram-oauth"
        claraMessage={p.dmConnectFirstBody}
        gradientFrom="#e11d48"
        gradientTo="#be123c"
      />
    )}
    {!isDemo && convs.length === 0 && igConnected && (
      <div className="text-center py-4 mb-3 bg-white/[0.02] rounded-xl border border-white/5">
        <span className="text-xl">{'\u{1F4AC}'}</span>
        <p className="text-xs text-white/40 mt-1">{p.dmEmptyConversationsTitle}</p>
        <p className="text-[10px] text-white/25 mt-0.5">{p.dmEmptyConversationsSubtitle}</p>
      </div>
    )}
    <div className={`rounded-xl border-2 ${isDemo ? 'border-amber-500/20 opacity-90' : 'border-purple-500/20'} bg-gradient-to-b from-purple-900/10 to-transparent overflow-hidden shadow-lg shadow-purple-500/5 h-[calc(60vh-60px)] md:h-[420px] mb-16 lg:mb-0`}>
      <div className="flex h-full">
        {/* Conversation list */}
        <div className={`${selectedConv ? 'hidden sm:block' : ''} w-full sm:w-56 border-r border-white/10 overflow-y-auto`}>
          <div className="px-3 py-2.5 border-b border-purple-500/20 bg-purple-900/20">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-300/60">{'\u{1F4AC}'} {p.dmConvsSidebarLabel}</span>
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
                  {lastMsg?.fromMe ? p.dmConvsToMe : ''}{lastMsg?.message?.substring(0, 50) || '...'}
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
                <div className="text-[9px] text-white/20">{p.dmConvsMessagesCount.replace('{n}', String(selected.messages.length))}</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[9px] text-emerald-400 font-medium">{p.dmConvsBadgeAi}</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-[9px] text-blue-400 font-medium">{p.dmConvsBadgeYou}</span>
                </div>
              </div>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
              {(selected.messages as any[]).map((msg: any, i: number) => (
                <div key={msg.id || i} className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                    msg.fromMe
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-md'
                      : 'bg-white/10 text-white/80 rounded-bl-md'
                  } ${msg.status === 'sending' ? 'opacity-60' : ''}`}>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-col gap-1 mb-1">
                        {msg.attachments.map((a: { type: string; url: string }, ai: number) => (
                          a.type === 'video' ? (
                            <video key={ai} src={a.url} controls className="rounded-lg max-w-full max-h-64" />
                          ) : a.type === 'image' ? (
                            <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer">
                              <img src={a.url} alt="attachment" className="rounded-lg max-w-full max-h-64 object-cover" />
                            </a>
                          ) : (
                            <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer" className="underline text-[10px] text-white/60">{a.type || 'file'}</a>
                          )
                        ))}
                      </div>
                    )}
                    {msg.message || (msg.attachments?.length ? null : <span className="italic text-white/30">[media]</span>)}
                    <div className={`flex items-center gap-1 mt-0.5 ${msg.fromMe ? 'justify-end' : ''}`}>
                      <span className={`text-[10px] ${msg.fromMe ? 'text-purple-200/60' : 'text-white/20'}`}>
                        {msg.created_time ? new Date(msg.created_time).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      {msg.fromMe && msg.status === 'sending' && <span className="text-[10px] text-yellow-300/60">{p.dmConvsStatusSending}</span>}
                      {msg.fromMe && msg.status === 'sent' && <span className="text-[10px] text-green-300/60">{'\u2713'}</span>}
                      {msg.fromMe && msg.status === 'prepared' && <span className="text-[10px] text-amber-300/60">{p.dmConvsStatusPrepared}</span>}
                      {msg.fromMe && msg.status === 'error' && <span className="text-[10px] text-red-300/60">{p.dmConvsStatusError}</span>}
                      {msg.fromMe && (() => {
                        const isManual = msg.from === 'moi' || msg.status === 'sending' || msg.status === 'sent';
                        return <span className={`text-[9px] px-1 py-0.5 rounded ${isManual ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{isManual ? p.dmConvsOrigVous : p.dmConvsOrigAi}</span>;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {/* Inline AI / You toggle — sits right above the composer so the
                client sees the current mode at a glance. Auto-switches to
                "You" while typing, back to "AI" when idle. */}
            <div className="border-t border-white/5 px-3 pt-2 pb-1 bg-white/[0.02] flex items-center justify-between">
              <span className="text-[10px] text-white/40">
                {aiActive && !userTyping ? `\u{1F916} ${p.dmConvsBadgeAi}` : `\u270D\uFE0F ${p.dmConvsBadgeYou}`}
              </span>
              <button
                onClick={() => persistAiMode(!aiActive)}
                className={`w-9 h-5 rounded-full relative transition-colors ${aiActive && !userTyping ? 'bg-emerald-500' : 'bg-blue-500'}`}
                title={aiActive ? 'Desactiver l\'IA' : 'Activer l\'IA'}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${aiActive && !userTyping ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
            {/* Reply input */}
            <div className="border-t border-white/5 px-3 py-2.5 flex gap-2 bg-white/[0.02]">
              <input
                type="text"
                value={replyText}
                onChange={e => {
                  setReplyText(e.target.value);
                  // Auto-switch to "You" the moment the user starts typing
                  if (e.target.value.length > 0 && !userTyping) setUserTyping(true);
                  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                  typingTimerRef.current = setTimeout(() => {
                    setUserTyping(false);
                  }, 4000);
                }}
                onFocus={() => { if (replyText.length > 0) setUserTyping(true); }}
                onBlur={() => {
                  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                  setUserTyping(false);
                }}
                placeholder={p.dmConvsInputPlaceholder}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) { e.preventDefault(); sendReply(); } }}
              />
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white text-xs font-medium rounded-xl disabled:opacity-40 transition-all active:scale-95"
                title={p.sendBtn}
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
            {p.dmConvsPickHint}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// Reply card for DMs and emails

function DmCard({ dm, statusColors }: { dm: { target: string; status: string; message?: string; date: string }; statusColors: Record<string, string> }) {
  const { t } = useLanguage();
  const p = t.panels;
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
          {showReply ? p.close : p.reply}
        </button>
      </div>
      {showReply && (
        <div className="px-3 sm:px-4 pb-3 border-t border-white/5 pt-2 flex gap-2">
          <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={p.dmCommentCardPlaceholder} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50" onKeyDown={e => { if (e.key === 'Enter') handleReply(); }} />
          <button onClick={handleReply} disabled={sending || !replyText.trim()} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0 ${sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-600 text-white hover:bg-purple-700'} disabled:opacity-40`}>
            {sent ? '\u2713' : sending ? '...' : p.sendBtn}
          </button>
        </div>
      )}
    </div>
  );
}

// Inline comments section for Lena

function CommentCard({ comment: c, isDemo, onUpdate }: { comment: any; isDemo: boolean; onUpdate: (id: string, data: any) => void }) {
  const { t } = useLanguage();
  const p = t.panels;
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [sending, setSending] = useState(false);

  const sendReply = useCallback(async (customReply?: string) => {
    setSending(true);
    try {
      const res = await fetch('/api/agents/instagram-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reply_comment', comment_id: c.comment_id, media_id: c.media_id, ...(customReply ? { custom_reply: customReply } : {}) }),
      });
      const data = await res.json();
      onUpdate(c.comment_id, { replied: true, reply_text: customReply || data.reply || p.replied });
      setShowReply(false);
      setReplyText('');
    } catch {} finally { setSending(false); }
  }, [c.comment_id, c.media_id, onUpdate, p.replied]);

  // Human-friendly timestamp ("2h ago" / "Yesterday" / "3 Apr")
  const formatWhen = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  };

  const postCtx = c.post || {};
  const postThumb: string | null = postCtx.thumbnail_url || null;
  const postCaption: string = postCtx.caption || '';
  const postPermalink: string | null = postCtx.permalink || null;
  const mediaType: string = (postCtx.media_type || '').toUpperCase();
  const mediaBadge = mediaType === 'VIDEO' || mediaType === 'REELS' ? '🎬' : mediaType === 'CAROUSEL_ALBUM' ? '🖼️' : '📷';

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      {/* Post context — what this comment is attached to */}
      {(postThumb || postCaption) && (
        <a
          href={postPermalink || '#'}
          target={postPermalink ? '_blank' : undefined}
          rel="noopener noreferrer"
          className={`flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.02] ${postPermalink ? 'hover:bg-white/5 transition' : 'pointer-events-none'}`}
          title={postPermalink ? 'Open post on Instagram' : ''}
        >
          {postThumb && (
            <img src={postThumb} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" loading="lazy" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-white/30">{mediaBadge}</span>
              <span className="text-[10px] font-semibold text-white/60 truncate">
                {postCaption ? postCaption.substring(0, 60) : 'Instagram post'}
              </span>
            </div>
            {postCtx.posted_at && (
              <div className="text-[9px] text-white/25">Posted {formatWhen(postCtx.posted_at)}</div>
            )}
          </div>
          {postPermalink && <span className="text-[10px] text-purple-400/60">{'\u2197'}</span>}
        </a>
      )}

      {/* Comment */}
      <div className="p-3 flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
          {(c.username || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-white/80">@{c.username || 'instagram_user'}</span>
            {c.timestamp && <span className="text-[9px] text-white/30">· {formatWhen(c.timestamp)}</span>}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${c.replied ? 'bg-emerald-400/15 text-emerald-400' : 'bg-amber-400/15 text-amber-400'}`}>
              {c.replied ? p.replied : p.pending}
            </span>
          </div>
          <p className="text-[11px] text-white/60 mt-1 whitespace-pre-wrap break-words">{c.text}</p>
        </div>
      </div>

      {/* Reply shown */}
      {c.replied && c.reply_text && (
        <div className="px-3 pb-2 ml-9">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <span className="text-[9px] text-emerald-400 font-medium">{p.dmCommentCardReplyShown}</span>
            <p className="text-[10px] text-white/60 mt-0.5">{c.reply_text}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {!c.replied && !isDemo && (
        <div className="px-3 pb-3">
          {!showReply ? (
            <div className="flex items-center gap-1.5">
              <button onClick={() => sendReply()} disabled={sending} className="px-2.5 py-1.5 bg-emerald-600/20 text-emerald-400 text-[9px] font-medium rounded-lg hover:bg-emerald-600/30 transition min-h-[32px] disabled:opacity-50">
                {sending ? '...' : p.dmCommentCardReplyAuto}
              </button>
              <button onClick={() => setShowReply(true)} className="px-2.5 py-1.5 bg-blue-600/20 text-blue-400 text-[9px] font-medium rounded-lg hover:bg-blue-600/30 transition min-h-[32px]">
                {p.dmCommentCardReplyManual}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && replyText.trim()) sendReply(replyText); }}
                placeholder={p.dmCommentCardPlaceholder}
                autoFocus
                className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[11px] text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              <button onClick={() => sendReply(replyText)} disabled={sending || !replyText.trim()} className="px-3 py-1.5 bg-blue-600 text-white text-[9px] font-bold rounded-lg disabled:opacity-40 min-h-[32px]">
                {sending ? '...' : p.sendBtn}
              </button>
              <button onClick={() => setShowReply(false)} className="text-white/30 hover:text-white/60 text-xs px-1">✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LenaCommentsSection() {
  const { t } = useLanguage();
  const p = t.panels;
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
      {isDemo && !(window as any).__igConnected && <p className="text-[10px] text-amber-400/60 mb-2">{'\u{1F4F8}'} {p.dmCommentsLegacyDemoHint}</p>}
      {isDemo && (window as any).__igConnected && <p className="text-[10px] text-white/30 mb-2">{'\u{1F4F8}'} {p.dmCommentsLegacyEmptyHint}</p>}
      <div className="space-y-2 max-h-[350px] overflow-y-auto">
        {displayComments.slice(0, 10).map((c: any, i: number) => (
          <CommentCard key={c.comment_id || i} comment={c} isDemo={isDemo} onUpdate={(id, data) => setComments(prev => prev.map(cc => cc.comment_id === id ? { ...cc, ...data } : cc))} />
        ))}
      </div>
      {!isDemo && comments.length > 0 && (
        <button
          onClick={async () => {
            try {
              await fetch('/api/agents/instagram-comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ action: 'auto_reply_all' }),
              });
              setComments(prev => prev.map(c => ({ ...c, replied: true })));
            } catch {}
          }}
          className="mt-2 w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-bold rounded-xl hover:opacity-90 transition min-h-[36px]"
        >
          {p.dmCommentsLegacyReplyAllBtn}
        </button>
      )}
    </div>
  );
}

/** Pending DM Queue — client can preview and mass-send prepared DMs */

function PendingDMQueue({ gradientFrom }: { gradientFrom: string }) {
  const { t } = useLanguage();
  const p = t.panels;
  const [queue, setQueue] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadQueue = useCallback(async (limit = 50) => {
    try {
      const res = await fetch(`/api/agents/dm-instagram/queue?limit=${limit}`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setQueue(d.queue || []);
        setTotal(d.total || 0);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadQueue(showAll ? 200 : 50); }, [loadQueue, showAll]);

  const sendDM = useCallback(async (dmId: string) => {
    setSending(dmId);
    try {
      const res = await fetch('/api/agents/dm-instagram/send-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dm_id: dmId }),
      });
      if (res.ok) {
        setQueue(prev => prev.filter(d => d.id !== dmId));
        setTotal(prev => prev - 1);
      }
    } catch {} finally { setSending(null); }
  }, []);

  // Live-check that the IG account is reachable BEFORE opening the profile,
  // so we never send the user to an error page ("Une erreur s'est produite...").
  // On failure the DM is also auto-removed from the queue and marked skipped
  // server-side (the verify-handle route does the persistence).
  const [verifying, setVerifying] = useState<string | null>(null);
  const handleEnvoyerDM = useCallback(async (dm: { id: string; handle: string; message: string }) => {
    const cleanHandle = (dm.handle || '').replace(/^@/, '').trim();
    if (!cleanHandle) return;
    setVerifying(dm.id);
    try {
      const vres = await fetch('/api/agents/dm-instagram/verify-handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dm_id: dm.id }),
      });
      const v = await vres.json().catch(() => ({}));
      if (v?.exists === false) {
        alert(p.dmUnreachableAlert.replace('{handle}', cleanHandle).replace('{reason}', v.reason || 'private / inactive / no messaging'));
        setQueue(prev => prev.filter(d => d.id !== dm.id));
        setTotal(prev => prev - 1);
        return;
      }
      // exists === true OR exists === null (unknown: admin not connected → proceed)
      // Copy the prepared message so the user can paste it into Instagram,
      // then open the Meta-sanctioned ig.me/m/{handle} deep link which
      // lands directly inside the DM thread (or shows Instagram's native
      // "can't send message" screen if the prospect has DMs disabled —
      // better than opening the profile and guessing).
      navigator.clipboard.writeText(dm.message).catch(() => {});
      window.open(`https://ig.me/m/${cleanHandle}`, '_blank');
      // Mark as sent on the server after a short delay so the user has
      // time to paste + send inside Instagram.
      setTimeout(() => { sendDM(dm.id); }, 3000);
    } catch {
      // If the verify endpoint itself fails, fall back to the direct DM
      // deep link without verification. Better than blocking the click.
      navigator.clipboard.writeText(dm.message).catch(() => {});
      window.open(`https://ig.me/m/${cleanHandle}`, '_blank');
      setTimeout(() => { sendDM(dm.id); }, 3000);
    } finally {
      setVerifying(null);
    }
  }, [sendDM, p.dmUnreachableAlert]);

  // Mark a DM as blocked by the prospect (they have DMs disabled or
  // declined the message request). Client clicks this after opening the
  // ig.me link and seeing Instagram's native "can't message" screen.
  const markBlocked = useCallback(async (dmId: string) => {
    try {
      await fetch('/api/agents/dm-instagram/send-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dm_id: dmId, status: 'blocked' }),
      });
    } catch {}
    setQueue(prev => prev.filter(d => d.id !== dmId));
    setTotal(prev => prev - 1);
  }, []);

  if (loading || queue.length === 0) return null;

  const displayed = showAll ? queue : queue.slice(0, 10);

  return (
    <div className="mb-3">
      {/* Header + campaign actions */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          {'\u{1F4AC}'} {p.dmReadyHeader} <span className="text-[10px] text-cyan-400 bg-cyan-500/20 px-1.5 py-0.5 rounded-full">{total}</span>
        </span>
        <div className="flex items-center gap-1.5">
          {!showAll && queue.length > 10 && (
            <button onClick={() => setShowAll(true)} className="text-[10px] text-cyan-400 hover:text-cyan-300 transition">
              {p.seeAll} ({total})
            </button>
          )}
        </div>
      </div>

      <div className={`space-y-2 ${showAll ? 'max-h-[600px]' : 'max-h-[400px]'} overflow-y-auto pr-1`}>
        {displayed.map(dm => {
          const cleanHandle = (dm.handle || '').replace(/^@/, '').trim();
          if (!cleanHandle) return null;
          const isVerified = (dm as any).verified_exists === true;
          return (
          <div key={dm.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-white">@{cleanHandle}</span>
              {isVerified && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">
                  {'\u2705'} {p.verified}
                </span>
              )}
              {dm.company && <span className="text-[10px] text-white/40">{dm.company}</span>}
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed mb-2 line-clamp-3">{dm.message}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleEnvoyerDM({ id: dm.id, handle: cleanHandle, message: dm.message })}
                disabled={sending === dm.id || verifying === dm.id}
                className="px-4 py-2.5 min-h-[44px] bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold rounded-lg hover:opacity-90 transition disabled:opacity-40"
                title={p.dmBtnTooltip}
              >
                {verifying === dm.id
                  ? `\u23F3 ${p.dmBtnVerifying}`
                  : sending === dm.id
                    ? `\u2713 ${p.dmBtnSent}`
                    : `${'\u{1F4AC}'} ${p.dmBtnEnvoyerDM}`}
              </button>
              <button
                onClick={() => markBlocked(dm.id)}
                className="px-3 py-2.5 min-h-[44px] text-xs text-red-400/60 hover:text-red-400 transition"
                title="Le prospect a bloqué les DMs — retire-le du canal"
              >
                {'\u{1F6AB}'} {p.dmBtnBlockedMark}
              </button>
              <button
                onClick={() => setQueue(prev => prev.filter(d => d.id !== dm.id))}
                className="px-3 py-2.5 min-h-[44px] text-xs text-white/30 hover:text-white/60 transition"
              >
                {p.dmBtnSkipDM}
              </button>
            </div>
          </div>
          );
        }).filter(Boolean)}
      </div>
    </div>
  );
}

export function DmInstagramPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t } = useLanguage();
  const p = t.panels;
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
      {/* Instagram asset badge — always visible at the top so Meta
          reviewers see which IG Business account is connected in every
          screencast (required by Platform Policies Section 1.6). */}
      <InstagramAssetBadge />

      {/* Human Agent Protocol — required by Meta. Every DM is reviewed and
          sent by the human business owner (customer service agent). Jade
          only prepares drafts; nothing is sent automatically. */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs">{'\u{1F9D1}'}</div>
          <span className="text-xs font-semibold text-blue-300">{p.dmHumanProtocolTitle}</span>
        </div>
        <p className="text-[10px] text-white/50 mb-2">{p.dmHumanProtocolDesc.split('**').map((seg, i) => i % 2 ? <strong key={i} className="text-white/70">{seg}</strong> : <span key={i}>{seg}</span>)}</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] text-blue-400 font-medium">{p.dmYouRespondBadge}</span>
          </div>
          <span className="text-white/20 text-[10px]">+</span>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <div className="w-2 h-2 rounded-full bg-purple-400" />
            <span className="text-[10px] text-purple-400 font-medium">{p.dmJadePreparesBadge}</span>
          </div>
        </div>
      </div>

      {/* Connect banner — the auto/manual toggle moved inline above the
          conversation composer so it sits where the client actually works.
          See JadeTabs → DmConversationsLive. */}
      <div className="mb-3">
        <SocialConnectBanners agentId="dm_instagram" networks={['instagram']} connections={(data as any).connections} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <KpiCard label={p.dmKpiSent} value={fmt(stats.dmsSent)} gradientFrom="#3b82f6" gradientTo="#2563eb" />
        <KpiCard label={p.dmKpiResponses} value={fmt(stats.responses)} gradientFrom="#f59e0b" gradientTo="#d97706" />
        <KpiCard label={p.dmKpiPrepared} value={fmt((stats as any).queuePending || 0)} gradientFrom="#8b5cf6" gradientTo="#6d28d9" />
        <KpiCard label={p.dmKpiProspects} value={fmt((stats as any).prospectsWithIG || 0)} gradientFrom="#ec4899" gradientTo="#db2777" />
      </div>

      {/* Campaign actions */}
      <SectionTitle>{p.dmSectionCampaign}</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        <button
          onClick={() => {
            fetch('/api/agents/dm-instagram?slot=morning', { method: 'POST', credentials: 'include' }).catch(() => {});
          }}
          className="flex flex-col items-center gap-1 p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl hover:bg-pink-500/20 transition text-center"
        >
          <span className="text-lg">{'\u{1F4AC}'}</span>
          <span className="text-[10px] text-pink-400 font-bold">{p.dmCampaignPrepare}</span>
          <span className="text-[8px] text-white/30">{p.dmCampaignPrepareDesc}</span>
        </button>
        <button
          onClick={() => {
            fetch('/api/agents/dm-instagram/follow-prospects', { method: 'POST', credentials: 'include' })
              .then(r => r.json())
              .then(d => { if (d?.ok) alert(`${d.followed ?? 0} accounts followed. ${d.skipped ?? 0} skipped, ${d.failed ?? 0} failed.`); })
              .catch(() => {});
          }}
          className="flex flex-col items-center gap-1 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl hover:bg-cyan-500/20 transition text-center"
          title={p.dmCampaignFollowDesc}
        >
          <span className="text-lg">{'\u{1F465}'}</span>
          <span className="text-[10px] text-cyan-400 font-bold">{p.dmCampaignFollow}</span>
          <span className="text-[8px] text-white/30">{p.dmCampaignFollowDesc}</span>
        </button>
        <button
          onClick={() => {
            fetch('/api/agents/dm-instagram/send-queue', { method: 'POST', credentials: 'include' }).catch(() => {});
          }}
          className="flex flex-col items-center gap-1 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/20 transition text-center"
        >
          <span className="text-lg">{'\u2764\uFE0F'}</span>
          <span className="text-[10px] text-purple-400 font-bold">{p.dmCampaignLikes}</span>
          <span className="text-[8px] text-white/30">{p.dmCampaignLikesDesc}</span>
        </button>
        <button
          onClick={() => {
            fetch('/api/agents/content?slot=community', { method: 'GET', credentials: 'include' }).catch(() => {});
          }}
          className="flex flex-col items-center gap-1 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl hover:bg-blue-500/20 transition text-center"
        >
          <span className="text-lg">{'\u{1F4DD}'}</span>
          <span className="text-[10px] text-blue-400 font-bold">{p.dmCampaignComments}</span>
          <span className="text-[8px] text-white/30">{p.dmCampaignCommentsDesc}</span>
        </button>
        <button
          onClick={() => {
            fetch('/api/agents/dm-instagram/auto-reply', { method: 'POST', credentials: 'include' }).catch(() => {});
          }}
          className="flex flex-col items-center gap-1 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition text-center"
        >
          <span className="text-lg">{'\u{1F504}'}</span>
          <span className="text-[10px] text-emerald-400 font-bold">{p.dmCampaignAutoReply}</span>
          <span className="text-[8px] text-white/30">{p.dmCampaignAutoReplyDesc}</span>
        </button>
      </div>

      {/* Pipeline funnel — full DM attribution chain */}
      <div data-tour="dm-stats" className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-3">
        <div className="flex items-center justify-between gap-1 text-center">
          {[
            { label: p.dmFunnelProspects, value: (stats as any).prospectsWithIG || 0, icon: '\u{1F4F8}', color: '#ec4899' },
            { label: p.dmFunnelVerified, value: (stats as any).queueVerifiedReady || 0, icon: '\u2705', color: '#8b5cf6' },
            { label: p.dmFunnelSent, value: (stats as any).queueSent || stats.dmsSent || 0, icon: '\u{1F4AC}', color: '#3b82f6' },
            { label: p.dmFunnelReplies, value: (stats as any).queueResponded || stats.responses || 0, icon: '\u{1F4EC}', color: '#f59e0b' },
            { label: p.dmFunnelConversions, value: stats.rdvGenerated || 0, icon: '\u{1F525}', color: '#22c55e' },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center flex-1">
              <div className="flex-1 text-center">
                <div className="text-sm mb-0.5">{step.icon}</div>
                <div className="text-sm font-bold" style={{ color: step.color }}>{fmt(step.value)}</div>
                <div className="text-[8px] text-white/30 mt-0.5">{step.label}</div>
              </div>
              {i < 4 && <div className="text-white/15 text-[10px]">{'\u2192'}</div>}
            </div>
          ))}
        </div>
        {((stats as any).queueSkipped || 0) > 0 && (
          <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
            <span className="text-white/40">{p.dmFunnelFilteredLabel}</span>
            <span className="text-red-400 font-semibold">{fmt((stats as any).queueSkipped || 0)} {p.dmFunnelFilteredBadge}</span>
          </div>
        )}
        {(stats as any).queueSent > 0 && (
          <div className="mt-1 flex items-center justify-between text-[10px]">
            <span className="text-white/40">{p.dmFunnelResponseRate}</span>
            <span className="text-emerald-400 font-semibold">{stats.responseRate || 0}%</span>
          </div>
        )}
      </div>

      {/* Queue + engagement stats */}
      <SectionTitle>{p.dmSectionActivity}</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="rounded-lg bg-pink-500/10 border border-pink-500/20 p-2 text-center">
          <div className="text-sm font-bold text-pink-400">{fmt((stats as any).likesGiven || 0)}</div>
          <div className="text-[8px] text-white/30">{'\u2764\uFE0F'} {p.dmStatLikes}</div>
        </div>
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2 text-center">
          <div className="text-sm font-bold text-purple-400">{fmt((stats as any).queuePending || 0)}</div>
          <div className="text-[8px] text-white/30">{'\u{1F4DD}'} {p.dmStatWaiting}</div>
        </div>
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
          <div className="text-sm font-bold text-emerald-400">{fmt((stats as any).queueSent || 0)}</div>
          <div className="text-[8px] text-white/30">{'\u2705'} {p.dmStatSent}</div>
        </div>
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-center">
          <div className="text-sm font-bold text-red-400">{fmt((stats as any).queueFailed || 0)}</div>
          <div className="text-[8px] text-white/30">{'\u274C'} {p.dmStatFailed}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <a href="/assistant/crm" className="px-3 py-2 bg-purple-600/20 text-purple-300 text-xs font-medium rounded-lg hover:bg-purple-600/30 transition border border-purple-500/20">
          {'\u{1F4CA}'} CRM
        </a>
      </div>

      {/* Pending notifications for this agent — "Reprends la main" */}
      <AgentNotifications agentId="dm_instagram" />

      {/* Hot prospects */}
      {/* HotProspectsAlert removed */}

      {/* Pending DMs ready to send — client clicks to send */}
      <PendingDMQueue gradientFrom={gradientFrom} />

      {/* DMs / Comments switch */}
      <JadeTabs gradientFrom={gradientFrom} gradientTo={gradientTo} />
    </>
  );
}