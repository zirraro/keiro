"use client";

import { useEffect, useState } from 'react';

/**
 * Cadence mix slider — VUE CLIENT COMPACTE.
 *
 * Founder rules 2026-06-09 :
 *   - "Prend trop de place" → version compacte 1-2 lignes max
 *   - "On donne pas le detail recycle ou pas" → juste les chiffres
 *   - "Sans les couts sans les marges" → admin-only, retiré ici
 *   - "Le client suit le decompte de ses credits"
 *   - "Si quota atteint, propose upsell credits"
 *
 * Le composant fetch :
 *   1. /api/agents/content/cadence-preview pour les chiffres du mix
 *   2. /api/credits/balance pour les crédits restants
 *
 * Si crédits < 10% → bandeau upsell pack.
 */

interface Cadence {
  ig_posts_per_week: number;
  ig_reels_per_week: number;
  tt_videos_per_week: number;
  linkedin_per_week: number;
}

interface Preview {
  ok: boolean;
  cadence: Cadence;
}

interface CreditBalance {
  balance: number;
  monthlyAllowance: number;
}

interface Props {
  plan: string;
  initialRatio?: number;
  onApply?: (ratio: number) => void;
  onBuyPack?: () => void;
}

export default function CadenceMixSlider({ plan, initialRatio = 40, onApply, onBuyPack }: Props) {
  const [ratio, setRatio] = useState(initialRatio);
  const [cadence, setCadence] = useState<Cadence | null>(null);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agents/content/cadence-preview?plan=${plan}&video_ratio=${ratio}`)
      .then(r => r.json())
      .then((j: Preview) => { if (!cancelled && j.ok) setCadence(j.cadence); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [plan, ratio]);

  useEffect(() => {
    fetch('/api/credits/balance', { credentials: 'include' })
      .then(r => r.json())
      .then((j: any) => {
        if (typeof j?.balance === 'number') {
          setCredits({ balance: j.balance, monthlyAllowance: j.monthlyAllowance || j.balance });
        }
      })
      .catch(() => {});
  }, []);

  const pctRemaining = credits && credits.monthlyAllowance > 0
    ? Math.round((credits.balance / credits.monthlyAllowance) * 100)
    : 100;
  const lowCredits = pctRemaining < 15;

  const handleApply = async () => {
    if (!onApply) return;
    setApplying(true);
    try { await onApply(ratio); } finally { setApplying(false); }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Mix label + slider */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-[11px] text-white/60 whitespace-nowrap">⚖️ Mix</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={ratio}
            onChange={(e) => setRatio(parseInt(e.target.value, 10))}
            className="flex-1 accent-cyan-500 max-w-[180px]"
          />
          <span className="text-[11px] font-bold text-cyan-400 whitespace-nowrap min-w-[55px]">{ratio}% vidéo</span>
        </div>

        {/* Cadence quick view — par réseau, juste les chiffres */}
        {cadence && (
          <div className="flex items-center gap-2 text-[11px] flex-wrap">
            <span className="text-white/70">📷 <strong>{cadence.ig_posts_per_week}</strong>/sem IG</span>
            {cadence.ig_reels_per_week > 0 && <span className="text-white/70">🎬 <strong>{cadence.ig_reels_per_week}</strong>/sem reel</span>}
            <span className="text-white/70">🎥 <strong>{cadence.tt_videos_per_week}</strong>/sem TT</span>
            {cadence.linkedin_per_week > 0 && <span className="text-white/70">💼 <strong>{cadence.linkedin_per_week}</strong>/sem LI</span>}
          </div>
        )}

        {/* Crédits restants + bouton apply */}
        <div className="flex items-center gap-2">
          {credits && (
            <div
              className={`text-[10px] px-2 py-1 rounded-full border ${
                lowCredits
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-white/10 bg-white/5 text-white/60'
              }`}
              title={`${credits.balance} crédits restants sur ${credits.monthlyAllowance}`}
            >
              {credits.balance} cr
            </div>
          )}
          <button
            onClick={handleApply}
            disabled={applying}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-[#0c1a3a] text-[11px] font-bold hover:opacity-90 transition disabled:opacity-40"
          >
            {applying ? '...' : 'Appliquer'}
          </button>
        </div>
      </div>

      {/* Upsell quand crédits faibles */}
      {lowCredits && onBuyPack && (
        <div className="mt-2 flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <span className="text-[11px] text-amber-300">⚡ Quota faible ({pctRemaining}% restants)</span>
          <button onClick={onBuyPack} className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500 text-[#0c1a3a] hover:opacity-90">💎 Booster</button>
        </div>
      )}
    </div>
  );
}
