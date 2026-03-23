'use client';

import { startCheckout } from '@/lib/stripe/checkout';

export default function OffrePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ── BLOCK 1 — Hero ── */}
      <section className="bg-gradient-to-br from-[#0c1a3a] to-purple-700 text-white">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">
            Votre commerce visible sur Instagram et TikTok en 3 minutes
          </h1>
          <p className="mt-6 text-lg md:text-xl text-[#0c1a3a]/60">
            L&apos;IA cr&eacute;e des visuels pro avec votre logo. Vous publiez. Les clients arrivent.
          </p>
          <button
            onClick={() => startCheckout('pro')}
            className="mt-8 inline-block rounded-xl bg-white px-8 py-4 text-lg font-semibold text-[#0c1a3a] shadow-lg hover:shadow-xl hover:scale-105 transition-all"
          >
            Commencer &agrave; 49&euro;
          </button>
        </div>
      </section>

      {/* ── BLOCK 2 — Avant / Après ── */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold text-center text-neutral-900 mb-10">
            Avant / Apr&egrave;s KeiroAI
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { avant: 'Pas de visibilit\u00e9 en ligne', apres: 'Des visuels pro chaque semaine' },
              { avant: 'Des heures sur Canva', apres: 'G\u00e9n\u00e9r\u00e9 en 3 minutes' },
              { avant: 'Aucun engagement', apres: '+347% d\u2019engagement moyen' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="bg-neutral-100 p-5 text-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Avant</span>
                  <p className="mt-2 text-neutral-600">{item.avant}</p>
                </div>
                <div className="bg-gradient-to-br from-[#0c1a3a]/5 to-purple-50 p-5 text-center border-t border-neutral-200">
                  <span className="text-xs font-semibold uppercase tracking-wider text-purple-600">Apr&egrave;s</span>
                  <p className="mt-2 text-neutral-900 font-medium">{item.apres}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-sm text-neutral-500">
            Cas clients r&eacute;els disponibles prochainement
          </p>
        </div>
      </section>

      {/* ── BLOCK 3 — Comment ça marche ── */}
      <section className="bg-neutral-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold text-center text-neutral-900 mb-12">
            Comment &ccedil;a marche ?
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 text-3xl mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div className="text-sm font-bold text-purple-600 mb-1">1</div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                L&apos;IA g&eacute;n&egrave;re un visuel pro avec votre marque
              </h3>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0c1a3a]/10 text-3xl mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#0c1a3a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-sm font-bold text-[#0c1a3a] mb-1">2</div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                Vous choisissez et planifiez
              </h3>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                </svg>
              </div>
              <div className="text-sm font-bold text-green-600 mb-1">3</div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                Vous publiez en 30 secondes
              </h3>
            </div>
          </div>
        </div>
      </section>

      {/* ── BLOCK 4 — 2 Plans ── */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold text-center text-neutral-900 mb-12">
            Choisissez votre plan
          </h2>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Pro card */}
            <div className="rounded-2xl border border-neutral-200 shadow-md overflow-hidden">
              <div className="bg-gradient-to-br from-purple-600 to-purple-700 p-6 text-white text-center">
                <h3 className="text-2xl font-bold">Pro</h3>
                <p className="mt-1 text-purple-200">Instagram complet</p>
                <div className="mt-4">
                  <span className="text-4xl font-bold">30 jours gratuits</span>
                </div>
                <p className="text-sm text-purple-200 mt-1">puis 49&euro;/mois &bull; Carte requise, 0&euro; d&eacute;bit&eacute;</p>
              </div>
              <div className="p-6">
                <ul className="space-y-3 text-neutral-700">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">&#10003;</span>
                    <span>400 cr&eacute;dits/mois</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">&#10003;</span>
                    <span>Images + vid&eacute;os IA</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">&#10003;</span>
                    <span>Instagram + Stories + LinkedIn</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">&#10003;</span>
                    <span>Texte + hashtags automatiques</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">&#10003;</span>
                    <span>Statistiques Instagram</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">&#10003;</span>
                    <span>Support email</span>
                  </li>
                </ul>
                <button
                  onClick={() => startCheckout('pro')}
                  className="mt-6 w-full rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-3 text-white font-semibold hover:shadow-lg hover:scale-[1.02] transition-all"
                >
                  Commencer &agrave; 49&euro;
                </button>
              </div>
            </div>

            {/* Fondateurs card */}
            <div className="rounded-2xl border-2 border-amber-400 shadow-lg overflow-hidden relative">
              <div className="absolute top-4 right-4 bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                Recommand&eacute;
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 text-white text-center">
                <h3 className="text-2xl font-bold">Fondateurs</h3>
                <p className="mt-1 text-amber-100">Votre logo + 3 formats + TikTok</p>
                <div className="mt-4">
                  <span className="text-4xl font-bold">149&euro;</span>
                  <span className="text-amber-100 ml-1">/mois</span>
                </div>
              </div>
              <div className="p-6">
                <ul className="space-y-3 text-neutral-700">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">&#10003;</span>
                    <span>700 cr&eacute;dits/mois</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">&#10003;</span>
                    <span>TOUT le plan Pro +</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">&#10003;</span>
                    <span>TikTok d&eacute;bloqu&eacute;</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">&#10003;</span>
                    <span>Branding personnalis&eacute; (logo + couleurs)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">&#10003;</span>
                    <span>Multi-format : post + Story + Reel</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">&#10003;</span>
                    <span>Support prioritaire 12h</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">&#10003;</span>
                    <span>Prix verrouill&eacute; &agrave; vie (50 places)</span>
                  </li>
                </ul>
                <button
                  onClick={() => startCheckout('fondateurs')}
                  className="mt-6 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3 text-white font-semibold hover:shadow-lg hover:scale-[1.02] transition-all"
                >
                  Devenir Fondateur — 149&euro;/mois
                </button>
              </div>
            </div>
          </div>

          <p className="mt-8 text-center text-neutral-600 font-medium">
            Pour 60&euro; de plus : votre logo, 3 formats d&apos;un coup, TikTok
          </p>
        </div>
      </section>

      {/* ── BLOCK 5 — FAQ rapide ── */}
      <section className="bg-neutral-50 py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-3xl font-bold text-center text-neutral-900 mb-10">
            Questions fr&eacute;quentes
          </h2>

          <div className="space-y-3">
            <details className="group rounded-xl border border-neutral-200 bg-white">
              <summary className="flex cursor-pointer items-center justify-between p-5 font-medium text-neutral-900">
                C&apos;est quoi KeiroAI ?
                <svg className="h-5 w-5 text-neutral-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-5 text-neutral-600">
                L&apos;IA cr&eacute;e des visuels pro pour votre commerce en 3 minutes. Images, vid&eacute;os, textes — tout est g&eacute;n&eacute;r&eacute; automatiquement.
              </div>
            </details>

            <details className="group rounded-xl border border-neutral-200 bg-white">
              <summary className="flex cursor-pointer items-center justify-between p-5 font-medium text-neutral-900">
                J&apos;y connais rien en r&eacute;seaux sociaux
                <svg className="h-5 w-5 text-neutral-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-5 text-neutral-600">
                Pas besoin. L&apos;IA fait le contenu, vous appuyez sur publier. 30 secondes.
              </div>
            </details>

            <details className="group rounded-xl border border-neutral-200 bg-white">
              <summary className="flex cursor-pointer items-center justify-between p-5 font-medium text-neutral-900">
                Combien de temps &ccedil;a prend ?
                <svg className="h-5 w-5 text-neutral-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-5 text-neutral-600">
                3 minutes pour g&eacute;n&eacute;rer un visuel, 30 secondes pour publier.
              </div>
            </details>

            <details className="group rounded-xl border border-neutral-200 bg-white">
              <summary className="flex cursor-pointer items-center justify-between p-5 font-medium text-neutral-900">
                Je peux annuler ?
                <svg className="h-5 w-5 text-neutral-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-5 text-neutral-600">
                Oui, en 1 clic, sans engagement. 0&euro; d&eacute;bit&eacute; pendant les 30 jours d&apos;essai.
              </div>
            </details>

            <details className="group rounded-xl border border-neutral-200 bg-white">
              <summary className="flex cursor-pointer items-center justify-between p-5 font-medium text-neutral-900">
                Qu&apos;est-ce que j&apos;ai pour 49&euro; ?
                <svg className="h-5 w-5 text-neutral-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-5 text-neutral-600">
                Instagram + Stories + LinkedIn, visuels pro, vid&eacute;os, audio, stats, AMI (Assistant Marketing Intelligence). Tout sauf TikTok et le branding perso (r&eacute;serv&eacute;s Fondateurs).
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-neutral-200 py-6 text-center text-sm text-neutral-500">
        &copy; 2026 KeiroAI — Tous droits r&eacute;serv&eacute;s
      </footer>
    </div>
  );
}
