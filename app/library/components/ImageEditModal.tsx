'use client';

import { useState, useEffect, useCallback } from 'react';
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

  // === Text Overlay state ===
  const [overlayText, setOverlayText] = useState(initialText || '');
  const [textPosition, setTextPosition] = useState<Position>('bottom');
  const [fontFamily, setFontFamily] = useState<FontFamily>('montserrat');
  const [fontSize, setFontSize] = useState(60);
  const [textColor, setTextColor] = useState('#ffffff');
  const [bgColor, setBgColor] = useState('rgba(0, 0, 0, 0.5)');
  const [bgStyle, setBgStyle] = useState<BgStyle>('clean');
  const [textPreviewUrl, setTextPreviewUrl] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [bakedBaseImage, setBakedBaseImage] = useState<string | null>(null);
  const [appliedTextsCount, setAppliedTextsCount] = useState(0);

  // Pour le texte overlay, utiliser l'image bakée (si texte déjà appliqué) ou l'originale
  const textBaseImage = bakedBaseImage || originalImageUrl || imageUrl;

  // Live preview for text overlay
  const generatePreview = useCallback(async () => {
    if (!overlayText.trim()) {
      setTextPreviewUrl(null);
      return;
    }
    setTextLoading(true);
    try {
      const result = await addTextOverlay(textBaseImage, {
        text: overlayText,
        position: textPosition,
        fontSize,
        fontFamily,
        textColor,
        backgroundColor: bgColor,
        backgroundStyle: bgStyle,
      });
      setTextPreviewUrl(result);
    } catch (err) {
      console.error('[TextOverlay] Preview error:', err);
    } finally {
      setTextLoading(false);
    }
  }, [overlayText, textPosition, fontSize, fontFamily, textColor, bgColor, bgStyle, textBaseImage]);

  // Debounced preview
  useEffect(() => {
    if (activeTab !== 'text' || !overlayText.trim()) return;
    const timer = setTimeout(generatePreview, 300);
    return () => clearTimeout(timer);
  }, [overlayText, textPosition, fontSize, fontFamily, textColor, bgColor, bgStyle, activeTab, generatePreview]);

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
          break; // Erreur API = pas de retry
        }
        setAiEditedUrl(data.imageUrl);
        if (data._p) setEditProvider(data._p);
        break; // Succes
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

        const response = await fetch(resultUrl);
        const blob = await response.blob();
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

      // Update in DB if imageId provided
      if (imageId) {
        const res = await fetch('/api/library/update-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageId,
            newImageUrl: finalUrl,
            textOverlay: overlayText.trim() || null,
            originalImageUrl: originalImageUrl || imageUrl,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          console.error('[ImageEditModal] Update error:', data.error);
        }
      }

      onImageEdited(finalUrl, overlayText.trim() || undefined);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const currentResult = activeTab === 'ai' ? aiEditedUrl : textPreviewUrl;
  const isLoading = activeTab === 'ai' ? aiLoading : textLoading;

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
                {appliedTextsCount > 0 ? `Texte (${appliedTextsCount} appliqué${appliedTextsCount > 1 ? 's' : ''})` : initialText ? 'Modifier le texte' : 'Ajouter du texte'}
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
              {/* Text input */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Texte</label>
                <textarea
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
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
                      onClick={() => setTextPosition(p.value)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                        textPosition === p.value
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
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value as FontFamily)}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-sm"
                  >
                    {FONTS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Taille: {fontSize}px</label>
                  <input
                    type="range"
                    min={24}
                    max={120}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
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
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-8 h-8 rounded border cursor-pointer"
                    />
                    <div className="flex gap-1">
                      {['#ffffff', '#000000', '#f59e0b', '#ef4444', '#3b82f6'].map(c => (
                        <button
                          key={c}
                          onClick={() => setTextColor(c)}
                          className={`w-6 h-6 rounded-full border-2 transition ${
                            textColor === c ? 'border-blue-500 scale-110' : 'border-neutral-300'
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
                      value={bgColor.startsWith('rgba') ? '#000000' : bgColor}
                      onChange={(e) => {
                        const hex = e.target.value;
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        setBgColor(`rgba(${r}, ${g}, ${b}, 0.6)`);
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
                          onClick={() => setBgColor(c)}
                          className={`w-6 h-6 rounded-full border-2 transition ${
                            bgColor === c ? 'border-blue-500 scale-110' : 'border-neutral-300'
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
                      onClick={() => setBgStyle(s.value)}
                      className={`py-1.5 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1 ${
                        bgStyle === s.value
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
        <div className="border-t px-4 py-3 flex gap-2">
          {activeTab === 'text' ? (
            // Text overlay footer
            <>
              <button
                onClick={() => textPreviewUrl && handleUse(textPreviewUrl)}
                disabled={!textPreviewUrl || saving || textLoading}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Sauvegarde...' : overlayText.trim() ? 'Appliquer le texte' : 'Sauvegarder'}
              </button>
              {/* Bouton Ajouter un texte : cuit le texte actuel dans l'image et permet d'en ajouter un autre */}
              {overlayText.trim() && textPreviewUrl && (
                <button
                  onClick={() => {
                    // Cuire le texte actuel dans l'image de base
                    setBakedBaseImage(textPreviewUrl);
                    setAppliedTextsCount(prev => prev + 1);
                    setOverlayText('');
                    setTextPreviewUrl(null);
                  }}
                  disabled={saving || textLoading}
                  className="px-4 py-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg font-medium text-sm hover:bg-blue-100 transition disabled:opacity-50"
                >
                  + Ajouter un texte
                </button>
              )}
              {(initialText || appliedTextsCount > 0) && (
                <button
                  onClick={async () => {
                    // Supprimer tout le texte — revenir à l'image originale propre
                    setOverlayText('');
                    setTextPreviewUrl(null);
                    setBakedBaseImage(null);
                    setAppliedTextsCount(0);
                    setSaving(true);
                    try {
                      const cleanImage = originalImageUrl || imageUrl;
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
                  }}
                  disabled={saving}
                  className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium text-sm hover:bg-red-100 transition disabled:opacity-50"
                >
                  Supprimer le texte
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
                  {aiLoading ? 'Modification...' : 'Modifier avec l\'IA'}
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
