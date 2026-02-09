'use client';

import { useState } from 'react';

type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

const VOICE_OPTIONS: { value: TTSVoice; label: string; description: string }[] = [
  { value: 'nova', label: 'Femme dynamique', description: 'Voix féminine énergique et naturelle' },
  { value: 'shimmer', label: 'Femme douce', description: 'Voix féminine calme et posée' },
  { value: 'alloy', label: 'Mixte neutre', description: 'Voix neutre et professionnelle' },
  { value: 'echo', label: 'Homme posé', description: 'Voix masculine calme' },
  { value: 'onyx', label: 'Homme grave', description: 'Voix masculine profonde et autoritaire' },
  { value: 'fable', label: 'Conteur', description: 'Voix chaleureuse style narrateur' },
];

interface AudioEditorWidgetProps {
  initialScript?: string;
  initialAudioUrl?: string | null;
  caption?: string; // Context for AI suggestions
  onSave: (script: string, audioUrl: string) => void;
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
  const [selectedVoice, setSelectedVoice] = useState<TTSVoice>('nova');

  // Calculate word count and estimated duration
  const wordCount = script.trim().split(/\s+/).filter(w => w.length > 0).length;
  const estimatedDuration = Math.ceil(wordCount / 2.5);

  const handleGenerate = async () => {
    if (!script.trim()) {
      alert('❌ Veuillez entrer un texte à narrer');
      return;
    }

    setGenerating(true);
    console.log('[AudioEditor] Generating audio for:', script, 'voice:', selectedVoice);

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
      console.log('[AudioEditor] Response:', data);

      if (data.ok) {
        setAudioUrl(data.audioUrl);
        setScript(data.condensedText); // Update with condensed text if it was shortened
        console.log('[AudioEditor] ✅ Audio generated:', data.audioUrl);
      } else {
        alert(`❌ ${data.error || 'Erreur lors de la génération audio'}`);
      }
    } catch (error) {
      console.error('[AudioEditor] Error:', error);
      alert('❌ Erreur lors de la génération audio');
    } finally {
      setGenerating(false);
    }
  };

  const handleSuggest = async () => {
    if (!caption && !script) {
      alert('❌ Aucun contexte disponible pour les suggestions');
      return;
    }

    setLoadingSuggestions(true);
    console.log('[AudioEditor] Requesting AI suggestions...');

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
      console.log('[AudioEditor] Suggestions response:', data);

      if (data.ok) {
        setSuggestions(data.suggestions);
        setShowSuggestions(true);
        console.log('[AudioEditor] ✅ Got', data.suggestions.length, 'suggestions');
      } else {
        alert(`❌ ${data.error || 'Erreur lors de la génération de suggestions'}`);
      }
    } catch (error) {
      console.error('[AudioEditor] Error:', error);
      alert('❌ Erreur lors de la génération de suggestions');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleUseSuggestion = async (suggestion: Suggestion) => {
    console.log('[AudioEditor] Using suggestion:', suggestion.style);
    setScript(suggestion.text);
    setShowSuggestions(false);

    // Auto-generate audio with the new text
    console.log('[AudioEditor] Auto-generating audio with suggestion...');

    // Small delay to let UI update
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
          console.log('[AudioEditor] ✅ Audio auto-generated for suggestion');
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
      alert('❌ Veuillez d\'abord générer l\'audio');
      return;
    }
    console.log('[AudioEditor] Saving audio:', audioUrl);
    onSave(script, audioUrl);
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
            {loadingSuggestions ? '⏳ Chargement...' : '✨ Suggestions IA'}
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
              ⚠️ Trop long, l'IA va condenser
            </p>
          )}
        </div>
      </div>

      {/* Voice Selector */}
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          Voix
        </label>
        <div className="flex flex-wrap gap-1.5">
          {VOICE_OPTIONS.map((voice) => (
            <button
              key={voice.value}
              onClick={() => setSelectedVoice(voice.value)}
              className={`px-2 py-1 text-[10px] rounded border transition-all ${
                selectedVoice === voice.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-blue-700 border-blue-300 hover:border-blue-400'
              }`}
              title={voice.description}
            >
              {voice.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-neutral-700">
              💡 Suggestions IA
            </p>
            <button
              onClick={() => setShowSuggestions(false)}
              className="text-xs text-neutral-500 hover:text-neutral-700"
            >
              ✕
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
                → Utiliser et générer audio
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Audio Player */}
      {audioUrl && (
        <div className="bg-white rounded-lg p-2 border border-neutral-200">
          <p className="text-xs font-medium text-neutral-700 mb-1">
            🎵 Audio généré
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
            '🎙️ Générer audio'
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
          ✅ Ajouter l'audio à la vidéo
        </button>

        <button
          onClick={onCancel}
          className="px-3 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium"
        >
          ❌
        </button>
      </div>

      {/* Help text */}
      <p className="text-xs text-neutral-500 italic">
        💡 Astuce: Utilisez "Suggestions IA" pour des idées de scripts optimisés TikTok/Instagram
      </p>
    </div>
  );
}
