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
  isGuest?: boolean;
  onToggleFavorite: (imageId: string, currentState: boolean) => void;
  onDownload: (imageUrl: string, title?: string) => void;
  onDelete: (imageId: string) => void;
  onOpenInstagram: (image: SavedImage) => void;
  onSchedule?: (image: SavedImage) => void;
  onTitleEdit: (imageId: string, newTitle: string) => void;
}

export default function ImageCard({
  image,
  user,
  isGuest = false,
  onToggleFavorite,
  onDownload,
  onDelete,
  onOpenInstagram,
  onSchedule,
  onTitleEdit
}: ImageCardProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(image.title || image.news_title || '');

  const handleTitleClick = () => {
    if (user || isGuest) {
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

  // Drag and drop - SEULEMENT sur desktop
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: image.id,
    disabled: !user
  });

  const dragStyle = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <div className="group relative bg-white rounded-lg border border-neutral-200 overflow-hidden hover:shadow-lg transition-shadow">
      {/* Image avec drag handle UNIQUEMENT pour desktop */}
      <div className="aspect-square bg-neutral-100 relative">
        {/* Image desktop avec drag handle si utilisateur connecté */}
        {user ? (
          <div
            ref={setNodeRef}
            style={dragStyle}
            {...attributes}
            {...listeners}
            className="hidden md:block absolute inset-0 z-0"
          >
            <img
              src={image.thumbnail_url || image.image_url}
              alt={image.title || image.news_title || 'Visuel généré'}
              className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
              loading="lazy"
              draggable={false}
            />
          </div>
        ) : (
          /* Image desktop sans drag pour visiteurs */
          <div className="hidden md:block absolute inset-0 z-0">
            <img
              src={image.thumbnail_url || image.image_url}
              alt={image.title || image.news_title || 'Visuel généré'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Image normale pour mobile (sans drag) */}
        <div className="md:hidden absolute inset-0">
          <img
            src={image.thumbnail_url || image.image_url}
            alt={image.title || image.news_title || 'Visuel généré'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>

        {/* Overlay avec actions - Desktop HOVER - pointer-events TOUJOURS none, seulement les boutons sont cliquables */}
        <div className={`hidden md:flex absolute inset-0 bg-black/60 ${isDragging ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'} transition-opacity flex-col items-center justify-center gap-2 p-4 z-10 pointer-events-none`}>
          {(user || isGuest) ? (
            <>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(image.id, image.is_favorite);
                  }}
                  className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 pointer-events-auto"
                  title={image.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  aria-label={image.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <HeartIcon className="w-5 h-5 text-red-500" filled={image.is_favorite} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(image.image_url, image.title || image.news_title);
                  }}
                  className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 pointer-events-auto"
                  title="Télécharger"
                  aria-label="Télécharger l'image"
                >
                  <DownloadIcon className="w-5 h-5 text-blue-600" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(image.id);
                  }}
                  className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 pointer-events-auto"
                  title="Supprimer"
                  aria-label="Supprimer l'image"
                >
                  <TrashIcon className="w-5 h-5 text-red-600" />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenInstagram(image);
                  }}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-2 shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 pointer-events-auto"
                  title="Préparer post Instagram"
                  aria-label="Préparer un post Instagram"
                >
                  <InstagramIcon className="w-5 h-5" />
                  <span className="text-sm">Préparer post</span>
                </button>
                {onSchedule && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSchedule(image);
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 transition-all flex items-center gap-2 shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 pointer-events-auto"
                    title="Planifier publication"
                    aria-label="Planifier une publication"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm">Planifier</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="text-center pointer-events-auto">
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
          <div className="absolute top-2 right-2 z-20">
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
              (user || isGuest) ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''
            }`}
            title={(user || isGuest) ? 'Cliquer pour modifier' : undefined}
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
          {(user || isGuest) ? (
            <div className="flex flex-col gap-2">
              {/* Boutons principaux */}
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onOpenInstagram(image);
                  }}
                  className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold hover:from-purple-600 hover:to-pink-600 transition-all flex items-center justify-center gap-2 shadow-md active:scale-95"
                  type="button"
                >
                  <InstagramIcon className="w-5 h-5" />
                  <span>Post</span>
                </button>
                {onSchedule && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onSchedule(image);
                    }}
                    className="flex-1 px-4 py-3 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-md active:scale-95"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Planifier</span>
                  </button>
                )}
              </div>

              {/* Actions secondaires */}
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onToggleFavorite(image.id, image.is_favorite);
                  }}
                  className="flex-1 p-3 rounded-lg border-2 border-neutral-200 hover:border-red-300 hover:bg-red-50 transition-colors active:scale-95"
                  aria-label={image.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  type="button"
                >
                  <HeartIcon className="w-5 h-5 text-red-500 mx-auto" filled={image.is_favorite} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onDownload(image.image_url, image.title || image.news_title);
                  }}
                  className="flex-1 p-3 rounded-lg border-2 border-neutral-200 hover:border-blue-300 hover:bg-blue-50 transition-colors active:scale-95"
                  aria-label="Télécharger l'image"
                  type="button"
                >
                  <DownloadIcon className="w-5 h-5 text-blue-600 mx-auto" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (confirm('Voulez-vous vraiment supprimer cette image ?')) {
                      onDelete(image.id);
                    }
                  }}
                  className="flex-1 p-3 rounded-lg border-2 border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors active:scale-95"
                  aria-label="Supprimer l'image"
                  type="button"
                >
                  <TrashIcon className="w-5 h-5 mx-auto" />
                </button>
              </div>
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
