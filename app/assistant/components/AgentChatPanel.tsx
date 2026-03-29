'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ClientAgent } from '@/lib/agents/client-context';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// ─── Action card parsing ──────────────────────────────
interface ActionCard {
  type: string;
  label: string;
}

function parseActionCards(content: string): { text: string; actions: ActionCard[]; redirect?: { agent_id: string; reason: string } } {
  const actions: ActionCard[] = [];
  let redirect: { agent_id: string; reason: string } | undefined;

  let text = content.replace(/\[ACTION:([^|]+)\|([^\]]+)\]/g, (_, type, label) => {
    actions.push({ type: type.trim(), label: label.trim() });
    return '';
  });

  // Detect [REDIRECT_AGENT:{"agent_id":"x","reason":"y"}]
  text = text.replace(/\[REDIRECT_AGENT:\s*(\{[^}]+\})\s*\]/g, (_, json) => {
    try { redirect = JSON.parse(json); } catch {}
    return '';
  });

  // Remove [SETTING_UPDATE:...] from displayed text (handled elsewhere)
  text = text.replace(/\[SETTING_UPDATE:\s*\{[^}]+\}\s*\]/g, '');

  // Remove [PDF_READY] [EXCEL_READY] tags
  text = text.replace(/\[(PDF_READY|EXCEL_READY)\]/g, '');

  return { text: text.trim(), actions, redirect };
}

interface AgentChatPanelProps {
  agent: ClientAgent;
  avatarUrl: string | null;
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  onBack: () => void;
  isMobile: boolean;
  comingSoonMode?: boolean;
}

export default function AgentChatPanel({
  agent,
  avatarUrl,
  messages,
  onSendMessage,
  isLoading,
  onBack,
  isMobile,
  comingSoonMode = false,
}: AgentChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [agent.id]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    await onSendMessage(text);
  }, [input, isLoading, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={`flex flex-col bg-[#0a1628] ${
        isMobile
          ? 'fixed inset-0 z-50'
          : 'rounded-2xl border border-white/10 overflow-hidden'
      }`}
      style={isMobile ? undefined : { height: 'min(500px, calc(100vh - 250px))', minHeight: 350 }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{
          background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})`,
        }}
      >
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors flex-shrink-0"
          aria-label="Retour"
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/15">
          {avatarUrl ? (
            <img src={avatarUrl} alt={agent.displayName} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
          ) : (
            <span className="text-lg">{agent.icon}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm leading-tight">{agent.displayName}</h3>
          <p className="text-white/70 text-xs">{agent.title}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-white/60 text-[10px]">En ligne</span>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: `linear-gradient(135deg, ${agent.gradientFrom}40, ${agent.gradientTo}40)` }}
            >
              <span className="text-3xl">{agent.icon}</span>
            </div>
            <h4 className="text-white font-semibold text-sm mb-1">Discute avec {agent.displayName}</h4>
            <p className="text-white/50 text-xs max-w-[260px]">
              {agent.description}
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const { text, actions, redirect } = msg.role === 'assistant'
            ? parseActionCards(msg.content)
            : { text: msg.content, actions: [], redirect: undefined };

          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="max-w-[85%]">
                <div
                  className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-sm'
                      : 'bg-white/10 text-white/90 rounded-bl-sm'
                  }`}
                >
                  {text.split('\n').map((line, j) => (
                    <p key={j} className={j > 0 ? 'mt-1.5' : ''}>
                      {line}
                    </p>
                  ))}
                </div>

                {/* Action cards */}
                {actions.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {actions.map((action, i) => {
                      const isNavigable = action.type === 'generate_image';
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            if (isNavigable) {
                              window.location.href = '/generate';
                            }
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            isNavigable
                              ? 'bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30'
                              : 'bg-white/5 border border-white/10 text-white/50 cursor-default'
                          }`}
                        >
                          {isNavigable ? (
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          <span>{action.label}</span>
                          {!isNavigable && (
                            <span className="ml-auto text-[10px] text-white/30">Bientot</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Redirect to another agent */}
                {redirect && (
                  <button
                    onClick={() => window.location.href = `/assistant/agent/${redirect.agent_id}`}
                    className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 transition-all"
                  >
                    <span>🔀</span>
                    <span>Parler a l&apos;agent specialiste →</span>
                    <span className="ml-auto text-[10px] text-blue-400">{redirect.agent_id}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/10 rounded-xl px-4 py-3 rounded-bl-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Coming soon overlay */}
      {comingSoonMode && (
        <div className="absolute inset-0 z-30 bg-[#0a1628]/90 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 flex items-center justify-center mb-4">
            <span className="text-2xl">{'\u{1F680}'}</span>
          </div>
          <h3 className="text-white font-bold text-base mb-1">Decouvre {agent.displayName}</h3>
          <p className="text-white/50 text-sm mb-4 max-w-[280px]">
            {agent.displayName} et 17 autres agents IA sont prets a automatiser ton business. Essaie gratuitement pendant 14 jours.
          </p>
          <a
            href="/checkout/upsell?plan=createur"
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all mb-2"
          >
            Essai gratuit 14 jours — 0{'\u20AC'}
          </a>
          <p className="text-[10px] text-white/30 mb-3">Carte requise, aucun debit. Annulation en 1 clic.</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-xl transition-colors"
          >
            Retour
          </button>
        </div>
      )}

      {/* Input area */}
      <div className={`border-t border-white/10 bg-[#0f1f3d] p-3 flex-shrink-0 ${isMobile ? 'pb-6' : ''}`}>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message a ${agent.displayName}...`}
            className="flex-1 px-3.5 py-2.5 border border-white/20 rounded-xl text-sm text-white placeholder-white/40 bg-white/5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
            disabled={isLoading || comingSoonMode}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim() || comingSoonMode}
            className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white flex items-center justify-center hover:from-purple-500 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
            aria-label="Envoyer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
