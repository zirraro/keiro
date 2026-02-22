'use client';

import { useState } from 'react';
import BookDemoButton from '@/components/BookDemoButton';

export default function HomeKeiro() {
  return (
    <main className="min-h-dvh bg-white">
      {/* HERO */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-12">
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
              Nouveau : visuels liés à l'actualité en 5–10 minutes
            </div>
            <h1 className="mt-4 text-4xl/tight md:text-5xl/tight font-semibold">
              Des visuels qui surfent sur l'actualité — <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">en quelques minutes</span>.
            </h1>
            <p className="mt-4 text-lg text-neutral-600">
              Choisis une actu, décris ton activité en 2–3 infos, Keiro te propose un angle,
              rédige un texte propre et génère un visuel cohérent prêt à publier.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/generate" className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg hover:scale-105 transition-all">
                Essayer gratuitement
              </a>
              <a href="#exemple" className="px-5 py-3 rounded-xl border border-blue-200 hover:bg-blue-50 transition-colors">
                Voir un exemple
              </a>
              <BookDemoButton variant="outline" size="md" />
            </div>
            <ul className="mt-6 grid sm:grid-cols-3 gap-4 text-sm">
              <li className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-blue-900">
                <span className="text-blue-500 mr-1">✓</span> Orthographe & accroches soignées
              </li>
              <li className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-blue-900">
                <span className="text-blue-500 mr-1">✓</span> Exports adaptés aux réseaux
              </li>
              <li className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-blue-900">
                <span className="text-blue-500 mr-1">✓</span> Ajustements instantanés
              </li>
            </ul>
          </div>
          <div className="lg:col-span-5">
            {/* Assistant IA Preview Card */}
            <div className="rounded-2xl border-2 border-blue-200 shadow-lg overflow-hidden bg-white">
              <div className="p-5 border-b border-blue-200 bg-blue-50/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl">
                    🤖
                  </div>
                  <div>
                    <h3 className="font-bold text-blue-900">Assistant IA Marketing</h3>
                    <p className="text-xs text-blue-600">Optimise tes posts en temps réel</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-3">
                {/* Stats cards mini */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <div className="text-xs text-blue-600 font-medium">Engagement</div>
                    <div className="text-xl font-bold text-blue-900">+347%</div>
                    <div className="text-[10px] text-blue-600">↗ +28% vs semaine</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <div className="text-xs text-blue-600 font-medium">Posts analysés</div>
                    <div className="text-xl font-bold text-blue-900">24</div>
                    <div className="text-[10px] text-blue-600">6 graphiques live</div>
                  </div>
                </div>

                {/* Insight preview */}
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">🎯</span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-blue-900 mb-1">Recommandation IA</p>
                      <p className="text-[11px] text-neutral-700 leading-relaxed">
                        Tes posts "Tech" génèrent <strong className="text-blue-600">3.2x plus d'engagement</strong>.
                        Publie 3 posts cette semaine <strong>Mardi 18h</strong> et <strong>Jeudi 12h</strong>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-600 rounded-lg p-3 text-center">
                  <p className="text-xs font-bold text-white">✨ Insights personnalisés à ton business</p>
                </div>
              </div>

              <div className="p-3 bg-white border-t border-blue-200 text-center">
                <a href="/assistant" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  Découvrir l'Assistant IA →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OFFRE D'ESSAI 4.99€ - MIS EN AVANT */}
      <section className="bg-blue-600 py-4 border-y border-blue-700">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-white">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚡</span>
              <div>
                <p className="font-semibold">Sprint Fondateur: 3 jours pour 4.99€</p>
                <p className="text-xs text-blue-100">Accès complet • 4.99€ déduits si tu continues</p>
              </div>
            </div>
            <a href="https://buy.stripe.com/fZu9ASfHb8iB1qidFobAs01" target="_blank" rel="noopener noreferrer" className="px-5 py-2 rounded-lg bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-all text-sm whitespace-nowrap">
              Essayer maintenant →
            </a>
          </div>
        </div>
      </section>

      {/* QUIZ INTERACTIF + ROI CALCULATOR */}
      <QuizAndCalculator />

      {/* VIDÉO WORKFLOW - Compact version */}
      <section className="bg-gradient-to-br from-blue-50/50 to-cyan-50/50 border-b border-blue-100">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Texte + Video à gauche */}
            <div className="md:w-2/5">
              <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                <span>🎬</span>
                <span>Voyez Keiro en action</span>
              </h3>
              <p className="text-sm text-neutral-600 mb-4">
                De l'actualité au post Instagram & TikTok en 3 minutes chrono
              </p>

              {/* Vidéo compacte */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="relative bg-neutral-900 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center mx-auto hover:scale-110 transition-transform cursor-pointer">
                      <svg className="w-7 h-7 ml-0.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Points clés à droite */}
            <div className="md:w-3/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 border border-blue-100 shadow-sm">
                <div className="text-xl mb-1">⚡</div>
                <div className="font-semibold text-xs mb-0.5">3 minutes</div>
                <div className="text-[10px] text-neutral-600">Du choix de l'actu au visuel final</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100 shadow-sm">
                <div className="text-xl mb-1">🎯</div>
                <div className="font-semibold text-xs mb-0.5">Zéro compétence</div>
                <div className="text-[10px] text-neutral-600">L'IA fait tout le travail créatif</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100 shadow-sm">
                <div className="text-xl mb-1">📈</div>
                <div className="font-semibold text-xs mb-0.5">Résultats mesurables</div>
                <div className="text-[10px] text-neutral-600">Analytics intégrés pour optimiser</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMMENT ÇA MARCHE */}
      <section className="border-y bg-neutral-50/60">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="text-2xl font-semibold">Comment ça marche</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-6">
            <Step num="1" title="Choisis une actu">
              Parcours les catégories (économie, sport, tech, lifestyle…) et sélectionne une actualité.
            </Step>
            <Step num="2" title="Décris ton activité">
              Type d'offre, cible, ton souhaité. Keiro propose un angle pertinent, sans fautes.
            </Step>
            <Step num="3" title="Génère & ajuste">
              Lumière, ambiance, éléments visuels… Export en formats réseaux en 1 clic.
            </Step>
          </div>
        </div>
      </section>

      {/* GALERIE & POSTS MULTI-PLATEFORME */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold">Galerie & Publication Multi-Plateforme</h2>
          <p className="mt-2 text-neutral-600">Organise tes visuels et publie sur Instagram & TikTok avec descriptions IA</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Galerie preview */}
          <div className="rounded-2xl border-2 border-blue-200 overflow-hidden bg-white shadow-lg">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-4">
              <h3 className="text-white font-bold flex items-center gap-2">
                <span>📁</span> Ta Galerie Organisée
              </h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1533750516457-a7f992034fec?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                  <img
                    src="https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=400&auto=format&fit=crop"
                    alt="Exemple visuel"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>Dossiers personnalisés avec icônes</span>
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>Drag & drop pour organiser</span>
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>Édition des titres en 1 clic</span>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-platform automation preview */}
          <div className="rounded-2xl border-2 border-blue-200 overflow-hidden bg-white shadow-lg">
            <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 p-4">
              <h3 className="text-white font-bold flex items-center gap-2">
                <span>📱</span> Posts Instagram & TikTok IA
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-white rounded-lg p-3 border border-blue-200">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">✨</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-900">Caption générée automatiquement</p>
                    <p className="text-[11px] text-neutral-600 mt-1">
                      "🔥 Cette semaine, on parle de [ton sujet]...<br/>
                      ✅ 3 actions concrètes<br/>
                      💡 Conseil d'expert"
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-200">
                <div className="flex items-start gap-2">
                  <span className="text-lg">#️⃣</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-900">Hashtags optimisés</p>
                    <p className="text-[11px] text-blue-600 mt-1">
                      #businesslocal #entrepreneurfr #marketing2026
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>Publication Instagram (Post & Story)</span>
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>Publication TikTok (vidéos 9:16)</span>
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <span>✓</span>
                  <span>Brouillons & édition avant publication</span>
                </div>
              </div>
            </div>
            <div className="p-3 bg-white border-t border-blue-200 text-center">
              <a href="/library" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                Voir ma Galerie & Posts →
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-gradient-to-r from-purple-50 via-pink-50 to-cyan-50 rounded-2xl border-2 border-blue-200 p-6 text-center">
          <p className="text-sm text-blue-900">
            <strong>🚀 Multi-plateforme automatique :</strong> Publie le même visuel sur Instagram (Post & Story) et TikTok (vidéo) en un clic.
            L'IA génère des descriptions adaptées à chaque plateforme et ton business.
          </p>
        </div>

        {/* CTA après Galerie */}
        <div className="mt-10 text-center">
          <a href="/generate" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105">
            Essayer gratuitement →
          </a>
          <p className="mt-3 text-sm text-neutral-600">
            🚀 Génère ton premier visuel en 5 minutes • 7 jours gratuits
          </p>
        </div>
      </section>

      {/* EXEMPLE CONCRET AVANT/APRÈS */}
      <section id="exemple" className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold">De la photo smartphone amateur au visuel professionnel Instagram</h2>
          <p className="mt-2 text-neutral-600">Transformation réelle : Coach sportif qui utilise Keiro</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* AVANT - Vraiment amateur */}
          <div className="relative">
            <div className="absolute -top-3 -left-3 bg-neutral-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg z-10">
              ❌ AVANT - Amateur
            </div>
            <div className="rounded-2xl border-2 border-neutral-300 overflow-hidden bg-white">
              {/* Selfie miroir super amateur */}
              <div className="relative bg-neutral-200">
                <img
                  src="https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=40&w=800&auto=format&fit=crop"
                  alt="Selfie miroir salle de sport amateur"
                  className="w-full aspect-square object-cover opacity-85 brightness-110"
                />
              </div>

              {/* Caption Instagram fade */}
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-red-500"></div>
                  <span className="text-sm font-semibold">coach_maxime</span>
                </div>
                <p className="text-sm text-neutral-600">
                  Nouvelle année, nouveaux objectifs 💪<br/>
                  Venez vous entraîner !<br/><br/>
                  #sport #fitness #coach
                </p>
                <div className="pt-2 border-t border-neutral-200">
                  <p className="text-xs text-neutral-500">👁️ 18 vues • 💬 1 commentaire • 📢 Portée faible</p>
                </div>
              </div>

              {/* Résultat */}
              <div className="bg-neutral-100 p-4 text-center border-t border-neutral-200">
                <p className="text-sm font-semibold text-neutral-700">😴 Selfie miroir, lumière horrible, message bateau</p>
                <p className="text-xs text-neutral-500 mt-1">Le scroll continue... Zéro impact.</p>
              </div>
            </div>
          </div>

          {/* APRÈS - Overlay simple et réaliste Keiro */}
          <div className="relative">
            <div className="absolute -top-3 -left-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg z-10 animate-pulse">
              ✨ APRÈS - Keiro Pro
            </div>
            <div className="rounded-2xl border-2 border-blue-400 overflow-hidden bg-white shadow-2xl">
              {/* Image pro avec overlay SIMPLE et RÉALISTE */}
              <div className="relative">
                <img
                  src="https://images.unsplash.com/photo-1534258936925-c58bed479fcb?q=95&w=800&auto=format&fit=crop"
                  alt="Visuel pro créé avec Keiro"
                  className="w-full aspect-square object-cover"
                />
                {/* Overlay Keiro - Style discret et professionnel */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                  <div className="bg-black/70 backdrop-blur-sm px-8 py-4 rounded-xl">
                    <h3 className="text-2xl md:text-3xl font-bold text-white text-center">
                      30 jours pour tout changer
                    </h3>
                  </div>
                </div>
              </div>

              {/* Caption Instagram optimisée par IA */}
              <div className="p-4 space-y-3 bg-gradient-to-b from-white to-blue-50/30">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 ring-2 ring-blue-300"></div>
                  <span className="text-sm font-semibold">coach_maxime</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Créé avec Keiro</span>
                </div>
                <p className="text-sm text-neutral-800 leading-relaxed">
                  <span className="font-bold text-blue-600">Nouvelle année = nouveau corps ?</span> 💪<br/><br/>

                  Mon programme Janvier 2026 démarre lundi :<br/>
                  ✅ 4 séances/semaine<br/>
                  ✅ Plan nutrition inclus<br/>
                  ✅ Suivi perso quotidien<br/><br/>

                  <span className="font-bold">Résultats garantis en 30 jours</span><br/>
                  (ou remboursé)<br/><br/>

                  📲 Réserve ta place (lien en bio)<br/>
                  <span className="text-xs text-neutral-600">Places limitées - Déjà 8 inscrits</span>
                </p>
                <p className="text-xs text-blue-600 font-medium">#transformation #coaching #fitness #musculation #objectif2026 #motivation #sport #nutrition #resultat</p>
                <div className="pt-2 border-t border-blue-200">
                  <p className="text-xs text-blue-600 font-bold">🔥 1 124 vues • 💬 73 commentaires • 📢 Portée x28 • 🎯 8 inscriptions</p>
                </div>
              </div>

              {/* Résultat */}
              <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-4 text-center border-t-2 border-cyan-400">
                <p className="text-sm font-bold text-white">🚀 Visuel pro + Texte simple et percutant + Résultats</p>
                <p className="text-xs text-white/90 mt-1">Le scroll s'arrête. Les gens comprennent direct et passent à l'action.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Explication sous les images */}
        <div className="mt-8 bg-blue-50 rounded-2xl border border-blue-200 p-6">
          <h3 className="text-lg font-bold text-blue-900 mb-3">🎯 Ce qui change tout :</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">Texte simple dans carré arrondi</p>
                <p className="text-xs text-blue-700">Réaliste, faisable sur Keiro en 2 clics</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">Image pro vs selfie miroir</p>
                <p className="text-xs text-blue-700">Contraste énorme, crédibilité x10</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">Message clair et direct</p>
                <p className="text-xs text-blue-700">On comprend l'offre en 3 secondes</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 text-center">
          <a href="/generate" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105">
            Générer mon premier visuel →
          </a>
        </div>
      </section>

      {/* ASSISTANT IA MARKETING */}
      <section className="border-y bg-blue-50">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium mb-4">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
              Intelligence Artificielle Avancée
            </div>
            <h2 className="text-3xl font-bold">🤖 Ton Assistant IA Marketing Personnel</h2>
            <p className="mt-2 text-neutral-600">Analyse tes performances et t'aide à prendre les meilleures décisions stratégiques</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Analytics Dashboard Preview */}
            <div className="rounded-2xl border-2 border-blue-200 overflow-hidden bg-white shadow-xl">
              <div className="bg-blue-600 p-5">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <span>📊</span> Dashboard Analytics Complet
                </h3>
                <p className="text-purple-100 text-sm mt-1">6 graphiques en temps réel</p>
              </div>

              <div className="p-5 space-y-4">
                {/* Stats cards preview */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                    <div className="text-xs text-blue-700 font-semibold mb-1">Cette semaine</div>
                    <div className="text-2xl font-bold text-blue-900">12</div>
                    <div className="text-xs text-blue-600">visuels générés</div>
                  </div>
                  <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-4 border border-cyan-200">
                    <div className="text-xs text-cyan-700 font-semibold mb-1">Engagement</div>
                    <div className="text-2xl font-bold text-cyan-900">347</div>
                    <div className="text-xs text-blue-600 font-semibold">↗ +40%</div>
                  </div>
                </div>

                {/* Charts preview */}
                <div className="space-y-3">
                  <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                    <p className="text-xs font-semibold text-neutral-700 mb-2">📈 Évolution de l'engagement</p>
                    <div className="h-20 bg-gradient-to-r from-blue-100 to-cyan-100 rounded flex items-end justify-around p-2">
                      {[40, 60, 45, 80, 70, 95].map((h, i) => (
                        <div key={i} className="bg-blue-500 rounded-t" style={{ height: `${h}%`, width: '12%' }}></div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                    <p className="text-xs font-semibold text-neutral-700 mb-2">🕐 Meilleurs horaires de publication</p>
                    <div className="h-16 bg-gradient-to-r from-cyan-100 to-blue-100 rounded flex items-center justify-center">
                      <p className="text-xs text-cyan-700 font-semibold">17h-19h = 85% meilleur engagement</p>
                    </div>
                  </div>

                  <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                    <p className="text-xs font-semibold text-neutral-700 mb-2">🏆 Top catégories</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-blue-500 rounded" style={{ width: '80%' }}></div>
                        <span className="text-[10px] text-neutral-600">Tech</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-blue-400 rounded" style={{ width: '60%' }}></div>
                        <span className="text-[10px] text-neutral-600">Business</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                  <p className="text-xs text-blue-700 font-semibold">+ 3 autres graphiques détaillés</p>
                  <p className="text-[10px] text-blue-600 mt-1">Taux de conversion • Croissance abonnés • Performance horaire</p>
                </div>
              </div>
            </div>

            {/* AI Insights Preview */}
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-blue-200 overflow-hidden bg-white shadow-xl">
                <div className="bg-blue-600 p-5">
                  <h3 className="text-white font-bold text-lg flex items-center gap-2">
                    <span>🎯</span> Recommandations Stratégiques
                  </h3>
                  <p className="text-purple-100 text-sm mt-1">Personnalisées à ton business</p>
                </div>

                <div className="p-5 space-y-3">
                  {/* Insight 1 */}
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-2xl">🎯</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-blue-900 mb-1">Stratégie secteur adaptée</p>
                        <p className="text-xs text-neutral-700 leading-relaxed mb-2">
                          Pour ton activité <strong>Business</strong>, les contenus "Tech" génèrent
                          <strong className="text-blue-600"> 3.2x plus d'engagement</strong> que la moyenne.
                        </p>
                        <div className="bg-blue-100 rounded p-2">
                          <p className="text-[10px] text-blue-800">
                            💡 Publie 3 posts "Tech" cette semaine <strong>Mardi 18h</strong> et <strong>Jeudi 12h</strong>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Insight 2 */}
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-2xl">⏰</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-blue-900 mb-1">Timing optimal détecté</p>
                        <p className="text-xs text-neutral-700 leading-relaxed mb-2">
                          Posts entre <strong>17h-19h</strong> obtiennent
                          <strong className="text-blue-600"> +85% d'engagement</strong>
                        </p>
                        <div className="bg-blue-100 rounded p-2">
                          <p className="text-[10px] text-blue-800">
                            ⚡ Reprogramme pour <strong>Mardi 18h15</strong> et <strong>Jeudi 18h30</strong>. Impact estimé : <strong>+420 vues/post</strong>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Insight 3 */}
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-2xl">🔮</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-blue-900 mb-1">Projection de croissance</p>
                        <p className="text-xs text-neutral-700 leading-relaxed mb-2">
                          En appliquant ces optimisations : <strong className="text-blue-600">+2 800 abonnés</strong> et
                          <strong className="text-blue-600"> +15 000 vues</strong> dans 90 jours
                        </p>
                        <div className="bg-blue-100 rounded p-2">
                          <p className="text-[10px] text-blue-800">
                            ✨ Potentiel : <strong>+180% de croissance</strong> avec stratégie accélérée
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Features list */}
              <div className="bg-white rounded-2xl border-2 border-blue-200 p-5 shadow-lg">
                <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                  <span>✨</span> Fonctionnalités incluses
                </h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span className="text-neutral-700"><strong>6 graphiques interactifs</strong> mis à jour en temps réel</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span className="text-neutral-700"><strong>Analyse IA de 30 jours</strong> comparée à 500K+ posts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span className="text-neutral-700"><strong>Recommandations horaires</strong> précises par jour</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span className="text-neutral-700"><strong>Benchmark sectoriel</strong> personnalisé</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span className="text-neutral-700"><strong>Projections 90 jours</strong> avec plans d'action</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-10 text-center">
            <a href="/assistant" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-blue-600 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105">
              Découvrir Mon Assistant IA →
            </a>
            <p className="mt-3 text-sm text-blue-700">
              💡 Disponible dès le plan Starter • Analytics détaillées • Insights quotidiens
            </p>
          </div>
        </div>
      </section>

      {/* TÉMOIGNAGES CLIENTS */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-2">Ce que disent nos premiers utilisateurs</h2>
          <p className="text-neutral-600">Retours d'expérience de nos early adopters</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Témoignage 1 */}
          <div className="bg-white rounded-2xl border-2 border-blue-100 p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-1 mb-4 text-purple-400">
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
            </div>
            <p className="text-neutral-700 mb-4 leading-relaxed">
              "Avec Keiro, je publie <strong>3× plus régulièrement</strong> qu'avant.
              Mes DM ont explosé et j'ai <strong>converti 8 nouveaux clients</strong> ce mois-ci.
              L'outil indispensable pour mon restaurant !"
            </p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                M
              </div>
              <div>
                <div className="font-bold text-neutral-900">Marie Dubois</div>
                <div className="text-sm text-neutral-600">Le Bistrot du Port</div>
              </div>
            </div>
          </div>

          {/* Témoignage 2 */}
          <div className="bg-white rounded-2xl border-2 border-blue-100 p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-1 mb-4 text-blue-400">
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
            </div>
            <p className="text-neutral-700 mb-4 leading-relaxed">
              "Fini les 2h de galère sur Canva ! Maintenant, je crée un visuel pro en <strong>5 minutes chrono</strong>.
              L'IA comprend exactement mon business et mes clients. Un gain de temps immense."
            </p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                T
              </div>
              <div>
                <div className="font-bold text-neutral-900">Thomas Legrand</div>
                <div className="text-sm text-neutral-600">Coach Move&Fit</div>
              </div>
            </div>
          </div>

          {/* Témoignage 3 */}
          <div className="bg-white rounded-2xl border-2 border-blue-100 p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-1 mb-4 text-blue-400">
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
              <span>⭐</span>
            </div>
            <p className="text-neutral-700 mb-4 leading-relaxed">
              "J'ai économisé <strong>1,500€/mois</strong> en arrêtant mon graphiste freelance.
              Keiro génère des visuels aussi qualitatifs, mais en quelques clics.
              L'Assistant IA m'aide même à optimiser mes horaires de publication !"
            </p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                S
              </div>
              <div>
                <div className="font-bold text-neutral-900">Sophie Martin</div>
                <div className="text-sm text-neutral-600">Boutique SophieStyle</div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA après témoignages */}
        <div className="mt-10 text-center">
          <a href="/generate" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105">
            Devenir early adopter →
          </a>
          <p className="mt-3 text-sm text-neutral-600">
            ✨ 7 jours d'essai gratuit • Sans engagement • Annulation en 1 clic
          </p>
        </div>
      </section>

      {/* POURQUOI PUBLIER SUR L'ACTU */}
      <section className="border-y bg-neutral-50/60">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="text-2xl font-semibold">Pourquoi publier sur l’actualité ?</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-6 text-neutral-700">
            <Card>Plus de portée naturelle : les plateformes boostent les contenus liés aux tendances.</Card>
            <Card>Plus de régularité : tu produis vite, donc tu publies souvent.</Card>
            <Card>Plus de clarté : orthographe, structure, accroche et appel à l’action soignés.</Card>
          </div>
        </div>
      </section>

      {/* COMPARATIF AU MOIS */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-2xl font-semibold">Keiro vs. graphiste “par campagne” (au mois)</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Hypothèse réaliste&nbsp;: <b>4 campagnes / mois</b> (hebdo) + 1–2 variantes chacune.
        </p>
        <div className="mt-6 overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left p-3">Critère</th>
                <th className="text-left p-3">Keiro</th>
                <th className="text-left p-3">Graphiste/Studio (par campagne)</th>
              </tr>
            </thead>
            <tbody className="[&_td]:p-3 [&_tr:nth-child(even)]:bg-neutral-50/40">
              <tr>
                <td>Délai de production</td>
                <td><b>5–10 minutes</b></td>
                <td>2–5 jours</td>
              </tr>
              <tr>
                <td>Ajustements</td>
                <td><b>Illimités, instantanés</b></td>
                <td>Payants ou limités</td>
              </tr>
              <tr>
                <td>Coût au mois</td>
                <td><b>Forfait</b> (voir offres)</td>
                <td><b>1 200€ à 4 800€</b> (4× 300–1 200€)</td>
              </tr>
              <tr>
                <td>Réactivité sur l’actu</td>
                <td><b>Immédiate</b></td>
                <td>Dépend des dispos</td>
              </tr>
              <tr>
                <td>Cohérence & texte</td>
                <td>Guidage + relecture</td>
                <td>À briefer / revoir</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* CTA après Comparatif */}
        <div className="mt-10 text-center">
          <a href="/generate" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105">
            Commencer maintenant →
          </a>
          <p className="mt-3 text-sm text-neutral-600">
            💰 Économise jusqu'à 1,800€/mois vs. graphiste • 7 jours gratuits
          </p>
        </div>
      </section>

      {/* PRICING */}
      <section className="border-y bg-neutral-50/60">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold mb-6 shadow-lg">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
              Offre de lancement - 50 places Fondateurs
            </div>
            <h2 className="text-4xl font-bold mb-4">Offres & Tarifs</h2>
            <p className="text-lg text-neutral-600">
              Choisissez le plan qui correspond à vos besoins
            </p>
          </div>

          {/* Plans Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Plan
              title="🎁 Gratuit"
              price="0€"
              subtitle="15 crédits — Pour découvrir"
              bullets={[
                '15 crédits (3 images/mois)',
                'Avec watermark Keiro',
                'Export réseaux sociaux',
                'Pas de vidéo ni IA avancée'
              ]}
              ctaLabel="Essayer gratuitement"
            />

            <Plan
              title="🚀 Solo"
              price="49€ / mois"
              subtitle="220 crédits — Pour créateurs"
              bullets={[
                '220 crédits/mois',
                'Images + vidéos sans watermark',
                'Instagram + LinkedIn (Post)',
                '20 msg Assistant IA',
                'Suggestions texte IA',
                'Calendrier publications'
              ]}
              ctaLabel="Choisir Solo"
              ctaHref="https://buy.stripe.com/5kQ28q7aF7ex5Gy1WGbAs02"
            />

            <Plan
              title="⭐ Fondateurs"
              price="149€ / mois"
              subtitle="660 crédits — 3x plus que Solo"
              special
              highlight
              bullets={[
                '660 crédits/mois (3x Solo)',
                'Instagram + TikTok + LinkedIn',
                'Stories Instagram incluses',
                '50 msg Assistant IA Marketing',
                'Suggestions texte + audio IA',
                'Analytics + Planification auto',
                'Prix verrouillé à vie (50 places)'
              ]}
              ctaLabel="Débloquer TikTok + 3x crédits"
              ctaHref="https://buy.stripe.com/6oUbJ03Yt2Yhb0S6cWbAs00"
            />

            <Plan
              title="🏢 Business"
              price="349€ / mois"
              subtitle="1 750 crédits — Pour agences"
              bullets={[
                '1 750 crédits/mois',
                '~350 images ou 70 vidéos 5s',
                'Tout Fondateurs +',
                'Multi-comptes (1+5 clients)',
                'Calendrier collaboratif',
                'Workflow validation + Reporting PDF'
              ]}
              ctaLabel="Choisir Business"
              ctaHref="https://buy.stripe.com/14AdR80Mh7ex4Cu6cWbAs03"
            />
          </div>

          <p className="text-center text-xs text-neutral-500 mb-6">
            *Fondateurs : 149€/mois pour les 50 premiers inscrits, ensuite 199€/mois
          </p>

          {/* Elite Plan - Séparé */}
          <div className="max-w-4xl mx-auto relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold rounded-full z-10">
              PREMIUM
            </div>
            <div className="rounded-xl p-6 border-2 border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 shadow-xl">
              <h3 className="text-xl font-bold mb-2">🏆 Elite</h3>
              <div className="text-3xl font-black mb-1">999€ / mois</div>
              <p className="text-sm text-neutral-600 mb-6">5 500 crédits/mois — Service premium avec consulting</p>
              <ul className="grid md:grid-cols-2 gap-3 mb-6">
                <li className="text-sm flex items-start gap-2">
                  <span className="text-purple-600 font-bold text-lg">✓</span>
                  <span>5 500 crédits/mois (~1100 images ou 220 vidéos)</span>
                </li>
                <li className="text-sm flex items-start gap-2">
                  <span className="text-purple-600 font-bold text-lg">✓</span>
                  <span>Tout Business +</span>
                </li>
                <li className="text-sm flex items-start gap-2">
                  <span className="text-purple-600 font-bold text-lg">✓</span>
                  <span>Account Manager dédié personnel</span>
                </li>
                <li className="text-sm flex items-start gap-2">
                  <span className="text-purple-600 font-bold text-lg">✓</span>
                  <span>2h/mois consulting stratégique inclus</span>
                </li>
                <li className="text-sm flex items-start gap-2">
                  <span className="text-purple-600 font-bold text-lg">✓</span>
                  <span>Développement features custom</span>
                </li>
                <li className="text-sm flex items-start gap-2">
                  <span className="text-purple-600 font-bold text-lg">✓</span>
                  <span>Formation équipe (jusqu'à 20 personnes)</span>
                </li>
                <li className="text-sm flex items-start gap-2">
                  <span className="text-purple-600 font-bold text-lg">✓</span>
                  <span>Priority lane (nouveautés en avant-première)</span>
                </li>
                <li className="text-sm flex items-start gap-2">
                  <span className="text-purple-600 font-bold text-lg">✓</span>
                  <span>SLA 99.9% garanti</span>
                </li>
              </ul>
              <a
                href="https://buy.stripe.com/7sY14mgLf1Ud7OG9p8bAs04"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-lg font-semibold text-center transition-all bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-xl"
              >
                Choisir Elite
              </a>
            </div>
          </div>

          {/* Trial Info */}
          <div className="mt-10 text-center">
            <div className="inline-block bg-blue-50 border-2 border-blue-200 rounded-xl p-6 max-w-2xl">
              <p className="text-lg font-semibold text-blue-900 mb-2">
                ⚡ Sprint Fondateur: 3 jours → 4.99€
              </p>
              <p className="text-sm text-blue-700 mb-4">
                ✅ Accès complet (15 visuels, 3 vidéos) • Sans engagement • Annulation en 1 clic
              </p>
              <p className="text-xs text-blue-600 mb-4">
                💡 4.99€ déduits si tu continues (paye 144.01€ au lieu de 149€ le premier mois)
              </p>
              <a
                href="https://buy.stripe.com/fZu9ASfHb8iB1qidFobAs01"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all hover:shadow-lg hover:scale-105"
              >
                Démarrer mon essai 4.99€ →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF & FAQ COURTE */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-semibold">Ce que disent nos utilisateurs</h2>
            <div className="mt-4 grid gap-4">
              <Quote
                text="On publie 3× plus, avec plus de régularité — les DM augmentent."
                author="Le Bistrot du Port"
              />
              <Quote
                text="Enfin un outil qui comprend la tendance et notre offre."
                author="Move&Fit"
              />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">FAQ</h2>
            <div className="mt-4 space-y-4 text-sm text-neutral-700">
              <Faq q="Puis-je retoucher le visuel ?"
                   a="Oui : lumière, ambiance, éléments visuels et texte sur l’image." />
              <Faq q="Mes contenus m’appartiennent ?"
                   a="Oui. Tu peux utiliser librement tes visuels sur tes réseaux." />
              <Faq q="Je ne suis pas à l’aise avec l’écriture."
                   a="Keiro propose des accroches claires sans fautes, prêtes à poster." />
            </div>
          </div>
        </div>
        <div className="mt-10 text-center">
          <a href="/generate" className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg hover:scale-105 transition-all">
            Essayer maintenant
          </a>
        </div>
      </section>

      {/* Footer légal - Terms of Service & Privacy Policy */}
      <footer className="bg-neutral-900 text-white mt-20">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Marque */}
            <div>
              <h3 className="text-lg font-bold mb-2">KeiroAI</h3>
              <p className="text-sm text-neutral-400">
                Plateforme IA de création de contenu marketing pour les réseaux sociaux.
              </p>
            </div>

            {/* Liens légaux */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-neutral-400 mb-3">Legal</h4>
              <ul className="space-y-2">
                <li>
                  <a href="/legal/terms" className="text-base text-white hover:text-cyan-400 transition-colors font-medium">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/legal/privacy" className="text-base text-white hover:text-cyan-400 transition-colors font-medium">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/legal/data-deletion" className="text-base text-white hover:text-cyan-400 transition-colors font-medium">
                    Suppression des données
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-neutral-400 mb-3">Contact</h4>
              <ul className="space-y-2">
                <li>
                  <a href="mailto:contact@keiroai.com" className="text-base text-white hover:text-cyan-400 transition-colors font-medium">
                    contact@keiroai.com
                  </a>
                </li>
                <li>
                  <a href="mailto:privacy@keiroai.com" className="text-sm text-neutral-400 hover:text-cyan-400 transition-colors">
                    privacy@keiroai.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-neutral-700 mt-8 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-neutral-500">
              &copy; {new Date().getFullYear()} KeiroAI. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href="/legal/terms" className="text-sm text-neutral-400 hover:text-white transition-colors underline">
                Terms of Service
              </a>
              <a href="/legal/privacy" className="text-sm text-neutral-400 hover:text-white transition-colors underline">
                Privacy Policy
              </a>
              <a href="/legal/data-deletion" className="text-sm text-neutral-400 hover:text-white transition-colors underline">
                Suppression des données
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* --- Quiz & Calculator Component --- */
function QuizAndCalculator() {
  const [activeSection, setActiveSection] = useState<'quiz' | 'calculator'>('quiz');
  const [quizStep, setQuizStep] = useState(1);
  const [quizAnswers, setQuizAnswers] = useState({
    businessType: '',
    objective: '',
    budget: ''
  });
  const [showQuizResult, setShowQuizResult] = useState(false);

  // ROI Calculator state
  const [visualsPerMonth, setVisualsPerMonth] = useState(8);

  const businessTypes = [
    { id: 'restaurant', label: '🍽️ Restaurant / Café', value: 'restaurant' },
    { id: 'coach', label: '💪 Coach / Consultant', value: 'coach' },
    { id: 'ecommerce', label: '🛍️ E-commerce / Boutique', value: 'ecommerce' },
    { id: 'service', label: '🔧 Service local / Artisan', value: 'service' },
    { id: 'other', label: '💼 Autre activité', value: 'other' }
  ];

  const objectives = [
    { id: 'awareness', label: '📢 Notoriété / Visibilité', value: 'awareness' },
    { id: 'leads', label: '🎯 Génération de leads', value: 'leads' },
    { id: 'sales', label: '💰 Ventes directes', value: 'sales' },
    { id: 'retention', label: '❤️ Fidélisation clients', value: 'retention' }
  ];

  const budgets = [
    { id: 'none', label: '0€ (pas de budget pub)', value: 'none' },
    { id: 'small', label: 'Moins de 500€/mois', value: 'small' },
    { id: 'medium', label: '500€ - 2,000€/mois', value: 'medium' },
    { id: 'large', label: 'Plus de 2,000€/mois', value: 'large' }
  ];

  const handleQuizAnswer = (step: number, value: string) => {
    if (step === 1) setQuizAnswers({ ...quizAnswers, businessType: value });
    if (step === 2) setQuizAnswers({ ...quizAnswers, objective: value });
    if (step === 3) {
      setQuizAnswers({ ...quizAnswers, budget: value });
      setShowQuizResult(true);
    }
  };

  const getRecommendedPlan = () => {
    if (quizAnswers.budget === 'large' || quizAnswers.businessType === 'ecommerce') return 'Pro';
    if (quizAnswers.budget === 'medium') return 'Starter';
    if (quizAnswers.budget === 'small') return 'Fondateurs';
    return 'Starter';
  };

  const resetQuiz = () => {
    setQuizStep(1);
    setQuizAnswers({ businessType: '', objective: '', budget: '' });
    setShowQuizResult(false);
  };

  // ROI Calculator logic
  const costGraphiste = visualsPerMonth * 500;
  const costKeiro = 199;
  const savings = costGraphiste - costKeiro;
  const savingsPercent = Math.round((savings / costGraphiste) * 100);

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Trouve ton plan idéal en 30 secondes</h2>
        <p className="text-neutral-600">Réponds à 3 questions ou calcule tes économies</p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-4 mb-8">
        <button
          onClick={() => setActiveSection('quiz')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all ${
            activeSection === 'quiz'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
              : 'bg-white border border-neutral-200 text-neutral-700 hover:border-purple-300'
          }`}
        >
          🎯 Quiz personnalisé
        </button>
        <button
          onClick={() => setActiveSection('calculator')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all ${
            activeSection === 'calculator'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg'
              : 'bg-white border border-neutral-200 text-neutral-700 hover:border-blue-300'
          }`}
        >
          💰 Calculer mes économies
        </button>
      </div>

      {/* Quiz Section */}
      {activeSection === 'quiz' && !showQuizResult && (
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border-2 border-purple-200 p-8 max-w-3xl mx-auto">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-purple-900">Question {quizStep}/3</span>
              <span className="text-xs text-purple-600">{Math.round((quizStep / 3) * 100)}%</span>
            </div>
            <div className="h-2 bg-purple-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500"
                style={{ width: `${(quizStep / 3) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Question 1 */}
          {quizStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-purple-900 mb-6">Quel est ton type d'activité ?</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {businessTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => {
                      handleQuizAnswer(1, type.value);
                      setQuizStep(2);
                    }}
                    className="p-4 bg-white rounded-xl border-2 border-purple-200 hover:border-purple-500 hover:shadow-lg transition-all text-left font-medium"
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question 2 */}
          {quizStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-purple-900 mb-6">Quel est ton objectif principal ?</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {objectives.map((obj) => (
                  <button
                    key={obj.id}
                    onClick={() => {
                      handleQuizAnswer(2, obj.value);
                      setQuizStep(3);
                    }}
                    className="p-4 bg-white rounded-xl border-2 border-purple-200 hover:border-purple-500 hover:shadow-lg transition-all text-left font-medium"
                  >
                    {obj.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setQuizStep(1)}
                className="mt-4 text-sm text-purple-600 hover:text-purple-700 underline"
              >
                ← Retour
              </button>
            </div>
          )}

          {/* Question 3 */}
          {quizStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-purple-900 mb-6">Quel est ton budget pub actuel ?</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {budgets.map((budget) => (
                  <button
                    key={budget.id}
                    onClick={() => handleQuizAnswer(3, budget.value)}
                    className="p-4 bg-white rounded-xl border-2 border-purple-200 hover:border-purple-500 hover:shadow-lg transition-all text-left font-medium"
                  >
                    {budget.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setQuizStep(2)}
                className="mt-4 text-sm text-purple-600 hover:text-purple-700 underline"
              >
                ← Retour
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quiz Result */}
      {activeSection === 'quiz' && showQuizResult && (
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border-2 border-blue-300 p-8 max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-3xl mb-4">
              ✓
            </div>
            <h3 className="text-2xl font-bold text-blue-900 mb-2">Ton plan idéal : {getRecommendedPlan()}</h3>
            <p className="text-blue-700">Parfait pour ton activité et tes objectifs</p>
          </div>

          <div className="bg-white rounded-xl p-6 mb-6">
            <h4 className="font-bold text-neutral-900 mb-4">Ce qui est inclus :</h4>
            <ul className="space-y-3">
              {getRecommendedPlan() === 'Pro' && (
                <>
                  <li className="flex items-start gap-2 text-sm">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span><strong>Visuels & vidéos illimités</strong> - Aucune limite de production</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span><strong>30 vidéos/mois</strong> - Parfait pour TikTok & Reels</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span><strong>Calendrier de contenus</strong> - Planification automatisée</span>
                  </li>
                </>
              )}
              {(getRecommendedPlan() === 'Starter' || getRecommendedPlan() === 'Fondateurs') && (
                <>
                  <li className="flex items-start gap-2 text-sm">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span><strong>Visuels illimités</strong> - Génère autant que tu veux</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span><strong>10 vidéos/mois</strong> - Pour diversifier ton contenu</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <span className="text-blue-500 text-lg">✓</span>
                    <span><strong>Assistant IA Marketing</strong> - Insights personnalisés</span>
                  </li>
                </>
              )}
              <li className="flex items-start gap-2 text-sm">
                <span className="text-blue-500 text-lg">✓</span>
                <span><strong>Galerie & Posts Instagram</strong> - Captions automatiques</span>
              </li>
            </ul>
          </div>

          <div className="flex gap-3">
            <a
              href="/generate"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all text-center"
            >
              Commencer avec {getRecommendedPlan()} →
            </a>
            <button
              onClick={resetQuiz}
              className="px-6 py-3 bg-white border border-blue-300 text-blue-700 font-semibold rounded-xl hover:bg-blue-50 transition-all"
            >
              Recommencer
            </button>
          </div>
        </div>
      )}

      {/* ROI Calculator */}
      {activeSection === 'calculator' && (
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-200 p-8 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-blue-900 mb-6 text-center">
            Calcule tes économies mensuelles
          </h3>

          <div className="bg-white rounded-xl p-6 mb-6">
            <label className="block mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-neutral-900">Combien de visuels par mois ?</span>
                <span className="text-2xl font-bold text-blue-600">{visualsPerMonth}</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={visualsPerMonth}
                onChange={(e) => setVisualsPerMonth(Number(e.target.value))}
                className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-neutral-500 mt-1">
                <span>1</span>
                <span>10</span>
                <span>20</span>
              </div>
            </label>
          </div>

          {/* Calculs */}
          <div className="space-y-4 mb-6">
            <div className="bg-neutral-100 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-sm text-neutral-600 mb-1">Coût graphiste freelance</div>
                <div className="text-xs text-neutral-500">{visualsPerMonth} visuels × 500€</div>
              </div>
              <div className="text-2xl font-bold text-neutral-900">{costGraphiste.toLocaleString()}€</div>
            </div>

            <div className="bg-blue-100 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-sm text-blue-900 font-semibold mb-1">Keiro Starter</div>
                <div className="text-xs text-blue-700">Visuels illimités</div>
              </div>
              <div className="text-2xl font-bold text-blue-900">{costKeiro}€</div>
            </div>

            <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm opacity-90 mb-1">💰 Économie mensuelle</div>
                  <div className="text-xs opacity-75">Soit {savings * 12}€/an</div>
                </div>
                <div>
                  <div className="text-4xl font-bold">{savings.toLocaleString()}€</div>
                  <div className="text-sm text-right">{savingsPercent}% d'économie</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-blue-900">
              <strong>💡 Conseil :</strong> Avec Keiro, tu génères <strong>autant de visuels que tu veux</strong>
              pour un forfait fixe. Plus tu produis, plus tu économises !
            </p>
          </div>

          <a
            href="/generate"
            className="block w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all text-center"
          >
            Économiser {savings.toLocaleString()}€/mois →
          </a>
        </div>
      )}
    </section>
  );
}

/* --- mini composants UI --- */
function Step({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-blue-100 p-5 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-white grid place-items-center text-sm font-semibold">{num}</div>
        <h3 className="font-medium">{title}</h3>
      </div>
      <p className="mt-3 text-sm text-neutral-700">{children}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border p-5 bg-white">{children}</div>;
}

function Plan({
  title, price, subtitle, bullets, ctaLabel, ctaHref, highlight, special
}: {
  title: string;
  price: string;
  subtitle?: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref?: string;
  highlight?: boolean;
  special?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 bg-white shadow-sm transition-all hover:shadow-lg flex flex-col ${
      special ? 'ring-2 ring-amber-400 bg-gradient-to-br from-amber-50 to-orange-50' :
      highlight ? 'ring-2 ring-blue-500 shadow-lg' : ''
    }`}>
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="text-xl font-bold mt-1">{price}</div>
      {subtitle && <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>}
      <ul className="mt-4 space-y-2 text-sm text-neutral-700 flex-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className={special ? "text-amber-500" : "text-blue-500"}>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <a href={ctaHref || "/generate"} {...(ctaHref?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={`mt-5 inline-flex w-full items-center justify-center rounded-xl font-medium px-4 py-3 hover:shadow-lg transition-all text-sm ${
        special ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' :
        'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
      }`}>
        {ctaLabel}
      </a>
    </div>
  );
}

function Quote({ text, author }: { text: string; author: string }) {
  return (
    <figure className="rounded-2xl border p-5 bg-white">
      <blockquote className="text-neutral-800">“{text}”</blockquote>
      <figcaption className="mt-2 text-sm text-neutral-500">— {author}</figcaption>
    </figure>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="rounded-xl border p-4 bg-white">
      <summary className="cursor-pointer font-medium">{q}</summary>
      <p className="mt-2 text-neutral-700">{a}</p>
    </details>
  );
}
