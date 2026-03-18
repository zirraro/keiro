'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import UploadZone from './UploadZone';
import { useLanguage } from '@/lib/i18n/context';

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
  ai_model?: string;
};

type MyVideosTabProps = {
  videos: MyVideo[];
  onRefresh: () => void;
  onDelete: (videoId: string) => void;
  onToggleFavorite: (videoId: string, isFavorite: boolean) => void;
  onPublishToTikTok: (video: MyVideo) => void;
  onTitleEdit: (videoId: string, newTitle: string) => void;
  onMoveToFolder?: (video: MyVideo) => void;
  onEdit?: (video: MyVideo) => void;
};

export default function MyVideosTab({
  videos,
  onRefresh,
  onDelete,
  onToggleFavorite,
  onPublishToTikTok,
  onTitleEdit,
  onMoveToFolder,
  onEdit
}: MyVideosTabProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'duration'>('date');
  const [filterBy, setFilterBy] = useState<'all' | 'favorites' | 'tiktok'>('all');

  const filteredVideos = videos
    .filter(video => {
      const matchesSearch = !searchQuery ||
        video.title?.toLowerCase().includes(searchQuery.toLowerCase());
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

    if (diffMins < 60) return t.library.mvtAgoMin.replace('{n}', String(diffMins));
    if (diffHours < 24) return t.library.mvtAgoHours.replace('{n}', String(diffHours));
    if (diffDays < 7) return t.library.mvtAgoDays.replace('{n}', String(diffDays));
    return date.toLocaleDateString();
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

    onRefresh();
  };

  return (
    <div className="space-y-4">
      <UploadZone type="video" onUpload={handleUpload} />

      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder={t.library.mvtSearchVideo}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as any)}
              className="px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">{t.library.mvtAllVideos} ({videos.length})</option>
              <option value="favorites">{t.library.mvtFavorites} ({videos.filter(v => v.is_favorite).length})</option>
              <option value="tiktok">{t.library.mvtPublishedTikTok} ({videos.filter(v => v.published_to_tiktok).length})</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="date">{t.library.mvtMostRecent}</option>
              <option value="title">{t.library.mvtTitleAZ}</option>
              <option value="duration">{t.library.mvtDuration}</option>
            </select>
          </div>
        </div>
      </div>

      {filteredVideos.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <div className="text-6xl mb-4">🎬</div>
          <h3 className="text-xl font-semibold text-neutral-900 mb-2">
            {searchQuery || filterBy !== 'all' ? t.library.mvtNoVideoFound : t.library.mvtNoVideoYet}
          </h3>
          <p className="text-neutral-500 mb-6">
            {searchQuery || filterBy !== 'all'
              ? t.library.mvtTryChangingFilters
              : t.library.mvtCreateFirstVideo}
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
              onMoveToFolder={onMoveToFolder}
              onEdit={onEdit}
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
  onMoveToFolder?: (video: MyVideo) => void;
  onEdit?: (video: MyVideo) => void;
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
  onMoveToFolder,
  onEdit,
  formatDuration,
  formatFileSize,
  formatDate
}: VideoCardProps) {
  const { t } = useLanguage();
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
      <div className="relative aspect-video bg-neutral-900 overflow-hidden">
        <video
          src={video.video_url}
          poster={video.thumbnail_url}
          controls
          className="w-full h-full object-cover"
        />

        <div className="absolute top-2 left-2 flex gap-2">
          {video.is_favorite && (
            <span className="bg-pink-500 text-white text-xs px-1.5 py-1 rounded-full flex items-center">
              <svg className="w-3.5 h-3.5" fill="currentColor" stroke="none" viewBox="0 0 24 24">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </span>
          )}
          {video.published_to_tiktok && (
            <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
              ✓ TikTok
            </span>
          )}
        </div>

        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {formatDuration(video.duration)}
          </div>
        )}
        {video.ai_model && (
          <div
            className={`absolute bottom-1.5 left-1.5 w-1.5 h-1.5 rounded-full opacity-40 ${
              video.ai_model === 'kling' ? 'bg-emerald-500' : 'bg-orange-500'
            }`}
            title={video.ai_model === 'kling' ? 'Kling' : 'Seedream'}
          />
        )}
      </div>

      <div className="p-4 space-y-2">
        {isEditing ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSaveTitle()}
              className="flex-1 px-2 py-1 border border-neutral-300 rounded text-sm"
              placeholder={t.library.mvtVideoTitlePlaceholder}
              autoFocus
            />
            <button onClick={handleSaveTitle} className="text-green-600 hover:text-green-700">✓</button>
            <button onClick={() => setIsEditing(false)} className="text-red-600 hover:text-red-700">✕</button>
          </div>
        ) : (
          <h4
            onClick={() => setIsEditing(true)}
            className="font-medium text-neutral-900 truncate cursor-pointer hover:text-purple-600 transition-colors"
            title={t.library.mvtClickToEditTitle}
          >
            {video.title || t.library.mvtUntitled}
          </h4>
        )}

        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>{formatDate(video.created_at)}</span>
          <span>{formatFileSize(video.file_size)}</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {video.source_type === 'seedream_i2v' && (
            <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">
              {t.library.mvtGeneratedByKeiro}
            </span>
          )}
          {video.source_type === 'upload' && (
            <span className="bg-[#0c1a3a]/10 text-[#0c1a3a] px-2 py-1 rounded">
              {t.library.mvtUpload}
            </span>
          )}
          {video.source_type === 'tiktok_sync' && (
            <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
              TikTok
            </span>
          )}
        </div>

        <div className="pt-3 border-t border-neutral-200">
          <div className="flex items-center gap-1.5">
            {!video.published_to_tiktok && (
              <button
                onClick={() => onPublishToTikTok(video)}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white text-xs font-semibold rounded-lg hover:from-[#1e3a5f] hover:to-[#2a4a6f] transition-all shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {t.library.mvtPost}
              </button>
            )}
            {onMoveToFolder && (
              <button
                onClick={() => onMoveToFolder(video)}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-lg hover:bg-purple-200 transition-all shadow-sm"
                title={t.library.mvtOrganizeInFolder}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                {t.library.mvtOrganize}
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(video)}
                className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 transition-all"
                title="Éditer la vidéo"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => onToggleFavorite(video.id, !video.is_favorite)}
              className={`p-1.5 rounded-lg transition-all ${
                video.is_favorite ? 'text-pink-600 hover:bg-pink-50' : 'text-neutral-400 hover:bg-neutral-100'
              }`}
              title={video.is_favorite ? t.library.mvtRemoveFromFav : t.library.mvtAddToFav}
            >
              <svg className="w-4 h-4" fill={video.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
            <a
              href={video.video_url}
              download
              className="p-1.5 rounded-lg text-[#0c1a3a] hover:bg-[#0c1a3a]/5 transition-all"
              title={t.library.mvtDownload}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
            <button
              onClick={() => {
                if (confirm(t.library.mvtConfirmDelete)) {
                  onDelete(video.id);
                }
              }}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-all"
              title={t.library.mvtDeleteTitle}
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
