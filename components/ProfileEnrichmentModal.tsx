'use client';

import { useState, useRef, useEffect } from 'react';

interface ProfileEnrichmentModalProps {
  profile: any;
  userId: string;
  onClose: () => void;
}

export function shouldShowEnrichmentModal(profile: any): boolean {
  if (!profile) return false;
  // Show if no company_name and no business_description — first time
  const hasBasicInfo = profile.company_name || profile.business_description || profile.company_description;
  if (hasBasicInfo) return false;
  // Check if dismissed recently
  try {
    const dismissed = localStorage.getItem('keiro_onboarding_dismissed');
    if (dismissed) {
      const ts = parseInt(dismissed, 10);
      if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return false; // 7 days
    }
  } catch {}
  return true;
}

export default function ProfileEnrichmentModal({ profile, userId, onClose }: ProfileEnrichmentModalProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 300);
  }, []);

  const handleSubmit = async () => {
    if (!text.trim()) { onClose(); return; }
    setSending(true);
    try {
      // Send to Clara (onboarding agent) to extract dossier fields
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: 'onboarding',
          message: text.trim(),
        }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => onClose(), 1500);
      } else {
        onClose();
      }
    } catch {
      onClose();
    } finally {
      setSending(false);
    }
  };

  const handleSkip = () => {
    try { localStorage.setItem('keiro_onboarding_dismissed', String(Date.now())); } catch {}
    onClose();
  };

  const placeholders = [
    "Ex: Je suis coiffeur a Lyon, je veux attirer plus de clients via Instagram...",
    "Ex: Restaurant italien a Paris 11e, on cherche a remplir les midis en semaine...",
    "Ex: Coach sportif independant, je veux developper ma visibilite en ligne...",
    "Ex: Boutique de fleurs a Bordeaux, je veux vendre en ligne et sur Instagram...",
  ];
  const [placeholder] = useState(() => placeholders[Math.floor(Math.random() * placeholders.length)]);

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-5xl mb-4">{'\u2728'}</div>
          <h2 className="text-xl font-bold text-neutral-900 mb-2">Merci !</h2>
          <p className="text-sm text-neutral-500">Clara analyse tes infos et prepare ton espace. Tes 18 agents sont prets !</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0c1a3a] to-purple-900 px-6 pt-7 pb-5 text-center">
          <div className="text-4xl mb-3">{'\u{1F44B}'}</div>
          <h2 className="text-xl font-bold text-white mb-1">
            Bienvenue sur KeiroAI !
          </h2>
          <p className="text-sm text-purple-200">
            Une seule question pour que ton equipe IA demarre du bon pied
          </p>
        </div>

        {/* Single question */}
        <div className="px-6 py-5">
          <label className="block text-sm font-semibold text-neutral-700 mb-2">
            Dis-nous en quelques mots : c&apos;est quoi ton activite et qu&apos;est-ce que tu veux accomplir ?
          </label>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border-2 border-neutral-200 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/10 transition-all text-sm resize-none"
            rows={4}
            placeholder={placeholder}
            maxLength={1000}
          />
          <p className="text-[10px] text-neutral-400 mt-1.5">
            Clara, ton assistante onboarding, va analyser et partager ces infos avec tes 18 agents IA
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 py-3 border-2 border-neutral-200 text-neutral-500 font-medium rounded-xl hover:bg-neutral-50 transition-all text-sm"
          >
            Plus tard
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending}
            className="flex-1 py-3 bg-gradient-to-r from-[#0c1a3a] to-purple-700 text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 text-sm"
          >
            {sending ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Envoi a Clara...
              </span>
            ) : (
              "C'est parti !"
            )}
          </button>
        </div>

        {/* Trial reminder */}
        <div className="bg-green-50 border-t border-green-100 px-6 py-3 text-center">
          <p className="text-xs text-green-700 font-medium">
            0{'\u20AC'} pendant 14 jours {'\u00B7'} Tous les agents debloques {'\u00B7'} Annulation en 1 clic
          </p>
        </div>
      </div>
    </div>
  );
}
