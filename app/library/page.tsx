'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import VisitorBanner from './components/VisitorBanner';
import GalleryHeader from './components/GalleryHeader';
import FilterBar from './components/FilterBar';
import ImageGrid from './components/ImageGrid';
import InstagramModal from './components/InstagramModal';
import ScheduleModal from './components/ScheduleModal';
import TabNavigation, { Tab } from './components/TabNavigation';
import InstagramDraftsTab from './components/InstagramDraftsTab';
import TikTokDraftsTab from './components/TikTokDraftsTab';
import CalendarTab from './components/CalendarTab';
import CreateFolderModal from './components/CreateFolderModal';
import DragProvider from './components/DragProvider';
import FolderList from './components/FolderList';
import InstagramPreviewCard from './components/InstagramPreviewCard';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSkeleton from './components/LoadingSkeleton';
import EmailGateModal from './components/EmailGateModal';
import DropZone from './components/DropZone';
import InstagramMetaInfo from './components/InstagramMetaInfo';
import InstagramConnectionModal from './components/InstagramConnectionModal';
import InstagramWidget from './components/InstagramWidget';
import TikTokWidget from './components/TikTokWidget';
import TikTokConnectionModal from './components/TikTokConnectionModal';
import TikTokModal from './components/TikTokModal';
import PlatformChoiceModal from './components/PlatformChoiceModal';

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

