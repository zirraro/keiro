'use client';

import { useState, useEffect } from 'react';
import { addTextOverlay } from '@/lib/canvas-text-overlay';

export interface TextOverlayConfig {
  text: string;
  position: number; // 0-100 percentage from top
  textColor: string;
  backgroundColor: string;
  fontFamily: 'inter' | 'montserrat' | 'bebas' | 'roboto' | 'playfair';
  fontSize: number;
  backgroundStyle: 'clean' | 'none' | 'transparent' | 'solid' | 'gradient' | 'blur' | 'outline' | 'minimal' | 'glow';
  template: string;
  logoUrl?: string;
  logoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  logoSize?: number;
}

interface TextOverlayEditorProps {
  baseImageUrl: string;
  initialConfig?: Partial<TextOverlayConfig>;
  onApply: (imageUrl: string, config: TextOverlayConfig) => void;
  onCancel: () => void;
}

// Templates pertinents pour chaque usage social media
const TEMPLATES = [
  {
    id: 'scroll-stop',
    name: 'Scroll-Stop',
    icon: '🔥',
    description: 'Gros texte blanc centré, impact maximal',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backgroundStyle: 'glow' as const,
      position: 50,
      fontFamily: 'bebas' as const,
      fontSize: 90,
    }
  },
  {
    id: 'promo',
    name: 'Promo Flash',
    icon: '⚡',
    description: 'Bandeau rouge en haut, urgence FOMO',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: '#dc2626',
      backgroundStyle: 'solid' as const,
      position: 20,
      fontFamily: 'bebas' as const,
      fontSize: 70,
    }
  },
  {
    id: 'elegant',
    name: 'Luxe Minimal',
    icon: '✨',
    description: 'Serif fin sur fond flou, premium',
    defaults: {
      textColor: '#1e293b',
      backgroundColor: 'rgba(255, 255, 255, 0.88)',
      backgroundStyle: 'blur' as const,
      position: 50,
      fontFamily: 'playfair' as const,
      fontSize: 48,
    }
  },
  {
    id: 'tiktok-hook',
    name: 'Hook TikTok',
    icon: '💥',
    description: 'Texte contour en haut, accroche vidéo',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backgroundStyle: 'outline' as const,
      position: 20,
      fontFamily: 'montserrat' as const,
      fontSize: 80,
    }
  },
  {
    id: 'cta-bottom',
    name: 'Call-to-Action',
    icon: '👉',
    description: 'Bouton dégradé en bas, pousse à l\'action',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
      backgroundStyle: 'gradient' as const,
      position: 80,
      fontFamily: 'montserrat' as const,
      fontSize: 55,
    }
  },
  {
    id: 'cinema',
    name: 'Cinéma',
    icon: '🎬',
    description: 'Texte pur avec ombre, style film',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'transparent',
      backgroundStyle: 'clean' as const,
      position: 80,
      fontFamily: 'bebas' as const,
      fontSize: 75,
    }
  },
  {
    id: 'temoignage',
    name: 'Témoignage',
    icon: '⭐',
    description: 'Citation sur fond doux, preuve sociale',
    defaults: {
      textColor: '#1e293b',
      backgroundColor: 'rgba(254, 249, 195, 0.92)',
      backgroundStyle: 'transparent' as const,
      position: 50,
      fontFamily: 'playfair' as const,
      fontSize: 46,
    }
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Pro',
    icon: '🎯',
    description: 'Sobre et crédible, fond minimal blanc',
    defaults: {
      textColor: '#0f172a',
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      backgroundStyle: 'minimal' as const,
      position: 80,
      fontFamily: 'inter' as const,
      fontSize: 42,
    }
  },
];

const FONT_FAMILIES = [
  { id: 'inter', name: 'Inter', description: 'Moderne & lisible' },
  { id: 'montserrat', name: 'Montserrat', description: 'Gras & impactant' },
  { id: 'bebas', name: 'Bebas Neue', description: 'Titrage cinéma' },
  { id: 'roboto', name: 'Roboto', description: 'Classique universel' },
  { id: 'playfair', name: 'Playfair', description: 'Élégant serif' },
];

const BACKGROUND_STYLES = [
  { value: 'clean' as const, label: 'Aucun fond', description: 'Texte pur + ombre portée', emoji: '🎬' },
  { value: 'minimal' as const, label: 'Minimal', description: 'Ombre très légère, discret', emoji: '🎯' },
  { value: 'none' as const, label: 'Contour épais', description: 'Sans fond, contour fort', emoji: '✏️' },
  { value: 'transparent' as const, label: 'Semi-transparent', description: 'Fond coloré léger', emoji: '👻' },
  { value: 'blur' as const, label: 'Flou vitré', description: 'Fond flou + transparence', emoji: '💨' },
  { value: 'solid' as const, label: 'Solide opaque', description: 'Fond plein, max contraste', emoji: '⬛' },
  { value: 'gradient' as const, label: 'Dégradé', description: 'Fond dégradé diagonal', emoji: '🌈' },
  { value: 'outline' as const, label: 'Contour fin', description: 'Rectangle contour seul', emoji: '⭕' },
  { value: 'glow' as const, label: 'Néon / Glow', description: 'Halo lumineux autour', emoji: '💫' },
];

