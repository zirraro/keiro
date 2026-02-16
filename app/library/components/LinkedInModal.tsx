import { useState, useEffect } from 'react';
import { LinkedInIcon, XIcon } from './Icons';
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

interface LinkedInModalProps {
  image?: SavedImage;
  images?: SavedImage[];
  video?: MyVideo;
  videos?: MyVideo[];
  onClose: () => void;
  onSave: (image: SavedImage | null, caption: string, hashtags: string[], status: 'draft' | 'ready') => Promise<void>;
  draftCaption?: string;
  draftHashtags?: string[];
  linkedinConnected?: boolean;
  onPublish?: (mediaUrl: string | null, mediaType: string, caption: string, hashtags: string[]) => Promise<void>;
}

export default function LinkedInModal({ image, images, video, videos, onClose, onSave, draftCaption, draftHashtags, linkedinConnected, onPublish }: LinkedInModalProps) {
  const [caption, setCaption] = useState(draftCaption || '');
  const [hashtags, setHashtags] = useState<string[]>(draftHashtags || []);
  const [hashtagInput, setHashtagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'images' | 'videos' | 'text-only'>(video ? 'videos' : 'images');
  const [availableImages, setAvailableImages] = useState<SavedImage[]>(images || []);
  const [selectedImage, setSelectedImage] = useState<SavedImage | null>(image || null);
  const [loadingImages, setLoadingImages] = useState(!images && !video);
  const [availableVideos, setAvailableVideos] = useState<MyVideo[]>(videos || []);
  const [selectedVideo, setSelectedVideo] = useState<MyVideo | null>(video || null);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const [contentAngle, setContentAngle] = useState('professionnel');

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
        console.error('[LinkedInModal] Error loading images:', error);
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
        console.error('[LinkedInModal] Error loading videos:', error);
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
      if (!caption.trim()) { alert('Veuillez écrire du texte pour votre post'); return; }
      setSaving(true);
      try {
        await onSave(null, caption, hashtags, status);
        setSuccessToast(status === 'draft' ? '✅ Brouillon texte LinkedIn sauvegardé !' : '✅ Prêt à publier !');
        setTimeout(() => setSuccessToast(null), 3000);
      } finally {
        setSaving(false);
      }
    } else if (activeTab === 'images' && selectedImage) {
      setSaving(true);
      try {
        await onSave(selectedImage, caption, hashtags, status);
        setSuccessToast(status === 'draft' ? '✅ Brouillon LinkedIn sauvegardé !' : '✅ Prêt à publier !');
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
        await supabase.from('linkedin_drafts').insert({
          user_id: user.id,
          video_id: selectedVideo.id,
          media_url: selectedVideo.video_url,
          media_type: 'video',
          category: 'draft',
          caption: caption || '',
          hashtags: hashtags || [],
          status: status
        });
        setSuccessToast('✅ Brouillon vidéo LinkedIn sauvegardé !');
        setTimeout(() => setSuccessToast(null), 3000);
      } catch (error) {
        console.error('[LinkedInModal] Error saving video draft:', error);
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
          platform: 'linkedin'
        })
      });
      const data = await response.json();
      if (data.ok) {
        setCaption(data.caption);
        setHashtags(data.hashtags?.slice(0, 5) || []);
      } else {
        alert(data.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      console.error('[LinkedInModal] Error suggesting:', error);
      alert('Erreur lors de la génération');
    } finally {
      setSuggesting(false);
    }
  };

  const handlePublishNow = async () => {
    if (!onPublish) return;
    if (!caption.trim()) { alert('Veuillez écrire du texte pour votre post'); return; }
    setPublishing(true);
    try {
      let mediaUrl: string | null = null;
      let mediaType = 'text-only';

      if (activeTab === 'images' && selectedImage) {
        mediaUrl = selectedImage.image_url;
        mediaType = 'image';
      } else if (activeTab === 'videos' && selectedVideo) {
        mediaUrl = selectedVideo.video_url;
        mediaType = 'video';
      }

      await onPublish(mediaUrl, mediaType, caption, hashtags);
      setSuccessToast('✅ Publié sur LinkedIn !');
      setTimeout(() => { setSuccessToast(null); onClose(); }, 2000);
    } catch (error: any) {
      alert(error.message || 'Erreur lors de la publication');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white w-full h-full md:w-[95vw] md:h-[90vh] md:max-w-6xl md:rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-200 bg-gradient-to-r from-blue-50 to-sky-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#0077B5] to-blue-600 flex items-center justify-center">
              <LinkedInIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">Préparer un post LinkedIn</h2>
              <p className="text-xs text-neutral-500">Post professionnel avec IA</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/50 transition-colors">
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
                  ? 'bg-gradient-to-r from-[#0077B5] to-blue-600 text-white shadow-md'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              📸 Images ({availableImages.length})
            </button>
            <button
              onClick={() => setActiveTab('videos')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'videos'
                  ? 'bg-gradient-to-r from-[#0077B5] to-blue-600 text-white shadow-md'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              🎥 Vidéos ({availableVideos.length})
            </button>
            <button
              onClick={() => { setActiveTab('text-only'); setSelectedImage(null); setSelectedVideo(null); }}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'text-only'
                  ? 'bg-gradient-to-r from-[#0077B5] to-blue-600 text-white shadow-md'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              📝 Texte seul
            </button>
          </div>
        </div>

        {/* Content: gallery + preview + form */}
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
                            selectedImage?.id === img.id ? 'ring-2 ring-[#0077B5] scale-105 shadow-lg' : 'ring-1 ring-neutral-300 hover:ring-blue-300'
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
                            selectedVideo?.id === vid.id ? 'ring-2 ring-[#0077B5] scale-105 shadow-lg' : 'ring-1 ring-neutral-300 hover:ring-blue-300'
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
                      selectedImage?.id === img.id ? 'ring-2 ring-[#0077B5]' : 'ring-1 ring-neutral-300'
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
                      selectedVideo?.id === vid.id ? 'ring-2 ring-[#0077B5]' : 'ring-1 ring-neutral-300'
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
            {/* Preview */}
            {(selectedImage || selectedVideo || activeTab === 'text-only') && (
              <div className="hidden md:block md:w-1/2 md:overflow-y-auto md:p-6 bg-neutral-50">
                <div className="md:sticky md:top-0">
                  {/* LinkedIn-style preview card */}
                  <div className="bg-white rounded-lg border border-neutral-200 shadow-sm max-w-sm mx-auto overflow-hidden">
                    {/* Profile header */}
                    <div className="p-3 flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0077B5] to-blue-600 flex items-center justify-center">
                        <LinkedInIcon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">Votre profil</p>
                        <p className="text-xs text-neutral-500">Maintenant</p>
                      </div>
                    </div>
                    {/* Caption preview */}
                    {caption ? (
                      <div className="px-3 pb-2">
                        <p className="text-xs text-neutral-700 whitespace-pre-line">{caption}</p>
                      </div>
                    ) : activeTab === 'text-only' ? (
                      <div className="px-3 pb-2">
                        <p className="text-xs text-neutral-400 italic">Votre texte apparaitra ici...</p>
                      </div>
                    ) : null}
                    {/* Media */}
                    {activeTab !== 'text-only' && (
                      <div className="aspect-video bg-black">
                        {activeTab === 'videos' && selectedVideo ? (
                          <video src={selectedVideo.video_url} controls className="w-full h-full object-cover" />
                        ) : activeTab === 'images' && selectedImage ? (
                          <img src={selectedImage.image_url} alt="Preview" className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                    )}
                    {/* Engagement bar */}
                    <div className="p-3 flex items-center gap-4 text-neutral-500">
                      <span className="text-xs">👍 J'aime</span>
                      <span className="text-xs">💬 Commenter</span>
                      <span className="text-xs">🔄 Partager</span>
                    </div>
                  </div>
                  {hashtags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1 justify-center">
                      {hashtags.map((tag, i) => (
                        <span key={i} className="text-xs text-[#0077B5] font-medium">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Angle selector */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">Quel angle pour votre post ?</label>
                <select
                  value={contentAngle}
                  onChange={(e) => setContentAngle(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#0077B5] focus:border-transparent bg-white"
                >
                  <option value="professionnel">💼 Professionnel - Expertise et crédibilité</option>
                  <option value="thought-leadership">🧠 Thought Leadership - Vision et tendances</option>
                  <option value="storytelling">📖 Storytelling - Partager une expérience</option>
                  <option value="informatif">📰 Informatif - Partager des connaissances</option>
                  <option value="inspirant">✨ Inspirant - Motiver votre réseau</option>
                  <option value="engagement">💬 Engagement - Lancer un débat</option>
                </select>
              </div>

              {/* Suggest button */}
              <button
                onClick={handleSuggest}
                disabled={suggesting}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                  suggesting
                    ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#0077B5] to-blue-600 text-white hover:from-[#005f8f] hover:to-blue-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {suggesting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Suggestion en cours...</span>
                  </>
                ) : (
                  <span>✨ Suggérer description et hashtags LinkedIn</span>
                )}
              </button>

              {/* Caption */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">Description du post</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full h-48 px-4 py-3 border border-neutral-300 rounded-lg resize-none focus:ring-2 focus:ring-[#0077B5] focus:border-transparent"
                  placeholder="Écrivez un post LinkedIn engageant et professionnel. Utilisez des retours à la ligne pour aérer le texte..."
                  maxLength={3000}
                />
                <p className="mt-1 text-xs text-neutral-500 text-right">{caption.length} / 3 000 caractères</p>
              </div>

              {/* Hashtags */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Hashtags <span className="text-neutral-400 font-normal">(3-5 recommandés pour LinkedIn)</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                    className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#0077B5] focus:border-transparent"
                    placeholder="Ajouter un hashtag..."
                  />
                  <button onClick={addHashtag} className="px-4 py-2 bg-[#0077B5] text-white rounded-lg hover:bg-[#005f8f] transition-colors font-medium">
                    +
                  </button>
                </div>
                {hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {hashtags.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-[#0077B5] rounded-full text-sm font-medium">
                        {tag}
                        <button onClick={() => removeHashtag(tag)} className="text-blue-400 hover:text-red-500">
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
                  disabled={saving || publishing || (activeTab !== 'text-only' && !selectedImage && !selectedVideo)}
                  className="flex-1 py-3 px-4 rounded-lg font-medium border-2 border-[#0077B5] text-[#0077B5] hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? 'Sauvegarde...' : '📝 Brouillon'}
                </button>
                <button
                  onClick={linkedinConnected && onPublish ? handlePublishNow : () => handleSave('ready')}
                  disabled={(linkedinConnected ? publishing : saving) || (activeTab !== 'text-only' && !selectedImage && !selectedVideo) || !caption.trim()}
                  className="flex-1 py-3 px-4 rounded-lg font-medium bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {publishing ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Publication...
                    </span>
                  ) : saving ? 'Sauvegarde...' : '🚀 Publier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
