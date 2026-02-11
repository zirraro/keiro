'use client';

import { useState } from 'react';

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

interface ImageCardProps {
  image: SavedImage;
  user: any;
  isGuest?: boolean;
  onToggleFavorite: (imageId: string, currentState: boolean) => void;
  onDownload: (imageUrl: string, title?: string) => void;
  onDelete: (imageId: string) => void;
  onOpenInstagram?: (image: SavedImage) => void;
  onPublishToInstagram?: (image: SavedImage) => void;
  onPublishToTikTok?: (image: SavedImage) => void;
  onSchedule?: (image: SavedImage) => void;
  onMoveToFolder?: (image: SavedImage) => void;
  onTitleEdit: (imageId: string, newTitle: string) => void;
  formatDate?: (dateString: string) => string;
}

export default function ImageCard({
  image,
  user,
  isGuest = false,
  onToggleFavorite,
  onDownload,
  onDelete,
  onOpenInstagram,
  onTitleEdit,
  onPublishToInstagram,
  onPublishToTikTok,
  onMoveToFolder,
  formatDate
}: ImageCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(image.title || image.news_title || '');

  const handleSaveTitle = () => {
    if (editedTitle.trim()) {
      onTitleEdit(image.id, editedTitle.trim());
    }
    setIsEditing(false);
  };

  const defaultFormatDate = (dateString: string) => {
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

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden group hover:shadow-lg transition-shadow">
      {/* Image preview - Format vidéo comme Mes vidéos */}
      <div className="relative aspect-video bg-neutral-900">
        <img
          src={image.thumbnail_url || image.image_url}
          alt={image.title || image.news_title || 'Image'}
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {/* Badges */}
        <div className="absolute top-2 left-2 flex gap-2">
          {image.is_favorite && (
            <span className="bg-pink-500 text-white text-xs px-1.5 py-1 rounded-full flex items-center">
              <svg className="w-3.5 h-3.5" fill="currentColor" stroke="none" viewBox="0 0 24 24">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </span>
          )}
          {image.published_to_instagram && (
            <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full">
              ✓ Instagram
            </span>
          )}
          {image.published_to_tiktok && (
            <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
              ✓ TikTok
            </span>
          )}
        </div>
      </div>

      {/* Image info */}
      <div className="p-4 space-y-2">
        {/* Title */}
        {isEditing ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSaveTitle()}
              className="flex-1 px-2 py-1 border border-neutral-300 rounded text-sm"
              placeholder="Titre de l'image"
              autoFocus
            />
            <button
              onClick={handleSaveTitle}
              className="text-green-600 hover:text-green-700"
            >
              ✓
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="text-red-600 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        ) : (
          <h4
            onClick={() => setIsEditing(true)}
            className="font-medium text-neutral-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
            title="Cliquer pour modifier le titre"
          >
            {image.title || image.news_title || 'Sans titre'}
          </h4>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>{formatDate ? formatDate(image.created_at) : defaultFormatDate(image.created_at)}</span>
          {image.news_category && <span>{image.news_category}</span>}
        </div>

        {/* Actions visibles */}
        <div className="pt-3 border-t border-neutral-200">
          <div className="flex items-center gap-1.5">
            {/* Poster */}
            {!image.published_to_instagram && !image.published_to_tiktok && (
              <button
                onClick={() => {
                  if (onPublishToInstagram) onPublishToInstagram(image);
                  else if (onOpenInstagram) onOpenInstagram(image);
                }}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-semibold rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Poster
              </button>
            )}
            {/* Ranger */}
            {onMoveToFolder && (
              <button
                onClick={() => onMoveToFolder(image)}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-lg hover:bg-purple-200 transition-all shadow-sm"
                title="Ranger dans un dossier"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Ranger
              </button>
            )}
            <div className="flex-1" />
            {/* Favoris - icone seule */}
            <button
              onClick={() => onToggleFavorite(image.id, image.is_favorite)}
              className={`p-1.5 rounded-lg transition-all ${
                image.is_favorite ? 'text-pink-600 hover:bg-pink-50' : 'text-neutral-400 hover:bg-neutral-100'
              }`}
              title={image.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <svg className="w-4 h-4" fill={image.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
            {/* Telecharger - icone seule */}
            <a
              href={image.image_url}
              download
              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-all"
              title="Télécharger"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
            {/* Supprimer - icone seule */}
            <button
              onClick={() => { if (confirm('Êtes-vous sûr de vouloir supprimer cette image ?')) onDelete(image.id); }}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-all"
              title="Supprimer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
