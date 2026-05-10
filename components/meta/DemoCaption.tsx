/**
 * DemoCaption — small inline label that explains what a Meta-critical
 * button does, visible only when the workspace is in demo mode (?demo=1).
 *
 * Used so the Meta App Review screencast can run without voice-over or
 * subtitles: the captions ARE the explanation.
 */

'use client';

import { useDemoMode } from '@/lib/demo-mode';

interface Props {
  children: React.ReactNode;
  variant?: 'dark' | 'light';
  className?: string;
}

export function DemoCaption({ children, variant = 'dark', className = '' }: Props) {
  const on = useDemoMode();
  if (!on) return null;
  const base =
    variant === 'light'
      ? 'bg-blue-50 border-blue-200 text-blue-900'
      : 'bg-blue-500/10 border-blue-500/30 text-blue-200';
  return (
    <div
      className={`mt-1.5 px-2.5 py-1.5 rounded-md border text-[10px] leading-snug font-mono ${base} ${className}`}
      data-meta-review-caption
    >
      <span className="font-bold not-italic mr-1">Graph API →</span>
      {children}
    </div>
  );
}

/**
 * DemoStepBanner — full-width strip describing the current step during a
 * multi-step Graph API operation (publish, oauth, send, etc.).
 */
export function DemoStepBanner({
  step,
  total,
  title,
  body,
  variant = 'pending',
}: {
  step: number;
  total: number;
  title: string;
  body?: string;
  variant?: 'pending' | 'success' | 'error';
}) {
  const on = useDemoMode();
  if (!on) return null;
  const palette =
    variant === 'success'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : variant === 'error'
      ? 'border-rose-300 bg-rose-50 text-rose-900'
      : 'border-blue-300 bg-blue-50 text-blue-900';
  return (
    <div className={`rounded-lg border-2 px-3 py-2 mb-2 ${palette}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
        <span className="px-1.5 py-0.5 rounded bg-white/60 text-[10px]">
          Step {step}/{total}
        </span>
        <span>{title}</span>
      </div>
      {body && <div className="text-[11px] mt-1 font-mono">{body}</div>}
    </div>
  );
}
