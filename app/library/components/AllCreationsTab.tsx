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
  onPublish: (item: CreationItem) => void;
  onDownload: (item: CreationItem) => void;
  onMoveToFolder: (id: string, type: 'image' | 'video', folderId: string | null) => Promise<void>;
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
  onDownload,
  onMoveToFolder
}: AllCreationsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'images' | 'videos'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'folder'>('folder');
  const [viewMode, setViewMode] = useState<'grid' | 'masonry' | 'list'>('grid'); // Default: grid
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['uncategorized'])); // "Sans dossier" ouvert par défaut

  // État pour le modal de création de dossier
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('📁');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // État pour le modal de déplacement vers dossier
  const [showMoveFolderModal, setShowMoveFolderModal] = useState(false);
  const [itemToMove, setItemToMove] = useState<CreationItem | null>(null);
  const [movingToFolder, setMovingToFolder] = useState(false);

  // Toggle folder expansion
  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

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

  // Group by folder - Include ALL folders even if empty
  const groupedByFolder = useMemo(() => {
    const groups: Record<string, CreationItem[]> = {};

    // Initialize all existing folders with empty arrays
    folders.forEach(folder => {
      groups[folder.id] = [];
    });

    // Add uncategorized group
    groups['uncategorized'] = [];

    // Distribute items into folders
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
  }, [filteredCreations, sortBy, folders]);

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

  // Créer un nouveau dossier
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      alert('Veuillez entrer un nom de dossier');
      return;
    }

    setCreatingFolder(true);
    try {
      const response = await fetch('/api/library/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newFolderName.trim(),
          icon: newFolderIcon,
          color: newFolderColor
        })
      });

      const data = await response.json();

      if (data.ok) {
        // Rafraîchir la liste des créations pour inclure le nouveau dossier
        await onRefresh();

        // Réinitialiser le formulaire et fermer le modal
        setNewFolderName('');
        setNewFolderIcon('📁');
        setNewFolderColor('#3B82F6');
        setShowCreateFolderModal(false);
      } else {
        alert(data.error || 'Erreur lors de la création du dossier');
      }
    } catch (error: any) {
      console.error('[AllCreationsTab] Error creating folder:', error);
      alert('Erreur lors de la création du dossier');
    } finally {
      setCreatingFolder(false);
    }
  };

  // Icônes prédéfinies pour les dossiers
  const folderIcons = ['📁', '📂', '🗂️', '📚', '🎨', '🎬', '📸', '💼', '🎯', '⭐', '🔥', '✨'];

  // Couleurs prédéfinies pour les dossiers
  const folderColors = [
    { name: 'Bleu', value: '#3B82F6' },
    { name: 'Vert', value: '#10B981' },
    { name: 'Rouge', value: '#EF4444' },
    { name: 'Jaune', value: '#F59E0B' },
    { name: 'Violet', value: '#8B5CF6' },
    { name: 'Rose', value: '#EC4899' },
    { name: 'Cyan', value: '#06B6D4' },
    { name: 'Gris', value: '#6B7280' }
  ];

  // Déplacer un item vers un dossier
  const handleMoveToFolder = async (folderId: string | null) => {
    if (!itemToMove) return;

    setMovingToFolder(true);
    try {
      await onMoveToFolder(itemToMove.id, itemToMove.type, folderId);
      setShowMoveFolderModal(false);
      setItemToMove(null);
    } catch (error: any) {
      console.error('[AllCreationsTab] Error moving item:', error);
      alert('Erreur lors du déplacement');
    } finally {
      setMovingToFolder(false);
    }
  };

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

          {/* View Mode Selector */}
          <div className="flex gap-1 border border-neutral-300 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
              title="Vue en grille"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('masonry')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'masonry'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
              title="Vue en mosaïque"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
              title="Vue en liste"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Create Folder Button */}
          <button
            onClick={() => setShowCreateFolderModal(true)}
            className="ml-auto px-3 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 rounded-lg transition-all flex items-center gap-2 font-semibold shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau dossier
          </button>
        </div>
      </div>

      {/* Modal de création de dossier */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-neutral-900">Créer un nouveau dossier</h3>
              <button
                onClick={() => {
                  setShowCreateFolderModal(false);
                  setNewFolderName('');
                  setNewFolderIcon('📁');
                  setNewFolderColor('#3B82F6');
                }}
                className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
                aria-label="Fermer"
              >
                <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Nom du dossier */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Nom du dossier
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Ex: Mes projets"
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* Icône */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Icône
                </label>
                <div className="flex flex-wrap gap-2">
                  {folderIcons.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setNewFolderIcon(icon)}
                      className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl transition-all ${
                        newFolderIcon === icon
                          ? 'bg-blue-100 ring-2 ring-blue-500 scale-110'
                          : 'bg-neutral-100 hover:bg-neutral-200'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Couleur */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Couleur
                </label>
                <div className="flex flex-wrap gap-2">
                  {folderColors.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setNewFolderColor(color.value)}
                      className={`w-10 h-10 rounded-lg transition-all ${
                        newFolderColor === color.value
                          ? 'ring-2 ring-offset-2 ring-neutral-900 scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Aperçu */}
              <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                <p className="text-xs text-neutral-500 mb-2">Aperçu:</p>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{newFolderIcon}</span>
                  <div>
                    <p className="font-semibold text-neutral-900" style={{ color: newFolderColor }}>
                      {newFolderName || 'Nom du dossier'}
                    </p>
                    <p className="text-xs text-neutral-500">0 éléments</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateFolderModal(false);
                  setNewFolderName('');
                  setNewFolderIcon('📁');
                  setNewFolderColor('#3B82F6');
                }}
                className="flex-1 px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
                disabled={creatingFolder}
              >
                Annuler
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={creatingFolder || !newFolderName.trim()}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingFolder ? 'Création...' : 'Créer le dossier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de déplacement vers dossier */}
      {showMoveFolderModal && itemToMove && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-neutral-900">Ranger dans un dossier</h3>
              <button
                onClick={() => {
                  setShowMoveFolderModal(false);
                  setItemToMove(null);
                }}
                className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
                aria-label="Fermer"
              >
                <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-neutral-600 mb-4">
                Sélectionnez un dossier pour ranger <span className="font-semibold">{itemToMove.title || 'cet élément'}</span>
              </p>

              {/* Current folder indicator */}
              {itemToMove.folderId && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-600 font-medium mb-1">Dossier actuel:</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getFolderInfo(itemToMove.folderId).icon}</span>
                    <span className="text-sm font-semibold" style={{ color: getFolderInfo(itemToMove.folderId).color }}>
                      {getFolderInfo(itemToMove.folderId).name}
                    </span>
                  </div>
                </div>
              )}

              {/* Folder list */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {/* Option: Sans dossier */}
                <button
                  onClick={() => handleMoveToFolder(null)}
                  disabled={movingToFolder}
                  className={`w-full p-3 rounded-lg text-left transition-all ${
                    !itemToMove.folderId
                      ? 'bg-neutral-100 border-2 border-neutral-400'
                      : 'bg-neutral-50 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📂</span>
                    <div className="flex-1">
                      <p className="font-semibold text-neutral-900">Sans dossier</p>
                      <p className="text-xs text-neutral-500">
                        {groupedByFolder['uncategorized']?.length || 0} éléments
                      </p>
                    </div>
                    {!itemToMove.folderId && (
                      <svg className="w-5 h-5 text-neutral-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>

                {/* All folders */}
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => handleMoveToFolder(folder.id)}
                    disabled={movingToFolder}
                    className={`w-full p-3 rounded-lg text-left transition-all ${
                      itemToMove.folderId === folder.id
                        ? 'bg-blue-50 border-2 border-blue-400'
                        : 'bg-white hover:bg-neutral-50 border border-neutral-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{folder.icon}</span>
                      <div className="flex-1">
                        <p className="font-semibold" style={{ color: folder.color }}>
                          {folder.name}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {groupedByFolder[folder.id]?.length || 0} éléments
                        </p>
                      </div>
                      {itemToMove.folderId === folder.id && (
                        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowMoveFolderModal(false);
                  setItemToMove(null);
                }}
                className="flex-1 px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
                disabled={movingToFolder}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content Display Grouped by Folders */}
      {Object.entries(groupedByFolder).length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <p className="text-neutral-500">
            {searchQuery ? 'Aucun résultat trouvé' : 'Aucun contenu à afficher'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Trier pour mettre "Sans dossier" en premier */}
          {[...Object.entries(groupedByFolder)].sort(([aId], [bId]) => {
            if (aId === 'uncategorized') return -1;
            if (bId === 'uncategorized') return 1;
            return 0;
          }).map(([folderId, items]) => {
            const folder = getFolderInfo(folderId);
            const isExpanded = expandedFolders.has(folderId);

            return (
              <div key={folderId} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                {/* Folder Header - Clickable */}
                <button
                  onClick={() => toggleFolder(folderId)}
                  className="w-full p-4 flex items-center gap-3 hover:bg-neutral-50 transition-colors text-left"
                >
                  <span className="text-3xl">{folder.icon}</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg" style={{ color: folder.color }}>
                      {folder.name}
                    </h3>
                    <p className="text-sm text-neutral-500">
                      {items.length} {items.length > 1 ? 'éléments' : 'élément'}
                    </p>
                  </div>
                  {/* Chevron expand/collapse */}
                  <svg
                    className={`w-6 h-6 text-neutral-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Folder Content - Only show if expanded */}
                {isExpanded && items.length > 0 && (
                  <div className="p-6 pt-0">
                    {/* Grid View - Uniform squares */}
                    {viewMode === 'grid' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {items.map(item => (
                      <div key={`${item.type}-${item.id}`}>
                        <CreationCard
                          item={item}
                          onToggleFavorite={(id, isFavorite) => onToggleFavorite(id, item.type, isFavorite)}
                          onTitleEdit={(id, newTitle) => onTitleEdit(id, item.type, newTitle)}
                          onDelete={(id) => onDelete(id, item.type)}
                          onPublish={onPublish}
                          onDownload={onDownload}
                          onMoveToFolder={(item) => {
                            setItemToMove(item);
                            setShowMoveFolderModal(true);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Masonry View - Pinterest-style */}
                {viewMode === 'masonry' && (
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
                          onMoveToFolder={(item) => {
                            setItemToMove(item);
                            setShowMoveFolderModal(true);
                          }}
                        />
                      </div>
                    ))}
                  </Masonry>
                )}

                {/* List View - Rows with more details */}
                {viewMode === 'list' && (
                  <div className="space-y-2">
                    {items.map(item => (
                      <div key={`${item.type}-${item.id}`} className="flex items-center gap-4 p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors">
                        {/* Thumbnail */}
                        <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                          {item.type === 'image' ? (
                            <img src={item.url} alt={item.title || 'Image'} className="w-full h-full object-cover" />
                          ) : (
                            <video src={item.url} className="w-full h-full object-cover" />
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-neutral-900 truncate">{item.title || 'Sans titre'}</h4>
                          <p className="text-sm text-neutral-500">
                            {item.type === 'image' ? '📸 Image' : '🎬 Vidéo'} • {new Date(item.created_at).toLocaleDateString('fr-FR')}
                          </p>
                          {item.is_favorite && <span className="text-xs text-pink-600">⭐ Favori</span>}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => onToggleFavorite(item.id, item.type, !item.is_favorite)}
                            className="p-2 rounded-lg hover:bg-white transition-colors"
                            title={item.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                          >
                            <svg className={`w-5 h-5 ${item.is_favorite ? 'text-pink-600' : 'text-neutral-400'}`} fill={item.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => onDownload(item)}
                            className="p-2 rounded-lg hover:bg-white transition-colors"
                            title="Télécharger"
                          >
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              setItemToMove(item);
                              setShowMoveFolderModal(true);
                            }}
                            className="p-2 rounded-lg hover:bg-white transition-colors"
                            title="Ranger"
                          >
                            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => onDelete(item.id, item.type)}
                            className="p-2 rounded-lg hover:bg-white transition-colors"
                            title="Supprimer"
                          >
                            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                  </div>
                )}
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
