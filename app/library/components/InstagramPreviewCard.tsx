import { InstagramIcon } from './Icons';

interface InstagramPreviewCardProps {
  user: any;
  isGuest?: boolean;
  draftCount: number;
  onOpenModal: () => void;
  onStartFree?: () => void;
}

export default function InstagramPreviewCard({ user, isGuest, draftCount, onOpenModal, onStartFree }: InstagramPreviewCardProps) {
  // Version visiteur (ni user ni guest) - Mise en valeur de la fonctionnalité
  if (!user && !isGuest) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-pink-500 to-purple-700 rounded-xl shadow-xl mb-6">
        {/* Motif de fond décoratif */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        </div>

        <div className="relative px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col md:flex-row items-center gap-4">
            {/* Icône */}
            <div className="flex-shrink-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30 shadow-lg">
                <InstagramIcon className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              </div>
            </div>

            {/* Contenu */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-block px-2 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-semibold text-white mb-2">
                ✨ Fonctionnalité Premium
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Studio de Publication Instagram
              </h2>
              <p className="text-white/90 text-sm sm:text-base leading-relaxed mb-3 max-w-2xl">
                Créez des posts professionnels avec l'IA : suggestions de descriptions, hashtags optimisés et gestion de brouillons.
              </p>

              {/* Features list - version compacte */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="flex items-center gap-1.5 text-white/90">
                  <svg className="w-4 h-4 text-green-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium">Suggestions IA</span>
                </div>
                <div className="flex items-center gap-1.5 text-white/90">
                  <svg className="w-4 h-4 text-green-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium">Brouillons</span>
                </div>
                <div className="flex items-center gap-1.5 text-white/90">
                  <svg className="w-4 h-4 text-green-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium">Hashtags</span>
                </div>
                <div className="flex items-center gap-1.5 text-white/90">
                  <svg className="w-4 h-4 text-green-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium">Planning (bientôt)</span>
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={onStartFree}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-purple-600 rounded-lg font-semibold text-sm hover:bg-neutral-50 transition-all shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
              >
                <span>Commencer gratuitement</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Version utilisateur connecté ou guest - Carte compacte
  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-5 mb-6 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <InstagramIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-neutral-900 text-lg">Studio Instagram</h3>
            <p className="text-sm text-neutral-600">
              {draftCount > 0 ? `${draftCount} brouillon${draftCount > 1 ? 's' : ''} en attente` : 'Aucun brouillon'}
            </p>
          </div>
        </div>
        <button
          onClick={onOpenModal}
          className="px-5 py-3 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:from-purple-700 hover:to-pink-700 transition-all flex items-center gap-2 shadow-md hover:shadow-xl hover:scale-105 active:scale-95"
        >
          <InstagramIcon className="w-5 h-5" />
          <span className="hidden sm:inline">Préparer un post</span>
          <span className="sm:hidden">Nouveau</span>
        </button>
      </div>
    </div>
  );
}
