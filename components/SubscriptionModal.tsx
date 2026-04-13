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
      name: "Starter",
      emoji: "\u{1F680}",
      price: "49\u20AC",
      subtitle: "/mois",
      description: "Freelance & createur solo",
      features: ["400 credits/mois", "Publication auto Instagram", "Agent contenu + DM", "Studio edition"],
      highlight: true,
      badge: "Populaire",
    },
    {
      name: "Pro",
      emoji: "\u{1F4BC}",
      price: "99\u20AC",
      subtitle: "/mois",
      description: "Onboarding premium",
      features: ["Tout Starter", "30 videos/mois", "Calendrier contenus", "Kit de style"],
      highlight: false,
    },
    {
      name: "Fondateurs",
      emoji: "\u2B50",
      price: "149\u20AC",
      subtitle: "/mois",
      description: "Offre limitee",
      features: ["Visuels illimites", "Video illimitee", "Demo personnalisee", "Support prioritaire"],
      highlight: false,
      badge: "Offre limitee",
      special: true,
    },
    {
      name: "Business",
      emoji: "\u{1F3C6}",
      price: "349\u20AC",
      subtitle: "/mois",
      description: "Strategie mensuelle incluse",
      features: ["Tout Pro", "Video illimitee", "Equipe 5 users", "Analytics avances"],
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
              Debloquez toutes les fonctionnalites
            </h2>
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

        {/* Trial banner — prominent */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-2xl p-4 sm:p-5 mb-6 text-center">
          <div className="text-3xl sm:text-4xl font-black text-green-700 mb-1">
            0{'\u20AC'} pendant 7 jours
          </div>
          <p className="text-sm sm:text-base text-green-600 font-medium">
            Tous les agents IA debloques {'\u00B7'} Annulation en 1 clic a tout moment
          </p>
          <p className="text-xs text-green-500 mt-1">
            Carte requise, aucun debit pendant l&apos;essai
          </p>
        </div>

        {/* Plans */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-5 hover:shadow-lg transition-all relative ${
                plan.special
                  ? "border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50"
                  : plan.highlight
                  ? "border-2 border-[#0c1a3a]/20 bg-[#0c1a3a]/5 shadow-md"
                  : "border-neutral-200 bg-white"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                    plan.special
                      ? "bg-amber-500 text-white"
                      : "bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white"
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
                    <span className={plan.special ? "text-amber-500" : "text-[#0c1a3a]"}>{'\u2713'}</span>
                    <span className="text-neutral-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/checkout/upsell?plan=createur"
                className={`block w-full py-3 text-center text-sm font-bold rounded-xl transition min-h-[44px] ${
                  plan.special
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg"
                    : plan.highlight
                    ? "bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white hover:shadow-lg"
                    : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
                }`}
              >
                Essai gratuit 7 jours
              </Link>
              <p className="text-center text-[10px] text-neutral-400 mt-1">0{'\u20AC'} pendant 7j {'\u00B7'} Annulation en 1 clic</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-neutral-500">
          <Link href="/pricing" className="text-[#0c1a3a] hover:underline font-medium">Voir la comparaison complete</Link>
        </div>
      </div>
    </div>
  );
}
