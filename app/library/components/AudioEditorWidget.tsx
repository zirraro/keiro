'use client';

import { useState } from 'react';

// ElevenLabs voices (multilingual, work well in French)
const VOICE_OPTIONS: { value: string; label: string; description: string; gender: 'female' | 'male' }[] = [
  { value: 'JBFqnCBsd6RMkjVDRZzb', label: 'Homme narrateur', description: 'Voix masculine britannique, posée et professionnelle', gender: 'male' },
  { value: '21m00Tcm4TlvDq8ikWAM', label: 'Femme douce', description: 'Voix féminine calme et chaleureuse', gender: 'female' },
  { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Femme naturelle', description: 'Voix féminine douce et authentique', gender: 'female' },
  { value: 'ErXwobaYiN019PkySvjV', label: 'Homme dynamique', description: 'Voix masculine énergique et engageante', gender: 'male' },
  { value: 'TxGEqnHWrfWFTfGW9XjX', label: 'Homme profond', description: 'Voix masculine grave et confiante', gender: 'male' },
  { value: 'pNInz6obpgDQGcFmaJgB', label: 'Homme autoritaire', description: 'Voix masculine profonde et imposante', gender: 'male' },
  { value: 'AZnzlk1XvdvUeBnXmlld', label: 'Femme énergique', description: 'Voix féminine forte et dynamique', gender: 'female' },
  { value: 'MF3mGyEYCl7XYWbV9V6O', label: 'Femme pro', description: 'Voix féminine claire et professionnelle', gender: 'female' },
];

const MUSIC_OPTIONS: { value: string; label: string; emoji: string }[] = [
  { value: 'none', label: 'Aucune', emoji: '🔇' },
  { value: 'corporate', label: 'Corporate', emoji: '💼' },
  { value: 'energetic', label: 'Énergique', emoji: '⚡' },
  { value: 'calm', label: 'Calme', emoji: '🌊' },
  { value: 'inspiring', label: 'Inspirant', emoji: '✨' },
  { value: 'trendy', label: 'Tendance', emoji: '🔥' },
];

interface AudioEditorWidgetProps {
  initialScript?: string;
  initialAudioUrl?: string | null;
  caption?: string;
  onSave: (script: string, audioUrl: string, musicStyle?: string) => void;
  onCancel: () => void;
}

type Suggestion = {
  style: string;
  label: string;
  text: string;
};

export default function AudioEditorWidget({
  initialScript = '',
  initialAudioUrl = null,
  caption = '',
  onSave,
  onCancel,
}: AudioEditorWidgetProps) {
  const [script, setScript] = useState(initialScript);
  const [audioUrl, setAudioUrl] = useState<string | null>(initialAudioUrl);
  const [generating, setGenerating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0].value);
  const [selectedMusic, setSelectedMusic] = useState('none');

  const wordCount = script.trim().split(/\s+/).filter(w => w.length > 0).length;
  const estimatedDuration = Math.ceil(wordCount / 2.5);

  const handleGenerate = async () => {
    if (!script.trim()) {
      alert('Veuillez entrer un texte à narrer');
      return;
    }

    setGenerating(true);

    try {
      const response = await fetch('/api/generate-audio-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: script,
          targetDuration: 5,
          voice: selectedVoice,
          speed: 1.0,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setAudioUrl(data.audioUrl);
        setScript(data.condensedText);
      } else {
        alert(data.error || 'Erreur lors de la génération audio');
      }
    } catch (error) {
      console.error('[AudioEditor] Error:', error);
      alert('Erreur lors de la génération audio');
    } finally {
      setGenerating(false);
    }
  };

  const handleSuggest = async () => {
    if (!caption && !script) {
      alert('Aucun contexte disponible pour les suggestions');
      return;
    }

    setLoadingSuggestions(true);

    try {
      const response = await fetch('/api/suggest-narration-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: caption || script,
          targetWords: 15,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setSuggestions(data.suggestions);
        setShowSuggestions(true);
      } else {
        alert(data.error || 'Erreur lors de la génération de suggestions');
      }
    } catch (error) {
      console.error('[AudioEditor] Error:', error);
      alert('Erreur lors de la génération de suggestions');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleUseSuggestion = async (suggestion: Suggestion) => {
    setScript(suggestion.text);
    setShowSuggestions(false);

    setTimeout(async () => {
      setGenerating(true);
      try {
        const response = await fetch('/api/generate-audio-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: suggestion.text,
            targetDuration: 5,
            voice: selectedVoice,
            speed: 1.0,
          }),
        });

        const data = await response.json();
        if (data.ok) {
          setAudioUrl(data.audioUrl);
          setScript(data.condensedText);
        }
      } catch (error) {
        console.error('[AudioEditor] Auto-generation error:', error);
      } finally {
        setGenerating(false);
      }
    }, 100);
  };

  const handleSaveClick = () => {
    if (!audioUrl) {
      alert('Veuillez d\'abord générer l\'audio');
      return;
    }
    onSave(script, audioUrl, selectedMusic !== 'none' ? selectedMusic : undefined);
  };

  return (
    <div className="space-y-3">
      {/* Script Editor */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-neutral-700">
            Script de narration
          </label>
          <button
            onClick={handleSuggest}
            disabled={loadingSuggestions}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:text-neutral-400"
          >
            {loadingSuggestions ? 'Chargement...' : 'Suggestions'}
          </button>
        </div>

        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={3}
          placeholder="Entrez le texte à narrer (ex: Découvrez les 3 tendances marketing de 2026...)
Max ~15 mots pour 5 secondes"
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
        />

        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-neutral-500">
            ~{wordCount} mots ({estimatedDuration}s)
          </p>
          {wordCount > 20 && (
            <p className="text-xs text-orange-600">
              Trop long, le texte sera condensé
            </p>
          )}
        </div>
      </div>

      {/* Voice Selector */}
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1.5">
          Voix
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {VOICE_OPTIONS.map((voice) => (
            <button
              key={voice.value}
              onClick={() => setSelectedVoice(voice.value)}
              className={`px-2 py-1.5 text-[10px] rounded border transition-all text-left ${
                selectedVoice === voice.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-blue-300'
              }`}
              title={voice.description}
            >
              <span className="font-medium">{voice.gender === 'female' ? '♀' : '♂'} {voice.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Background Music */}
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1.5">
          Musique de fond
        </label>
        <div className="flex flex-wrap gap-1.5">
          {MUSIC_OPTIONS.map((music) => (
            <button
              key={music.value}
              onClick={() => setSelectedMusic(music.value)}
              className={`px-2.5 py-1 text-[10px] rounded-full border transition-all ${
                selectedMusic === music.value
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-purple-300'
              }`}
            >
              {music.emoji} {music.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-neutral-700">
              Suggestions
            </p>
            <button
              onClick={() => setShowSuggestions(false)}
              className="text-xs text-neutral-500 hover:text-neutral-700"
            >
              x
            </button>
          </div>

          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className="bg-white rounded-lg p-2 space-y-1"
            >
              <p className="text-xs font-medium text-blue-600">
                {suggestion.label}
              </p>
              <p className="text-xs text-neutral-700">
                "{suggestion.text}"
              </p>
              <button
                onClick={() => handleUseSuggestion(suggestion)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Utiliser et générer audio
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Audio Player */}
      {audioUrl && (
        <div className="bg-white rounded-lg p-2 border border-neutral-200">
          <p className="text-xs font-medium text-neutral-700 mb-1">
            Audio généré
          </p>
          <audio
            src={audioUrl}
            controls
            className="w-full"
            style={{ height: '40px' }}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={generating || !script.trim()}
          className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
            generating
              ? 'bg-blue-300 text-white cursor-not-allowed'
              : script.trim()
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
          }`}
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Génération...
            </span>
          ) : (
            'Générer audio'
          )}
        </button>

        <button
          onClick={handleSaveClick}
          disabled={!audioUrl}
          className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
            audioUrl
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
          }`}
        >
          Ajouter à la vidéo
        </button>

        <button
          onClick={onCancel}
          className="px-3 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium"
        >
          x
        </button>
      </div>

      <p className="text-xs text-neutral-500 italic">
        Astuce: Utilisez "Suggestions" pour des scripts optimisés
      </p>
    </div>
  );
}
