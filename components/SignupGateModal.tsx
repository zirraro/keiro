'use client';

import Link from 'next/link';

interface SignupGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SignupGateModal({ isOpen, onClose, onSuccess }: SignupGateModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-8 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-3xl font-bold text-center mb-2">
          Limite gratuite atteinte
        </h2>
        <p className="text-neutral-600 text-center mb-6">
          Créez un compte pour continuer à générer du contenu visuel illimité et accéder à toutes les fonctionnalités premium
        </p>

        {/* Benefits */}
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 mb-6">
          <h3 className="font-bold text-lg mb-4 text-center">Avec un compte gratuit :</h3>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-neutral-700"><strong>3 visuels gratuits</strong> avec watermark par mois</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-neutral-700"><strong>Bibliothèque personnelle</strong> pour sauvegarder vos créations</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-neutral-700"><strong>Accès au studio d'édition</strong> pour perfectionner vos visuels</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-neutral-700"><strong>Historique de génération</strong> pour retrouver tous vos visuels</span>
            </li>
          </ul>
        </div>

        {/* CTA Buttons */}
        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold rounded-xl text-center hover:shadow-lg transition-all"
          >
            Créer mon compte gratuit
          </Link>

          <Link
            href="/login"
            className="block w-full py-3 border-2 border-neutral-300 text-neutral-700 font-semibold rounded-xl text-center hover:border-neutral-400 hover:bg-neutral-50 transition-all"
          >
            J'ai déjà un compte
          </Link>
        </div>

        {/* Upgrade link */}
        <div className="mt-6 pt-6 border-t border-neutral-200 text-center">
          <p className="text-sm text-neutral-600 mb-3">
            Besoin de plus ? Passez Premium
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-amber-600 font-semibold hover:text-amber-700 transition-colors"
          >
            <span>Découvrir les offres Premium</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
