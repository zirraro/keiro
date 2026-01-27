'use client';

import { useState, useEffect } from 'react';

type Platform = 'instagram' | 'tiktok' | 'facebook' | 'twitter';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: {
    id: string;
    image_url: string;
    title?: string;
  };
  onSchedule: (data: {
    platforms: Platform[];
    scheduledFor: string;
    caption: string;
    hashtags: string[];
  }) => Promise<void>;
}

export default function ScheduleModal({ isOpen, onClose, image, onSchedule }: ScheduleModalProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['instagram']);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [saving, setSaving] = useState(false);

  // Générer caption auto au chargement
  useEffect(() => {
    if (isOpen && !caption) {
      generateCaption();
    }
  }, [isOpen]);

  const generateCaption = async () => {
    // Caption simple basée sur le titre de l'image
    const title = image.title || 'Nouveau contenu';
    const defaultCaptions = [
      `✨ ${title}\n\nDécouvrez notre dernière création ! 🚀`,
      `🎯 ${title}\n\nOn partage avec vous cette nouvelle inspiration 💡`,
      `📢 ${title}\n\nÀ ne pas manquer ! 👀`,
    ];
    setCaption(defaultCaptions[Math.floor(Math.random() * defaultCaptions.length)]);
  };

  const generateHashtags = () => {
    const commonHashtags = ['#marketing', '#business', '#entrepreneur', '#digitalmarketing', '#socialmedia'];
    const platformHashtags: Record<Platform, string[]> = {
      instagram: ['#insta', '#instadaily', '#instagood'],
      tiktok: ['#tiktok', '#fyp', '#viral'],
      facebook: ['#facebook', '#fbpost', '#social'],
      twitter: ['#twitter', '#tweet', '#trending']
    };

    const selected = [
      ...commonHashtags.slice(0, 3),
      ...platformHashtags[selectedPlatforms[0]].slice(0, 2)
    ];

    setHashtags(selected.join(' '));
  };

  const handleSchedule = async () => {
    if (!date || !time) {
      alert('Veuillez sélectionner une date et heure');
      return;
    }

    if (selectedPlatforms.length === 0) {
      alert('Veuillez sélectionner au moins une plateforme');
      return;
    }

    setSaving(true);
    try {
      const scheduledFor = `${date}T${time}:00`;
      const hashtagArray = hashtags
        .split(' ')
        .filter(h => h.startsWith('#'))
        .map(h => h.trim());

      await onSchedule({
        platforms: selectedPlatforms,
        scheduledFor,
        caption,
        hashtags: hashtagArray
      });

      onClose();
    } catch (error) {
      console.error('Error scheduling post:', error);
      alert('Erreur lors de la planification');
    } finally {
      setSaving(false);
    }
  };

  // Générer date min (demain) et max (3 mois)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 3);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              📅 Planifier la publication
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Préparez votre contenu pour publication ultérieure
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Image Preview */}
          <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-lg">
            <img
              src={image.image_url}
              alt={image.title || 'Image'}
              className="w-20 h-20 object-cover rounded-lg"
            />
            <div>
              <p className="font-semibold text-neutral-900">{image.title || 'Sans titre'}</p>
              <p className="text-sm text-neutral-600">Image sélectionnée</p>
            </div>
          </div>

          {/* Platform Selection */}
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-3">
              Plateformes (sélection multiple)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(['instagram', 'tiktok', 'facebook', 'twitter'] as Platform[]).map((p) => {
                const isSelected = selectedPlatforms.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedPlatforms(selectedPlatforms.filter(pl => pl !== p));
                      } else {
                        setSelectedPlatforms([...selectedPlatforms, p]);
                      }
                    }}
                    className={`p-3 rounded-lg border-2 transition-all relative ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl">
                        {p === 'instagram' && '📷'}
                        {p === 'tiktok' && '🎵'}
                        {p === 'facebook' && '👥'}
                        {p === 'twitter' && '🐦'}
                      </span>
                      <span className="text-xs font-medium capitalize">{p}</span>
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Sélectionnez une ou plusieurs plateformes pour publier simultanément
            </p>
          </div>

          {/* Date & Time */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-2">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={minDate}
                max={maxDateStr}
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-2">
                Heure
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-neutral-900">
                Caption
              </label>
              <button
                onClick={generateCaption}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                ✨ Régénérer
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Écrivez votre caption..."
              className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-neutral-500 mt-1">{caption.length} caractères</p>
          </div>

          {/* Hashtags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-neutral-900">
                Hashtags
              </label>
              <button
                onClick={generateHashtags}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                ✨ Suggérer
              </button>
            </div>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#marketing #business #entrepreneur"
              className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Séparez les hashtags par des espaces
            </p>
          </div>

          {/* Auto-Publish Confirmation */}
          {selectedPlatforms.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-sm font-semibold text-green-900 mb-1">
                    Publication automatique activée
                  </p>
                  <p className="text-xs text-green-800">
                    Votre post sera publié automatiquement sur{' '}
                    <strong>
                      {selectedPlatforms.map((p, i) => (
                        <span key={p}>
                          {p}
                          {i < selectedPlatforms.length - 1 && ', '}
                        </span>
                      ))}
                    </strong>{' '}
                    à la date et heure choisies.
                    {selectedPlatforms.includes('tiktok') && (
                      <span className="block mt-1">
                        🎵 Pour TikTok : Votre image sera automatiquement convertie en vidéo de 5 secondes.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-6 py-3 border border-neutral-300 text-neutral-700 font-semibold rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSchedule}
            disabled={saving || !date || !time || selectedPlatforms.length === 0}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Planification...' : `📅 Planifier (${selectedPlatforms.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
