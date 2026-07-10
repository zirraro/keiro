'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TourStep {
  target: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Si défini, bascule l'onglet du workspace AVANT de mettre en évidence la
   *  cible (ex: 'planning' → on affiche vraiment le calendrier, pas le tableau
   *  de bord principal). Écouté par AgentWorkspacePage via 'keiro-switch-tab'. */
  switchTab?: string;
}

interface SpotlightTourProps {
  steps: TourStep[];
  active: boolean;
  onFinish: () => void;
}

/**
 * Spotlight tour — REFAIT (founder 10/07 : l'ancien partait en haut-à-droite et
 * montrait les mauvaises parties). Nouveau principe ROBUSTE :
 *  - la carte d'explication est TOUJOURS centrée en bas (jamais hors-écran) ;
 *  - si le target existe et est visible, on le met en évidence (scroll + halo)
 *    SANS y ancrer la carte → plus de bug de positionnement ;
 *  - navigation ← → , points, croix, Échap, clic sur le fond = sortie garantie.
 */
export default function SpotlightTour({ steps, active, onFinish }: SpotlightTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);

  const step = steps[currentStep];

  const measure = useCallback(() => {
    if (!active || !step) { setTargetRect(null); return; }
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (!el) { setTargetRect(null); return; }
    const rect = el.getBoundingClientRect();
    const valid = rect.width > 4 && rect.height > 4 && rect.bottom > 40 && rect.top < window.innerHeight - 40;
    setTargetRect(valid ? rect : null);
  }, [active, step]);

  // Bascule d'onglet si l'étape le demande (ex: planning) → on montre le VRAI
  // contenu concerné, pas le tableau de bord. Puis scroll + mesure avec un délai
  // plus long pour laisser le nouvel onglet se monter.
  useEffect(() => {
    if (!active || !step) return;
    let delay = 350;
    if (step.switchTab) {
      try { window.dispatchEvent(new CustomEvent('keiro-switch-tab', { detail: step.switchTab })); } catch { /* noop */ }
      delay = 550; // laisser l'onglet rendre son contenu avant de cibler
    }
    const el0 = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (el0 && !step.switchTab) { try { el0.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* noop */ } }
    const t = setTimeout(() => {
      // re-scroll après le switch (l'élément n'existait pas avant)
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
      if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* noop */ } }
      measure();
    }, delay);
    return () => clearTimeout(t);
  }, [active, step, currentStep, measure]);

  // Suivi léger (scroll/resize) via rAF pour garder le halo aligné.
  useEffect(() => {
    if (!active) return;
    const onMove = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, measure]);

  const next = useCallback(() => {
    if (currentStep < steps.length - 1) setCurrentStep(s => s + 1);
    else { onFinish(); setCurrentStep(0); }
  }, [currentStep, steps.length, onFinish]);
  const prev = useCallback(() => { if (currentStep > 0) setCurrentStep(s => s - 1); }, [currentStep]);
  const skip = useCallback(() => { onFinish(); setCurrentStep(0); }, [onFinish]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); skip(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, skip, next, prev]);

  useEffect(() => {
    if (active) { try { sessionStorage.setItem('keiro_tour_running', 'true'); } catch { /* noop */ } }
    return () => { try { sessionStorage.removeItem('keiro_tour_running'); } catch { /* noop */ } };
  }, [active]);

  if (!active || steps.length === 0 || !step) return null;

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const pad = 6;

  return (
    <div className="fixed inset-0 z-[9998]" onClick={skip}>
      {/* Backdrop assombri, avec un trou sur le target s'il est visible. */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="spot-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect x={targetRect.left - pad} y={targetRect.top - pad} width={targetRect.width + pad * 2} height={targetRect.height + pad * 2} rx="10" fill="black" />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#spot-mask)" />
      </svg>

      {/* Halo sur l'élément mis en évidence. */}
      {targetRect && (
        <div
          className="absolute border-2 border-emerald-400 rounded-xl pointer-events-none transition-all duration-200"
          style={{ top: targetRect.top - pad, left: targetRect.left - pad, width: targetRect.width + pad * 2, height: targetRect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(0,0,0,0)' }}
        />
      )}

      {/* Carte d'explication — TOUJOURS centrée horizontalement, ancrée en bas de
          l'écran (jamais hors-champ, jamais en haut-à-droite). */}
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-4 sm:bottom-8 z-[9999] w-[calc(100vw-24px)] sm:w-[380px] max-w-md bg-gray-900 border border-emerald-500/30 rounded-2xl shadow-2xl p-4"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={skip} aria-label="Fermer" className="absolute top-2.5 right-2.5 text-white/50 hover:text-white transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="flex items-center gap-2 mb-2 pr-6">
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">{currentStep + 1}</div>
          <h4 className="text-sm font-bold text-white">{step.title}</h4>
        </div>
        <p className="text-xs text-white/70 mb-4 leading-relaxed">{step.description}</p>

        <div className="flex items-center justify-between gap-2">
          <button onClick={prev} disabled={isFirst}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition min-h-[38px] ${isFirst ? 'text-white/30 cursor-not-allowed' : 'text-white/70 bg-white/10 hover:bg-white/15'}`}>
            ← Précédent
          </button>
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition ${i === currentStep ? 'bg-emerald-400 scale-125' : i < currentStep ? 'bg-emerald-400/50' : 'bg-white/20'}`} />
            ))}
          </div>
          <button onClick={next}
            className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-500 transition min-h-[38px]">
            {isLast ? 'Terminer ✓' : 'Suivant →'}
          </button>
        </div>
        <div className="mt-2.5 text-center text-[9px] text-white/30">Échap pour quitter · ← → pour naviguer</div>
      </div>
    </div>
  );
}
