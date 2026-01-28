'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

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

interface InstagramCarouselModalProps {
  images?: SavedImage[];
  onClose: () => void;
}

export default function InstagramCarouselModal({ images, onClose }: InstagramCarouselModalProps) {
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [isInstagramConnected, setIsInstagramConnected] = useState(false);
  const [instagramUsername, setInstagramUsername] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(true);

  // Galerie et sélection multiple
  const [availableImages, setAvailableImages] = useState<SavedImage[]>(images || []);
  const [selectedImages, setSelectedImages] = useState<SavedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(!images);

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
        console.error('[InstagramCarouselModal] Error checking Instagram connection:', error);
      } finally {
        setCheckingConnection(false);
      }
    };

    checkInstagramConnection();
  }, []);

  // Charger images si pas passées en props
  useEffect(() => {
    const loadImages = async () => {
      if (images && images.length > 0) {
        setLoadingImages(false);
        return;
      }

      setLoadingImages(true);
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return;

        const { data: loadedImages } = await supabase
          .from('saved_images')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        setAvailableImages(loadedImages || []);
      } catch (error) {
        console.error('[InstagramCarouselModal] Error loading images:', error);
      } finally {
        setLoadingImages(false);
      }
    };

    loadImages();
  }, [images]);

  const toggleImageSelection = (image: SavedImage) => {
    if (selectedImages.find(img => img.id === image.id)) {
      setSelectedImages(selectedImages.filter(img => img.id !== image.id));
    } else {
      if (selectedImages.length >= 10) {
        alert('Maximum 10 images pour un carrousel Instagram');
        return;
      }
      setSelectedImages([...selectedImages, image]);
    }
  };

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

  const suggestHashtag = (tag: string) => {
    const fullTag = tag.startsWith('#') ? tag : `#${tag}`;
    if (!hashtags.includes(fullTag)) {
      setHashtags([...hashtags, fullTag]);
    }
  };

  const handlePublishCarousel = async () => {
    if (selectedImages.length < 2) {
      alert('Veuillez sélectionner au moins 2 images (max 10)');
      return;
    }

    if (!caption.trim()) {
      alert('Veuillez écrire une description pour votre carrousel Instagram');
      return;
    }

    if (!isInstagramConnected) {
      alert('Veuillez d\'abord connecter votre compte Instagram');
      return;
    }

    const confirm = window.confirm(
      `📷 Publier le carrousel sur Instagram ?\n\n` +
      `📸 ${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''} sélectionnée${selectedImages.length > 1 ? 's' : ''}\n` +
      `🚀 Le carrousel sera publié immédiatement sur Instagram\n\n` +
      `Continuer ?`
    );

    if (!confirm) return;

    setPublishing(true);
    try {
      const response = await fetch('/api/library/instagram/publish-carousel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageUrls: selectedImages.map(img => img.image_url),
          caption,
          hashtags
        })
      });

      const data = await response.json();

      if (data.ok) {
        const successMessage = `🎉 Carrousel publié avec succès sur Instagram !\n\n✅ ${data.post.imageCount} images publiées\n💬 Les interactions commenceront bientôt\n\nFélicitations ! 🚀`;
        alert(successMessage);

        if (data.post.permalink) {
          const openPost = window.confirm('Voulez-vous ouvrir Instagram pour voir votre carrousel ?');
          if (openPost) {
            window.open(data.post.permalink, '_blank');
          }
        }

        onClose();
      } else {
        throw new Error(data.error || 'Erreur lors de la publication');
      }
    } catch (error: any) {
      console.error('[InstagramCarouselModal] Error publishing:', error);
      alert(`❌ Erreur lors de la publication:\n${error.message || 'Une erreur est survenue'}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleConnectInstagram = () => {
    window.location.href = '/api/auth/instagram-oauth';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-xl">📸</span>
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-neutral-900">Carrousel Instagram</h2>
              <p className="text-xs text-neutral-600">Sélectionnez 2-10 images</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/50 transition-colors"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* LAYOUT 2 COLONNES */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

          {/* GALERIE D'IMAGES - GAUCHE */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto bg-neutral-50">
            <div className="mb-4 bg-gradient-to-r from-purple-100 to-blue-100 border border-purple-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-purple-900 mb-1">
                📸 {selectedImages.length}/10 images sélectionnées
              </p>
              <p className="text-xs text-purple-800">
                Cliquez sur les images pour les sélectionner/désélectionner
              </p>
            </div>

            {loadingImages ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <div key={i} className="aspect-square bg-neutral-200 rounded-lg animate-pulse"></div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {availableImages.map((img) => {
                  const isSelected = selectedImages.find(selected => selected.id === img.id);
                  const selectionIndex = selectedImages.findIndex(selected => selected.id === img.id);

                  return (
                    <button
                      key={img.id}
                      onClick={() => toggleImageSelection(img)}
                      className={`
                        aspect-square rounded-lg overflow-hidden transition-all relative
                        ${isSelected
                          ? 'ring-4 ring-purple-500 scale-95 shadow-lg'
                          : 'ring-1 ring-neutral-300 hover:ring-purple-300 hover:scale-102'
                        }
                      `}
                      title={img.title || img.news_title || 'Image'}
                    >
                      <img
                        src={img.thumbnail_url || img.image_url}
                        alt={img.title || 'Image'}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg">
                          {selectionIndex + 1}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {!loadingImages && availableImages.length === 0 && (
              <p className="text-center text-neutral-500 py-8">
                Aucune image disponible
              </p>
            )}
          </div>

          {/* FORMULAIRE - DROITE */}
          <div className="md:w-96 lg:w-[28rem] border-l border-neutral-200 overflow-y-auto bg-white">
            <div className="p-4 sm:p-6 space-y-6">

              {/* Aperçu images sélectionnées */}
              {selectedImages.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-2">
                    Images sélectionnées ({selectedImages.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedImages.slice(0, 10).map((img, idx) => (
                      <img
                        key={img.id}
                        src={img.thumbnail_url || img.image_url}
                        alt={`Image ${idx + 1}`}
                        className="w-16 h-16 object-cover rounded-lg ring-2 ring-purple-300"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Légende du carrousel
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={6}
                  placeholder="Écrivez une légende engageante pour votre carrousel Instagram..."
                  className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm"
                  maxLength={2200}
                />
                <p className="text-xs text-neutral-500 mt-1">{caption.length} / 2200 caractères</p>
              </div>

              {/* Hashtags suggérés */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Hashtags suggérés
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {['#instagram', '#instagood', '#photooftheday', '#picoftheday', '#insta'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => suggestHashtag(tag)}
                      className="px-3 py-1 bg-purple-50 text-purple-700 text-xs rounded-full hover:bg-purple-100 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hashtags sélectionnés */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Hashtags ({hashtags.length})
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {hashtags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-purple-100 to-blue-100 text-purple-800 text-xs rounded-full"
                    >
                      {tag}
                      <button
                        onClick={() => removeHashtag(tag)}
                        className="hover:text-purple-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addHashtag()}
                    placeholder="Ajouter un hashtag"
                    className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                  <button
                    onClick={addHashtag}
                    className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm font-medium"
                  >
                    +
                  </button>
                </div>
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
                    ⚠️ Connectez votre compte Instagram pour publier automatiquement
                  </p>
                  <button
                    onClick={handleConnectInstagram}
                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 mx-auto"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                    </svg>
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

            {isInstagramConnected && (
              <button
                onClick={handlePublishCarousel}
                disabled={publishing || !caption.trim() || selectedImages.length < 2}
                className={`flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-2 text-sm sm:text-base ${
                  publishing || !caption.trim() || selectedImages.length < 2
                    ? 'bg-neutral-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow-lg hover:shadow-xl'
                }`}
              >
                {publishing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Publication...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                    </svg>
                    <span>Publier le carrousel ({selectedImages.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
