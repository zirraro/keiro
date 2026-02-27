'use client';

import { useState, useEffect, useRef } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import TikTokCarouselModal from './TikTokCarouselModal';
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
  published_to_tiktok: boolean;
  tiktok_published_at?: string;
  file_size?: number;
  subtitle_text?: string;
  audio_url?: string;
};

interface TikTokModalProps {
  image?: SavedImage;
  images?: SavedImage[];
  video?: MyVideo; // NEW: Support for video
  videos?: MyVideo[]; // NEW: Support for videos array
  onClose: () => void;
  onPublishSuccess?: () => void | Promise<void>; // NEW: Callback après publication réussie
  onSave: (image: SavedImage, caption: string, hashtags: string[], status: 'draft' | 'ready') => Promise<void>;
  draftCaption?: string;
  draftHashtags?: string[];
}

export default function TikTokModal({ image, images, video, videos, onClose, onPublishSuccess, onSave, draftCaption, draftHashtags }: TikTokModalProps) {
  const [caption, setCaption] = useState(draftCaption || '');
  const [hashtags, setHashtags] = useState<string[]>(draftHashtags || []);
  const [hashtagInput, setHashtagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isTikTokConnected, setIsTikTokConnected] = useState(false);
  const [tiktokUsername, setTikTokUsername] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(true);

  // États pour la prévisualisation vidéo
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [videoTaskId, setVideoTaskId] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [videoDuration, setVideoDuration] = useState(5);
  const isProcessingVideoRef = useRef(false);

  // État pour le modal carrousel
  const [showCarouselModal, setShowCarouselModal] = useState(false);

  // NEW: Tab switching state (Images/Videos) - Default to videos
  const [activeTab, setActiveTab] = useState<'images' | 'videos'>('videos');

  // États pour la conversion vidéo
  const [converting, setConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionStage, setConversionStage] = useState('');

  // États pour la narration audio
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

  // État pour l'édition d'image
  const [showImageEditModal, setShowImageEditModal] = useState(false);

  // États pour la galerie IMAGES
  const [availableImages, setAvailableImages] = useState<SavedImage[]>(images || []);
  const [selectedImage, setSelectedImage] = useState<SavedImage | null>(image || null);
  const [loadingImages, setLoadingImages] = useState(!images && !video);

  // NEW: États pour la galerie VIDEOS
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
  const [contentAngle, setContentAngle] = useState('viral');
  const [userKeywords, setUserKeywords] = useState('');

  // Pré-remplir caption et hashtags depuis le brouillon
  useEffect(() => {
    if (draftCaption !== undefined) {
      setCaption(draftCaption);
    }
    if (draftHashtags !== undefined) {
      setHashtags(draftHashtags);
    }
  }, [draftCaption, draftHashtags]);

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
        console.error('[TikTokModal] Error checking TikTok connection:', error);
      } finally {
        setCheckingConnection(false);
      }
    };

    checkTikTokConnection();
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

        // Récupérer images
        const query = supabase
          .from('saved_images')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
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
        console.error('[TikTokModal] Error loading images:', error);
      } finally {
        setLoadingImages(false);
      }
    };

    loadImages();
  }, [image?.folder_id, images, activeTab]);

  // NEW: Charger vidéos si pas passées en props
  useEffect(() => {
    const loadVideos = async () => {
      // Ne charger que si on est sur le tab videos
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

        // Récupérer vidéos depuis my_videos ET tiktok_posts
        const { data: myVids } = await supabase
          .from('my_videos')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        const { data: tiktokPosts } = await supabase
          .from('tiktok_posts')
          .select('*')
          .eq('user_id', user.id)
          .order('posted_at', { ascending: false })
          .limit(20);

        // Combiner les vidéos en format unifié
        const allVideos = [
          ...(myVids || []),
          ...(tiktokPosts || []).map((post: any) => ({
            id: post.id,
            video_url: post.cached_video_url || post.share_url,
            thumbnail_url: post.cover_image_url || post.cached_thumbnail_url,
            title: post.video_description,
            duration: post.duration,
            source_type: 'tiktok_sync',
            created_at: post.posted_at
          }))
        ];

        setAvailableVideos(allVideos);

        // Sélectionner la première vidéo si aucune n'est sélectionnée
        if (!selectedVideo && allVideos && allVideos.length > 0) {
          setSelectedVideo(allVideos[0]);
        }
      } catch (error) {
        console.error('[TikTokModal] Error loading videos:', error);
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

        // Sauvegarder directement dans tiktok_drafts pour les vidéos
        const { error: insertError } = await supabase
          .from('tiktok_drafts')
          .insert({
            user_id: user.id,
            video_id: selectedVideo.id,
            media_url: selectedVideo.video_url,
            media_type: 'video',
            category: 'draft',
            caption: caption || '',
            hashtags: hashtags || [],
            status: status
          });

        if (insertError) throw new Error(insertError.message);

        setSuccessToast(status === 'draft' ? '✅ Brouillon vidéo sauvegardé !' : '✅ Vidéo prête à publier !');
        setTimeout(() => setSuccessToast(null), 3000);
      } catch (err: any) {
        console.error('[TikTokModal] Save video draft error:', err);
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

      const response = await fetch('/api/tiktok/suggest', {
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
          audioUrl: narrationAudioUrl, // Include audio for context
          audioScript: narrationScript // Include audio script for context
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
      console.error('[TikTokModal] Error suggesting:', error);
      alert('Erreur lors de la génération des suggestions');
    } finally {
      setSuggesting(false);
    }
  };

  // Déterminer si l'image sélectionnée est déjà une vidéo
  const isVideo = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  // Réinitialiser la prévisualisation quand l'image/vidéo sélectionnée change
  useEffect(() => {
    if (activeTab === 'images' && selectedImage) {
      // Check if it's a video file OR a TikTok video from our gallery
      const isTikTokVideo = selectedImage.title?.includes('Vidéo TikTok') ||
                           selectedImage.title?.includes('TikTok') ||
                           isVideo(selectedImage.image_url);

      if (isTikTokVideo) {
        // If it's already a video or TikTok video, set it as preview automatically
        setVideoPreview(selectedImage.image_url);
        console.log('[TikTokModal] Auto-detected TikTok video:', selectedImage.title);
      } else {
        setVideoPreview(null);
      }
    } else if (activeTab === 'videos' && selectedVideo) {
      // If we're on videos tab and have a selected video, use it directly
      setVideoPreview(selectedVideo.video_url);
      console.log('[TikTokModal] Selected video:', selectedVideo.title);
    } else {
      setVideoPreview(null);
    }

    setVideoTaskId(null);
    // Clear any existing polling interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [selectedImage, selectedVideo, activeTab]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const pollVideoStatus = async (taskId: string) => {
    // Guard: empêcher les polls concurrents (évite les doubles saves)
    if (isProcessingVideoRef.current) return;

    try {
      const response = await fetch('/api/seedream/i2v', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });

      const data = await response.json();

      if (data.status === 'completed' && data.videoUrl) {
        isProcessingVideoRef.current = true; // Lock avant download
        // Video ready! Download and store server-side to avoid CORS
        console.log('[TikTokModal] Video generated, downloading and storing via server...');

        try {
          // Call server-side endpoint to download from Seedream and upload to Supabase
          const response = await fetch('/api/seedream/download-and-store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoUrl: data.videoUrl,
              originalImageId: selectedImage?.id,
              title: `Vidéo TikTok - ${selectedImage?.title || 'Sans titre'}`,
              duration: videoDuration,
            })
          });

          const result = await response.json();

          if (!result.ok) {
            throw new Error(result.error || 'Failed to download and store video');
          }

          console.log('[TikTokModal] Video downloaded and stored successfully:', result.videoUrl);

          // Use the Supabase URL as preview
          setVideoPreview(result.videoUrl);

          // Reload images to show the newly added video
          const supabase = supabaseBrowser();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: loadedImages } = await supabase
              .from('saved_images')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(20);

            if (loadedImages) {
              setAvailableImages(loadedImages);
            }
          }

        } catch (uploadError: any) {
          console.error('[TikTokModal] Error downloading and storing video:', {
            error: uploadError.message,
            stack: uploadError.stack
          });

          // Try to use Seedream URL as temporary fallback
          setVideoPreview(data.videoUrl);

          alert(
            `⚠️ Vidéo générée mais sauvegarde échouée\n\n` +
            `Erreur: ${uploadError.message || 'Échec du téléchargement'}\n\n` +
            `La vidéo est disponible temporairement pour publication,\n` +
            `mais ne sera pas sauvegardée dans votre galerie.\n\n` +
            `Conseil: Publiez maintenant ou régénérez la vidéo.`
          );
        }

        setGeneratingPreview(false);
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }

      } else if (data.status === 'failed' || !data.ok) {
        setGeneratingPreview(false);
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }

        const errorMessage = data.error || 'Une erreur est survenue lors de la génération';
        console.error('[TikTokModal] Video generation failed:', {
          error: data.error,
          status: data.status,
          fullResponse: data
        });

        alert(
          `❌ Échec de la génération vidéo\n\n` +
          `${errorMessage}\n\n` +
          `Suggestions:\n` +
          `• Réessayez avec une autre image\n` +
          `• Vérifiez que l'image est accessible\n` +
          `• Contactez le support si le problème persiste`
        );
      } else {
        // Still processing
        console.log('[TikTokModal] Video still processing...', data.status, data.progress);
      }
    } catch (error: any) {
      console.error('[TikTokModal] Error polling video status:', error);
      setGeneratingPreview(false);
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  };

  const handleGeneratePreview = async () => {
    if (!selectedImage) {
      alert('Veuillez sélectionner une image');
      return;
    }

    // If already a video, use it directly
    if (isVideo(selectedImage.image_url)) {
      setVideoPreview(selectedImage.image_url);
      alert('✅ Ce fichier est déjà une vidéo, pas de conversion nécessaire.');
      return;
    }

    setGeneratingPreview(true);
    isProcessingVideoRef.current = false; // Reset guard pour nouvelle génération
    try {
      console.log('[TikTokModal] Starting Seedream I2V conversion...');

      // Call Seedream I2V API
      const response = await fetch('/api/seedream/i2v', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: selectedImage.image_url,
          prompt: 'Create a smooth cinematic video from this image with subtle camera movement',
          duration: videoDuration,
          resolution: '1080p'
        })
      });

      const data = await response.json();

      if (!data.ok || !data.taskId) {
        throw new Error(data.error || 'Failed to start video generation');
      }

      console.log('[TikTokModal] Video task created:', data.taskId);
      setVideoTaskId(data.taskId);

      // Start polling for status
      const interval = setInterval(() => {
        pollVideoStatus(data.taskId);
      }, 3000); // Poll every 3 seconds

      setPollingInterval(interval);

    } catch (error: any) {
      console.error('[TikTokModal] Error generating preview:', error);
      alert(`❌ Erreur lors de la génération de la vidéo:\n${error.message || 'Une erreur est survenue'}`);
      setGeneratingPreview(false);
    }
  };


  const handlePublishNow = async () => {
    // Check what's selected based on active tab
    const hasSelectedItem = activeTab === 'images' ? selectedImage : selectedVideo;
    if (!hasSelectedItem) {
      alert(`Veuillez sélectionner une ${activeTab === 'images' ? 'image' : 'vidéo'}`);
      return;
    }

    if (!caption.trim()) {
      alert('Veuillez écrire une description pour votre vidéo TikTok');
      return;
    }

    if (!isTikTokConnected) {
      alert('Veuillez d\'abord connecter votre compte TikTok');
      return;
    }

    // If it's an image and no video preview yet, generate one first
    if (activeTab === 'images' && selectedImage && !isVideo(selectedImage.image_url) && !videoPreview) {
      alert('⚠️ Veuillez d\'abord générer la vidéo avant de publier.\n\nCliquez sur "✨ Générer la vidéo" pour créer votre vidéo.');
      return;
    }

    // Determine video URL and ID based on active tab
    // Priorité: vidéo fusionnée (audio intégré) > vidéo originale
    let videoUrlToPublish: string;
    let videoIdToUpdate: string | null = null;

    if (mergedVideoUrl) {
      // Vidéo avec audio intégré - toujours prioritaire
      videoUrlToPublish = mergedVideoUrl;
      videoIdToUpdate = selectedVideo?.id || null;
      console.log('[TikTokModal] Using merged video (audio intégré)');
    } else if (activeTab === 'videos' && selectedVideo) {
      videoUrlToPublish = selectedVideo.video_url;
      videoIdToUpdate = selectedVideo.id;
    } else if (activeTab === 'images' && selectedImage) {
      videoUrlToPublish = videoPreview || selectedImage.image_url;
    } else {
      throw new Error('No video selected');
    }

    setPublishing(true);

    // STEP 1: Ensure video is on Supabase (permanent URL)
    let tiktokReadyVideoUrl: string;
    try {
      const isOnSupabase = videoUrlToPublish.includes('supabase.co') || videoUrlToPublish.includes('supabase.in');

      if (isOnSupabase) {
        console.log('[TikTokModal] ✅ Video already on Supabase');
        tiktokReadyVideoUrl = videoUrlToPublish;
      } else {
        console.log('[TikTokModal] URL temporaire détectée, stockage Supabase...');

        const storeResponse = await fetch('/api/seedream/download-and-store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: videoUrlToPublish,
            title: caption.substring(0, 50) || 'Vidéo TikTok'
          })
        });

        const storeData = await storeResponse.json();

        if (storeData.ok && storeData.videoUrl) {
          console.log('[TikTokModal] ✅ Stocké sur Supabase:', storeData.videoUrl);
          tiktokReadyVideoUrl = storeData.videoUrl;
          if (storeData.videoId && !videoIdToUpdate) {
            videoIdToUpdate = storeData.videoId;
          }
        } else {
          setPublishing(false);
          alert(`❌ Erreur de préparation\n\n${storeData.error}\n\nVeuillez réessayer.`);
          return;
        }
      }
    } catch (storeError: any) {
      console.error('[TikTokModal] ❌ Store failed:', storeError);
      setPublishing(false);
      alert('❌ Impossible de préparer la vidéo.\n\nVérifiez votre connexion et réessayez.');
      return;
    }

    // STEP 2: Validate video format
    let needsConversion = false;
    try {
      console.log('[TikTokModal] Validation du format vidéo...');
      const validateResponse = await fetch('/api/library/tiktok/validate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: tiktokReadyVideoUrl })
      });

      const validateData = await validateResponse.json();

      if (validateData.ok && validateData.isValid) {
        console.log('[TikTokModal] ✅ Format vidéo OK, publication directe');
        if (validateData.warnings?.length > 0) {
          console.warn('[TikTokModal] Warnings:', validateData.warnings);
        }
      } else if (validateData.ok && !validateData.isValid) {
        console.warn('[TikTokModal] ⚠️ Format incompatible:', validateData.errors);
        needsConversion = true;
      } else {
        // Erreur de validation non bloquante - on tente quand même
        console.warn('[TikTokModal] Validation échouée, on tente la publication directe');
      }
    } catch (validationError: any) {
      console.warn('[TikTokModal] Validation error (non bloquant):', validationError.message);
    }

    // STEP 2b: CloudConvert UNIQUEMENT si le format est incompatible
    if (needsConversion) {
      console.log('[TikTokModal] Conversion CloudConvert nécessaire (format incompatible)...');
      try {
        const conversionResponse = await fetch('/api/convert-video-tiktok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: tiktokReadyVideoUrl,
            videoId: videoIdToUpdate
          })
        });

        const conversionData = await conversionResponse.json();

        if (conversionData.ok && conversionData.convertedUrl) {
          console.log('[TikTokModal] ✅ CloudConvert: conversion réussie');
          tiktokReadyVideoUrl = conversionData.convertedUrl;
        } else {
          console.warn('[TikTokModal] ⚠️ CloudConvert échoué:', conversionData.error);
          const continueAnyway = window.confirm(
            '⚠️ La conversion de format a échoué.\n\n' +
            'Voulez-vous essayer de publier quand même ?\n' +
            '(La vidéo est peut-être déjà compatible)'
          );
          if (!continueAnyway) {
            setPublishing(false);
            return;
          }
        }
      } catch (convError: any) {
        console.warn('[TikTokModal] CloudConvert request failed:', convError.message);
        // Non bloquant - on tente la publication directe
      }
    }

    // STEP 3: Confirm with user
    const confirm = window.confirm(
      '🎵 Publier maintenant sur TikTok ?\n\n' +
      '🚀 La vidéo sera publiée immédiatement sur votre compte\n\n' +
      'Continuer ?'
    );

    if (!confirm) {
      setPublishing(false);
      return;
    }

    // STEP 4: Publish to TikTok
    try {
      console.log('[TikTokModal] Publishing to TikTok with URL:', tiktokReadyVideoUrl);

      const response = await fetch('/api/library/tiktok/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          videoUrl: tiktokReadyVideoUrl,
          caption,
          hashtags
        })
      });

      const data = await response.json();

      if (data.ok) {
        const successMessage = `🎉 Vidéo publiée avec succès sur TikTok !\n\n✅ Publication réussie\n💬 Les interactions vont commencer\n\nFélicitations ! 🚀`;
        alert(successMessage);

        if (data.post?.share_url) {
          const openPost = window.confirm('Voulez-vous ouvrir TikTok pour voir votre vidéo ?');
          if (openPost) {
            window.open(data.post.share_url, '_blank');
          }
        }

        // Rafraîchir le widget TikTok pour afficher la nouvelle publication
        await onPublishSuccess?.();

        onClose();
      } else {
        throw new Error(data.error || 'Erreur lors de la publication');
      }
    } catch (error: any) {
      console.error('[TikTokModal] Error publishing:', error);
      alert(`❌ Erreur lors de la publication:\n${error.message || 'Une erreur est survenue'}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleConnectTikTok = () => {
    window.location.href = '/api/auth/tiktok-oauth';
  };

  // Only show "no content" error if no images AND no videos AND loading finished AND none available
  if (!selectedImage && !selectedVideo && !loadingImages && !loadingVideos && availableImages.length === 0 && availableVideos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full mb-4">
            <span className="text-3xl">🎵</span>
          </div>
          <h3 className="text-lg font-bold text-neutral-900 mb-2">Préparer un post TikTok</h3>
          <p className="text-neutral-600 text-sm mb-4">
            Vous n'avez pas encore de visuels dans votre galerie.
          </p>
          <div className="space-y-2.5 mb-6">
            <button
              onClick={() => { window.location.href = '/generate'; }}
              className="w-full px-5 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all text-sm"
            >
              Créer un visuel
            </button>
            <button
              onClick={() => { window.location.href = '/library'; }}
              className="w-full px-5 py-3 border-2 border-cyan-200 text-cyan-700 font-semibold rounded-lg hover:bg-cyan-50 transition-all text-sm"
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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b bg-gradient-to-r from-cyan-50 to-blue-50">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-xl">🎵</span>
            </div>
            <h2 className="text-lg sm:text-2xl font-bold text-neutral-900">Préparer une vidéo TikTok</h2>
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

        {/* Toast de succès */}
        {successToast && (
          <div className="mx-4 sm:mx-6 mt-2 px-4 py-2.5 bg-green-50 border border-green-300 rounded-lg text-sm text-green-800 font-medium flex items-center gap-2 animate-pulse">
            {successToast}
          </div>
        )}

        {/* TAB SWITCHER - Videos/Images (Videos first) */}
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 sm:px-6 py-2">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('videos')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'videos'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              🎬 Vidéos ({availableVideos.length})
            </button>
            <button
              onClick={() => setActiveTab('images')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'images'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              📸 Images ({availableImages.length})
            </button>
          </div>
        </div>

        {/* LAYOUT 3 COLONNES */}
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
                            ? 'ring-2 ring-cyan-500 scale-105 shadow-lg'
                            : 'ring-1 ring-neutral-300 hover:ring-cyan-300 hover:scale-102'
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
                            ? 'ring-2 ring-cyan-500 scale-105 shadow-lg'
                            : 'ring-1 ring-neutral-300 hover:ring-cyan-300 hover:scale-102'
                          }
                        `}
                        title={vid.title || 'Vidéo'}
                      >
                        {vid.thumbnail_url ? (
                          <>
                            <img
                              src={vid.thumbnail_url}
                              alt={vid.title || 'Vidéo'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Replace with video fallback
                                const parent = e.currentTarget.parentElement;
                                if (parent && vid.video_url) {
                                  e.currentTarget.style.display = 'none';
                                  const videoEl = document.createElement('video');
                                  videoEl.src = vid.video_url;
                                  videoEl.className = 'w-full h-full object-cover';
                                  videoEl.muted = true;
                                  videoEl.playsInline = true;
                                  videoEl.preload = 'metadata';
                                  parent.insertBefore(videoEl, parent.firstChild);
                                }
                              }}
                            />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            </div>
                          </>
                        ) : vid.video_url ? (
                          <>
                            <video
                              src={vid.video_url}
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                            />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-cyan-50 to-blue-50 flex flex-col items-center justify-center gap-2">
                            <svg className="w-8 h-8 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                            <span className="text-xs text-neutral-500">Vidéo</span>
                          </div>
                        )}
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
                            ? 'ring-2 ring-cyan-500 scale-105'
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
                            ? 'ring-2 ring-cyan-500 scale-105'
                            : 'ring-1 ring-neutral-300'
                          }
                        `}
                      >
                        {vid.thumbnail_url ? (
                          <>
                            <img
                              src={vid.thumbnail_url}
                              alt={vid.title || 'Vidéo'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Replace with video fallback
                                const parent = e.currentTarget.parentElement;
                                if (parent && vid.video_url) {
                                  e.currentTarget.style.display = 'none';
                                  const videoEl = document.createElement('video');
                                  videoEl.src = vid.video_url;
                                  videoEl.className = 'w-full h-full object-cover';
                                  videoEl.muted = true;
                                  videoEl.playsInline = true;
                                  videoEl.preload = 'metadata';
                                  parent.insertBefore(videoEl, parent.firstChild);
                                }
                              }}
                            />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            </div>
                          </>
                        ) : vid.video_url ? (
                          <>
                            <video
                              src={vid.video_url}
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                            />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-cyan-50 to-blue-50 flex flex-col items-center justify-center gap-1">
                            <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                            <span className="text-[10px] text-neutral-500">Vidéo</span>
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          </div>

          {/* APERÇU IMAGE/VIDÉO - COLONNE CENTRALE */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto bg-gradient-to-br from-cyan-50 to-blue-50">
            {(selectedImage || selectedVideo) && (
              <div className="max-w-[280px] mx-auto">
                <div className="aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl mb-3 bg-black">
                  {(videoPreview || mergedVideoUrl) ? (
                    <div className="relative w-full h-full">
                      <video
                        ref={videoRef}
                        src={mergedVideoUrl || videoPreview || ''}
                        controls
                        autoPlay
                        onPlay={handleVideoPlay}
                        onPause={handleVideoPause}
                        onSeeked={handleVideoSeeked}
                        onEnded={handleVideoEnded}
                        onTimeUpdate={handleTimeUpdate}
                        className="w-full h-full object-cover"
                      />
                      {/* Audio séparé uniquement si pas encore fusionné */}
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
                      alt={selectedImage.title || 'Selected'}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>

                {/* Bouton Éditer l'image */}
                {activeTab === 'images' && selectedImage && (
                  <button
                    onClick={() => setShowImageEditModal(true)}
                    className="w-full mb-2 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Modifier l'image
                  </button>
                )}

                {/* Bouton de prévisualisation (only for images tab) */}
                {activeTab === 'images' && selectedImage && !isVideo(selectedImage.image_url) && !selectedImage.title?.includes('Vidéo TikTok') && (
                  <div className="mb-2 space-y-2">
                    {/* Slider durée vidéo */}
                    {!videoPreview && (
                      <div className="bg-purple-50 rounded-lg border border-purple-200 p-2">
                        <label className="text-xs font-medium text-neutral-700">
                          Durée : <span className="text-purple-600 font-bold">{videoDuration}s</span>
                        </label>
                        <input
                          type="range"
                          min={5}
                          max={12}
                          step={1}
                          value={videoDuration}
                          onChange={(e) => setVideoDuration(Number(e.target.value))}
                          className="w-full h-1.5 accent-purple-600 mt-1"
                        />
                        <div className="flex justify-between text-[8px] text-neutral-400 mt-0.5">
                          <span>5s</span><span>8s</span><span>12s</span>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={handleGeneratePreview}
                      disabled={generatingPreview}
                      className={`w-full px-4 py-2 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-2 text-sm ${
                        generatingPreview
                          ? 'bg-neutral-400 cursor-not-allowed'
                          : videoPreview
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:shadow-lg'
                      }`}
                    >
                      {generatingPreview ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Génération vidéo...</span>
                        </>
                      ) : videoPreview ? (
                        <>
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span>Vidéo générée ✓</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                          </svg>
                          <span>✨ Générer la vidéo ({videoDuration}s)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className={`${activeTab === 'videos' || (activeTab === 'images' && selectedImage && (isVideo(selectedImage.image_url) || selectedImage.title?.includes('Vidéo TikTok'))) ? 'bg-green-100 border-green-200' : 'bg-cyan-100 border-cyan-200'} border rounded-lg p-2`}>
                  <p className={`text-[10px] ${activeTab === 'videos' || (activeTab === 'images' && selectedImage && (isVideo(selectedImage.image_url) || selectedImage.title?.includes('Vidéo TikTok'))) ? 'text-green-900' : 'text-cyan-900'} flex items-start gap-1.5`}>
                    <svg className="w-3 h-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <span>
                      {activeTab === 'videos'
                        ? '✅ Vidéo prête pour publication TikTok'
                        : activeTab === 'images' && selectedImage && (isVideo(selectedImage.image_url) || selectedImage.title?.includes('Vidéo TikTok'))
                          ? '✅ Vidéo prête pour publication TikTok'
                          : videoPreview
                            ? `✅ Vidéo animée générée (9:16, ${videoDuration}s)`
                            : '🎬 Votre image sera convertie en vidéo animée'
                      }
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* FORMULAIRE - SIDEBAR DROITE */}
          <div className="md:w-96 lg:w-[28rem] border-l border-neutral-200 overflow-y-auto bg-white">
            <div className="p-4 sm:p-6 space-y-6">

              {/* Angle du contenu */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Ton de la vidéo
                </label>
                <select
                  value={contentAngle}
                  onChange={(e) => setContentAngle(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                >
                  <option value="viral">🔥 Viral / Tendance</option>
                  <option value="fun">😄 Amusant / Léger</option>
                  <option value="informatif">📚 Informatif</option>
                  <option value="inspirant">✨ Inspirant</option>
                  <option value="educatif">🎓 Éducatif</option>
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
                  placeholder="Ex: tendance, behind the scenes, astuce rapide..."
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                />
                <p className="text-xs text-neutral-400 mt-1">Orientez avec vos mots-clés pour personnaliser la suggestion</p>
              </div>

              {/* Bouton suggérer IA */}
              <div>
                <button
                  onClick={handleSuggest}
                  disabled={suggesting || (activeTab === 'images' ? !selectedImage : !selectedVideo)}
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
                  Description de la vidéo
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={6}
                  placeholder="Écrivez une description engageante pour votre vidéo TikTok..."
                  className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none text-sm"
                  maxLength={2200}
                />
                <p className="text-xs text-neutral-500 mt-1">{caption.length} / 2200 caractères</p>
              </div>

              {/* Narration Audio (vidéos uniquement) */}
              {(activeTab === 'videos' && selectedVideo) || videoPreview ? (
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
                  Générez une narration audio de votre description pour un meilleur engagement TikTok
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
                        : videoPreview;

                      if (!currentVideoUrl) {
                        setSuccessToast('🎙️ Audio prêt ! Sélectionnez une vidéo pour fusionner.');
                        setTimeout(() => setSuccessToast(null), 4000);
                        return;
                      }

                      // Fusion serveur audio + vidéo
                      setMerging(true);
                      setSuccessToast('🔄 Fusion audio + vidéo en cours...');

                      try {
                        console.log('[TikTokModal] Fusion serveur audio+vidéo...');
                        const mergeRes = await fetch('/api/merge-audio-video', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ videoUrl: currentVideoUrl, audioUrl })
                        });

                        const mergeData = await mergeRes.json();

                        if (mergeData.ok && mergeData.mergedUrl) {
                          setMergedVideoUrl(mergeData.mergedUrl);
                          console.log('[TikTokModal] ✅ Vidéo fusionnée:', mergeData.mergedUrl);

                          setSuccessToast('✅ Audio intégré dans la vidéo — Prêt à publier !');
                          setTimeout(() => setSuccessToast(null), 5000);

                          // Auto-save brouillon "ready" (prêt à publier)
                          try {
                            const supabase = supabaseBrowser();
                            const { data: { user } } = await supabase.auth.getUser();
                            if (user) {
                              await supabase.from('tiktok_drafts').insert({
                                user_id: user.id,
                                video_id: selectedVideo?.id || null,
                                media_url: mergeData.mergedUrl,
                                media_type: 'video',
                                category: 'draft',
                                caption: caption || '',
                                hashtags: hashtags || [],
                                status: 'ready'
                              });
                              console.log('[TikTokModal] ✅ Brouillon sauvé (prêt à publier)');
                            }
                          } catch (err) {
                            console.warn('[TikTokModal] Auto-save failed (non bloquant):', err);
                          }
                        } else {
                          console.error('[TikTokModal] ❌ Merge failed:', mergeData.error);
                          setSuccessToast(`❌ Fusion échouée: ${mergeData.error}`);
                          setTimeout(() => setSuccessToast(null), 5000);
                        }
                      } catch (err: any) {
                        console.error('[TikTokModal] ❌ Merge request failed:', err);
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
              ) : null}

              {/* Statut fusion audio + vidéo */}
              {narrationAudioUrl && (selectedVideo || videoPreview) && (
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
                          const currentVideoUrl = activeTab === 'videos' && selectedVideo
                            ? selectedVideo.video_url : videoPreview;
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
                                await supabase.from('tiktok_drafts').insert({
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
              {((activeTab === 'videos' && selectedVideo) || videoPreview) && (
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
                              if (!narrationScript.trim()) return;
                              const currentVideoUrl = activeTab === 'videos' && selectedVideo
                                ? selectedVideo.video_url : videoPreview;
                              if (!currentVideoUrl) return;

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
                                    await supabase.from('tiktok_drafts').insert({
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

              {/* Hashtags suggérés */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  Hashtags suggérés
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {['#fyp', '#viral', '#trending', '#foryou', '#pourtoi'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => suggestHashtag(tag)}
                      className="px-3 py-1 bg-cyan-50 text-cyan-700 text-xs rounded-full hover:bg-cyan-100 transition-colors"
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
                      className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-cyan-100 to-blue-100 text-cyan-800 text-xs rounded-full"
                    >
                      {tag}
                      <button
                        onClick={() => removeHashtag(tag)}
                        className="hover:text-cyan-900"
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
                    className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                  />
                  <button
                    onClick={addHashtag}
                    className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm font-medium"
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
          {/* Statut de connexion TikTok (discret) */}
          {!checkingConnection && isTikTokConnected && (
            <div className="mb-3">
              <div className="flex items-center justify-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg py-2 px-3 border border-green-200">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Connecté : <strong>@{tiktokUsername}</strong></span>
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

            {/* Boutons de publication TikTok (seulement si connecté) - Format aligné avec Instagram */}
            {isTikTokConnected ? (
              <>
                <button
                  onClick={handlePublishNow}
                  disabled={publishing || !caption.trim() || (!isVideo(selectedImage?.image_url || '') && !videoPreview)}
                  className={`flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm ${
                    publishing || !caption.trim() || (!isVideo(selectedImage?.image_url || '') && !videoPreview)
                      ? 'bg-neutral-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg hover:shadow-xl'
                  }`}
                  title={!isVideo(selectedImage?.image_url || '') && !videoPreview ? 'Générez d\'abord la vidéo avec IA' : ''}
                >
                  {publishing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Publication...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                      </svg>
                      <span className="hidden sm:inline">Publier vidéo</span>
                      <span className="sm:hidden">Vidéo</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowCarouselModal(true)}
                  className="flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 shadow-lg hover:shadow-xl"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
                  </svg>
                  <span className="hidden sm:inline">Préparer carrousel</span>
                  <span className="sm:hidden">Carrousel</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => handleSave('ready')}
                disabled={saving || !caption.trim()}
                className={`flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2 text-sm sm:text-base ${
                  saving || !caption.trim()
                    ? 'bg-neutral-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600'
                }`}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Sauvegarde...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                    <span>Prêt à publier</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Carrousel */}
      {showCarouselModal && (
        <TikTokCarouselModal
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
