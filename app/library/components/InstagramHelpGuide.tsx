'use client';

export default function InstagramHelpGuide() {
  const openCalendly = () => {
    window.open('https://calendly.com/contact-keiroai/30min', '_blank');
  };

  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200 mb-6">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-lg font-bold text-neutral-900 mb-2">
            📱 Comment connecter votre Instagram ?
          </h3>
          <p className="text-sm text-neutral-700 mb-4">
            Pour publier automatiquement sur Instagram, vous devez connecter votre compte via Meta Business API
          </p>

          {/* Étapes */}
          <div className="space-y-3 mb-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                1
              </div>
              <div>
                <p className="font-semibold text-neutral-900 text-sm">Convertir en compte professionnel</p>
                <p className="text-xs text-neutral-600">
                  Allez dans Paramètres Instagram → Type de compte → Passer au compte professionnel
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                2
              </div>
              <div>
                <p className="font-semibold text-neutral-900 text-sm">Créer une Page Facebook</p>
                <p className="text-xs text-neutral-600">
                  Votre compte Instagram doit être lié à une Page Facebook Business
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                3
              </div>
              <div>
                <p className="font-semibold text-neutral-900 text-sm">Configurer Meta Business Suite</p>
                <p className="text-xs text-neutral-600">
                  Accédez à business.facebook.com et liez votre Instagram
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                4
              </div>
              <div>
                <p className="font-semibold text-neutral-900 text-sm">Connecter sur Keiro</p>
                <p className="text-xs text-neutral-600">
                  Retournez sur Keiro et connectez votre Instagram via OAuth
                </p>
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={openCalendly}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Booker un appel d'accompagnement
            </button>
            <a
              href="https://developers.facebook.com/docs/instagram-api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-purple-600 border-2 border-purple-300 rounded-lg font-semibold hover:bg-purple-50 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Documentation Meta API
            </a>
          </div>

          {/* Note */}
          <p className="text-xs text-neutral-500 mt-4 italic">
            💡 Astuce : Notre équipe peut vous accompagner dans la configuration. Bookez un appel gratuit de 15 minutes !
          </p>
        </div>
      </div>
    </div>
  );
}
