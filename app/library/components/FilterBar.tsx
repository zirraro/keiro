import { MagnifyingGlassIcon, HeartIcon } from './Icons';

type Folder = {
  id: string;
  name: string;
  icon: string;
  color: string;
  image_count?: number;
};

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedFolder: string | null;
  setSelectedFolder: (folderId: string | null) => void;
  folders: Folder[];
  showFavoritesOnly: boolean;
  setShowFavoritesOnly: (show: boolean) => void;
  favoritesCount: number;
  onCreateFolder?: () => void;
}

export default function FilterBar({
  searchQuery,
  setSearchQuery,
  selectedFolder,
  setSelectedFolder,
  folders,
  showFavoritesOnly,
  setShowFavoritesOnly,
  favoritesCount,
  onCreateFolder
}: FilterBarProps) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Recherche */}
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Rechercher dans ma galerie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Rechercher dans la galerie"
          />
        </div>

        {/* Filtre dossiers */}
        <div className="flex gap-2">
          <select
            value={selectedFolder || ''}
            onChange={(e) => setSelectedFolder(e.target.value || null)}
            className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Filtrer par dossier"
          >
            <option value="">Tous les dossiers</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.icon} {folder.name} {folder.image_count !== undefined ? `(${folder.image_count})` : ''}
              </option>
            ))}
          </select>

          {onCreateFolder && (
            <button
              onClick={onCreateFolder}
              className="px-4 py-2 rounded-lg border border-blue-300 bg-blue-50 text-blue-600 font-medium hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Créer un dossier"
              aria-label="Créer un nouveau dossier"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>

        {/* Favoris */}
        <button
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          className={`px-4 py-2 rounded-lg border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 ${
            showFavoritesOnly
              ? 'border-red-500 bg-red-50 text-red-600'
              : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
          }`}
          aria-label={showFavoritesOnly ? 'Afficher tous les visuels' : 'Afficher seulement les favoris'}
          aria-pressed={showFavoritesOnly}
        >
          <HeartIcon className="w-5 h-5 inline mr-2" filled={showFavoritesOnly} />
          Favoris {favoritesCount > 0 && `(${favoritesCount})`}
        </button>
      </div>
    </div>
  );
}
