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
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl p-5">
        {/* Content */}
        <div>
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
