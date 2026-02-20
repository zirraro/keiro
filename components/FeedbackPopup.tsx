"use client"

interface FeedbackPopupProps {
  show: boolean
  onAccept: () => void
  onDismiss: () => void
}

export default function FeedbackPopup({ show, onAccept, onDismiss }: FeedbackPopupProps) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 max-w-sm transition-all duration-500 ease-out ${show ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}`}
    >
      <div className="relative bg-white border border-gray-200 rounded-2xl shadow-2xl p-5">
        {/* Close X button */}
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Fermer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Content */}
        <div className="pr-6">
          <p className="font-bold text-gray-900 text-base">Votre avis compte !</p>
          <p className="text-sm text-gray-500 mt-1">
            Un retour rapide pour améliorer Keiro ? (~30 secondes)
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={onAccept}
            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-500 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:from-purple-700 hover:to-blue-600 transition-all"
          >
            Oui, je donne mon avis
          </button>
          <button
            onClick={onDismiss}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  )
}
