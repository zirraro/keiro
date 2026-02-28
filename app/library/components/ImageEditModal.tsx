'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { addTextOverlay, type TextOverlayOptions } from '@/lib/canvas-text-overlay';

interface ImageEditModalProps {
  imageUrl: string;
  originalImageUrl?: string; // Image sans overlay pour édition propre
  imageId?: string;
  initialText?: string;
  onClose: () => void;
  onImageEdited: (newImageUrl: string, textOverlay?: string) => void;
}

type TabType = 'ai' | 'text';
type Position = 'top' | 'center' | 'bottom';
type FontFamily = 'inter' | 'montserrat' | 'bebas' | 'roboto' | 'playfair';
type BgStyle = 'transparent' | 'clean' | 'none' | 'solid' | 'gradient' | 'blur' | 'outline' | 'minimal' | 'glow';

interface TextOverlayItem {
  id: string;
  text: string;
  position: Position;
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

const BG_STYLES: { value: BgStyle; emoji: string; label: string }[] = [
  { value: 'clean', emoji: '🔲', label: 'Sans fond' },
  { value: 'none', emoji: '🅰', label: 'Contour fort' },
  { value: 'minimal', emoji: '·', label: 'Discret' },
  { value: 'transparent', emoji: '▦', label: 'Transparent' },
  { value: 'solid', emoji: '■', label: 'Solide' },
  { value: 'gradient', emoji: '◐', label: 'Dégradé' },
  { value: 'blur', emoji: '☁', label: 'Flou' },
  { value: 'outline', emoji: '□', label: 'Contour' },
  { value: 'glow', emoji: '✧', label: 'Lumineux' },
];

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'top', label: 'Haut' },
  { value: 'center', label: 'Centre' },
  { value: 'bottom', label: 'Bas' },
];

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export default function ImageEditModal({ imageUrl, originalImageUrl, imageId, initialText, onClose, onImageEdited }: ImageEditModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('text');
  const [editProvider, setEditProvider] = useState<string>('');

  // === AI Edit state ===
  const [prompt, setPrompt] = useState('');
  const [editStrength, setEditStrength] = useState(5.5);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEditedUrl, setAiEditedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // === Text Overlay state — array-based ===
  const [textOverlays, setTextOverlays] = useState<TextOverlayItem[]>(() => {
    if (initialText) {
      return [{
        id: generateId(),
        text: initialText,
        position: 'bottom' as Position,
        fontSize: 60,
        fontFamily: 'montserrat' as FontFamily,
        textColor: '#ffffff',
        bgColor: 'rgba(0, 0, 0, 0.5)',
        bgStyle: 'clean' as BgStyle,
      }];
    }
    return [];
  });
  const [editingId, setEditingId] = useState<string | null>(initialText ? textOverlays[0]?.id || null : null);
  const [textPreviewUrl, setTextPreviewUrl] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  // Form state for current editing overlay
  const [formText, setFormText] = useState(initialText || '');
  const [formPosition, setFormPosition] = useState<Position>('bottom');
  const [formFontFamily, setFormFontFamily] = useState<FontFamily>('montserrat');
  const [formFontSize, setFormFontSize] = useState(60);
  const [formTextColor, setFormTextColor] = useState('#ffffff');
  const [formBgColor, setFormBgColor] = useState('rgba(0, 0, 0, 0.5)');
  const [formBgStyle, setFormBgStyle] = useState<BgStyle>('clean');

  const baseImage = originalImageUrl || imageUrl;
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load overlay values into form when selecting an overlay to edit
  const loadOverlayIntoForm = useCallback((overlay: TextOverlayItem) => {
    setFormText(overlay.text);
    setFormPosition(overlay.position);
    setFormFontFamily(overlay.fontFamily);
    setFormFontSize(overlay.fontSize);
    setFormTextColor(overlay.textColor);
    setFormBgColor(overlay.bgColor);
    setFormBgStyle(overlay.bgStyle);
  }, []);

  // Get the current form values as an overlay item
  const getFormAsOverlay = useCallback((): Omit<TextOverlayItem, 'id'> => ({
    text: formText,
    position: formPosition,
    fontSize: formFontSize,
    fontFamily: formFontFamily,
    textColor: formTextColor,
    bgColor: formBgColor,
    bgStyle: formBgStyle,
  }), [formText, formPosition, formFontSize, formFontFamily, formTextColor, formBgColor, formBgStyle]);

  // Build the full list of overlays to render (committed + current editing)
  const getOverlaysToRender = useCallback((): TextOverlayItem[] => {
    const overlays = [...textOverlays];
    if (editingId) {
      // Replace the editing overlay with current form values
      const idx = overlays.findIndex(o => o.id === editingId);
      if (idx !== -1) {
        overlays[idx] = { ...overlays[idx], ...getFormAsOverlay() };
      }
    } else if (formText.trim()) {
      // New overlay being typed (not yet committed)
      overlays.push({ id: '__new__', ...getFormAsOverlay() });
    }
    return overlays.filter(o => o.text.trim());
  }, [textOverlays, editingId, formText, getFormAsOverlay]);

  // Generate preview: render ALL overlays from the clean base image
  const generatePreview = useCallback(async () => {
    const overlays = getOverlaysToRender();
    if (overlays.length === 0) {
      setTextPreviewUrl(null);
      return;
    }

    setTextLoading(true);
    try {
      let currentImage = baseImage;
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
      console.error('[TextOverlay] Preview error:', err);
    } finally {
      setTextLoading(false);
    }
  }, [baseImage, getOverlaysToRender]);

  // Debounced preview — any change to form or overlays triggers a re-render
  useEffect(() => {
    if (activeTab !== 'text') return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(generatePreview, 400);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [formText, formPosition, formFontSize, formFontFamily, formTextColor, formBgColor, formBgStyle, textOverlays, activeTab, generatePreview]);

  // === Overlay management actions ===

  // Add current form as new overlay
  const handleAddOverlay = () => {
    if (!formText.trim()) return;
    if (editingId) {
      // Update existing
      setTextOverlays(prev => prev.map(o =>
        o.id === editingId ? { ...o, ...getFormAsOverlay() } : o
      ));
      setEditingId(null);
    } else {
      // Add new
      const newOverlay: TextOverlayItem = { id: generateId(), ...getFormAsOverlay() };
      setTextOverlays(prev => [...prev, newOverlay]);
    }
    // Reset form for next overlay
    setFormText('');
    setFormPosition('bottom');
    setFormFontSize(60);
    setFormBgStyle('clean');
  };

  // Select an overlay to edit
  const handleEditOverlay = (overlay: TextOverlayItem) => {
    // If currently editing, commit changes first
    if (editingId && formText.trim()) {
      setTextOverlays(prev => prev.map(o =>
        o.id === editingId ? { ...o, ...getFormAsOverlay() } : o
      ));
    }
    setEditingId(overlay.id);
    loadOverlayIntoForm(overlay);
  };

  // Delete a specific overlay
  const handleDeleteOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(o => o.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setFormText('');
    }
  };

  // Delete all overlays
  const handleDeleteAll = async () => {
    setTextOverlays([]);
    setEditingId(null);
    setFormText('');
    setTextPreviewUrl(null);

    setSaving(true);
    try {
      const cleanImage = baseImage;
      if (imageId) {
        await fetch('/api/library/update-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId, newImageUrl: cleanImage, textOverlay: null }),
        });
      }
      onImageEdited(cleanImage, '');
    } catch (err) {
      console.error('[ImageEditModal] Delete overlay error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Start adding a new overlay (clear form)
  const handleNewOverlay = () => {
    // If currently editing, commit changes first
    if (editingId && formText.trim()) {
      setTextOverlays(prev => prev.map(o =>
        o.id === editingId ? { ...o, ...getFormAsOverlay() } : o
      ));
    }
    setEditingId(null);
    setFormText('');
    setFormPosition('top');
    setFormFontSize(60);
    setFormBgStyle('clean');
  };

  // === AI Edit handlers (with retry on network errors) ===
  const handleAiEdit = async () => {
    if (!prompt.trim()) return;
    setAiLoading(true);
    setError(null);
    setAiEditedUrl(null);

    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch('/api/seedream/i2i', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt.trim(), imageUrl, guidance_scale: editStrength }),
        });
        const data = await res.json();
        if (!data.ok) {
          setError(data.error || 'Erreur lors de la modification');
          break;
        }
        setAiEditedUrl(data.imageUrl);
        if (data._p) setEditProvider(data._p);
        break;
      } catch (err: any) {
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        setError('Erreur réseau. Vérifiez votre connexion et réessayez.');
      }
    }
    setAiLoading(false);
  };

  // === Save (common for both tabs) ===
  const handleUse = async (resultUrl: string) => {
    setSaving(true);
    setError(null);

    try {
      let finalUrl = resultUrl;

      // Upload data URLs to Supabase Storage
      if (resultUrl.startsWith('data:')) {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Non authentifié');

        // Conversion base64 → Blob directe
        const base64Data = resultUrl.split(',')[1];
        const mimeType = resultUrl.match(/data:([^;]+)/)?.[1] || 'image/png';
        const byteChars = atob(base64Data);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArray], { type: mimeType });

        const fileName = `${user.id}/${Date.now()}_edited_${Math.random().toString(36).substring(7)}.png`;

        const { error: uploadError } = await supabase.storage
          .from('generated-images')
          .upload(fileName, blob, { contentType: 'image/png', cacheControl: '3600', upsert: false });

        if (uploadError) throw new Error(uploadError.message);

        const { data: { publicUrl } } = supabase.storage
          .from('generated-images')
          .getPublicUrl(fileName);

        finalUrl = publicUrl;
      }

      // Combine all overlay texts for DB storage
      const allTexts = textOverlays.map(o => o.text).join(' | ');

      // Update in DB if imageId provided
      if (imageId) {
        const res = await fetch('/api/library/update-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageId,
            newImageUrl: finalUrl,
            textOverlay: allTexts || null,
            originalImageUrl: baseImage,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          console.error('[ImageEditModal] Update error:', data.error);
        }
      }

      onImageEdited(finalUrl, allTexts || undefined);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  // Save with text overlays: first commit current form, then render + save
  const handleSaveText = async () => {
    // Commit current form if editing
    let finalOverlays = [...textOverlays];
    if (editingId && formText.trim()) {
      finalOverlays = finalOverlays.map(o =>
        o.id === editingId ? { ...o, ...getFormAsOverlay() } : o
      );
    } else if (!editingId && formText.trim()) {
      finalOverlays.push({ id: generateId(), ...getFormAsOverlay() });
    }

    if (finalOverlays.length === 0) return;

    setTextLoading(true);
    try {
      // Render all overlays from clean base
      let currentImage = baseImage;
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
      setTextOverlays(finalOverlays);
      await handleUse(currentImage);
    } catch (err) {
      console.error('[TextOverlay] Save error:', err);
      setError('Erreur lors de la sauvegarde');
    } finally {
      setTextLoading(false);
    }
  };

  const currentResult = activeTab === 'ai' ? aiEditedUrl : textPreviewUrl;
  const isLoading = activeTab === 'ai' ? aiLoading : textLoading;
  const hasOverlays = textOverlays.length > 0 || formText.trim();

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header with tabs */}
        <div className="border-b">
          <div className="flex items-center justify-between px-4 pt-3 pb-0">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('text')}
                className={`px-3 py-2 text-sm font-semibold rounded-t-lg transition ${
                  activeTab === 'text'
                    ? 'bg-white border border-b-0 border-neutral-200 text-blue-700'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {textOverlays.length > 0 ? `Textes (${textOverlays.length})` : 'Ajouter du texte'}
              </button>
              <button
                onClick={() => setActiveTab('ai')}
                className={`px-3 py-2 text-sm font-semibold rounded-t-lg transition ${
                  activeTab === 'ai'
                    ? 'bg-white border border-b-0 border-neutral-200 text-purple-700'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Modifier
              </button>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded-lg transition mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Image preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1">Original</p>
              <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden border">
                <img src={imageUrl} alt="Original" className="w-full h-full object-cover" />
              </div>
            </div>
            {currentResult && (
              <div>
                <p className="text-xs font-medium text-emerald-600 mb-1 flex items-center gap-1.5">
                  {activeTab === 'text' ? 'Aperçu' : 'Modifié'}
                  {activeTab === 'ai' && editProvider && (
                    <span className={`w-3 h-3 rounded-full inline-block ${editProvider === 'k' ? 'bg-emerald-500' : 'bg-orange-500'}`} />
                  )}
                </p>
                <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden border border-emerald-300">
                  <img src={currentResult} alt="Résultat" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
          </div>

          {/* === TEXT OVERLAY TAB === */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              {/* Applied overlays list — each one clickable to edit, with delete button */}
              {textOverlays.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1.5">Textes appliqués</label>
                  <div className="space-y-1.5">
                    {textOverlays.map((overlay) => (
                      <div
                        key={overlay.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                          editingId === overlay.id
                            ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                            : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-neutral-100'
                        }`}
                        onClick={() => handleEditOverlay(overlay)}
                      >
                        <span className="text-xs font-medium text-neutral-400 uppercase w-10 shrink-0">
                          {overlay.position === 'top' ? 'Haut' : overlay.position === 'center' ? 'Centre' : 'Bas'}
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
                          title="Supprimer ce texte"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* Button to add another overlay */}
                  {editingId && (
                    <button
                      onClick={handleNewOverlay}
                      className="mt-2 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                    >
                      + Ajouter un autre texte
                    </button>
                  )}
                </div>
              )}

              {/* Text form */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  {editingId ? 'Modifier le texte' : 'Nouveau texte'}
                </label>
                <textarea
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="Ex: -20% ce weekend ! / Nouvelle collection / Offre spéciale..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                />
              </div>

              {/* Position */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Position</label>
                <div className="flex gap-1.5">
                  {POSITIONS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setFormPosition(p.value)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                        formPosition === p.value
                          ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font + Size */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Police</label>
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
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Taille: {formFontSize}px</label>
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
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Couleur texte</label>
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
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Couleur fond</label>
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
                <label className="block text-xs font-medium text-neutral-600 mb-1">Style de fond</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {BG_STYLES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setFormBgStyle(s.value)}
                      className={`py-1.5 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1 ${
                        formBgStyle === s.value
                          ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                    >
                      <span>{s.emoji}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* === AI EDIT TAB === */}
          {activeTab === 'ai' && (
            <div className="space-y-3">
              {/* Slider force de modification */}
              <div>
                <p className="text-sm font-medium mb-1.5">
                  Force : <span className="text-purple-600 font-bold">
                    {editStrength <= 5 ? 'Subtile' : editStrength <= 7 ? 'Modérée' : 'Forte'}
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
                <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                  <span>Subtile</span>
                  <span>Modérée</span>
                  <span>Forte</span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  {editStrength <= 5
                    ? 'Retouches légères : lumière, couleurs, détails'
                    : editStrength <= 7
                    ? 'Modifications visibles : ajout/suppression d\'éléments'
                    : 'Transformations créatives : changement de style ou composition'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Décrivez les modifications souhaitées
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    editStrength <= 5
                      ? 'Ex: Améliorer la lumière, saturer les couleurs, ajouter du contraste...'
                      : editStrength <= 7
                      ? 'Ex: Ajouter des plantes, changer le fond en bleu, enlever le texte...'
                      : 'Ex: Style vintage, ambiance golden hour, transformer en peinture...'
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  rows={3}
                  disabled={aiLoading}
                />
              </div>

              {aiLoading && (
                <div className="flex items-center justify-center gap-3 py-6">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-neutral-600">Modification en cours... (~15-30s)</span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3 flex flex-wrap gap-2">
          {activeTab === 'text' ? (
            // Text overlay footer
            <>
              {/* Valider / Ajouter le texte en cours */}
              {formText.trim() && (
                <button
                  onClick={handleAddOverlay}
                  disabled={saving || textLoading}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingId ? 'Valider la modification' : '+ Ajouter ce texte'}
                </button>
              )}
              {/* Sauvegarder (render final + upload) */}
              {hasOverlays && (
                <button
                  onClick={handleSaveText}
                  disabled={saving || textLoading}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              )}
              {/* Supprimer tout */}
              {(textOverlays.length > 0 || initialText) && (
                <button
                  onClick={handleDeleteAll}
                  disabled={saving}
                  className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium text-sm hover:bg-red-100 transition disabled:opacity-50"
                >
                  Tout supprimer
                </button>
              )}
            </>
          ) : (
            // AI edit footer
            <>
              {aiEditedUrl ? (
                <>
                  <button
                    onClick={() => handleUse(aiEditedUrl)}
                    disabled={saving}
                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    {saving ? 'Sauvegarde...' : 'Utiliser cette version'}
                  </button>
                  <button
                    onClick={() => { setAiEditedUrl(null); setError(null); }}
                    className="px-4 py-2.5 bg-neutral-100 text-neutral-700 rounded-lg font-medium text-sm hover:bg-neutral-200 transition"
                  >
                    Réessayer
                  </button>
                </>
              ) : (
                <button
                  onClick={handleAiEdit}
                  disabled={aiLoading || !prompt.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold text-sm hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {aiLoading ? 'Modification...' : 'Modifier'}
                </button>
              )}
            </>
          )}
          <button
            onClick={onClose}
            disabled={aiLoading || saving}
            className="px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg font-medium text-sm hover:bg-neutral-50 transition disabled:opacity-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
