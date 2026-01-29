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
  onOpenInstagram?: (image: SavedImage) => void;
  onPublishToInstagram?: (image: SavedImage) => void;
  onPublishToTikTok?: (image: SavedImage) => void;
  onSchedule?: (image: SavedImage) => void;
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
  onSchedule,
  onTitleEdit,
  onPublishToInstagram,
  onPublishToTikTok,
  formatDate
}: ImageCardProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(image.title || image.news_title || '');
  const [showMenu, setShowMenu] = useState(false);

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

        {/* Kebab Menu (3 dots) */}
        {(user || isGuest) && (
          <div className="absolute top-2 right-2 z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="bg-white/90 backdrop-blur-sm hover:bg-white p-2 rounded-full shadow-lg transition-all"
              aria-label="Menu d'actions"
            >
              <svg className="w-5 h-5 text-neutral-700" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 z-40">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(image.id, image.is_favorite);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors flex items-center gap-3"
                  >
                    <HeartIcon className="w-4 h-4 text-red-500" filled={image.is_favorite} />
                    {image.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingTitle(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors flex items-center gap-3"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Éditer le titre
                  </button>

                  {(onPublishToInstagram || onOpenInstagram) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onPublishToInstagram) {
                          onPublishToInstagram(image);
                        } else if (onOpenInstagram) {
                          onOpenInstagram(image);
                        }
                        setShowMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors flex items-center gap-3"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                      Publier sur Instagram
                    </button>
                  )}

                  {onPublishToTikTok && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPublishToTikTok(image);
                        setShowMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors flex items-center gap-3"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                      </svg>
                      Publier sur TikTok
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(image.image_url, image.title || image.news_title);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors flex items-center gap-3"
                  >
                    <DownloadIcon className="w-4 h-4 text-blue-600" />
                    Télécharger
                  </button>

                  <div className="border-t border-neutral-200 my-1"></div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Voulez-vous vraiment supprimer cette image ?')) {
                        onDelete(image.id);
                      }
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"
                  >
                    <TrashIcon className="w-4 h-4" />
                    Supprimer
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Badge favori */}
        {image.is_favorite && (
          <div className="absolute top-2 left-2 z-20">
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
                {(onOpenInstagram || onPublishToInstagram) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (onPublishToInstagram) {
                        onPublishToInstagram(image);
                      } else if (onOpenInstagram) {
                        onOpenInstagram(image);
                      }
                    }}
                    className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2 shadow-md active:scale-95"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>Post</span>
                  </button>
                )}
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
