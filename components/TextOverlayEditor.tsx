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
  backgroundStyle: 'transparent' | 'solid' | 'gradient' | 'blur';
  template: 'headline' | 'cta' | 'minimal' | 'bold' | 'elegant' | 'modern';
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

const TEMPLATES = [
  {
    id: 'headline',
    name: 'Headline',
    icon: '📰',
    description: 'Titre impactant',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      backgroundStyle: 'transparent' as const,
      position: 'top-center' as const,
    }
  },
  {
    id: 'cta',
    name: 'Call-to-Action',
    icon: '🎯',
    description: 'Bouton d\'action',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: '#3b82f6',
      backgroundStyle: 'solid' as const,
      position: 'bottom-center' as const,
    }
  },
  {
    id: 'minimal',
    name: 'Minimaliste',
    icon: '✨',
    description: 'Simple et élégant',
    defaults: {
      textColor: '#000000',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      backgroundStyle: 'solid' as const,
      position: 'center' as const,
    }
  },
  {
    id: 'bold',
    name: 'Bold',
    icon: '💪',
    description: 'Gras et audacieux',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'rgba(220, 38, 38, 0.9)',
      backgroundStyle: 'solid' as const,
      position: 'center' as const,
    }
  },
  {
    id: 'elegant',
    name: 'Élégant',
    icon: '👔',
    description: 'Sophistiqué',
    defaults: {
      textColor: '#1f2937',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backgroundStyle: 'blur' as const,
      position: 'center' as const,
    }
  },
  {
    id: 'modern',
    name: 'Moderne',
    icon: '🚀',
    description: 'Gradient dynamique',
    defaults: {
      textColor: '#ffffff',
      backgroundColor: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
      backgroundStyle: 'gradient' as const,
      position: 'bottom-center' as const,
    }
  },
];

const FONT_FAMILIES = [
  { id: 'inter', name: 'Inter', style: 'font-sans' },
  { id: 'montserrat', name: 'Montserrat', style: 'font-sans font-bold' },
  { id: 'bebas', name: 'Bebas Neue', style: 'font-display' },
  { id: 'roboto', name: 'Roboto', style: 'font-sans' },
  { id: 'playfair', name: 'Playfair', style: 'font-serif' },
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
        textColor: config.textColor,
        backgroundColor: config.backgroundColor,
      });

      setPreviewUrl(result);
    } catch (error) {
      console.error('[TextOverlayEditor] Preview error:', error);
      setPreviewUrl(baseImageUrl);
    } finally {
      setIsGenerating(false);
    }
  };

  // Régénérer preview quand config change (debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      generatePreview();
    }, 500);

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
          <h2 className="text-xl font-bold text-neutral-900">✨ Éditeur de Texte Overlay</h2>
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
                        <option key={font.id} value={font.id}>{font.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Style de fond */}
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Style de fond</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['transparent', 'solid', 'gradient', 'blur'] as const).map((style) => (
                        <button
                          key={style}
                          onClick={() => setConfig(prev => ({ ...prev, backgroundStyle: style }))}
                          className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                            config.backgroundStyle === style
                              ? 'bg-blue-500 text-white'
                              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Texte */}
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">Texte</label>
                <textarea
                  value={config.text}
                  onChange={(e) => setConfig(prev => ({ ...prev, text: e.target.value }))}
                  placeholder="Écrivez votre texte accrocheur..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  {config.text.length} caractères • Max 100 recommandé
                </p>
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
            ✓ Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
