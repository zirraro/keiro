'use client';

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { HeartIcon, DownloadIcon, TrashIcon, InstagramIcon } from './Icons';

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

interface ImageCardProps {
  image: SavedImage;
  user: any;
  onToggleFavorite: (imageId: string, currentState: boolean) => void;
  onDownload: (imageUrl: string, title?: string) => void;
  onDelete: (imageId: string) => void;
  onOpenInstagram: (image: SavedImage) => void;
  onTitleEdit: (imageId: string, newTitle: string) => void;
}

export default function ImageCard({
  image,
  user,
  onToggleFavorite,
  onDownload,
  onDelete,
  onOpenInstagram,
  onTitleEdit
}: ImageCardProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(image.title || image.news_title || '');

  const handleTitleClick = () => {
    if (user) {
      setIsEditingTitle(true);
    }
  };

  const handleTitleSave = () => {
    const newTitle = editedTitle.trim();
    if (newTitle !== (image.title || image.news_title || '')) {
      onTitleEdit(image.id, newTitle);
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditedTitle(image.title || image.news_title || '');
    setIsEditingTitle(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      handleTitleCancel();
    }
  };

  // Drag and drop
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: image.id,
    disabled: !user
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : user ? 'grab' : 'default'
  } : {
    cursor: user ? 'grab' : 'default'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative bg-white rounded-lg border border-neutral-200 overflow-hidden hover:shadow-lg transition-shadow"
    >
      {/* Image */}
      <div className="aspect-square bg-neutral-100 relative">
        <img
          src={image.thumbnail_url || image.image_url}
          alt={image.title || image.news_title || 'Visuel généré'}
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {/* Overlay avec actions - Desktop uniquement */}
        <div className="hidden md:flex absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex-col items-center justify-center gap-2 p-4">
          {user ? (
            <>
              <div className="flex gap-2">
                <button
                  onClick={() => onToggleFavorite(image.id, image.is_favorite)}
                  className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                  title={image.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  aria-label={image.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <HeartIcon className="w-5 h-5 text-red-500" filled={image.is_favorite} />
                </button>
                <button
                  onClick={() => onDownload(image.image_url, image.title || image.news_title)}
                  className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Télécharger"
                  aria-label="Télécharger l'image"
                >
                  <DownloadIcon className="w-5 h-5 text-blue-600" />
                </button>
                <button
                  onClick={() => onDelete(image.id)}
                  className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                  title="Supprimer"
                  aria-label="Supprimer l'image"
                >
                  <TrashIcon className="w-5 h-5 text-red-600" />
                </button>
              </div>
              <button
                onClick={() => onOpenInstagram(image)}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-2 shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                title="Préparer post Instagram"
                aria-label="Préparer un post Instagram"
              >
                <InstagramIcon className="w-5 h-5" />
                <span className="text-sm">Préparer post</span>
              </button>
            </>
          ) : (
            <div className="text-center">
              <p className="text-white font-semibold mb-3">Mode Visiteur</p>
              <a
                href="/login"
                className="inline-block px-6 py-3 rounded-lg bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-colors shadow-lg"
              >
                Connectez-vous pour interagir
              </a>
            </div>
          )}
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
        {/* Titre éditable */}
        {isEditingTitle ? (
          <input
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 text-sm font-medium border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            maxLength={100}
          />
        ) : (
          <p
            onClick={handleTitleClick}
            className={`text-sm font-medium text-neutral-900 truncate ${
              user ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''
            }`}
            title={user ? 'Cliquer pour modifier' : undefined}
          >
            {image.title || image.news_title || 'Sans titre'}
          </p>
        )}

        {image.news_category && (
          <p className="text-xs text-neutral-500 mt-1">
            {image.news_category}
          </p>
        )}
        <p className="text-xs text-neutral-400 mt-1">
          {new Date(image.created_at).toLocaleDateString('fr-FR')}
        </p>

        {/* Actions mobiles - Visible uniquement sur mobile */}
        <div className="md:hidden mt-3 pt-3 border-t border-neutral-200">
          {user ? (
            <div className="flex gap-2">
              <button
                onClick={() => onToggleFavorite(image.id, image.is_favorite)}
                className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
                aria-label={image.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              >
                <HeartIcon className="w-4 h-4 text-red-500" filled={image.is_favorite} />
              </button>
              <button
                onClick={() => onDownload(image.image_url, image.title || image.news_title)}
                className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
                aria-label="Télécharger l'image"
              >
                <DownloadIcon className="w-4 h-4 text-blue-600" />
              </button>
              <button
                onClick={() => onOpenInstagram(image)}
                className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-medium hover:from-purple-600 hover:to-pink-600 transition-all flex items-center justify-center gap-1"
                aria-label="Préparer un post Instagram"
              >
                <InstagramIcon className="w-4 h-4" />
                <span>Post Insta</span>
              </button>
              <button
                onClick={() => onDelete(image.id)}
                className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                aria-label="Supprimer l'image"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <a
              href="/login"
              className="block w-full px-4 py-2 text-center rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Connectez-vous pour interagir
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
