"use client"

import { useLanguage } from '@/lib/i18n/context';

interface FeedbackPopupProps {
  show: boolean
  onAccept: () => void
  onDismiss: () => void
}

export default function FeedbackPopup({ show, onAccept, onDismiss }: FeedbackPopupProps) {
  const { locale } = useLanguage();
  const isEn = locale === 'en';
  return (
    <div
      className={`fixed bottom-20 sm:bottom-24 left-3 sm:left-6 right-auto z-40 max-w-[calc(100vw-6rem)] sm:max-w-xs transition-all duration-500 ease-out ${show ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}`}
    >
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-2xl p-5">
        {/* Content */}
        <div>
          <p className="font-bold text-neutral-900 text-base">{isEn ? 'Your opinion matters!' : 'Votre avis compte !'}</p>
          <p className="text-sm text-neutral-600 mt-1">
            {isEn ? 'Quick feedback to help improve Keiro? (~30 seconds)' : 'Un retour rapide pour améliorer Keiro ? (~30 secondes)'}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={onAccept}
            className="flex-1 bg-gradient-to-r from-purple-600 to-[#0c1a3a] text-white text-sm font-semibold py-2 px-4 rounded-lg hover:from-purple-700 hover:to-[#0c1a3a] transition-all"
          >
            {isEn ? 'Sure, give feedback' : 'Oui, je donne mon avis'}
          </button>
          <button
            onClick={onDismiss}
            className="text-sm text-neutral-700 hover:text-neutral-900 font-medium transition-colors whitespace-nowrap"
          >
            {isEn ? 'Later' : 'Plus tard'}
          </button>
        </div>
      </div>
    </div>
  )
}
