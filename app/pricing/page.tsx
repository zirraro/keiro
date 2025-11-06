'use client';

import Link from 'next/link';
import Header from '@/components/Header';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 text-sm font-medium mb-6">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Offre de lancement
          </div>
          <h1 className="text-5xl font-bold mb-6">
            Choisissez votre plan et{' '}
            <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              décuplez votre visibilité
            </span>
          </h1>
          <p className="text-xl text-neutral-600 max-w-3xl mx-auto">
            Commencez gratuitement, débloquez plus de générations avec votre email,
            puis passez premium pour des visuels illimités et l'accès à toutes les fonctionnalités.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {/* Plan Gratuit */}
          <div className="bg-white rounded-2xl border-2 border-neutral-200 p-8 relative hover:shadow-lg transition-all">
            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">Essai Gratuit</h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold">0€</span>
                <span className="text-neutral-500">/toujours</span>
              </div>
              <p className="text-neutral-600 text-sm">Parfait pour découvrir Keiro</p>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>1 visuel gratuit</strong> sans inscription</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Accès aux actualités par catégories</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Export format réseaux sociaux</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-neutral-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm text-neutral-400">Studio d'édition</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-neutral-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm text-neutral-400">Librairie</span>
              </li>
            </ul>

            <Link
              href="/generate"
              className="block w-full py-3 px-6 text-center rounded-xl border-2 border-neutral-300 text-neutral-700 font-medium hover:border-neutral-400 hover:bg-neutral-50 transition-all"
            >
              Essayer gratuitement
            </Link>
          </div>

          {/* Plan Email */}
          <div className="bg-white rounded-2xl border-2 border-blue-300 p-8 relative hover:shadow-xl transition-all transform hover:scale-105">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Populaire
              </span>
            </div>

            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">Découverte</h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold">0€</span>
                <span className="text-neutral-500">/avec email</span>
              </div>
              <p className="text-neutral-600 text-sm">Débloquez plus de générations</p>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>3 visuels au total</strong> (1 gratuit + 2 avec email)</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Tout du plan Gratuit</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Accès Studio d'édition basique</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Newsletter hebdomadaire</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-neutral-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm text-neutral-400">Librairie complète</span>
              </li>
            </ul>

            <Link
              href="/generate"
              className="block w-full py-3 px-6 text-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:shadow-lg transition-all"
            >
              Débloquer avec mon email
            </Link>
          </div>

          {/* Plan Premium */}
          <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl p-8 text-white relative hover:shadow-2xl transition-all transform hover:scale-105">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-yellow-400 text-yellow-900 px-4 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Meilleure offre
              </span>
            </div>

            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">Premium</h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold">79€</span>
                <span className="text-blue-100">/mois</span>
              </div>
              <p className="text-blue-100 text-sm">Pour les créateurs de contenu</p>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm"><strong className="text-white">Visuels illimités</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-blue-50">Studio d'édition complet</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-blue-50">Librairie illimitée</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-blue-50">Exports HD sans watermark</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-blue-50">Support prioritaire</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-blue-50">API access (bientôt)</span>
              </li>
            </ul>

            <Link
              href="/generate"
              className="block w-full py-3 px-6 text-center rounded-xl bg-white text-blue-600 font-bold hover:bg-blue-50 transition-all"
            >
              Passer Premium →
            </Link>
            <p className="text-center text-blue-100 text-xs mt-3">Sans engagement • Annulation en 1 clic</p>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-10">Questions fréquentes</h2>
          <div className="space-y-4">
            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Comment fonctionne l'essai gratuit ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Vous pouvez générer 1 visuel gratuitement sans créer de compte. Pour débloquer 2 générations supplémentaires,
                il suffit de saisir votre email. Ensuite, pour continuer, vous devrez choisir un plan premium.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Puis-je annuler mon abonnement à tout moment ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Oui, absolument ! Vous pouvez annuler votre abonnement à tout moment en 1 clic depuis votre espace personnel.
                Aucun engagement, aucune pénalité.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Les visuels m'appartiennent-ils ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Oui ! Tous les visuels que vous générez avec Keiro vous appartiennent. Vous pouvez les utiliser librement
                pour vos réseaux sociaux, votre site web, vos campagnes publicitaires, etc.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Quelle est la différence entre le Studio d'édition basique et complet ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Le Studio basique (plan Découverte) permet d'ajuster la luminosité, le contraste et les couleurs.
                Le Studio complet (plan Premium) débloque toutes les fonctionnalités : effets avancés, templates personnalisés,
                exports multi-formats, et bien plus.
              </p>
            </details>
          </div>
        </div>

        {/* CTA Final */}
        <div className="mt-20 text-center bg-gradient-to-r from-blue-600 to-cyan-600 rounded-3xl p-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Prêt à transformer votre communication ?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Rejoignez les centaines de créateurs qui utilisent déjà Keiro pour booster leur présence en ligne.
          </p>
          <Link
            href="/generate"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-105"
          >
            Commencer gratuitement
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <p className="text-blue-100 text-sm mt-4">1 visuel gratuit • Sans carte bancaire • En 2 minutes</p>
        </div>
      </main>
    </div>
  );
}
