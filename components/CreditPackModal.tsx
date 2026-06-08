"use client";

import { useState, useEffect } from 'react';

interface Pack {
  id: 'starter' | 'pro' | 'expert';
  label: string;
  credits: number;
  price_eur: string;
  bonus: string;
  recommended: boolean;
}

interface CreditPackModalProps {
  /** Reason the modal is showing — used for analytics + headline. */
  reason: 'budget_red' | 'quota_exhausted' | 'manual' | string;
  /** Agent or feature that triggered it (e.g. 'lena', 'hugo') */
  source?: string;
  /** Called when user closes the modal */
  onClose: () => void;
}

const HEADLINES: Record<string, { title: string; desc: string }> = {
  budget_red: {
    title: '🚀 Continue à booster ton agent',
    desc: 'Tu approches du quota mensuel de ton plan. Recharge avec un pack crédits pour continuer sans interruption.',
  },
  quota_exhausted: {
    title: '⚡ Quota mensuel atteint',
    desc: 'Plus de génération sur ton plan ce mois-ci. Achète un pack pour continuer immédiatement.',
  },
  manual: {
    title: '💎 Recharge tes crédits',
    desc: 'Ajoute des crédits à ton compte pour multiplier tes générations sans changer de plan.',
  },
};

export default function CreditPackModal({ reason, source, onClose }: CreditPackModalProps) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const head = HEADLINES[reason] || HEADLINES.manual;

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/credits/purchase-pack', { credentials: 'include' });
        const j = await r.json();
        if (j.ok) setPacks(j.packs);
      } finally { setLoading(false); }
    })();
  }, []);

  const buy = async (id: string) => {
    setPurchasing(id);
    try {
      const r = await fetch('/api/credits/purchase-pack', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack: id, source: source || reason }),
      });
      const j = await r.json();
      if (j.ok && j.checkout_url) {
        window.location.href = j.checkout_url;
      } else {
        alert(j.error || 'Erreur lors de la création du checkout');
        setPurchasing(null);
      }
    } catch (e: any) {
      alert(e?.message || 'Erreur réseau');
      setPurchasing(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0f1f3d] rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">{head.title}</h2>
            <p className="text-sm text-white/60 mt-1">{head.desc}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Packs */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-white/40">Chargement…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {packs.map((p) => (
                <div
                  key={p.id}
                  className={`relative rounded-xl border p-4 flex flex-col ${
                    p.recommended ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  {p.recommended && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-cyan-400 text-[10px] font-bold text-[#0c1a3a]">
                      ⭐ MEILLEUR RATIO
                    </span>
                  )}
                  <div className="text-xs uppercase tracking-wider text-white/40 mb-1">{p.label}</div>
                  <div className="text-2xl font-bold text-white">{p.credits} <span className="text-sm text-white/50">crédits</span></div>
                  <div className="text-sm text-white/70 mt-1">{p.bonus}</div>
                  <div className="text-xl font-bold text-cyan-300 mt-3">{p.price_eur}</div>
                  <button
                    onClick={() => buy(p.id)}
                    disabled={purchasing === p.id}
                    className={`mt-3 w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      p.recommended
                        ? 'bg-cyan-500 hover:bg-cyan-400 text-[#0c1a3a]'
                        : 'bg-white/10 hover:bg-white/15 text-white'
                    } disabled:opacity-50`}
                  >
                    {purchasing === p.id ? 'Redirection…' : 'Acheter'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 text-center">
            <p className="text-[11px] text-white/40">
              💳 Paiement sécurisé via Stripe · Crédits ajoutés immédiatement · Pas d'engagement
            </p>
            <p className="text-[11px] text-white/40 mt-1">
              Préfère monter de plan ? <a href="/pricing" className="text-cyan-300 hover:underline">Voir les plans</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
