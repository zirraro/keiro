# Plan d'implémentation - Génération Audio & Son pour TikTok/Instagram

**Date**: 2026-02-03
**Objectif**: Ajouter la génération audio automatique pour images et vidéos afin de respecter les exigences TikTok

---

## Vue d'ensemble

### Problème
TikTok exige que les vidéos aient du son. Actuellement:
- ❌ Les vidéos générées n'ont pas d'audio
- ❌ Les images converties en vidéo n'ont pas d'audio
- ❌ Pas de solution pour ajouter du son avant publication

### Solution proposée
1. **Sur /generate**: Proposer génération avec son AVANT sauvegarde
2. **Dans modals TikTok/Instagram**: Permettre modification/ajout de son
3. **CloudConvert**: Ajouter son de base (très bas) si aucun son disponible
4. **APIs disponibles**: Claude, ChatGPT, ElevenLabs, OpenAI TTS

---

## PHASE 1: PAGE /GENERATE - SETUP AUDIO AVANT GÉNÉRATION

### Objectif
Permettre à l'utilisateur de choisir s'il veut du son AVANT de générer le contenu.

### UI/UX Flow

#### Étape 1: Après génération de l'image
```
┌─────────────────────────────────────────────────┐
│ ✅ Image générée avec succès!                   │
│                                                  │
│ [Preview de l'image]                             │
│                                                  │
│ 🎵 Voulez-vous ajouter du son à votre contenu?  │
│                                                  │
│ ○ Non, juste l'image                            │
│ ● Oui, générer une vidéo avec narration audio   │
│ ○ Oui, générer image + fichier audio séparé     │
│                                                  │
│ [Continuer sans son] [Générer avec son 🎙️]     │
└─────────────────────────────────────────────────┘
```

#### Étape 2: Configuration de la narration
```
┌─────────────────────────────────────────────────┐
│ 🎙️ Configuration de la narration audio          │
│                                                  │
│ Source du texte:                                 │
│ ● Utiliser le titre de l'actualité              │
│ ○ Personnaliser le texte                        │
│                                                  │
│ Texte à narrer:                                  │
│ ┌───────────────────────────────────────────┐   │
│ │ [Texte généré automatiquement ou custom]  │   │
│ │ (Max 150 mots pour ~5 secondes)           │   │
│ └───────────────────────────────────────────┘   │
│                                                  │
│ Voix TTS:                                        │
│ ○ Voix féminine (ElevenLabs)                    │
│ ● Voix masculine (OpenAI TTS)                   │
│ ○ Voix neutre (Claude/ChatGPT)                  │
│                                                  │
│ [Annuler] [Générer audio 🎵]                     │
└─────────────────────────────────────────────────┘
```

#### Étape 3: Prévisualisation avec audio
```
┌─────────────────────────────────────────────────┐
│ ✅ Contenu avec audio généré!                    │
│                                                  │
│ [Preview vidéo avec audio player]               │
│ ▶️ [========>--------] 00:03 / 00:05            │
│                                                  │
│ Actions:                                         │
│ [🔄 Régénérer audio] [📝 Modifier texte]         │
│ [💾 Sauvegarder] [❌ Recommencer]                │
└─────────────────────────────────────────────────┘
```

### Implémentation technique

#### Fichier: `app/generate/page.tsx`

**Nouveaux états**:
```typescript
const [showAudioSetup, setShowAudioSetup] = useState(false);
const [audioChoice, setAudioChoice] = useState<'none' | 'video' | 'separate'>('none');
const [audioText, setAudioText] = useState('');
const [audioVoice, setAudioVoice] = useState<'elevenlabs' | 'openai' | 'claude'>('openai');
const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
const [generatingAudio, setGeneratingAudio] = useState(false);
```

