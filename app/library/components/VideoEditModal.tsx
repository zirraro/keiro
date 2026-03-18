'use client';

import { useState, useRef } from 'react';

type VideoEditModalProps = {
  video: {
    id: string;
    video_url: string;
    title?: string;
    subtitle_text?: string;
    audio_url?: string;
    ai_model?: string;
    duration?: number;
  };
  onClose: () => void;
  onSave: () => void;
};

const TEXT_STYLES = [
  { id: 'wordflash', label: 'Flash', desc: 'Un mot à la fois' },
  { id: 'cinema', label: 'Cinéma', desc: 'Bande sous-titre' },
  { id: 'impact', label: 'Impact', desc: 'Gras majuscules' },
  { id: 'minimal', label: 'Minimal', desc: 'Discret' },
  { id: 'neon', label: 'Néon', desc: 'Effet lumineux' },
  { id: 'wordstay', label: 'Karaoké', desc: 'Mot par mot' },
];

export default function VideoEditModal({ video, onClose, onSave }: VideoEditModalProps) {
  const [subtitleText, setSubtitleText] = useState(video.subtitle_text || '');
  const [textStyle, setTextStyle] = useState('cinema');
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const [textPosition, setTextPosition] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [title, setTitle] = useState(video.title || '');
  const [saving, setSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/library/save-video', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: video.id,
          title,
          subtitleText: subtitleText || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onSave();
        onClose();
      } else {
        alert('Erreur: ' + data.error);
      }
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-neutral-900">Éditer la vidéo</h2>
            {video.ai_model && (
              <span className={`w-2 h-2 rounded-full opacity-50 ${video.ai_model === 'kling' ? 'bg-emerald-500' : 'bg-orange-500'}`}
                title={video.ai_model === 'kling' ? 'Kling' : 'Seedream'} />
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video Preview */}
        <div className="p-4">
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video ref={videoRef} src={video.video_url} controls className="w-full h-full object-contain" />
            {subtitleText && (
              <div className={`absolute left-2 right-2 text-center pointer-events-none ${
                textPosition === 'top' ? 'top-4' : textPosition === 'center' ? 'inset-0 flex items-center justify-center' : 'bottom-4'
              }`}>
                <span className={`text-white ${
                  fontSize === 'sm' ? 'text-xs' : fontSize === 'md' ? 'text-sm' : fontSize === 'lg' ? 'text-base' : 'text-lg'
                } ${textStyle === 'cinema' ? 'bg-black/80 px-3 py-1' : textStyle === 'impact' ? 'font-black uppercase [text-shadow:_2px_2px_0_rgb(0_0_0)]' : textStyle === 'neon' ? 'text-fuchsia-400 [text-shadow:_0_0_10px_rgb(192_38_211)]' : 'font-medium [text-shadow:_0_0_10px_rgb(0_0_0)]'}`}>
                  {subtitleText.length > 60 ? subtitleText.substring(0, 60) + '...' : subtitleText}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Edit Controls */}
        <div className="px-4 pb-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Titre</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Titre de la vidéo"
            />
          </div>

          {/* Subtitle Text */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Texte / Sous-titres</label>
            <textarea
              value={subtitleText}
              onChange={e => setSubtitleText(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              placeholder="Texte à afficher sur la vidéo..."
            />
          </div>

          {/* Text Style */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Style de texte</label>
            <div className="grid grid-cols-3 gap-1.5">
              {TEXT_STYLES.map(style => (
                <button
                  key={style.id}
                  onClick={() => setTextStyle(style.id)}
                  className={`p-2 rounded-lg text-xs text-center border transition-all ${
                    textStyle === style.id
                      ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                      : 'border-neutral-200 hover:border-purple-300 text-neutral-600'
                  }`}
                >
                  <div className="font-medium">{style.label}</div>
                  <div className="text-[10px] text-neutral-400">{style.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Font Size & Position */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Taille</label>
              <div className="flex gap-1">
                {(['sm', 'md', 'lg', 'xl'] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={`flex-1 py-1.5 text-xs rounded border ${
                      fontSize === size ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold' : 'border-neutral-200 text-neutral-500'
                    }`}
                  >
                    {size.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Position</label>
              <div className="flex gap-1">
                {([['top', 'Haut'], ['center', 'Centre'], ['bottom', 'Bas']] as const).map(([pos, label]) => (
                  <button
                    key={pos}
                    onClick={() => setTextPosition(pos)}
                    className={`flex-1 py-1.5 text-xs rounded border ${
                      textPosition === pos ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold' : 'border-neutral-200 text-neutral-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm border border-neutral-300 rounded-xl hover:bg-neutral-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#0c1a3a] to-[#1e3a5f] text-white rounded-xl hover:from-[#1e3a5f] hover:to-[#2a4a6f] disabled:opacity-50 transition-all font-medium"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
