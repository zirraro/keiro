'use client';

import { useState, useEffect } from 'react';
import { addTextOverlay } from '@/lib/canvas-text-overlay';

export interface TextOverlayConfig {
  text: string;
  position: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  textColor: string;
  backgroundColor: string;
  fontFamily: 'inter' | 'montserrat' | 'bebas' | 'roboto' | 'playfair';
  fontSize: number;
  backgroundStyle: 'clean' | 'none' | 'transparent' | 'solid' | 'gradient' | 'blur' | 'outline' | 'minimal' | 'glow';
  template: 'headline' | 'cta' | 'promo-flash' | 'badge-nouveau' | 'citation' | 'annonce' | 'urgent' | 'premium-gold' | 'elegant' | 'story' | 'temoignage' | 'evenement' | 'transformation';
  logoUrl?: string; // URL du logo à ajouter en overlay
  logoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  logoSize?: number; // Taille du logo en pixels
}

interface TextOverlayEditorProps {
  baseImageUrl: string;
  initialConfig?: Partial<TextOverlayConfig>;
  onApply: (imageUrl: string, config: TextOverlayConfig) => void;
  onCancel: () => void;
}

const POSITION_LABELS: Record<TextOverlayConfig['position'], string> = {
  'top-left': '↖️ Haut gauche',
  'top-center': '⬆️ Haut centre',
  'top-right': '↗️ Haut droite',
  'center-left': '⬅️ Centre gauche',
  'center': '⏺️ Centre',
  'center-right': '➡️ Centre droite',
  'bottom-left': '↙️ Bas gauche',
  'bottom-center': '⬇️ Bas centre',
  'bottom-right': '↘️ Bas droite',
};

// Templates PRO réseaux sociaux - Expert level sans filtre
const TEMPLATES = [
  {
    id: 'instagram-viral',
    name: '🔥 Viral Insta',
    icon: '🔥',
    description: 'Accrocheur, maximal impact scroll-stop',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      backgroundStyle: 'glow' as const,
      position: 'center' as const,
      fontFamily: 'bebas' as const,
      fontSize: 90,
    }
  },
  {
    id: 'soft-luxury',
    name: '✨ Luxe Soft',
    icon: '✨',
    description: 'Minimaliste premium, élégance discrète',
    defaults: {
      textColor: '#1e293b',
      backgroundColor: 'rgba(255, 255, 255, 0.88)',
      backgroundStyle: 'blur' as const,
      position: 'center' as const,
      fontFamily: 'playfair' as const,
      fontSize: 48,
    }
  },
  {
    id: 'promo-flash',
    name: '⚡ Flash Urgence',
    icon: '⚡',
    description: 'FOMO maximum, action immédiate',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: '#dc2626',
      backgroundStyle: 'solid' as const,
      position: 'top-right' as const,
      fontFamily: 'bebas' as const,
      fontSize: 52,
    }
  },
  {
    id: 'tiktok-hook',
    name: '💥 Hook TikTok',
    icon: '💥',
    description: 'Première seconde décisive, texte gros haut',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backgroundStyle: 'outline' as const,
      position: 'top-center' as const,
      fontFamily: 'bebas' as const,
      fontSize: 85,
    }
  },
  {
    id: 'story-question',
    name: '💬 Story Question',
    icon: '💬',
    description: 'Engagement conversationnel, ton perso',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'rgba(37, 99, 235, 0.9)',
      backgroundStyle: 'transparent' as const,
      position: 'bottom-center' as const,
      fontFamily: 'montserrat' as const,
      fontSize: 55,
    }
  },
  {
    id: 'linkedin-thought',
    name: '🎯 LinkedIn Pro',
    icon: '🎯',
    description: 'Crédible B2B, autorité expertise',
    defaults: {
      textColor: '#0f172a',
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      backgroundStyle: 'minimal' as const,
      position: 'bottom-left' as const,
      fontFamily: 'inter' as const,
      fontSize: 42,
    }
  },
  {
    id: 'clean-text',
    name: '🎬 Texte Pur',
    icon: '🎬',
    description: 'Zéro fond, texte seul avec ombre portée',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'transparent',
      backgroundStyle: 'clean' as const,
      position: 'center' as const,
      fontFamily: 'bebas' as const,
      fontSize: 75,
    }
  },
  {
    id: 'testimonial-box',
    name: '⭐ Témoignage',
    icon: '⭐',
    description: 'Preuve sociale, citation impactante',
    defaults: {
      textColor: '#1e293b',
      backgroundColor: 'rgba(254, 249, 195, 0.95)',
      backgroundStyle: 'blur' as const,
      position: 'center' as const,
      fontFamily: 'playfair' as const,
      fontSize: 46,
    }
  },
];

const FONT_FAMILIES = [
  { id: 'inter', name: '🔤 Inter', description: 'Moderne', style: 'font-sans' },
  { id: 'montserrat', name: '💪 Montserrat', description: 'Gras', style: 'font-sans font-bold' },
  { id: 'bebas', name: '📰 Bebas Neue', description: 'Impact', style: 'font-display' },
  { id: 'roboto', name: '⚙️ Roboto', description: 'Classique', style: 'font-sans' },
  { id: 'playfair', name: '✨ Playfair', description: 'Élégant', style: 'font-serif' },
];

