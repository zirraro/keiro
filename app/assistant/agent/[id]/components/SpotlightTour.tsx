'use client';

import { useState, useEffect, useCallback } from 'react';

export interface TourStep {
  target: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface SpotlightTourProps {
  steps: TourStep[];
  active: boolean;
  onFinish: () => void;
}

export default function SpotlightTour({ steps, active, onFinish }: SpotlightTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const updatePosition = useCallback(() => {
    if (!active || currentStep >= steps.length) return;
    const step = steps[currentStep];
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setTargetRect(null);
    }
  }, [active, currentStep, steps]);

  useEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [updatePosition]);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(updatePosition, 300);
    return () => clearTimeout(timer);
  }, [active, currentStep, updatePosition]);

  const next = useCallback(() => {
    if (currentStep < steps.length - 1) setCurrentStep(prev => prev + 1);
    else { onFinish(); setCurrentStep(0); }
  }, [currentStep, steps.length, onFinish]);

  const prev = useCallback(() => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  }, [currentStep]);

  const skip = useCallback(() => {
    onFinish();
    setCurrentStep(0);
  }, [onFinish]);

  if (!active || steps.length === 0) return null;

  const step = steps[currentStep];
  const hasTarget = !!targetRect;
  const pad = 6;
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  // Tooltip positioning
  let tooltipTop = '50%';
  let tooltipLeft = '50%';
  let tooltipTransform = 'translate(-50%, -50%)';

  if (hasTarget) {
    const pos = step.position || 'bottom';
    if (pos === 'bottom') {
      tooltipTop = `${targetRect.bottom + 16}px`;
      tooltipLeft = `${Math.max(16, Math.min(window.innerWidth - 340, targetRect.left + targetRect.width / 2 - 160))}px`;
      tooltipTransform = '';
    } else if (pos === 'top') {
      tooltipTop = `${targetRect.top - 16}px`;
      tooltipLeft = `${Math.max(16, Math.min(window.innerWidth - 340, targetRect.left + targetRect.width / 2 - 160))}px`;
      tooltipTransform = 'translateY(-100%)';
    } else if (pos === 'right') {
      tooltipTop = `${targetRect.top + targetRect.height / 2 - 50}px`;
      tooltipLeft = `${targetRect.right + 16}px`;
      tooltipTransform = '';
    } else {
      tooltipTop = `${targetRect.top + targetRect.height / 2 - 50}px`;
      tooltipLeft = `${targetRect.left - 336}px`;
      tooltipTransform = '';
    }
  }

  return (
    <div className="fixed inset-0 z-[9998]">
      {/* Light overlay — NOT blurring the highlighted element */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="spot-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {hasTarget && (
              <rect
                x={targetRect.left - pad}
                y={targetRect.top - pad}
                width={targetRect.width + pad * 2}
                height={targetRect.height + pad * 2}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#spot-mask)" />
      </svg>

      {/* Clear border around highlighted element */}
      {hasTarget && (
        <div
          className="absolute border-2 border-emerald-400 rounded-lg pointer-events-none"
          style={{
            top: targetRect.top - pad,
            left: targetRect.left - pad,
            width: targetRect.width + pad * 2,
            height: targetRect.height + pad * 2,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-[9999] bg-gray-900 border border-emerald-500/30 rounded-xl shadow-2xl p-4 w-80"
        style={{ top: tooltipTop, left: tooltipLeft, transform: tooltipTransform }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={skip} className="absolute top-2 right-2 text-white/20 hover:text-white/50 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        {/* Step number */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">{currentStep + 1}</div>
          <h4 className="text-sm font-bold text-white flex-1">{step.title}</h4>
        </div>
        <p className="text-xs text-white/60 mb-4 leading-relaxed">{step.description}</p>

        {/* Navigation: arrows + dots */}
        <div className="flex items-center justify-between">
          {/* Previous */}
          <button
            onClick={prev}
            disabled={isFirst}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition min-h-[36px] ${isFirst ? 'text-white/15 cursor-not-allowed' : 'text-white/60 bg-white/10 hover:bg-white/15'}`}
          >
            {'\u2190'} Precedent
          </button>

          {/* Dots */}
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full transition ${i === currentStep ? 'bg-emerald-400 scale-125' : i < currentStep ? 'bg-emerald-400/50' : 'bg-white/20'}`} />
            ))}
          </div>

          {/* Next / Finish */}
          <button
            onClick={next}
            className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-500 transition min-h-[36px]"
          >
            {isLast ? 'Terminer' : 'Suivant \u2192'}
          </button>
        </div>
      </div>
    </div>
  );
}
