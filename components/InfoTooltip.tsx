'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * Small "i" info button with a click/hover popover. Used to explain what an
 * agent does, and each section / tab inside an agent (replaces the removed
 * demo-mode captions — useful for real prospects).
 *
 * Click-to-toggle (mobile friendly) + hover (desktop). Stops propagation so
 * an "i" placed on a clickable card never triggers the card's own click.
 */
export default function InfoTooltip({
  text,
  className = '',
  side = 'bottom',
  label = 'Info',
}: {
  text: string;
  className?: string;
  side?: 'bottom' | 'top';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!text) return null;

  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)}
        aria-label={label}
        className="w-4 h-4 rounded-full bg-white/15 hover:bg-white/35 text-white/70 hover:text-white text-[10px] font-bold flex items-center justify-center leading-none transition-colors cursor-help flex-shrink-0"
      >
        i
      </button>
      {open && (
        <span
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setOpen(false)}
          className={`absolute z-[70] left-1/2 -translate-x-1/2 w-56 max-w-[72vw] rounded-lg bg-gray-900 border border-white/20 px-3 py-2 text-[11px] leading-snug text-white/85 shadow-xl font-normal normal-case text-left whitespace-normal ${
            side === 'top' ? 'bottom-6' : 'top-6'
          }`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
