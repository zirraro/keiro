'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * FirstVisitTour — small coachmark sequence shown the first time an
 * authenticated user lands on /assistant. Walks them through the 4
 * primary capabilities (Léna, Hugo, Generate, Pricing) so they
 * understand what they can do before clicking around.
 *
 * Stored once-seen flag in localStorage. Visitors / anonymous users
 * never see it.
 */

const STEPS = [
  {
    title: 'Bienvenue sur KeiroAI 👋',
    body: "On va te montrer en 30 secondes ce que tes agents IA font pour toi. Tu peux passer à tout moment.",
    cta: 'Démarrer',
  },
  {
    title: '🎨 Léna — agent contenu',
    body: "Léna génère + publie automatiquement tes posts Instagram, TikTok et LinkedIn. Tu valides ou tu laisses tourner en auto.",
    cta: 'Suivant →',
  },
  {
    title: '📧 Hugo — emails prospection',
    body: "Hugo envoie tes emails depuis ton domaine, lit ta boîte, traite les désabonnements automatiquement.",
    cta: 'Suivant →',
  },
  {
    title: '⚡ Page Générer',
    body: "Tu peux aussi générer une image ou une vidéo ponctuelle. Le bouton ⚡ Express remplit tout en 1 clic.",
    cta: 'Suivant →',
  },
  {
    title: '💎 3 générations gratuites',
    body: "Tu as 3 générations offertes. Au-delà, active l'essai 7 jours (0€, annulation 1 clic). On te préviendra avant.",
    cta: 'C\'est parti',
  },
];

const STORAGE_KEY = 'keiro_first_visit_tour_v1';

export default function FirstVisitTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (pathname !== '/assistant') return;
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
    } catch {}
    // Slight delay so the page lays out before the overlay appears
    const t = setTimeout(() => setActive(true), 600);
    return () => clearTimeout(t);
  }, [pathname]);

  const finish = (target?: string) => {
    setActive(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    if (target) router.push(target);
  };

  if (!active) return null;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-7 mb-4 sm:mb-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'bg-purple-600 w-6' : i < step ? 'bg-purple-300 w-4' : 'bg-neutral-200 w-4'}`} />
            ))}
          </div>
          <button
            onClick={() => finish()}
            className="text-xs text-neutral-400 hover:text-neutral-600 px-2 py-1"
          >
            Passer
          </button>
        </div>
        <h2 className="text-lg sm:text-xl font-black text-neutral-900 mb-2 leading-tight">{current.title}</h2>
        <p className="text-sm text-neutral-600 leading-relaxed mb-5">{current.body}</p>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              className="px-4 py-3 min-h-[44px] text-sm text-neutral-500 hover:text-neutral-700"
            >
              ←
            </button>
          )}
          <button
            onClick={() => isLast ? finish() : setStep(s => s + 1)}
            className="flex-1 px-4 py-3 min-h-[48px] bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white font-bold text-sm rounded-xl shadow"
          >
            {current.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
