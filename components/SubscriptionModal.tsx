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
      price: "0€",
      features: ["1 génération par jour", "Formats basiques", "Sans filigrane"],
      highlight: false,
    },
    {
      name: "Découverte",
      price: "0€",
      subtitle: "avec email",
      features: ["3 générations par jour", "Tous les formats", "Sans filigrane", "Accès aux news premium"],
      highlight: false,
    },
    {
      name: "Essentiel",
      price: "79€",
      subtitle: "/mois",
      features: [
        "Générations illimitées",
        "Tous les formats",
        "Studio d'édition avancé",
        "Sauvegarde dans librairie",
        "Export haute résolution",
        "Support prioritaire",
      ],
      highlight: true,
      badge: "Populaire",
    },
    {
      name: "Croissance",
      price: "198€",
      subtitle: "/mois",
      features: [
        "Tout Essentiel +",
        "Multi-utilisateurs (5)",
        "API access",
        "Templates personnalisés",
        "Analytics avancés",
        "White label",
      ],
      highlight: false,
    },
    {
      name: "Studio",
      price: "499€",
      subtitle: "/mois",
      features: [
        "Tout Croissance +",
        "Utilisateurs illimités",
        "Account manager dédié",
        "Intégrations custom",
        "Formation équipe",
        "SLA garanti",
      ],
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
              Enregistrez vos créations dans votre librairie et accédez à toutes les fonctionnalités premium
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
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl border p-4 hover:shadow-lg transition-all transform hover:scale-105 relative ${
                plan.highlight
                  ? "border-2 border-blue-300 bg-blue-50/30"
                  : "border-neutral-200 bg-white"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-3">
                <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.subtitle && <span className="text-sm text-neutral-500">{plan.subtitle}</span>}
                </div>
              </div>

              <ul className="space-y-2 mb-4">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs">
                    <span className="text-blue-500 mt-0.5">✓</span>
                    <span className="text-neutral-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/pricing"
                className={`block w-full py-2 text-center text-sm font-semibold rounded-lg transition ${
                  plan.highlight
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg"
                    : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
                }`}
              >
                {plan.price === "0€" ? "Commencer" : "Souscrire"}
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
