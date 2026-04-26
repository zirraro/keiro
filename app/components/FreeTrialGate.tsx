'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * FreeTrialGate — sits at the page level, polls the user's free-trial
 * status and shows a non-dismissable card-collection modal when the
 * 3 free generations are exhausted. Doesn't block the rest of the UI;
 * just shows the upgrade CTA on top.
 *
 * Drop into any page where free users perform expensive actions:
 *   import FreeTrialGate from '@/app/components/FreeTrialGate';
 *   ...
 *   <FreeTrialGate />
 */
export default function FreeTrialGate() {
  const [status, setStatus] = useState<{
    requires_card?: boolean;
    used?: number;
    limit?: number;
    remaining?: number;
    plan?: string;
    anonymous?: boolean;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(() => {
    fetch('/api/me/free-trial-status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.ok ? setStatus(d) : null)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // Refresh after generations — listen for a custom event the
    // generate page dispatches on success.
    const onGen = () => { setTimeout(refresh, 800); };
    window.addEventListener('keiro:generation-success', onGen);
    return () => window.removeEventListener('keiro:generation-success', onGen);
  }, [refresh]);

  if (!status || status.anonymous) return null;

  const plan = status.plan || 'free';
  if (plan !== 'free' && plan !== 'gratuit') return null;

  const used = status.used ?? 0;
  const limit = status.limit ?? 3;
  const remaining = status.remaining ?? Math.max(0, limit - used);

  // Soft warning at 1 left
  if (remaining === 1 && !dismissed) {
    return (
      <div className="fixed bottom-4 right-4 z-[60] max-w-sm bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl shadow-2xl p-4 border border-amber-300/40">
        <button onClick={() => setDismissed(true)} className="absolute top-2 right-2 text-white/70 hover:text-white text-sm">×</button>
        <div className="font-bold text-sm mb-1">⚡ Plus qu&apos;1 génération gratuite</div>
        <p className="text-xs text-white/90 leading-relaxed mb-3">
          Active ton essai gratuit 7 jours pour continuer à générer en illimité.
          0€ pendant 7j, annulation 1 clic.
        </p>
        <a href="/checkout/upsell?plan=createur" className="block w-full text-center bg-white text-orange-700 font-bold py-2 rounded-lg text-xs hover:bg-amber-50">
          Activer l&apos;essai gratuit →
        </a>
      </div>
    );
  }

  // Hard gate when remaining=0
  if (status.requires_card) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8">
          <div className="text-center mb-5">
            <div className="text-4xl mb-2">🎉</div>
            <h2 className="text-2xl font-black text-neutral-900 mb-2">Tu as testé KeiroAI !</h2>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Tes 3 générations gratuites sont consommées. Active ton essai 7 jours pour continuer
              avec <strong>tous les agents</strong>, <strong>publication auto</strong> et 400 crédits/mois.
            </p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 text-center">
            <div className="text-xs text-purple-700 font-semibold mb-0.5">7 JOURS GRATUITS</div>
            <div className="text-2xl font-black text-purple-900">0€</div>
            <div className="text-[10px] text-purple-600">Puis 49€/mois · Annulation 1 clic</div>
          </div>
          <a
            href="/checkout/upsell?plan=createur"
            className="block w-full text-center bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transition mb-2"
          >
            Activer l&apos;essai gratuit 7 jours
          </a>
          <a href="/pricing" className="block w-full text-center text-xs text-neutral-500 hover:text-neutral-700 py-2">
            Voir tous les plans
          </a>
          <p className="text-[10px] text-neutral-400 text-center mt-3">
            Carte demandée pour l&apos;essai · 0€ débité pendant 7j · Tu peux annuler en 1 clic
          </p>
        </div>
      </div>
    );
  }

  return null;
}
