'use client';

import { useState } from 'react';
import UploadZone from './UploadZone';
import ImageCard from './ImageCard';

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
  published_to_instagram?: boolean;
  published_to_tiktok?: boolean;
};

type MyImagesTabProps = {
  images: SavedImage[];
  user: any;
  isGuest: boolean;
  onRefresh: () => void;
  onDelete: (imageId: string) => void;
  onToggleFavorite: (imageId: string, isFavorite: boolean) => void;
  onPublishToInstagram: (image: SavedImage) => void;
  onPublishToTikTok: (image: SavedImage) => void;
  onTitleEdit: (imageId: string, newTitle: string) => void;
  onDownload: (imageUrl: string, title?: string) => void;
  onSchedule: (image: SavedImage) => void;
};

export default function MyImagesTab({
  images,
  user,
  isGuest,
  onRefresh,
  onDelete,
  onToggleFavorite,
  onPublishToInstagram,
  onPublishToTikTok,
  onTitleEdit,
  onDownload,
  onSchedule
}: MyImagesTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [filterBy, setFilterBy] = useState<'all' | 'favorites' | 'instagram' | 'tiktok'>('all');

  // Filter and sort images
  const filteredImages = images
    .filter(image => {
      // Search filter
      const matchesSearch = !searchQuery ||
        image.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        image.news_title?.toLowerCase().includes(searchQuery.toLowerCase());

      // Category filter
      const matchesFilter =
        filterBy === 'all' ||
        (filterBy === 'favorites' && image.is_favorite) ||
        (filterBy === 'instagram' && image.published_to_instagram) ||
        (filterBy === 'tiktok' && image.published_to_tiktok);

      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString('fr-FR');
  };

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name);
    formData.append('saveToLibrary', 'true');

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    // Refresh images list
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      {user && <UploadZone type="image" onUpload={handleUpload} />}

      {/* Header avec recherche et filtres */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Recherche */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Rechercher une image..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filtres */}
          <div className="flex gap-2">
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as any)}
              className="px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Toutes ({images.length})</option>
              <option value="favorites">Favorites ({images.filter(i => i.is_favorite).length})</option>
              <option value="instagram">Instagram ({images.filter(i => i.published_to_instagram).length})</option>
              <option value="tiktok">TikTok ({images.filter(i => i.published_to_tiktok).length})</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date">Plus récentes</option>
              <option value="title">Titre A-Z</option>
            </select>

            <button
              onClick={onRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              🔄 Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Grille d'images */}
      {filteredImages.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <div className="text-6xl mb-4">📸</div>
          <h3 className="text-xl font-semibold text-neutral-900 mb-2">
            {searchQuery || filterBy !== 'all' ? 'Aucune image trouvée' : 'Aucune image pour le moment'}
          </h3>
          <p className="text-neutral-500 mb-6">
            {searchQuery || filterBy !== 'all'
              ? 'Essayez de modifier vos filtres de recherche'
              : 'Créez votre première image avec Keiro AI'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredImages.map((image) => (
            <ImageCard
              key={image.id}
              image={image}
              user={user}
              isGuest={isGuest}
              onToggleFavorite={(imageId, isFavorite) => onToggleFavorite(imageId, isFavorite)}
              onDelete={onDelete}
              onPublishToInstagram={onPublishToInstagram}
              onPublishToTikTok={onPublishToTikTok}
              onTitleEdit={onTitleEdit}
              onDownload={onDownload}
              onSchedule={onSchedule}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
