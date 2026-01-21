'use client';

interface InstagramConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InstagramConnectionModal({ isOpen, onClose }: InstagramConnectionModalProps) {
  if (!isOpen) return null;

  const openCalendly = () => {
    window.open('https://calendly.com/contact-keiroai/30min', '_blank');
  };

  const openMetaGuide = () => {
    // TODO: Replace with actual Keiro Meta setup guide URL
    window.open('https://developers.facebook.com/docs/instagram-api', '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slideUp">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-purple-600 via-pink-500 to-purple-700 px-6 py-8 text-white">
          {/* Motif de fond */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors group"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-1">Connecter votre Instagram</h2>
              <p className="text-white/90 text-sm">Configuration Meta Business API</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Introduction */}
          <div>
            <p className="text-neutral-700 leading-relaxed">
              Pour publier automatiquement sur Instagram via Keiro, vous devez connecter votre compte Instagram professionnel via <strong>Meta Business Suite</strong>. Cette configuration prend environ 10-15 minutes.
            </p>
          </div>

          {/* Prérequis */}
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
            <h3 className="font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Prérequis nécessaires
            </h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-3 text-sm text-neutral-700">
                <span className="text-blue-600 font-bold">1.</span>
                <div>
                  <strong>Compte Instagram professionnel</strong>
                  <p className="text-xs text-neutral-600 mt-0.5">Allez dans Paramètres Instagram → Type de compte → Passer au compte professionnel</p>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm text-neutral-700">
                <span className="text-blue-600 font-bold">2.</span>
                <div>
                  <strong>Page Facebook Business</strong>
                  <p className="text-xs text-neutral-600 mt-0.5">Créez une Page Facebook et liez-la à votre Instagram</p>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm text-neutral-700">
                <span className="text-blue-600 font-bold">3.</span>
                <div>
                  <strong>Meta Business Suite</strong>
                  <p className="text-xs text-neutral-600 mt-0.5">Configurez votre entreprise sur business.facebook.com</p>
                </div>
              </li>
            </ul>
          </div>

          {/* Sans configuration */}
          <div className="bg-purple-50 rounded-xl p-5 border border-purple-200">
            <h3 className="font-bold text-neutral-900 mb-2 flex items-center gap-2">
              <span className="text-lg">💡</span>
              Sans configuration Meta
            </h3>
            <p className="text-sm text-neutral-700 leading-relaxed">
              Vous pouvez toujours utiliser Keiro pour créer vos visuels et préparer vos posts Instagram.
              Vous devrez simplement publier manuellement via l'application Instagram en téléchargeant vos créations.
            </p>
          </div>

          {/* CTAs */}
          <div className="space-y-3">
            <h3 className="font-bold text-neutral-900 text-sm">Choisissez votre option :</h3>

            {/* Option 1: Guide */}
            <button
              onClick={openMetaGuide}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-blue-500 bg-blue-50 hover:bg-blue-100 transition-all group"
            >
              <div className="w-12 h-12 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-neutral-900 mb-1">Je configure moi-même</div>
                <div className="text-sm text-neutral-600">Suivre le guide pas-à-pas Meta Business</div>
              </div>
              <svg className="w-5 h-5 text-blue-600 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Option 2: Demo call */}
            <button
              onClick={openCalendly}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-purple-500 bg-purple-50 hover:bg-purple-100 transition-all group"
            >
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-neutral-900 mb-1">Je me fais accompagner</div>
                <div className="text-sm text-neutral-600">Booker un appel gratuit de 30 minutes</div>
              </div>
              <svg className="w-5 h-5 text-purple-600 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Footer note */}
          <div className="pt-4 border-t border-neutral-200">
            <p className="text-xs text-neutral-500 text-center leading-relaxed">
              💡 <strong>Astuce :</strong> La configuration prend 10-15 minutes. Notre équipe peut vous guider gratuitement pour un setup rapide et sans erreur.
            </p>
          </div>
        </div>

        {/* Actions footer */}
        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-100 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
