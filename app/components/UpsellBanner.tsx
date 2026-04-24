'use client';

import { useEffect, useState } from 'react';

type Status = {
  credits_balance: number;
  credits_monthly_allowance: number;
  subscription_plan: string;
  margin_pct: number | null;
};

/**
 * Banner shown to clients when credit pool is running low OR their live
 * margin has dropped below the warning threshold. Two CTAs:
 *   - Buy +500 credit pack (€19)
 *   - Upgrade to the next plan
 *
 * We never frustrate-lock the client — even when the hard block fires,
 * the banner presents a way forward. See lib/credits/margin.ts for the
 * MARGIN_BLOCK/WARN thresholds that drive this.
 */
export default function UpsellBanner() {
  const [s, setS] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/me/quota-status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.ok ? setS(d.status) : null)
      .catch(() => {});
  }, []);

  if (!s || dismissed) return null;

  const pctUsed = s.credits_monthly_allowance > 0
    ? 1 - s.credits_balance / s.credits_monthly_allowance
    : 0;
  const lowCredits = s.credits_balance <= Math.max(10, s.credits_monthly_allowance * 0.10);
  const marginWarn = s.margin_pct !== null && s.margin_pct < 0.80;

  if (!lowCredits && !marginWarn) return null;

  const level: 'warn' | 'block' = (s.credits_balance === 0 || (s.margin_pct !== null && s.margin_pct < 0.70))
    ? 'block' : 'warn';

  const title = level === 'block'
    ? 'Tes agents sont en pause le temps qu\'on recharge'
    : lowCredits
      ? `Il te reste ${s.credits_balance} crédits sur ${s.credits_monthly_allowance}`
      : 'Ton utilisation approche de la limite du plan';

  const sub = level === 'block'
    ? 'Pas de stress — choisis une option ci-dessous et tout reprend en 30s.'
    : `${Math.round(pctUsed * 100)}% du plan consommé ce mois — anticipe avant que tout se bloque.`;

  const styles = level === 'block'
    ? 'from-rose-600/90 to-red-700/90 border-red-500/40'
    : 'from-amber-500/80 to-orange-600/80 border-amber-400/30';

  return (
    <div className={`relative bg-gradient-to-r ${styles} border rounded-xl p-4 mb-4 text-white`}>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-white/60 hover:text-white text-sm"
        aria-label="Fermer"
      >
        ×
      </button>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="font-bold text-base">{title}</div>
          <div className="text-sm text-white/80 mt-0.5">{sub}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/mon-compte?buy=pack500"
            className="bg-white text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-white/90 whitespace-nowrap"
          >
            Pack +500 crédits · €19
          </a>
          <a
            href="/tarifs?upgrade_from=${encodeURIComponent(s.subscription_plan)}"
            className="bg-white/20 border border-white/30 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-white/30 whitespace-nowrap"
          >
            Passer au plan supérieur
          </a>
        </div>
      </div>
    </div>
  );
}