export default function TextOverlayEditor({
  baseImageUrl,
  initialConfig,
  onApply,
  onCancel,
}: TextOverlayEditorProps) {
  const [config, setConfig] = useState<TextOverlayConfig>({
    text: initialConfig?.text || '',
    position: initialConfig?.position ?? 50,
    textColor: initialConfig?.textColor || '#ffffff',
    backgroundColor: initialConfig?.backgroundColor || 'rgba(0, 0, 0, 0.5)',
    fontFamily: initialConfig?.fontFamily || 'inter',
    fontSize: initialConfig?.fontSize || 80,
    backgroundStyle: initialConfig?.backgroundStyle || 'transparent',
    template: initialConfig?.template || 'scroll-stop',
    logoUrl: initialConfig?.logoUrl || undefined,
    logoPosition: initialConfig?.logoPosition || 'top-left',
    logoSize: initialConfig?.logoSize || 100,
  });

  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Générer preview
  const generatePreview = async () => {
    if (!config.text.trim()) {
      setPreviewUrl(baseImageUrl);
      return;
    }

    setIsGenerating(true);
    try {
      const result = await addTextOverlay(baseImageUrl, {
        text: config.text,
        position: config.position,
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

  // Régénérer preview quand config change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      generatePreview();
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [config, baseImageUrl]);

  const applyTemplate = (template: typeof TEMPLATES[0]) => {
    setConfig(prev => ({
      ...prev,
      ...template.defaults,
      template: template.id,
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
          <h2 className="text-xl font-bold text-neutral-900">Personnaliser le texte et le logo</h2>
          <button
            onClick={onCancel}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid lg:grid-cols-2 gap-6 p-6">
            {/* Preview */}
            <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <h3 className="text-sm font-semibold text-neutral-700">Apercu en temps reel</h3>
              <div className="relative w-full max-h-[70vh] bg-neutral-100 rounded-xl overflow-hidden border-2 border-neutral-200 flex items-center justify-center">
                {isGenerating && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="text-center">
                      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-neutral-600">Generation...</p>
                    </div>
                  </div>
                )}
                <img
                  src={previewUrl || baseImageUrl}
                  alt="Preview"
                  className="w-full max-h-[70vh] object-contain"
                />
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-6">
              {/* Texte */}
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  Votre message
                </label>
                <textarea
                  value={config.text}
                  onChange={(e) => setConfig(prev => ({ ...prev, text: e.target.value }))}
                  placeholder="Ex: -50% ce week-end seulement !"
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border-2 border-neutral-300 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 resize-none"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  <span className="font-semibold">{config.text.length}</span> caracteres
                </p>
              </div>

              {/* Logo */}
              <div className="border-t-2 border-neutral-100 pt-4">
                <label className="block text-sm font-semibold text-neutral-700 mb-3">
                  Logo (optionnel)
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
                      Ajouter votre logo
                    </label>
                    <p className="text-xs text-neutral-500 mt-2">PNG avec fond transparent recommande</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                      <img src={config.logoUrl} alt="Logo" className="w-16 h-16 object-contain bg-white rounded border border-neutral-200" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-neutral-700">Logo ajoute</p>
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
                            {pos === 'top-left' && 'Haut gauche'}
                            {pos === 'top-right' && 'Haut droite'}
                            {pos === 'bottom-left' && 'Bas gauche'}
                            {pos === 'bottom-right' && 'Bas droite'}
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

              {/* Position du texte — up/down contrôle fin */}
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">Position du texte <span className="text-neutral-400 font-normal">({config.position}%)</span></label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, position: Math.max(8, prev.position - 10) }))}
                    className="flex items-center gap-1 px-3 py-2.5 rounded-lg text-sm font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all"
                  >
                    <span>⬆️</span> Haut +
                  </button>
                  <div className="flex-1 flex items-center gap-2 justify-center">
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, position: 20 }))}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${config.position <= 30 ? 'bg-blue-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                    >Haut</button>
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, position: 50 }))}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${config.position > 30 && config.position < 70 ? 'bg-blue-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                    >Centre</button>
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, position: 80 }))}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${config.position >= 70 ? 'bg-blue-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                    >Bas</button>
                  </div>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, position: Math.min(92, prev.position + 10) }))}
                    className="flex items-center gap-1 px-3 py-2.5 rounded-lg text-sm font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all"
                  >
                    <span>⬇️</span> Bas +
                  </button>
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
                    value={config.backgroundColor.startsWith('rgba') || config.backgroundColor.startsWith('linear') ? '#3b82f6' : config.backgroundColor}
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
                <div className="grid grid-cols-5 gap-2">
                  {FONT_FAMILIES.map((font) => (
                    <button
                      key={font.id}
                      onClick={() => setConfig(prev => ({ ...prev, fontFamily: font.id as any }))}
                      className={`px-2 py-2 rounded-lg text-xs font-medium transition-all text-center ${
                        config.fontFamily === font.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      <div className="font-bold text-sm">{font.name}</div>
                      <div className="text-[10px] opacity-75">{font.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Style de fond */}
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">Style de fond</label>
                <div className="grid grid-cols-3 gap-2">
                  {BACKGROUND_STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => setConfig(prev => ({ ...prev, backgroundStyle: style.value }))}
                      className={`px-3 py-2.5 rounded-lg text-xs transition-all text-left ${
                        config.backgroundStyle === style.value
                          ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      <span className="mr-1">{style.emoji}</span>
                      <span className="font-semibold">{style.label}</span>
                      <div className={`text-[10px] mt-0.5 ${config.backgroundStyle === style.value ? 'text-blue-100' : 'text-neutral-500'}`}>
                        {style.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Templates */}
              <div className="border-t-2 border-neutral-100 pt-4">
                <label className="block text-sm font-semibold text-neutral-700 mb-3">Templates rapides</label>
                <div className="grid grid-cols-2 gap-3">
                  {TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => applyTemplate(template)}
                      className={`p-3 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
                        config.template === template.id
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-neutral-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">{template.icon}</div>
                      <div className="text-xs font-semibold text-neutral-900">{template.name}</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">{template.description}</div>
                    </button>
                  ))}
                </div>
              </div>
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
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
