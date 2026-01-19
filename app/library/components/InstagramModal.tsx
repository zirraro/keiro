import { useState } from 'react';
import { InstagramIcon, XIcon } from './Icons';

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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <InstagramIcon className="w-8 h-8 text-pink-600" />
            <h2 className="text-2xl font-bold text-neutral-900">Préparer post Instagram</h2>
          </div>
          <button
            onClick={onClose}
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
            <div className="space-y-6">
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
        <div className="border-t p-6 bg-neutral-50">
          <div className="mb-3 text-center">
            <p className="text-sm text-neutral-600">
              💡 Fonctionnalité de publication automatique à venir
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-3 border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => handleSave('draft')}
              disabled={saving || !caption.trim()}
              className={`flex-1 px-6 py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2 ${
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
                <span>Sauvegarder en brouillon</span>
              )}
            </button>
            <button
              onClick={() => handleSave('ready')}
              disabled={saving || !caption.trim()}
              className={`flex-1 px-6 py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2 ${
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
                  <InstagramIcon className="w-5 h-5" />
                  <span>Marquer prêt à publier</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
