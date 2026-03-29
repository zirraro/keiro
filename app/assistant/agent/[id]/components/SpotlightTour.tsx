'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * SpotlightTour — Interactive tour that highlights elements on the page
 * with a spotlight effect and positioned tooltips.
 *
 * Usage: Add data-tour="step-id" attributes to elements, then define steps.
 */

export interface TourStep {
  target: string; // data-tour value to find the element
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
      // Scroll element into view
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

  // Re-check position after render (elements may load async)
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(updatePosition, 500);
    return () => clearTimeout(timer);
  }, [active, currentStep, updatePosition]);

  const next = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onFinish();
      setCurrentStep(0);
    }
  }, [currentStep, steps.length, onFinish]);

  const skip = useCallback(() => {
    onFinish();
    setCurrentStep(0);
  }, [onFinish]);

  if (!active || steps.length === 0) return null;

  const step = steps[currentStep];
  const hasTarget = !!targetRect;
  const pad = 8; // padding around highlighted element

  // Tooltip position
  let tooltipStyle: React.CSSProperties = {};
  let arrowClass = '';
  if (hasTarget) {
    const pos = step.position || 'bottom';
    if (pos === 'bottom') {
      tooltipStyle = { top: targetRect.bottom + 12, left: Math.max(8, targetRect.left + targetRect.width / 2 - 160) };
      arrowClass = 'before:absolute before:-top-2 before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-b-gray-900';
    } else if (pos === 'top') {
      tooltipStyle = { top: targetRect.top - 12, left: Math.max(8, targetRect.left + targetRect.width / 2 - 160), transform: 'translateY(-100%)' };
      arrowClass = 'before:absolute before:-bottom-2 before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-gray-900';
    } else if (pos === 'right') {
      tooltipStyle = { top: targetRect.top + targetRect.height / 2 - 40, left: targetRect.right + 12 };
      arrowClass = 'before:absolute before:top-1/2 before:-left-2 before:-translate-y-1/2 before:border-4 before:border-transparent before:border-r-gray-900';
    } else {
      tooltipStyle = { top: targetRect.top + targetRect.height / 2 - 40, left: targetRect.left - 12, transform: 'translateX(-100%)' };
      arrowClass = 'before:absolute before:top-1/2 before:-right-2 before:-translate-y-1/2 before:border-4 before:border-transparent before:border-l-gray-900';
    }
  }

  return (
    <div className="fixed inset-0 z-[9998]" onClick={next}>
      {/* Dark overlay with cutout for highlighted element */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {hasTarget && (
              <rect
                x={targetRect.left - pad}
                y={targetRect.top - pad}
                width={targetRect.width + pad * 2}
                height={targetRect.height + pad * 2}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#spotlight-mask)" />
      </svg>

      {/* Highlight border around target */}
      {hasTarget && (
        <div
          className="absolute border-2 border-emerald-400 rounded-xl pointer-events-none animate-pulse"
          style={{
            top: targetRect.top - pad,
            left: targetRect.left - pad,
            width: targetRect.width + pad * 2,
            height: targetRect.height + pad * 2,
          }}
        />
      )}

      {/* Pointing hand cursor animation */}
      {hasTarget && (
        <div
          className="absolute pointer-events-none animate-bounce"
          style={{
            top: targetRect.top + targetRect.height / 2 - 12,
            left: targetRect.left + targetRect.width / 2 - 12,
            zIndex: 9999,
          }}
        >
          <span className="text-2xl">{'\u{1F446}'}</span>
        </div>
      )}

      {/* Tooltip */}
      <div
        className={`fixed z-[9999] bg-gray-900/95 backdrop-blur-xl border border-emerald-500/30 rounded-xl shadow-2xl p-4 w-80 ${arrowClass}`}
        style={hasTarget ? tooltipStyle : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">{currentStep + 1}</div>
          <h4 className="text-sm font-bold text-white flex-1">{step.title}</h4>
          <button onClick={skip} className="text-white/20 hover:text-white/50 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="text-xs text-white/60 mb-3">{step.description}</p>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= currentStep ? 'bg-emerald-400' : 'bg-white/20'}`} />
            ))}
          </div>
          <button
            onClick={next}
            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-500 transition min-h-[32px]"
          >
            {currentStep < steps.length - 1 ? 'Suivant' : 'Terminer'}
          </button>
        </div>
      </div>
    </div>
  );
}
