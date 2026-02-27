import { useState, useEffect, useRef } from 'react';
import { InstagramIcon, XIcon } from './Icons';
import { supabaseBrowser } from '@/lib/supabase/client';
import ErrorSupportModal from './ErrorSupportModal';
import InstagramCarouselModal from './InstagramCarouselModal';
import AudioEditorWidget from './AudioEditorWidget';
import ImageEditModal from './ImageEditModal';

type SavedImage = {
  id: string;
  image_url: string;
  thumbnail_url?: string;
  title?: string;
  news_title?: string;
  news_category?: string;
  text_overlay?: string;
  original_image_url?: string;
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
  published_to_instagram?: boolean;
  instagram_published_at?: string;
  file_size?: number;
  subtitle_text?: string;
  audio_url?: string;
};

interface InstagramModalProps {
  image?: SavedImage;
  images?: SavedImage[];
  video?: MyVideo; // NEW: Support for video (Reel)
  videos?: MyVideo[]; // NEW: Support for videos array
  onClose: () => void;
  onSave: (image: SavedImage, caption: string, hashtags: string[], status: 'draft' | 'ready') => Promise<void>;
  draftCaption?: string;
  draftHashtags?: string[];
}

export default function InstagramModal({ image, images, video, videos, onClose, onSave, draftCaption, draftHashtags }: InstagramModalProps) {
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

  // État pour le modal carrousel
  const [showCarouselModal, setShowCarouselModal] = useState(false);

  // État pour l'édition d'image
  const [showImageEditModal, setShowImageEditModal] = useState(false);

  // NEW: Tab switching state (Images/Vidéos) - Default to images (post), but videos if video prop passed
  const [activeTab, setActiveTab] = useState<'images' | 'videos'>(video ? 'videos' : 'images');

  // États pour la galerie IMAGES
  const [availableImages, setAvailableImages] = useState<SavedImage[]>(images || []);
  const [selectedImage, setSelectedImage] = useState<SavedImage | null>(image || null);
  const [loadingImages, setLoadingImages] = useState(!images && !video);

  // NEW: États pour la galerie VIDEOS (Reels)
  const [availableVideos, setAvailableVideos] = useState<MyVideo[]>(videos || []);
  const [selectedVideo, setSelectedVideo] = useState<MyVideo | null>(video || null);
  const [loadingVideos, setLoadingVideos] = useState(!videos && !!video);

  // Pré-charger subtitle/audio depuis la vidéo sélectionnée
  useEffect(() => {
    if (selectedVideo?.subtitle_text && !narrationScript) {
      setNarrationScript(selectedVideo.subtitle_text);
      setEnableSubtitles(true);
    }
    if (selectedVideo?.audio_url && !narrationAudioUrl) {
      setNarrationAudioUrl(selectedVideo.audio_url);
    }
  }, [selectedVideo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Angle/ton de la description
  const [contentAngle, setContentAngle] = useState('informatif');
  const [userKeywords, setUserKeywords] = useState('');

  // États pour la narration audio TTS
  const [narrationScript, setNarrationScript] = useState('');
  const [narrationAudioUrl, setNarrationAudioUrl] = useState<string | null>(null);
  const [showNarrationEditor, setShowNarrationEditor] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  // Toast de succès
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string>('JBFqnCBsd6RMkjVDRZzb'); // ElevenLabs George

  // États pour les sous-titres
  const [enableSubtitles, setEnableSubtitles] = useState(false);
  const [subtitleStyle, setSubtitleStyle] = useState<'wordflash' | 'wordstay' | 'neon' | 'cinema' | 'impact' | 'minimal' | 'classic' | 'clean'>('wordflash');
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  // Refs pour synchronisation audio+vidéo
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // CSS des styles de sous-titres
  const subtitleCSS: Record<string, string> = {
    wordflash: 'text-white text-2xl font-black uppercase tracking-wide [text-shadow:_0_0_20px_rgb(0_0_0),_0_0_40px_rgb(0_0_0)]',
    wordstay: 'text-white text-sm font-extrabold [text-shadow:_2px_2px_4px_rgb(0_0_0_/_90%)]',
    neon: 'text-fuchsia-400 text-xl font-black [text-shadow:_0_0_10px_rgb(192_38_211),_0_0_20px_rgb(192_38_211),_0_0_40px_rgb(192_38_211)]',
    cinema: 'text-white text-xs font-medium bg-black/80 px-4 py-2 tracking-wider',
    impact: 'text-white text-xl font-black uppercase tracking-tight [text-shadow:_3px_3px_0_rgb(0_0_0),_-1px_-1px_0_rgb(0_0_0)]',
    minimal: 'text-white/90 text-[10px] font-medium bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm',
    classic: 'text-white text-[11px] font-bold bg-black/60 px-2 py-1 rounded-lg',
    clean: 'text-white text-[11px] font-bold [text-shadow:_1px_1px_4px_rgb(0_0_0_/_80%)]',
  };

  // Calcul du mot courant pour les styles mot-par-mot
  const handleTimeUpdate = () => {
    if (!['wordstay', 'wordflash', 'neon'].includes(subtitleStyle)) return;
    if (!narrationScript) return;
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const words = narrationScript.trim().split(/\s+/);
    const progress = video.currentTime / video.duration;
    const idx = Math.min(Math.floor(progress * words.length), words.length - 1);
    setCurrentWordIndex(idx);
  };

  // Synchronisation audio avec la vidéo
  const handleVideoPlay = () => {
    if (audioRef.current && narrationAudioUrl) {
      audioRef.current.currentTime = videoRef.current?.currentTime || 0;
      audioRef.current.play().catch(() => {});
    }
  };
  const handleVideoPause = () => { audioRef.current?.pause(); };
  const handleVideoSeeked = () => {
    if (audioRef.current && videoRef.current) {
      audioRef.current.currentTime = videoRef.current.currentTime;
    }
  };
  const handleVideoEnded = () => {
    if (audioRef.current) audioRef.current.currentTime = 0;
    if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play().catch(() => {}); }
  };

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
      // Ne charger que si on est sur le tab images
      if (activeTab !== 'images') return;

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
  }, [image?.folder_id, images, activeTab]);

  // NEW: Charger vidéos si pas passées en props
  useEffect(() => {
    const loadVideos = async () => {
      // Ne charger que si on est sur le tab vidéos
      if (activeTab !== 'videos') return;

      // Si les vidéos sont déjà passées en props, ne pas les charger
      if (videos && videos.length > 0) {
        setLoadingVideos(false);
        if (!selectedVideo && videos.length > 0) {
          setSelectedVideo(videos[0]);
        }
        return;
      }

      setLoadingVideos(true);
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return;

        // Récupérer vidéos
        const { data: loadedVideos } = await supabase
          .from('my_videos')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        setAvailableVideos(loadedVideos || []);

        // Sélectionner la première vidéo si aucune n'est sélectionnée
        if (!selectedVideo && loadedVideos && loadedVideos.length > 0) {
          setSelectedVideo(loadedVideos[0]);
        }
      } catch (error) {
        console.error('[InstagramModal] Error loading videos:', error);
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
    // Support images ET vidéos
    if (activeTab === 'images' && selectedImage) {
      setSaving(true);
      try {
        await onSave(selectedImage, caption, hashtags, status);
        setSuccessToast(status === 'draft' ? '✅ Brouillon sauvegardé !' : '✅ Prêt à publier !');
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

        // Sauvegarder dans instagram_drafts pour les vidéos (Reels)
        const { error: insertError } = await supabase
          .from('instagram_drafts')
          .insert({
            user_id: user.id,
            video_id: selectedVideo.id,
            media_url: mergedVideoUrl || selectedVideo.video_url,
            media_type: 'video',
            category: 'draft',
            caption: caption || '',
            hashtags: hashtags || [],
            status: status
          });

        if (insertError) throw new Error(insertError.message);

        setSuccessToast(status === 'draft' ? '✅ Brouillon Reel sauvegardé !' : '✅ Reel prêt à publier !');
        setTimeout(() => setSuccessToast(null), 3000);
      } catch (err: any) {
        console.error('[InstagramModal] Save video draft error:', err);
        alert(`❌ Erreur de sauvegarde: ${err.message}`);
      } finally {
        setSaving(false);
      }
    } else {
      alert('Veuillez sélectionner un contenu (image ou vidéo)');
    }
  };

  const suggestHashtag = (tag: string) => {
    const fullTag = tag.startsWith('#') ? tag : `#${tag}`;
    if (!hashtags.includes(fullTag)) {
      setHashtags([...hashtags, fullTag]);
    }
  };

  const handleSuggest = async () => {
    // Check if any content is selected (image OR video)
    const hasContent = activeTab === 'images' ? selectedImage : selectedVideo;

    if (!hasContent) {
      alert('Veuillez sélectionner un contenu (image ou vidéo)');
      return;
    }

    setSuggesting(true);
    try {
      // Use thumbnail for videos, image URL for images
      let contentUrl: string;
      if (activeTab === 'images') {
        contentUrl = selectedImage?.image_url || '';
      } else {
        // Use thumbnail if available, otherwise proceed without image (text-only suggestion)
        contentUrl = selectedVideo?.thumbnail_url || '';
      }

      const contentTitle = activeTab === 'images'
        ? (selectedImage?.title || selectedImage?.news_title)
        : selectedVideo?.title;

      const response = await fetch('/api/instagram/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: contentUrl,
          imageTitle: contentTitle,
          newsTitle: selectedImage?.news_title || contentTitle,
          newsCategory: selectedImage?.news_category || 'general',
          contentAngle: contentAngle,
          userKeywords: userKeywords.trim() || undefined,
          audioUrl: narrationAudioUrl, // Include audio for AI context
          audioScript: narrationScript // Include audio script for AI context
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
    const hasContent = activeTab === 'images' ? selectedImage : selectedVideo;
    if (!hasContent) {
      alert('Veuillez sélectionner un contenu');
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

    const isVideo = activeTab === 'videos';
    const confirm = window.confirm(
      isVideo
        ? '🚀 Publier ce Reel maintenant sur Instagram ?\n\nVotre vidéo sera publiée immédiatement.'
        : '🚀 Publier maintenant sur Instagram ?\n\nVotre post sera publié immédiatement sur votre compte Instagram Business.'
    );

    if (!confirm) return;

    setPublishing(true);
    try {
      // Pour les vidéos, utiliser mergedVideoUrl si disponible
      const mediaUrl = isVideo
        ? (mergedVideoUrl || selectedVideo!.video_url)
        : selectedImage!.image_url;

      const response = await fetch('/api/library/instagram/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: mediaUrl,
          caption,
          hashtags,
          mediaType: isVideo ? 'video' : 'image'
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
    const hasContent = activeTab === 'images' ? selectedImage : selectedVideo;
    if (!hasContent) {
      alert('Veuillez sélectionner un contenu');
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

    const isVideo = activeTab === 'videos';
    const mediaUrl = isVideo
      ? (mergedVideoUrl || selectedVideo!.video_url)
      : selectedImage!.image_url;

    setPublishing(true);
    try {
      const response = await fetch('/api/library/instagram/publish-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: mediaUrl,
          mediaType: isVideo ? 'video' : 'image'
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

  // Si aucun contenu sélectionné et chargement terminé, ne rien afficher
  if (!selectedImage && !selectedVideo && !loadingImages && !loadingVideos && availableImages.length === 0 && availableVideos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mb-4">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
          </div>
          <h3 className="text-lg font-bold text-neutral-900 mb-2">Préparer un post Instagram</h3>
          <p className="text-neutral-600 text-sm mb-4">
            Vous n'avez pas encore de visuels dans votre galerie.
          </p>
          <div className="space-y-2.5 mb-6">
            <button
              onClick={() => { window.location.href = '/generate'; }}
              className="w-full px-5 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all text-sm"
            >
              Créer un visuel
            </button>
            <button
              onClick={() => { window.location.href = '/library'; }}
              className="w-full px-5 py-3 border-2 border-purple-200 text-purple-700 font-semibold rounded-lg hover:bg-purple-50 transition-all text-sm"
            >
              Ajouter un visuel à votre galerie
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 text-xs transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  // Pendant le chargement
  if ((loadingImages || loadingVideos) && !selectedImage && !selectedVideo) {
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

  // Si aucun contenu disponible
  if (!selectedImage && !selectedVideo) {
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

        {/* Toast de succès */}
        {successToast && (
          <div className="mx-4 sm:mx-6 mt-2 px-4 py-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium text-center animate-pulse">
            {successToast}
          </div>
        )}

        {/* TAB SWITCHER - Images / Vidéos (Reels) */}
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 sm:px-6 py-2">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('images')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'images'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              📸 Images ({availableImages.length})
            </button>
            <button
              onClick={() => setActiveTab('videos')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'videos'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              🎥 Reels ({availableVideos.length})
            </button>
          </div>
        </div>

        {/* NOUVEAU LAYOUT 3 COLONNES */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

          {/* GALERIE - SIDEBAR GAUCHE (Desktop seulement) */}
          <div className="hidden md:block md:w-24 lg:w-32 border-r border-neutral-200 overflow-y-auto bg-neutral-50">
            <div className="p-2 space-y-2">
              <p className="text-xs font-semibold text-neutral-500 px-2 mb-2">
                {activeTab === 'images' ? 'Sélectionner une image' : 'Sélectionner une vidéo'}
              </p>

              {/* IMAGES TAB */}
              {activeTab === 'images' && (
                <>
                  {loadingImages ? (
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
                      Aucune image
                    </p>
                  )}
                </>
              )}

              {/* VIDEOS TAB */}
              {activeTab === 'videos' && (
                <>
                  {loadingVideos ? (
                    [1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="aspect-square bg-neutral-200 rounded animate-pulse"></div>
                    ))
                  ) : (
                    availableVideos.map((vid) => (
                      <button
                        key={vid.id}
                        onClick={() => setSelectedVideo(vid)}
                        className={`
                          w-full aspect-square rounded-lg overflow-hidden transition-all relative
                          ${selectedVideo?.id === vid.id
                            ? 'ring-2 ring-pink-500 scale-105 shadow-lg'
                            : 'ring-1 ring-neutral-300 hover:ring-pink-300 hover:scale-102'
                          }
                        `}
                        title={vid.title || 'Vidéo'}
                      >
                        {vid.thumbnail_url ? (
                          <img
                            src={vid.thumbnail_url}
                            alt={vid.title || 'Vidéo'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={vid.video_url}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                          />
                        )}
                        {/* Play icon overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                        </div>
                      </button>
                    ))
                  )}
                  {!loadingVideos && availableVideos.length === 0 && (
                    <p className="text-xs text-neutral-400 text-center py-4">
                      Aucune vidéo
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* CARROUSEL MOBILE - En haut sur mobile seulement */}
          <div className="md:hidden border-b border-neutral-200 bg-neutral-50 p-3">
            <p className="text-xs font-semibold text-neutral-600 mb-2">
              {activeTab === 'images' ? 'Sélectionner une image' : 'Sélectionner une vidéo'}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-3 px-3">
              {/* IMAGES TAB */}
              {activeTab === 'images' && (
                <>
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
                </>
              )}

              {/* VIDEOS TAB */}
              {activeTab === 'videos' && (
                <>
                  {loadingVideos ? (
                    [1, 2, 3, 4].map(i => (
                      <div key={i} className="flex-shrink-0 w-20 h-20 bg-neutral-200 rounded-lg animate-pulse"></div>
                    ))
                  ) : (
                    availableVideos.map((vid) => (
                      <button
                        key={vid.id}
                        onClick={() => setSelectedVideo(vid)}
                        className={`
                          flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden transition-all relative
                          ${selectedVideo?.id === vid.id
                            ? 'ring-2 ring-pink-500 shadow-lg'
                            : 'ring-1 ring-neutral-300'
                          }
                        `}
                      >
                        {vid.thumbnail_url ? (
                          <img
                            src={vid.thumbnail_url}
                            alt={vid.title || 'Vidéo'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={vid.video_url}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                          />
                        )}
                        {/* Play icon overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
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

          {/* PREVIEW + FORM - RESTE À DROITE */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

            {/* PREVIEW STICKY - Desktop seulement */}
            {(selectedImage || selectedVideo) && (
              <div className="hidden md:block md:w-1/2 md:overflow-y-auto md:p-6 bg-neutral-50">
                <div className="md:sticky md:top-0">
                  <div className={`${activeTab === 'videos' && selectedVideo ? 'aspect-[4/5]' : 'aspect-square'} bg-black rounded-xl overflow-hidden border-2 border-neutral-200 shadow-lg max-h-[420px] mx-auto`}>
                    {activeTab === 'videos' && selectedVideo ? (
                      <div className="relative w-full h-full">
                        <video
                          ref={videoRef}
                          src={mergedVideoUrl || selectedVideo.video_url}
                          controls
                          autoPlay
                          onPlay={handleVideoPlay}
                          onPause={handleVideoPause}
                          onSeeked={handleVideoSeeked}
                          onEnded={handleVideoEnded}
                          onTimeUpdate={handleTimeUpdate}
                          className="w-full h-full object-cover"
                        />
                        {narrationAudioUrl && !mergedVideoUrl && (
                          <audio ref={audioRef} src={narrationAudioUrl} preload="auto" />
                        )}
                        {enableSubtitles && narrationScript && (() => {
                          const words = narrationScript.trim().split(/\s+/);
                          const displayText = narrationScript.length > 80 ? narrationScript.substring(0, 80) + '...' : narrationScript;
                          const isCentered = subtitleStyle === 'wordflash' || subtitleStyle === 'impact' || subtitleStyle === 'neon';
                          return (
                            <div className={`absolute left-1 right-1 text-center pointer-events-none ${isCentered ? 'inset-0 flex items-center justify-center' : 'bottom-8'}`}>
                              {subtitleStyle === 'wordflash' ? (
                                <span className={`inline-block ${subtitleCSS.wordflash}`}>
                                  {words[currentWordIndex] || ''}
                                </span>
                              ) : subtitleStyle === 'wordstay' ? (
                                <span className="inline-block max-w-[95%]">
                                  {words.slice(0, currentWordIndex + 1).map((w, i) => (
                                    <span key={i} className={`${i === currentWordIndex ? 'text-yellow-300' : 'text-white'} text-sm font-extrabold [text-shadow:_2px_2px_4px_rgb(0_0_0_/_90%)] mx-0.5`}>
                                      {w}
                                    </span>
                                  ))}
                                </span>
                              ) : subtitleStyle === 'neon' ? (
                                <span className={`inline-block ${subtitleCSS.neon}`}>
                                  {words[currentWordIndex] || ''}
                                </span>
                              ) : subtitleStyle === 'impact' ? (
                                <span className={`inline-block ${subtitleCSS.impact}`}>
                                  {displayText}
                                </span>
                              ) : (
                                <span className={`inline-block max-w-[95%] ${subtitleCSS[subtitleStyle]}`}>
                                  {displayText}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ) : activeTab === 'images' && selectedImage ? (
                      <img
                        src={selectedImage.image_url}
                        alt={selectedImage.title || selectedImage.news_title || 'Preview'}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  {/* Bouton Éditer l'image */}
                  {activeTab === 'images' && selectedImage && (
                    <button
                      onClick={() => setShowImageEditModal(true)}
                      className="mt-2 w-full py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Modifier l'image
                    </button>
                  )}
                  {activeTab === 'images' && selectedImage?.title && (
                    <p className="mt-2 text-sm font-medium text-neutral-700 text-center">
                      {selectedImage.title}
                    </p>
                  )}
                  {activeTab === 'images' && selectedImage?.news_category && (
                    <p className="mt-1 text-xs text-neutral-500 text-center">
                      {selectedImage.news_category}
                    </p>
                  )}
                  {activeTab === 'videos' && selectedVideo?.title && (
                    <p className="mt-2 text-sm font-medium text-neutral-700 text-center">
                      {selectedVideo.title}
                    </p>
                  )}
                  {activeTab === 'videos' && selectedVideo?.duration && (
                    <p className="mt-1 text-xs text-neutral-500 text-center">
                      Durée: {Math.round(selectedVideo.duration)}s
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

              {/* Mots-clés optionnels pour orienter la suggestion */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-1">
                  Mots-clés / phrase directrice <span className="text-xs font-normal text-neutral-500">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={userKeywords}
                  onChange={(e) => setUserKeywords(e.target.value)}
                  placeholder="Ex: promo été, lancement produit, témoignage client..."
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
                />
                <p className="text-xs text-neutral-400 mt-1">Orientez avec vos mots-clés pour personnaliser la suggestion</p>
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

              {/* Narration Audio (vidéos uniquement) */}
              {activeTab === 'videos' && selectedVideo && (
              <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-neutral-900">
                    🎙️ Narration Audio
                  </label>
                  {narrationAudioUrl && (
                    <span className="text-xs text-green-600 font-medium">✅ Audio généré</span>
                  )}
                </div>

                <p className="text-xs text-neutral-600 mb-3">
                  Générez une narration audio de votre description pour un meilleur engagement sur Instagram Reels
                </p>

                {!showNarrationEditor ? (
                  <button
                    onClick={() => setShowNarrationEditor(true)}
                    className="w-full px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {narrationAudioUrl ? '🎙️ Modifier l\'audio' : '🎙️ Générer l\'audio'}
                  </button>
                ) : (
                  <AudioEditorWidget
                    initialScript={narrationScript || caption}
                    initialAudioUrl={narrationAudioUrl}
                    caption={caption}
                    onSave={async (script, audioUrl) => {
                      setNarrationScript(script);
                      setNarrationAudioUrl(audioUrl);
                      setShowNarrationEditor(false);
                      setEnableSubtitles(true);

                      // Déterminer l'URL vidéo à fusionner
                      const currentVideoUrl = activeTab === 'videos' && selectedVideo
                        ? selectedVideo.video_url
                        : null;

                      if (!currentVideoUrl) {
                        setSuccessToast('🎙️ Audio prêt ! Sélectionnez une vidéo pour fusionner.');
                        setTimeout(() => setSuccessToast(null), 4000);
                        return;
                      }

                      // Fusion serveur audio + vidéo
                      setMerging(true);
                      setSuccessToast('🔄 Fusion audio + vidéo en cours...');

                      try {
                        console.log('[InstagramModal] Fusion serveur audio+vidéo...');
                        const mergeRes = await fetch('/api/merge-audio-video', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ videoUrl: currentVideoUrl, audioUrl })
                        });

                        const mergeData = await mergeRes.json();

                        if (mergeData.ok && mergeData.mergedUrl) {
                          setMergedVideoUrl(mergeData.mergedUrl);
                          console.log('[InstagramModal] ✅ Vidéo fusionnée:', mergeData.mergedUrl);

                          setSuccessToast('✅ Audio intégré dans la vidéo — Prêt à publier !');
                          setTimeout(() => setSuccessToast(null), 5000);

                          // Auto-save brouillon "ready" (prêt à publier)
                          try {
                            const supabase = supabaseBrowser();
                            const { data: { user } } = await supabase.auth.getUser();
                            if (user) {
                              await supabase.from('instagram_drafts').insert({
                                user_id: user.id,
                                video_id: selectedVideo?.id || null,
                                media_url: mergeData.mergedUrl,
                                media_type: 'video',
                                category: 'draft',
                                caption: caption || '',
                                hashtags: hashtags || [],
                                status: 'ready'
                              });
                              console.log('[InstagramModal] ✅ Brouillon sauvé (prêt à publier)');
                            }
                          } catch (err) {
                            console.warn('[InstagramModal] Auto-save failed (non bloquant):', err);
                          }
                        } else {
                          console.error('[InstagramModal] ❌ Merge failed:', mergeData.error);
                          setSuccessToast(`❌ Fusion échouée: ${mergeData.error}`);
                          setTimeout(() => setSuccessToast(null), 5000);
                        }
                      } catch (err: any) {
                        console.error('[InstagramModal] ❌ Merge request failed:', err);
                        setSuccessToast('❌ Erreur de fusion audio/vidéo');
                        setTimeout(() => setSuccessToast(null), 5000);
                      } finally {
                        setMerging(false);
                      }
                    }}
                    onCancel={() => {
                      setShowNarrationEditor(false);
                    }}
                  />
                )}
              </div>
              )}

              {/* Statut fusion audio + vidéo */}
              {narrationAudioUrl && activeTab === 'videos' && selectedVideo && (
                <div className={`border rounded-lg p-4 space-y-3 ${mergedVideoUrl ? 'border-green-300 bg-green-50' : merging ? 'border-blue-300 bg-blue-50' : 'border-red-300 bg-red-50'}`}>
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-neutral-900">
                      🎬 Audio + Vidéo
                    </label>
                    {merging ? (
                      <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                        <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                        Fusion en cours...
                      </span>
                    ) : mergedVideoUrl ? (
                      <span className="text-xs text-green-600 font-medium">✅ Audio intégré — Prêt à publier</span>
                    ) : (
                      <button
                        onClick={async () => {
                          const currentVideoUrl = selectedVideo.video_url;
                          if (!currentVideoUrl || !narrationAudioUrl) return;
                          setMerging(true);
                          setSuccessToast('🔄 Fusion audio + vidéo...');
                          try {
                            const mergeRes = await fetch('/api/merge-audio-video', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ videoUrl: currentVideoUrl, audioUrl: narrationAudioUrl })
                            });
                            const mergeData = await mergeRes.json();
                            if (mergeData.ok && mergeData.mergedUrl) {
                              setMergedVideoUrl(mergeData.mergedUrl);
                              setSuccessToast('✅ Audio intégré ! Prêt à publier.');
                              setTimeout(() => setSuccessToast(null), 4000);
                              const supabase = supabaseBrowser();
                              const { data: { user } } = await supabase.auth.getUser();
                              if (user) {
                                await supabase.from('instagram_drafts').insert({
                                  user_id: user.id,
                                  video_id: selectedVideo?.id || null,
                                  media_url: mergeData.mergedUrl,
                                  media_type: 'video',
                                  category: 'draft',
                                  caption: caption || '',
                                  hashtags: hashtags || [],
                                  status: 'ready'
                                });
                              }
                            } else {
                              setSuccessToast(`❌ Fusion échouée: ${mergeData.error}`);
                              setTimeout(() => setSuccessToast(null), 5000);
                            }
                          } catch (err: any) {
                            setSuccessToast('❌ Erreur de fusion');
                            setTimeout(() => setSuccessToast(null), 5000);
                          } finally { setMerging(false); }
                        }}
                        className="text-xs text-red-600 font-medium hover:text-red-700 underline"
                      >
                        🔄 Relancer la fusion
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-neutral-600">
                    {mergedVideoUrl
                      ? 'L\'audio est intégré dans la vidéo. La publication enverra cette vidéo avec le son.'
                      : merging
                      ? 'Intégration de l\'audio dans le fichier vidéo...'
                      : 'La fusion a échoué. Cliquez sur "Relancer la fusion" pour réessayer.'}
                  </p>
                </div>
              )}

              {/* Texte / Sous-titres (vidéos uniquement, indépendant de l'audio) */}
              {activeTab === 'videos' && selectedVideo && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
                  <label className="block text-sm font-semibold text-neutral-900">
                    📝 Texte / Sous-titres
                  </label>

                  {/* Checkbox sous-titres */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableSubtitles}
                      onChange={(e) => setEnableSubtitles(e.target.checked)}
                      className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                    />
                    <span className="text-xs font-medium text-neutral-800">
                      Afficher les sous-titres sur la vidéo
                    </span>
                  </label>

                  {enableSubtitles && (
                    <>
                      {/* Style de sous-titres */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-neutral-600">Style des sous-titres:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {([
                            { key: 'wordflash' as const, label: '⚡ Mot par mot' },
                            { key: 'wordstay' as const, label: '🎤 Karaoké' },
                            { key: 'neon' as const, label: '💜 Néon' },
                            { key: 'cinema' as const, label: '🎬 Cinéma' },
                            { key: 'impact' as const, label: '💥 Bold' },
                            { key: 'minimal' as const, label: '✦ Discret' },
                          ]).map((style) => (
                            <button
                              key={style.key}
                              onClick={() => setSubtitleStyle(style.key)}
                              className={`px-2 py-1 text-[10px] rounded border transition-all ${
                                subtitleStyle === style.key
                                  ? 'bg-green-600 text-white border-green-600'
                                  : 'bg-white text-green-700 border-green-300 hover:border-green-400'
                              }`}
                            >
                              {style.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Modifier le texte des sous-titres */}
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-medium text-neutral-700">
                          Texte affiché (modifiable):
                        </label>
                        <textarea
                          value={narrationScript}
                          onChange={(e) => setNarrationScript(e.target.value)}
                          rows={2}
                          className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                          placeholder="Texte à afficher sur la vidéo..."
                        />
                        {narrationAudioUrl && (
                          <button
                            onClick={async () => {
                              if (!narrationScript.trim() || !selectedVideo) return;
                              const currentVideoUrl = selectedVideo.video_url;

                              setMerging(true);
                              setSuccessToast('🔄 Finalisation de la vidéo...');
                              try {
                                const audioRes = await fetch('/api/generate-audio-tts', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ text: narrationScript.trim(), targetDuration: 5, voice: selectedVoice, speed: 1.0 })
                                });
                                const audioData = await audioRes.json();
                                if (!audioData.ok) throw new Error(audioData.error);

                                setNarrationAudioUrl(audioData.audioUrl);
                                setNarrationScript(audioData.condensedText || narrationScript);

                                const mergeRes = await fetch('/api/merge-audio-video', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ videoUrl: currentVideoUrl, audioUrl: audioData.audioUrl })
                                });
                                const mergeData = await mergeRes.json();
                                if (mergeData.ok && mergeData.mergedUrl) {
                                  setMergedVideoUrl(mergeData.mergedUrl);
                                  setSuccessToast('✅ Texte mis à jour !');
                                  setTimeout(() => setSuccessToast(null), 4000);

                                  const supabase = supabaseBrowser();
                                  const { data: { user } } = await supabase.auth.getUser();
                                  if (user) {
                                    await supabase.from('instagram_drafts').insert({
                                      user_id: user.id,
                                      video_id: selectedVideo?.id || null,
                                      media_url: mergeData.mergedUrl,
                                      media_type: 'video',
                                      category: 'draft',
                                      caption: caption || '',
                                      hashtags: hashtags || [],
                                      status: 'ready'
                                    });
                                  }
                                } else {
                                  setSuccessToast(`❌ Fusion échouée: ${mergeData.error}`);
                                  setTimeout(() => setSuccessToast(null), 5000);
                                }
                              } catch (err: any) {
                                setSuccessToast(`❌ Erreur: ${err.message}`);
                                setTimeout(() => setSuccessToast(null), 5000);
                              } finally { setMerging(false); }
                            }}
                            disabled={merging || !narrationScript.trim()}
                            className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              merging || !narrationScript.trim()
                                ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                          >
                            {merging ? '⏳ En cours...' : '🔄 Appliquer le texte modifié'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

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
                      {selectedImage?.news_category && (
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
          {/* Statut de connexion Instagram (discret) */}
          {!checkingConnection && isInstagramConnected && (
            <div className="mb-3">
              <div className="flex items-center justify-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg py-2 px-3 border border-green-200">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Connecté : <strong>@{instagramUsername}</strong></span>
              </div>
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
                  onClick={() => setShowCarouselModal(true)}
                  className="flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow-lg hover:shadow-xl"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
                  </svg>
                  <span className="hidden sm:inline">Carrousel</span>
                  <span className="sm:hidden">Carousel</span>
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

      {/* Modal Carrousel */}
      {showCarouselModal && (
        <InstagramCarouselModal
          images={availableImages}
          onClose={() => setShowCarouselModal(false)}
        />
      )}

      {/* Modal Édition d'image */}
      {showImageEditModal && selectedImage && (
        <ImageEditModal
          imageUrl={selectedImage.image_url}
          originalImageUrl={selectedImage.original_image_url}
          imageId={selectedImage.id}
          initialText={selectedImage.text_overlay || ''}
          onClose={() => setShowImageEditModal(false)}
          onImageEdited={(newUrl, textOverlay) => {
            setSelectedImage({ ...selectedImage, image_url: newUrl, text_overlay: textOverlay || selectedImage.text_overlay, original_image_url: selectedImage.original_image_url || selectedImage.image_url });
            setAvailableImages(prev => prev.map(img =>
              img.id === selectedImage.id ? { ...img, image_url: newUrl, text_overlay: textOverlay || img.text_overlay, original_image_url: img.original_image_url || img.image_url } : img
            ));
            setShowImageEditModal(false);
          }}
        />
      )}
    </div>
  );
}
