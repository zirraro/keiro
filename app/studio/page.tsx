"use client";

import { useState, Suspense, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useEditLimit } from "@/hooks/useEditLimit";
import SubscriptionModal from "@/components/SubscriptionModal";
import EmailGateModal from "@/components/EmailGateModal";
import SignupGateModal from "@/components/SignupGateModal";
import { addTextOverlay } from "@/lib/canvas-text-overlay";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import FeedbackPopup from '@/components/FeedbackPopup';
import FeedbackModal from '@/components/FeedbackModal';
import { useFeedbackPopup } from '@/hooks/useFeedbackPopup';
import { useLanguage } from '@/lib/i18n/context';

type FontFamily = 'inter' | 'montserrat' | 'bebas' | 'roboto' | 'playfair';
type BgStyle = 'transparent' | 'clean' | 'none' | 'solid' | 'gradient' | 'blur' | 'outline' | 'minimal' | 'glow';

interface TextOverlayItem {
  id: string;
  text: string;
  position: number;
  fontSize: number;
  fontFamily: FontFamily;
  textColor: string;
  bgColor: string;
  bgStyle: BgStyle;
}

const FONTS: { value: FontFamily; label: string }[] = [
  { value: 'inter', label: 'Inter' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'bebas', label: 'Bebas Neue' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'playfair', label: 'Playfair' },
];