**Nouveau composant**: `AudioSetupModal.tsx`
```typescript
interface AudioSetupModalProps {
  newsTitle: string;
  newsContent: string;
  imageUrl: string;
  onCancel: () => void;
  onComplete: (audioUrl: string, audioText: string) => void;
}

export default function AudioSetupModal({ ... }: AudioSetupModalProps) {
  // 1. Afficher choix (vidéo avec son / image + audio)
  // 2. Permettre édition du texte
  // 3. Choisir voix TTS
  // 4. Générer audio via API
  // 5. Prévisualiser résultat
  // 6. Retourner audioUrl au parent
}
```

**Nouvel endpoint**: `/api/generate-audio-tts/route.ts`
```typescript
/**
 * POST /api/generate-audio-tts
 * Generate audio narration from text using TTS services
 *
 * Body:
 * - text: string (max 500 words)
 * - voice: 'elevenlabs' | 'openai' | 'claude'
 * - duration?: number (target duration in seconds, default 5)
 *
 * Returns:
 * - audioUrl: URL of generated MP3 audio file
 * - condensedText: Text condensed to fit duration
 * - actualDuration: Duration of generated audio
 *
 * Priority:
 * 1. OpenAI TTS (fast, cheap, good quality)
 * 2. ElevenLabs (best quality but quota limited)
 * 3. Claude + ChatGPT fallback (text-to-speech simulation)
 */
export async function POST(req: NextRequest) {
  const { text, voice, duration = 5 } = await req.json();

  // 1. Condense text to target duration (~2.5 words/second)
  const targetWords = Math.floor(duration * 2.5);
  const condensedText = await condenseText(text, targetWords);

  // 2. Generate audio based on voice choice
  let audioUrl: string;

  if (voice === 'openai') {
    audioUrl = await generateWithOpenAI(condensedText);
  } else if (voice === 'elevenlabs') {
    audioUrl = await generateWithElevenLabs(condensedText);
  } else {
    audioUrl = await generateWithFallback(condensedText);
  }

  // 3. Upload to Supabase Storage
  const storagePath = `audio-narrations/${Date.now()}.mp3`;
  // ... upload logic

  return NextResponse.json({
    ok: true,
    audioUrl: publicUrl,
    condensedText,
    actualDuration: duration
  });
}
```

#### Helpers

**`lib/audio/openai-tts.ts`**:
```typescript
export async function generateWithOpenAI(text: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy", // or "echo", "fable", "onyx", "nova", "shimmer"
    input: text,
    speed: 1.0
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  return uploadAudioBuffer(buffer);
}
```

**`lib/audio/elevenlabs-tts.ts`**:
```typescript
export async function generateWithElevenLabs(text: string): Promise<string> {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel voice

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    }
  );

  const buffer = Buffer.from(await response.arrayBuffer());
  return uploadAudioBuffer(buffer);
}
```

**`lib/audio/condense-text.ts`**:
```typescript
export async function condenseText(text: string, targetWords: number): Promise<string> {
  // Si déjà sous la limite, retourner tel quel
  const words = text.split(/\s+/);
  if (words.length <= targetWords) return text;

  // Utiliser Claude pour condenser intelligemment
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `Condense ce texte en EXACTEMENT ${targetWords} mots maximum pour une narration audio de 5 secondes. Garde l'essentiel, style journalistique percutant:\n\n${text}`
    }]
  });

  return message.content[0].text.trim();
}
```

---

## PHASE 2: MODALS TIKTOK/INSTAGRAM - MODIFICATION AUDIO

### Objectif
Permettre d'ajouter/modifier l'audio dans les modals de publication.

### UI/UX Flow

#### Dans TikTokModal - Nouvelle section audio
```
┌─────────────────────────────────────────────────┐
│ 🎵 Audio & Narration (Requis pour TikTok)       │
│                                                  │
│ État actuel:                                     │
│ ● Aucun audio (⚠️ TikTok peut rejeter)          │
│ ○ Audio original (de la vidéo)                  │
│ ○ Audio TTS généré ✅                            │
│                                                  │
│ [+ Générer narration audio]                     │
│                                                  │
│ Si audio généré:                                 │
│ ┌───────────────────────────────────────────┐   │
│ │ 📝 Script: "Les 3 tendances marketing..."  │   │
│ │ ▶️ [========>----] 00:03 / 00:05           │   │
│ │ [✏️ Modifier] [🔄 Régénérer] [🗑️ Suppr]    │   │
│ └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

