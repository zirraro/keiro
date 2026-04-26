'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * 3-tier free-trial gate:
 *
 *   Tier 1 — Anonymous (no account, no card)
 *     Limit: 1 generation. After 1 → modal forces ultra-simple signup
 *     (email only). Tracked in localStorage `anon_gen_count`.
 *
 *   Tier 2 — Logged in (no card, no plan)
 *     Limit: 2 more generations (3 total counting the anon one).
 *     After exhaustion → modal forces card-collected 7-day trial of
 *     the chosen plan. Tracked server-side via
 *     /api/me/free-trial-status.
 *
 *   Tier 3 — Card collected → 7-day full access on chosen plan.
 *
 * Listens for window event `keiro:generation-success` to refresh.
 */

const ANON_LIMIT = 1;
const ANON_KEY = 'keiro_anon_gen_count_v1';

type Status = {
  requires_card?: boolean;
  used?: number;
  limit?: number;
  remaining?: number;
  plan?: string;
  anonymous?: boolean;
};

export default function FreeTrialGate() {
  const [status, setStatus] = useState<Status | null>(null);
  const [anonUsed, setAnonUsed] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(() => {
    fetch('/api/me/free-trial-status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.ok ? setStatus(d) : null)
      .catch(() => {});
    try {
      const v = localStorage.getItem(ANON_KEY);
      setAnonUsed(v ? parseInt(v) || 0 : 0);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const onGen = () => {
      // Bump anon counter when no auth
      setTimeout(() => {
        if (!status || status.anonymous) {
          try {
            const v = localStorage.getItem(ANON_KEY);
            const next = (v ? parseInt(v) || 0 : 0) + 1;
            localStorage.setItem(ANON_KEY, String(next));
            setAnonUsed(next);
          } catch {}
        }
        refresh();
      }, 800);
    };
    window.addEventListener('keiro:generation-success', onGen);
    return () => window.removeEventListener('keiro:generation-success', onGen);
  }, [refresh, status]);

  if (!status) return null;

  // ── ANONYMOUS PATH ──
  if (status.anonymous) {
    if (anonUsed < ANON_LIMIT) {
      // First gen still allowed — no UI needed.
      return null;
    }
    // Hit the wall → force signup
    return (
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-7">
          <div className="text-center mb-4 sm:mb-5">
            <div className="text-3xl sm:text-4xl mb-2">🎉</div>
            <h2 className="text-xl sm:text-2xl font-black text-neutral-900 mb-2 leading-tight">
              Pas mal, hein ? Crée ton compte pour 2 gens en plus
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
              Email + mot de passe. <strong>Pas de carte.</strong> Tu débloques 2 générations supplémentaires + accès aux <strong>agents qui automatisent</strong> ta com (publication auto IG/TikTok, DMs, emails…).
            </p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
            <p className="text-xs text-emerald-900 leading-relaxed">
              <strong>🚀 Le vrai cadeau :</strong> tester l'auto-publication. Léna génère + publie sur tes réseaux pendant que tu fais ton métier.
            </p>
          </div>
          <a
            href="/signup?from=anon-gate"
            className="block w-full text-center bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold py-3 min-h-[48px] rounded-xl shadow-lg hover:shadow-xl transition mb-2"
          >
            Créer mon compte gratuit →
          </a>
          <a href="/login" className="block w-full text-center text-xs text-neutral-500 hover:text-neutral-700 py-2">
            J'ai déjà un compte
          </a>
          <p className="text-[10px] text-neutral-400 text-center mt-2">
            Email seulement · Pas de carte demandée à cette étape
          </p>
        </div>
      </div>
    );
  }

  // ── LOGGED USER PATH ──
  const plan = status.plan || 'free';
  if (plan !== 'free' && plan !== 'gratuit') return null;

  const used = status.used ?? 0;
  const limit = status.limit ?? 3;
  const remaining = status.remaining ?? Math.max(0, limit - used);

  // Soft warning at 1 left
  if (remaining === 1 && !dismissed) {
    return (
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] sm:max-w-sm bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl shadow-2xl p-4 border border-amber-300/40">
        <button onClick={() => setDismissed(true)} className="absolute top-2 right-2 text-white/70 hover:text-white text-base px-2 min-h-[32px]">×</button>
        <div className="font-bold text-sm mb-1">⚡ Plus qu'1 génération gratuite</div>
        <p className="text-xs text-white/90 leading-relaxed mb-3">
          Active ton essai 7 jours pour générer en illimité <strong>+ activer l'automatisation</strong> sur tes réseaux. 0€ pendant 7j, annulation 1 clic.
        </p>
        <a href="/checkout/upsell?plan=createur" className="block w-full text-center bg-white text-orange-700 font-bold py-2 min-h-[44px] rounded-lg text-xs hover:bg-amber-50 flex items-center justify-center">
          Activer l'essai 7 jours →
        </a>
      </div>
    );
  }

  // Hard gate when remaining=0
  if (status.requires_card) {
    return (
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-7">
          <div className="text-center mb-4 sm:mb-5">
            <div className="text-3xl sm:text-4xl mb-2">🚀</div>
            <h2 className="text-xl sm:text-2xl font-black text-neutral-900 mb-2 leading-tight">Prêt à laisser tes agents bosser ?</h2>
            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
              Tu as testé la génération. Maintenant active <strong>l'automatisation complète</strong> : Léna publie tes posts, Hugo envoie tes emails, Jade répond aux DMs — pendant que tu fais ton métier.
            </p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-3 text-center">
            <div className="text-xs text-purple-700 font-semibold mb-0.5">7 JOURS GRATUITS · Plan Créateur</div>
            <div className="text-2xl sm:text-3xl font-black text-purple-900">0€</div>
            <div className="text-[10px] sm:text-xs text-purple-600">Puis 49€/mois · Annulation 1 clic</div>
          </div>
          <ul className="text-[11px] sm:text-xs text-neutral-700 space-y-1 mb-4">
            <li>✓ <strong>7 agents IA</strong> incluant Léna (auto-publication réseaux)</li>
            <li>✓ <strong>400 crédits</strong>/mois (≈ 100 visuels)</li>
            <li>✓ <strong>~60 prospects qualifiés</strong>/mois sur Google Maps</li>
            <li>✓ <strong>CRM + emails + DMs auto</strong></li>
          </ul>
          <a
            href="/checkout/upsell?plan=createur"
            className="block w-full text-center bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold py-3 min-h-[48px] rounded-xl shadow-lg hover:shadow-xl transition mb-2"
          >
            Activer l'essai gratuit 7 jours
          </a>
          <a href="/pricing" className="block w-full text-center text-xs text-neutral-500 hover:text-neutral-700 py-2">
            Voir tous les plans
          </a>
          <p className="text-[10px] text-neutral-400 text-center mt-2">
            Carte demandée pour l'essai · 0€ débité pendant 7j · Annulation 1 clic
          </p>
        </div>
      </div>
    );
  }

  return null;
}
