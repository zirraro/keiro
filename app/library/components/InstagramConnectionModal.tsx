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
    window.open('https://developers.facebook.com/docs/instagram-api', '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="relative bg-gradient-to-br from-purple-600 via-pink-500 to-purple-700 px-5 py-5 text-white rounded-t-2xl">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors z-10"
            aria-label="Fermer"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold">Connecter Instagram</h2>
              <p className="text-white/90 text-xs">Publiez directement sur votre profil</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-3">
          {/* Pourquoi connecter */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3 border border-purple-200">
            <h3 className="text-sm font-semibold text-neutral-900 mb-2">Pourquoi connecter Instagram ?</h3>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-neutral-700">
              <div className="flex items-start gap-1.5">
                <span className="text-purple-600 font-bold">✓</span>
                <span><strong>Publication directe</strong> en un clic</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-purple-600 font-bold">✓</span>
                <span><strong>Images et vidéos</strong> supportées</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-purple-600 font-bold">✓</span>
                <span><strong>Brouillons</strong> intelligents</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-purple-600 font-bold">✓</span>
                <span><strong>Gain de temps</strong> plus de copier-coller</span>
              </div>
            </div>
          </div>

          {/* Ce dont vous avez besoin */}
          <div className="border border-neutral-200 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-neutral-900 mb-2">Ce dont vous avez besoin</h3>
            <div className="flex gap-4 text-xs text-neutral-700">
              <div className="flex items-center gap-1.5">
                <span className="bg-purple-100 text-purple-700 font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px]">1</span>
                <span>Compte Instagram Pro</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="bg-purple-100 text-purple-700 font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px]">2</span>
                <span>Page Facebook liée</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="bg-purple-100 text-purple-700 font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px]">3</span>
                <span>Meta Business Suite</span>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={openMetaGuide}
              className="flex items-center gap-2 p-3 rounded-lg border-2 border-blue-500 bg-blue-50 hover:bg-blue-100 transition-all text-left"
            >
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <div className="font-bold text-neutral-900 text-xs">Configurer moi-même</div>
                <div className="text-xs text-neutral-500">Guide Meta</div>
              </div>
            </button>
            <button
              onClick={openCalendly}
              className="flex items-center gap-2 p-3 rounded-lg border-2 border-purple-500 bg-purple-50 hover:bg-purple-100 transition-all text-left"
            >
              <svg className="w-5 h-5 text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <div className="font-bold text-neutral-900 text-xs">Me faire accompagner</div>
                <div className="text-xs text-neutral-500">Appel gratuit 30 min</div>
              </div>
            </button>
          </div>

          <p className="text-[10px] text-center text-neutral-500">
            Sans configuration Meta, vous pouvez toujours préparer vos posts et les publier manuellement.
          </p>
        </div>
      </div>
    </div>
  );
}
