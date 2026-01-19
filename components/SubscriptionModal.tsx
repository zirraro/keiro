"use client";

import Link from "next/link";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
  if (!isOpen) return null;

  const plans = [
    {
      name: "Gratuit",
      emoji: "🎁",
      price: "0€",
      subtitle: "/toujours",
      description: "Pour découvrir",
      features: ["3 visuels avec watermark", "Accès aux actualités", "Export réseaux sociaux"],
      highlight: false,
    },
    {
      name: "Essai 7 jours",
      emoji: "💡",
      price: "29€",
      subtitle: "/7 jours",
      description: "Déduit du 1er mois",
      features: ["Fonctionnalités Starter", "Visuels illimités", "Génération vidéo", "Bascule auto Starter"],
      highlight: false,
    },
    {
      name: "Fondateurs",
      emoji: "⭐",
      price: "149€",
      subtitle: "/mois",
      description: "50 places - Prix verrouillé à vie",
      features: ["Visuels illimités", "Vidéo illimitée", "Démo personnalisée", "Support prioritaire"],
      highlight: true,
      badge: "50 places",
      special: true,
    },
    {
      name: "Starter",
      emoji: "🚀",
      price: "199€",
      subtitle: "/mois",
      description: "Garantie satisfait 30j",
      features: ["Visuels illimités", "10 vidéos/mois", "Démo personnalisée", "Studio édition"],
      highlight: true,
      badge: "Populaire",
    },
    {
      name: "Pro",
      emoji: "💼",
      price: "349€",
      subtitle: "/mois",
      description: "Onboarding premium",
      features: ["Tout Starter", "30 vidéos/mois", "Calendrier contenus", "Kit de style"],
      highlight: false,
    },
    {
      name: "Business",
      emoji: "🏆",
      price: "599€",
      subtitle: "/mois",
      description: "Stratégie mensuelle incluse",
      features: ["Tout Pro", "Vidéo illimitée", "Équipe 5 users", "Analytics"],
      highlight: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">
              Débloquez toutes les fonctionnalités
            </h2>
            <p className="text-neutral-600">
              Enregistrez vos créations dans votre galerie et accédez à toutes les fonctionnalités premium
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl border p-4 hover:shadow-lg transition-all transform hover:scale-105 relative ${
                plan.special
                  ? "border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50"
                  : plan.highlight
                  ? "border-2 border-blue-300 bg-blue-50/30"
                  : "border-neutral-200 bg-white"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    plan.special
                      ? "bg-amber-500 text-white"
                      : "bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
                  }`}>
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
                {plan.description && (
                  <p className="text-xs text-neutral-500">{plan.description}</p>
                )}
              </div>

              <ul className="space-y-1.5 mb-4">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-xs">
                    <span className={plan.special ? "text-amber-500" : "text-blue-500"}>✓</span>
                    <span className="text-neutral-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/pricing"
                className={`block w-full py-2 text-center text-xs font-semibold rounded-lg transition ${
                  plan.special
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg"
                    : plan.highlight
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg"
                    : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
                }`}
              >
                {plan.price === "0€" ? "Commencer" : "Choisir"}
              </Link>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-neutral-500">
          <p>
            Besoin d'aide pour choisir ? <Link href="/pricing" className="text-blue-600 hover:underline">Voir la comparaison complète</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
