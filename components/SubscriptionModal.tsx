"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/context";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
  const { locale } = useLanguage();
  const isEn = locale === "en";
  if (!isOpen) return null;

  const monthSuffix = isEn ? "/mo" : "/mois";
  const plans = [
    {
      name: "Créateur",
      emoji: "\u{1F4A1}",
      price: "49€",
      subtitle: monthSuffix,
      description: isEn ? "Local business & entrepreneur" : "Commerce & entrepreneur",
      features: isEn
        ? ["1,000 credits/mo", "2 networks (IG/TT/LI)", "Léna + Clara + Ami", "3 TT videos/week"]
        : ["1 000 crédits/mois", "2 réseaux (IG/TT/LI)", "Léna + Clara + Ami", "3 vidéos TT/semaine"],
      highlight: false,
    },
    {
      name: "Pro",
      emoji: "\u{1F680}",
      price: "99€",
      subtitle: monthSuffix,
      description: isEn ? "Growing business" : "TPE & entrepreneur ambitieux",
      features: isEn
        ? ["3,000 credits/mo", "All 3 networks", "All agents unlocked", "4-5 TT videos/week"]
        : ["3 000 crédits/mois", "Les 3 réseaux", "Tous les agents", "4-5 vidéos TT/semaine"],
      highlight: true,
      badge: isEn ? "Popular" : "Populaire",
    },
    {
      name: "Business",
      emoji: "\u{1F3E2}",
      price: "199€",
      subtitle: monthSuffix,
      description: isEn ? "SMB & multi-location" : "PME & multi-points de vente",
      features: isEn
        ? ["6,000 credits/mo", "Multi-account (1+5)", "15+ AI agents", "Long-form videos (90s)"]
        : ["6 000 crédits/mois", "Multi-comptes (1+5)", "15+ agents IA", "Vidéos longues (90s)"],
      highlight: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header with trial banner */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">
              {isEn ? "Unlock every feature" : "Débloquez toutes les fonctionnalités"}
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              {isEn ? "Or buy a credit pack to keep generating without upgrading." : "Ou prends un pack crédits pour continuer sans changer de plan."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition p-1"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick pack option — low-friction alternative to plan upgrade */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="font-bold text-amber-800 mb-1">
                {isEn ? "\u{1F48E} Just need more credits ?" : "\u{1F48E} Besoin juste de crédits ?"}
              </div>
              <p className="text-xs text-amber-700">
                {isEn
                  ? "Packs from 14.99€ (60 credits) to 69.99€ (400 credits). One-time, no engagement."
                  : "Packs de 14,99€ (60 crédits) à 69,99€ (400 crédits). Paiement unique, aucun engagement."}
              </p>
            </div>
            <Link
              href="/pricing#packs"
              className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:opacity-90 whitespace-nowrap"
            >
              {isEn ? "See packs" : "Voir les packs"}
            </Link>
          </div>
        </div>

        {/* Trial banner — prominent */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-2xl p-4 sm:p-5 mb-6 text-center">
          <div className="text-3xl sm:text-4xl font-black text-green-700 mb-1">
            {isEn ? <>0{'€'} for 7 days</> : <>0{'€'} pendant 7 jours</>}
          </div>
          <p className="text-sm sm:text-base text-green-600 font-medium">
            {isEn ? 'All AI agents unlocked · Cancel in 1 click anytime' : <>Tous les agents IA débloqués {'·'} Annulation en 1 clic à tout moment</>}
          </p>
          <p className="text-xs text-green-500 mt-1">
            {isEn ? 'Card required, nothing charged during the trial' : 'Carte requise, aucun débit pendant l’essai'}
          </p>
        </div>

        {/* Plans */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-5 hover:shadow-lg transition-all relative ${
                plan.highlight
                  ? "border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50"
                  : "border-neutral-200 bg-white"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-amber-500 text-white">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-3 pt-1">
                <h3 className="text-sm font-bold mb-1 flex items-center gap-1">
                  <span>{plan.emoji}</span> {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-2xl font-bold">{plan.price}</span>
                  {plan.subtitle && <span className="text-xs text-neutral-500">{plan.subtitle}</span>}
                </div>
                <p className="text-xs text-neutral-500">{plan.description}</p>
              </div>

              <ul className="space-y-2 mb-4">
                {plan.features.map((feature, i) => (
                  <li key={i} className="text-xs text-neutral-700 flex items-start gap-1.5">
                    <span className="text-green-500 mt-0.5">{'✓'}</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={`/pricing#${plan.name.toLowerCase()}`}
                className={`block w-full py-2 rounded-xl text-center text-xs font-bold transition ${
                  plan.highlight
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-[#0c1a3a] text-white hover:bg-[#1e3a5f]"
                }`}
              >
                {isEn ? `Start ${plan.name}` : `Choisir ${plan.name}`}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
