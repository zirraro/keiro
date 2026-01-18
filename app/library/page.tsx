'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

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

const HeartIcon = ({ className, filled }: { className?: string; filled?: boolean }) => (
  <svg className={className} fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

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
  folder_id?: string;
};

type Folder = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

export default function LibraryPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<SavedImage[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [stats, setStats] = useState({
    total_images: 0,
    total_folders: 0,
    total_favorites: 0,
    total_instagram_drafts: 0
  });

  // Charger l'utilisateur
  useEffect(() => {
    const loadUser = async () => {
      console.log('[Library] Loading user...');
      const { data: { user }, error } = await supabase.auth.getUser();
      console.log('[Library] User result:', { user, error });
      if (error) console.error('[Library] Error loading user:', error);
      setUser(user);
      setLoading(false);
    };
    loadUser();
  }, [supabase]);

  // Charger les images et dossiers
  useEffect(() => {
    if (!user) return;

    const loadLibrary = async () => {
      try {
        // Charger les dossiers
        const foldersRes = await fetch('/api/library/folders');
        const foldersData = await foldersRes.json();
        if (foldersData.ok) {
          setFolders(foldersData.folders);
          setStats(prev => ({ ...prev, total_folders: foldersData.folders.length }));
        }

        // Charger les images
        await loadImages();
      } catch (error) {
        console.error('[Library] Error loading library:', error);
      }
    };

    loadLibrary();
  }, [user]);

  // Fonction pour charger les images
  const loadImages = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedFolder) params.append('folderId', selectedFolder);
      if (searchQuery) params.append('search', searchQuery);
      if (showFavoritesOnly) params.append('favoritesOnly', 'true');

      const res = await fetch(`/api/library/images?${params}`);
      const data = await res.json();

      if (data.ok) {
        setImages(data.images);
        setStats(prev => ({
          ...prev,
          total_images: data.total,
          total_favorites: data.images.filter((img: SavedImage) => img.is_favorite).length
        }));
      }
    } catch (error) {
      console.error('[Library] Error loading images:', error);
    }
  };

  // Recharger quand les filtres changent
  useEffect(() => {
    if (user) {
      loadImages();
    }
  }, [selectedFolder, searchQuery, showFavoritesOnly, user]);

  // Toggle favori
  const toggleFavorite = async (imageId: string, currentState: boolean) => {
    try {
      const res = await fetch('/api/library/images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: imageId, isFavorite: !currentState })
      });

      if (res.ok) {
        await loadImages();
      }
    } catch (error) {
      console.error('[Library] Error toggling favorite:', error);
    }
  };

  // Supprimer une image
  const deleteImage = async (imageId: string) => {
    if (!confirm('Supprimer cette image de votre librairie ?')) return;

    try {
      const res = await fetch(`/api/library/images?id=${imageId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        await loadImages();
      }
    } catch (error) {
      console.error('[Library] Error deleting image:', error);
    }
  };

  // Télécharger une image
  const downloadImage = async (imageUrl: string, title?: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = title || `keiro-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('[Library] Error downloading image:', error);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-neutral-600">Chargement de votre librairie...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-white">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-sm text-white mb-6 shadow-lg">
              <PhotoIcon className="w-4 h-4" />
              Librairie verrouillée
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-6 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Connectez-vous pour accéder à votre librairie
            </h1>
            <p className="text-lg text-neutral-600 mb-8">
              Sauvegardez, organisez et gérez tous vos visuels générés dans un seul endroit.
            </p>
            <div className="flex gap-4 justify-center">
              <a
                href="/login"
                className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Se connecter
              </a>
              <a
                href="/generate"
                className="px-6 py-3 rounded-xl border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors"
              >
                Générer un visuel
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Ma Librairie</h1>
          <p className="text-neutral-600">
            {stats.total_images} {stats.total_images > 1 ? 'visuels' : 'visuel'} sauvegardé{stats.total_images > 1 ? 's' : ''}
          </p>
        </div>

        {/* Filtres et recherche */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Recherche */}
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <input
                type="text"
                placeholder="Rechercher dans ma librairie..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filtre dossiers */}
            <select
              value={selectedFolder || ''}
              onChange={(e) => setSelectedFolder(e.target.value || null)}
              className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous les dossiers</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.icon} {folder.name}
                </option>
              ))}
            </select>

            {/* Favoris */}
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
                showFavoritesOnly
                  ? 'border-red-500 bg-red-50 text-red-600'
                  : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <HeartIcon className="w-5 h-5 inline mr-2" filled={showFavoritesOnly} />
              Favoris {stats.total_favorites > 0 && `(${stats.total_favorites})`}
            </button>
          </div>
        </div>

        {/* Grille d'images */}
        {images.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
            <PhotoIcon className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-neutral-900 mb-2">
              {searchQuery || selectedFolder || showFavoritesOnly
                ? 'Aucun visuel trouvé'
                : 'Votre librairie est vide'}
            </h3>
            <p className="text-neutral-600 mb-6">
              {searchQuery || selectedFolder || showFavoritesOnly
                ? 'Essayez de modifier vos filtres de recherche'
                : 'Commencez par générer des visuels et sauvegardez-les ici'}
            </p>
            {!searchQuery && !selectedFolder && !showFavoritesOnly && (
              <a
                href="/generate"
                className="inline-block px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Générer mon premier visuel
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((image) => (
              <div
                key={image.id}
                className="group relative bg-white rounded-lg border border-neutral-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Image */}
                <div className="aspect-square bg-neutral-100 relative">
                  <img
                    src={image.thumbnail_url || image.image_url}
                    alt={image.title || image.news_title || 'Visuel'}
                    className="w-full h-full object-cover"
                  />

                  {/* Overlay avec actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => toggleFavorite(image.id, image.is_favorite)}
                      className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors"
                      title={image.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    >
                      <HeartIcon className="w-5 h-5 text-red-500" filled={image.is_favorite} />
                    </button>
                    <button
                      onClick={() => downloadImage(image.image_url, image.title || image.news_title)}
                      className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors"
                      title="Télécharger"
                    >
                      <DownloadIcon className="w-5 h-5 text-blue-600" />
                    </button>
                    <button
                      onClick={() => deleteImage(image.id)}
                      className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors"
                      title="Supprimer"
                    >
                      <TrashIcon className="w-5 h-5 text-red-600" />
                    </button>
                  </div>

                  {/* Badge favori */}
                  {image.is_favorite && (
                    <div className="absolute top-2 right-2">
                      <HeartIcon className="w-6 h-6 text-red-500 drop-shadow-lg" filled />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {image.title || image.news_title || 'Sans titre'}
                  </p>
                  {image.news_category && (
                    <p className="text-xs text-neutral-500 mt-1">
                      {image.news_category}
                    </p>
                  )}
                  <p className="text-xs text-neutral-400 mt-1">
                    {new Date(image.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats footer */}
        <div className="mt-8 pt-6 border-t border-neutral-200 flex justify-between text-sm text-neutral-500">
          <span>Total: {stats.total_images} visuels</span>
          <span>{stats.total_folders} dossiers • {stats.total_favorites} favoris</span>
        </div>
      </div>
    </main>
  );
}
