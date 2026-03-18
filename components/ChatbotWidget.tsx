'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X, Send } from 'lucide-react';
import { getReengagementMessage } from '@/lib/agents/chatbot-detection';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function ChatbotWidget() {
  const pathname = usePathname();

  // ─── State ─────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState('');
  const [timeOnSite, setTimeOnSite] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [reengagementShown, setReengagementShown] = useState(false);
  const [utmSource, setUtmSource] = useState('');
  const [hasShownInitial, setHasShownInitial] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(false);
  const [pageEnteredAt, setPageEnteredAt] = useState(Date.now());

  // ─── Refs ──────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pagesVisitedRef = useRef<Set<string>>(new Set());
  const timeOnSiteRef = useRef(0);
  const reengagementShownRef = useRef(false);

  // ─── Hide on admin/login pages ─────────────────────────
  const shouldHide = pathname?.startsWith('/admin') || pathname?.startsWith('/login') || pathname?.startsWith('/generate');

  // ─── Initialize visitor ID and UTM source ──────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let storedId = localStorage.getItem('keiro_visitor_id');
    if (!storedId) {
      storedId = generateUUID();
      localStorage.setItem('keiro_visitor_id', storedId);
    }
    setVisitorId(storedId);

    const params = new URLSearchParams(window.location.search);
    const source = params.get('utm_source') || '';
    setUtmSource(source);
  }, []);

  // ─── Track pages visited + reset page timer ─────────────
  useEffect(() => {
    if (pathname) {
      pagesVisitedRef.current.add(pathname);
      setPageEnteredAt(Date.now());
    }
  }, [pathname]);

  // ─── Time on site counter ─────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOnSite((prev) => {
        const next = prev + 1;
        timeOnSiteRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── Re-engagement logic ──────────────────────────────
  useEffect(() => {
    if (shouldHide) return;

    const interval = setInterval(() => {
      if (hasInteracted || reengagementShownRef.current) return;

      // Use time on CURRENT PAGE, not total site time
      const timeOnCurrentPage = Math.floor((Date.now() - pageEnteredAt) / 1000);

      const msg = getReengagementMessage(
        pathname || '/',
        timeOnCurrentPage,
        hasInteracted
      );

      if (msg) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: msg, timestamp: new Date().toISOString() },
        ]);
        setIsOpen(true);
        setReengagementShown(true);
        reengagementShownRef.current = true;
        setPulseAnimation(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pathname, hasInteracted, utmSource, shouldHide, pageEnteredAt]);

  // ─── Pulse animation for pending re-engagement ────────
  useEffect(() => {
    if (!hasInteracted && !reengagementShown && timeOnSite > 60 && !isOpen) {
      setPulseAnimation(true);
    } else {
      setPulseAnimation(false);
    }
  }, [hasInteracted, reengagementShown, timeOnSite, isOpen]);

  // ─── Auto-scroll on new messages ──────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Show initial message on first open ───────────────
  useEffect(() => {
    if (isOpen && !hasShownInitial && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: "Salut ! \u{1F44B} Besoin de contenu pro pour vos r\u00E9seaux sociaux ? Je peux vous montrer ce que KeiroAI fait en 30 secondes.",
          timestamp: new Date().toISOString(),
        },
      ]);
      setHasShownInitial(true);
    }
  }, [isOpen, hasShownInitial, messages.length]);

  // ─── Focus input on open ──────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // ─── Send message ─────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);
      setHasInteracted(true);

      try {
        const res = await fetch('/api/chatbot/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visitorId,
            message: text,
            sessionId,
            visitorData: {
              currentPage: pathname,
              pagesVisited: Array.from(pagesVisitedRef.current),
              timeOnSite: timeOnSiteRef.current,
              source: utmSource,
            },
          }),
        });

        const data = await res.json();

        if (data.ok) {
          setSessionId(data.sessionId);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: data.message,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      } catch (err) {
        console.error('[ChatbotWidget] Error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, visitorId, sessionId, pathname, utmSource]
  );

  // ─── Handle key press ─────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ─── Don't render on hidden pages ─────────────────────
  if (shouldHide) return null;

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(true)}
            className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-shadow ${
              pulseAnimation ? 'animate-pulse' : ''
            }`}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Ouvrir le chat"
          >
            <MessageCircle className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed z-50 bottom-0 right-0 w-full sm:bottom-6 sm:right-6 sm:w-[380px] flex flex-col bg-white shadow-2xl border border-neutral-200 rounded-t-2xl sm:rounded-2xl overflow-hidden"
            style={{ height: '520px', maxHeight: 'calc(100vh - 40px)' }}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm leading-tight">Keiro</h3>
                  <p className="text-white/70 text-xs">Votre assistant</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
                aria-label="Fermer le chat"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-purple-600 text-white rounded-br-sm'
                        : 'bg-neutral-100 text-neutral-800 rounded-bl-sm'
                    }`}
                  >
                    {msg.content.split('\n').map((line, j) => (
                      <p key={j} className={j > 0 ? 'mt-1.5' : ''}>
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-neutral-100 rounded-xl px-4 py-3 rounded-bl-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.15s' }}
                      />
                      <div
                        className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.3s' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-neutral-200 bg-white p-3 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Votre message..."
                  className="flex-1 px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                  disabled={isLoading}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={isLoading || !input.trim()}
                  className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white flex items-center justify-center hover:from-purple-700 hover:to-[#1e3a5f] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
                  aria-label="Envoyer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
