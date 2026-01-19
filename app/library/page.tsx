'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import VisitorBanner from './components/VisitorBanner';
import GalleryHeader from './components/GalleryHeader';
import FilterBar from './components/FilterBar';
import ImageGrid from './components/ImageGrid';
import InstagramModal from './components/InstagramModal';
import TabNavigation, { Tab } from './components/TabNavigation';
import InstagramDraftsTab from './components/InstagramDraftsTab';
import CreateFolderModal from './components/CreateFolderModal';
import DragProvider from './components/DragProvider';
import FolderList from './components/FolderList';
import InstagramPreviewCard from './components/InstagramPreviewCard';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSkeleton from './components/LoadingSkeleton';

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

type Folder = {
  id: string;
  name: string;
  icon: string;
  color: string;
  image_count?: number;
};

type InstagramDraft = {
  id: string;
  saved_image_id: string;
  image_url: string;
  caption: string;
  hashtags: string[];
  status: 'draft' | 'ready' | 'published';
  created_at: string;
  scheduled_for?: string;
};

// Données de démonstration pour le mode visiteur
const DEMO_IMAGES: SavedImage[] = [
  {
    id: 'demo-1',
    image_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=800&fit=crop',
    title: 'Stratégie Marketing Digital',
    news_title: 'Nouvelles tendances IA en 2026',
    news_category: 'Tech',
    text_overlay: 'Boostez votre visibilité 🚀',
    is_favorite: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'demo-2',
    image_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=800&fit=crop',
    title: 'Croissance Business',
    news_title: 'L\'économie française en expansion',
    news_category: 'Business',
    text_overlay: 'Développez votre entreprise 📈',
    is_favorite: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'demo-3',
    image_url: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&h=800&fit=crop',
    title: 'Innovation Technologique',
    news_title: 'IA et transformation digitale',
    news_category: 'Tech',
    text_overlay: 'L\'avenir commence maintenant ✨',
    is_favorite: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'demo-4',
    image_url: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=800&h=800&fit=crop',
    title: 'Leadership & Management',
    news_title: 'Nouvelles méthodes de management',
    news_category: 'Business',
    text_overlay: 'Inspirez vos équipes 💼',
    is_favorite: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'demo-5',
    image_url: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&h=800&fit=crop',
    title: 'Communication Moderne',
    news_title: 'Social media en 2026',
    news_category: 'Culture',
    text_overlay: 'Connectez avec votre audience 📱',
    is_favorite: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'demo-6',
    image_url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&h=800&fit=crop',
    title: 'Collaboration & Teamwork',
    news_title: 'Le travail hybride s\'impose',
    news_category: 'Business',
    text_overlay: 'Travaillez ensemble 🤝',
    is_favorite: true,
    created_at: new Date().toISOString()
  }
];

