import { useState, useEffect } from 'react';
import { TwitterXIcon, XIcon } from './Icons';
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

type MyVideo = {
  id: string;
  video_url: string;
  thumbnail_url?: string;
  title?: string;
  duration?: number;
  source_type: string;
  is_favorite: boolean;
  created_at: string;
  file_size?: number;
};

interface TwitterModalProps {
  image?: SavedImage;
  images?: SavedImage[];
  video?: MyVideo;
  videos?: MyVideo[];
  onClose: () => void;
  onSave: (image: SavedImage | null, caption: string, hashtags: string[], status: 'draft' | 'ready') => Promise<void>;
  draftCaption?: string;
  draftHashtags?: string[];
}

export default function TwitterModal({ image, images, video, videos, onClose, onSave, draftCaption, draftHashtags }: TwitterModalProps) {
  const [caption, setCaption] = useState(draftCaption || '');
  const [hashtags, setHashtags] = useState<string[]>(draftHashtags || []);
  const [hashtagInput, setHashtagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'images' | 'videos' | 'text-only'>(video ? 'videos' : 'images');
  const [availableImages, setAvailableImages] = useState<SavedImage[]>(images || []);
  const [selectedImage, setSelectedImage] = useState<SavedImage | null>(image || null);
  const [loadingImages, setLoadingImages] = useState(!images && !video);
  const [availableVideos, setAvailableVideos] = useState<MyVideo[]>(videos || []);
  const [selectedVideo, setSelectedVideo] = useState<MyVideo | null>(video || null);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const [contentAngle, setContentAngle] = useState('viral');
  const [userKeywords, setUserKeywords] = useState('');

  // Character count including hashtags
  const hashtagsText = hashtags.length > 0 ? ' ' + hashtags.join(' ') : '';
  const totalChars = caption.length + hashtagsText.length;
  const remainingChars = 280 - totalChars;

  useEffect(() => {
    if (draftCaption !== undefined) setCaption(draftCaption);
    if (draftHashtags !== undefined) setHashtags(draftHashtags);
  }, [draftCaption, draftHashtags]);

  useEffect(() => {
    const loadImages = async () => {
      if (activeTab !== 'images') return;
      if (images && images.length > 0) {
        setLoadingImages(false);
        if (!selectedImage && images.length > 0) setSelectedImage(images[0]);
        return;
      }
      setLoadingImages(true);
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const query = supabase.from('saved_images').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
        if (image?.folder_id) query.eq('folder_id', image.folder_id);
        const { data: loadedImages } = await query;
        setAvailableImages(loadedImages || []);
        if (!selectedImage && loadedImages && loadedImages.length > 0) setSelectedImage(loadedImages[0]);
      } catch (error) {
        console.error('[TwitterModal] Error loading images:', error);
      } finally {
        setLoadingImages(false);
      }
    };
    loadImages();
  }, [image?.folder_id, images, activeTab]);

  useEffect(() => {
    const loadVideos = async () => {
      if (activeTab !== 'videos') return;
      if (videos && videos.length > 0) {
        setLoadingVideos(false);
        if (!selectedVideo && videos.length > 0) setSelectedVideo(videos[0]);
        return;
      }
      setLoadingVideos(true);
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: loadedVideos } = await supabase.from('my_videos').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
        setAvailableVideos(loadedVideos || []);
        if (!selectedVideo && loadedVideos && loadedVideos.length > 0) setSelectedVideo(loadedVideos[0]);
      } catch (error) {
        console.error('[TwitterModal] Error loading videos:', error);
      } finally {
        setLoadingVideos(false);
      }
    };
    loadVideos();
  }, [videos, activeTab]);

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
    if (activeTab === 'text-only') {
      if (!caption.trim()) { alert('Veuillez écrire du texte pour votre tweet'); return; }
      setSaving(true);
      try {
        await onSave(null, caption, hashtags, status);
        setSuccessToast(status === 'draft' ? '✅ Brouillon texte X sauvegardé !' : '✅ Prêt à publier !');
        setTimeout(() => setSuccessToast(null), 3000);
      } finally {
        setSaving(false);
      }
    } else if (activeTab === 'images' && selectedImage) {
      setSaving(true);
      try {
        await onSave(selectedImage, caption, hashtags, status);
        setSuccessToast(status === 'draft' ? '✅ Brouillon X sauvegardé !' : '✅ Prêt à publier !');
        setTimeout(() => setSuccessToast(null), 3000);
      } finally {
        setSaving(false);
      }
    } else if (activeTab === 'videos' && selectedVideo) {
      setSaving(true);
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Créez un compte pour accéder à cette fonctionnalité');
        await supabase.from('twitter_drafts').insert({
          user_id: user.id,
          video_id: selectedVideo.id,
          media_url: selectedVideo.video_url,
          media_type: 'video',
          category: 'draft',
          caption: caption || '',
          hashtags: hashtags || [],
          status: status
        });
        setSuccessToast('✅ Brouillon vidéo X sauvegardé !');
        setTimeout(() => setSuccessToast(null), 3000);
      } catch (error) {
        console.error('[TwitterModal] Error saving video draft:', error);
        alert('Erreur lors de la sauvegarde');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSuggest = async () => {
    if (activeTab !== 'text-only') {
      const hasContent = activeTab === 'images' ? selectedImage : selectedVideo;
      if (!hasContent) { alert('Veuillez sélectionner un contenu'); return; }
    }
    setSuggesting(true);
    try {
      const contentUrl = activeTab === 'images' ? (selectedImage?.image_url || '') : (selectedVideo?.thumbnail_url || '');
      const contentTitle = activeTab === 'images' ? (selectedImage?.title || selectedImage?.news_title) : selectedVideo?.title;
      const response = await fetch('/api/instagram/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: contentUrl,
          imageTitle: contentTitle,
          newsTitle: selectedImage?.news_title || contentTitle,
          newsCategory: selectedImage?.news_category || 'general',
          contentAngle: contentAngle,
          userKeywords: userKeywords.trim() || undefined,
          platform: 'twitter',
          maxLength: 280
        })
      });
      const data = await response.json();
      if (data.ok) {
        setCaption(data.caption?.substring(0, 250) || '');
        setHashtags(data.hashtags?.slice(0, 3) || []);
      } else {
        alert(data.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      console.error('[TwitterModal] Error suggesting:', error);
      alert('Erreur lors de la génération');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white w-full h-full md:w-[95vw] md:h-[90vh] md:max-w-6xl md:rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-200 bg-gradient-to-r from-neutral-50 to-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-r from-neutral-800 to-black flex items-center justify-center">
              <TwitterXIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">Préparer un tweet</h2>
              <p className="text-xs text-neutral-500">280 caractères max</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-neutral-200 transition-colors">
            <XIcon className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-600" />
          </button>
        </div>

        {successToast && (
          <div className="mx-4 sm:mx-6 mt-2 px-4 py-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium text-center animate-pulse">
            {successToast}
          </div>
        )}

        {/* Tab switcher */}
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 sm:px-6 py-2">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('images')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'images'
                  ? 'bg-neutral-900 text-white shadow-md'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              📸 Images ({availableImages.length})
            </button>
            <button
              onClick={() => setActiveTab('videos')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'videos'
                  ? 'bg-neutral-900 text-white shadow-md'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              🎥 Vidéos ({availableVideos.length})
            </button>
            <button
              onClick={() => { setActiveTab('text-only'); setSelectedImage(null); setSelectedVideo(null); }}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'text-only'
                  ? 'bg-neutral-900 text-white shadow-md'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              📝 Texte seul
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Gallery sidebar (desktop) */}
          {activeTab !== 'text-only' && (
            <div className="hidden md:block md:w-24 lg:w-32 border-r border-neutral-200 overflow-y-auto bg-neutral-50">
              <div className="p-2 space-y-2">
                <p className="text-xs font-semibold text-neutral-500 px-2 mb-2">Sélectionner</p>
                {activeTab === 'images' && (
                  <>
                    {loadingImages ? (
                      [1, 2, 3, 4, 5, 6].map(i => <div key={i} className="aspect-square bg-neutral-200 rounded animate-pulse"></div>)
                    ) : (
                      availableImages.map((img) => (
                        <button
                          key={img.id}
                          onClick={() => setSelectedImage(img)}
                          className={`w-full aspect-square rounded-lg overflow-hidden transition-all ${
                            selectedImage?.id === img.id ? 'ring-2 ring-neutral-900 scale-105 shadow-lg' : 'ring-1 ring-neutral-300 hover:ring-neutral-500'
                          }`}
                        >
                          <img src={img.thumbnail_url || img.image_url} alt={img.title || 'Image'} className="w-full h-full object-cover" />
                        </button>
                      ))
                    )}
                  </>
                )}
                {activeTab === 'videos' && (
                  <>
                    {loadingVideos ? (
                      [1, 2, 3, 4].map(i => <div key={i} className="aspect-square bg-neutral-200 rounded animate-pulse"></div>)
                    ) : (
                      availableVideos.map((vid) => (
                        <button
                          key={vid.id}
                          onClick={() => setSelectedVideo(vid)}
                          className={`w-full aspect-square rounded-lg overflow-hidden transition-all relative ${
                            selectedVideo?.id === vid.id ? 'ring-2 ring-neutral-900 scale-105 shadow-lg' : 'ring-1 ring-neutral-300 hover:ring-neutral-500'
                          }`}
                        >
                          {vid.thumbnail_url ? (
                            <img src={vid.thumbnail_url} alt={vid.title || 'Vidéo'} className="w-full h-full object-cover" />
                          ) : (
                            <video src={vid.video_url} className="w-full h-full object-cover" muted preload="metadata" />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </div>
                        </button>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Mobile gallery */}
          {activeTab !== 'text-only' && (
            <div className="md:hidden border-b border-neutral-200 bg-neutral-50 p-3">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {activeTab === 'images' && availableImages.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden ${
                      selectedImage?.id === img.id ? 'ring-2 ring-neutral-900' : 'ring-1 ring-neutral-300'
                    }`}
                  >
                    <img src={img.thumbnail_url || img.image_url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
                {activeTab === 'videos' && availableVideos.map((vid) => (
                  <button
                    key={vid.id}
                    onClick={() => setSelectedVideo(vid)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden relative ${
                      selectedVideo?.id === vid.id ? 'ring-2 ring-neutral-900' : 'ring-1 ring-neutral-300'
                    }`}
                  >
                    {vid.thumbnail_url ? (
                      <img src={vid.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-neutral-200 flex items-center justify-center">
                        <svg className="w-4 h-4 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview + Form */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Preview - Tweet style */}
            {(selectedImage || selectedVideo || activeTab === 'text-only') && (
              <div className="hidden md:block md:w-1/2 md:overflow-y-auto md:p-6 bg-neutral-50">
                <div className="md:sticky md:top-0">
                  <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto overflow-hidden p-4">
                    {/* Tweet header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center">
                        <TwitterXIcon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900">Votre compte</p>
                        <p className="text-xs text-neutral-500">@vous · maintenant</p>
                      </div>
                    </div>
                    {/* Tweet text */}
                    {caption ? (
                      <p className="text-sm text-neutral-900 mb-3 whitespace-pre-line">{caption}</p>
                    ) : activeTab === 'text-only' ? (
                      <p className="text-sm text-neutral-400 italic mb-3">Votre tweet apparaitra ici...</p>
                    ) : null}
                    {hashtags.length > 0 && (
                      <p className="text-sm text-[#1DA1F2] mb-3">{hashtags.join(' ')}</p>
                    )}
                    {/* Media */}
                    {activeTab !== 'text-only' && (
                      <div className="aspect-video bg-black rounded-xl overflow-hidden">
                        {activeTab === 'videos' && selectedVideo ? (
                          <video src={selectedVideo.video_url} controls className="w-full h-full object-cover" />
                        ) : activeTab === 'images' && selectedImage ? (
                          <img src={selectedImage.image_url} alt="Preview" className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                    )}
                    {/* Engagement */}
                    <div className="flex items-center justify-between mt-3 text-neutral-500 px-2">
                      <span className="text-xs">💬</span>
                      <span className="text-xs">🔄</span>
                      <span className="text-xs">❤️</span>
                      <span className="text-xs">📊</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Angle */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">Quel angle pour votre tweet ?</label>
                <select
                  value={contentAngle}
                  onChange={(e) => setContentAngle(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent bg-white"
                >
                  <option value="viral">🔥 Viral - Percutant et partageable</option>
                  <option value="humoristique">😄 Humoristique - Faire rire</option>
                  <option value="informatif">📰 Informatif - Facts et données</option>
                  <option value="provocateur">💥 Provocateur - Interpeller</option>
                  <option value="conversationnel">💬 Conversationnel - Engager un échange</option>
                  <option value="inspirant">✨ Inspirant - Motiver</option>
                </select>
              </div>

              {/* Mots-clés optionnels */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-1">
                  Mots-clés / phrase directrice <span className="text-xs font-normal text-neutral-500">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={userKeywords}
                  onChange={(e) => setUserKeywords(e.target.value)}
                  placeholder="Ex: breaking news, opinion, thread..."
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent text-sm"
                />
                <p className="text-xs text-neutral-400 mt-1">Orientez l'IA avec vos mots-clés pour personnaliser la suggestion</p>
              </div>

              {/* Suggest */}
              <button
                onClick={handleSuggest}
                disabled={suggesting}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                  suggesting
                    ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                    : 'bg-neutral-900 text-white hover:bg-black shadow-lg hover:shadow-xl'
                }`}
              >
                {suggesting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Suggestion en cours...</span>
                  </>
                ) : (
                  <span>✨ Suggérer un tweet</span>
                )}
              </button>

              {/* Caption with char counter */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-neutral-900">Votre tweet</label>
                  <span className={`text-sm font-bold ${
                    remainingChars < 0 ? 'text-red-600' : remainingChars < 20 ? 'text-amber-500' : 'text-neutral-400'
                  }`}>
                    {remainingChars}
                  </span>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className={`w-full h-24 px-4 py-3 border rounded-lg resize-none focus:ring-2 focus:border-transparent ${
                    remainingChars < 0
                      ? 'border-red-400 focus:ring-red-500'
                      : 'border-neutral-300 focus:ring-neutral-900'
                  }`}
                  placeholder="Écrivez un tweet percutant..."
                />
                {/* Progress bar */}
                <div className="mt-2 h-1 bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      remainingChars < 0 ? 'bg-red-500' : remainingChars < 20 ? 'bg-amber-500' : 'bg-[#1DA1F2]'
                    }`}
                    style={{ width: `${Math.min(100, (totalChars / 280) * 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Hashtags */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Hashtags <span className="text-neutral-400 font-normal">(comptent dans les 280 car.)</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                    className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                    placeholder="Ajouter un hashtag..."
                  />
                  <button onClick={addHashtag} className="px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-black transition-colors font-medium">
                    +
                  </button>
                </div>
                {hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {hashtags.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full text-sm font-medium">
                        {tag}
                        <button onClick={() => removeHashtag(tag)} className="text-neutral-400 hover:text-red-500">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-neutral-200">
                <button
                  onClick={() => handleSave('draft')}
                  disabled={saving || (activeTab !== 'text-only' && !selectedImage && !selectedVideo)}
                  className="flex-1 py-3 px-4 rounded-lg font-medium border-2 border-neutral-800 text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? 'Sauvegarde...' : '📝 Sauvegarder brouillon'}
                </button>
                <button
                  onClick={() => handleSave('ready')}
                  disabled={saving || (activeTab !== 'text-only' && !selectedImage && !selectedVideo) || !caption.trim() || remainingChars < 0}
                  className="flex-1 py-3 px-4 rounded-lg font-medium bg-neutral-900 text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {saving ? 'Sauvegarde...' : '✅ Marquer prêt à publier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
