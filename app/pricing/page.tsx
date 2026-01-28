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
            Commencez gratuitement avec 3 visuels, testez pendant 3 jours à 4.99€,
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

          {/* Sprint Fondateur 3 jours */}
          <div className="bg-white rounded-2xl border-2 border-blue-300 p-6 relative hover:shadow-lg transition-all">
            <div className="absolute -top-3 left-4">
              <span className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                ⚡ Sprint intensif
              </span>
            </div>
            <div className="mb-6 pt-2">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span>⚡</span> Sprint Fondateur
              </h3>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">4.99€</span>
                <span className="text-neutral-500">/3 jours</span>
              </div>
              <p className="text-neutral-600 text-sm font-medium">Teste intensément, décide vite</p>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>Toutes les fonctionnalités</strong> Fondateurs</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-cyan-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>TikTok débloqué</strong> 🎵 (Instagram + TikTok)</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">20 visuels + 3 vidéos pour tester</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700">Assistant IA + Analytics 2 plateformes</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-neutral-700"><strong>4.99€ déduits</strong> si tu continues (payes 144.01€ au lieu de 149€)</span>
              </li>
            </ul>

            <Link
              href="/generate"
              className="block w-full py-3 px-6 text-center rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold hover:shadow-lg transition-all hover:scale-105"
            >
              Démarrer le Sprint 3 jours ⚡
            </Link>
          </div>
        </div>

        {/* TikTok Unlock Highlight */}
        <div className="bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600 rounded-2xl p-8 mb-10 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24"></div>

          <div className="relative z-10 max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <h3 className="text-3xl font-bold mb-3 flex items-center justify-center gap-3">
                <span className="text-4xl">🎵</span> Débloquez TikTok : La Croissance Virale
              </h3>
              <p className="text-xl text-cyan-100 font-medium">
                Exclusif à partir du plan Fondateurs
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">10x</div>
                <div className="text-sm text-cyan-100">Plus de reach organique qu'Instagram</div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">100k+</div>
                <div className="text-sm text-cyan-100">Vues gratuites sur 1 vidéo virale</div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">2x</div>
                <div className="text-sm text-cyan-100">Visibilité totale (Instagram + TikTok)</div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/30">
              <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                <span>💎</span> Pourquoi TikTok change tout :
              </h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-300">✓</span>
                  <span><strong>Algorithme favorise les nouveaux créateurs</strong> - Tu pars sur un pied d'égalité</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-300">✓</span>
                  <span><strong>Public jeune + engagé + acheteur</strong> - Taux de conversion supérieur</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-300">✓</span>
                  <span><strong>1 client via TikTok = abonnement remboursé</strong> - ROI immédiat</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-300">✓</span>
                  <span><strong>Conversion image → vidéo automatique</strong> - Aucune compétence technique requise</span>
                </li>
              </ul>
            </div>

            <div className="text-center mt-6">
              <p className="text-sm text-cyan-100">
                🔥 Prix Fondateurs verrouillé à vie - TikTok inclus maintenant <strong>ET</strong> dans le futur
              </p>
            </div>
          </div>
        </div>

        {/* Premium Plans */}
        <h3 className="text-2xl font-bold text-center mb-2">Plans Premium</h3>
        <p className="text-center text-neutral-600 mb-8">Choisissez le plan adapté à vos besoins</p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {/* Solo 49€ */}
          <div className="bg-white rounded-2xl border-2 border-neutral-200 p-6 hover:shadow-lg transition-all flex flex-col">
            <div className="mb-4">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🚀</span> Solo
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">49€</span>
                <span className="text-neutral-500">/mois</span>
              </div>
              <p className="text-neutral-600 text-sm">Instagram seulement</p>
            </div>
            <ul className="space-y-3 mb-6 text-sm flex-1">
              <li className="flex gap-2"><span className="text-blue-500">✓</span> 20 visuels/mois</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> 3 vidéos/mois (test Reels)</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Publication Instagram Post</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Toutes catégories actualités</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Tous styles visuels</li>
              <li className="flex gap-2"><span className="text-blue-500">✓</span> Calendrier publications</li>
              <li className="flex gap-2 text-neutral-400"><span className="text-neutral-300">✗</span> <span className="line-through">TikTok (Fondateurs+)</span></li>
              <li className="flex gap-2 text-neutral-400"><span className="text-neutral-300">✗</span> <span className="line-through">Stories Instagram</span></li>
            </ul>
            <div className="mt-auto space-y-2">
              <Link href="/generate" className="block w-full py-3 text-center rounded-xl border-2 border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-all">
                Choisir Solo
              </Link>
              <p className="text-xs text-center text-neutral-500">
                Besoin de TikTok ? <a href="#fondateurs" className="text-cyan-600 hover:underline font-semibold">Upgrade →</a>
              </p>
            </div>
          </div>

          {/* Fondateurs 149€ - HIGHLIGHT */}
          <div id="fondateurs" className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-amber-900 text-amber-100 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                🔥 Le plus populaire
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
              <p className="text-amber-100 text-sm font-medium">Multi-plateforme + TikTok débloqué</p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold mb-1">💰 ROI : 1 client TikTok = plan payé</p>
              <p className="text-xs text-amber-100">149€ pour 2 plateformes = 2x plus de visibilité</p>
            </div>

            <ul className="space-y-3 mb-6 text-sm flex-1">
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> 80 visuels/mois</li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> <strong>12 vidéos TikTok/mois</strong> (2-3/semaine)</li>
              <li className="flex gap-2 items-start"><span className="text-yellow-300 flex-shrink-0">✓</span> <span><strong>Instagram + TikTok</strong> 🎵 (Croissance virale 10x)</span></li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> Stories Instagram incluses</li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> Assistant IA Marketing (compare tes 2 plateformes)</li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> Analytics Instagram & TikTok</li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> Calendrier + Planification auto</li>
              <li className="flex gap-2"><span className="text-yellow-300">✓</span> <strong>Prix verrouillé à vie (50 places)</strong></li>
            </ul>
            <Link href="/generate" className="block w-full py-3 text-center rounded-xl bg-white text-amber-600 font-bold hover:bg-amber-50 transition-all shadow-lg mt-auto">
              Débloquer TikTok + IA
            </Link>
            <p className="text-center text-amber-100 text-xs mt-2">🎯 Puis 199€ après les 50 premiers</p>
          </div>

          {/* Business 349€ */}
          <div className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl p-6 text-white relative hover:shadow-2xl transition-all transform hover:scale-105 flex flex-col">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-blue-900 text-blue-100 px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                Agences & Teams
              </span>
            </div>
            <div className="mb-4 pt-2">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🏢</span> Business
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">349€</span>
                <span className="text-blue-100">/mois</span>
              </div>
              <p className="text-blue-100 text-sm">Gérez 5 clients avec TikTok</p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/30">
              <p className="text-xs font-semibold mb-1">💼 ROI Agence : 150€/client = 750€ revenus</p>
              <p className="text-xs text-blue-100">Facturez TikTok + Instagram = Valeur premium</p>
            </div>

            <ul className="space-y-3 mb-6 text-sm flex-1">
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> 180 visuels/mois</li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> <strong>30 vidéos TikTok/mois</strong></li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> Tout Fondateurs +</li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> <strong>Multi-comptes (1+5 clients)</strong></li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> Calendrier collaboratif</li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> Workflow validation équipe</li>
              <li className="flex gap-2"><span className="text-cyan-300">✓</span> Reporting PDF brandé</li>
            </ul>
            <Link href="/generate" className="block w-full py-3 text-center rounded-xl bg-white text-blue-600 font-bold hover:bg-blue-50 transition-all mt-auto">
              Contacter Business
            </Link>
            <p className="text-center text-blue-100 text-xs mt-2">Démo personnalisée incluse</p>
          </div>

          {/* Elite 999€ */}
          <div className="bg-white rounded-2xl border-2 border-amber-200 p-6 hover:shadow-lg transition-all flex flex-col">
            <div className="mb-4">
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <span>🏆</span> Elite
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold">999€</span>
                <span className="text-neutral-500">/mois</span>
              </div>
              <p className="text-neutral-600 text-sm">Service premium + consulting</p>
            </div>
            <ul className="space-y-3 mb-6 text-sm flex-1">
              <li className="flex gap-2"><span className="text-amber-500">✓</span> 500 visuels/mois + 100 vidéos</li>
              <li className="flex gap-2"><span className="text-amber-500">✓</span> Tout Business +</li>
              <li className="flex gap-2"><span className="text-amber-500">✓</span> Account Manager dédié</li>
              <li className="flex gap-2"><span className="text-amber-500">✓</span> 2h/mois consulting stratégique</li>
              <li className="flex gap-2"><span className="text-amber-500">✓</span> Features custom développées</li>
              <li className="flex gap-2"><span className="text-amber-500">✓</span> Formation équipe (20 pers.)</li>
              <li className="flex gap-2"><span className="text-amber-500">✓</span> SLA 99.9% garanti</li>
            </ul>
            <Link href="/generate" className="block w-full py-3 text-center rounded-xl border-2 border-amber-300 text-amber-700 font-semibold hover:bg-amber-50 transition-all mt-auto">
              Contacter Elite
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
                  <th className="text-center py-3 px-2">Solo</th>
                  <th className="text-center py-3 px-2 bg-amber-50">Fondateurs</th>
                  <th className="text-center py-3 px-2">Business</th>
                  <th className="text-center py-3 px-2">Elite</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Visuels</td>
                  <td className="text-center py-3 px-2">3 (watermark)</td>
                  <td className="text-center py-3 px-2">20/mois</td>
                  <td className="text-center py-3 px-2 bg-amber-50">80/mois</td>
                  <td className="text-center py-3 px-2">180/mois</td>
                  <td className="text-center py-3 px-2">500/mois</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Vidéos</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2">3 (Reels test)</td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong>12 (TikTok + Reels)</strong></td>
                  <td className="text-center py-3 px-2">30</td>
                  <td className="text-center py-3 px-2">100</td>
                </tr>
                <tr className="border-b bg-cyan-50/50">
                  <td className="py-3 px-2 font-medium">🎵 TikTok</td>
                  <td className="text-center py-3 px-2 text-neutral-400">-</td>
                  <td className="text-center py-3 px-2 text-neutral-400">-</td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong className="text-cyan-600">✓ Débloqué</strong></td>
                  <td className="text-center py-3 px-2 text-cyan-600">✓</td>
                  <td className="text-center py-3 px-2 text-cyan-600">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Instagram</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2">Post uniquement</td>
                  <td className="text-center py-3 px-2 bg-amber-50"><strong>Post + Story</strong></td>
                  <td className="text-center py-3 px-2">Post + Story</td>
                  <td className="text-center py-3 px-2">Post + Story</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Assistant IA</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2 bg-amber-50">✓</td>
                  <td className="text-center py-3 px-2">✓</td>
                  <td className="text-center py-3 px-2">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Calendrier</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2">✓</td>
                  <td className="text-center py-3 px-2 bg-amber-50">✓ Auto</td>
                  <td className="text-center py-3 px-2">✓ Collaboratif</td>
                  <td className="text-center py-3 px-2">✓ Collaboratif</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2 font-medium">Multi-comptes</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2">-</td>
                  <td className="text-center py-3 px-2 bg-amber-50">-</td>
                  <td className="text-center py-3 px-2">1+5</td>
                  <td className="text-center py-3 px-2">Illimité</td>
                </tr>
                <tr>
                  <td className="py-3 px-2 font-medium">Prix</td>
                  <td className="text-center py-3 px-2 font-bold">0€</td>
                  <td className="text-center py-3 px-2 font-bold">49€/mois</td>
                  <td className="text-center py-3 px-2 bg-amber-50 font-bold text-amber-600">149€/mois*</td>
                  <td className="text-center py-3 px-2 font-bold text-blue-600">349€/mois</td>
                  <td className="text-center py-3 px-2 font-bold text-amber-700">999€/mois</td>
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
                Comment fonctionne l'essai 5 jours à 6.99€ ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Vous payez 6.99€ pour accéder à toutes les fonctionnalités Fondateurs pendant 5 jours. Si vous continuez,
                ces 6.99€ sont déduits de votre premier mois (vous payez 142.01€ au lieu de 149€). Sinon, aucun engagement - vous gardez vos créations.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Qu'est-ce que l'offre Fondateurs ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                <strong>Les 50 premières places bénéficient du tarif de 149€/mois verrouillé à vie.</strong>
                Après les 50 premiers, le prix passera à 199€/mois. Tant que vous restez abonné parmi les 50 premiers,
                votre prix de 149€ ne changera jamais. Vous bénéficiez également d'une démo personnalisée offerte pour vous accompagner.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 border border-neutral-200">
              <summary className="font-semibold cursor-pointer text-neutral-900">
                Puis-je annuler à tout moment ?
              </summary>
              <p className="mt-3 text-neutral-600 text-sm">
                Oui, absolument ! Tous nos plans sont sans engagement. Vous pouvez annuler à tout moment en 1 clic depuis votre espace.
                Tous les plans incluent une garantie satisfait ou remboursé 30 jours.
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
