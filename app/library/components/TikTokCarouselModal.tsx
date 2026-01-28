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

interface TikTokCarouselModalProps {
  images?: SavedImage[];
  onClose: () => void;
}

export default function TikTokCarouselModal({ images, onClose }: TikTokCarouselModalProps) {
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [isTikTokConnected, setIsTikTokConnected] = useState(false);
  const [tiktokUsername, setTikTokUsername] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(true);

  // Galerie et sélection multiple
  const [availableImages, setAvailableImages] = useState<SavedImage[]>(images || []);
  const [selectedImages, setSelectedImages] = useState<SavedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(!images);

  // Angle/ton de la description
  const [contentAngle, setContentAngle] = useState('viral');
  const [suggesting, setSuggesting] = useState(false);

  // Vérifier si l'utilisateur a connecté son compte TikTok
  useEffect(() => {
    const checkTikTokConnection = async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('tiktok_user_id, tiktok_username')
            .eq('id', user.id)
            .single();

          if (profile?.tiktok_user_id) {
            setIsTikTokConnected(true);
            setTikTokUsername(profile.tiktok_username);
          }
        }
      } catch (error) {
        console.error('[TikTokCarouselModal] Error checking TikTok connection:', error);
      } finally {
        setCheckingConnection(false);
      }
    };

    checkTikTokConnection();
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
        console.error('[TikTokCarouselModal] Error loading images:', error);
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
      if (selectedImages.length >= 35) {
        alert('Maximum 35 images pour un carrousel TikTok');
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

  const handleSuggest = async () => {
    if (selectedImages.length === 0) {
      alert('Veuillez sélectionner au moins une image');
      return;
    }

    setSuggesting(true);
    try {
      const response = await fetch('/api/tiktok/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: selectedImages[0].image_url,
          imageTitle: selectedImages[0].title || selectedImages[0].news_title,
          newsTitle: selectedImages[0].news_title,
          newsCategory: selectedImages[0].news_category,
          contentAngle: contentAngle,
          isCarousel: true,
          imageCount: selectedImages.length
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
      console.error('[TikTokCarouselModal] Error suggesting:', error);
      alert('Erreur lors de la génération des suggestions');
    } finally {
      setSuggesting(false);
    }
  };

  const handlePublishCarousel = async () => {
    if (selectedImages.length === 0) {
      alert('Veuillez sélectionner au moins une image (max 35)');
      return;
    }

    if (!caption.trim()) {
      alert('Veuillez écrire une description pour votre carrousel TikTok');
      return;
    }

    if (!isTikTokConnected) {
      alert('Veuillez d\'abord connecter votre compte TikTok');
      return;
    }

    const confirm = window.confirm(
      `🎵 Publier le carrousel sur TikTok ?\n\n` +
      `📸 ${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''} sélectionnée${selectedImages.length > 1 ? 's' : ''}\n` +
      `🚀 Le carrousel sera publié immédiatement sur TikTok\n\n` +
      `Continuer ?`
    );

    if (!confirm) return;

    setPublishing(true);
    try {
      const response = await fetch('/api/tiktok/publish-carousel', {
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
        const successMessage = `🎉 Carrousel publié avec succès sur TikTok !\n\n✅ ${data.post.imageCount} images publiées\n💬 Les interactions commenceront bientôt\n\nFélicitations ! 🚀`;
        alert(successMessage);
        onClose();
      } else {
        throw new Error(data.error || 'Erreur lors de la publication');
      }
    } catch (error: any) {
      console.error('[TikTokCarouselModal] Error publishing:', error);
      alert(`❌ Erreur lors de la publication:\n${error.message || 'Une erreur est survenue'}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleConnectTikTok = () => {
    window.location.href = '/api/auth/tiktok-oauth';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b bg-gradient-to-r from-pink-50 to-orange-50">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-xl">📸</span>
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-neutral-900">Carrousel TikTok</h2>
              <p className="text-xs text-neutral-600">Sélectionnez 2-35 images</p>
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
            <div className="mb-4 bg-gradient-to-r from-pink-100 to-orange-100 border border-pink-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-pink-900 mb-1">
                📸 {selectedImages.length}/35 images sélectionnées
              </p>
              <p className="text-xs text-pink-800">
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
                          ? 'ring-4 ring-pink-500 scale-95 shadow-lg'
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
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg">
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
                        className="w-16 h-16 object-cover rounded-lg ring-2 ring-pink-300"
                      />
                    ))}
                    {selectedImages.length > 10 && (
                      <div className="w-16 h-16 bg-neutral-200 rounded-lg flex items-center justify-center text-xs font-bold text-neutral-600">
                        +{selectedImages.length - 10}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Angle du contenu */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Ton du carrousel
                </label>
                <select
                  value={contentAngle}
                  onChange={(e) => setContentAngle(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                >
                  <option value="viral">🔥 Viral / Tendance</option>
                  <option value="fun">😄 Amusant / Léger</option>
                  <option value="informatif">📚 Informatif</option>
                  <option value="inspirant">✨ Inspirant</option>
                  <option value="educatif">🎓 Éducatif</option>
                </select>
              </div>

              {/* Bouton suggérer IA */}
              <div>
                <button
                  onClick={handleSuggest}
                  disabled={suggesting || selectedImages.length === 0}
                  className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {suggesting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Suggestion en cours...
                    </span>
                  ) : (
                    '✨ Suggérer description et hashtags'
                  )}
                </button>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Description du carrousel
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={6}
                  placeholder="Écrivez une description engageante pour votre carrousel TikTok..."
                  className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none text-sm"
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
                  {['#fyp', '#viral', '#carousel', '#photos', '#trending'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => suggestHashtag(tag)}
                      className="px-3 py-1 bg-pink-50 text-pink-700 text-xs rounded-full hover:bg-pink-100 transition-colors"
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
                      className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-pink-100 to-orange-100 text-pink-800 text-xs rounded-full"
                    >
                      {tag}
                      <button
                        onClick={() => removeHashtag(tag)}
                        className="hover:text-pink-900"
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
                    className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                  />
                  <button
                    onClick={addHashtag}
                    className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors text-sm font-medium"
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
          {/* Statut de connexion TikTok */}
          {!checkingConnection && (
            <div className="mb-4">
              {isTikTokConnected ? (
                <div className="flex items-center justify-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3 border border-green-200">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Connecté à TikTok : <strong>@{tiktokUsername}</strong></span>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200 mb-3">
                    ⚠️ Connectez votre compte TikTok pour publier automatiquement
                  </p>
                  <button
                    onClick={handleConnectTikTok}
                    className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-semibold hover:from-cyan-600 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 mx-auto"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                    <span>Connecter TikTok</span>
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

            {isTikTokConnected && (
              <button
                onClick={handlePublishCarousel}
                disabled={publishing || !caption.trim() || selectedImages.length === 0}
                className={`flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-2 text-sm sm:text-base ${
                  publishing || !caption.trim() || selectedImages.length === 0
                    ? 'bg-neutral-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 shadow-lg hover:shadow-xl'
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
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
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
