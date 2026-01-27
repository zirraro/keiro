'use client';

interface TikTokConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TikTokConnectionModal({ isOpen, onClose }: TikTokConnectionModalProps) {
  const handleConnect = () => {
    window.location.href = '/api/auth/tiktok-oauth';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
              <span className="text-3xl">🎵</span>
              Connecter TikTok
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            {/* Bénéfices */}
            <div className="bg-gradient-to-r from-pink-50 to-cyan-50 rounded-xl p-6 border border-pink-200">
              <h3 className="text-lg font-semibold text-neutral-900 mb-3">
                Pourquoi connecter TikTok ?
              </h3>
              <ul className="space-y-2 text-sm text-neutral-700">
                <li className="flex items-start gap-2">
                  <span className="text-pink-600 font-bold text-lg">✓</span>
                  <span><strong>Publication automatique</strong> : Tes images converties en vidéo sur TikTok</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-600 font-bold text-lg">✓</span>
                  <span><strong>Cross-platform</strong> : Publie sur Instagram + TikTok en un clic</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-600 font-bold text-lg">✓</span>
                  <span><strong>Analytics complètes</strong> : Vues, engagement, taux de complétion</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-600 font-bold text-lg">✓</span>
                  <span><strong>Insights marketing</strong> : Conseils personnalisés basés sur tes stats TikTok</span>
                </li>
              </ul>
            </div>

            {/* Prérequis */}
            <div className="border border-neutral-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-3">
                📋 Ce dont tu as besoin
              </h3>
              <ol className="space-y-3 text-sm text-neutral-700">
                <li className="flex items-start gap-3">
                  <span className="bg-pink-100 text-pink-700 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs">1</span>
                  <div>
                    <p className="font-semibold">Un compte TikTok</p>
                    <p className="text-neutral-600 mt-1">Personnel ou Business (les deux fonctionnent)</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="bg-pink-100 text-pink-700 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs">2</span>
                  <div>
                    <p className="font-semibold">Autoriser Keiro</p>
                    <p className="text-neutral-600 mt-1">Pour publier du contenu et récupérer tes statistiques</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="bg-pink-100 text-pink-700 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs">3</span>
                  <div>
                    <p className="font-semibold">C'est tout !</p>
                    <p className="text-neutral-600 mt-1">Le processus prend moins de 30 secondes</p>
                  </div>
                </li>
              </ol>
            </div>

            {/* Info conversion */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex gap-3">
                <span className="text-2xl">⚡</span>
                <div>
                  <p className="text-sm font-semibold text-yellow-900 mb-1">
                    Conversion automatique image → vidéo
                  </p>
                  <p className="text-xs text-yellow-800">
                    TikTok nécessite des vidéos. Tes images seront automatiquement converties en vidéos de 5 secondes (format 9:16 optimisé TikTok).
                  </p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleConnect}
              className="w-full py-4 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 text-white font-bold rounded-xl hover:shadow-lg transition-all text-lg"
            >
              🎵 Connecter mon compte TikTok
            </button>

            <p className="text-xs text-center text-neutral-500">
              En connectant, tu autorises Keiro à publier du contenu sur ton compte TikTok.
              <br />
              Tu peux révoquer l'accès à tout moment depuis les paramètres TikTok.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
