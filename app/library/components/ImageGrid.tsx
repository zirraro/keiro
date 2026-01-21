import ImageCard from './ImageCard';
import { PhotoIcon } from './Icons';
import LoadingSkeleton from './LoadingSkeleton';

type SavedImage = {
  id: string;
  image_url: string;
  thumbnail_url?: string;
  title?: string;
  news_title?: string;
  news_category?: string;
  text_overlay?: string;
  is_favorite: boolean;
  created_at: string;
  folder_id?: string | null;
};

interface ImageGridProps {
  images: SavedImage[];
  user: any;
  isGuest?: boolean;
  searchQuery: string;
  selectedFolder: string | null;
  showFavoritesOnly: boolean;
  onToggleFavorite: (imageId: string, currentState: boolean) => void;
  onDownload: (imageUrl: string, title?: string) => void;
  onDelete: (imageId: string) => void;
  onOpenInstagram: (image: SavedImage) => void;
  onTitleEdit: (imageId: string, newTitle: string) => void;
}

export default function ImageGrid({
  images,
  user,
  isGuest = false,
  searchQuery,
  selectedFolder,
  showFavoritesOnly,
  onToggleFavorite,
  onDownload,
  onDelete,
  onOpenInstagram,
  onTitleEdit
}: ImageGridProps) {
  if (images.length === 0) {
    const isFiltering = searchQuery || selectedFolder || showFavoritesOnly;

    return (
      <div className="bg-gradient-to-br from-neutral-50 to-white rounded-xl border border-neutral-200 p-12 text-center">
        <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <PhotoIcon className="w-10 h-10 text-neutral-400" />
        </div>
        <h3 className="text-2xl font-bold text-neutral-900 mb-3">
          {isFiltering ? 'Aucun visuel trouvé' : 'Votre galerie est vide'}
        </h3>
        <p className="text-neutral-700 mb-8 max-w-lg mx-auto text-base leading-relaxed">
          {isFiltering
            ? 'Aucun visuel ne correspond à vos critères de recherche. Essayez de modifier vos filtres ou lancez une nouvelle recherche.'
            : 'Propulsez votre présence sur les réseaux sociaux avec des visuels professionnels créés en quelques secondes. Générez du contenu engageant qui convertit vos visiteurs en clients et maximise votre impact digital.'}
        </p>
        {!isFiltering && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="/generate"
              className="group inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-lg hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg hover:shadow-2xl hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-offset-2"
            >
              <svg className="w-6 h-6 group-hover:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Générer mes visuels maintenant</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
            <a
              href="/news"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-neutral-300 bg-white text-neutral-700 font-semibold hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              Découvrir les actualités
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {images.map((image) => (
        <ImageCard
          key={image.id}
          image={image}
          user={user}
          isGuest={isGuest}
          onToggleFavorite={onToggleFavorite}
          onDownload={onDownload}
          onDelete={onDelete}
          onOpenInstagram={onOpenInstagram}
          onTitleEdit={onTitleEdit}
        />
      ))}
    </div>
  );
}