#### Workflow modification audio
1. **Clic sur "Générer narration audio"** → Ouvre popup
2. **Génération IA du texte** (si pas de description)
3. **Édition du script** (textarea)
4. **Génération TTS** → Audio player
5. **Validation** → Retour au modal avec audio attaché

### Implémentation technique

#### Fichier: `app/library/components/TikTokModal.tsx`

**Nouveaux états**:
```typescript
const [audioUrl, setAudioUrl] = useState<string | null>(null);
const [audioScript, setAudioScript] = useState('');
const [showAudioEditor, setShowAudioEditor] = useState(false);
const [generatingAudio, setGeneratingAudio] = useState(false);
```

**Nouvelle section UI** (après la description):
```tsx
{/* Audio & Narration Section */}
<div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
  <div className="flex items-center justify-between mb-2">
    <label className="block text-sm font-semibold text-neutral-900">
      🎵 Audio & Narration
    </label>
    {!audioUrl && (
      <span className="text-xs text-orange-600 font-medium">
        ⚠️ TikTok exige du son
      </span>
    )}
    {audioUrl && (
      <span className="text-xs text-green-600 font-medium">
        ✅ Audio prêt
      </span>
    )}
  </div>

  <p className="text-xs text-neutral-600 mb-3">
    Ajoutez une narration audio pour augmenter l'engagement TikTok (recommandé)
  </p>

  {!showAudioEditor ? (
    <button
      onClick={() => setShowAudioEditor(true)}
      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
    >
      {audioUrl ? '✏️ Modifier l\'audio' : '+ Générer narration audio'}
    </button>
  ) : (
    <AudioEditorWidget
      initialScript={audioScript}
      initialAudioUrl={audioUrl}
      onSave={(script, url) => {
        setAudioScript(script);
        setAudioUrl(url);
        setShowAudioEditor(false);
      }}
      onCancel={() => setShowAudioEditor(false)}
    />
  )}
</div>
```

**Nouveau composant**: `AudioEditorWidget.tsx`
```typescript
interface AudioEditorWidgetProps {
  initialScript?: string;
  initialAudioUrl?: string | null;
  onSave: (script: string, audioUrl: string) => void;
  onCancel: () => void;
}

export default function AudioEditorWidget({ ... }: AudioEditorWidgetProps) {
  const [script, setScript] = useState(initialScript || '');
  const [audioUrl, setAudioUrl] = useState(initialAudioUrl);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/generate-audio-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: script,
          voice: 'openai',
          duration: 5
        })
      });

      const data = await response.json();
      if (data.ok) {
        setAudioUrl(data.audioUrl);
        setScript(data.condensedText);
      }
    } catch (error) {
      alert('Erreur lors de la génération audio');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Script Editor */}
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          Script de narration
        </label>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={3}
          placeholder="Texte à narrer (max ~15 mots pour 5 secondes)..."
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <p className="text-xs text-neutral-500 mt-1">
          ~{script.split(' ').length} mots ({Math.ceil(script.split(' ').length / 2.5)}s)
        </p>
      </div>

      {/* Audio Player */}
      {audioUrl && (
        <div className="bg-white rounded-lg p-2">
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
          disabled={generating || !script}
          className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
        >
          {generating ? '⏳ Génération...' : '🎙️ Générer audio'}
        </button>
        <button
          onClick={() => onSave(script, audioUrl!)}
          disabled={!audioUrl}
          className="px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-neutral-300"
        >
          ✅ Valider
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 bg-neutral-200 text-neutral-700 text-sm rounded-lg hover:bg-neutral-300"
        >
          ❌
        </button>
      </div>
    </div>
  );
}
```

---

## PHASE 3: CLOUDCONVERT - SON DE BASE SI AUCUN AUDIO

### Objectif
Si l'utilisateur n'a pas généré d'audio, ajouter un son très bas (ambiance) pour éviter le rejet TikTok.

### Options

