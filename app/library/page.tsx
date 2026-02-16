'use client';

import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import VisitorBanner from './components/VisitorBanner';
import GalleryHeader from './components/GalleryHeader';
import InstagramModal from './components/InstagramModal';
import ScheduleModal from './components/ScheduleModal';
import TabNavigation, { Tab } from './components/TabNavigation';
import InstagramDraftsTab, { InstagramDraft } from './components/InstagramDraftsTab';
import TikTokDraftsTab, { TikTokDraft } from './components/TikTokDraftsTab';
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
import LinkedInWidget from './components/LinkedInWidget';
import LinkedInModal from './components/LinkedInModal';
import LinkedInDraftsTab, { LinkedInDraft } from './components/LinkedInDraftsTab';
import TwitterWidget from './components/TwitterWidget';
import TwitterModal from './components/TwitterModal';
import TwitterDraftsTab, { TwitterDraft } from './components/TwitterDraftsTab';
import PlatformChoiceModal from './components/PlatformChoiceModal';
import MyVideosTab from './components/MyVideosTab';
import MyImagesTab from './components/MyImagesTab';
import AllCreationsTab from './components/AllCreationsTab';
import NetworkSelector, { Network } from './components/NetworkSelector';

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

type MyVideo = {
  id: string;
  video_url: string;
  thumbnail_url?: string;
  title?: string;
  duration?: number;
  source_type: string;
  is_favorite: boolean;
  created_at: string;
  published_to_instagram?: boolean;
  instagram_published_at?: string;
  published_to_tiktok: boolean;
  tiktok_published_at?: string;
  file_size?: number;
  folder_id?: string | null;
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

const DEMO_VIDEOS: MyVideo[] = [
  {
    id: 'demo-video-1',
    video_url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=400&fit=crop',
    title: 'Lancement produit - Teaser 5s',
    duration: 5,
    source_type: 'seedream_i2v',
    is_favorite: false,
    created_at: new Date().toISOString(),
    published_to_tiktok: false
  },
  {
    id: 'demo-video-2',
    video_url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop',
    title: 'Story Instagram - Marketing Digital',
    duration: 5,
    source_type: 'seedream_i2v',
    is_favorite: true,
    created_at: new Date().toISOString(),
    published_to_tiktok: false
  },
  {
    id: 'demo-video-3',
    video_url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop',
    title: 'Reel TikTok - Croissance Business',
    duration: 5,
    source_type: 'seedream_i2v',
    is_favorite: false,
    created_at: new Date().toISOString(),
    published_to_tiktok: false
  },
  {
    id: 'demo-video-4',
    video_url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=400&h=400&fit=crop',
    title: 'Promo flash - Innovation Tech',
    duration: 5,
    source_type: 'seedream_i2v',
    is_favorite: true,
    created_at: new Date().toISOString(),
    published_to_tiktok: false
  }
];

function LibraryContent() {
  const searchParams = useSearchParams();
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
    total_tiktok_drafts: 0,
    total_linkedin_drafts: 0,
    total_twitter_drafts: 0
  });

  // États pour les connexions sociales
  const [isInstagramConnected, setIsInstagramConnected] = useState(false);
  const [isTikTokConnected, setIsTikTokConnected] = useState(false);
  const [isLinkedInConnected, setIsLinkedInConnected] = useState(false);
  const [linkedinUsername, setLinkedInUsername] = useState<string>('');

  // États pour le collapse des widgets
  const [isInstagramWidgetCollapsed, setIsInstagramWidgetCollapsed] = useState(false);
  const [isTikTokWidgetCollapsed, setIsTikTokWidgetCollapsed] = useState(false);
  const [tiktokWidgetRefreshTrigger, setTiktokWidgetRefreshTrigger] = useState(0);

  // États pour le workspace Instagram
  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [selectedImageForInsta, setSelectedImageForInsta] = useState<SavedImage | null>(null);
  const [selectedVideoForInsta, setSelectedVideoForInsta] = useState<MyVideo | null>(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [draftCaptionToEdit, setDraftCaptionToEdit] = useState<string | undefined>(undefined);
  const [draftHashtagsToEdit, setDraftHashtagsToEdit] = useState<string[] | undefined>(undefined);

  // États pour TikTok
  const [showTikTokConnectionModal, setShowTikTokConnectionModal] = useState(false);
  const [showTikTokModal, setShowTikTokModal] = useState(false);
  const [selectedImageForTikTok, setSelectedImageForTikTok] = useState<SavedImage | null>(null);
  const [selectedVideoForTikTok, setSelectedVideoForTikTok] = useState<MyVideo | null>(null); // NEW
  const [draftTikTokCaptionToEdit, setDraftTikTokCaptionToEdit] = useState<string | undefined>(undefined);
  const [draftTikTokHashtagsToEdit, setDraftTikTokHashtagsToEdit] = useState<string[] | undefined>(undefined);

  // États pour LinkedIn
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
  const [selectedImageForLinkedIn, setSelectedImageForLinkedIn] = useState<SavedImage | null>(null);
  const [selectedVideoForLinkedIn, setSelectedVideoForLinkedIn] = useState<MyVideo | null>(null);
  const [draftLinkedInCaptionToEdit, setDraftLinkedInCaptionToEdit] = useState<string | undefined>(undefined);
  const [draftLinkedInHashtagsToEdit, setDraftLinkedInHashtagsToEdit] = useState<string[] | undefined>(undefined);
  const [linkedinDrafts, setLinkedInDrafts] = useState<LinkedInDraft[]>([]);

  // États pour Twitter/X
  const [showTwitterModal, setShowTwitterModal] = useState(false);
  const [selectedImageForTwitter, setSelectedImageForTwitter] = useState<SavedImage | null>(null);
  const [selectedVideoForTwitter, setSelectedVideoForTwitter] = useState<MyVideo | null>(null);
  const [draftTwitterCaptionToEdit, setDraftTwitterCaptionToEdit] = useState<string | undefined>(undefined);
  const [draftTwitterHashtagsToEdit, setDraftTwitterHashtagsToEdit] = useState<string[] | undefined>(undefined);
  const [twitterDrafts, setTwitterDrafts] = useState<TwitterDraft[]>([]);

  // NetworkSelector state (persisted in localStorage)
  const [selectedNetworks, setSelectedNetworks] = useState<Network[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('keiro_selected_networks');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return ['instagram', 'tiktok'];
  });

  // Collapse states for LinkedIn/Twitter widgets
  const [isLinkedInWidgetCollapsed, setIsLinkedInWidgetCollapsed] = useState(false);
  const [isTwitterWidgetCollapsed, setIsTwitterWidgetCollapsed] = useState(false);

  // Liste prioritaire (feature interests)
  const [joinedFeatures, setJoinedFeatures] = useState<string[]>([]);

  // États pour le choix de plateforme (galerie)
  const [showPlatformChoiceModal, setShowPlatformChoiceModal] = useState(false);
  const [selectedImageForPlatform, setSelectedImageForPlatform] = useState<SavedImage | null>(null);
  const [selectedVideoForPlatform, setSelectedVideoForPlatform] = useState<MyVideo | null>(null);
  // Refs to avoid stale closure issues in platform choice handlers
  const selectedImageForPlatformRef = useRef<SavedImage | null>(null);
  const selectedVideoForPlatformRef = useRef<MyVideo | null>(null);

  // États pour la planification
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedImageForSchedule, setSelectedImageForSchedule] = useState<SavedImage | null>(null);

  // États pour les onglets
  const tabParam = searchParams?.get('tab') as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(tabParam || 'all-creations');

  // Fallback: if active tab is a draft of a deselected network, reset to all-creations
  useEffect(() => {
    const draftNetworkMap: Record<string, Network> = {
      'drafts': 'instagram',
      'tiktok-drafts': 'tiktok',
      'linkedin-drafts': 'linkedin',
      'twitter-drafts': 'twitter',
    };
    const requiredNetwork = draftNetworkMap[activeTab];
    if (requiredNetwork && !selectedNetworks.includes(requiredNetwork)) {
      setActiveTab('all-creations');
    }
  }, [selectedNetworks, activeTab]);

  const [instagramDrafts, setInstagramDrafts] = useState<InstagramDraft[]>([]);
  const [tiktokDrafts, setTikTokDrafts] = useState<TikTokDraft[]>([]);
  const [myVideos, setMyVideos] = useState<MyVideo[]>([]);
  const [tiktokPosts, setTiktokPosts] = useState<any[]>([]); // Vidéos TikTok synchronisées
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);

  // États pour les dossiers
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [itemToMoveToFolder, setItemToMoveToFolder] = useState<{ id: string; type: 'image' | 'video' } | null>(null);

  // États pour le Guest Mode
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [guestEmail, setGuestEmail] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [pendingWaitlistFeature, setPendingWaitlistFeature] = useState<string | null>(null);

  // État pour le drag & drop
  const [isDragging, setIsDragging] = useState(false);

  // Persist network selection
  const handleNetworkSelectionChange = (networks: Network[]) => {
    setSelectedNetworks(networks);
    localStorage.setItem('keiro_selected_networks', JSON.stringify(networks));
  };

  // Helper to get collapse state for a network
  const getCollapseState = (network: Network): boolean => {
    switch (network) {
      case 'instagram': return isInstagramWidgetCollapsed;
      case 'tiktok': return isTikTokWidgetCollapsed;
      case 'linkedin': return isLinkedInWidgetCollapsed;
      case 'twitter': return isTwitterWidgetCollapsed;
    }
  };

  const setCollapseState = (network: Network, collapsed: boolean) => {
    switch (network) {
      case 'instagram': setIsInstagramWidgetCollapsed(collapsed); break;
      case 'tiktok': setIsTikTokWidgetCollapsed(collapsed); break;
      case 'linkedin': setIsLinkedInWidgetCollapsed(collapsed); break;
      case 'twitter': setIsTwitterWidgetCollapsed(collapsed); break;
    }
  };

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
                total_tiktok_drafts: 0,
                total_linkedin_drafts: 0,
                total_twitter_drafts: 0
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
          setMyVideos(DEMO_VIDEOS);
          setStats({
            total_images: DEMO_IMAGES.length,
            total_folders: 0,
            total_favorites: DEMO_IMAGES.filter(img => img.is_favorite).length,
            total_instagram_drafts: 0,
            total_tiktok_drafts: 0,
            total_linkedin_drafts: 0,
            total_twitter_drafts: 0
          });
        }
      }
    };
    loadUser();
  }, [supabase]);

  // Vérifier les connexions Instagram, TikTok et LinkedIn
  useEffect(() => {
    const checkConnections = async () => {
      if (!user) {
        setIsInstagramConnected(false);
        setIsTikTokConnected(false);
        setIsLinkedInConnected(false);
        setLinkedInUsername('');
        return;
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('instagram_user_id, tiktok_user_id, linkedin_user_id, linkedin_username, linkedin_token_expiry')
          .eq('id', user.id)
          .single();

        setIsInstagramConnected(!!profile?.instagram_user_id);
        setIsTikTokConnected(!!profile?.tiktok_user_id);

        // LinkedIn: check token not expired
        const linkedinConnected = !!profile?.linkedin_user_id && !!profile?.linkedin_token_expiry &&
          new Date(profile.linkedin_token_expiry) > new Date();
        setIsLinkedInConnected(linkedinConnected);
        setLinkedInUsername(profile?.linkedin_username || '');
      } catch (error) {
        console.error('[Library] Error checking connections:', error);
      }
    };

    checkConnections();
  }, [user, supabase]);

  // Fonction pour charger les brouillons Instagram
  const loadInstagramDrafts = async () => {
    try {
      const res = await fetch('/api/library/instagram-drafts');
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
      const res = await fetch('/api/library/tiktok-drafts');
      const data = await res.json();
      if (data.ok) {
        setTikTokDrafts(data.posts || []);
        setStats(prev => ({ ...prev, total_tiktok_drafts: data.posts?.length || 0 }));
      }
    } catch (error) {
      console.error('[Library] Error loading TikTok drafts:', error);
    }
  };

  // Fonction pour charger les brouillons LinkedIn
  const loadLinkedInDrafts = async () => {
    try {
      const res = await fetch('/api/library/linkedin-drafts');
      const data = await res.json();
      if (data.ok) {
        setLinkedInDrafts(data.posts || []);
        setStats(prev => ({ ...prev, total_linkedin_drafts: data.posts?.length || 0 }));
      }
    } catch (error) {
      console.error('[Library] Error loading LinkedIn drafts:', error);
    }
  };

  // Fonction pour charger les brouillons Twitter
  const loadTwitterDrafts = async () => {
    try {
      const res = await fetch('/api/library/twitter-drafts');
      const data = await res.json();
      if (data.ok) {
        setTwitterDrafts(data.posts || []);
        setStats(prev => ({ ...prev, total_twitter_drafts: data.posts?.length || 0 }));
      }
    } catch (error) {
      console.error('[Library] Error loading Twitter drafts:', error);
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

        // Charger les brouillons LinkedIn
        await loadLinkedInDrafts();

        // Charger les brouillons Twitter
        await loadTwitterDrafts();

        // Charger les posts planifiés
        await loadScheduledPosts();
      } catch (error) {
        console.error('[Library] Error loading library:', error);
      }
    };

    loadLibrary();
  }, [user]);

  // Charger les feature interests (liste prioritaire)
  useEffect(() => {
    if (!user) return;
    const loadFeatureInterests = async () => {
      try {
        const res = await fetch('/api/feature-interest', { credentials: 'include' });
        const data = await res.json();
        if (data.ok) setJoinedFeatures(data.features || []);
      } catch (error) {
        console.error('[Library] Error loading feature interests:', error);
      }
    };
    loadFeatureInterests();
  }, [user]);

  const handleJoinWaitlist = async (feature: string) => {
    try {
      const res = await fetch('/api/feature-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ feature })
      });
      const data = await res.json();
      if (data.ok) {
        setJoinedFeatures(prev => [...prev, feature]);
      }
    } catch (error) {
      console.error('[Library] Error joining waitlist:', error);
    }
  };

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

  const loadMyVideos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedFolder) params.append('folderId', selectedFolder);
      if (searchQuery) params.append('search', searchQuery);
      if (showFavoritesOnly) params.append('favoritesOnly', 'true');

      const res = await fetch(`/api/library/videos?${params}`, {
        credentials: 'include'
      });

      const data = await res.json();

      if (data.ok) {
        setMyVideos(data.videos);
      } else {
        console.error('[Library] API error loading videos:', data.error);
      }
    } catch (error) {
      console.error('[Library] Error loading videos:', error);
    }
  }, [selectedFolder, searchQuery, showFavoritesOnly]);

  // Charger les vidéos TikTok synchronisées
  const loadTikTokPosts = useCallback(async () => {
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      const { data: posts, error } = await supabase
        .from('tiktok_posts')
        .select('*')
        .eq('user_id', user.id)
        .order('posted_at', { ascending: false });

      if (error) {
        console.error('[Library] Error loading TikTok posts:', error);
        return;
      }

      setTiktokPosts(posts || []);
    } catch (error) {
      console.error('[Library] Error loading TikTok posts:', error);
    }
  }, []);

  // Recharger quand les filtres changent
  useEffect(() => {
    if (user) {
      loadImages();
      loadMyVideos();
      loadTikTokPosts();
    }
  }, [loadImages, loadMyVideos, loadTikTokPosts, user]);

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
    setSelectedVideoForInsta(null); // Clear video selection
    setDraftCaptionToEdit(undefined);
    setDraftHashtagsToEdit(undefined);
    setShowInstagramModal(true);
  };

  // Ouvrir le modal TikTok pour une image
  const openTikTokModalForImage = (image: SavedImage) => {
    setSelectedImageForTikTok(image);
    setSelectedVideoForTikTok(null); // Clear video selection
    setDraftTikTokCaptionToEdit(undefined);
    setDraftTikTokHashtagsToEdit(undefined);
    setShowTikTokModal(true);
  };

  // Ouvrir le modal de choix de plateforme (pour les images de la galerie)
  const openPlatformChoiceModal = (image: SavedImage) => {
    selectedImageForPlatformRef.current = image;
    selectedVideoForPlatformRef.current = null;
    setSelectedImageForPlatform(image);
    setSelectedVideoForPlatform(null);
    setShowPlatformChoiceModal(true);
  };

  // Ouvrir le modal de choix de plateforme (pour les vidéos)
  const openPlatformChoiceModalForVideo = (video: MyVideo) => {
    selectedVideoForPlatformRef.current = video;
    selectedImageForPlatformRef.current = null;
    setSelectedVideoForPlatform(video);
    setSelectedImageForPlatform(null);
    setShowPlatformChoiceModal(true);
  };

  // Gérer le choix de plateforme (use refs to avoid stale closure)
  const handleSelectInstagram = () => {
    setShowPlatformChoiceModal(false);
    const image = selectedImageForPlatformRef.current;
    const video = selectedVideoForPlatformRef.current;

    if (image) {
      openInstagramModal(image);
      setSelectedImageForPlatform(null);
      selectedImageForPlatformRef.current = null;
    } else if (video) {
      setSelectedVideoForInsta(video);
      setSelectedImageForInsta(null);
      setDraftCaptionToEdit(undefined);
      setDraftHashtagsToEdit(undefined);
      setShowInstagramModal(true);
      setSelectedVideoForPlatform(null);
      selectedVideoForPlatformRef.current = null;
    }
  };

  const handleSelectTikTok = () => {
    setShowPlatformChoiceModal(false);
    const image = selectedImageForPlatformRef.current;
    const video = selectedVideoForPlatformRef.current;

    if (image) {
      setSelectedImageForTikTok(image);
      setDraftTikTokCaptionToEdit(undefined);
      setDraftTikTokHashtagsToEdit(undefined);
      setShowTikTokModal(true);
      setSelectedImageForPlatform(null);
      selectedImageForPlatformRef.current = null;
    } else if (video) {
      setSelectedVideoForTikTok(video);
      setSelectedImageForTikTok(null);
      setDraftTikTokCaptionToEdit(video.title || 'Vidéo TikTok');
      setDraftTikTokHashtagsToEdit([]);
      setShowTikTokModal(true);
      setSelectedVideoForPlatform(null);
      selectedVideoForPlatformRef.current = null;
    }
  };

  // Gérer le choix LinkedIn dans PlatformChoiceModal
  const handleSelectLinkedIn = () => {
    setShowPlatformChoiceModal(false);
    const image = selectedImageForPlatformRef.current;
    const video = selectedVideoForPlatformRef.current;

    if (image) {
      setSelectedImageForLinkedIn(image);
      setSelectedVideoForLinkedIn(null);
      setDraftLinkedInCaptionToEdit(undefined);
      setDraftLinkedInHashtagsToEdit(undefined);
      setShowLinkedInModal(true);
      setSelectedImageForPlatform(null);
      selectedImageForPlatformRef.current = null;
    } else if (video) {
      setSelectedVideoForLinkedIn(video);
      setSelectedImageForLinkedIn(null);
      setDraftLinkedInCaptionToEdit(undefined);
      setDraftLinkedInHashtagsToEdit(undefined);
      setShowLinkedInModal(true);
      setSelectedVideoForPlatform(null);
      selectedVideoForPlatformRef.current = null;
    }
  };

  // Gérer le choix Twitter dans PlatformChoiceModal
  const handleSelectTwitter = () => {
    setShowPlatformChoiceModal(false);
    const image = selectedImageForPlatformRef.current;
    const video = selectedVideoForPlatformRef.current;

    if (image) {
      setSelectedImageForTwitter(image);
      setSelectedVideoForTwitter(null);
      setDraftTwitterCaptionToEdit(undefined);
      setDraftTwitterHashtagsToEdit(undefined);
      setShowTwitterModal(true);
      setSelectedImageForPlatform(null);
      selectedImageForPlatformRef.current = null;
    } else if (video) {
      setSelectedVideoForTwitter(video);
      setSelectedImageForTwitter(null);
      setDraftTwitterCaptionToEdit(undefined);
      setDraftTwitterHashtagsToEdit(undefined);
      setShowTwitterModal(true);
      setSelectedVideoForPlatform(null);
      selectedVideoForPlatformRef.current = null;
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
          media_url: image.image_url,
          media_type: 'image',
          category: 'draft',
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
      const response = await fetch('/api/library/instagram-drafts', {
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
      const response = await fetch('/api/library/tiktok-drafts', {
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
    const image: SavedImage = {
      id: draft.saved_image_id || draft.id,
      image_url: draft.media_url,
      is_favorite: false,
      created_at: draft.created_at
    };
    setSelectedImageForInsta(image);
    setDraftCaptionToEdit(draft.caption || '');
    setDraftHashtagsToEdit(draft.hashtags || []);
    setShowInstagramModal(true);
  };

  // Supprimer un brouillon Instagram
  const deleteInstagramDraft = async (draftId: string) => {
    if (!confirm('Supprimer ce brouillon Instagram ?')) return;

    try {
      const res = await fetch(`/api/library/instagram-drafts?id=${draftId}`, {
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
      id: draft.saved_image_id || draft.id,
      image_url: draft.media_url,
      is_favorite: false,
      created_at: draft.created_at
    };
    openScheduleModal(image);
  };

  // Modifier un brouillon TikTok
  const editTikTokDraft = (draft: TikTokDraft) => {
    const image: SavedImage = {
      id: draft.saved_image_id || draft.id,
      image_url: draft.media_url,
      is_favorite: false,
      created_at: draft.created_at
    };
    setSelectedImageForTikTok(image);
    setDraftTikTokCaptionToEdit(draft.caption || '');
    setDraftTikTokHashtagsToEdit(draft.hashtags || []);
    setShowTikTokModal(true);
  };

  // Supprimer un brouillon TikTok
  const deleteTikTokDraft = async (draftId: string) => {
    if (!confirm('Supprimer ce brouillon TikTok ?')) return;

    try {
      const res = await fetch(`/api/library/tiktok-drafts?id=${draftId}`, {
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
      id: draft.saved_image_id || draft.id,
      image_url: draft.media_url,
      is_favorite: false,
      created_at: draft.created_at
    };
    openScheduleModal(image);
  };

  // Sauvegarder le brouillon LinkedIn
  const saveLinkedInDraft = async (image: SavedImage | null, caption: string, hashtags: string[], status: 'draft' | 'ready') => {
    try {
      if (isGuest) {
        alert('LinkedIn n\'est pas disponible en mode gratuit.\n\nCréez un compte pour publier sur LinkedIn !');
        return;
      }

      const response = await fetch('/api/library/linkedin-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savedImageId: image?.id || null, caption, hashtags, status })
      });

      const data = await response.json();

      if (data.ok) {
        alert(status === 'ready' ? 'Post LinkedIn prêt !' : 'Brouillon LinkedIn sauvegardé !');
        setShowLinkedInModal(false);
        await loadLinkedInDrafts();
      } else {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error: any) {
      console.error('[Library] Error saving LinkedIn draft:', error);
      alert(error.message || 'Erreur lors de la sauvegarde du brouillon');
    }
  };

  // Modifier un brouillon LinkedIn
  const editLinkedInDraft = (draft: LinkedInDraft) => {
    const image: SavedImage = {
      id: draft.saved_image_id || draft.id,
      image_url: draft.media_url,
      is_favorite: false,
      created_at: draft.created_at
    };
    setSelectedImageForLinkedIn(image);
    setDraftLinkedInCaptionToEdit(draft.caption || '');
    setDraftLinkedInHashtagsToEdit(draft.hashtags || []);
    setShowLinkedInModal(true);
  };

  // Supprimer un brouillon LinkedIn
  const deleteLinkedInDraft = async (draftId: string) => {
    if (!confirm('Supprimer ce brouillon LinkedIn ?')) return;
    try {
      const res = await fetch(`/api/library/linkedin-drafts?id=${draftId}`, { method: 'DELETE' });
      if (res.ok) await loadLinkedInDrafts();
    } catch (error) {
      console.error('[Library] Error deleting LinkedIn draft:', error);
    }
  };

  // Publier un brouillon LinkedIn
  const handlePublishToLinkedIn = async (draft: LinkedInDraft) => {
    if (!confirm('Publier ce post sur LinkedIn ?')) return;
    try {
      const response = await fetch('/api/library/linkedin/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrl: draft.media_url || null,
          mediaType: draft.media_type || (draft.media_url ? 'image' : 'text-only'),
          caption: draft.caption,
          hashtags: draft.hashtags,
          draftId: draft.id,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        alert('Post publié sur LinkedIn !');
        await loadLinkedInDrafts();
      } else {
        throw new Error(data.error || 'Erreur lors de la publication');
      }
    } catch (error: any) {
      console.error('[Library] Error publishing to LinkedIn:', error);
      alert(error.message || 'Erreur lors de la publication sur LinkedIn');
    }
  };

  // Publier directement depuis le modal LinkedIn
  const handlePublishLinkedInFromModal = async (mediaUrl: string | null, mediaType: string, caption: string, hashtags: string[]) => {
    const response = await fetch('/api/library/linkedin/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaUrl, mediaType, caption, hashtags }),
    });
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Erreur lors de la publication');
    }
    await loadLinkedInDrafts();
  };

  // Connecter LinkedIn
  const handleConnectLinkedIn = () => {
    window.location.href = '/api/auth/linkedin-oauth';
  };

  // Déconnecter LinkedIn
  const handleDisconnectLinkedIn = async () => {
    if (!confirm('Déconnecter votre compte LinkedIn ?')) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          linkedin_user_id: null,
          linkedin_username: null,
          linkedin_access_token: null,
          linkedin_token_expiry: null,
          linkedin_connected_at: null,
        })
        .eq('id', user!.id);
      if (!error) {
        setIsLinkedInConnected(false);
        setLinkedInUsername('');
      }
    } catch (error) {
      console.error('[Library] Error disconnecting LinkedIn:', error);
    }
  };

  // Sauvegarder le brouillon Twitter
  const saveTwitterDraft = async (image: SavedImage | null, caption: string, hashtags: string[], status: 'draft' | 'ready') => {
    try {
      if (isGuest) {
        alert('Twitter n\'est pas disponible en mode gratuit.\n\nCréez un compte pour publier sur X !');
        return;
      }

      const response = await fetch('/api/library/twitter-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savedImageId: image?.id || null, caption, hashtags, status })
      });

      const data = await response.json();

      if (data.ok) {
        alert(status === 'ready' ? 'Tweet prêt !' : 'Brouillon X sauvegardé !');
        setShowTwitterModal(false);
        await loadTwitterDrafts();
      } else {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error: any) {
      console.error('[Library] Error saving Twitter draft:', error);
      alert(error.message || 'Erreur lors de la sauvegarde du brouillon');
    }
  };

  // Modifier un brouillon Twitter
  const editTwitterDraft = (draft: TwitterDraft) => {
    const image: SavedImage = {
      id: draft.saved_image_id || draft.id,
      image_url: draft.media_url,
      is_favorite: false,
      created_at: draft.created_at
    };
    setSelectedImageForTwitter(image);
    setDraftTwitterCaptionToEdit(draft.caption || '');
    setDraftTwitterHashtagsToEdit(draft.hashtags || []);
    setShowTwitterModal(true);
  };

  // Supprimer un brouillon Twitter
  const deleteTwitterDraft = async (draftId: string) => {
    if (!confirm('Supprimer ce brouillon X ?')) return;
    try {
      const res = await fetch(`/api/library/twitter-drafts?id=${draftId}`, { method: 'DELETE' });
      if (res.ok) await loadTwitterDrafts();
    } catch (error) {
      console.error('[Library] Error deleting Twitter draft:', error);
    }
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

  // === HANDLERS POUR VIDÉOS ===

  const handleDeleteVideo = async (videoId: string) => {
    try {
      const res = await fetch(`/api/library/videos/${videoId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        setMyVideos(prev => prev.filter(v => v.id !== videoId));
      } else {
        alert('Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('[Library] Error deleting video:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const handleToggleVideoFavorite = async (videoId: string, isFavorite: boolean) => {
    try {
      const res = await fetch(`/api/library/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: isFavorite })
      });

      if (res.ok) {
        setMyVideos(prev => prev.map(v =>
          v.id === videoId ? { ...v, is_favorite: isFavorite } : v
        ));
      }
    } catch (error) {
      console.error('[Library] Error toggling favorite:', error);
    }
  };

  const handlePublishVideoToTikTok = async (video: MyVideo) => {
    // Open TikTok modal with selected video instead of publishing directly
    setSelectedVideoForTikTok(video);
    setSelectedImageForTikTok(null); // Clear image selection
    setDraftTikTokCaptionToEdit(video.title || 'Vidéo TikTok'); // Pre-fill caption with video title
    setDraftTikTokHashtagsToEdit([]); // Clear hashtags
    setShowTikTokModal(true);

    /* OLD CODE: Direct publication without modal
    try {
      const res = await fetch('/api/library/tiktok/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: video.video_url,
          caption: video.title || 'Vidéo TikTok',
          hashtags: []
        })
      });

      const data = await res.json();

      if (data.ok) {
        alert('✅ Vidéo publiée sur TikTok !');
        // Mettre à jour le statut local
        setMyVideos(prev => prev.map(v =>
          v.id === video.id ? {
            ...v,
            published_to_tiktok: true,
            tiktok_published_at: new Date().toISOString()
          } : v
        ));
      } else {
        alert(`❌ Erreur: ${data.error}`);
      }
    } catch (error: any) {
      console.error('[Library] Error publishing to TikTok:', error);
      alert(`❌ Erreur: ${error.message}`);
    }
    */
  };

  const handleVideoTitleEdit = async (videoId: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/library/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });

      if (res.ok) {
        setMyVideos(prev => prev.map(v =>
          v.id === videoId ? { ...v, title: newTitle } : v
        ));
      }
    } catch (error) {
      console.error('[Library] Error updating video title:', error);
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

  // === HANDLERS UNIFIÉS POUR ALLCREATIONSTAB ===

  const handleUnifiedToggleFavorite = async (id: string, type: 'image' | 'video', isFavorite: boolean) => {
    if (type === 'image') {
      await toggleFavorite(id, !isFavorite);
    } else {
      await handleToggleVideoFavorite(id, isFavorite);
    }
  };

  const handleUnifiedTitleEdit = async (id: string, type: 'image' | 'video', newTitle: string) => {
    if (type === 'image') {
      await handleTitleEdit(id, newTitle);
    } else {
      await handleVideoTitleEdit(id, newTitle);
    }
  };

  const handleUnifiedDelete = async (id: string, type: 'image' | 'video') => {
    if (type === 'image') {
      await deleteImage(id);
    } else {
      await handleDeleteVideo(id);
    }
  };

  const handleUnifiedPublish = (item: any) => {
    // Ouvrir le modal de choix de plateforme (Instagram ou TikTok)
    if (item.type === 'image') {
      const image: SavedImage = images.find(img => img.id === item.id)!;
      openPlatformChoiceModal(image);
    } else if (item.type === 'video') {
      const video: MyVideo = myVideos.find(v => v.id === item.id)!;
      openPlatformChoiceModalForVideo(video);
    }
  };

  const handleUnifiedDownload = async (item: any) => {
    const filename = item.type === 'image'
      ? `${item.title || 'keiro-image'}.png`
      : `${item.title || 'keiro-video'}.mp4`;

    await downloadImage(item.url, filename);
  };

  const handleUnifiedMoveToFolder = async (id: string, type: 'image' | 'video', folderId: string | null) => {
    try {
      const table = type === 'image' ? 'saved_images' : 'my_videos';

      const { error } = await supabase
        .from(table)
        .update({ folder_id: folderId })
        .eq('id', id);

      if (error) {
        console.error('[Library] Error moving item to folder:', error);
        throw error;
      }

      // Rafraîchir les données
      await handleRefreshAll();
    } catch (error: any) {
      console.error('[Library] Failed to move item:', error);
      throw error;
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      const res = await fetch(`/api/library/folders?id=${folderId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setFolders(prev => prev.filter(f => f.id !== folderId));
      await handleRefreshAll();
    } catch (error: any) {
      console.error('[Library] Error deleting folder:', error);
      alert('Erreur lors de la suppression du dossier');
    }
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    try {
      const res = await fetch('/api/library/folders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: folderId, name: newName })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      // Mettre à jour le state local
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: newName } : f));
    } catch (error: any) {
      console.error('[Library] Error renaming folder:', error);
      alert('Erreur lors du renommage du dossier');
      throw error;
    }
  };

  const handleRefreshAll = async () => {
    await loadImages();
    await loadMyVideos();
    await loadTikTokPosts();
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
    setPendingWaitlistFeature(null);
    setShowEmailGate(true);
  };

  const handleJoinTwitterWaitlist = () => {
    setPendingWaitlistFeature('twitter');
    setShowEmailGate(true);
  };

  const handleEmailSubmit = async (email: string) => {
    if (pendingWaitlistFeature) {
      // Waitlist mode: enregistrer l'email + interet, PAS activer guest mode
      try {
        await fetch('/api/feature-interest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: pendingWaitlistFeature, email })
        });
      } catch (error) {
        console.error('[Library] Error saving waitlist interest:', error);
      }
      setPendingWaitlistFeature(null);
      alert('Merci ! Vous serez notifié quand cette fonctionnalité sera disponible.');
    } else {
      // Guest mode classique
      setGuestEmail(email);
      setIsGuest(true);
      console.log('[Library] Guest mode activated:', email);
    }
  };

  const handleUpload = async (files: FileList) => {
    console.log('[Library] Uploading files:', files.length);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Déterminer le type de fichier
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (!isImage && !isVideo) {
        alert(`❌ ${file.name} n'est ni une image ni une vidéo valide`);
        continue;
      }

      // Vérification de taille selon le type
      const maxSize = isImage ? 8 * 1024 * 1024 : 287 * 1024 * 1024; // 8MB images, 287MB videos (TikTok limit)
      const maxSizeText = isImage ? '8MB' : '287MB';
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      console.log(`[Library] File ${file.name}: ${fileSizeMB}MB (max: ${maxSizeText})`);

      if (file.size > maxSize) {
        alert(`❌ ${file.name} est trop volumineux (${fileSizeMB}MB, max ${maxSizeText})`);
        continue;
      }

      try {
        if (isVideo) {
          // Upload vidéo (uniquement pour utilisateurs authentifiés)
          if (!user) {
            alert('❌ L\'upload de vidéos nécessite un compte. Créez un compte gratuit !');
            continue;
          }
          await uploadVideoFile(file);
        } else {
          // Upload image (existant)
          await uploadImageFile(file, i);
        }
      } catch (error) {
        console.error('[Library] Upload error for', file.name, ':', error);
        alert(`❌ Erreur lors du téléchargement de ${file.name}`);
      }
    }
  };

  const uploadImageFile = async (file: File, index: number) => {
    const reader = new FileReader();

    await new Promise<void>((resolve, reject) => {
      reader.onload = (e) => {
        try {
          const imageUrl = e.target?.result as string;
          const newImage: SavedImage = {
            id: `img-${Date.now()}-${index}`,
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
  };

  const uploadVideoFile = async (file: File) => {
    console.log('[Library] Uploading video:', file.name);

    // Étape 1: Obtenir une signed URL depuis l'API
    const signedUrlResponse = await fetch('/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        fileType: file.type,
        fileSize: file.size
      })
    });

    if (!signedUrlResponse.ok) {
      const errorData = await signedUrlResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Impossible d\'obtenir l\'URL d\'upload');
    }

    const { signedUrl, token, path } = await signedUrlResponse.json();
    console.log('[Library] Got signed URL for:', path);

    // Étape 2: Upload direct vers Supabase Storage
    const uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
        'x-upsert': 'false',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

    console.log('[Library] Video uploaded to Supabase Storage');

    // Étape 3: Sauvegarder les métadonnées en DB
    const ext = file.name.split('.').pop()?.toLowerCase();
    const metadataResponse = await fetch('/api/save-video-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storagePath: path,
        title: file.name.replace(`.${ext}`, ''),
        fileSize: file.size,
        format: ext,
        folderId: null
      })
    });

    if (!metadataResponse.ok) {
      const errorData = await metadataResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Erreur lors de la sauvegarde des métadonnées');
    }

    const metadataData = await metadataResponse.json();
    if (!metadataData.ok) {
      throw new Error(metadataData.error || 'Failed to save metadata');
    }

    console.log('[Library] Video metadata saved:', metadataData.video.id);

    // Recharger les vidéos
    await loadMyVideos();
  };

  // Handlers pour le drag & drop - seulement pour les fichiers externes (pas dnd-kit interne)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Ne montrer l'overlay que pour les fichiers glissés depuis l'extérieur (bureau)
    if ((user || isGuest) && e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Simplifié: ferme l'overlay quand on sort
    setIsDragging(false);
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
      <DropZone isDragging={isDragging} onCancel={() => setIsDragging(false)} />

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
                href="/pricing"
                className="px-4 py-2 rounded-lg bg-white text-green-600 font-semibold text-sm hover:bg-green-50 transition-colors"
              >
                Débloquer toutes les fonctionnalités
              </a>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <GalleryHeader
            user={user}
            stats={stats}
            isGuest={isGuest}
            onUpload={handleUpload}
            onUploadComplete={handleRefreshAll}
          />
        </div>

        {/* Section Réseaux Sociaux - Pour utilisateurs connectés - TOUS LES ONGLETS */}
        {(user || isGuest) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <span className="text-2xl">🚀</span>
                Vos réseaux sociaux
              </h2>
              <NetworkSelector
                selectedNetworks={selectedNetworks}
                onSelectionChange={handleNetworkSelectionChange}
              />
            </div>

            {/* Widgets Réseaux Sociaux - Adaptatif selon sélection et collapse */}
            {(() => {
              const nets = selectedNetworks;
              const collapsedCount = nets.filter(n => getCollapseState(n)).length;
              const expandedCount = nets.length - collapsedCount;

              const renderWidget = (network: Network) => {
                switch (network) {
                  case 'instagram':
                    return (
                      <InstagramWidget
                        isGuest={!user}
                        onPrepareInstagram={() => setShowInstagramModal(true)}
                        onPrepareTikTok={() => setShowTikTokModal(true)}
                        isCollapsed={isInstagramWidgetCollapsed}
                        onToggleCollapse={setIsInstagramWidgetCollapsed}
                      />
                    );
                  case 'tiktok':
                    return (
                      <TikTokWidget
                        onConnect={() => setShowTikTokConnectionModal(true)}
                        onPreparePost={() => setShowTikTokModal(true)}
                        isCollapsed={isTikTokWidgetCollapsed}
                        onToggleCollapse={setIsTikTokWidgetCollapsed}
                        refreshTrigger={tiktokWidgetRefreshTrigger}
                      />
                    );
                  case 'linkedin':
                    return (
                      <LinkedInWidget
                        isGuest={!user}
                        onPreparePost={() => setShowLinkedInModal(true)}
                        isCollapsed={isLinkedInWidgetCollapsed}
                        onToggleCollapse={setIsLinkedInWidgetCollapsed}
                        connected={isLinkedInConnected}
                        username={linkedinUsername}
                        onConnect={handleConnectLinkedIn}
                        onDisconnect={handleDisconnectLinkedIn}
                      />
                    );
                  case 'twitter':
                    return (
                      <TwitterWidget
                        isGuest={!user}
                        onPreparePost={() => setShowTwitterModal(true)}
                        isCollapsed={isTwitterWidgetCollapsed}
                        onToggleCollapse={setIsTwitterWidgetCollapsed}
                        onJoinWaitlist={() => handleJoinWaitlist('twitter')}
                        hasJoinedWaitlist={joinedFeatures.includes('twitter')}
                      />
                    );
                }
              };

              // For 2 widgets with collapse: use 10-col grid for asymmetric layout
              if (nets.length === 2 && (collapsedCount === 1)) {
                return (
                  <div className="grid gap-6 md:grid-cols-10">
                    {nets.map(net => (
                      <div key={net} className={getCollapseState(net) ? 'md:col-span-1' : 'md:col-span-9'}>
                        {renderWidget(net)}
                      </div>
                    ))}
                  </div>
                );
              }

              // Default: equal columns grid
              const gridClass = nets.length === 1 ? 'grid-cols-1'
                : nets.length === 2 ? 'md:grid-cols-2'
                : nets.length === 3 ? 'md:grid-cols-3'
                : 'grid-cols-2 lg:grid-cols-4';

              return (
                <div className={`grid gap-6 ${gridClass}`}>
                  {nets.map(net => (
                    <div key={net}>{renderWidget(net)}</div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}


        {/* Studios Sociaux - Pour visiteurs uniquement */}
        {!user && !isGuest && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">🎨</span>
              Studios de création
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Studio Instagram */}
              <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 rounded-xl border border-pink-200 p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                    <span className="text-lg">📷</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">Instagram</h3>
                    <p className="text-xs text-neutral-600">Posts & Stories</p>
                  </div>
                </div>
                <p className="text-xs text-neutral-700 mb-3">
                  Créez et publiez automatiquement sur Instagram.
                </p>
                <button onClick={handleStartFree} className="mt-auto w-full px-3 py-2 text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all">
                  Essayer gratuitement
                </button>
              </div>

              {/* Studio TikTok */}
              <div className="bg-gradient-to-br from-cyan-50 via-blue-50 to-purple-50 rounded-xl border border-cyan-200 p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
                    <span className="text-lg">🎵</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">TikTok</h3>
                    <p className="text-xs text-neutral-600">Vidéos virales</p>
                  </div>
                </div>
                <p className="text-xs text-neutral-700 mb-3">
                  Convertissez vos images en vidéos TikTok.
                </p>
                <button onClick={handleStartFree} className="mt-auto w-full px-3 py-2 text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all">
                  Essayer gratuitement
                </button>
              </div>

              {/* Studio LinkedIn */}
              <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-xl border border-blue-200 p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#0077B5] to-blue-600 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">LinkedIn</h3>
                    <p className="text-xs text-neutral-600">Posts pro</p>
                  </div>
                </div>
                <p className="text-xs text-neutral-700 mb-3">
                  Posts professionnels avec IA pour LinkedIn.
                </p>
                <button onClick={handleStartFree} className="mt-auto w-full px-3 py-2 text-sm bg-gradient-to-r from-[#0077B5] to-blue-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all">
                  Essayer gratuitement
                </button>
              </div>

              {/* Studio Twitter/X */}
              <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 rounded-xl border border-neutral-200 p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-neutral-800 to-black rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">X (Twitter)</h3>
                    <p className="text-xs text-neutral-600">Tweets viraux</p>
                  </div>
                </div>
                <p className="text-xs text-neutral-700 mb-3">
                  Tweets percutants avec IA pour maximiser l'impact.
                </p>
                <button onClick={handleJoinTwitterWaitlist} className="mt-auto w-full px-3 py-2 text-sm bg-gradient-to-r from-neutral-800 to-black text-white font-semibold rounded-lg hover:shadow-lg transition-all">
                  Rejoindre la liste prioritaire
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
            videoCount={myVideos.length}
            draftCount={stats.total_instagram_drafts}
            tiktokDraftCount={stats.total_tiktok_drafts}
            linkedinDraftCount={stats.total_linkedin_drafts}
            twitterDraftCount={stats.total_twitter_drafts}
            scheduledCount={scheduledPosts.length}
            visibleNetworks={selectedNetworks}
          />
        </div>

        {/* Contenu principal avec sidebar (drag & drop enabled) */}
        {user ? (
          <DragProvider onDragEnd={handleImageDrop}>
            <div className="flex gap-6">
              {/* Contenu principal */}
              <div className="flex-1 min-w-0">
                <ErrorBoundary>
                  {activeTab === 'all-creations' ? (
                    <AllCreationsTab
                      images={images}
                      videos={myVideos}
                      folders={folders}
                      onRefresh={handleRefreshAll}
                      onToggleFavorite={handleUnifiedToggleFavorite}
                      onTitleEdit={handleUnifiedTitleEdit}
                      onDelete={handleUnifiedDelete}
                      onPublish={handleUnifiedPublish}
                      onDownload={handleUnifiedDownload}
                      onMoveToFolder={handleUnifiedMoveToFolder}
                      onRenameFolder={handleRenameFolder}
                      onDeleteFolder={handleDeleteFolder}
                    />
                  ) : activeTab === 'images' ? (
                    loadingImages ? (
                      <LoadingSkeleton />
                    ) : (
                      <MyImagesTab
                        images={images}
                        user={user}
                        isGuest={isGuest}
                        onRefresh={loadImages}
                        onDelete={deleteImage}
                        onToggleFavorite={toggleFavorite}
                        onPublishToInstagram={(image) => openPlatformChoiceModal(image)}
                        onPublishToTikTok={(image) => openTikTokModalForImage(image)}
                        onTitleEdit={handleTitleEdit}
                        onDownload={downloadImage}
                        onSchedule={openScheduleModal}
                        onMoveToFolder={(image) => setItemToMoveToFolder({ id: image.id, type: 'image' })}
                      />
                    )
                  ) : activeTab === 'videos' ? (
                    <MyVideosTab
                      videos={myVideos}
                      onRefresh={loadMyVideos}
                      onDelete={handleDeleteVideo}
                      onToggleFavorite={handleToggleVideoFavorite}
                      onPublishToTikTok={openPlatformChoiceModalForVideo}
                      onTitleEdit={handleVideoTitleEdit}
                      onMoveToFolder={(video) => setItemToMoveToFolder({ id: video.id, type: 'video' })}
                    />
                  ) : activeTab === 'drafts' ? (
                    <InstagramDraftsTab
                      drafts={instagramDrafts}
                      onEdit={editInstagramDraft}
                      onDelete={deleteInstagramDraft}
                      onSchedule={scheduleInstagramDraft}
                      onBackToImages={() => setActiveTab('images')}
                      onPrepareInstagram={() => setShowInstagramModal(true)}
                      onPrepareTikTok={() => setShowTikTokModal(true)}
                    />
                  ) : activeTab === 'tiktok-drafts' ? (
                    <TikTokDraftsTab
                      drafts={tiktokDrafts}
                      onEdit={editTikTokDraft}
                      onDelete={deleteTikTokDraft}
                      onSchedule={scheduleTikTokDraft}
                      onBackToImages={() => setActiveTab('images')}
                      onRefresh={loadTikTokDrafts}
                      onPrepareInstagram={() => setShowInstagramModal(true)}
                      onPrepareTikTok={() => setShowTikTokModal(true)}
                    />
                  ) : activeTab === 'linkedin-drafts' ? (
                    <LinkedInDraftsTab
                      drafts={linkedinDrafts}
                      onEdit={editLinkedInDraft}
                      onDelete={deleteLinkedInDraft}
                      onPrepareLinkedIn={() => setShowLinkedInModal(true)}
                      linkedinConnected={isLinkedInConnected}
                      onPublish={handlePublishToLinkedIn}
                    />
                  ) : activeTab === 'twitter-drafts' ? (
                    <TwitterDraftsTab
                      drafts={twitterDrafts}
                      onEdit={editTwitterDraft}
                      onDelete={deleteTwitterDraft}
                      onPrepareTwitter={() => setShowTwitterModal(true)}
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
            {activeTab === 'all-creations' ? (
              <AllCreationsTab
                images={images}
                videos={myVideos}
                folders={[]}
                onRefresh={() => {}}
                onToggleFavorite={(id, type, isFavorite) => toggleFavorite(id, !isFavorite)}
                onTitleEdit={(id, type, newTitle) => handleTitleEdit(id, newTitle)}
                onDelete={(id, type) => deleteImage(id)}
                onPublish={(item) => {
                  if (item.type === 'image') {
                    openPlatformChoiceModal(images.find(img => img.id === item.id)!);
                  } else if (item.type === 'video') {
                    openPlatformChoiceModalForVideo(myVideos.find(v => v.id === item.id)!);
                  }
                }}
                onDownload={handleUnifiedDownload}
                onMoveToFolder={async () => {
                  alert('Connectez-vous pour organiser vos créations en dossiers');
                }}
              />
            ) : activeTab === 'images' ? (
              loadingImages ? (
                <LoadingSkeleton />
              ) : (
                <MyImagesTab
                  images={images}
                  user={user}
                  isGuest={isGuest}
                  onRefresh={loadImages}
                  onDelete={deleteImage}
                  onToggleFavorite={toggleFavorite}
                  onPublishToInstagram={(image) => openPlatformChoiceModal(image)}
                  onPublishToTikTok={(image) => openTikTokModalForImage(image)}
                  onTitleEdit={handleTitleEdit}
                  onDownload={downloadImage}
                  onSchedule={openScheduleModal}
                  onMoveToFolder={(image) => setItemToMoveToFolder({ id: image.id, type: 'image' })}
                />
              )
            ) : activeTab === 'videos' ? (
              <MyVideosTab
                videos={myVideos}
                onRefresh={() => {}}
                onDelete={() => {}}
                onToggleFavorite={() => {}}
                onPublishToTikTok={(video) => openPlatformChoiceModalForVideo(video)}
                onTitleEdit={() => {}}
                onMoveToFolder={(video) => setItemToMoveToFolder({ id: video.id, type: 'video' })}
              />
            ) : activeTab === 'drafts' ? (
              <InstagramDraftsTab
                drafts={[]}
                onEdit={editInstagramDraft}
                onDelete={deleteInstagramDraft}
                onSchedule={scheduleInstagramDraft}
                onBackToImages={() => setActiveTab('images')}
                onPrepareInstagram={() => setShowInstagramModal(true)}
                onPrepareTikTok={() => setShowTikTokModal(true)}
              />
            ) : activeTab === 'tiktok-drafts' ? (
              <TikTokDraftsTab
                drafts={[]}
                onEdit={editTikTokDraft}
                onDelete={deleteTikTokDraft}
                onSchedule={scheduleTikTokDraft}
                onBackToImages={() => setActiveTab('images')}
                onPrepareInstagram={() => setShowInstagramModal(true)}
                onPrepareTikTok={() => setShowTikTokModal(true)}
              />
            ) : activeTab === 'linkedin-drafts' ? (
              <LinkedInDraftsTab
                drafts={[]}
                onEdit={editLinkedInDraft}
                onDelete={deleteLinkedInDraft}
                onPrepareLinkedIn={() => setShowLinkedInModal(true)}
                linkedinConnected={isLinkedInConnected}
                onPublish={handlePublishToLinkedIn}
              />
            ) : activeTab === 'twitter-drafts' ? (
              <TwitterDraftsTab
                drafts={[]}
                onEdit={editTwitterDraft}
                onDelete={deleteTwitterDraft}
                onPrepareTwitter={() => setShowTwitterModal(true)}
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
          video={selectedVideoForInsta || undefined}
          videos={myVideos}
          onClose={() => {
            setShowInstagramModal(false);
            setSelectedImageForInsta(null);
            setSelectedVideoForInsta(null);
            setDraftCaptionToEdit(undefined);
            setDraftHashtagsToEdit(undefined);
          }}
          onSave={saveInstagramDraft}
          draftCaption={draftCaptionToEdit}
          draftHashtags={draftHashtagsToEdit}
        />
      )}

      {/* Modal TikTok */}
      {showTikTokModal && (
        <TikTokModal
          image={selectedImageForTikTok || undefined}
          images={images}
          video={selectedVideoForTikTok || undefined}
          videos={myVideos}
          onClose={() => {
            setShowTikTokModal(false);
            setSelectedImageForTikTok(null);
            setSelectedVideoForTikTok(null);
            setDraftTikTokCaptionToEdit(undefined);
            setDraftTikTokHashtagsToEdit(undefined);
          }}
          onPublishSuccess={async () => {
            // Rafraîchir les posts TikTok après publication réussie
            await loadTikTokPosts();
            // Rafraîchir le widget TikTok pour afficher la nouvelle publication
            setTiktokWidgetRefreshTrigger(prev => prev + 1);
          }}
          onSave={saveTikTokDraft}
          draftCaption={draftTikTokCaptionToEdit}
          draftHashtags={draftTikTokHashtagsToEdit}
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

      {/* Modal Ranger dans un dossier */}
      {itemToMoveToFolder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setItemToMoveToFolder(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-neutral-900 mb-4">Ranger dans un dossier</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <button
                onClick={async () => {
                  await handleUnifiedMoveToFolder(itemToMoveToFolder.id, itemToMoveToFolder.type, null);
                  setItemToMoveToFolder(null);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 text-sm text-neutral-600"
              >
                Sans dossier
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={async () => {
                    await handleUnifiedMoveToFolder(itemToMoveToFolder.id, itemToMoveToFolder.type, folder.id);
                    setItemToMoveToFolder(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 text-sm flex items-center gap-2"
                >
                  <span>{folder.icon || '📁'}</span>
                  <span className="font-medium text-neutral-900">{folder.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setItemToMoveToFolder(null)}
              className="mt-4 w-full px-3 py-2 rounded-lg border border-neutral-300 text-neutral-600 text-sm hover:bg-neutral-50"
            >
              Annuler
            </button>
          </div>
        </div>
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

      {/* Modal LinkedIn */}
      {showLinkedInModal && (
        <LinkedInModal
          image={selectedImageForLinkedIn || undefined}
          images={images}
          video={selectedVideoForLinkedIn || undefined}
          videos={myVideos}
          onClose={() => {
            setShowLinkedInModal(false);
            setSelectedImageForLinkedIn(null);
            setSelectedVideoForLinkedIn(null);
            setDraftLinkedInCaptionToEdit(undefined);
            setDraftLinkedInHashtagsToEdit(undefined);
          }}
          onSave={saveLinkedInDraft}
          draftCaption={draftLinkedInCaptionToEdit}
          draftHashtags={draftLinkedInHashtagsToEdit}
          linkedinConnected={isLinkedInConnected}
          onPublish={handlePublishLinkedInFromModal}
        />
      )}

      {/* Modal Twitter/X */}
      {showTwitterModal && (
        <TwitterModal
          image={selectedImageForTwitter || undefined}
          images={images}
          video={selectedVideoForTwitter || undefined}
          videos={myVideos}
          onClose={() => {
            setShowTwitterModal(false);
            setSelectedImageForTwitter(null);
            setSelectedVideoForTwitter(null);
            setDraftTwitterCaptionToEdit(undefined);
            setDraftTwitterHashtagsToEdit(undefined);
          }}
          onSave={saveTwitterDraft}
          draftCaption={draftTwitterCaptionToEdit}
          draftHashtags={draftTwitterHashtagsToEdit}
        />
      )}

      {/* Modal Choix de Plateforme (pour les images de la galerie) */}
      {showPlatformChoiceModal && (
        <PlatformChoiceModal
          onClose={() => setShowPlatformChoiceModal(false)}
          onSelectInstagram={handleSelectInstagram}
          onSelectTikTok={handleSelectTikTok}
          onSelectLinkedIn={handleSelectLinkedIn}
          onSelectTwitter={handleSelectTwitter}
        />
      )}
    </main>
  );
}

// Wrapper avec Suspense pour Next.js 15
export default function LibraryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-neutral-600">Chargement...</p>
        </div>
      </div>
    }>
      <LibraryContent />
    </Suspense>
  );
}
