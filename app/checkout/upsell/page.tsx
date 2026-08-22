'use client';

import { startCheckout } from '@/lib/stripe/checkout';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

/**
 * Choix du plan avant le paiement (exposée publiquement sur /essai).
 *
 * 2026-07-31 — Réécrite après relecture du fondateur :
 *   • les chiffres étaient faux (5/10 agents, 400/800 crédits) alors que la
 *     grille réelle est 7/10 agents et 1000/3000 crédits — voir PLAN_CREDITS
 *     dans lib/credits/constants.ts, seule source de vérité ;
 *   • le fichier contenait des séquences échappées à tort qui s'affichaient
 *     telles quelles, backslash compris, en production ("L\éna", "cr\édits") ;
 *   • aucun moyen de sortir : ni croix, ni retour. On ne piège pas quelqu'un
 *     sur une page de vente, ça coûte plus de confiance que ça ne convertit.
 *
 * Le -40% est un coupon Stripe sur le PREMIER MOIS uniquement
 * (app/api/stripe/create-checkout). C'est écrit tel quel : une promo mal
 * annoncée se paie en litiges et en remboursements.
 */

const CREATEUR = {
  agents: 7,
  names: 'Léna · Jade · Théo · Sara · Louis · Ami · Clara',
  credits: '1 000',
  lines: [
    'Contenu publié pour toi sur Instagram, TikTok et LinkedIn',
    'DMs et commentaires traités par Jade',
    'Avis Google répondus + fiche optimisée par Théo',
    'Contrats, devis, business plans par Sara et Louis',
  ],
};

const PRO = {
  agents: 10,
  credits: '3 000',
  lines: [
    'Hugo gère ta boîte mail : tri, réponses, relances, séquences',
    'Léo prospecte et remplit ton CRM tout seul',
    'Stella répond sur WhatsApp et confirme tes rendez-vous',
    'SEO et blog pour être trouvé en premier sur Google',
  ],
};

function Check({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={`w-4 h-4 flex-shrink-0 mt-0.5 ${className}`} aria-hidden>
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.12" />
      <path d="M6 10.2l2.6 2.6L14.2 7.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UpsellContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan') || 'createur';
  const isAnnual = plan.includes('annual');
  const [loading, setLoading] = useState<string | null>(null);

  if (!plan.startsWith('createur')) {
    startCheckout(plan);
    return (
      <div className="min-h-dvh flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-500 text-sm">Redirection vers le paiement…</p>
      </div>
    );
  }

  const go = (key: string, from?: string) => {
    setLoading(key);
    startCheckout(key, from).finally(() => setLoading(null));
  };

  const leave = () => {
    // history.back() renvoie hors du site si on est arrivé par un lien direct.
    if (window.history.length > 1) router.back();
    else router.push('/pricing');
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#0c1a3a] via-[#16305c] to-[#1e3a5f] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl">
        <div className="relative bg-white rounded-3xl shadow-[0_24px_70px_-20px_rgba(0,0,0,0.6)] overflow-hidden">
          {/* Sortie — toujours accessible, jamais un piège */}
          <button
            onClick={leave}
            aria-label="Fermer"
            className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/80 backdrop-blur text-neutral-400 hover:text-neutral-700 hover:bg-white flex items-center justify-center transition-colors shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <div className="px-6 pt-8 pb-6 sm:px-9 sm:pt-10">
            <div className="text-center mb-7">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                7 jours gratuits · 0€ aujourd&apos;hui
              </span>
              <h1 className="text-[22px] sm:text-2xl font-bold text-neutral-900 tracking-tight">
                Quelle équipe tu veux démarrer&nbsp;?
              </h1>
              <p className="text-sm text-neutral-500 mt-1.5">
                Tu peux changer ou arrêter à tout moment, en un clic.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3.5">
              {/* ── Créateur ── */}
              <button
                onClick={() => go(isAnnual ? 'createur_annual' : 'createur')}
                disabled={!!loading}
                className="group text-left rounded-2xl border border-neutral-200 bg-white p-5 hover:border-neutral-300 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.99] disabled:opacity-60"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Créateur</p>
                <p className="mt-1 mb-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-neutral-900">49€</span>
                  <span className="text-sm text-neutral-400">TTC/mois</span>
                </p>
                <p className="text-xs text-neutral-500 mb-4">
                  {CREATEUR.agents} agents · {CREATEUR.credits} crédits/mois
                </p>

                <ul className="space-y-2 text-[12px] leading-snug text-neutral-600">
                  {CREATEUR.lines.map((l) => (
                    <li key={l} className="flex gap-2">
                      <Check className="text-neutral-400" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-4 pt-3 border-t border-neutral-100 text-xs text-neutral-400">
                  {CREATEUR.names}
                </p>

                <span className="mt-4 block w-full text-center rounded-xl bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white text-neutral-700 text-[13px] font-semibold py-2.5 transition-colors">
                  {loading === 'createur' || loading === 'createur_annual' ? 'Un instant…' : 'Démarrer avec Créateur'}
                </span>
              </button>

              {/* ── Pro ── */}
              <button
                onClick={() => go(isAnnual ? 'pro_annual' : 'pro', 'createur')}
                disabled={!!loading}
                className="group relative text-left rounded-2xl p-5 bg-gradient-to-b from-blue-50/70 to-white border-2 border-blue-500 shadow-[0_10px_40px_-16px_rgba(37,99,235,0.55)] hover:shadow-[0_18px_50px_-16px_rgba(37,99,235,0.65)] hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.99] disabled:opacity-60"
              >
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold tracking-wide px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                  LE PLUS CHOISI
                </span>

                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  Pro <span className="text-orange-500">−40% le 1er mois</span>
                </p>
                <p className="mt-1 mb-1 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-neutral-900">59€</span>
                  <span className="text-sm text-neutral-400">le 1er mois</span>
                </p>
                <p className="text-xs text-neutral-500 mb-4">
                  puis 99€ TTC/mois · {PRO.agents} agents · {PRO.credits} crédits/mois
                </p>

                <ul className="space-y-2 text-[12px] leading-snug text-neutral-700">
                  <li className="flex gap-2 font-semibold text-neutral-900">
                    <Check className="text-blue-600" />
                    <span>Tout Créateur inclus</span>
                  </li>
                  {PRO.lines.map((l) => (
                    <li key={l} className="flex gap-2">
                      <Check className="text-blue-600" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>

                <span className="mt-4 block w-full text-center rounded-xl bg-blue-600 group-hover:bg-blue-700 text-white text-[13px] font-semibold py-2.5 transition-colors shadow-sm">
                  {loading === 'pro' || loading === 'pro_annual' ? 'Un instant…' : 'Démarrer avec Pro'}
                </span>
              </button>
            </div>

            <div className="mt-6 flex flex-col items-center gap-2.5">
              <p className="text-xs text-neutral-400 text-center">
                Aucun débit pendant 7 jours · Annulation en 1 clic · Sans engagement
              </p>
              <button onClick={leave} className="text-[12px] text-neutral-400 hover:text-neutral-600 underline underline-offset-2 transition-colors">
                Revenir aux tarifs
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UpsellPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh flex items-center justify-center bg-[#0c1a3a]">
        <p className="text-white/50 text-sm">Chargement…</p>
      </div>
    }>
      <UpsellContent />
    </Suspense>
  );
}