type TikTokDraft = {
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
    total_instagram_drafts: 0,
    total_tiktok_drafts: 0
  });

  // États pour les connexions sociales
  const [isInstagramConnected, setIsInstagramConnected] = useState(false);
  const [isTikTokConnected, setIsTikTokConnected] = useState(false);

  // États pour le workspace Instagram
  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [selectedImageForInsta, setSelectedImageForInsta] = useState<SavedImage | null>(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  // États pour TikTok
  const [showTikTokConnectionModal, setShowTikTokConnectionModal] = useState(false);
  const [showTikTokModal, setShowTikTokModal] = useState(false);

  // États pour le choix de plateforme (galerie)
  const [showPlatformChoiceModal, setShowPlatformChoiceModal] = useState(false);
  const [selectedImageForPlatform, setSelectedImageForPlatform] = useState<SavedImage | null>(null);

  // États pour la planification
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedImageForSchedule, setSelectedImageForSchedule] = useState<SavedImage | null>(null);

  // États pour les onglets
  const [activeTab, setActiveTab] = useState<Tab>('images');
  const [instagramDrafts, setInstagramDrafts] = useState<InstagramDraft[]>([]);
  const [tiktokDrafts, setTikTokDrafts] = useState<TikTokDraft[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);

  // États pour les dossiers
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);

  // États pour le Guest Mode
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [guestEmail, setGuestEmail] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  // État pour le drag & drop
  const [isDragging, setIsDragging] = useState(false);

  // Charger l'utilisateur
  useEffect(() => {
    const loadUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) console.error('[Library] Error loading user:', error);
      setUser(user);
      setLoading(false);

      // Si pas d'utilisateur, vérifier le mode guest
      if (!user) {
        const storedEmail = localStorage.getItem('keiro_guest_email');
        if (storedEmail) {
          setGuestEmail(storedEmail);
          setIsGuest(true);
          console.log('[Library] Guest mode activated:', storedEmail);

          // Charger les images guest depuis localStorage
          const guestImages = localStorage.getItem('keiro_guest_images');
          if (guestImages) {
            try {
              const parsedImages = JSON.parse(guestImages);
              setImages(parsedImages);
              setStats({
                total_images: parsedImages.length,
                total_folders: 0,
                total_favorites: parsedImages.filter((img: SavedImage) => img.is_favorite).length,
                total_instagram_drafts: 0,
                total_tiktok_drafts: 0
              });
            } catch (err) {
              console.error('[Library] Error parsing guest images:', err);
              setImages([]); // Guest avec erreur : tableau vide
            }
          } else {
            // Première visite guest, démarrer avec galerie vide
            setImages([]);
          }

          // Charger le brouillon Instagram guest
          const guestDraft = localStorage.getItem('keiro_guest_instagram_draft');
          if (guestDraft) {
            try {
              const parsedDraft = JSON.parse(guestDraft);
              setInstagramDrafts([parsedDraft]);
              setStats(prev => ({ ...prev, total_instagram_drafts: 1 }));
            } catch (err) {
              console.error('[Library] Error parsing guest draft:', err);
            }
          }
        } else {
          // Visiteur sans email, charger les données de démo
          setImages(DEMO_IMAGES);
          setStats({
            total_images: DEMO_IMAGES.length,
            total_folders: 0,
            total_favorites: DEMO_IMAGES.filter(img => img.is_favorite).length,
            total_instagram_drafts: 0,
            total_tiktok_drafts: 0
          });
        }
      }
    };
    loadUser();
  }, [supabase]);

  // Vérifier les connexions Instagram et TikTok
  useEffect(() => {
    const checkConnections = async () => {
      if (!user) {
        setIsInstagramConnected(false);
        setIsTikTokConnected(false);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('instagram_user_id, tiktok_user_id')
          .eq('id', user.id)
          .single();

        setIsInstagramConnected(!!profile?.instagram_user_id);
        setIsTikTokConnected(!!profile?.tiktok_user_id);
      } catch (error) {
        console.error('[Library] Error checking connections:', error);
      }
    };

    checkConnections();
  }, [user, supabase]);

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

  // Fonction pour charger les brouillons TikTok
  const loadTikTokDrafts = async () => {
    try {
      const res = await fetch('/api/library/tiktok');
      const data = await res.json();
      if (data.ok) {
        setTikTokDrafts(data.posts || []);
        setStats(prev => ({ ...prev, total_tiktok_drafts: data.posts?.length || 0 }));
      }
    } catch (error) {
      console.error('[Library] Error loading TikTok drafts:', error);
    }
  };

  // Fonction pour charger les posts planifiés
  const loadScheduledPosts = async () => {
    try {
      const res = await fetch('/api/library/scheduled-posts');
      const data = await res.json();
      if (data.ok) {
        setScheduledPosts(data.posts || []);
      }
    } catch (error) {
      console.error('[Library] Error loading scheduled posts:', error);
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

        // Charger les brouillons TikTok
        await loadTikTokDrafts();

        // Charger les posts planifiés
        await loadScheduledPosts();
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

  // Ouvrir le modal de choix de plateforme (pour les images de la galerie)
  const openPlatformChoiceModal = (image: SavedImage) => {
    setSelectedImageForPlatform(image);
    setShowPlatformChoiceModal(true);
  };

  // Gérer le choix de plateforme
  const handleSelectInstagram = () => {
    if (selectedImageForPlatform) {
      setShowPlatformChoiceModal(false);
      openInstagramModal(selectedImageForPlatform);
      setSelectedImageForPlatform(null);
    }
  };

  const handleSelectTikTok = () => {
    if (selectedImageForPlatform) {
      setShowPlatformChoiceModal(false);
      setSelectedImageForInsta(selectedImageForPlatform);
      setShowTikTokModal(true);
      setSelectedImageForPlatform(null);
    }
  };

  // Sauvegarder le brouillon Instagram
  const saveInstagramDraft = async (image: SavedImage, caption: string, hashtags: string[], status: 'draft' | 'ready') => {
    if (!image) return;

    try {
      // MODE GUEST : Limiter à 1 brouillon et sauvegarder dans localStorage
      if (isGuest) {
        const existingDraft = localStorage.getItem('keiro_guest_instagram_draft');
        if (existingDraft && instagramDrafts.length > 0) {
          alert('⚠️ Limite atteinte !\n\nVous avez déjà créé votre brouillon Instagram gratuit.\n\nCréez un compte pour créer plus de brouillons et publier automatiquement ! 🚀');
          return;
        }

        // Créer le brouillon guest
        const guestDraft: InstagramDraft = {
          id: `guest-draft-${Date.now()}`,
          saved_image_id: image.id,
          image_url: image.image_url,
          caption,
          hashtags,
          status,
          created_at: new Date().toISOString()
        };

        // Sauvegarder dans localStorage
        localStorage.setItem('keiro_guest_instagram_draft', JSON.stringify(guestDraft));
        setInstagramDrafts([guestDraft]);
        setStats(prev => ({ ...prev, total_instagram_drafts: 1 }));

        alert('✅ Brouillon Instagram sauvegardé !\n\nCréez un compte pour le publier automatiquement sur Instagram ! 🎉');
        setShowInstagramModal(false);
        return;
      }

      // MODE USER : Appel API normal
      const response = await fetch('/api/library/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedImageId: image.id,
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

  // Sauvegarder le brouillon TikTok
  const saveTikTokDraft = async (image: SavedImage, caption: string, hashtags: string[], status: 'draft' | 'ready') => {
    if (!image) return;

    try {
      // MODE GUEST : Pas de support TikTok en mode guest pour l'instant
      if (isGuest) {
        alert('⚠️ TikTok n\'est pas disponible en mode gratuit.\n\nCréez un compte pour publier sur TikTok ! 🚀');
        return;
      }

      // MODE USER : Appel API
      const response = await fetch('/api/library/tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedImageId: image.id,
          caption,
          hashtags,
          status
        })
      });

      const data = await response.json();

      if (data.ok) {
        const message = status === 'ready'
          ? '✅ Vidéo TikTok prête à publier !'
          : '✅ Brouillon TikTok sauvegardé !';
        alert(message);
        setShowTikTokModal(false);
        // Recharger les brouillons TikTok
        await loadTikTokDrafts();
      } else {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error: any) {
      console.error('[Library] Error saving TikTok draft:', error);
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

  // Ajouter Instagram draft au planning
  const scheduleInstagramDraft = (draft: InstagramDraft) => {
    const image: SavedImage = {
      id: draft.saved_image_id,
      image_url: draft.image_url,
      is_favorite: false,
      created_at: draft.created_at
    };
    openScheduleModal(image);
  };

  // Modifier un brouillon TikTok
  const editTikTokDraft = (draft: TikTokDraft) => {
    // Pour l'instant, ouvrir le modal TikTok avec l'image correspondante
    // TODO: Préremplir le modal avec les données du brouillon
    const image: SavedImage = {
      id: draft.saved_image_id,
      image_url: draft.image_url,
      is_favorite: false,
      created_at: draft.created_at
    };
    // Ouvrir le modal TikTok (à implémenter plus tard avec pre-fill)
    setShowTikTokModal(true);
  };

  // Supprimer un brouillon TikTok
  const deleteTikTokDraft = async (draftId: string) => {
    if (!confirm('Supprimer ce brouillon TikTok ?')) return;

    try {
      const res = await fetch(`/api/library/tiktok?id=${draftId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        await loadTikTokDrafts();
      }
    } catch (error) {
      console.error('[Library] Error deleting TikTok draft:', error);
    }
  };

  // Ajouter TikTok draft au planning
  const scheduleTikTokDraft = (draft: TikTokDraft) => {
    const image: SavedImage = {
      id: draft.saved_image_id,
      image_url: draft.image_url,
      is_favorite: false,
      created_at: draft.created_at
    };
    openScheduleModal(image);
  };

  // Modifier un post planifié
  const handleEditPost = async (post: any) => {
    // TODO: Ouvrir un modal pour éditer le post
    console.log('[Library] Edit scheduled post:', post);
  };

  // Supprimer un post planifié
  const handleDeletePost = async (postId: string) => {
    if (!confirm('Supprimer ce post planifié ?')) return;

    try {
      const res = await fetch(`/api/library/scheduled-posts?id=${postId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.ok) {
        await loadScheduledPosts();
      } else {
        alert('Erreur lors de la suppression du post');
      }
    } catch (error) {
      console.error('[Library] Error deleting scheduled post:', error);
      alert('Erreur lors de la suppression du post');
    }
  };

  // Ouvrir le modal de planification pour une image
  const openScheduleModal = (image: SavedImage) => {
    setSelectedImageForSchedule(image);
    setShowScheduleModal(true);
  };

  // Planifier un post (multi-platform)
  const handleSchedulePost = async (data: {
    platforms: string[];
    scheduledFor: string;
    caption: string;
    hashtags: string[];
  }) => {
    if (!selectedImageForSchedule) return;

    try {
      // Créer un post planifié pour chaque plateforme sélectionnée
      const promises = data.platforms.map(platform =>
        fetch('/api/library/scheduled-posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            saved_image_id: selectedImageForSchedule.id,
            platform,
            scheduled_for: data.scheduledFor,
            caption: data.caption,
            hashtags: data.hashtags
          })
        }).then(res => res.json())
      );

      const results = await Promise.all(promises);

      const failedResults = results.filter(r => !r.ok);

      if (failedResults.length > 0) {
        throw new Error(`Erreur lors de la planification sur ${failedResults.length} plateforme(s)`);
      }

      const platformNames = data.platforms.join(', ');
      alert(`✅ Post planifié avec succès sur ${platformNames} !`);
      await loadScheduledPosts();
      setShowScheduleModal(false);
    } catch (error: any) {
      console.error('[Library] Error scheduling post:', error);
      alert(error.message || 'Erreur lors de la planification du post');
      throw error;
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

  const handleStartFree = () => {
    setShowEmailGate(true);
  };

  const handleEmailSubmit = (email: string) => {
    setGuestEmail(email);
    setIsGuest(true);
    console.log('[Library] Guest mode activated:', email);
  };

  const handleUpload = async (files: FileList) => {
    console.log('[Library] Uploading files:', files.length);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Vérification de type
      if (!file.type.startsWith('image/')) {
        alert(`❌ ${file.name} n'est pas une image valide`);
        continue;
      }

      // Vérification de taille (max 5MB pour localStorage)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        alert(`❌ ${file.name} est trop volumineux (max 5MB)`);
        continue;
      }

      try {
        const reader = new FileReader();

        await new Promise<void>((resolve, reject) => {
          reader.onload = (e) => {
            try {
              const imageUrl = e.target?.result as string;
              const newImage: SavedImage = {
                id: `img-${Date.now()}-${i}`,
                image_url: imageUrl,
                title: file.name.replace(/\.[^/.]+$/, ''), // Nom sans extension
                is_favorite: false,
                created_at: new Date().toISOString()
              };

              if (isGuest) {
                // Mode guest : sauvegarder dans localStorage
                setImages(prev => {
                  const updated = [newImage, ...prev];
                  try {
                    localStorage.setItem('keiro_guest_images', JSON.stringify(updated));
                  } catch (storageError) {
                    console.error('[Library] localStorage error:', storageError);
                    alert('❌ Erreur: Espace de stockage insuffisant. Supprimez des images anciennes.');
                    return prev;
                  }
                  return updated;
                });
                setStats(prev => ({
                  ...prev,
                  total_images: prev.total_images + 1
                }));
                console.log('[Library] Image saved to guest localStorage');
              } else if (user) {
                // User authentifié : TODO - sauvegarder via Supabase
                setImages(prev => [newImage, ...prev]);
                setStats(prev => ({
                  ...prev,
                  total_images: prev.total_images + 1
                }));
                console.log('[Library] Image uploaded (TODO: save to Supabase)');
              }
              resolve();
            } catch (error) {
              console.error('[Library] Error processing image:', error);
              reject(error);
            }
          };

          reader.onerror = (error) => {
            console.error('[Library] FileReader error:', error);
            reject(error);
          };

          reader.readAsDataURL(file);
        });
      } catch (error) {
        console.error('[Library] Upload error for', file.name, ':', error);
        alert(`❌ Erreur lors du téléchargement de ${file.name}`);
      }
    }
  };

  // Handlers pour le drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (user || isGuest) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Vérifier si on quitte vraiment la zone (pas un enfant)
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!user && !isGuest) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleUpload(files);
    }
  };

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-neutral-50 to-white"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* DropZone Overlay */}
      <DropZone isDragging={isDragging} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Email Gate Modal */}
        <EmailGateModal
          isOpen={showEmailGate}
          onClose={() => setShowEmailGate(false)}
          onSubmit={handleEmailSubmit}
        />

        {/* Bandeau Mode Visiteur */}
        {!user && !isGuest && <VisitorBanner onStartFree={handleStartFree} />}

        {/* Bandeau Guest Mode */}
        {!user && isGuest && (
          <div className="mb-6 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-4 text-white shadow-lg">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="text-center md:text-left">
                <p className="text-sm font-semibold mb-1">🎉 Mode Gratuit Activé</p>
                <p className="text-green-100 text-xs">
                  {guestEmail} • Upload illimité • 1 brouillon Instagram gratuit
                </p>
              </div>
              <a
                href="/login"
                className="px-4 py-2 rounded-lg bg-white text-green-600 font-semibold text-sm hover:bg-green-50 transition-colors"
              >
                Créer un compte pour publier automatiquement
              </a>
            </div>
          </div>
        )}

        {/* Header */}
        <GalleryHeader
          user={user}
          stats={stats}
          isGuest={isGuest}
          onUpload={handleUpload}
        />

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

        {/* Section Réseaux Sociaux - Pour utilisateurs connectés */}
        {(user || isGuest) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <span className="text-2xl">🚀</span>
                Vos réseaux sociaux
              </h2>
            </div>

            {/* Widgets Instagram & TikTok côte à côte */}
            <div className={`grid gap-6 ${
              (isInstagramConnected && !isTikTokConnected) || (!isInstagramConnected && isTikTokConnected)
                ? 'md:grid-cols-3' // Un seul connecté = grille 3 colonnes
                : 'md:grid-cols-2' // Les deux ou aucun = grille 2 colonnes égales
            }`}>
              <div className={
                isInstagramConnected && !isTikTokConnected
                  ? 'md:col-span-2' // Instagram connecté seul = 2/3
                  : '' // Par défaut = 1 colonne
              }>
                <InstagramWidget
                  isGuest={!user}
                  onPrepareInstagram={() => setShowInstagramModal(true)}
                  onPrepareTikTok={() => setShowTikTokModal(true)}
                />
              </div>
              <div className={
                isTikTokConnected && !isInstagramConnected
                  ? 'md:col-span-2' // TikTok connecté seul = 2/3
                  : '' // Par défaut = 1 colonne
              }>
                <TikTokWidget
                  onConnect={() => setShowTikTokConnectionModal(true)}
                  onPreparePost={() => setShowTikTokModal(true)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Studios Sociaux - Pour visiteurs uniquement */}
        {!user && !isGuest && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">🎨</span>
              Studios de création
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Studio Instagram */}
              <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 rounded-xl border border-pink-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">📷</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">Studio Instagram</h3>
                    <p className="text-sm text-neutral-600">Publication & Analytics</p>
                  </div>
                </div>
                <p className="text-sm text-neutral-700 mb-4">
                  Créez, planifiez et publiez automatiquement sur Instagram. Suivez vos performances en temps réel.
                </p>
                <button
                  onClick={handleStartFree}
                  className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all"
                >
                  Essayer gratuitement
                </button>
              </div>

              {/* Studio TikTok */}
              <div className="bg-gradient-to-br from-cyan-50 via-blue-50 to-purple-50 rounded-xl border border-cyan-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">🎵</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">Studio TikTok</h3>
                    <p className="text-sm text-neutral-600">Vidéos & Engagement</p>
                  </div>
                </div>
                <p className="text-sm text-neutral-700 mb-4">
                  Convertissez vos images en vidéos TikTok. Publication automatique et analytics complètes.
                </p>
                <button
                  onClick={handleStartFree}
                  className="w-full px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all"
                >
                  Essayer gratuitement
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation par onglets - Visible pour tous */}
        <div id="image-gallery">
          <TabNavigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            imageCount={stats.total_images}
            draftCount={stats.total_instagram_drafts}
            tiktokDraftCount={stats.total_tiktok_drafts}
            scheduledCount={scheduledPosts.length}
          />
        </div>

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
                        isGuest={isGuest}
                        searchQuery={searchQuery}
                        selectedFolder={selectedFolder}
                        showFavoritesOnly={showFavoritesOnly}
                        onToggleFavorite={toggleFavorite}
                        onDownload={downloadImage}
                        onDelete={deleteImage}
                        onOpenInstagram={openPlatformChoiceModal}
                        onSchedule={openScheduleModal}
                        onTitleEdit={handleTitleEdit}
                      />
                    )
                  ) : activeTab === 'drafts' ? (
                    <InstagramDraftsTab
                      drafts={instagramDrafts}
                      onEdit={editInstagramDraft}
                      onDelete={deleteInstagramDraft}
                      onSchedule={scheduleInstagramDraft}
                    />
                  ) : activeTab === 'tiktok-drafts' ? (
                    <TikTokDraftsTab
                      drafts={tiktokDrafts}
                      onEdit={editTikTokDraft}
                      onDelete={deleteTikTokDraft}
                      onSchedule={scheduleTikTokDraft}
                    />
                  ) : activeTab === 'calendar' ? (
                    <CalendarTab
                      scheduledPosts={scheduledPosts}
                      onEditPost={handleEditPost}
                      onDeletePost={handleDeletePost}
                      isVisitor={false}
                    />
                  ) : null}
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
                  isGuest={isGuest}
                  searchQuery={searchQuery}
                  selectedFolder={selectedFolder}
                  showFavoritesOnly={showFavoritesOnly}
                  onToggleFavorite={toggleFavorite}
                  onDownload={downloadImage}
                  onDelete={deleteImage}
                  onOpenInstagram={openPlatformChoiceModal}
                  onSchedule={openScheduleModal}
                  onTitleEdit={handleTitleEdit}
                />
              )
            ) : activeTab === 'drafts' ? (
              <InstagramDraftsTab
                drafts={[]}
                onEdit={editInstagramDraft}
                onDelete={deleteInstagramDraft}
                onSchedule={scheduleInstagramDraft}
              />
            ) : activeTab === 'tiktok-drafts' ? (
              <TikTokDraftsTab
                drafts={[]}
                onEdit={editTikTokDraft}
                onDelete={deleteTikTokDraft}
                onSchedule={scheduleTikTokDraft}
              />
            ) : activeTab === 'calendar' ? (
              <CalendarTab
                scheduledPosts={[]}
                onEditPost={(post) => console.log('Edit post:', post)}
                onDeletePost={(postId) => console.log('Delete post:', postId)}
                isVisitor={true}
              />
            ) : null}
          </ErrorBoundary>
        )}


        {/* Stats footer */}
        <div className="mt-8 pt-6 border-t border-neutral-200 flex justify-between text-sm text-neutral-500">
          <span>Total: {stats.total_images} visuels</span>
          <span>{stats.total_folders} dossiers • {stats.total_favorites} favoris</span>
        </div>
      </div>

      {/* Modal Instagram */}
      {showInstagramModal && (
        <InstagramModal
          image={selectedImageForInsta || undefined}
          images={images}
          onClose={() => setShowInstagramModal(false)}
          onSave={saveInstagramDraft}
        />
      )}

      {/* Modal TikTok */}
      {showTikTokModal && (
        <TikTokModal
          images={images}
          onClose={() => setShowTikTokModal(false)}
          onSave={saveTikTokDraft}
        />
      )}

      {/* Modal Planification */}
      {showScheduleModal && selectedImageForSchedule && (
        <ScheduleModal
          isOpen={showScheduleModal}
          image={selectedImageForSchedule}
          onClose={() => setShowScheduleModal(false)}
          onSchedule={handleSchedulePost}
        />
      )}

      {/* Modal Création de Dossier */}
      {showCreateFolderModal && (
        <CreateFolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onSave={createFolder}
        />
      )}

      {/* Modal Connexion Instagram Meta */}
      <InstagramConnectionModal
        isOpen={showConnectionModal}
        onClose={() => setShowConnectionModal(false)}
      />

      {/* Modal Connexion TikTok */}
      <TikTokConnectionModal
        isOpen={showTikTokConnectionModal}
        onClose={() => setShowTikTokConnectionModal(false)}
      />

      {/* Modal Choix de Plateforme (pour les images de la galerie) */}
      {showPlatformChoiceModal && (
        <PlatformChoiceModal
          onClose={() => setShowPlatformChoiceModal(false)}
          onSelectInstagram={handleSelectInstagram}
          onSelectTikTok={handleSelectTikTok}
        />
      )}
    </main>
  );
}
