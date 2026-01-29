'use client';

import { useState, useMemo } from 'react';
import Masonry from 'react-masonry-css';
import FolderHeader from './FolderHeader';
import CreationCard, { CreationItem } from './CreationCard';

interface Folder {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

interface AllCreationsTabProps {
  images: any[];
  videos: any[];
  folders: Folder[];
  onRefresh: () => void;
  onToggleFavorite: (id: string, type: 'image' | 'video', isFavorite: boolean) => void;
  onTitleEdit: (id: string, type: 'image' | 'video', newTitle: string) => void;
  onDelete: (id: string, type: 'image' | 'video') => void;
  onPublish: (item: CreationItem, platform: 'instagram' | 'tiktok') => void;
  onDownload: (item: CreationItem) => void;
}

export default function AllCreationsTab({
  images,
  videos,
  folders,
  onRefresh,
  onToggleFavorite,
  onTitleEdit,
  onDelete,
  onPublish,
  onDownload
}: AllCreationsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'images' | 'videos'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'folder'>('folder');

  // Combine images and videos into CreationItem[]
  const allCreations: CreationItem[] = useMemo(() => {
    const imageItems: CreationItem[] = images.map(img => ({
      id: img.id,
      type: 'image' as const,
      url: img.image_url,
      thumbnailUrl: img.thumbnail_url,
      title: img.title,
      folderId: img.folder_id,
      is_favorite: img.is_favorite || false,
      created_at: img.created_at,
      published_to_instagram: img.published_to_instagram || false,
      published_to_tiktok: img.published_to_tiktok || false
    }));

    const videoItems: CreationItem[] = videos.map(vid => ({
      id: vid.id,
      type: 'video' as const,
      url: vid.video_url,
      thumbnailUrl: vid.thumbnail_url,
      title: vid.title,
      folderId: vid.folder_id,
      is_favorite: vid.is_favorite || false,
      created_at: vid.created_at,
      duration: vid.duration,
      published_to_tiktok: vid.published_to_tiktok || false
    }));

    return [...imageItems, ...videoItems];
  }, [images, videos]);

  // Filter creations
  const filteredCreations = useMemo(() => {
    let result = allCreations;

    // Filter by type
    if (filterType === 'images') {
      result = result.filter(c => c.type === 'image');
    } else if (filterType === 'videos') {
      result = result.filter(c => c.type === 'video');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.title?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [allCreations, filterType, searchQuery]);

  // Group by folder
  const groupedByFolder = useMemo(() => {
    const groups: Record<string, CreationItem[]> = {};

    filteredCreations.forEach(item => {
      const key = item.folderId || 'uncategorized';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });

    // Sort items within each folder
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        if (sortBy === 'title') {
          return (a.title || '').localeCompare(b.title || '');
        } else if (sortBy === 'date') {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return 0; // folder sort is already done by grouping
      });
    });

    return groups;
  }, [filteredCreations, sortBy]);

  // Get folder info
  const getFolderInfo = (folderId: string) => {
    if (folderId === 'uncategorized') {
      return {
        id: 'uncategorized',
        name: 'Sans dossier',
        icon: '📂',
        color: '#9CA3AF'
      };
    }

    const folder = folders.find(f => f.id === folderId);
    return folder || {
      id: folderId,
      name: 'Dossier inconnu',
      icon: '📁',
      color: '#3B82F6'
    };
  };

  // Masonry breakpoints - Augmented column count for smaller items
  const breakpointColumns = {
    default: 5,  // 5 columns on very large screens (was 4)
    1536: 4,     // 4 columns on large screens (was 3)
    1024: 3,     // 3 columns on medium screens (was 2)
    640: 2       // 2 columns on small screens (was 1)
  };

  const totalCount = filteredCreations.length;
  const imageCount = filteredCreations.filter(c => c.type === 'image').length;
  const videoCount = filteredCreations.filter(c => c.type === 'video').length;

  return (
    <div className="space-y-6">
      {/* Header Stats & Filters */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        {/* Search Bar */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Rechercher par titre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filters & Sort */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Type Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                filterType === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              Tout ({totalCount})
            </button>
            <button
              onClick={() => setFilterType('images')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                filterType === 'images'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              📸 Images ({imageCount})
            </button>
            <button
              onClick={() => setFilterType('videos')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                filterType === 'videos'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              🎬 Vidéos ({videoCount})
            </button>
          </div>

          {/* Separator */}
          <div className="h-6 w-px bg-neutral-300"></div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="folder">Trier par dossier</option>
            <option value="date">Trier par date</option>
            <option value="title">Trier par titre</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            className="ml-auto px-3 py-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualiser
          </button>
        </div>
      </div>

      {/* Masonry Grid Grouped by Folders */}
      {Object.entries(groupedByFolder).length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <p className="text-neutral-500">
            {searchQuery ? 'Aucun résultat trouvé' : 'Aucun contenu à afficher'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByFolder).map(([folderId, items]) => {
            const folder = getFolderInfo(folderId);

            return (
              <div key={folderId} className="bg-white rounded-xl border border-neutral-200 p-6">
                <FolderHeader
                  icon={folder.icon}
                  name={folder.name}
                  color={folder.color}
                  itemCount={items.length}
                />

                <Masonry
                  breakpointCols={breakpointColumns}
                  className="masonry-grid"
                  columnClassName="masonry-grid-column"
                >
                  {items.map(item => (
                    <div key={`${item.type}-${item.id}`} className="mb-4">
                      <CreationCard
                        item={item}
                        onToggleFavorite={(id, isFavorite) => onToggleFavorite(id, item.type, isFavorite)}
                        onTitleEdit={(id, newTitle) => onTitleEdit(id, item.type, newTitle)}
                        onDelete={(id) => onDelete(id, item.type)}
                        onPublish={onPublish}
                        onDownload={onDownload}
                      />
                    </div>
                  ))}
                </Masonry>
              </div>
            );
          })}
        </div>
      )}

      <style jsx global>{`
        .masonry-grid {
          display: flex;
          margin-left: -16px;
          width: auto;
        }
        .masonry-grid-column {
          padding-left: 16px;
          background-clip: padding-box;
        }
      `}</style>
    </div>
  );
}
