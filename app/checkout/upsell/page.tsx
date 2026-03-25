'use client';

import { startCheckout } from '@/lib/stripe/checkout';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function UpsellContent() {
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan') || 'createur';
  const isAnnual = plan.includes('annual');

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
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-2.5 text-center">
          <p className="text-white font-bold text-xs uppercase tracking-wide">
            Offre exclusive — visible une seule fois
          </p>
        </div>

        <div className="p-5 sm:p-7">
          {/* Titre */}
          <div className="text-center mb-5">
            <h1 className="text-xl font-bold text-neutral-900 mb-1">
              Choisissez votre plan
            </h1>
            <p className="text-sm text-neutral-500">
              Cliquez sur le plan qui vous convient
            </p>
          </div>

          {/* 2 cartes cliquables */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Createur — cliquable */}
            <button
              onClick={() => startCheckout(isAnnual ? 'createur_annual' : 'createur')}
              className="border border-neutral-200 rounded-xl p-4 text-left hover:border-neutral-400 hover:shadow-md transition-all active:scale-[0.98]"
            >
              <p className="text-xs text-neutral-400 uppercase font-bold mb-1">Createur</p>
              <p className="text-xl font-bold text-neutral-900 mb-2">49€<span className="text-sm font-normal text-neutral-400">/mois</span></p>
              <ul className="text-[11px] text-neutral-600 space-y-1">
                <li>✓ 400 credits/mois</li>
                <li>✓ Publication Instagram</li>
                <li>✓ Agent contenu + DM</li>
                <li className="text-neutral-300">✗ TikTok/LinkedIn</li>
                <li className="text-neutral-300">✗ Email marketing</li>
                <li className="text-neutral-300">✗ CRM</li>
              </ul>
            </button>

            {/* Pro RECOMMANDE — cliquable */}
            <button
              onClick={() => startCheckout(isAnnual ? 'pro_annual' : 'pro', 'createur')}
              className="border-2 border-blue-500 rounded-xl p-4 text-left relative bg-blue-50/30 hover:bg-blue-50/60 hover:shadow-lg transition-all active:scale-[0.98] ring-1 ring-blue-200"
            >
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="bg-blue-600 text-white text-[9px] font-bold px-3 py-0.5 rounded-full">RECOMMANDE</span>
              </div>
              <p className="text-xs text-blue-600 uppercase font-bold mb-1">Pro <span className="text-orange-500">-40%</span></p>
              <div className="mb-2">
                <span className="text-xl font-bold text-neutral-900">59€</span>
                <span className="text-sm font-normal text-neutral-400">/mois</span>
                <span className="text-xs text-neutral-400 line-through ml-1">99€</span>
              </div>
              <ul className="text-[11px] text-neutral-700 space-y-1">
                <li className="font-semibold text-green-600">✓ 1 200 credits (3x)</li>
                <li>✓ IG + TikTok + LinkedIn</li>
                <li>✓ 10 agents IA actifs</li>
                <li className="font-semibold text-green-600">✓ Email + CRM</li>
                <li className="font-semibold text-green-600">✓ Commercial + WhatsApp</li>
              </ul>
            </button>
          </div>

          {/* Message unique de reassurance */}
          <p className="text-center text-[11px] text-neutral-400">
            0€ aujourd&apos;hui · 14 jours d&apos;essai gratuit · Annulation en 1 clic
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
