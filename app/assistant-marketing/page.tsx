'use client';

import { useState, useEffect, useRef } from 'react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export default function MarketingAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ messagesUsed: number; messagesLimit: number; remaining: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll vers bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/marketing-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          message: input,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message,
          createdAt: new Date().toISOString(),
        };

        setMessages(prev => [...prev, assistantMessage]);
        setConversationId(data.conversationId);

        // Mettre à jour l'usage
        if (data.usage) {
          setUsage(data.usage);
        }
      } else {
        if (data.limitReached) {
          alert(`⚠️ Limite atteinte\n\n${data.error}\n\nMessages utilisés: ${data.currentUsage}/${data.limit}`);
        } else {
          alert(`Erreur: ${data.error}`);
        }
      }
    } catch (error) {
      console.error('[Chat] Error:', error);
      alert('Erreur lors de l\'envoi du message');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-purple-50">
      <div className="max-w-5xl mx-auto h-screen flex flex-col">

        {/* Header */}
        <div className="bg-white border-b border-neutral-200 p-4 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">
                  Assistant Marketing
                </h1>
                <p className="text-xs sm:text-sm text-neutral-600 mt-0.5">
                  Conseils personnalisés pour booster votre présence Instagram
                </p>
              </div>
            </div>

            {/* Compteur d'utilisation */}
            {usage && (
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm font-semibold text-purple-700">
                  {usage.remaining}/{usage.messagesLimit}
                </span>
                <span className="text-xs text-purple-600 hidden md:inline">restants</span>
              </div>
            )}
          </div>

          {/* Compteur mobile */}
          {usage && (
            <div className="sm:hidden mt-3 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm font-semibold text-purple-700">
                {usage.remaining} messages restants ce mois-ci
              </span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 sm:py-12">
              <div className="text-5xl sm:text-6xl mb-4">💡</div>
              <h2 className="text-lg sm:text-xl font-semibold text-neutral-800 mb-2">
                Comment puis-je vous aider ?
              </h2>
              <p className="text-sm sm:text-base text-neutral-600 mb-6">
                Posez-moi vos questions sur votre stratégie Instagram
              </p>

              {/* Exemples de questions */}
              <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
                {[
                  'Quelle fréquence de publication recommandes-tu ?',
                  'Comment créer des captions engageantes ?',
                  'Quels hashtags utiliser pour mon secteur ?',
                  'Comment analyser mes performances Instagram ?',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setInput(example)}
                    className="p-3 sm:p-4 bg-gradient-to-br from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 rounded-xl text-left text-xs sm:text-sm text-blue-700 transition-all border border-blue-200 hover:border-blue-300 hover:shadow-md"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[85%] sm:max-w-3xl rounded-2xl px-4 sm:px-6 py-3 sm:py-4 shadow-md
                  ${msg.role === 'user'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                    : 'bg-white border border-neutral-200 text-neutral-800'
                  }
                `}
              >
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full"></div>
                    <span className="text-xs font-semibold text-neutral-500">Assistant Marketing</span>
                  </div>
                )}
                <div className="prose prose-sm max-w-none leading-relaxed">
                  {msg.content.split('\n').map((line, i) => (
                    <p key={i} className={`${i > 0 ? 'mt-2' : ''} ${msg.role === 'user' ? 'text-white' : 'text-neutral-800'}`}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-neutral-200 rounded-2xl px-6 py-4 shadow-md">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t border-neutral-200 p-3 sm:p-4 shadow-lg">
          <div className="flex gap-2 sm:gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
              placeholder="Posez votre question marketing..."
              className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base"
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg hover:shadow-xl text-sm sm:text-base"
            >
              {isLoading ? 'Envoi...' : 'Envoyer'}
            </button>
          </div>
          <p className="text-xs text-neutral-500 mt-2 text-center">
            Appuyez sur Entrée pour envoyer
          </p>
        </div>
      </div>
    </div>
  );
}
