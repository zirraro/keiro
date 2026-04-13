'use client';

/**
 * Shared UI primitives for agent dashboard panels.
 * Extracted from AgentDashboard.tsx during the 2026-04-13 split refactor so
 * each panel can import exactly what it needs without dragging the whole
 * 4500-line file into bundles.
 */

import React from 'react';

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                */
/* ------------------------------------------------------------------ */

export function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return '0';
  return n.toLocaleString('fr-FR');
}

export function fmtCurrency(n: number | undefined): string {
  if (n === undefined || n === null) return '0 \u20ac';
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

export function fmtPercent(n: number | undefined): string {
  if (n === undefined || n === null) return '0 %';
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/* ------------------------------------------------------------------ */
/*  Reusable micro-components                                          */
/* ------------------------------------------------------------------ */

export function KpiCard({
  label,
  value,
  gradientFrom,
  gradientTo,
}: {
  label: string;
  value: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4 flex flex-col gap-1.5 relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 opacity-[0.07]" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }} />
      <span className="relative text-[10px] text-white/50 uppercase tracking-wider font-semibold">{label}</span>
      <span
        className="relative text-2xl font-bold bg-clip-text text-transparent"
        style={{ backgroundImage: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
      >
        {value}
      </span>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-8 mb-4">
      <div className="h-px flex-1 bg-white/10" />
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider px-2">{children}</h3>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

export function EmptyState({ agentName }: { agentName: string }) {
  return (
    <div className="rounded-2xl border border-white/10 p-8 text-center bg-white/[0.02]">
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      </div>
      <p className="text-white/40 text-sm">Aucune donnee pour le moment.</p>
      <p className="text-white/25 text-xs mt-1">Discutez avec {agentName} pour commencer !</p>
    </div>
  );
}

export function ActionButton({
  label,
  gradientFrom,
  gradientTo,
  onClick,
}: {
  label: string;
  gradientFrom: string;
  gradientTo: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full mt-4 py-3 px-6 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Visual chart components                                            */
/* ------------------------------------------------------------------ */

export function DonutChart({ segments, size = 100, label }: {
  segments: Array<{ value: number; color: string; label: string }>;
  size?: number;
  label?: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div className="text-white/20 text-xs text-center py-4">Pas de donnees</div>;

  let offset = 0;
  const r = 36;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dashLength = circumference * pct;
          const dashOffset = circumference * offset;
          offset += pct;
          return (
            <circle
              key={i}
              cx="50" cy="50" r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="12"
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              className="transition-all duration-500"
            />
          );
        })}
        {label && <text x="50" y="50" textAnchor="middle" dy="0.35em" className="fill-white text-[10px] font-bold">{label}</text>}
      </svg>
      <div className="flex flex-wrap justify-center gap-2">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-[9px] text-white/50">{seg.label} ({seg.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-white/50">{label}</span>
        <span className="text-white/70 font-bold">{value}/{max}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function ActivityFeed({
  items,
  agentName,
  gradientFrom,
  gradientTo,
}: {
  items: Array<{ label: string; detail?: string; date: string }>;
  agentName: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  if (items.length === 0) return <EmptyState agentName={agentName} />;
  return (
    <div className="flex flex-col gap-2">
      {items.slice(0, 5).map((item, i) => (
        <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-start gap-3">
          <div
            className="w-2 h-2 rounded-full mt-1.5 shrink-0"
            style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/80 break-words">{item.label}</p>
            {item.detail && <p className="text-xs text-white/50 mt-0.5">{item.detail}</p>}
            <p className="text-xs text-white/40 mt-1">{fmtDate(item.date)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CircularProgress({
  value,
  label,
  gradientFrom,
  gradientTo,
}: {
  value: number;
  label: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const clamp = Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (clamp / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="88" height="88" viewBox="0 0 88 88" className="drop-shadow-lg">
        <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={gradientFrom} />
            <stop offset="100%" stopColor={gradientTo} />
          </linearGradient>
        </defs>
        <circle
          cx="44"
          cy="44"
          r="36"
          fill="none"
          stroke={`url(#grad-${label})`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 44 44)"
        />
        <text x="44" y="44" textAnchor="middle" dominantBaseline="central" className="fill-white text-sm font-bold">
          {fmtPercent(value)}
        </text>
      </svg>
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );
}
