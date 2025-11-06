'use client';

// Simple SVG Icons
const BookmarkIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
  </svg>
);

const FolderIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const MagnifyingGlassIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const PhotoIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

export default function LibraryPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-white">
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200 px-4 py-2 text-sm text-blue-700 mb-6">
            <PhotoIcon className="w-4 h-4" />
            Fonctionnalité à venir
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-6">
            Votre Librairie de Visuels
          </h1>
          <p className="text-lg text-neutral-600">
            Un espace personnel pour sauvegarder, organiser et retrouver tous vos visuels générés.
            Bientôt disponible après connexion.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {/* Feature 1: Save */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-8 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
              <BookmarkIcon className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-neutral-900 mb-3">
              Sauvegardez vos créations
            </h3>
            <p className="text-neutral-600">
              Tous vos visuels générés seront automatiquement sauvegardés dans votre librairie personnelle.
              Plus besoin de les télécharger immédiatement !
            </p>
          </div>

          {/* Feature 2: Organize */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-8 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-4">
              <FolderIcon className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold text-neutral-900 mb-3">
              Organisez par dossiers
            </h3>
            <p className="text-neutral-600">
              Créez des dossiers par thème, par client, par campagne... Organisez vos visuels comme vous le souhaitez.
            </p>
          </div>

          {/* Feature 3: Search */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-8 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mb-4">
              <MagnifyingGlassIcon className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold text-neutral-900 mb-3">
              Retrouvez rapidement
            </h3>
            <p className="text-neutral-600">
              Recherchez vos visuels par mots-clés, par date, par catégorie d'actualité ou par titre.
            </p>
          </div>
        </div>

        {/* Preview Section */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 md:p-12">
          <h2 className="text-2xl font-semibold text-neutral-900 mb-6 text-center">
            Aperçu de la Librairie
          </h2>

          {/* Mock Library UI */}
          <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-6">
            {/* Search and Filter Bar */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Rechercher dans ma librairie..."
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400"
                    disabled
                  />
                </div>
              </div>
              <select
                className="px-4 py-3 rounded-lg border border-neutral-300 bg-white text-neutral-600"
                disabled
              >
                <option>Tous les dossiers</option>
                <option>Mes favoris</option>
                <option>Récents</option>
              </select>
            </div>

            {/* Mock Visual Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="aspect-square bg-neutral-200 rounded-lg animate-pulse flex items-center justify-center"
                >
                  <PhotoIcon className="w-12 h-12 text-neutral-400" />
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="mt-6 pt-6 border-t border-neutral-200 flex justify-between text-sm text-neutral-500">
              <span>Total: 0 visuels</span>
              <span>Espace utilisé: 0 MB</span>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="font-semibold text-blue-900 mb-2">
              Fonctionnalité en développement
            </h3>
            <p className="text-blue-700">
              La librairie sera disponible après connexion. Vous pourrez sauvegarder automatiquement
              tous vos visuels générés et y accéder à tout moment. Cette fonctionnalité sera déployée
              prochainement avec le système d'authentification.
            </p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center">
          <h3 className="text-2xl font-semibold text-neutral-900 mb-4">
            En attendant, continuez à créer !
          </h3>
          <p className="text-neutral-600 mb-6">
            Générez vos visuels dès maintenant et téléchargez-les. La sauvegarde automatique arrivera bientôt.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="/generate"
              className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Générer un visuel
            </a>
            <a
              href="/"
              className="px-6 py-3 rounded-xl border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors"
            >
              Retour à l'accueil
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