const BG_STYLES_DATA: { value: BgStyle; emoji: string; labelKey: string }[] = [
  { value: 'clean', emoji: '🔲', labelKey: 'bgClean' },
  { value: 'none', emoji: '🅰', labelKey: 'bgStrongOutline' },
  { value: 'minimal', emoji: '·', labelKey: 'bgSubtle' },
  { value: 'transparent', emoji: '▦', labelKey: 'bgTransparent' },
  { value: 'solid', emoji: '■', labelKey: 'bgSolid' },
  { value: 'gradient', emoji: '◐', labelKey: 'bgGradient' },
  { value: 'blur', emoji: '☁', labelKey: 'bgBlur' },
  { value: 'outline', emoji: '□', labelKey: 'bgOutline' },
  { value: 'glow', emoji: '✧', labelKey: 'bgGlow' },
];

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function StudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = supabaseBrowser();
  const feedback = useFeedbackPopup();
  const editLimit = useEditLimit();
  const { t } = useLanguage();

  const [imageUrl, setImageUrl] = useState(searchParams.get("image") || "");
  const [originalImage, setOriginalImage] = useState(searchParams.get("image") || "");
  const [loadedImage, setLoadedImage] = useState(searchParams.get("image") || "");
  const [editPrompt, setEditPrompt] = useState("");
  const [editStrength, setEditStrength] = useState(5.5);
  const [editProvider, setEditProvider] = useState<string>('');
  const [editingImage, setEditingImage] = useState(false);
  const [editedImages, setEditedImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [showSignupGate, setShowSignupGate] = useState(false);
  const [cleanBaseImage, setCleanBaseImage] = useState(searchParams.get("image") || "");
  const [user, setUser] = useState<any>(null);
  const [savingToGallery, setSavingToGallery] = useState(false);
  const [activeTab, setActiveTab] = useState<'image' | 'text' | 'video'>('image');

  // === Video generation states ===
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState(5);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoTaskId, setVideoTaskId] = useState<string | null>(null);

  // === Parse overlays from search params or DB JSON ===
  function parseOverlaysFromParam(raw: string | null): TextOverlayItem[] {
    if (!raw || !raw.trim()) return [];
    if (raw.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => ({
            id: generateId(),
            text: item.text || '',
            position: typeof item.position === 'number' ? item.position : 75,
            fontSize: item.fontSize || 60,
            fontFamily: (item.fontFamily || 'montserrat') as FontFamily,
            textColor: item.textColor || '#ffffff',
            bgColor: item.bgColor || item.backgroundColor || 'rgba(0, 0, 0, 0.5)',
            bgStyle: (item.bgStyle || item.backgroundStyle || 'none') as BgStyle,
          })).filter((item: TextOverlayItem) => item.text.trim());
        }
      } catch (e) { console.warn('[Studio] Failed to parse overlay JSON:', e); }
    }
    // Fallback: pipe-separated text
    const texts = raw.includes('|') ? raw.split('|').map(t => t.trim()).filter(Boolean) : [raw.trim()];
    return texts.map((text) => ({
      id: generateId(), text, position: 50, fontSize: 60,
      fontFamily: 'montserrat' as FontFamily, textColor: '#ffffff',
      bgColor: 'rgba(0, 0, 0, 0.5)', bgStyle: 'none' as BgStyle,
    }));
  }

  // === Multi-overlay text state ===
  const initialStudioOverlays = parseOverlaysFromParam(searchParams.get("textOverlay"));
  const [showTextOverlay, setShowTextOverlay] = useState(initialStudioOverlays.length > 0);
  const [textOverlayItems, setTextOverlayItems] = useState<TextOverlayItem[]>(initialStudioOverlays);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [textPreviewUrl, setTextPreviewUrl] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  // Form state for current editing overlay
  const [formText, setFormText] = useState('');
  const [formPosition, setFormPosition] = useState<number>(75);
  const [formFontSize, setFormFontSize] = useState(60);
  const [formFontFamily, setFormFontFamily] = useState<FontFamily>('montserrat');
  const [formTextColor, setFormTextColor] = useState('#ffffff');
  const [formBgColor, setFormBgColor] = useState('rgba(0, 0, 0, 0.5)');
  const [formBgStyle, setFormBgStyle] = useState<BgStyle>('none');

  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const skipAutoEditRef = useRef(false);

  // Vérifier si l'utilisateur est connecté au chargement et écouter les changements d'auth
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        editLimit.setHasAccount(true);
        setShowSignupGate(false);
      }
    }
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        editLimit.setHasAccount(true);
        setShowSignupGate(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        editLimit.reset();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLoadImage = () => {
    if (!imageUrl.trim()) {
      alert(t.studio.alertEnterImageUrl);
      return;
    }
    setOriginalImage(imageUrl);
    setLoadedImage(imageUrl);
    setCleanBaseImage(imageUrl);
    setEditedImages([]);
    setTextOverlayItems([]);
    setEditingOverlayId(null);
    setFormText('');
    setTextPreviewUrl(null);
  };

  const handleSaveToGallery = async () => {
    if (!user) {
      alert(t.studio.alertMustBeLoggedIn);
      return;
    }

    if (!loadedImage) {
      alert(t.studio.alertNoImageToSave);
      return;
    }

    setSavingToGallery(true);
    const savingToast = document.createElement('div');
    savingToast.style.cssText = 'position:fixed;top:1.25rem;right:1.25rem;background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;padding:0.875rem 1.5rem;border-radius:0.75rem;box-shadow:0 20px 25px -5px rgba(0,0,0,0.15);z-index:9999;display:flex;align-items:center;gap:0.75rem;font-size:0.875rem;font-weight:500;animation:toastSlideIn 0.3s ease-out;';
    savingToast.innerHTML = `<div style="width:1.125rem;height:1.125rem;border:2.5px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.7s linear infinite"></div><span>${t.studio.alertSavingInProgress}</span><style>@keyframes spin{to{transform:rotate(360deg)}}@keyframes toastSlideIn{from{opacity:0;transform:translateX(1rem)}to{opacity:1;transform:translateX(0)}}</style>`;
    document.body.appendChild(savingToast);
    try {
      const response = await fetch('/api/library/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: loadedImage,
          title: t.studio.saveTitle,
          tags: ['studio', 'edit'],
          textOverlay: textOverlayItems.length > 0 ? JSON.stringify(textOverlayItems.filter(i => i.text.trim()).map(i => ({ text: i.text, position: i.position, fontSize: i.fontSize, fontFamily: i.fontFamily, textColor: i.textColor, bgColor: i.bgColor, bgStyle: i.bgStyle }))) : undefined,
          originalImageUrl: cleanBaseImage || undefined,
        })
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const errorText = await response.text();
        console.error('[Studio] Non-JSON response:', errorText);

        if (response.status === 413) {
          throw new Error(t.studio.alertImageTooLarge);
        } else if (response.status === 401) {
          throw new Error(t.studio.alertCreateAccount);
        } else {
          throw new Error(t.studio.alertServerError + (errorText.substring(0, 100) || t.studio.alertInvalidResponse));
        }
      }

      const data = await response.json();

      if (data.ok) {
        savingToast.style.background = 'linear-gradient(135deg, #16a34a, #059669)';
        savingToast.style.transition = 'all 0.4s ease';
        savingToast.innerHTML = `<svg style="width:1.25rem;height:1.25rem" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg><span>${t.studio.alertRedirectingToGallery}</span>`;
        setTimeout(() => { savingToast.style.opacity = '0'; savingToast.style.transform = 'translateX(1rem)'; }, 1200);
        setTimeout(() => { savingToast.remove(); router.push('/library'); }, 1600);
      } else {
        throw new Error(data.error || t.studio.alertSaveError);
      }
    } catch (error: any) {
      console.error('[Studio] Error saving:', error);
      savingToast.remove();
      alert(error.message || t.studio.alertSaveError);
    } finally {
      setSavingToGallery(false);
    }
  };

  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert(t.studio.alertSelectImage);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setOriginalImage(result);
      setLoadedImage(result);
      setCleanBaseImage(result);
      setEditedImages([]);
      setTextOverlayItems([]);
      setEditingOverlayId(null);
      setFormText('');
      setTextPreviewUrl(null);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const compressImageDataUrl = async (dataUrl: string, maxWidth = 1024, maxHeight = 1024, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  };

  const handleEdit = async () => {
    if (editLimit.requiredAction === 'email') {
      setShowEmailGate(true);
      return;
    }
    if (editLimit.requiredAction === 'signup') {
      setShowSignupGate(true);
      return;
    }
    if (editLimit.requiredAction === 'premium') {
      setShowSubscriptionModal(true);
      return;
    }

    if (!editPrompt.trim()) {
      alert(t.studio.alertDescribeChanges);
      return;
    }
    if (!loadedImage) {
      alert(t.studio.alertLoadImageFirst);
      return;
    }

    setEditingImage(true);
    try {
      const baseForEdit = cleanBaseImage || loadedImage;
      let imageToSend = baseForEdit;
      if (baseForEdit.startsWith('data:image/')) {
        console.log('[Studio] Compressing image before sending...');
        try {
          imageToSend = await compressImageDataUrl(baseForEdit);
          console.log('[Studio] Image compressed successfully');
        } catch (err) {
          console.warn('[Studio] Compression failed, sending original:', err);
        }
      }

      const res = await fetch("/api/seedream/i2i", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageToSend,
          prompt: editPrompt,
          guidance_scale: editStrength,
        }),
      });

      if (!res.ok) {
        throw new Error(`${t.studio.errorPrefix}${res.status}`);
      }

      const data = await res.json();
      if (data._p) setEditProvider(data._p);
      if (data.imageUrl) {
        setEditedImages([...editedImages, data.imageUrl]);
        setLoadedImage(data.imageUrl);
        setCleanBaseImage(data.imageUrl);
        setEditPrompt("");
        // Reset text overlays when base image changes via AI edit
        setTextOverlayItems([]);
        setEditingOverlayId(null);
        setFormText('');
        setTextPreviewUrl(null);

        editLimit.incrementCount();
      } else {
        throw new Error(t.studio.alertNoImageReturned);
      }
    } catch (e: any) {
      alert(t.studio.alertError + e.message);
    } finally {
      setEditingImage(false);
    }
  };

  // === Multi-overlay helpers ===

  const getFormAsOverlay = useCallback((): Omit<TextOverlayItem, 'id'> => ({
    text: formText,
    position: formPosition,
    fontSize: formFontSize,
    fontFamily: formFontFamily,
    textColor: formTextColor,
    bgColor: formBgColor,
    bgStyle: formBgStyle,
  }), [formText, formPosition, formFontSize, formFontFamily, formTextColor, formBgColor, formBgStyle]);

  const loadOverlayIntoForm = useCallback((overlay: TextOverlayItem) => {
    setFormText(overlay.text);
    setFormPosition(overlay.position);
    setFormFontSize(overlay.fontSize);
    setFormFontFamily(overlay.fontFamily);
    setFormTextColor(overlay.textColor);
    setFormBgColor(overlay.bgColor);
    setFormBgStyle(overlay.bgStyle);
  }, []);

  const getOverlaysToRender = useCallback((): TextOverlayItem[] => {
    const overlays = [...textOverlayItems];
    if (editingOverlayId) {
      const idx = overlays.findIndex(o => o.id === editingOverlayId);
      if (idx !== -1) {
        overlays[idx] = { ...overlays[idx], ...getFormAsOverlay() };
      }
    } else if (formText.trim()) {
      overlays.push({ id: '__new__', ...getFormAsOverlay() });
    }
    return overlays.filter(o => o.text.trim());
  }, [textOverlayItems, editingOverlayId, formText, getFormAsOverlay]);

  // Generate text overlay preview
  const generatePreview = useCallback(async () => {
    const overlays = getOverlaysToRender();
    if (overlays.length === 0) {
      setTextPreviewUrl(null);
      return;
    }

    const base = cleanBaseImage || loadedImage;
    if (!base) return;

    setTextLoading(true);
    try {
      let currentImage = base;
      for (const overlay of overlays) {
        currentImage = await addTextOverlay(currentImage, {
          text: overlay.text,
          position: overlay.position,
          fontSize: overlay.fontSize,
          fontFamily: overlay.fontFamily,
          textColor: overlay.textColor,
          backgroundColor: overlay.bgColor,
          backgroundStyle: overlay.bgStyle,
        });
      }
      setTextPreviewUrl(currentImage);
    } catch (err) {
      console.error('[Studio TextOverlay] Preview error:', err);
    } finally {
      setTextLoading(false);
    }
  }, [cleanBaseImage, loadedImage, getOverlaysToRender]);

  // Debounced preview — any change to form or overlays triggers re-render
  useEffect(() => {
    if (activeTab !== 'text') return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(generatePreview, 400);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [formText, formPosition, formFontSize, formFontFamily, formTextColor, formBgColor, formBgStyle, textOverlayItems, activeTab, generatePreview]);

  // Auto-edit: when text tab opens with existing items, load first into form
  useEffect(() => {
    if (activeTab === 'text' && textOverlayItems.length > 0 && !editingOverlayId) {
      if (skipAutoEditRef.current) {
        skipAutoEditRef.current = false;
        return;
      }
      const currentText = formText.trim();
      if (currentText) {
        const matching = textOverlayItems.find(item => item.text === currentText);
        if (matching) {
          setEditingOverlayId(matching.id);
          return;
        }
      }
      if (!currentText) {
        const first = textOverlayItems[0];
        loadOverlayIntoForm(first);
        setEditingOverlayId(first.id);
      }
    }
  }, [activeTab, textOverlayItems.length]);

  // === Overlay management ===

  const handleAddOverlay = () => {
    if (!formText.trim()) return;
    if (editingOverlayId) {
      setTextOverlayItems(prev => prev.map(o =>
        o.id === editingOverlayId ? { ...o, ...getFormAsOverlay() } : o
      ));
    } else {
      const newOverlay: TextOverlayItem = { id: generateId(), ...getFormAsOverlay() };
      setTextOverlayItems(prev => [...prev, newOverlay]);
      setEditingOverlayId(newOverlay.id);
    }
  };

  const handleEditOverlay = (overlay: TextOverlayItem) => {
    if (editingOverlayId && formText.trim()) {
      setTextOverlayItems(prev => prev.map(o =>
        o.id === editingOverlayId ? { ...o, ...getFormAsOverlay() } : o
      ));
    }
    setEditingOverlayId(overlay.id);
    loadOverlayIntoForm(overlay);
  };

  const handleDeleteOverlay = (id: string) => {
    setTextOverlayItems(prev => prev.filter(o => o.id !== id));
    if (editingOverlayId === id) {
      skipAutoEditRef.current = true;
      setEditingOverlayId(null);
      setFormText('');
    }
  };

  const handleDeleteAllOverlays = () => {
    setTextOverlayItems([]);
    skipAutoEditRef.current = true;
    setEditingOverlayId(null);
    setFormText('');
    setTextPreviewUrl(null);
    // Reset loadedImage to clean base
    if (cleanBaseImage) {
      setLoadedImage(cleanBaseImage);
    }
  };

  const handleNewOverlay = () => {
    if (editingOverlayId && formText.trim()) {
      setTextOverlayItems(prev => prev.map(o =>
        o.id === editingOverlayId ? { ...o, ...getFormAsOverlay() } : o
      ));
    }
    skipAutoEditRef.current = true;
    setEditingOverlayId(null);
    setFormText('');
    setFormPosition(25);
    setFormFontSize(60);
    setFormBgStyle('none');
  };

  // Apply text overlays to image
  const handleApplyTextOverlay = async () => {
    let finalOverlays = [...textOverlayItems];
    if (editingOverlayId && formText.trim()) {
      finalOverlays = finalOverlays.map(o =>
        o.id === editingOverlayId ? { ...o, ...getFormAsOverlay() } : o
      );
    } else if (!editingOverlayId && formText.trim()) {
      finalOverlays.push({ id: generateId(), ...getFormAsOverlay() });
    }

    if (finalOverlays.length === 0) return;

    setTextLoading(true);
    try {
      const base = cleanBaseImage || loadedImage;
      let currentImage = base;
      for (const overlay of finalOverlays) {
        if (!overlay.text.trim()) continue;
        currentImage = await addTextOverlay(currentImage, {
          text: overlay.text,
          position: overlay.position,
          fontSize: overlay.fontSize,
          fontFamily: overlay.fontFamily,
          textColor: overlay.textColor,
          backgroundColor: overlay.bgColor,
          backgroundStyle: overlay.bgStyle,
        });
      }
      setTextOverlayItems(finalOverlays);
      setLoadedImage(currentImage);
      // cleanBaseImage stays unchanged — it's the clean base without text
    } catch (err) {
      console.error('[Studio TextOverlay] Apply error:', err);
    } finally {
      setTextLoading(false);
    }
  };

  // === Video generation ===
  const handleGenerateVideo = async () => {
    if (!loadedImage) {
      alert(t.studio.alertLoadImageFirst);
      return;
    }
    if (!videoPrompt.trim()) {
      alert(t.studio.alertDescribeAnimation);
      return;
    }

    setGeneratingVideo(true);
    setVideoProgress(t.studio.creatingVideoTask);
    setGeneratedVideoUrl(null);

    try {
      const res = await fetch('/api/seedream/i2v', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: loadedImage,
          prompt: videoPrompt,
          duration: videoDuration,
        }),
      });

      const data = await res.json();

      if (res.status === 402 && data.insufficientCredits) {
        setGeneratingVideo(false);
        setShowSubscriptionModal(true);
        return;
      }
      if (res.status === 403 && data.blocked) {
        setGeneratingVideo(false);
        setShowSubscriptionModal(true);
        return;
      }

      if (!data?.ok) {
        throw new Error(data?.error || t.studio.alertVideoTaskFailed);
      }

      setVideoTaskId(data.taskId);

      // Polling
      const maxAttempts = videoDuration <= 10 ? 60 : 120;
      const pollVideo = async (attempt: number): Promise<void> => {
        if (attempt >= maxAttempts) {
          throw new Error(t.studio.alertVideoTimeout);
        }

        setVideoProgress(`${t.studio.generatingProgress} (${attempt * 5}s)`);

        await new Promise(resolve => setTimeout(resolve, 5000));

        const statusRes = await fetch('/api/seedream/i2v', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: data.taskId }),
        });

        const statusData = await statusRes.json();

        if (statusData.status === 'completed' && statusData.videoUrl) {
          setGeneratedVideoUrl(statusData.videoUrl);
          setGeneratingVideo(false);
          setVideoProgress('');
          return;
        }

        if (statusData.status === 'failed') {
          throw new Error(statusData.error || t.studio.alertVideoFailed);
        }

        return pollVideo(attempt + 1);
      };

      await pollVideo(0);
    } catch (error: any) {
      console.error('[Studio Video] Error:', error);
      alert(t.studio.alertError + error.message);
      setGeneratingVideo(false);
      setVideoProgress('');
    }
  };

  // Construire le tableau de toutes les versions (Original + éditées)
  const allVersions = originalImage ? [originalImage, ...editedImages] : [];
  const hasOverlays = textOverlayItems.length > 0 || formText.trim();

  // Determine which image to display: preview if text tab is active, otherwise loadedImage
  const displayImage = activeTab === 'text' && textPreviewUrl ? textPreviewUrl : loadedImage;

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-blue-50/30 to-purple-50/20 py-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header premium */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full mb-4">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
            </svg>
            <span className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              {t.studio.badgeLabel}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-3">
            {t.studio.headerTitle}<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
              {t.studio.headerTitleHighlight}
            </span>
          </h1>
          <p className="text-neutral-600 max-w-2xl mx-auto text-lg">
            {t.studio.headerSubtitle}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Colonne gauche - Image */}
          <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/50 p-8 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-neutral-900">{t.studio.yourMedia}</h2>
            </div>

            {!loadedImage ? (
              <div className="space-y-6">
                {/* Zone de drag & drop premium */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
                    isDragging
                      ? "border-blue-500 bg-gradient-to-br from-blue-50 to-purple-50 scale-[1.02] shadow-lg"
                      : "border-neutral-300 bg-gradient-to-br from-neutral-50 to-neutral-100 hover:border-blue-400 hover:shadow-md"
                  }`}
                >
                  <div className={`transition-transform duration-300 ${isDragging ? 'scale-110' : ''}`}>
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                      <svg
                        className="h-8 w-8 text-white"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                      >
                        <path
                          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                  <p className="text-base text-neutral-700 mb-3 font-medium">
                    <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                      {t.studio.dragImageHere}
                    </span>
                  </p>
                  <p className="text-sm text-neutral-500 mb-4">{t.studio.or}</p>
                  <label className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-xl transition-all hover:scale-105 font-semibold">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className="hidden"
                    />
                    {t.studio.browseFiles}
                  </label>
                  <p className="text-xs text-neutral-400 mt-4">{t.studio.fileFormats}</p>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-neutral-500 font-medium">{t.studio.orPasteUrl}</span>
                  </div>
                </div>

                {/* URL Input premium */}
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    {t.studio.imageUrl}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder={t.studio.imageUrlPlaceholder}
                      className="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                    />
                  </div>
                </div>
                <button
                  onClick={handleLoadImage}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-xl transition-all hover:scale-[1.02] font-semibold flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {t.studio.loadImage}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {generatedVideoUrl && activeTab === 'video' ? (
                  <div className="relative rounded-xl overflow-hidden shadow-lg bg-black">
                    <video
                      src={generatedVideoUrl}
                      controls
                      autoPlay
                      loop
                      className="w-full"
                    />
                  </div>
                ) : (
                  <div className="relative aspect-square bg-gradient-to-br from-neutral-100 to-neutral-200 rounded-xl overflow-hidden shadow-lg group">
                    <img
                      src={displayImage}
                      alt={t.studio.imageToEdit}
                      className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                    />
                    {textLoading && activeTab === 'text' && (
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
                <button
                  onClick={() => {
                    setLoadedImage("");
                    setOriginalImage("");
                    setCleanBaseImage("");
                    setEditedImages([]);
                    setTextOverlayItems([]);
                    setEditingOverlayId(null);
                    setFormText('');
                    setTextPreviewUrl(null);
                    setShowTextOverlay(false);
                  }}
                  className="w-full py-3 border-2 border-neutral-300 rounded-xl hover:bg-neutral-50 hover:border-neutral-400 transition-all font-medium text-neutral-700 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t.studio.changeImage}
                </button>
              </div>
            )}

            {/* Versions (Original + Éditées) premium */}
            {allVersions.length > 0 && (
              <div className="mt-8 pt-6 border-t-2 border-neutral-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    {t.studio.versionHistory}
                  </h3>
                  <span className="px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-full text-xs font-bold">
                    {allVersions.length} {allVersions.length > 1 ? t.studio.versions : t.studio.version}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {allVersions.map((img, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border-2 overflow-hidden cursor-pointer transition-all duration-200 ${
                        loadedImage === img
                          ? "border-blue-500 ring-4 ring-blue-100 shadow-lg scale-105"
                          : "border-neutral-200 hover:border-blue-300 hover:shadow-md hover:scale-102"
                      }`}
                      onClick={() => {
                        setLoadedImage(img);
                        setCleanBaseImage(img);
                        setTextOverlayItems([]);
                        setEditingOverlayId(null);
                        setFormText('');
                        setTextPreviewUrl(null);
                      }}
                    >
                      <div className="relative">
                        <img
                          src={img}
                          alt={idx === 0 ? t.studio.originalLabel : `V${idx}`}
                          className="w-full aspect-square object-cover"
                        />
                        {loadedImage === img && (
                          <div className="absolute top-1 right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className={`p-2 text-center ${loadedImage === img ? 'bg-blue-50' : 'bg-neutral-50'}`}>
                        <div className={`text-xs font-bold ${loadedImage === img ? 'text-blue-700' : 'text-neutral-700'}`}>
                          {idx === 0 ? `📄 ${t.studio.originalLabel}` : `✨ V${idx}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Colonne droite - Édition premium */}
          <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/50 p-8 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                Studio
                {editProvider && (
                  <span className={`w-3 h-3 rounded-full inline-block ${editProvider === 'k' ? 'bg-emerald-500' : 'bg-orange-500'}`} />
                )}
              </h2>
            </div>

            {/* === ONGLETS === */}
            <div className="flex border-b border-neutral-200 mb-6">
              <button
                onClick={() => setActiveTab('image')}
                className={`flex-1 py-3 text-sm font-semibold text-center transition-all relative ${
                  activeTab === 'image'
                    ? 'text-purple-700'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {t.studio.tabRetouch}
                </span>
                {activeTab === 'image' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 rounded-full" />}
              </button>
              <button
                onClick={() => { setActiveTab('text'); setShowTextOverlay(true); }}
                className={`flex-1 py-3 text-sm font-semibold text-center transition-all relative ${
                  activeTab === 'text'
                    ? 'text-indigo-700'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  {t.studio.tabText}
                  {textOverlayItems.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full">{textOverlayItems.length}</span>
                  )}
                </span>
                {activeTab === 'text' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
              </button>
              <button
                onClick={() => setActiveTab('video')}
                className={`flex-1 py-3 text-sm font-semibold text-center transition-all relative ${
                  activeTab === 'video'
                    ? 'text-pink-700'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Video
                </span>
                {activeTab === 'video' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-pink-600 rounded-full" />}
              </button>
            </div>

            <div className="space-y-6">
              {/* === ONGLET RETOUCHE IMAGE === */}
              {activeTab === 'image' && (
                <>
                  {/* Slider force de modification */}
                  <div>
                    <p className="text-sm font-semibold text-neutral-700 mb-2">
                      {t.studio.editStrengthLabel} <span className="text-purple-600 font-bold">
                        {editStrength <= 5 ? t.studio.strengthSubtle : editStrength <= 7 ? t.studio.strengthModerate : t.studio.strengthStrong}
                      </span>
                    </p>
                    <input
                      type="range"
                      min={3}
                      max={10}
                      step={0.5}
                      value={editStrength}
                      onChange={(e) => setEditStrength(Number(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-400 mt-1">
                      <span>{t.studio.strengthSubtle}</span>
                      <span>{t.studio.strengthModerate}</span>
                      <span>{t.studio.strengthStrong}</span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      {editStrength <= 5
                        ? t.studio.strengthSubtleDesc
                        : editStrength <= 7
                        ? t.studio.strengthModerateDesc
                        : t.studio.strengthStrongDesc}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      {t.studio.describeChanges}
                    </label>
                    <div className="relative">
                      <textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder={
                          editStrength <= 5
                            ? t.studio.placeholderSubtle
                            : editStrength <= 7
                            ? t.studio.placeholderModerate
                            : t.studio.placeholderStrong
                        }
                        rows={6}
                        disabled={!loadedImage || editingImage}
                        className="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition-all disabled:bg-neutral-100 disabled:cursor-not-allowed resize-none"
                      />
                      {editPrompt.length > 0 && (
                        <div className="absolute bottom-3 right-3 text-xs text-neutral-400 bg-white px-2 py-1 rounded-md shadow-sm">
                          {editPrompt.length} {t.studio.characters}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-2 flex items-start gap-2">
                      <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{t.studio.tipBePrecise}</span>
                    </p>
                  </div>

                  <button
                    onClick={handleEdit}
                    disabled={!loadedImage || editingImage || !editPrompt.trim()}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 via-pink-600 to-red-500 text-white rounded-xl hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg flex items-center justify-center gap-3 hover:scale-[1.02] disabled:hover:scale-100 relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="relative flex items-center gap-3">
                      {editingImage ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          {t.studio.editingInProgress}
                        </>
                      ) : (
                        <>
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          {t.studio.transformBtn}
                        </>
                      )}
                    </span>
                  </button>
                </>
              )}

              {/* === ONGLET TEXTE === */}
              {activeTab === 'text' && (
                <div className="space-y-4">
                  {/* Applied overlays list */}
                  {textOverlayItems.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1.5">{t.studio.appliedTexts}</label>
                      <div className="space-y-1.5">
                        {textOverlayItems.map((overlay) => (
                          <div
                            key={overlay.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                              editingOverlayId === overlay.id
                                ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                                : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                            }`}
                            onClick={() => handleEditOverlay(overlay)}
                          >
                            <span className="text-xs font-medium text-neutral-400 w-10 shrink-0">
                              {overlay.position <= 30 ? '⬆️' : overlay.position >= 70 ? '⬇️' : '⏺️'} {overlay.position}%
                            </span>
                            <span className="text-sm text-neutral-800 truncate flex-1">
                              {overlay.text}
                            </span>
                            <span
                              className="w-4 h-4 rounded-full border shrink-0"
                              style={{ backgroundColor: overlay.textColor }}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteOverlay(overlay.id); }}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition shrink-0"
                              title={t.studio.deleteThisText}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      {editingOverlayId && (
                        <button
                          onClick={handleNewOverlay}
                          className="mt-2 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                        >
                          {t.studio.addAnotherText}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Text form */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      {editingOverlayId ? t.studio.editTextLabel : t.studio.newTextLabel}
                    </label>
                    <textarea
                      value={formText}
                      onChange={(e) => setFormText(e.target.value)}
                      placeholder={t.studio.textPlaceholder}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                    />
                  </div>

                  {/* Position */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">{t.studio.position} <span className="text-neutral-400">({formPosition}%)</span></label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setFormPosition(Math.max(8, formPosition - 10))}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all"
                      >
                        ⬆️ {t.studio.upMore}
                      </button>
                      <div className="flex-1 flex items-center gap-1.5 justify-center">
                        <button
                          onClick={() => setFormPosition(25)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${formPosition <= 30 ? 'bg-blue-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                        >{t.studio.posTop}</button>
                        <button
                          onClick={() => setFormPosition(50)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${formPosition > 30 && formPosition < 70 ? 'bg-blue-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                        >{t.studio.posCenter}</button>
                        <button
                          onClick={() => setFormPosition(75)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${formPosition >= 70 ? 'bg-blue-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                        >{t.studio.posBottom}</button>
                      </div>
                      <button
                        onClick={() => setFormPosition(Math.min(92, formPosition + 10))}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all"
                      >
                        ⬇️ {t.studio.downMore}
                      </button>
                    </div>
                  </div>

                  {/* Font + Size */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">{t.studio.font}</label>
                      <select
                        value={formFontFamily}
                        onChange={(e) => setFormFontFamily(e.target.value as FontFamily)}
                        className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-sm"
                      >
                        {FONTS.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">{t.studio.fontSize} {formFontSize}px</label>
                      <input
                        type="range"
                        min={24}
                        max={120}
                        value={formFontSize}
                        onChange={(e) => setFormFontSize(Number(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">{t.studio.textColor}</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formTextColor}
                          onChange={(e) => setFormTextColor(e.target.value)}
                          className="w-8 h-8 rounded border cursor-pointer"
                        />
                        <div className="flex gap-1">
                          {['#ffffff', '#000000', '#f59e0b', '#ef4444', '#3b82f6'].map(c => (
                            <button
                              key={c}
                              onClick={() => setFormTextColor(c)}
                              className={`w-6 h-6 rounded-full border-2 transition ${
                                formTextColor === c ? 'border-blue-500 scale-110' : 'border-neutral-300'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">{t.studio.bgColor}</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formBgColor.startsWith('rgba') ? '#000000' : formBgColor}
                          onChange={(e) => {
                            const hex = e.target.value;
                            const r = parseInt(hex.slice(1, 3), 16);
                            const g = parseInt(hex.slice(3, 5), 16);
                            const b = parseInt(hex.slice(5, 7), 16);
                            setFormBgColor(`rgba(${r}, ${g}, ${b}, 0.6)`);
                          }}
                          className="w-8 h-8 rounded border cursor-pointer"
                        />
                        <div className="flex gap-1">
                          {[
                            'rgba(0, 0, 0, 0.6)',
                            'rgba(59, 130, 246, 0.8)',
                            'rgba(239, 68, 68, 0.8)',
                            'rgba(16, 185, 129, 0.8)',
                            'rgba(245, 158, 11, 0.8)',
                          ].map(c => (
                            <button
                              key={c}
                              onClick={() => setFormBgColor(c)}
                              className={`w-6 h-6 rounded-full border-2 transition ${
                                formBgColor === c ? 'border-blue-500 scale-110' : 'border-neutral-300'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Background style */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">{t.studio.bgStyleLabel}</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {BG_STYLES_DATA.map(s => (
                        <button
                          key={s.value}
                          onClick={() => setFormBgStyle(s.value)}
                          className={`py-1.5 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1 ${
                            formBgStyle === s.value
                              ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                              : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                          }`}
                        >
                          <span>{s.emoji}</span>
                          <span>{t.studio[s.labelKey]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-200">
                    {formText.trim() && (
                      <button
                        onClick={handleAddOverlay}
                        disabled={textLoading}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {editingOverlayId ? t.studio.confirmEdit : t.studio.addThisText}
                      </button>
                    )}
                    {editingOverlayId && (
                      <button
                        onClick={handleNewOverlay}
                        className="px-4 py-2.5 border border-blue-300 text-blue-600 rounded-lg font-medium text-sm hover:bg-blue-50 transition"
                      >
                        {t.studio.newTextBtn}
                      </button>
                    )}
                    {hasOverlays && (
                      <button
                        onClick={handleApplyTextOverlay}
                        disabled={textLoading}
                        className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
                      >
                        {textLoading ? t.studio.applying : t.studio.applyToImage}
                      </button>
                    )}
                    {textOverlayItems.length > 0 && (
                      <button
                        onClick={handleDeleteAllOverlays}
                        className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium text-sm hover:bg-red-100 transition"
                      >
                        {t.studio.deleteAll}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* === ONGLET VIDEO === */}
              {activeTab === 'video' && (
                <div className="space-y-5">
                  {generatedVideoUrl ? (
                    <div className="space-y-4">
                      <div className="rounded-xl overflow-hidden bg-black">
                        <video
                          src={generatedVideoUrl}
                          controls
                          autoPlay
                          loop
                          className="w-full"
                        />
                      </div>
                      <div className="flex gap-3">
                        <a
                          href={generatedVideoUrl}
                          download
                          className="flex-1 py-3 bg-neutral-900 text-white text-center rounded-xl hover:bg-neutral-800 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          {t.studio.downloadBtn}
                        </a>
                        <button
                          onClick={() => { setGeneratedVideoUrl(null); setVideoPrompt(''); }}
                          className="px-4 py-3 border-2 border-neutral-300 rounded-xl hover:bg-neutral-50 transition-all text-sm font-medium text-neutral-700"
                        >
                          {t.studio.newBtn}
                        </button>
                      </div>
                    </div>
                  ) : generatingVideo ? (
                    <div className="text-center py-12 space-y-4">
                      <div className="relative inline-block">
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-neutral-200 border-t-pink-600 mx-auto" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-7 h-7 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-neutral-700">{videoProgress || t.studio.preparingVideo}</p>
                      <p className="text-xs text-neutral-500">{t.studio.videoGenTime}</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          {t.studio.describeAnimation}
                        </label>
                        <textarea
                          value={videoPrompt}
                          onChange={(e) => setVideoPrompt(e.target.value)}
                          placeholder={t.studio.videoPlaceholder}
                          rows={4}
                          disabled={!loadedImage}
                          className="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl focus:outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100 transition-all disabled:bg-neutral-100 disabled:cursor-not-allowed resize-none"
                        />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-neutral-700 mb-2">
                          {t.studio.duration} <span className="text-pink-600 font-bold">{videoDuration}s</span>
                        </p>
                        <div className="flex gap-3">
                          {[5, 10].map(d => (
                            <button
                              key={d}
                              onClick={() => setVideoDuration(d)}
                              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
                                videoDuration === d
                                  ? 'bg-pink-100 text-pink-700 ring-1 ring-pink-300'
                                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                              }`}
                            >
                              {d} {t.studio.seconds}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-neutral-500 mt-2">
                          {videoDuration === 5 ? t.studio.credits25 : t.studio.credits40}
                        </p>
                      </div>

                      <button
                        onClick={handleGenerateVideo}
                        disabled={!loadedImage || !videoPrompt.trim()}
                        className="w-full py-4 bg-gradient-to-r from-pink-600 via-rose-600 to-red-500 text-white rounded-xl hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg flex items-center justify-center gap-3 hover:scale-[1.02] disabled:hover:scale-100 relative overflow-hidden group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-pink-400 via-rose-400 to-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="relative flex items-center gap-3">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {t.studio.animateImage} ({videoDuration}s)
                        </span>
                      </button>

                      {!loadedImage && (
                        <p className="text-center text-sm text-neutral-500">
                          {t.studio.loadImageForVideo}
                        </p>
                      )}

                      {/* V2V Coming Soon */}
                      <div className="mt-6 pt-5 border-t border-neutral-200">
                        <div className="relative rounded-xl bg-gradient-to-br from-neutral-50 to-neutral-100 border border-neutral-200 p-5 overflow-hidden">
                          <div className="absolute top-3 right-3">
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
                              {t.studio.comingSoon}
                            </span>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-md shrink-0">
                              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </div>
                            <div>
                              <h4 className="font-bold text-neutral-800 text-sm mb-1">{t.studio.editVideo}</h4>
                              <p className="text-xs text-neutral-500 leading-relaxed">
                                {t.studio.editVideoDesc}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* === BOUTONS TELECHARGER / GALERIE (toujours visibles) === */}
              {loadedImage && (
                <>
                  <div className="border-t border-neutral-200 pt-4" />
                  <div className="grid grid-cols-2 gap-3">
                    <a
                      href={loadedImage}
                      download
                      className="py-3 bg-neutral-900 text-white text-center rounded-xl hover:bg-neutral-800 transition-all text-sm font-semibold flex items-center justify-center gap-2 hover:shadow-lg hover:scale-[1.02]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {t.studio.downloadBtn}
                    </a>
                    <button
                      onClick={user ? handleSaveToGallery : () => setShowSubscriptionModal(true)}
                      disabled={savingToGallery}
                      className={`py-3 text-white text-center rounded-xl transition-all text-sm font-semibold flex items-center justify-center gap-2 ${
                        savingToGallery
                          ? 'bg-neutral-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:shadow-lg hover:scale-[1.02]'
                      }`}
                    >
                      {savingToGallery ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          {t.studio.saving}
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                          {user ? t.studio.gallery : t.studio.pro}
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modales */}
      <EmailGateModal
        isOpen={showEmailGate}
        onClose={() => setShowEmailGate(false)}
        onSubmit={(email) => {
          editLimit.setEmail(email);
          setShowEmailGate(false);
        }}
        type="edit"
      />

      <SignupGateModal
        isOpen={showSignupGate}
        onClose={() => setShowSignupGate(false)}
        onSuccess={() => {
          editLimit.setHasAccount(true);
          setShowSignupGate(false);
        }}
      />

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />

      <FeedbackPopup show={feedback.showPopup} onAccept={feedback.handleAccept} onDismiss={feedback.handleDismiss} />
      <FeedbackModal isOpen={feedback.showModal} onClose={feedback.handleModalClose} />
    </div>
  );
}

export default function StudioPage() {
  const { t } = useLanguage();
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-blue-50/30 to-purple-50/20 py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-neutral-200 border-t-blue-600 mx-auto mb-6"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
              </svg>
            </div>
          </div>
          <p className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 animate-pulse">
            {t.studio.loadingStudio}
          </p>
          <p className="text-sm text-neutral-500 mt-2">{t.studio.preparingEnvironment}</p>
        </div>
      </div>
    }>
      <StudioContent />
    </Suspense>
  );
}
