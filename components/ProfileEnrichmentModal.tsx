'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ProfileEnrichmentModalProps {
  profile: any;
  userId: string;
  onClose: () => void;
}

export function shouldShowEnrichmentModal(profile: any): boolean {
  if (!profile) return false;
  const hasBasicInfo = profile.company_name || profile.business_description || profile.company_description;
  if (hasBasicInfo) return false;
  try {
    const dismissed = localStorage.getItem('keiro_onboarding_dismissed');
    if (dismissed) {
      const ts = parseInt(dismissed, 10);
      if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return false;
    }
  } catch {}
  return true;
}

const QUESTIONS = [
  {
    emoji: '\u{1F3E2}',
    label: 'Ton activite',
    question: 'C\'est quoi ton business ?',
    placeholder: 'Ex: Restaurant italien a Paris, salon de coiffure a Lyon, coach sportif...',
    hint: 'Type de commerce, ville, specialite',
  },
  {
    emoji: '\u{1F3AF}',
    label: 'Ton objectif',
    question: 'Qu\'est-ce que tu veux accomplir ?',
    placeholder: 'Ex: Plus de clients via Instagram, remplir mes midis, vendre en ligne...',
    hint: 'Objectif principal avec KeiroAI',
  },
  {
    emoji: '\u{1F465}',
    label: 'Tes clients',
    question: 'C\'est qui tes clients ideaux ?',
    placeholder: 'Ex: Jeunes actifs 25-40 ans, familles du quartier, pros en B2B...',
    hint: 'Qui tu veux atteindre',
  },
];

export default function ProfileEnrichmentModal({ profile, userId, onClose }: ProfileEnrichmentModalProps) {
  const [answers, setAnswers] = useState(['', '', '']);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [listening, setListening] = useState(false);
  const [activeField, setActiveField] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setTimeout(() => inputRefs.current[0]?.focus(), 300);
  }, []);

  // Voice input
  const toggleVoice = useCallback((fieldIndex: number) => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setActiveField(fieldIndex);
    const recognition = new SR();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;
    let base = answers[fieldIndex];
    recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          base += (base ? ' ' : '') + e.results[i][0].transcript;
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setAnswers(prev => { const next = [...prev]; next[fieldIndex] = base + (interim ? ' ' + interim : ''); return next; });
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, answers]);

  const handleSubmit = async () => {
    const combined = QUESTIONS.map((q, i) => answers[i].trim() ? `${q.label}: ${answers[i].trim()}` : '').filter(Boolean).join('\n');
    if (!combined) { onClose(); return; }
    setSending(true);
    try {
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: 'onboarding', message: combined }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => onClose(), 1800);
      } else { onClose(); }
    } catch { onClose(); } finally { setSending(false); }
  };

  const handleSkip = () => {
    try { localStorage.setItem('keiro_onboarding_dismissed', String(Date.now())); } catch {}
    onClose();
  };

  const filledCount = answers.filter(a => a.trim().length > 0).length;

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in-95 duration-300">
          <div className="text-5xl mb-4">{'\u{1F680}'}</div>
          <h2 className="text-xl font-bold text-neutral-900 mb-2">C&apos;est parti !</h2>
          <p className="text-sm text-neutral-500">Clara configure ton espace avec tes infos. Tes 18 agents IA sont prets !</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0c1a3a] to-purple-900 px-6 pt-6 pb-4 text-center">
          <div className="text-3xl mb-2">{'\u{1F44B}'}</div>
          <h2 className="text-lg font-bold text-white mb-0.5">Bienvenue sur KeiroAI !</h2>
          <p className="text-xs text-purple-200">3 questions rapides pour que tes agents IA demarrent du bon pied</p>
          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mt-3">
            {QUESTIONS.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full transition-all ${answers[i].trim() ? 'bg-emerald-400 scale-110' : 'bg-white/20'}`} />
            ))}
          </div>
        </div>

        {/* Questions */}
        <div className="px-6 py-4 space-y-3">
          {QUESTIONS.map((q, i) => (
            <div key={i}>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700 mb-1">
                <span>{q.emoji}</span> {q.question}
              </label>
              <div className="relative">
                <input
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  value={answers[i]}
                  onChange={e => setAnswers(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                  onFocus={() => setActiveField(i)}
                  className={`w-full pl-3 pr-10 py-2.5 rounded-xl border-2 text-sm transition-all ${
                    listening && activeField === i
                      ? 'border-red-400 ring-2 ring-red-400/20'
                      : answers[i].trim()
                      ? 'border-emerald-300 bg-emerald-50/30'
                      : 'border-neutral-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10'
                  } focus:outline-none`}
                  placeholder={listening && activeField === i ? 'Parle...' : q.placeholder}
                  onKeyDown={e => { if (e.key === 'Enter' && i < 2) inputRefs.current[i + 1]?.focus(); }}
                />
                <button
                  type="button"
                  onClick={() => toggleVoice(i)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                    listening && activeField === i
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-neutral-100 text-neutral-400 hover:bg-purple-100 hover:text-purple-600'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {listening && (
            <p className="text-[10px] text-red-400 text-center animate-pulse">{'\u{1F534}'} Ecoute en cours... clique le micro pour arreter</p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 px-6 pb-4">
          <button type="button" onClick={handleSkip} className="flex-1 py-2.5 border-2 border-neutral-200 text-neutral-500 font-medium rounded-xl hover:bg-neutral-50 transition-all text-sm">
            Plus tard
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending || filledCount === 0}
            className="flex-1 py-2.5 bg-gradient-to-r from-[#0c1a3a] to-purple-700 text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-40 text-sm"
          >
            {sending ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              </span>
            ) : (
              `C'est parti ! (${filledCount}/3)`
            )}
          </button>
        </div>

        {/* Trial reminder */}
        <div className="bg-green-50 border-t border-green-100 px-6 py-2.5 text-center">
          <p className="text-[10px] text-green-700 font-medium">
            0{'\u20AC'} pendant 14 jours {'\u00B7'} Tous les agents debloques {'\u00B7'} Annulation en 1 clic
          </p>
        </div>
      </div>
    </div>
  );
}