#### Option A: Son de synthèse (sine wave très bas)
CloudConvert peut générer un son de base avec FFmpeg:
```bash
-f lavfi -i "sine=frequency=100:duration=5" -af "volume=0.01"
```

#### Option B: Fichier audio silence pré-uploadé
Créer un fichier MP3 de silence (ou ambiance très basse) et le merger:
```typescript
const SILENT_AUDIO_URL = 'https://keiro.com/assets/silent-audio-5s.mp3';

tasks['import-silent-audio'] = {
  operation: 'import/url',
  url: SILENT_AUDIO_URL,
  filename: 'silent.mp3'
};

tasks['merge-audio'] = {
  operation: 'merge',
  input: ['convert-video', 'import-silent-audio'],
  output_format: 'mp4'
};
```

### Implémentation recommandée

**Fichier**: `app/api/convert-video-tiktok/route.ts`

**Modification**:
```typescript
async function convertViaCloudConvert(
  videoUrl: string,
  apiKey: string,
  videoId?: string,
  audioUrl?: string,  // ← Audio TTS généré (optionnel)
  userId?: string
) {
  console.log('[CloudConvert] Converting video for TikTok...');
  console.log('[CloudConvert] Custom audio:', audioUrl || 'none (will add low ambient sound)');

  const tasks: any = {
    'import-video': {
      operation: 'import/url',
      url: videoUrl,
      filename: 'input.mp4'
    },
    'convert-video': {
      operation: 'convert',
      input: 'import-video',
      output_format: 'mp4',
      video_codec: 'h264',
      audio_codec: 'aac',
      width: 1080,
      height: 1920,
      fit: 'max'
    }
  };

  // Si audio custom fourni, l'importer et merger
  if (audioUrl) {
    tasks['import-audio'] = {
      operation: 'import/url',
      url: audioUrl,
      filename: 'narration.mp3'
    };

    tasks['merge-audio'] = {
      operation: 'command',
      input: ['convert-video', 'import-audio'],
      command: 'ffmpeg',
      arguments: '-i convert-video -i import-audio -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest output.mp4'
    };

    tasks['export-video'] = {
      operation: 'export/url',
      input: 'merge-audio'
    };
  } else {
    // Pas d'audio custom → Ajouter son de base très bas (pour éviter rejet TikTok)
    tasks['add-ambient-sound'] = {
      operation: 'command',
      input: 'convert-video',
      command: 'ffmpeg',
      arguments: '-i convert-video -f lavfi -i "sine=frequency=100:duration=5" -filter_complex "[1:a]volume=0.005[a1];[0:a][a1]amerge=inputs=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac output.mp4'
    };

    tasks['export-video'] = {
      operation: 'export/url',
      input: 'add-ambient-sound'
    };
  }

  // ... reste du code (polling, upload Supabase, etc.)
}
```

**Note**: La commande FFmpeg ajoute un son sinusoïdal à 100Hz avec volume 0.005 (quasi inaudible) pour satisfaire l'exigence TikTok d'avoir du son.

---

## PHASE 4: SUGGESTION IA DE TEXTE + MODIFICATION AUDIO

### Objectif
Permettre de générer des suggestions IA de texte, puis de régénérer l'audio avec le nouveau texte.

### UI/UX Flow