export default function TextOverlayEditor({
  baseImageUrl,
  initialConfig,
  onApply,
  onCancel,
}: TextOverlayEditorProps) {
  const [config, setConfig] = useState<TextOverlayConfig>({
    text: initialConfig?.text || '',
    position: initialConfig?.position || 'center',
    textColor: initialConfig?.textColor || '#ffffff',
    backgroundColor: initialConfig?.backgroundColor || 'rgba(0, 0, 0, 0.5)',
    fontFamily: initialConfig?.fontFamily || 'inter',
    fontSize: initialConfig?.fontSize || 60,
    backgroundStyle: initialConfig?.backgroundStyle || 'transparent',
    template: initialConfig?.template || 'headline',
    logoUrl: initialConfig?.logoUrl || undefined,
    logoPosition: initialConfig?.logoPosition || 'top-left',
    logoSize: initialConfig?.logoSize || 100,
  });

  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'templates' | 'customize'>('templates');

  // Générer preview
  const generatePreview = async () => {
    if (!config.text.trim()) {
      setPreviewUrl(baseImageUrl);
      return;
    }

    setIsGenerating(true);
    try {
      // Convertir position en format simple pour addTextOverlay
      let simplePosition: 'top' | 'center' | 'bottom' = 'center';
      if (config.position.startsWith('top')) simplePosition = 'top';
      else if (config.position.startsWith('bottom')) simplePosition = 'bottom';

      const result = await addTextOverlay(baseImageUrl, {
        text: config.text,
        position: simplePosition,
        fontSize: config.fontSize,
        fontFamily: config.fontFamily,
        textColor: config.textColor,
        backgroundColor: config.backgroundColor,
        backgroundStyle: config.backgroundStyle,
        logoUrl: config.logoUrl,
        logoPosition: config.logoPosition,
        logoSize: config.logoSize,
      });

      setPreviewUrl(result);
    } catch (error) {
      console.error('[TextOverlayEditor] Preview error:', error);
      setPreviewUrl(baseImageUrl);
    } finally {
      setIsGenerating(false);
    }
  };

  // Régénérer preview quand config change (debounce MINIMAL pour preview temps réel)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      generatePreview();
    }, 50); // Réduit à 50ms pour preview INSTANTANÉE tout en évitant les re-renders excessifs

    return () => clearTimeout(timeoutId);
  }, [config, baseImageUrl]);

  const applyTemplate = (template: typeof TEMPLATES[0]) => {
    setConfig(prev => ({
      ...prev,
      ...template.defaults,
      template: template.id as TextOverlayConfig['template'],
    }));
  };

  const handleApply = () => {
    onApply(previewUrl || baseImageUrl, config);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-neutral-900">✨ Personnaliser le texte et le logo</h2>
          <button
            onClick={onCancel}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 border-b border-neutral-200">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                activeTab === 'templates'
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              🎨 Templates
            </button>
            <button
              onClick={() => setActiveTab('customize')}
              className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                activeTab === 'customize'
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              ⚙️ Personnaliser
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid lg:grid-cols-2 gap-6 p-6">
            {/* Preview */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-neutral-700">Aperçu en temps réel</h3>
              <div className="relative aspect-square bg-neutral-100 rounded-xl overflow-hidden border-2 border-neutral-200">
                {isGenerating && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="text-center">
                      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-neutral-600">Génération...</p>
                    </div>
                  </div>
                )}
                <img
                  src={previewUrl || baseImageUrl}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-4">
              {activeTab === 'templates' && (
                <div>
                  <h3 className="text-sm font-semibold text-neutral-700 mb-3">Choisir un template</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => applyTemplate(template)}
                        className={`p-4 rounded-xl border-2 text-left transition-all hover:scale-105 ${
                          config.template === template.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-neutral-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="text-3xl mb-2">{template.icon}</div>
                        <div className="text-sm font-semibold text-neutral-900">{template.name}</div>
                        <div className="text-xs text-neutral-500 mt-1">{template.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'customize' && (
                <div className="space-y-4">
                  {/* Texte */}
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">
                      💬 Votre message
                    </label>
                    <textarea
                      value={config.text}
                      onChange={(e) => setConfig(prev => ({ ...prev, text: e.target.value }))}
                      placeholder="Ex: -50% ce week-end seulement !"
                      rows={3}
                      className="w-full px-4 py-3 rounded-lg border-2 border-neutral-300 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 resize-none"
                    />
                    <div className="flex items-start gap-2 mt-2">
                      <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        <span className="font-semibold text-neutral-700">{config.text.length} caractères</span> •
                        Soyez <span className="font-semibold">direct et percutant</span>. Utilisez des chiffres, émojis et urgence pour capter l'attention.
                      </p>
                    </div>
                  </div>

                  {/* Logo */}
                  <div className="border-t-2 border-neutral-100 pt-4">
                    <label className="block text-sm font-semibold text-neutral-700 mb-3">
                      🎨 Logo (optionnel)
                    </label>

                    {!config.logoUrl ? (
                      <div className="border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors">
                        <svg className="w-12 h-12 mx-auto text-neutral-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg transition-all font-medium text-sm">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  setConfig(prev => ({ ...prev, logoUrl: ev.target?.result as string }));
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="hidden"
                          />
                          📤 Ajouter votre logo
                        </label>
                        <p className="text-xs text-neutral-500 mt-2">PNG avec fond transparent recommandé</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                          <img src={config.logoUrl} alt="Logo" className="w-16 h-16 object-contain bg-white rounded border border-neutral-200" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-neutral-700">Logo ajouté</p>
                            <p className="text-xs text-neutral-500">Visible en overlay sur l'image</p>
                          </div>
                          <button
                            onClick={() => setConfig(prev => ({ ...prev, logoUrl: undefined }))}
                            className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors font-medium"
                          >
                            Retirer
                          </button>
                        </div>

                        {/* Position du logo */}
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-2">Position du logo</label>
                          <div className="grid grid-cols-2 gap-2">
                            {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((pos) => (
                              <button
                                key={pos}
                                onClick={() => setConfig(prev => ({ ...prev, logoPosition: pos }))}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                  config.logoPosition === pos
                                    ? 'bg-purple-500 text-white'
                                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                                }`}
                              >
                                {pos === 'top-left' && '↖️ Haut gauche'}
                                {pos === 'top-right' && '↗️ Haut droite'}
                                {pos === 'bottom-left' && '↙️ Bas gauche'}
                                {pos === 'bottom-right' && '↘️ Bas droite'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Taille du logo */}
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-2">
                            Taille du logo ({config.logoSize}px)
                          </label>
                          <input
                            type="range"
                            min="50"
                            max="300"
                            step="10"
                            value={config.logoSize}
                            onChange={(e) => setConfig(prev => ({ ...prev, logoSize: parseInt(e.target.value) }))}
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Position */}
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Position</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(POSITION_LABELS) as TextOverlayConfig['position'][]).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => setConfig(prev => ({ ...prev, position: pos }))}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            config.position === pos
                              ? 'bg-blue-500 text-white'
                              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                          }`}
                        >
                          {POSITION_LABELS[pos]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Couleurs */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-2">Couleur texte</label>
                      <input
                        type="color"
                        value={config.textColor}
                        onChange={(e) => setConfig(prev => ({ ...prev, textColor: e.target.value }))}
                        className="w-full h-10 rounded-lg border border-neutral-300 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-2">Couleur fond</label>
                      <input
                        type="color"
                        value={config.backgroundColor.startsWith('rgba') ? '#3b82f6' : config.backgroundColor}
                        onChange={(e) => setConfig(prev => ({ ...prev, backgroundColor: e.target.value }))}
                        className="w-full h-10 rounded-lg border border-neutral-300 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Taille police */}
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">
                      Taille police ({config.fontSize}pt)
                    </label>
                    <input
                      type="range"
                      min="24"
                      max="120"
                      value={config.fontSize}
                      onChange={(e) => setConfig(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  {/* Police */}
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Police</label>
                    <select
                      value={config.fontFamily}
                      onChange={(e) => setConfig(prev => ({ ...prev, fontFamily: e.target.value as any }))}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm"
                    >
                      {FONT_FAMILIES.map((font) => (
                        <option key={font.id} value={font.id}>{font.name} - {font.description}</option>
                      ))}
                    </select>
                  </div>

                  {/* Style de fond */}
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Style de fond</label>
                    {/* Bouton "Aucun" distinct en haut */}
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, backgroundStyle: 'clean' }))}
                      className={`w-full mb-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        config.backgroundStyle === 'clean'
                          ? 'bg-green-500 text-white ring-2 ring-green-300'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 border-2 border-dashed border-neutral-300'
                      }`}
                    >
                      <span className="mr-1">🚫</span>
                      AUCUN FOND - Texte pur
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'minimal', label: 'Minimal (léger)', emoji: '🎯' },
                        { value: 'none', label: 'Fort contraste', emoji: '✨' },
                        { value: 'transparent', label: 'Semi-transparent', emoji: '👻' },
                        { value: 'solid', label: 'Solide', emoji: '⬛' },
                        { value: 'gradient', label: 'Dégradé', emoji: '🌈' },
                        { value: 'blur', label: 'Flou', emoji: '💨' },
                        { value: 'outline', label: 'Contour', emoji: '⭕' },
                        { value: 'glow', label: 'Effet Glow', emoji: '💫' }
                      ] as const).map((style) => (
                        <button
                          key={style.value}
                          onClick={() => setConfig(prev => ({ ...prev, backgroundStyle: style.value }))}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            config.backgroundStyle === style.value
                              ? 'bg-blue-500 text-white'
                              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                          }`}
                        >
                          <span className="mr-1">{style.emoji}</span>
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between bg-neutral-50">
          <button
            onClick={onCancel}
            className="px-6 py-2 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100 transition-colors font-medium"
          >
            Annuler
          </button>
          <button
            onClick={handleApply}
            disabled={!config.text.trim()}
            className="px-8 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✓ Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
