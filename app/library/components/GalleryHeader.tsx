interface GalleryHeaderProps {
  user: any;
  stats: {
    total_images: number;
    total_folders: number;
    total_favorites: number;
    total_instagram_drafts: number;
  };
}

export default function GalleryHeader({ user, stats }: GalleryHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold text-neutral-900 mb-2">
        {user ? 'Galerie & Posts' : 'Aperçu Galerie & Posts'}
      </h1>
      <p className="text-neutral-600">
        {user ? (
          <>{stats.total_images} {stats.total_images > 1 ? 'visuels' : 'visuel'} sauvegardé{stats.total_images > 1 ? 's' : ''}</>
        ) : (
          <>Exemples de visuels générés avec Keiro AI</>
        )}
      </p>
    </div>
  );
}