#### Dans AudioEditorWidget
```
┌─────────────────────────────────────────────────┐
│ 📝 Script de narration                          │
│ ┌───────────────────────────────────────────┐   │
│ │ [Texte actuel]                             │   │
│ └───────────────────────────────────────────┘   │
│                                                  │
│ [✨ Suggestions IA] [🎙️ Générer audio]          │
│                                                  │
│ Si clic "Suggestions IA":                        │
│ ┌───────────────────────────────────────────┐   │
│ │ Proposition 1 (Style informatif):          │   │
│ │ "Les 3 tendances marketing de 2026..."     │   │
│ │ [Utiliser cette suggestion]                │   │
│ ├────────────────────────────────────────────┤  │
│ │ Proposition 2 (Style accrocheur):          │   │
│ │ "Découvrez comment le marketing change..." │   │
│ │ [Utiliser cette suggestion]                │   │
│ └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Implémentation technique

**Fichier**: `AudioEditorWidget.tsx`

**Nouveaux états**:
```typescript
const [showSuggestions, setShowSuggestions] = useState(false);
const [suggestions, setSuggestions] = useState<string[]>([]);
const [loadingSuggestions, setLoadingSuggestions] = useState(false);
```

**Nouvelle fonction**:
```typescript
const handleSuggestText = async () => {
  setLoadingSuggestions(true);
  try {
    const response = await fetch('/api/suggest-narration-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentText: script,
        context: caption, // Description TikTok/Instagram
        targetWords: 15 // ~5 secondes
      })
    });

    const data = await response.json();
    if (data.ok) {
      setSuggestions(data.suggestions); // Array of 3 suggestions
      setShowSuggestions(true);
    }
  } catch (error) {
    alert('Erreur lors de la génération de suggestions');
  } finally {
    setLoadingSuggestions(false);
  }
};

const handleUseSuggestion = async (suggestion: string) => {
  setScript(suggestion);
  setShowSuggestions(false);
  // Auto-générer l'audio avec le nouveau texte
  await handleGenerate();
};
```

**Nouvel endpoint**: `/api/suggest-narration-text/route.ts`
```typescript
/**
 * POST /api/suggest-narration-text
 * Generate 3 text suggestions for audio narration using Claude
 *
 * Body:
 * - currentText?: string (existing text)
 * - context: string (caption or description)
 * - targetWords: number (default 15 for 5 seconds)
 *
 * Returns:
 * - suggestions: string[] (3 variations)
 */
