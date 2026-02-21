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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        {/* Header compact */}
        <div className="px-5 py-4 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <span className="text-2xl">🎵</span>
              Connecter TikTok
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Bénéfices compact */}
          <div className="bg-gradient-to-r from-pink-50 to-cyan-50 rounded-lg p-3 border border-pink-200">
            <h3 className="text-sm font-semibold text-neutral-900 mb-2">Pourquoi connecter TikTok ?</h3>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-neutral-700">
              <div className="flex items-start gap-1.5">
                <span className="text-pink-600 font-bold">✓</span>
                <span><strong>Publication auto</strong> de vos vidéos</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-pink-600 font-bold">✓</span>
                <span><strong>Cross-platform</strong> Instagram + TikTok</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-pink-600 font-bold">✓</span>
                <span><strong>Analytics</strong> vues et engagement</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-pink-600 font-bold">✓</span>
                <span><strong>Insights</strong> conseils personnalisés</span>
              </div>
            </div>
          </div>

          {/* Prérequis compact */}
          <div className="border border-neutral-200 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-neutral-900 mb-2">Ce dont vous avez besoin</h3>
            <div className="flex gap-4 text-xs text-neutral-700">
              <div className="flex items-center gap-1.5">
                <span className="bg-pink-100 text-pink-700 font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px]">1</span>
                <span>Un compte TikTok</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="bg-pink-100 text-pink-700 font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px]">2</span>
                <span>Autoriser Keiro</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="bg-pink-100 text-pink-700 font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px]">3</span>
                <span>C'est tout !</span>
              </div>
            </div>
          </div>

          {/* Info conversion compact */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex gap-2">
            <span className="text-lg">⚡</span>
            <p className="text-xs text-yellow-800">
              <strong>Conversion auto image → vidéo :</strong> Vos images seront converties en vidéos 5s (9:16 optimisé TikTok).
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={handleConnect}
            className="w-full py-3 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 text-white font-bold rounded-xl hover:shadow-lg transition-all"
          >
            🎵 Connecter mon compte TikTok
          </button>

          <p className="text-[10px] text-center text-neutral-500">
            En connectant, vous autorisez Keiro à publier sur votre TikTok. Révocable à tout moment.
          </p>
        </div>
      </div>
    </div>
  );
}
