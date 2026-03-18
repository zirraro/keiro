'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';

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
  const { t } = useLanguage();

  // ElevenLabs voices (multilingual, work well in French)
  const VOICE_OPTIONS: { value: string; label: string; description: string; gender: 'female' | 'male' }[] = [
    { value: 'JBFqnCBsd6RMkjVDRZzb', label: t.library.aewVoiceMaleNarrator, description: t.library.aewVoiceMaleNarratorDesc, gender: 'male' },
    { value: '21m00Tcm4TlvDq8ikWAM', label: t.library.aewVoiceFemaleSoft, description: t.library.aewVoiceFemaleSoftDesc, gender: 'female' },
    { value: 'EXAVITQu4vr4xnSDxMaL', label: t.library.aewVoiceFemaleNatural, description: t.library.aewVoiceFemaleNaturalDesc, gender: 'female' },
    { value: 'ErXwobaYiN019PkySvjV', label: t.library.aewVoiceMaleDynamic, description: t.library.aewVoiceMaleDynamicDesc, gender: 'male' },
    { value: 'TxGEqnHWrfWFTfGW9XjX', label: t.library.aewVoiceMaleDeep, description: t.library.aewVoiceMaleDeepDesc, gender: 'male' },
    { value: 'pNInz6obpgDQGcFmaJgB', label: t.library.aewVoiceMaleAuthority, description: t.library.aewVoiceMaleAuthorityDesc, gender: 'male' },
    { value: 'AZnzlk1XvdvUeBnXmlld', label: t.library.aewVoiceFemaleEnergetic, description: t.library.aewVoiceFemaleEnergeticDesc, gender: 'female' },
    { value: 'MF3mGyEYCl7XYWbV9V6O', label: t.library.aewVoiceFemalePro, description: t.library.aewVoiceFemaleProDesc, gender: 'female' },
  ];

  const MUSIC_OPTIONS: { value: string; label: string; emoji: string }[] = [
    { value: 'none', label: t.library.aewMusicNone, emoji: '🔇' },
    { value: 'corporate', label: t.library.aewMusicCorporate, emoji: '💼' },
    { value: 'energetic', label: t.library.aewMusicEnergetic, emoji: '⚡' },
    { value: 'calm', label: t.library.aewMusicCalm, emoji: '🌊' },
    { value: 'inspiring', label: t.library.aewMusicInspiring, emoji: '✨' },
    { value: 'trendy', label: t.library.aewMusicTrendy, emoji: '🔥' },
  ];

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
      alert(t.library.aewAlertEnterText);
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
        alert(data.error || t.library.aewAlertAudioError);
      }
    } catch (error) {
      console.error('[AudioEditor] Error:', error);
      alert(t.library.aewAlertAudioError);
    } finally {
      setGenerating(false);
    }
  };

  const handleSuggest = async () => {
    if (!caption && !script) {
      alert(t.library.aewAlertNoContext);
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
        alert(data.error || t.library.aewAlertSuggestionError);
      }
    } catch (error) {
      console.error('[AudioEditor] Error:', error);
      alert(t.library.aewAlertSuggestionError);
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
      alert(t.library.aewAlertGenerateFirst);
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
            {t.library.aewScriptLabel}
          </label>
          <button
            onClick={handleSuggest}
            disabled={loadingSuggestions}
            className="text-xs text-[#0c1a3a] hover:text-[#1e3a5f] font-medium disabled:text-neutral-400"
          >
            {loadingSuggestions ? t.library.aewLoading : t.library.aewSuggestions}
          </button>
        </div>

        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={3}
          placeholder={t.library.aewScriptPlaceholder}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0c1a3a] text-sm resize-none"
        />

        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-neutral-500">
            ~{wordCount} {t.library.aewWordCount} ({estimatedDuration}s)
          </p>
          {wordCount > 20 && (
            <p className="text-xs text-orange-600">
              {t.library.aewTooLong}
            </p>
          )}
        </div>
      </div>

      {/* Voice Selector */}
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1.5">
          {t.library.aewVoiceLabel}
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {VOICE_OPTIONS.map((voice) => (
            <button
              key={voice.value}
              onClick={() => setSelectedVoice(voice.value)}
              className={`px-2 py-1.5 text-[10px] rounded border transition-all text-left ${
                selectedVoice === voice.value
                  ? 'bg-[#0c1a3a] text-white border-[#0c1a3a]'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-[#0c1a3a]/20'
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
          {t.library.aewMusicLabel}
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
        <div className="border border-[#0c1a3a]/10 bg-[#0c1a3a]/5 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-neutral-700">
              {t.library.aewSuggestions}
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
              <p className="text-xs font-medium text-[#0c1a3a]">
                {suggestion.label}
              </p>
              <p className="text-xs text-neutral-700">
                "{suggestion.text}"
              </p>
              <button
                onClick={() => handleUseSuggestion(suggestion)}
                className="text-xs text-[#0c1a3a] hover:text-[#1e3a5f] font-medium"
              >
                {t.library.aewUseSuggestion}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Audio Player */}
      {audioUrl && (
        <div className="bg-white rounded-lg p-2 border border-neutral-200">
          <p className="text-xs font-medium text-neutral-700 mb-1">
            {t.library.aewAudioGenerated}
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
              ? 'bg-[#0c1a3a]/30 text-white cursor-not-allowed'
              : script.trim()
              ? 'bg-[#0c1a3a] text-white hover:bg-[#1e3a5f]'
              : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
          }`}
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              {t.library.aewGenerating}
            </span>
          ) : (
            t.library.aewGenerateAudio
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
          {t.library.aewAddToVideo}
        </button>

        <button
          onClick={onCancel}
          className="px-3 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium"
        >
          x
        </button>
      </div>

      <p className="text-xs text-neutral-500 italic">
        {t.library.aewTip}
      </p>
    </div>
  );
}
