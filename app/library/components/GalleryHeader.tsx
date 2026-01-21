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
}

export default function GalleryHeader({ user, stats, isGuest, onUpload }: GalleryHeaderProps) {
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

        {/* Bouton Upload (pour guests et users) */}
        {(user || isGuest) && onUpload && (
          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:shadow-lg transition-all font-semibold">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Ajouter des images</span>
          </label>
        )}
      </div>
    </div>
  );
}
