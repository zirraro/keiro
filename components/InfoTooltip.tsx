'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Small "i" info button with a click popover. Used to explain what an agent
 * does, and each section / tab inside an agent.
 *
 * The popover is rendered with `position: fixed` (coordinates computed from
 * the icon) so it is NEVER clipped by a parent with `overflow-hidden` (e.g.
 * the agent cards) — the full text is always visible, outside the card.
 * Click toggles (works on mobile + desktop). Stops propagation so an "i"
 * placed on a clickable card never triggers the card's own click.
 */
export default function InfoTooltip({
  text,
  className = '',
  label = 'Info',
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom + 8, left: Math.min(Math.max(r.left + r.width / 2, 130), (typeof window !== 'undefined' ? window.innerWidth : 1000) - 130) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    const onDoc = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place]);

  if (!text) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}
        aria-label={label}
        className={`w-4 h-4 rounded-full bg-white/15 hover:bg-white/35 text-white/70 hover:text-white text-[10px] font-bold inline-flex items-center justify-center leading-none transition-colors cursor-pointer flex-shrink-0 ${className}`}
      >
        i
      </button>
      {open && coords && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: coords.top, left: coords.left, transform: 'translateX(-50%)', zIndex: 9999 }}
          className="w-64 max-w-[80vw] rounded-lg bg-gray-900 border border-white/20 px-3 py-2 text-[11px] leading-snug text-white/90 shadow-2xl font-normal normal-case text-left whitespace-normal"
        >
          {text}
        </div>
      )}
    </>
  );
}
