import BookDemoButton from '@/components/BookDemoButton';
import AddContentButton from './AddContentButton';

interface GalleryHeaderProps {
  user: any;
  stats: {
    total_images: number;
    total_folders: number;
    total_favorites: number;
    total_instagram_drafts: number;
  };
  isGuest?: boolean;
  onUpload?: (files: FileList) => void;
  onUploadComplete?: () => void;
}

export default function GalleryHeader({ user, stats, isGuest, onUpload, onUploadComplete }: GalleryHeaderProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onUpload) {
      onUpload(files);
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            {user || isGuest ? 'Galerie & Posts' : 'Aperçu Galerie & Posts'}
          </h1>
          <p className="text-neutral-600">
            {user || isGuest ? (
              <>{stats.total_images} {stats.total_images > 1 ? 'visuels' : 'visuel'} sauvegardé{stats.total_images > 1 ? 's' : ''}</>
            ) : (
              <>Exemples de visuels générés avec Keiro AI</>
            )}
          </p>
        </div>

        {/* Boutons d'action */}
        <div className="flex items-center gap-3">
          {/* Bouton Ajouter du contenu (Images/Vidéos) */}
          {(user || isGuest) && onUploadComplete && (
            <AddContentButton onUploadComplete={onUploadComplete} />
          )}

          {/* Bouton Démo */}
          <BookDemoButton variant="outline" size="md" />
        </div>
      </div>
    </div>
  );
}
