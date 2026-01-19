import { InstagramIcon } from './Icons';

interface InstagramPreviewCardProps {
  user: any;
  draftCount: number;
  onOpenModal: () => void;
}

export default function InstagramPreviewCard({ user, draftCount, onOpenModal }: InstagramPreviewCardProps) {
  // Version visiteur - Mise en valeur de la fonctionnalité
  if (!user) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-pink-500 to-purple-700 rounded-2xl shadow-2xl mb-8">
        {/* Motif de fond décoratif */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        </div>

        <div className="relative px-6 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Icône et titre */}
            <div className="flex-shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-4 ring-white/30 shadow-xl">
                <InstagramIcon className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
              </div>
            </div>

            {/* Contenu */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-semibold text-white mb-3">
                ✨ Fonctionnalité Premium
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                Studio de Publication Instagram
              </h2>
              <p className="text-white/90 text-base sm:text-lg leading-relaxed mb-5 max-w-2xl">
                Créez des posts Instagram professionnels en quelques clics. Intelligence artificielle pour les descriptions et hashtags, planification automatique, et bien plus encore.
              </p>

              {/* Features list */}
              <div className="grid sm:grid-cols-2 gap-3 mb-6">
                <div className="flex items-center gap-2 text-white/90">
                  <svg className="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium">Suggestions IA personnalisées</span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <svg className="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium">Gestion des brouillons</span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <svg className="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium">Hashtags optimisés</span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <svg className="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium">Publication planifiée (bientôt)</span>
                </div>
              </div>

              {/* CTA */}
              <a
                href="/login"
                className="inline-flex items-center gap-3 px-8 py-4 bg-white text-purple-600 rounded-xl font-bold text-lg hover:bg-neutral-50 transition-all shadow-2xl hover:shadow-3xl hover:scale-105 active:scale-95"
              >
                <span>Commencer gratuitement</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Version utilisateur connecté - Carte compacte
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
