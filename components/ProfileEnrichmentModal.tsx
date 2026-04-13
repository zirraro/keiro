'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ProfileEnrichmentModalProps {
  profile: any;
  userId: string;
  onClose: () => void;
}

export function shouldShowEnrichmentModal(profile: any): boolean {
  if (!profile) return false;
  // Show until user has filled ANY basic business info
  const hasBasicInfo = profile.company_name || profile.business_description || profile.company_description || profile.business_type;
  return !hasBasicInfo;
}

const QUESTIONS = [
  {
    emoji: '\u{1F3E2}',
    label: 'Ton activite',
    question: 'C\'est quoi ton business ?',
    placeholder: 'Ex: Restaurant italien a Paris, salon de coiffure a Lyon, coach sportif...',
  },
  {
    emoji: '\u{1F3AF}',
    label: 'Ton objectif',
    question: 'Qu\'est-ce que tu veux accomplir ?',
    placeholder: 'Ex: Plus de clients via Instagram, remplir mes midis, vendre en ligne...',
  },
  {
    emoji: '\u{1F465}',
    label: 'Tes clients',
    question: 'C\'est qui tes clients ideaux ?',
    placeholder: 'Ex: Jeunes actifs 25-40 ans, familles du quartier, pros en B2B...',
  },
  {
    emoji: '\u{1F4AC}',
    label: 'Autre chose',
    question: 'Autre chose qu\'on devrait savoir ?',
    placeholder: 'Dis ce que tu veux : horaires, specialites, ce qui te differencie, tes reseaux...',
    free: true,
  },
];

export default function ProfileEnrichmentModal({ profile, userId, onClose }: ProfileEnrichmentModalProps) {
  const [answers, setAnswers] = useState(['', '', '', '']);
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
      // 1. Direct save to business_dossiers as fallback (immediate, doesn't depend on Clara's response)
      const directData: Record<string, string> = {};
      if (answers[0].trim()) {
        // Q1: "C'est quoi ton business" → company_description + try to extract type and city
        directData.company_description = answers[0].trim();
        // Extract city (case insensitive: "a lyon", "à Paris", etc.)
        const cityMatch = answers[0].match(/(?:a|à|sur)\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:[\s-][A-ZÀ-Ÿ][a-zà-ÿ]+)*)/i);
        if (cityMatch) directData.city = cityMatch[1];
        // Extract business type keywords
        const typeKeywords: Record<string, string> = {
          restaurant: 'restaurant', coiffeur: 'coiffeur', salon: 'salon', coach: 'coach',
          boutique: 'boutique', fleuriste: 'fleuriste', boulangerie: 'boulangerie',
          freelance: 'freelance', agence: 'agence', consultant: 'consultant',
        };
        const lowerQ1 = answers[0].toLowerCase();
        for (const [kw, type] of Object.entries(typeKeywords)) {
          if (lowerQ1.includes(kw)) { directData.business_type = type; break; }
        }
      }
      if (answers[1].trim()) directData.business_goals = answers[1].trim();
      if (answers[2].trim()) directData.target_audience = answers[2].trim();
      if (answers[3]?.trim()) {
        // Q4: champ libre — peut contenir nom, produits, etc.
        const q4 = answers[3].trim();
        if (!directData.company_description) directData.company_description = q4;
        // Try to extract company name (first capitalized words)
        const nameMatch = q4.match(/^([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s[A-ZÀ-Ÿ&][a-zà-ÿ]*)*)/);
        if (nameMatch && nameMatch[1].length > 2) directData.company_name = nameMatch[1];
      }

      // Save to business_dossiers AND profiles (so shouldShowEnrichmentModal detects it)
      if (Object.keys(directData).length > 0) {
        try {
          // Save to business_dossiers
          const saveRes = await fetch('/api/business-dossier', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(directData),
          });
          const saveData = await saveRes.json();
          console.log('[Onboarding] Dossier saved:', saveData);

          // Also update profiles table so popup doesn't show again
          const { supabaseBrowser } = await import('@/lib/supabase/client');
          const sb = supabaseBrowser();
          const { data: { user: currentUser } } = await sb.auth.getUser();
          if (currentUser) {
            await sb.from('profiles').update({
              company_name: directData.company_name || directData.company_description?.substring(0, 50) || 'Mon business',
              business_description: directData.company_description || null,
              business_type: directData.business_type || null,
            }).eq('id', currentUser.id);
            console.log('[Onboarding] Profile also updated');
          }
        } catch (e) {
          console.warn('[Onboarding] Save failed:', e);
        }
      }

      // 2. Also send to Clara for AI extraction (enriches with more fields)
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: 'onboarding', message: combined }),
      });
      setDone(true);
      try { sessionStorage.setItem('keiro_start_wizard', 'true'); } catch {}
      // Redirect to agents page to start wizard
      setTimeout(() => { window.location.href = '/assistant'; }, 1500);
    } catch {
      setDone(true);
      try { sessionStorage.setItem('keiro_start_wizard', 'true'); } catch {}
      setTimeout(() => { window.location.href = '/assistant'; }, 1500);
    } finally { setSending(false); }
  };

  // Just close for this session — will show again next login until profile is filled
  const handleSkip = () => onClose();

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
        <div className="bg-gradient-to-r from-[#0c1a3a] to-purple-900 px-6 pt-6 pb-4 text-center relative">
          {/* Close button */}
          <button onClick={handleSkip} className="absolute top-3 right-3 text-white/30 hover:text-white/70 transition p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="text-3xl mb-2">{'\u{1F44B}'}</div>
          <h2 className="text-lg font-bold text-white mb-0.5">Bienvenue sur KeiroAI !</h2>
          <p className="text-xs text-purple-200">Quelques infos rapides pour que tes agents IA demarrent du bon pied</p>
          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mt-3">
            {QUESTIONS.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full transition-all ${answers[i].trim() ? 'bg-emerald-400 scale-110' : 'bg-white/20'}`} />
            ))}
          </div>
        </div>

        {/* Questions */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-3 max-h-[50vh] overflow-y-auto">
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
                  className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
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

        {/* Submit button */}
        <div className="px-4 sm:px-6 pb-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending || filledCount === 0}
            className="w-full py-3 bg-gradient-to-r from-[#0c1a3a] to-purple-700 text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-40 text-sm"
          >
            {sending ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              </span>
            ) : (
              `C'est parti ! (${filledCount}/4)`
            )}
          </button>
        </div>

        {/* Trial reminder */}
        <div className="bg-green-50 border-t border-green-100 px-6 py-2.5 text-center">
          <p className="text-[10px] text-green-700 font-medium">
            0{'\u20AC'} pendant 7 jours {'\u00B7'} Tous les agents debloques {'\u00B7'} Annulation en 1 clic
          </p>
        </div>
      </div>
    </div>
  );
}
