'use client';

import { useState } from 'react';

/**
 * 2026-06-03 — Shared action button with built-in loading feedback.
 *
 * Founder ask: "des aussi comme lena hugo ect — que l'action soit
 * confirmer comme en cours quand on clique sur un bouton".
 *
 * Behaviors:
 *   - Spinner + "En cours…" label while the action runs (no click silence)
 *   - Disabled during action so the user can't double-click
 *   - On success: green tick + "Fait" for 2s, then back to default label
 *   - On error: red cross + first 100 chars of the error message for 4s
 *
 * Usage in any panel:
 *   <ActionButton
 *     label="Publier maintenant"
 *     onAction={async () => {
 *       const r = await fetch('/api/agents/content', { method: 'POST', body: ... });
 *       const j = await r.json();
 *       if (!j.ok) throw new Error(j.error || 'Échec');
 *       return `${j.published} post(s) publiés`;
 *     }}
 *     variant="emerald"
 *   />
 *
 * The onAction handler returns a string shown briefly on success.
 */
export interface ActionButtonProps {
  label: string;
  onAction: () => Promise<string | void>;
  variant?: 'emerald' | 'pink' | 'cyan' | 'blue' | 'purple' | 'amber';
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  icon?: string;
  /** When true, the action prints its result on screen for 4s instead of 2. */
  longResult?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<ActionButtonProps['variant']>, string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/50',
  pink: 'bg-pink-600 hover:bg-pink-500 disabled:bg-pink-800/50',
  cyan: 'bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800/50',
  blue: 'bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50',
  purple: 'bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800/50',
  amber: 'bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800/50',
};

export function ActionButton({
  label,
  onAction,
  variant = 'purple',
  size = 'md',
  className = '',
  disabled,
  icon,
  longResult,
}: ActionButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [resultText, setResultText] = useState<string | null>(null);

  const handleClick = async () => {
    if (state === 'loading') return;
    setState('loading');
    setResultText(null);
    try {
      const result = await onAction();
      setState('success');
      const txt = typeof result === 'string' ? result : 'Fait';
      setResultText(txt);
      setTimeout(() => {
        setState('idle');
        setResultText(null);
      }, longResult ? 4000 : 2200);
    } catch (e: any) {
      setState('error');
      const msg = String(e?.message || e || 'Erreur').slice(0, 140);
      setResultText(msg);
      setTimeout(() => {
        setState('idle');
        setResultText(null);
      }, 4500);
    }
  };

  const pad = size === 'sm' ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2.5 text-xs';
  const variantCls = state === 'success'
    ? 'bg-emerald-600'
    : state === 'error'
      ? 'bg-rose-600'
      : VARIANT_CLASSES[variant];

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state === 'loading'}
      className={`${pad} ${variantCls} text-white font-semibold rounded-lg transition disabled:opacity-70 flex items-center justify-center gap-2 min-h-[36px] ${className}`}
      title={resultText || undefined}
    >
      {state === 'loading' && (
        <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      )}
      {state === 'success' && <span>✓</span>}
      {state === 'error' && <span>✕</span>}
      {state === 'idle' && icon && <span>{icon}</span>}
      <span className="truncate">
        {state === 'loading' ? 'En cours…'
          : state === 'success' ? (resultText || 'Fait')
          : state === 'error' ? `Erreur${resultText ? ' · ' + resultText.slice(0, 40) : ''}`
          : label}
      </span>
    </button>
  );
}
