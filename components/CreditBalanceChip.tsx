"use client";

import { useState, useEffect, useRef } from 'react';

interface Balance {
  ok: boolean;
  credits_remaining: number;
  credits_total: number;
  plan: string;
  pct_remaining: number;
}

/**
 * Tiny credit-balance chip — discreet by design.
 *
 * Founder rule 2026-06-09 : "discret, sans frustrer le client sur sa
 * créativité ou le stresser sur les crédits restant". Show only :
 *   - WHITE chip when ≥ 50% remaining (just the number)
 *   - AMBER subtle chip at 10-50% (still no alarm)
 *   - RED + soft pulse at < 10% AND offer pack upgrade on hover
 * No stress, no countdown, no popup unless user clicks.
 *
 * Always available in the chat header as a small "X cr" pill that the
 * user can click to see details + buy a pack if needed. Click opens
 * an inline tooltip — no full-screen modal interruption.
 */
export default function CreditBalanceChip({ onBuyPack }: { onBuyPack: () => void }) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch('/api/credits/balance', { credentials: 'include' });
        if (!r.ok) return;
        const j = await r.json();
        // API returns { balance, monthlyAllowance, plan } — map to our shape
        if (mounted && typeof j?.balance === 'number') {
          const remaining = j.balance;
          const total = j.monthlyAllowance || remaining;
          setBalance({
            ok: true,
            credits_remaining: remaining,
            credits_total: total,
            plan: j.plan || 'free',
            pct_remaining: total > 0 ? Math.round((remaining / total) * 100) : 0,
          });
        }
      } catch { /* swallow */ }
    };
    load();
    // Refresh every 2 min — silent
    const interval = setInterval(load, 2 * 60 * 1000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!balance) return null;

  const pct = balance.pct_remaining;
  let style = 'border-white/15 bg-white/5 text-white/65 hover:text-white hover:bg-white/10';
  let dot = '';
  if (pct < 10) {
    style = 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 animate-[pulse_3s_ease-in-out_infinite]';
    dot = 'bg-red-400';
  } else if (pct < 50) {
    style = 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15';
  } else {
    dot = 'bg-emerald-400/70';
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-medium transition ${style}`}
        title={`${balance.credits_remaining} crédits restants sur ${balance.credits_total} (plan ${balance.plan})`}
      >
        {dot && <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />}
        <span>{balance.credits_remaining} cr</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-white/10 bg-[#0f1f3d] shadow-2xl p-3 z-50">
          <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Crédits du mois</div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-white">{balance.credits_remaining}</div>
            <div className="text-xs text-white/40">/ {balance.credits_total} (plan {balance.plan})</div>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full transition-all ${pct < 10 ? 'bg-red-400' : pct < 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <p className="text-[10px] text-white/45 mt-2">
            {pct < 10
              ? 'Tu approches de la fin de ton quota mensuel. Recharge pour continuer.'
              : pct < 50
                ? 'Tu as encore de la marge — surveille ta consommation.'
                : 'Pleine capacité — profites-en.'}
          </p>
          <button
            onClick={() => { setOpen(false); onBuyPack(); }}
            className="mt-3 w-full px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-[#0c1a3a] text-xs font-bold hover:opacity-90 transition"
          >
            💎 Booster (packs dès 14,99 €)
          </button>
          <a
            href="/mon-compte?section=billing"
            className="block text-[10px] text-center mt-2 text-white/45 hover:text-white/80"
          >
            Voir l'historique →
          </a>
        </div>
      )}
    </div>
  );
}
