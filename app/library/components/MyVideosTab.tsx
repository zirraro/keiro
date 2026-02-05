'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import UploadZone from './UploadZone';

type MyVideo = {
  id: string;
  video_url: string;
  thumbnail_url?: string;
  title?: string;
  duration?: number;
  source_type: string;
  is_favorite: boolean;
  created_at: string;
  published_to_tiktok: boolean;
  tiktok_published_at?: string;
  file_size?: number;
};

type MyVideosTabProps = {
  videos: MyVideo[];
  onRefresh: () => void;
  onDelete: (videoId: string) => void;
  onToggleFavorite: (videoId: string, isFavorite: boolean) => void;
  onPublishToTikTok: (video: MyVideo) => void;
  onTitleEdit: (videoId: string, newTitle: string) => void;
};

export default function MyVideosTab({
  videos,
  onRefresh,
  onDelete,
  onToggleFavorite,
  onPublishToTikTok,
  onTitleEdit
}: MyVideosTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'duration'>('date');
  const [filterBy, setFilterBy] = useState<'all' | 'favorites' | 'tiktok'>('all');

  // Filter and sort videos
  const filteredVideos = videos
    .filter(video => {
      // Search filter
      const matchesSearch = !searchQuery ||
        video.title?.toLowerCase().includes(searchQuery.toLowerCase());

      // Category filter
      const matchesFilter =
        filterBy === 'all' ||
        (filterBy === 'favorites' && video.is_favorite) ||
        (filterBy === 'tiktok' && video.published_to_tiktok);

      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      } else if (sortBy === 'duration') {
        return (b.duration || 0) - (a.duration || 0);
      }
      return 0;
    });

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return mb > 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

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

    const response = await fetch('/api/upload-video', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    // Refresh videos list
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <UploadZone type="video" onUpload={handleUpload} />

      {/* Header avec recherche et filtres */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Recherche */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Rechercher une vidéo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Filtres */}
          <div className="flex gap-2">
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as any)}
              className="px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">Toutes ({videos.length})</option>
              <option value="favorites">Favorites ({videos.filter(v => v.is_favorite).length})</option>
              <option value="tiktok">Publiées TikTok ({videos.filter(v => v.published_to_tiktok).length})</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="date">Plus récentes</option>
              <option value="title">Titre A-Z</option>
              <option value="duration">Durée</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grille de vidéos */}
      {filteredVideos.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <div className="text-6xl mb-4">🎬</div>
          <h3 className="text-xl font-semibold text-neutral-900 mb-2">
            {searchQuery || filterBy !== 'all' ? 'Aucune vidéo trouvée' : 'Aucune vidéo pour le moment'}
          </h3>
          <p className="text-neutral-500 mb-6">
            {searchQuery || filterBy !== 'all'
              ? 'Essayez de modifier vos filtres de recherche'
              : 'Créez votre première vidéo avec Seedream I2V'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onDelete={onDelete}
              onToggleFavorite={onToggleFavorite}
              onPublishToTikTok={onPublishToTikTok}
              onTitleEdit={onTitleEdit}
              formatDuration={formatDuration}
              formatFileSize={formatFileSize}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type VideoCardProps = {
  video: MyVideo;
  onDelete: (videoId: string) => void;
  onToggleFavorite: (videoId: string, isFavorite: boolean) => void;
  onPublishToTikTok: (video: MyVideo) => void;
  onTitleEdit: (videoId: string, newTitle: string) => void;
  formatDuration: (seconds?: number) => string;
  formatFileSize: (bytes?: number) => string;
  formatDate: (dateString: string) => string;
};

function VideoCard({
  video,
  onDelete,
  onToggleFavorite,
  onPublishToTikTok,
  onTitleEdit,
  formatDuration,
  formatFileSize,
  formatDate
}: VideoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(video.title || '');

  const handleSaveTitle = () => {
    if (editedTitle.trim()) {
      onTitleEdit(video.id, editedTitle.trim());
    }
    setIsEditing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden group hover:shadow-lg transition-shadow">
      {/* Video preview */}
      <div className="relative aspect-video bg-neutral-900">
        <video
          src={video.video_url}
          poster={video.thumbnail_url}
          controls
          className="w-full h-full object-cover"
        />

        {/* Badges */}
        <div className="absolute top-2 left-2 flex gap-2">
          {video.is_favorite && (
            <span className="bg-pink-500 text-white text-xs px-2 py-1 rounded-full">
              ⭐ Favorite
            </span>
          )}
          {video.published_to_tiktok && (
            <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
              ✓ TikTok
            </span>
          )}
        </div>

        {/* Duration */}
        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {formatDuration(video.duration)}
          </div>
        )}

      </div>

      {/* Video info */}
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
              placeholder="Titre de la vidéo"
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
            className="font-medium text-neutral-900 truncate cursor-pointer hover:text-purple-600 transition-colors"
            title="Cliquer pour modifier le titre"
          >
            {video.title || 'Sans titre'}
          </h4>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>{formatDate(video.created_at)}</span>
          <span>{formatFileSize(video.file_size)}</span>
        </div>

        {/* Source badge */}
        <div className="flex items-center gap-2 text-xs">
          {video.source_type === 'seedream_i2v' && (
            <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">
              ✨ Généré par Keiro
            </span>
          )}
          {video.source_type === 'upload' && (
            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
              📤 Upload
            </span>
          )}
          {video.source_type === 'tiktok_sync' && (
            <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
              🎵 TikTok
            </span>
          )}
        </div>

        {/* Actions visibles */}
        <div className="pt-3 border-t border-neutral-200">
          <div className="grid grid-cols-2 gap-2">
            {/* Publier */}
            {!video.published_to_tiktok && (
              <button
                onClick={() => onPublishToTikTok(video)}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Poster
              </button>
            )}

            {/* Favoris */}
            <button
              onClick={() => onToggleFavorite(video.id, !video.is_favorite)}
              className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition-all shadow-sm ${
                video.is_favorite
                  ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <svg className="w-4 h-4" fill={video.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {video.is_favorite ? 'Favori' : 'Favoris'}
            </button>

            {/* Télécharger */}
            <a
              href={video.video_url}
              download
              className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-200 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Télécharger
            </a>

            {/* Supprimer */}
            <button
              onClick={() => {
                if (confirm('Êtes-vous sûr de vouloir supprimer cette vidéo ?')) {
                  onDelete(video.id);
                }
              }}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-red-100 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-200 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
