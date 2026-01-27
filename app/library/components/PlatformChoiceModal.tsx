'use client';

interface PlatformChoiceModalProps {
  onClose: () => void;
  onSelectInstagram: () => void;
  onSelectTikTok: () => void;
}

export default function PlatformChoiceModal({ onClose, onSelectInstagram, onSelectTikTok }: PlatformChoiceModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral-900">
              Choisir une plateforme
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-neutral-600 mt-2">
            Sur quelle plateforme souhaitez-vous publier ?
          </p>
        </div>

        {/* Platform Options */}
        <div className="p-6 space-y-3">
          {/* Instagram */}
          <button
            onClick={onSelectInstagram}
            className="w-full p-4 border-2 border-neutral-200 rounded-xl hover:border-pink-500 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-bold text-neutral-900 group-hover:text-pink-600 transition-colors">
                  Instagram
                </h3>
                <p className="text-sm text-neutral-600">
                  Post & Story avec IA
                </p>
              </div>
              <svg className="w-6 h-6 text-neutral-300 group-hover:text-pink-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          {/* TikTok */}
          <button
            onClick={onSelectTikTok}
            className="w-full p-4 border-2 border-neutral-200 rounded-xl hover:border-cyan-500 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-bold text-neutral-900 group-hover:text-cyan-600 transition-colors">
                  TikTok
                </h3>
                <p className="text-sm text-neutral-600">
                  Vidéo virale avec IA
                </p>
              </div>
              <svg className="w-6 h-6 text-neutral-300 group-hover:text-cyan-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
