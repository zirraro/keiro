'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

// Simple SVG Icons
const BookmarkIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
  </svg>
);

const FolderIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const MagnifyingGlassIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const PhotoIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

const HeartIcon = ({ className, filled }: { className?: string; filled?: boolean }) => (
  <svg className={className} fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

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
  folder_id?: string;
};

type Folder = {
  id: string;
  name: string;
  icon: string;
  color: string;
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
  const [showInstagramWorkspace, setShowInstagramWorkspace] = useState(false);
  const [selectedImageForInsta, setSelectedImageForInsta] = useState<SavedImage | null>(null);
  const [instaCaption, setInstaCaption] = useState('');
  const [instaHashtags, setInstaHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [savingInstaDraft, setSavingInstaDraft] = useState(false);

  // Charger l'utilisateur
  useEffect(() => {
    const loadUser = async () => {
      console.log('[Library] Loading user...');
      const { data: { user }, error } = await supabase.auth.getUser();
      console.log('[Library] User result:', { user, error });
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

  // Charger les images et dossiers
  useEffect(() => {
    if (!user) return; // Mode visiteur déjà géré dans loadUser

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
      } catch (error) {
        console.error('[Library] Error loading library:', error);
      }
    };

    loadLibrary();
  }, [user]);

  // Fonction pour charger les images
  const loadImages = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedFolder) params.append('folderId', selectedFolder);
      if (searchQuery) params.append('search', searchQuery);
      if (showFavoritesOnly) params.append('favoritesOnly', 'true');

      const res = await fetch(`/api/library/images?${params}`);
      const data = await res.json();

      if (data.ok) {
        setImages(data.images);
        setStats(prev => ({
          ...prev,
          total_images: data.total,
          total_favorites: data.images.filter((img: SavedImage) => img.is_favorite).length
        }));
      }
    } catch (error) {
      console.error('[Library] Error loading images:', error);
    }
  };

  // Recharger quand les filtres changent
  useEffect(() => {
    if (user) {
      loadImages();
    }
  }, [selectedFolder, searchQuery, showFavoritesOnly, user]);

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
    if (!confirm('Supprimer cette image de votre librairie ?')) return;

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

  // Ouvrir le workspace Instagram pour une image
  const openInstagramWorkspace = (image: SavedImage) => {
    setSelectedImageForInsta(image);
    setInstaCaption('');
    setInstaHashtags([]);
    setHashtagInput('');
    setShowInstagramWorkspace(true);
  };

  // Ajouter un hashtag
  const addHashtag = () => {
    const tag = hashtagInput.trim();
    if (tag && !instaHashtags.includes(tag)) {
      setInstaHashtags([...instaHashtags, tag.startsWith('#') ? tag : `#${tag}`]);
      setHashtagInput('');
    }
  };

  // Retirer un hashtag
  const removeHashtag = (tag: string) => {
    setInstaHashtags(instaHashtags.filter(t => t !== tag));
  };

  // Sauvegarder le brouillon Instagram
  const saveInstagramDraft = async () => {
    if (!selectedImageForInsta) return;

    setSavingInstaDraft(true);

    try {
      const response = await fetch('/api/library/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedImageId: selectedImageForInsta.id,
          caption: instaCaption,
          hashtags: instaHashtags
        })
      });

      const data = await response.json();

      if (data.ok) {
        alert('✅ Brouillon Instagram sauvegardé !');
        setShowInstagramWorkspace(false);
      } else {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error: any) {
      console.error('[Library] Error saving Instagram draft:', error);
      alert(error.message || 'Erreur lors de la sauvegarde du brouillon');
    } finally {
      setSavingInstaDraft(false);
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
          <p className="text-neutral-600">Chargement de votre librairie...</p>
        </div>
      </main>
    );
  }

  // Mode visiteur : afficher la librairie de démo (pas de return early)

  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Bandeau Mode Visiteur */}
        {!user && (
          <div className="mb-6 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-6 text-white shadow-lg">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-center md:text-left">
                <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                  <PhotoIcon className="w-5 h-5" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Mode Visiteur</span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold mb-1">Découvrez votre futur espace de travail</h2>
                <p className="text-blue-100 text-sm md:text-base">
                  Connectez-vous pour sauvegarder vos visuels, préparer vos posts Instagram et bien plus encore
                </p>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <a
                  href="/login"
                  className="px-6 py-3 rounded-lg bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-colors shadow-md"
                >
                  Se connecter
                </a>
                <a
                  href="/generate"
                  className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors border-2 border-white"
                >
                  Générer un visuel
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            {user ? 'Ma Librairie' : 'Aperçu de la Librairie'}
          </h1>
          <p className="text-neutral-600">
            {user ? (
              <>{stats.total_images} {stats.total_images > 1 ? 'visuels' : 'visuel'} sauvegardé{stats.total_images > 1 ? 's' : ''}</>
            ) : (
              <>Exemples de visuels générés avec Keiro AI</>
            )}
          </p>
        </div>

        {/* Filtres et recherche */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Recherche */}
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <input
                type="text"
                placeholder="Rechercher dans ma librairie..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filtre dossiers */}
            <select
              value={selectedFolder || ''}
              onChange={(e) => setSelectedFolder(e.target.value || null)}
              className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous les dossiers</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.icon} {folder.name}
                </option>
              ))}
            </select>

            {/* Favoris */}
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
                showFavoritesOnly
                  ? 'border-red-500 bg-red-50 text-red-600'
                  : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <HeartIcon className="w-5 h-5 inline mr-2" filled={showFavoritesOnly} />
              Favoris {stats.total_favorites > 0 && `(${stats.total_favorites})`}
            </button>
          </div>
        </div>

        {/* Aperçu Espace Instagram */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
              <InstagramIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-900">Espace de travail Instagram</h2>
              <p className="text-sm text-neutral-600">Préparez vos posts avec caption et hashtags</p>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-purple-200 p-4">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Colonne gauche : Image de démo */}
              <div>
                <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden border">
                  <img
                    src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=800&fit=crop"
                    alt="Aperçu espace Instagram"
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-sm text-neutral-600 mt-2 text-center">
                  {user ? 'Sélectionnez une image pour commencer' : 'Connectez-vous pour utiliser cette fonctionnalité'}
                </p>
              </div>

              {/* Colonne droite : Aperçu de l'éditeur */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-2">
                    Caption Instagram
                  </label>
                  <div className="relative">
                    <textarea
                      readOnly
                      disabled={!user}
                      placeholder={user ? "Rédigez votre caption ici..." : "Connectez-vous pour utiliser"}
                      className="w-full h-32 px-3 py-2 rounded-lg border border-neutral-300 bg-neutral-50 resize-none text-sm text-neutral-500"
                      value="🚀 Découvrez comment l'IA transforme votre stratégie marketing...\n\n#marketing #digitalmarketing #ai #business"
                    />
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">Limite : 2200 caractères</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-2">
                    Hashtags
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                      #marketing
                    </span>
                    <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                      #digitalmarketing
                    </span>
                    <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                      #ai
                    </span>
                  </div>
                  <input
                    type="text"
                    readOnly
                    disabled={!user}
                    placeholder={user ? "Ajouter un hashtag..." : "Connectez-vous"}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-neutral-50 text-sm"
                  />
                </div>

                {user ? (
                  <button
                    disabled
                    className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold opacity-50 cursor-not-allowed"
                  >
                    Sélectionnez une image pour commencer
                  </button>
                ) : (
                  <a
                    href="/login"
                    className="block w-full px-6 py-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-center hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg"
                  >
                    Connectez-vous pour utiliser
                  </a>
                )}
              </div>
            </div>

            {user && (
              <div className="mt-4 pt-4 border-t border-purple-200">
                <p className="text-sm text-purple-700 text-center">
                  💡 Astuce : Survolez vos images ci-dessous et cliquez sur "Préparer post" pour ouvrir l'éditeur Instagram
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Grille d'images */}
        {images.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
            <PhotoIcon className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-neutral-900 mb-2">
              {searchQuery || selectedFolder || showFavoritesOnly
                ? 'Aucun visuel trouvé'
                : 'Votre librairie est vide'}
            </h3>
            <p className="text-neutral-600 mb-6">
              {searchQuery || selectedFolder || showFavoritesOnly
                ? 'Essayez de modifier vos filtres de recherche'
                : 'Commencez par générer des visuels et sauvegardez-les ici'}
            </p>
            {!searchQuery && !selectedFolder && !showFavoritesOnly && (
              <a
                href="/generate"
                className="inline-block px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Générer mon premier visuel
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((image) => (
              <div
                key={image.id}
                className="group relative bg-white rounded-lg border border-neutral-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Image */}
                <div className="aspect-square bg-neutral-100 relative">
                  <img
                    src={image.thumbnail_url || image.image_url}
                    alt={image.title || image.news_title || 'Visuel'}
                    className="w-full h-full object-cover"
                  />

                  {/* Overlay avec actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
                    {user ? (
                      <>
                        <div className="flex gap-2">
                          <button
                            onClick={() => toggleFavorite(image.id, image.is_favorite)}
                            className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors"
                            title={image.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                          >
                            <HeartIcon className="w-5 h-5 text-red-500" filled={image.is_favorite} />
                          </button>
                          <button
                            onClick={() => downloadImage(image.image_url, image.title || image.news_title)}
                            className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors"
                            title="Télécharger"
                          >
                            <DownloadIcon className="w-5 h-5 text-blue-600" />
                          </button>
                          <button
                            onClick={() => deleteImage(image.id)}
                            className="p-2 rounded-full bg-white/90 hover:bg-white transition-colors"
                            title="Supprimer"
                          >
                            <TrashIcon className="w-5 h-5 text-red-600" />
                          </button>
                        </div>
                        <button
                          onClick={() => openInstagramWorkspace(image)}
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-2 shadow-lg"
                          title="Préparer post Instagram"
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
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {image.title || image.news_title || 'Sans titre'}
                  </p>
                  {image.news_category && (
                    <p className="text-xs text-neutral-500 mt-1">
                      {image.news_category}
                    </p>
                  )}
                  <p className="text-xs text-neutral-400 mt-1">
                    {new Date(image.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats footer */}
        <div className="mt-8 pt-6 border-t border-neutral-200 flex justify-between text-sm text-neutral-500">
          <span>Total: {stats.total_images} visuels</span>
          <span>{stats.total_folders} dossiers • {stats.total_favorites} favoris</span>
        </div>
      </div>

      {/* Modal Workspace Instagram */}
      {showInstagramWorkspace && selectedImageForInsta && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-3">
                <InstagramIcon className="w-8 h-8 text-pink-600" />
                <h2 className="text-2xl font-bold text-neutral-900">Préparer post Instagram</h2>
              </div>
              <button
                onClick={() => setShowInstagramWorkspace(false)}
                className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
              >
                <XIcon className="w-6 h-6 text-neutral-600" />
              </button>
            </div>

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Colonne gauche : Image */}
                <div>
                  <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden border">
                    <img
                      src={selectedImageForInsta.image_url}
                      alt={selectedImageForInsta.title || selectedImageForInsta.news_title || ''}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-sm text-neutral-600 mt-2">
                    {selectedImageForInsta.title || selectedImageForInsta.news_title || 'Sans titre'}
                  </p>
                </div>

                {/* Colonne droite : Formulaire */}
                <div className="space-y-6">
                  {/* Description/Caption */}
                  <div>
                    <label className="block text-sm font-semibold text-neutral-900 mb-2">
                      Description du post
                    </label>
                    <textarea
                      value={instaCaption}
                      onChange={(e) => setInstaCaption(e.target.value)}
                      placeholder="Écrivez une description engageante pour votre post..."
                      className="w-full h-40 px-4 py-3 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                      maxLength={2200}
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      {instaCaption.length} / 2200 caractères
                    </p>
                  </div>

                  {/* Hashtags */}
                  <div>
                    <label className="block text-sm font-semibold text-neutral-900 mb-2">
                      Hashtags
                    </label>
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={hashtagInput}
                        onChange={(e) => setHashtagInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                        placeholder="Ajouter un hashtag..."
                        className="flex-1 px-4 py-2 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-pink-500"
                      />
                      <button
                        onClick={addHashtag}
                        className="px-4 py-2 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 transition-colors"
                      >
                        Ajouter
                      </button>
                    </div>

                    {/* Liste des hashtags */}
                    <div className="flex flex-wrap gap-2">
                      {instaHashtags.map((tag, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-full text-sm"
                        >
                          <span>{tag}</span>
                          <button
                            onClick={() => removeHashtag(tag)}
                            className="hover:text-red-600"
                          >
                            <XIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {instaHashtags.length === 0 && (
                      <p className="text-xs text-neutral-500 mt-2">
                        Aucun hashtag ajouté. Ajoutez-en pour améliorer la visibilité !
                      </p>
                    )}
                    <p className="text-xs text-neutral-500 mt-2">
                      {instaHashtags.length} / 30 hashtags max
                    </p>
                  </div>

                  {/* Suggestion de hashtags (optionnel futur) */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800 font-medium mb-2">💡 Suggestions</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedImageForInsta.news_category && (
                        <button
                          onClick={() => {
                            const tag = `#${selectedImageForInsta.news_category?.toLowerCase().replace(/\s/g, '')}`;
                            if (!instaHashtags.includes(tag)) {
                              setInstaHashtags([...instaHashtags, tag]);
                            }
                          }}
                          className="px-2 py-1 bg-white border border-blue-300 rounded text-xs text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          #{selectedImageForInsta.news_category.toLowerCase().replace(/\s/g, '')}
                        </button>
                      )}
                      {['actualite', 'business', 'entrepreneur', 'marketing', 'reseauxsociaux'].map(tag => (
                        <button
                          key={tag}
                          onClick={() => {
                            const fullTag = `#${tag}`;
                            if (!instaHashtags.includes(fullTag)) {
                              setInstaHashtags([...instaHashtags, fullTag]);
                            }
                          }}
                          className="px-2 py-1 bg-white border border-blue-300 rounded text-xs text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer avec actions */}
            <div className="border-t p-6 bg-neutral-50 flex justify-between items-center">
              <p className="text-sm text-neutral-600">
                Le post sera sauvegardé en brouillon. Vous pourrez le publier plus tard.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowInstagramWorkspace(false)}
                  className="px-6 py-3 border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={saveInstagramDraft}
                  disabled={savingInstaDraft || !instaCaption.trim()}
                  className={`px-6 py-3 rounded-lg font-medium text-white transition-colors flex items-center gap-2 ${
                    savingInstaDraft || !instaCaption.trim()
                      ? 'bg-neutral-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                  }`}
                >
                  {savingInstaDraft ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Sauvegarde...</span>
                    </>
                  ) : (
                    <>
                      <InstagramIcon className="w-5 h-5" />
                      <span>Sauvegarder le brouillon</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
