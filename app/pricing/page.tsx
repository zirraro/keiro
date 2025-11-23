'use client';

import Link from 'next/link';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">

      <main className="max-w-7xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 text-sm font-medium mb-6">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Offre de lancement - 50 places Fondateurs
          </div>
          <h1 className="text-5xl font-bold mb-6">
            Choisissez votre plan et{' '}
            <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              décuplez votre visibilité
            </span>
          </h1>
          <p className="text-xl text-neutral-600 max-w-3xl mx-auto">
            Commencez gratuitement avec 3 visuels, testez pendant 7 jours à 29€,
            ou rejoignez les Fondateurs pour verrouiller un prix à vie.
          </p>
        </div>

        {/* Top Plans - Gratuit & Essai */}
        <div className="grid md:grid-cols-2 gap-6 mb-10 max-w-4xl mx-auto">
          {/* Plan Gratuit */}
          <div className="bg-white rounded-2xl border-2 border-neutral-200 p-6 relative hover:shadow-lg transition-all">
            <div className="absolute -top-3 left-4">
              <span className="bg-neutral-100 text-neutral-600 px-3 py-1 rounded-full text-xs font-medium">
                Pour découvrir
              </span>
            </div>
            <div className="mb-6 pt-2">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span>🎁</span> Gratuit
              </h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold">0€</span>
                <span className="text-neutral-500">/toujours</span>
              </div>
              <p className="text-neutral-600 text-sm">3 visuels avec watermark</p>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>3 visuels</strong> avec watermark Keiro</span>
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
                <span className="text-sm text-neutral-400">Sans watermark</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-neutral-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm text-neutral-400">Génération vidéo</span>
              </li>
            </ul>

            <Link
              href="/generate"
              className="block w-full py-3 px-6 text-center rounded-xl border-2 border-neutral-300 text-neutral-700 font-medium hover:border-neutral-400 hover:bg-neutral-50 transition-all"
            >
              Essayer gratuitement
            </Link>
          </div>

          {/* Essai 7 jours */}
          <div className="bg-white rounded-2xl border-2 border-blue-300 p-6 relative hover:shadow-lg transition-all">
            <div className="absolute -top-3 left-4">
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                Pour tester sérieusement
              </span>
            </div>
            <div className="mb-6 pt-2">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span>💡</span> Essai 7 jours
              </h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold">29€</span>
                <span className="text-neutral-500">/7 jours</span>
              </div>
              <p className="text-neutral-600 text-sm">Déduit du 1er mois si vous continuez</p>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>Toutes les fonctionnalités</strong> Starter</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Visuels illimités sans watermark</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Studio d'édition complet</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Génération vidéo incluse</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>Bascule auto</strong> sur Starter à 199€/mois</span>
              </li>
            </ul>

            <Link
              href="/generate"
              className="block w-full py-3 px-6 text-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:shadow-lg transition-all"
            >
              Démarrer l'essai 7 jours
            </Link>
          </div>
        </div>

        {/* Premium Plans */}
        <h3 className="text-2xl font-bold text-center mb-2">Plans Premium</h3>
        <p className="text-center text-neutral-600 mb-8">Choisissez le plan adapté à vos besoins</p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {/* Fondateurs 149€ - HIGHLIGHT */}
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-amber-900 text-amber-100 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                50 places seulement
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>⭐</span> Fondateurs
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">149€</span>
                <span className="text-amber-100">/mois</span>
              </div>
              <p className="text-amber-100 text-sm font-medium">Prix verrouillé à vie</p>
            </div>
            <ul className="space-y-3 mb-6 text-sm">
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> Visuels illimités</li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> Génération vidéo illimitée</li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> Studio d'édition complet</li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> Librairie personnelle</li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> <strong>Démo personnalisée offerte</strong></li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> Support prioritaire</li>
            </ul>
            <Link href="/generate" className="block w-full py-3 text-center rounded-xl bg-white text-amber-600 font-bold hover:bg-amber-50 transition-all shadow-lg">
              Rejoindre les Fondateurs
            </Link>
            <p className="text-center text-amber-100 text-xs mt-2">Places limitées</p>
          </div>

          {/* Starter 199€ */}
          <div className="bg-white rounded-2xl border-2 border-blue-300 p-6 relative hover:shadow-xl transition-all transform hover:scale-105">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Populaire
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🚀</span> Starter
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">199€</span>
                <span className="text-neutral-500">/mois</span>
              </div>
            </div>
            <ul className="space-y-3 mb-6 text-sm">
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Visuels illimités</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Génération vidéo (10/mois)</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Studio d'édition complet</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Librairie personnelle</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> <strong>Démo personnalisée offerte</strong></li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> <strong>Garantie satisfait 30j</strong></li>
            </ul>
            <Link href="/generate" className="block w-full py-2 text-center rounded-xl border-2 border-blue-500 text-blue-600 font-medium hover:bg-blue-50 transition-all">
              Choisir Starter
            </Link>
          </div>

          {/* Pro 349€ */}
          <div className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105">
            <div className="mb-4">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>💼</span> Pro
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">349€</span>
                <span className="text-blue-100">/mois</span>
              </div>
            </div>
            <ul className="space-y-3 mb-6 text-sm">
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> Tout Starter</li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> Génération vidéo (30/mois)</li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> Calendrier de contenus</li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> Kit de style (couleurs, ton)</li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> <strong>Onboarding premium inclus</strong></li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> Support chat prioritaire</li>
            </ul>
            <Link href="/generate" className="block w-full py-2 text-center rounded-xl bg-white text-blue-600 font-bold hover:bg-blue-50 transition-all">
              Choisir Pro
            </Link>
            <p className="text-center text-blue-100 text-xs mt-2">Sans engagement</p>
          </div>

          {/* Business 599€ */}
          <div className="bg-white rounded-2xl border-2 border-neutral-200 p-6 hover:shadow-lg transition-all">
            <div className="mb-4">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🏆</span> Business
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">599€</span>
                <span className="text-neutral-500">/mois</span>
              </div>
            </div>
            <ul className="space-y-3 mb-6 text-sm">
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Tout Pro</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Génération vidéo illimitée</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Espace équipe (5 users)</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Modèles internes</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> <strong>Stratégie mensuelle incluse</strong></li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Rapports & analytics</li>
            </ul>
            <Link href="/generate" className="block w-full py-2 text-center rounded-xl border-2 border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-all">
              Choisir Business
            </Link>
          </div>
        </div>

        {/* Comparatif rapide */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 mb-16">
          <h3 className="text-2xl font-bold text-center mb-8">Comparatif rapide</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">Fonctionnalité</th>
                  <th className="text-center py-3 px-2">Gratuit</th>
                  <th className="text-center py-3 px-2">Essai 7j</th>
                  <th className="text-center py-3 px-2 bg-amber-50">Fondateurs</th>
                  <th className="text-center py-3 px-2">Starter</th>
                  <th className="text-center py-3 px-2 bg-blue-50">Pro</th>
                  <th className="text-center py-3 px-2">Business</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Visuels</td>
                  <td className="text-center py-3 px-2">3 (watermark)</td>
                  <td className="text-center py-3 px-2">Illimités</td>
                  <td className="text-center py-3 px-2 bg-amber-50">Illimités</td>
                  <td className="text-center py-3 px-2">Illimités</td>
                  <td className="text-center py-3 px-2 bg-blue-50">Illimités</td>
                  <td className="text-center py-3 px-2">Illimités</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Vidéos</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2">10/mois</td>
                  <td className="text-center py-3 px-2 bg-amber-50">Illimitées</td>
                  <td className="text-center py-3 px-2">10/mois</td>
                  <td className="text-center py-3 px-2 bg-blue-50">30/mois</td>
                  <td className="text-center py-3 px-2">Illimitées</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Studio édition</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2">✓</td>
                  <td className="text-center py-3 px-2 bg-amber-50">✓</td>
                  <td className="text-center py-3 px-2">✓</td>
                  <td className="text-center py-3 px-2 bg-blue-50">✓</td>
                  <td className="text-center py-3 px-2">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Librairie</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2">✓</td>
                  <td className="text-center py-3 px-2 bg-amber-50">✓</td>
                  <td className="text-center py-3 px-2">✓</td>
                  <td className="text-center py-3 px-2 bg-blue-50">✓</td>
                  <td className="text-center py-3 px-2">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Démo personnalisée</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2 bg-amber-50">✓</td>
                  <td className="text-center py-3 px-2">✓</td>
                  <td className="text-center py-3 px-2 bg-blue-50">✓</td>
                  <td className="text-center py-3 px-2">✓</td>
                </tr>
                <tr>
                  <td className="py-3 px-2 font-medium">Prix</td>
                  <td className="text-center py-3 px-2 font-bold">0€</td>
                  <td className="text-center py-3 px-2 font-bold">29€</td>
                  <td className="text-center py-3 px-2 bg-amber-50 font-bold text-amber-600">149€/mois</td>
                  <td className="text-center py-3 px-2 font-bold">199€/mois</td>
                  <td className="text-center py-3 px-2 bg-blue-50 font-bold text-blue-600">349€/mois</td>
                  <td className="text-center py-3 px-2 font-bold">599€/mois</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-10">Questions fréquentes</h2>
          <div className="space-y-4">
            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Comment fonctionne l'essai 7 jours à 29€ ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Vous payez 29€ pour accéder à toutes les fonctionnalités pendant 7 jours. Si vous êtes satisfait et passez sur le plan Starter,
                ces 29€ sont déduits de votre premier mois. Sinon, aucun engagement - vous gardez vos créations.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Qu'est-ce que l'offre Fondateurs ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Les 50 premiers clients bénéficient du tarif Fondateur à 149€/mois (au lieu de 199€) verrouillé à vie.
                Tant que vous restez abonné, votre prix ne changera jamais. Plus une démo personnalisée offerte pour vous accompagner.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Puis-je annuler à tout moment ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Oui, absolument ! Tous nos plans sont sans engagement. Vous pouvez annuler à tout moment en 1 clic depuis votre espace.
                Le plan Starter inclut même une garantie satisfait ou remboursé 30 jours.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Les visuels m'appartiennent-ils ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Oui ! Tous les visuels et vidéos que vous générez avec Keiro vous appartiennent. Vous pouvez les utiliser librement
                pour vos réseaux sociaux, votre site web, vos campagnes publicitaires, etc.
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
            Rejoignez les créateurs qui utilisent déjà Keiro pour booster leur présence en ligne.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/generate"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Commencer gratuitement
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/generate"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Devenir Fondateur ⭐
            </Link>
          </div>
          <p className="text-blue-100 text-sm mt-4">3 visuels gratuits • Sans carte bancaire • En 2 minutes</p>
        </div>
      </main>
    </div>
  );
}
