'use client';

import { startCheckout } from '@/lib/stripe/checkout';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function UpsellContent() {
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan') || 'createur';
  const isAnnual = plan.includes('annual');

  // Si c'est pas createur, aller direct au checkout
  if (!plan.startsWith('createur')) {
    startCheckout(plan);
    return (
      <div className="min-h-dvh flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">Redirection vers le paiement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#0c1a3a] to-[#1e3a5f] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-3 text-center">
          <p className="text-white font-bold text-sm uppercase tracking-wide">
            Offre exclusive — visible une seule fois
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {/* Titre */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🚀</div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              Avant de commencer...
            </h1>
            <p className="text-neutral-600">
              Pour seulement <span className="font-bold text-green-600">10€/mois de plus</span>,
              passez au <span className="font-bold">Plan Pro</span> avec
              <span className="font-bold text-orange-600"> -40% le 1er mois</span>
            </p>
          </div>

          {/* Comparaison */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* Createur */}
            <div className="border border-neutral-200 rounded-xl p-4">
              <p className="text-xs text-neutral-400 uppercase font-bold mb-1">Createur</p>
              <p className="text-lg font-bold text-neutral-900 mb-2">49€<span className="text-sm font-normal text-neutral-400">/mois</span></p>
              <ul className="text-xs text-neutral-600 space-y-1">
                <li>✓ 400 credits/mois</li>
                <li>✓ Publication Instagram</li>
                <li>✓ Agent contenu + DM</li>
                <li className="text-neutral-300">✗ Pas de TikTok/LinkedIn</li>
                <li className="text-neutral-300">✗ Pas d&apos;email marketing</li>
                <li className="text-neutral-300">✗ Pas de CRM</li>
              </ul>
            </div>

            {/* Pro */}
            <div className="border-2 border-blue-500 rounded-xl p-4 relative bg-blue-50/30">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="bg-blue-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full">RECOMMANDE</span>
              </div>
              <p className="text-xs text-blue-600 uppercase font-bold mb-1">Pro</p>
              <div className="mb-2">
                <span className="text-lg font-bold text-neutral-900">59€</span>
                <span className="text-sm font-normal text-neutral-400">/mois</span>
                <span className="text-xs text-neutral-400 line-through ml-1">99€</span>
              </div>
              <ul className="text-xs text-neutral-700 space-y-1">
                <li className="font-semibold text-green-600">✓ 1 200 credits (3x plus)</li>
                <li>✓ Instagram + TikTok + LinkedIn</li>
                <li>✓ 10 agents IA actifs</li>
                <li className="font-semibold text-green-600">✓ Email marketing (HUGO)</li>
                <li className="font-semibold text-green-600">✓ CRM + pipeline vente</li>
                <li className="font-semibold text-green-600">✓ Agent commercial + WhatsApp</li>
              </ul>
            </div>
          </div>

          {/* Reassurance 0€ */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 text-center">
            <p className="text-green-800 font-bold text-sm">
              Dans les 2 cas : 0€ aujourd&apos;hui
            </p>
            <p className="text-green-700 text-xs mt-1">
              14 jours d&apos;essai gratuit · Carte requise mais pas debitee · Annulation en 1 clic
            </p>
          </div>

          {/* Urgence */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-center">
            <p className="text-amber-800 text-xs font-semibold">
              Cette offre ne sera plus proposee apres cette page.
            </p>
          </div>

          {/* CTA Pro */}
          <button
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-base shadow-lg hover:opacity-90 transition"
            onClick={() => startCheckout(isAnnual ? 'pro_annual' : 'pro', 'createur')}
          >
            Oui, je prends le Pro a -40%
          </button>
          <p className="text-center text-[10px] text-neutral-400 mt-1.5 mb-4">
            0€ aujourd&apos;hui · 59€/mois apres 14 jours · Annulation en 1 clic
          </p>

          {/* CTA Createur */}
          <button
            className="w-full py-3 rounded-xl border border-neutral-200 text-neutral-500 text-sm hover:bg-neutral-50 transition"
            onClick={() => startCheckout(isAnnual ? 'createur_annual' : 'createur')}
          >
            Non merci, continuer avec Createur a 49€/mois
          </button>
          <p className="text-center text-[10px] text-neutral-400 mt-1.5">
            0€ aujourd&apos;hui · 49€/mois apres 14 jours · Annulation en 1 clic
          </p>
        </div>
      </div>
    </div>
  );
}

export default function UpsellPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">Chargement...</p>
      </div>
    }>
      <UpsellContent />
    </Suspense>
  );
}
