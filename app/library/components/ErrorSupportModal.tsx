'use client';

interface ErrorSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  errorMessage: string;
  technicalError?: string;
}

export default function ErrorSupportModal({
  isOpen,
  onClose,
  title,
  errorMessage,
  technicalError
}: ErrorSupportModalProps) {
  const openCalendly = () => {
    window.open('https://calendly.com/contact-keiroai/30min', '_blank');
  };

  const copyTechnicalError = () => {
    if (technicalError) {
      navigator.clipboard.writeText(technicalError);
      alert('Erreur technique copiée dans le presse-papier');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 text-white rounded-t-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold">{title}</h2>
              <p className="text-sm text-red-100">Une erreur s'est produite</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* User-friendly message */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-900">
              <strong>❌ Erreur :</strong> {errorMessage}
            </p>
          </div>

          {/* Technical error (expandable) */}
          {technicalError && (
            <details className="mb-4 text-xs">
              <summary className="cursor-pointer text-neutral-600 hover:text-neutral-900 font-medium mb-2">
                📋 Détails techniques (pour le support)
              </summary>
              <div className="bg-neutral-100 rounded-lg p-3 font-mono text-xs text-neutral-700 overflow-auto max-h-32">
                {technicalError}
              </div>
              <button
                onClick={copyTechnicalError}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                📋 Copier l'erreur technique
              </button>
            </details>
          )}

          {/* Support section */}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
            <h3 className="font-bold text-neutral-900 mb-2 flex items-center gap-2">
              <span>💬</span> Besoin d'aide ?
            </h3>
            <p className="text-sm text-neutral-700 mb-3">
              Notre équipe peut vous aider à résoudre ce problème rapidement. Bookez un appel gratuit de 15 minutes.
            </p>
            <button
              onClick={openCalendly}
              className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
            >
              📞 Contacter le support (gratuit)
            </button>
          </div>

          {/* Instructions */}
          <div className="mt-4 text-xs text-neutral-500">
            <p className="font-semibold mb-1">Lors de l'appel, partagez :</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Le message d'erreur ci-dessus</li>
              {technicalError && <li>Les détails techniques (copiez-les)</li>}
              <li>Ce que vous essayiez de faire</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-50 rounded-b-xl flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-100 transition-colors"
          >
            Fermer
          </button>
          <button
            onClick={openCalendly}
            className="flex-1 px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors"
          >
            Contacter le support
          </button>
        </div>
      </div>
    </div>
  );
}
