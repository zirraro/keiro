import { useState, useEffect } from 'react';
import { InstagramIcon, XIcon } from './Icons';
import { supabaseBrowser } from '@/lib/supabase/client';
import ErrorSupportModal from './ErrorSupportModal';

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

interface InstagramModalProps {
  image?: SavedImage;
  images?: SavedImage[];
  onClose: () => void;
  onSave: (image: SavedImage, caption: string, hashtags: string[], status: 'draft' | 'ready') => Promise<void>;
  draftCaption?: string;
  draftHashtags?: string[];
}

export default function InstagramModal({ image, images, onClose, onSave, draftCaption, draftHashtags }: InstagramModalProps) {
  const [caption, setCaption] = useState(draftCaption || '');
  const [hashtags, setHashtags] = useState<string[]>(draftHashtags || []);
  const [hashtagInput, setHashtagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isInstagramConnected, setIsInstagramConnected] = useState(false);
  const [instagramUsername, setInstagramUsername] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(true);

  // États pour le modal d'erreur avec support
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorTitle, setErrorTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorTechnical, setErrorTechnical] = useState('');

  // Nouveaux états pour la galerie
  const [availableImages, setAvailableImages] = useState<SavedImage[]>(images || []);
  const [selectedImage, setSelectedImage] = useState<SavedImage | null>(image || null);
  const [loadingImages, setLoadingImages] = useState(!images);

  // Angle/ton de la description
  const [contentAngle, setContentAngle] = useState('informatif');

  // Pré-remplir caption et hashtags depuis le brouillon
  useEffect(() => {
    if (draftCaption !== undefined) {
      setCaption(draftCaption);
    }
    if (draftHashtags !== undefined) {
      setHashtags(draftHashtags);
    }
  }, [draftCaption, draftHashtags]);

  // Vérifier si l'utilisateur a connecté son compte Instagram
  useEffect(() => {
    const checkInstagramConnection = async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('instagram_business_account_id, instagram_username')
            .eq('id', user.id)
            .single();

          if (profile?.instagram_business_account_id) {
            setIsInstagramConnected(true);
            setInstagramUsername(profile.instagram_username);
          }
        }
      } catch (error) {
        console.error('[InstagramModal] Error checking Instagram connection:', error);
      } finally {
        setCheckingConnection(false);
      }
    };

    checkInstagramConnection();
  }, []);

  // Charger images si pas passées en props
  useEffect(() => {
    const loadImages = async () => {
      // Si les images sont déjà passées en props, ne pas les charger
      if (images && images.length > 0) {
        setLoadingImages(false);
        if (!selectedImage && images.length > 0) {
          setSelectedImage(images[0]);
        }
        return;
      }

      setLoadingImages(true);
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return;

        // Récupérer images du même dossier OU toutes si pas de dossier
        const query = supabase
          .from('saved_images')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false})
          .limit(20);

        if (image?.folder_id) {
          query.eq('folder_id', image.folder_id);
        }

        const { data: loadedImages } = await query;
        setAvailableImages(loadedImages || []);

        // Sélectionner la première image si aucune n'est sélectionnée
        if (!selectedImage && loadedImages && loadedImages.length > 0) {
          setSelectedImage(loadedImages[0]);
        }
      } catch (error) {
        console.error('[InstagramModal] Error loading images:', error);
      } finally {
        setLoadingImages(false);
      }
    };

    loadImages();
  }, [image?.folder_id, images]);

  const addHashtag = () => {
    const tag = hashtagInput.trim();
    if (tag && !hashtags.includes(tag)) {
      setHashtags([...hashtags, tag.startsWith('#') ? tag : `#${tag}`]);
      setHashtagInput('');
    }
  };

  const removeHashtag = (tag: string) => {
    setHashtags(hashtags.filter(t => t !== tag));
  };

  const handleSave = async (status: 'draft' | 'ready') => {
    if (!selectedImage) {
      alert('Veuillez sélectionner une image');
      return;
    }
    setSaving(true);
    try {
      await onSave(selectedImage, caption, hashtags, status);
    } finally {
      setSaving(false);
    }
  };

  const suggestHashtag = (tag: string) => {
    const fullTag = tag.startsWith('#') ? tag : `#${tag}`;
    if (!hashtags.includes(fullTag)) {
      setHashtags([...hashtags, fullTag]);
    }
  };

  const handleSuggest = async () => {
    if (!selectedImage) {
      alert('Veuillez sélectionner une image');
      return;
    }

    setSuggesting(true);
    try {
      const response = await fetch('/api/instagram/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: selectedImage.image_url,
          imageTitle: selectedImage.title || selectedImage.news_title,
          newsTitle: selectedImage.news_title,
          newsCategory: selectedImage.news_category,
          contentAngle: contentAngle
        })
      });

      const data = await response.json();

      if (data.ok) {
        setCaption(data.caption);
        setHashtags(data.hashtags);
      } else {
        alert(data.error || 'Erreur lors de la génération des suggestions');
      }
    } catch (error) {
      console.error('[InstagramModal] Error suggesting:', error);
      alert('Erreur lors de la génération des suggestions');
    } finally {
      setSuggesting(false);
    }
  };

  const handlePublishNow = async () => {
    if (!selectedImage) {
      alert('Veuillez sélectionner une image');
      return;
    }

    if (!caption.trim()) {
      alert('Veuillez écrire une description pour votre post');
      return;
    }

    if (!isInstagramConnected) {
      alert('Veuillez d\'abord connecter votre compte Instagram Business');
      return;
    }

    const confirm = window.confirm(
      '🚀 Publier maintenant sur Instagram ?\n\nVotre post sera publié immédiatement sur votre compte Instagram Business.'
    );

    if (!confirm) return;

    setPublishing(true);
    try {
      const response = await fetch('/api/library/instagram/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: selectedImage.image_url,
          caption,
          hashtags
        })
      });

      const data = await response.json();

      if (data.ok) {
        // Message de succès plus engageant
        const successMessage = `🎉 Post publié avec succès sur Instagram !\n\n✅ Votre contenu est maintenant visible\n📊 Il apparaîtra dans votre feed et profil\n💬 Les interactions commenceront bientôt\n\nFélicitations ! 🚀`;
        alert(successMessage);

        // Proposer d'ouvrir Instagram pour voir le post
        const openPost = window.confirm('Voulez-vous ouvrir Instagram pour voir votre post ?');
        if (openPost) {
          const instagramUrl = data.post?.permalink || `https://www.instagram.com/${instagramUsername}/`;
          window.open(instagramUrl, '_blank');
        }

        onClose();
      } else {
        throw new Error(data.error || 'Erreur lors de la publication');
      }
    } catch (error: any) {
      console.error('[InstagramModal] Error publishing:', error);

      // Afficher le modal d'erreur avec support
      setErrorTitle('Erreur de publication Instagram');
      setErrorMessage(error.message || 'Une erreur est survenue lors de la publication sur Instagram');
      setErrorTechnical(JSON.stringify({
        error: error.message,
        imageUrl: selectedImage?.image_url,
        captionLength: caption.length,
        hashtagCount: hashtags.length
      }, null, 2));
      setShowErrorModal(true);
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishStory = async () => {
    if (!selectedImage) {
      alert('Veuillez sélectionner une image');
      return;
    }

    if (!isInstagramConnected) {
      alert('Veuillez d\'abord connecter votre compte Instagram Business');
      return;
    }

    const confirm = window.confirm(
      '📱 Publier en Story Instagram ?\n\nVotre visuel sera publié en story (24h) sur votre compte Instagram Business.\n\nNote: Les stories ne supportent pas les descriptions.'
    );

    if (!confirm) return;

    setPublishing(true);
    try {
      const response = await fetch('/api/library/instagram/publish-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: selectedImage.image_url
        })
      });

      const data = await response.json();

      if (data.ok) {
        // Message de succès plus engageant pour la story
        const confirmMessage = `🎉 Story publiée avec succès sur Instagram !\n\n✨ Votre story est maintenant visible pendant 24h\n📱 Ouvrez l'app Instagram pour la voir en direct\n👀 Elle apparaîtra dans le cercle de votre profil\n\nFélicitations ! 🚀`;
        alert(confirmMessage);

        // Ouvrir Instagram dans un nouvel onglet (si possible)
        const openInstagram = window.confirm('Voulez-vous ouvrir Instagram pour voir votre story ?');
        if (openInstagram) {
          window.open(`https://www.instagram.com/${instagramUsername}/`, '_blank');
        }

        onClose();
      } else {
        throw new Error(data.error || 'Erreur lors de la publication de la story');
      }
    } catch (error: any) {
      console.error('[InstagramModal] Error publishing story:', error);

      // Afficher le modal d'erreur avec support
      setErrorTitle('Erreur de publication Instagram Story');
      setErrorMessage(error.message || 'Une erreur est survenue lors de la publication de la story sur Instagram');
      setErrorTechnical(JSON.stringify({
        error: error.message,
        imageUrl: selectedImage?.image_url
      }, null, 2));
      setShowErrorModal(true);
    } finally {
      setPublishing(false);
    }
  };

  const handleConnectInstagram = () => {
    window.location.href = '/api/auth/instagram-oauth';
  };

  // Si aucune image sélectionnée et chargement terminé, ne rien afficher
  if (!selectedImage && !loadingImages && availableImages.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mb-4">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
          </div>
          <h3 className="text-lg font-bold text-neutral-900 mb-2">Aucune image disponible</h3>
          <p className="text-neutral-600 text-sm mb-6">
            Ajoutez des images à votre galerie pour créer des posts Instagram
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  // Pendant le chargement
  if (loadingImages && !selectedImage) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-pulse mb-4">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
          </div>
          <p className="text-neutral-600 text-sm">Chargement des images...</p>
        </div>
      </div>
    );
  }

  // Si on arrive ici, selectedImage est forcément non-null (ou bien il y a des images disponibles)
  // TypeScript ne le comprend pas, donc on doit asserter
  if (!selectedImage) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="flex items-center gap-2 sm:gap-3">
            <InstagramIcon className="w-6 h-6 sm:w-8 sm:h-8 text-pink-600" />
            <h2 className="text-lg sm:text-2xl font-bold text-neutral-900">Préparer un post Instagram</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/50 transition-colors"
            aria-label="Fermer"
          >
            <XIcon className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-600" />
          </button>
        </div>

        {/* NOUVEAU LAYOUT 3 COLONNES */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

          {/* GALERIE D'IMAGES - SIDEBAR GAUCHE (Desktop seulement) */}
          <div className="hidden md:block md:w-24 lg:w-32 border-r border-neutral-200 overflow-y-auto bg-neutral-50">
            <div className="p-2 space-y-2">
              <p className="text-xs font-semibold text-neutral-500 px-2 mb-2">
                Sélectionner une image
              </p>
              {loadingImages ? (
                // Skeleton loading
                [1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="aspect-square bg-neutral-200 rounded animate-pulse"></div>
                ))
              ) : (
                availableImages.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    className={`
                      w-full aspect-square rounded-lg overflow-hidden transition-all
                      ${selectedImage?.id === img.id
                        ? 'ring-2 ring-pink-500 scale-105 shadow-lg'
                        : 'ring-1 ring-neutral-300 hover:ring-pink-300 hover:scale-102'
                      }
                    `}
                    title={img.title || img.news_title || 'Image'}
                  >
                    <img
                      src={img.thumbnail_url || img.image_url}
                      alt={img.title || 'Image'}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))
              )}
              {!loadingImages && availableImages.length === 0 && (
                <p className="text-xs text-neutral-400 text-center py-4">
                  Aucune autre image
                </p>
              )}
            </div>
          </div>

          {/* CARROUSEL MOBILE - En haut sur mobile seulement */}
          <div className="md:hidden border-b border-neutral-200 bg-neutral-50 p-3">
            <p className="text-xs font-semibold text-neutral-600 mb-2">Sélectionner une image</p>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-3 px-3">
              {loadingImages ? (
                [1, 2, 3, 4].map(i => (
                  <div key={i} className="flex-shrink-0 w-20 h-20 bg-neutral-200 rounded-lg animate-pulse"></div>
                ))
              ) : (
                availableImages.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    className={`
                      flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden transition-all
                      ${selectedImage?.id === img.id
                        ? 'ring-2 ring-pink-500 shadow-lg'
                        : 'ring-1 ring-neutral-300'
                      }
                    `}
                  >
                    <img
                      src={img.thumbnail_url || img.image_url}
                      alt={img.title || 'Image'}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* PREVIEW + FORM - RESTE À DROITE */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

            {/* PREVIEW STICKY - Desktop seulement */}
            {selectedImage && (
              <div className="hidden md:block md:w-1/2 md:overflow-y-auto md:p-6 bg-neutral-50">
                <div className="md:sticky md:top-0">
                  <div className="aspect-square bg-white rounded-xl overflow-hidden border-2 border-neutral-200 shadow-lg max-h-[380px] mx-auto">
                    <img
                      src={selectedImage.image_url}
                      alt={selectedImage.title || selectedImage.news_title || 'Preview'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {selectedImage.title && (
                    <p className="mt-2 text-sm font-medium text-neutral-700 text-center">
                      {selectedImage.title}
                    </p>
                  )}
                  {selectedImage.news_category && (
                    <p className="mt-1 text-xs text-neutral-500 text-center">
                      {selectedImage.news_category}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* FORM SCROLLABLE - Prend toute la hauteur sur mobile */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Sélecteur d'angle/ton */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Quel angle voulez-vous pour votre post ?
                </label>
                <select
                  value={contentAngle}
                  onChange={(e) => setContentAngle(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white"
                >
                  <option value="informatif">📰 Informatif - Donner des faits et informations</option>
                  <option value="emotionnel">❤️ Émotionnel - Toucher les émotions</option>
                  <option value="inspirant">✨ Inspirant - Motiver et encourager</option>
                  <option value="humoristique">😄 Humoristique - Faire rire</option>
                  <option value="professionnel">💼 Professionnel - Sérieux et expert</option>
                  <option value="storytelling">📖 Storytelling - Raconter une histoire</option>
                  <option value="educatif">🎓 Éducatif - Enseigner quelque chose</option>
                  <option value="provocateur">🔥 Provocateur - Questionner et débattre</option>
                </select>
              </div>

              {/* Bouton Suggérer IA */}
              <button
                onClick={handleSuggest}
                disabled={suggesting}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                  suggesting
                    ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {suggesting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Suggestion en cours...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <span>✨ Suggérer description et hashtags</span>
                  </>
                )}
              </button>

              {/* Caption textarea */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Description du post
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full h-40 px-4 py-3 border border-neutral-300 rounded-lg resize-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="Écrivez une description engageante pour votre post..."
                  maxLength={2200}
                />
                <p className="mt-1 text-xs text-neutral-500 text-right">
                  {caption.length} / 2200 caractères
                </p>
              </div>

              {/* Hashtags section */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Hashtags
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                    className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="#hashtag"
                  />
                  <button
                    onClick={addHashtag}
                    className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors font-medium"
                  >
                    Ajouter
                  </button>
                </div>

                {/* Liste hashtags */}
                <div className="flex flex-wrap gap-2">
                  {hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-full text-sm"
                    >
                      {tag}
                      <button onClick={() => removeHashtag(tag)} className="hover:text-red-600 font-bold">
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                {hashtags.length === 0 && (
                  <p className="text-xs text-neutral-500 mt-2">
                    Aucun hashtag ajouté
                  </p>
                )}
                <p className="text-xs text-neutral-500 mt-2">
                  {hashtags.length} / 30 hashtags max
                </p>

                {/* Suggestions */}
                {hashtags.length < 30 && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700 font-medium mb-2">💡 Suggestions</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedImage.news_category && (
                        <button
                          onClick={() => suggestHashtag(selectedImage.news_category!.toLowerCase().replace(/\s/g, ''))}
                          className="text-xs px-2 py-1 bg-white rounded hover:bg-blue-100 text-blue-600 border border-blue-200"
                        >
                          #{selectedImage.news_category.toLowerCase().replace(/\s/g, '')}
                        </button>
                      )}
                      {['marketing', 'business', 'instagram', 'viral', 'trend2026'].map(tag => (
                        <button
                          key={tag}
                          onClick={() => suggestHashtag(tag)}
                          className="text-xs px-2 py-1 bg-white rounded hover:bg-blue-100 text-blue-600 border border-blue-200"
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER - Boutons action */}
        <div className="border-t p-4 sm:p-6 bg-neutral-50">
          {/* Statut de connexion Instagram */}
          {!checkingConnection && (
            <div className="mb-4">
              {isInstagramConnected ? (
                <div className="flex items-center justify-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3 border border-green-200">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Connecté à Instagram : <strong>@{instagramUsername}</strong></span>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200 mb-3">
                    ⚠️ Connectez votre compte Instagram Business pour publier automatiquement
                  </p>
                  <button
                    onClick={handleConnectInstagram}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 mx-auto"
                  >
                    <InstagramIcon className="w-5 h-5" />
                    <span>Connecter Instagram</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="px-4 sm:px-6 py-2 sm:py-3 border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-100 transition-colors text-sm sm:text-base"
            >
              Annuler
            </button>
            <button
              onClick={() => handleSave('draft')}
              disabled={saving || !caption.trim()}
              className={`flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2 text-sm sm:text-base ${
                saving || !caption.trim()
                  ? 'bg-neutral-400 cursor-not-allowed'
                  : 'bg-neutral-700 hover:bg-neutral-800'
              }`}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Sauvegarde...</span>
                </>
              ) : (
                <span>Brouillon</span>
              )}
            </button>

            {/* Boutons de publication Instagram (seulement si connecté) */}
            {isInstagramConnected ? (
              <>
                <button
                  onClick={handlePublishNow}
                  disabled={publishing || !caption.trim()}
                  className={`flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm ${
                    publishing || !caption.trim()
                      ? 'bg-neutral-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-xl'
                  }`}
                >
                  {publishing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Publication...</span>
                    </>
                  ) : (
                    <>
                      <InstagramIcon className="w-4 h-4" />
                      <span>Post</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handlePublishStory}
                  disabled={publishing}
                  className={`flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm ${
                    publishing
                      ? 'bg-neutral-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-pink-600 to-orange-500 hover:from-pink-700 hover:to-orange-600 shadow-lg hover:shadow-xl'
                  }`}
                >
                  {publishing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Publication...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                      <span>Story</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={() => handleSave('ready')}
                disabled={saving || !caption.trim()}
                className={`flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2 text-sm sm:text-base ${
                  saving || !caption.trim()
                    ? 'bg-neutral-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                }`}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Sauvegarde...</span>
                  </>
                ) : (
                  <>
                    <InstagramIcon className="w-4 sm:w-5 h-4 sm:h-5" />
                    <span>Prêt à publier</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal d'erreur avec support */}
      <ErrorSupportModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title={errorTitle}
        errorMessage={errorMessage}
        technicalError={errorTechnical}
      />
    </div>
  );
}
