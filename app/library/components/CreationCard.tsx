'use client';

import { useState } from 'react';

export interface CreationItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  title?: string;
  folderId?: string;
  folderName?: string;
  folderIcon?: string;
  folderColor?: string;
  is_favorite: boolean;
  created_at: string;
  duration?: number; // For videos
  published_to_instagram?: boolean; // For images
  published_to_tiktok?: boolean;
}

interface CreationCardProps {
  item: CreationItem;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onTitleEdit: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onPublish: (item: CreationItem, platform: 'instagram' | 'tiktok') => void;
  onDownload: (item: CreationItem) => void;
}

export default function CreationCard({
  item,
  onToggleFavorite,
  onTitleEdit,
  onDelete,
  onPublish,
  onDownload
}: CreationCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(item.title || '');

  const handleTitleSave = () => {
    if (editedTitle.trim() && editedTitle !== item.title) {
      onTitleEdit(item.id, editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden group hover:shadow-md transition-shadow">
      {/* Media Preview */}
      <div className="relative aspect-square bg-neutral-100">
        {item.type === 'image' ? (
          <img
            src={item.url}
            alt={item.title || 'Image'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="relative w-full h-full">
            <video
              src={item.url}
              poster={item.thumbnailUrl}
              className="w-full h-full object-cover"
              preload="metadata"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
              <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
            {item.duration && (
              <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                {formatDuration(item.duration)}
              </div>
            )}
          </div>
        )}

        {/* Type Badge */}
        <div className="absolute top-2 left-2 bg-white bg-opacity-90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-semibold">
          {item.type === 'image' ? '📸 Image' : '🎬 Vidéo'}
        </div>

        {/* Favorite Badge */}
        {item.is_favorite && (
          <div className="absolute top-2 right-10 bg-yellow-100 text-yellow-700 p-1.5 rounded-full">
            ⭐
          </div>
        )}

        {/* Menu Kebab */}
        <div className="absolute top-2 right-2">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="bg-white bg-opacity-90 backdrop-blur-sm p-1.5 rounded-full hover:bg-opacity-100 transition-all"
          >
            <svg className="w-5 h-5 text-neutral-700" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 z-10 overflow-hidden">
              <button
                onClick={() => {
                  onToggleFavorite(item.id, !item.is_favorite);
                  setIsMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors flex items-center gap-2"
              >
                <span>{item.is_favorite ? '⭐' : '☆'}</span>
                {item.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              </button>

              <button
                onClick={() => {
                  setIsEditingTitle(true);
                  setIsMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors flex items-center gap-2"
              >
                <span>✏️</span>
                Éditer le titre
              </button>

              {item.type === 'image' && (
                <button
                  onClick={() => {
                    onPublish(item, 'instagram');
                    setIsMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors flex items-center gap-2"
                >
                  <span>📷</span>
                  Publier sur Instagram
                </button>
              )}

              <button
                onClick={() => {
                  onPublish(item, 'tiktok');
                  setIsMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors flex items-center gap-2"
              >
                <span>🎵</span>
                Publier sur TikTok
              </button>

              <button
                onClick={() => {
                  onDownload(item);
                  setIsMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors flex items-center gap-2"
              >
                <span>⬇️</span>
                Télécharger
              </button>

              <div className="border-t border-neutral-200"></div>

              <button
                onClick={() => {
                  if (confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) {
                    onDelete(item.id);
                  }
                  setIsMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <span>🗑️</span>
                Supprimer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="p-3">
        {isEditingTitle ? (
          <input
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') {
                setEditedTitle(item.title || '');
                setIsEditingTitle(false);
              }
            }}
            autoFocus
            className="w-full px-2 py-1 text-sm font-semibold border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <h4
            className="text-sm font-semibold text-neutral-900 truncate cursor-pointer hover:text-blue-600"
            onClick={() => setIsEditingTitle(true)}
            title={item.title || 'Sans titre'}
          >
            {item.title || 'Sans titre'}
          </h4>
        )}

        <p className="text-xs text-neutral-500 mt-1">
          {new Date(item.created_at).toLocaleDateString('fr-FR')}
        </p>

        {/* Publication Status */}
        <div className="flex gap-1 mt-2">
          {item.published_to_instagram && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              📷 Instagram
            </span>
          )}
          {item.published_to_tiktok && (
            <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">
              🎵 TikTok
            </span>
          )}
        </div>
      </div>

      {/* Close menu when clicking outside */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsMenuOpen(false)}
        ></div>
      )}
    </div>
  );
}