export default function LibraryPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingImages, setLoadingImages] = useState(false);
  const [images, setImages] = useState<SavedImage[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [stats, setStats] = useState({
    total_images: 0,
    total_folders: 0,
    total_favorites: 0,
    total_instagram_drafts: 0
  });

  // États pour le workspace Instagram
  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [selectedImageForInsta, setSelectedImageForInsta] = useState<SavedImage | null>(null);

  // États pour les onglets
  const [activeTab, setActiveTab] = useState<Tab>('images');
  const [instagramDrafts, setInstagramDrafts] = useState<InstagramDraft[]>([]);

  // États pour les dossiers
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);

  // Charger l'utilisateur
  useEffect(() => {
    const loadUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) console.error('[Library] Error loading user:', error);
      setUser(user);
      setLoading(false);

      // Si pas d'utilisateur, charger les données de démo
      if (!user) {
        setImages(DEMO_IMAGES);
        setStats({
          total_images: DEMO_IMAGES.length,
          total_folders: 0,
          total_favorites: DEMO_IMAGES.filter(img => img.is_favorite).length,
          total_instagram_drafts: 0
        });
      }
    };
    loadUser();
  }, [supabase]);

  // Fonction pour charger les brouillons Instagram
  const loadInstagramDrafts = async () => {
    try {
      const res = await fetch('/api/library/instagram');
      const data = await res.json();
      if (data.ok) {
        setInstagramDrafts(data.posts || []);
        setStats(prev => ({ ...prev, total_instagram_drafts: data.posts?.length || 0 }));
      }
    } catch (error) {
      console.error('[Library] Error loading Instagram drafts:', error);
    }
  };

  // Charger les images et dossiers
  useEffect(() => {
    if (!user) return;

    const loadLibrary = async () => {
      try {
        // Charger les dossiers
        const foldersRes = await fetch('/api/library/folders');
        const foldersData = await foldersRes.json();
        if (foldersData.ok) {
          setFolders(foldersData.folders);
          setStats(prev => ({ ...prev, total_folders: foldersData.folders.length }));
        }

        // Charger les images
        await loadImages();

        // Charger les brouillons Instagram
        await loadInstagramDrafts();
      } catch (error) {
        console.error('[Library] Error loading library:', error);
      }
    };

    loadLibrary();
  }, [user]);

  // Fonction pour charger les images
  const loadImages = useCallback(async () => {
    try {
      setLoadingImages(true);
      const params = new URLSearchParams();
      if (selectedFolder) params.append('folderId', selectedFolder);
      if (searchQuery) params.append('search', searchQuery);
      if (showFavoritesOnly) params.append('favoritesOnly', 'true');

      const res = await fetch(`/api/library/images?${params}`, {
        credentials: 'include'
      });

      const data = await res.json();

      if (data.ok) {
        setImages(data.images);
        setStats(prev => ({
          ...prev,
          total_images: data.total,
          total_favorites: data.images.filter((img: SavedImage) => img.is_favorite).length
        }));
      } else {
        console.error('[Library] API error:', data.error);
      }
    } catch (error) {
      console.error('[Library] Error loading images:', error);
    } finally {
      setLoadingImages(false);
    }
  }, [selectedFolder, searchQuery, showFavoritesOnly]);

  // Recharger quand les filtres changent
  useEffect(() => {
    if (user) {
      loadImages();
    }
  }, [loadImages, user]);

  // Memoize filtered images for performance
  const filteredImages = useMemo(() => {
    return images.filter(img => {
      if (selectedFolder && img.folder_id !== selectedFolder) return false;
      if (showFavoritesOnly && !img.is_favorite) return false;
      if (searchQuery && !img.title?.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !img.news_title?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [images, selectedFolder, showFavoritesOnly, searchQuery]);

  // Toggle favori
  const toggleFavorite = async (imageId: string, currentState: boolean) => {
    try {
      const res = await fetch('/api/library/images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: imageId, isFavorite: !currentState })
      });

      if (res.ok) {
        await loadImages();
      }
    } catch (error) {
      console.error('[Library] Error toggling favorite:', error);
    }
  };

  // Supprimer une image
  const deleteImage = async (imageId: string) => {
    if (!confirm('Supprimer cette image de votre galerie ?')) return;

    try {
      const res = await fetch(`/api/library/images?id=${imageId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        await loadImages();
      }
    } catch (error) {
      console.error('[Library] Error deleting image:', error);
    }
  };

  // Ouvrir le modal Instagram pour une image
  const openInstagramModal = (image: SavedImage) => {
    setSelectedImageForInsta(image);
    setShowInstagramModal(true);
  };

  // Sauvegarder le brouillon Instagram
  const saveInstagramDraft = async (caption: string, hashtags: string[], status: 'draft' | 'ready') => {
    if (!selectedImageForInsta) return;

    try {
      const response = await fetch('/api/library/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedImageId: selectedImageForInsta.id,
          caption,
          hashtags,
          status
        })
      });

      const data = await response.json();

      if (data.ok) {
        const message = status === 'ready'
          ? '✅ Post marqué comme prêt à publier !'
          : '✅ Brouillon Instagram sauvegardé !';
        alert(message);
        setShowInstagramModal(false);
        // Recharger les brouillons
        await loadInstagramDrafts();
      } else {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error: any) {
      console.error('[Library] Error saving Instagram draft:', error);
      alert(error.message || 'Erreur lors de la sauvegarde du brouillon');
    }
  };

  // Modifier un brouillon Instagram
  const editInstagramDraft = (draft: InstagramDraft) => {
    // Pour l'instant, ouvrir le modal avec l'image correspondante
    // TODO: Préremplir le modal avec les données du brouillon
    const image: SavedImage = {
      id: draft.saved_image_id,
      image_url: draft.image_url,
      is_favorite: false,
      created_at: draft.created_at
    };
    setSelectedImageForInsta(image);
    setShowInstagramModal(true);
  };

  // Supprimer un brouillon Instagram
  const deleteInstagramDraft = async (draftId: string) => {
    if (!confirm('Supprimer ce brouillon Instagram ?')) return;

    try {
      const res = await fetch(`/api/library/instagram?id=${draftId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        await loadInstagramDrafts();
      }
    } catch (error) {
      console.error('[Library] Error deleting Instagram draft:', error);
    }
  };

  // Créer un dossier
  const createFolder = async (name: string, icon: string, color: string) => {
    try {
      const res = await fetch('/api/library/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon, color })
      });

      const data = await res.json();

      if (data.ok) {
        // Recharger les dossiers
        const foldersRes = await fetch('/api/library/folders');
        const foldersData = await foldersRes.json();
        if (foldersData.ok) {
          setFolders(foldersData.folders);
          setStats(prev => ({ ...prev, total_folders: foldersData.folders.length }));
        }
      } else {
        throw new Error(data.error || 'Erreur lors de la création du dossier');
      }
    } catch (error: any) {
      console.error('[Library] Error creating folder:', error);
      throw error;
    }
  };

  // Modifier le titre d'une image
  const handleTitleEdit = async (imageId: string, newTitle: string) => {
    try {
      const res = await fetch('/api/library/images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: imageId, title: newTitle })
      });

      if (res.ok) {
        // Mettre à jour localement sans recharger toutes les images
        setImages(prev => prev.map(img =>
          img.id === imageId ? { ...img, title: newTitle } : img
        ));
      }
    } catch (error) {
      console.error('[Library] Error updating title:', error);
    }
  };

  // Déplacer une image vers un dossier (drag & drop)
  const handleImageDrop = async (imageId: string, folderId: string | null) => {
    try {
      const res = await fetch('/api/library/images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: imageId, folderId })
      });

      if (res.ok) {
        // Recharger les images pour refléter le changement de dossier
        await loadImages();

        // Recharger les dossiers pour mettre à jour les compteurs
        const foldersRes = await fetch('/api/library/folders');
        const foldersData = await foldersRes.json();
        if (foldersData.ok) {
          setFolders(foldersData.folders);
        }
      } else {
        alert('Erreur lors du déplacement de l\'image');
      }
    } catch (error) {
      console.error('[Library] Error moving image:', error);
      alert('Erreur lors du déplacement de l\'image');
    }
  };

  // Télécharger une image
  const downloadImage = async (imageUrl: string, title?: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = title || `keiro-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('[Library] Error downloading image:', error);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-neutral-600">Chargement de votre galerie...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Bandeau Mode Visiteur */}
        {!user && <VisitorBanner />}

        {/* Header */}
        <GalleryHeader user={user} stats={stats} />

        {/* Filtres et recherche - Afficher seulement pour l'onglet images */}
        {user && activeTab === 'images' && (
          <FilterBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedFolder={selectedFolder}
            setSelectedFolder={setSelectedFolder}
            folders={folders}
            showFavoritesOnly={showFavoritesOnly}
            setShowFavoritesOnly={setShowFavoritesOnly}
            favoritesCount={stats.total_favorites}
            onCreateFolder={() => setShowCreateFolderModal(true)}
          />
        )}

        {/* Carte compacte Instagram */}
        <InstagramPreviewCard
          user={user}
          draftCount={stats.total_instagram_drafts}
          onOpenModal={() => {
            // Ouvrir le modal sans image sélectionnée
            // L'utilisateur devra sélectionner une image depuis la galerie
            if (images.length > 0) {
              setSelectedImageForInsta(images[0]);
              setShowInstagramModal(true);
            } else {
              alert('Veuillez d\'abord générer au moins une image');
            }
          }}
        />

        {/* Navigation par onglets - Visible pour tous */}
        <TabNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          imageCount={stats.total_images}
          draftCount={stats.total_instagram_drafts}
        />

        {/* Contenu principal avec sidebar (drag & drop enabled) */}
        {user ? (
          <DragProvider onDragEnd={handleImageDrop}>
            <div className="flex gap-6">
              {/* Sidebar gauche avec dossiers - Desktop uniquement */}
              {activeTab === 'images' && (
                <div className="hidden lg:block w-64 flex-shrink-0">
                  <div className="sticky top-6">
                    <div className="bg-white rounded-xl border border-neutral-200 p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-neutral-900">Dossiers</h3>
                        <button
                          onClick={() => setShowCreateFolderModal(true)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                          title="Nouveau dossier"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                      <FolderList
                        folders={folders}
                        selectedFolder={selectedFolder}
                        onSelectFolder={setSelectedFolder}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Contenu principal */}
              <div className="flex-1 min-w-0">
                <ErrorBoundary>
                  {activeTab === 'images' ? (
                    loadingImages ? (
                      <LoadingSkeleton />
                    ) : (
                      <ImageGrid
                        images={images}
                        user={user}
                        searchQuery={searchQuery}
                        selectedFolder={selectedFolder}
                        showFavoritesOnly={showFavoritesOnly}
                        onToggleFavorite={toggleFavorite}
                        onDownload={downloadImage}
                        onDelete={deleteImage}
                        onOpenInstagram={openInstagramModal}
                        onTitleEdit={handleTitleEdit}
                      />
                    )
                  ) : (
                    <InstagramDraftsTab
                      drafts={instagramDrafts}
                      onEdit={editInstagramDraft}
                      onDelete={deleteInstagramDraft}
                    />
                  )}
                </ErrorBoundary>
              </div>
            </div>
          </DragProvider>
        ) : (
          /* Mode visiteur - pas de drag & drop */
          <ErrorBoundary>
            {activeTab === 'images' ? (
              loadingImages ? (
                <LoadingSkeleton />
              ) : (
                <ImageGrid
                  images={images}
                  user={user}
                  searchQuery={searchQuery}
                  selectedFolder={selectedFolder}
                  showFavoritesOnly={showFavoritesOnly}
                  onToggleFavorite={toggleFavorite}
                  onDownload={downloadImage}
                  onDelete={deleteImage}
                  onOpenInstagram={openInstagramModal}
                  onTitleEdit={handleTitleEdit}
                />
              )
            ) : (
              <InstagramDraftsTab
                drafts={[]}
                onEdit={editInstagramDraft}
                onDelete={deleteInstagramDraft}
              />
            )}
          </ErrorBoundary>
        )}

        {/* Stats footer */}
        <div className="mt-8 pt-6 border-t border-neutral-200 flex justify-between text-sm text-neutral-500">
          <span>Total: {stats.total_images} visuels</span>
          <span>{stats.total_folders} dossiers • {stats.total_favorites} favoris</span>
        </div>
      </div>

      {/* Modal Instagram */}
      {showInstagramModal && selectedImageForInsta && (
        <InstagramModal
          image={selectedImageForInsta}
          onClose={() => setShowInstagramModal(false)}
          onSave={saveInstagramDraft}
        />
      )}

      {/* Modal Création de Dossier */}
      {showCreateFolderModal && (
        <CreateFolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onSave={createFolder}
        />
      )}
    </main>
  );
}