export async function POST(req: NextRequest) {
  const { currentText, context, targetWords = 15 } = await req.json();

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Tu es un expert en narration audio pour TikTok/Instagram Reels.

Contexte: ${context}

Génère 3 scripts de narration audio (EXACTEMENT ${targetWords} mots chacun) avec ces styles:
1. Style informatif (journalistique)
2. Style accrocheur (viral TikTok)
3. Style storytelling (captivant)

Format JSON:
{
  "suggestions": ["script 1", "script 2", "script 3"]
}`;

  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }]
  });

  const text = message.content[0].text;
  const json = JSON.parse(text);

  return NextResponse.json({
    ok: true,
    suggestions: json.suggestions
  });
}
```

---

## ORDRE D'IMPLÉMENTATION

### Étape 1: Infrastructure audio (API endpoints)
1. ✅ Créer `/api/generate-audio-tts/route.ts`
2. ✅ Créer helpers `lib/audio/openai-tts.ts`
3. ✅ Créer helpers `lib/audio/elevenlabs-tts.ts`
4. ✅ Créer helpers `lib/audio/condense-text.ts`
5. ⏱️ **Temps**: 3-4h

### Étape 2: Page /generate - Setup audio
6. ✅ Créer composant `AudioSetupModal.tsx`
7. ✅ Intégrer dans `app/generate/page.tsx`
8. ✅ Tester génération audio avant sauvegarde
9. ⏱️ **Temps**: 4-5h

### Étape 3: Modals TikTok/Instagram - Audio editor
10. ✅ Créer composant `AudioEditorWidget.tsx`
11. ✅ Intégrer dans `TikTokModal.tsx`
12. ✅ Intégrer dans `InstagramModal.tsx`
13. ✅ Tester modification audio
14. ⏱️ **Temps**: 3-4h

### Étape 4: CloudConvert - Son de base
15. ✅ Modifier `/api/convert-video-tiktok/route.ts` pour merger audio
16. ✅ Ajouter son ambiance bas si pas d'audio custom
17. ✅ Tester conversion avec/sans audio
18. ⏱️ **Temps**: 2-3h

### Étape 5: Suggestions IA de texte
19. ✅ Créer `/api/suggest-narration-text/route.ts`
20. ✅ Ajouter UI suggestions dans `AudioEditorWidget.tsx`
21. ✅ Tester workflow complet
22. ⏱️ **Temps**: 2-3h

### Étape 6: Tests & Polish
23. ✅ Tests end-to-end tous les flux
24. ✅ Vérifications responsive mobile
25. ✅ Fix bugs + amélioration UX
26. ⏱️ **Temps**: 2-3h

**TEMPS TOTAL ESTIMÉ**: 16-22 heures

---

## VARIABLES D'ENVIRONNEMENT REQUISES

```env
# Déjà présentes
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
CLOUDCONVERT_API_KEY=xxx

# À ajouter (optionnel)
ELEVENLABS_API_KEY=xxx  # Pour voix haute qualité (optionnel, quota limité)
```

---

## FICHIERS CRITIQUES

### Nouveaux fichiers
1. `lib/audio/openai-tts.ts` - Génération TTS OpenAI
2. `lib/audio/elevenlabs-tts.ts` - Génération TTS ElevenLabs
3. `lib/audio/condense-text.ts` - Condensation intelligente de texte
4. `app/api/generate-audio-tts/route.ts` - Endpoint génération audio
5. `app/api/suggest-narration-text/route.ts` - Endpoint suggestions IA
6. `app/generate/components/AudioSetupModal.tsx` - Modal setup audio
7. `app/library/components/AudioEditorWidget.tsx` - Widget édition audio

### Fichiers à modifier
1. `app/generate/page.tsx` - Intégration setup audio
2. `app/library/components/TikTokModal.tsx` - Ajout section audio
3. `app/library/components/InstagramModal.tsx` - Ajout section audio
4. `app/api/convert-video-tiktok/route.ts` - Merge audio + son de base
5. `app/api/convert-video-instagram/route.ts` - Merge audio + son de base

---

## VÉRIFICATION END-TO-END

### Scénario 1: Génération avec audio sur /generate
1. ✅ Générer une image actualité
2. ✅ Choisir "Oui, générer vidéo avec narration audio"
3. ✅ Personnaliser le texte
4. ✅ Générer audio → Écouter preview
5. ✅ Sauvegarder → Vidéo + audio dans galerie

### Scénario 2: Ajouter audio dans TikTokModal
1. ✅ Ouvrir TikTokModal sur une vidéo sans audio
2. ✅ Clic "Générer narration audio"
3. ✅ Utiliser suggestion IA (style viral)
4. ✅ Audio généré automatiquement
5. ✅ Publier → Vidéo convertie avec audio TTS

### Scénario 3: CloudConvert avec son de base
1. ✅ Convertir vidéo SANS audio custom
2. ✅ CloudConvert ajoute son ambiance bas
3. ✅ Vidéo finale a du son (quasi inaudible)
4. ✅ TikTok accepte la vidéo ✅

### Scénario 4: Modifier audio existant
1. ✅ Ouvrir modal avec vidéo ayant déjà audio
2. ✅ Clic "Modifier l'audio"
3. ✅ Changer texte → Régénérer audio
4. ✅ Écouter nouveau audio
5. ✅ Valider → Audio mis à jour

---

## NOTES IMPORTANTES

### Coût des APIs
- **OpenAI TTS**: $0.015 / 1000 caractères (~$0.001 par narration)
- **ElevenLabs**: 10,000 caractères/mois gratuit, puis $5/mois
- **Claude condensation**: $0.003 / 1000 tokens (~$0.0005 par condensation)
- **Total par contenu**: ~$0.0015 (très abordable)

### Performance
- **Génération audio**: 2-5 secondes (OpenAI TTS rapide)
- **CloudConvert merge**: +10-15 secondes
- **Total workflow**: ~20 secondes pour contenu final avec audio

### Limites TikTok
- **Audio**: Requis (sinon vidéo peut être rejetée)
- **Durée**: 3-60 secondes (optimal: 5-15 secondes)
- **Format**: MP4, H.264, AAC audio, 1080x1920
- **Taille**: Max 287MB ✅ (déjà implémenté)

---

**Plan finalisé le**: 2026-02-03
**Version**: 1.0
**Status**: Prêt pour implémentation
