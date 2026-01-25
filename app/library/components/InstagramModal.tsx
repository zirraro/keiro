import { useState, useEffect } from 'react';
import { InstagramIcon, XIcon } from './Icons';
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

interface InstagramModalProps {
  image: SavedImage;
  onClose: () => void;
  onSave: (caption: string, hashtags: string[], status: 'draft' | 'ready') => Promise<void>;
}

export default function InstagramModal({ image, onClose, onSave }: InstagramModalProps) {
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isInstagramConnected, setIsInstagramConnected] = useState(false);
  const [instagramUsername, setInstagramUsername] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(true);

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
    setSaving(true);
    try {
      await onSave(caption, hashtags, status);
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
    setSuggesting(true);
    try {
      const response = await fetch('/api/instagram/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageTitle: image.title || image.news_title,
          newsTitle: image.news_title,
          newsCategory: image.news_category
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
          imageUrl: image.image_url,
          caption,
          hashtags
        })
      });

      const data = await response.json();

      if (data.ok) {
        alert('✅ Post publié avec succès sur Instagram !\n\nVotre contenu est maintenant visible par votre audience.');
        onClose();
      } else {
        throw new Error(data.error || 'Erreur lors de la publication');
      }
    } catch (error: any) {
      console.error('[InstagramModal] Error publishing:', error);
      alert(`❌ Erreur lors de la publication:\n${error.message || 'Une erreur est survenue'}`);
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishStory = async () => {
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
          imageUrl: image.image_url
        })
      });

      const data = await response.json();

      if (data.ok) {
        alert('✅ Story publiée avec succès sur Instagram !\n\nVotre story est maintenant visible pendant 24h par votre audience.');
        onClose();
      } else {
        throw new Error(data.error || 'Erreur lors de la publication de la story');
      }
    } catch (error: any) {
      console.error('[InstagramModal] Error publishing story:', error);
      alert(`❌ Erreur lors de la publication de la story:\n${error.message || 'Une erreur est survenue'}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleConnectInstagram = () => {
    // Ouvrir le flux OAuth dans une nouvelle fenêtre
    window.location.href = '/api/auth/instagram-oauth';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b">
          <div className="flex items-center gap-2 sm:gap-3">
            <InstagramIcon className="w-6 h-6 sm:w-8 sm:h-8 text-pink-600" />
            <h2 className="text-lg sm:text-2xl font-bold text-neutral-900">Post Instagram</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
            aria-label="Fermer"
          >
            <XIcon className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-600" />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Image en haut sur mobile, à gauche sur desktop */}
          <div className="mb-4 sm:mb-0 sm:hidden">
            <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden border">
              <img
                src={image.image_url}
                alt={image.title || image.news_title || ''}
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-sm text-neutral-600 mt-2 font-medium">
              {image.title || image.news_title || 'Sans titre'}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            {/* Colonne gauche : Image - Desktop uniquement */}
            <div className="hidden md:block">
              <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden border">
                <img
                  src={image.image_url}
                  alt={image.title || image.news_title || ''}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-sm text-neutral-600 mt-2">
                {image.title || image.news_title || 'Sans titre'}
              </p>
            </div>

            {/* Colonne droite : Formulaire */}
            <div className="space-y-6 md:space-y-6 space-y-4">
              {/* Bouton Suggérer avec IA */}
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
                    <span>Génération en cours...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <span>✨ Suggérer avec IA</span>
                  </>
                )}
              </button>

              {/* Description/Caption */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Description du post
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Écrivez une description engageante pour votre post..."
                  className="w-full h-40 px-4 py-3 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                  maxLength={2200}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  {caption.length} / 2200 caractères
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
                  {hashtags.map((tag, idx) => (
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
                {hashtags.length === 0 && (
                  <p className="text-xs text-neutral-500 mt-2">
                    Aucun hashtag ajouté. Ajoutez-en pour améliorer la visibilité !
                  </p>
                )}
                <p className="text-xs text-neutral-500 mt-2">
                  {hashtags.length} / 30 hashtags max
                </p>
              </div>

              {/* Suggestion de hashtags */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium mb-2">💡 Suggestions</p>
                <div className="flex flex-wrap gap-2">
                  {image.news_category && (
                    <button
                      onClick={() => suggestHashtag(image.news_category!.toLowerCase().replace(/\s/g, ''))}
                      className="px-2 py-1 bg-white border border-blue-300 rounded text-xs text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      #{image.news_category.toLowerCase().replace(/\s/g, '')}
                    </button>
                  )}
                  {['actualite', 'business', 'entrepreneur', 'marketing', 'reseauxsociaux'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => suggestHashtag(tag)}
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
    </div>
  );
}
