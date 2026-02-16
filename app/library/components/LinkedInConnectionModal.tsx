'use client';

import { LinkedInIcon } from './Icons';

interface LinkedInConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LinkedInConnectionModal({ isOpen, onClose }: LinkedInConnectionModalProps) {
  const handleConnect = () => {
    window.location.href = '/api/auth/linkedin-oauth';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-[#0077B5] to-blue-700 px-6 py-8 text-white">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <LinkedInIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-1">Connecter LinkedIn</h2>
              <p className="text-white/90 text-sm">Publiez directement sur votre profil</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Bénéfices */}
          <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-xl p-6 border border-blue-200">
            <h3 className="text-lg font-semibold text-neutral-900 mb-3">
              Pourquoi connecter LinkedIn ?
            </h3>
            <ul className="space-y-2 text-sm text-neutral-700">
              <li className="flex items-start gap-2">
                <span className="text-[#0077B5] font-bold text-lg">✓</span>
                <span><strong>Publication directe</strong> : Publiez vos posts LinkedIn en un clic depuis Keiro</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#0077B5] font-bold text-lg">✓</span>
                <span><strong>Images et vidéos</strong> : Publiez des posts avec images, vidéos ou texte seul</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#0077B5] font-bold text-lg">✓</span>
                <span><strong>Brouillons intelligents</strong> : Préparez et planifiez vos posts à l'avance</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#0077B5] font-bold text-lg">✓</span>
                <span><strong>Gain de temps</strong> : Plus besoin de copier-coller entre Keiro et LinkedIn</span>
              </li>
            </ul>
          </div>

          {/* Prérequis */}
          <div className="border border-neutral-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-3">
              Ce dont vous avez besoin
            </h3>
            <ol className="space-y-3 text-sm text-neutral-700">
              <li className="flex items-start gap-3">
                <span className="bg-blue-100 text-[#0077B5] font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs">1</span>
                <div>
                  <p className="font-semibold">Un compte LinkedIn</p>
                  <p className="text-neutral-600 mt-1">Personnel ou Page entreprise</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="bg-blue-100 text-[#0077B5] font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs">2</span>
                <div>
                  <p className="font-semibold">Autoriser Keiro</p>
                  <p className="text-neutral-600 mt-1">Pour publier du contenu sur votre profil LinkedIn</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="bg-blue-100 text-[#0077B5] font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs">3</span>
                <div>
                  <p className="font-semibold">C'est tout !</p>
                  <p className="text-neutral-600 mt-1">Le processus prend moins de 30 secondes</p>
                </div>
              </li>
            </ol>
          </div>

          {/* Info token */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="text-sm font-semibold text-yellow-900 mb-1">
                  Connexion sécurisée
                </p>
                <p className="text-xs text-yellow-800">
                  Keiro utilise OAuth 2.0 officiel de LinkedIn. Vous serez redirigé vers LinkedIn pour autoriser l'accès. Vos identifiants ne sont jamais partagés avec Keiro.
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={handleConnect}
            className="w-full py-4 bg-gradient-to-r from-[#0077B5] to-blue-600 text-white font-bold rounded-xl hover:from-[#005f8f] hover:to-blue-700 hover:shadow-lg transition-all text-lg flex items-center justify-center gap-2"
          >
            <LinkedInIcon className="w-6 h-6 text-white" />
            Connecter mon compte LinkedIn
          </button>

          <p className="text-xs text-center text-neutral-500">
            En connectant, vous autorisez Keiro à publier du contenu sur votre profil LinkedIn.
            <br />
            Vous pouvez révoquer l'accès à tout moment depuis les paramètres LinkedIn.
          </p>
        </div>
      </div>
    </div>
  );
}
