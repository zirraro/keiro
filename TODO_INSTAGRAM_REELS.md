# TODO: Modal Instagram - Support Reels

## 📋 Statut actuel

### ✅ Ce qui est fait:
1. ✅ Migration SQL pour `instagram_drafts` (video_id, media_type, category)
2. ✅ Composant `InstagramDraftsTab` avec catégories (draft/published) et support vidéos
3. ✅ Filtres par catégorie dans l'onglet Brouillons Instagram
4. ✅ Badges de catégorie et type de média (image/Reel)

### ❌ Ce qui reste à faire:

## 1. Modal Instagram - Ajouter support vidéos (Reels)

**Fichier**: `app/library/components/InstagramModal.tsx` (823 lignes)

### Changements nécessaires:

#### A. Ajouter tab switcher Images/Vidéos
```tsx
// Ajouter state
const [activeTab, setActiveTab] = useState<'images' | 'videos'>('images');
const [availableVideos, setAvailableVideos] = useState<MyVideo[]>([]);
const [selectedVideo, setSelectedVideo | null>(null);

// UI Tab Switcher (comme TikTokModal)
<div className="tab-switcher">
  <button onClick={() => setActiveTab('images')}>
    📸 Images ({availableImages.length})
  </button>
  <button onClick={() => setActiveTab('videos')}>
    🎥 Vidéos ({availableVideos.length})
  </button>
</div>
```

#### B. Charger vidéos depuis my_videos
```tsx
useEffect(() => {
  const loadVideos = async () => {
    const response = await fetch('/api/library/videos');
    const data = await response.json();
    setAvailableVideos(data.videos || []);
  };
  if (activeTab === 'videos') {
    loadVideos();
  }
}, [activeTab]);
```

#### C. Ajouter génération narration TTS (comme TikTok)
```tsx
// États narration
const [narrationScript, setNarrationScript] = useState('');
const [narrationAudioUrl, setNarrationAudioUrl] = useState<string | null>(null);
const [generatingNarration, setGeneratingNarration] = useState(false);

// Fonction handleGenerateNarration (copier depuis TikTokModal.tsx)
const handleGenerateNarration = async () => {
  // Appel /api/generate-narration
  // Condensation texte + génération audio
};

// UI éditeur narration (copier depuis TikTokModal.tsx lignes 1184-1267)
```

#### D. Convertir vidéo pour Reels si nécessaire
```tsx
// Vérifier format vidéo avant publication
const handlePublishToInstagram = async () => {
  let finalVideoUrl = selectedVideo?.video_url;

  // Si vidéo pas au bon format, convertir avec CloudConvert
  if (selectedVideo && !isReelCompatible(selectedVideo)) {
    // Appel /api/convert-video-instagram
    // Paramètres: aspectRatio 9:16, maxDuration 90s
    const convertResponse = await fetch('/api/convert-video-instagram', {
      method: 'POST',
      body: JSON.stringify({
        videoUrl: selectedVideo.video_url,
        audioUrl: narrationAudioUrl,
        videoId: selectedVideo.id
      })
    });
    const convertData = await convertResponse.json();
    finalVideoUrl = convertData.convertedUrl;
  }

  // Publier sur Instagram
  // ...
};
```

---

## 2. Endpoint conversion Instagram Reels

**Fichier à créer**: `app/api/convert-video-instagram/route.ts`

### Spécifications Instagram Reels:
- Format: MP4
- Codec: H.264 (baseline profile)
- Audio: AAC, 44.1kHz, stéréo
- Résolution: 1080x1920 (9:16)
- Durée: 3-90 secondes
- Taille: Max 1GB
- Frame rate: 30fps

### Code CloudConvert:
```typescript
export async function POST(req: NextRequest) {
  const { videoUrl, audioUrl, videoId } = await req.json();

  // Auth user
  const { user } = await getAuthUser();

  const tasks: any = {
    'import-video': {
      operation: 'import/url',
      url: videoUrl,
      filename: 'input.mp4'
    }
  };

  // Si audio personnalisé
  if (audioUrl) {
    tasks['import-audio'] = {
      operation: 'import/url',
      url: audioUrl,
      filename: 'narration.mp3'
    };

    tasks['convert-video'] = {
      operation: 'convert',
      input: ['import-video', 'import-audio'],
      output_format: 'mp4',
      video_codec: 'h264',
      video_codec_profile: 'baseline', // Instagram exige baseline
      audio_codec: 'aac',
      audio_bitrate: 128,
      audio_frequency: 44100,
      width: 1080,
      height: 1920,
      fit: 'crop', // Crop pour 9:16
      fps: 30
    };
  } else {
    // Conversion simple
    tasks['convert-video'] = {
      operation: 'convert',
      input: 'import-video',
      output_format: 'mp4',
      video_codec: 'h264',
      video_codec_profile: 'baseline',
      audio_codec: 'aac',
      width: 1080,
      height: 1920,
      fit: 'crop',
      fps: 30
    };
  }

  tasks['export-video'] = {
    operation: 'export/url',
    input: 'convert-video'
  };

  // Créer job CloudConvert
  // Attendre completion
  // Upload vers Supabase
  // Update my_videos
  // Créer draft instagram_drafts (category: 'draft', media_type: 'video')
}
```

---

## 3. Optimisation pipeline CloudConvert

### Scénarios de conversion:

#### Scénario 1: Image → Vidéo (TikTok/Instagram)
**Actuellement**: Seedream I2V (5s animation)
**Amélioration**:
- Option pour durée variable (3-15s)
- Option pour ajouter audio TTS
- CloudConvert: Image → Vidéo avec audio overlay

#### Scénario 2: Vidéo → TikTok (H.264 + AAC)
**Actuellement**: CloudConvert standard API
**Fonctionnel**: ✅ (commit e5b5b848)
**Amélioration**:
- Merge audio si narration fournie (déjà implémenté ligne 125-145 de convert-video-tiktok/route.ts)
- Vérifier que `input: ['import-video', 'import-audio']` fonctionne bien

#### Scénario 3: Vidéo → Instagram Reel
**À créer**: Endpoint `/api/convert-video-instagram`
**Différences vs TikTok**:
- Profile H.264: baseline (vs main)
- Fit: crop (vs max)
- Durée max: 90s (vs 180s)
- Aspect ratio: 9:16 strict

### Test CloudConvert avec multiple inputs:
```bash
# Tester avec un cas réel
curl -X POST https://keiro.vercel.app/api/convert-video-tiktok \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://...",
    "audioUrl": "https://...",
    "videoId": "uuid"
  }'

# Vérifier logs CloudConvert
# Si erreur "This conversion type is not supported":
#   → CloudConvert n'accepte pas input: ['video', 'audio']
#   → Solution: Conversion en 2 étapes (merge audio séparé)
```

---

## 4. Alternative si CloudConvert ne supporte pas multiple inputs

### Option A: FFmpeg.wasm côté client
- Déjà testé, abandonné (trop lent, problèmes mémoire)

### Option B: FFmpeg sur serveur Vercel
- Installer via buildpack
- Taille limite déploiement Vercel: 50MB
- Risque de timeout (10s Hobby plan)

### Option C: Service externe (Bannerbear, Shotstack)
- **Bannerbear**: $29/mois, 100 videos
- **Shotstack**: $49/mois, API vidéo
- ❌ Plus cher que CloudConvert

### Option D: Merge audio en 2 jobs CloudConvert
```typescript
// Job 1: Convertir vidéo
const job1 = await cloudconvert.jobs.create({
  tasks: {
    'import-video': { operation: 'import/url', url: videoUrl },
    'convert-video': {
      operation: 'convert',
      input: 'import-video',
      video_codec: 'h264',
      audio_codec: 'aac'
    },
    'export-video': { operation: 'export/url', input: 'convert-video' }
  }
});

// Attendre job1
const convertedVideoUrl = job1.data.tasks['export-video'].result.files[0].url;

// Job 2: Merger audio
const job2 = await cloudconvert.jobs.create({
  tasks: {
    'import-video': { operation: 'import/url', url: convertedVideoUrl },
    'import-audio': { operation: 'import/url', url: audioUrl },
    'command': {
      operation: 'command',
      engine: 'ffmpeg',
      command: '-i input-video -i input-audio -c:v copy -c:a aac -map 0:v -map 1:a -shortest output.mp4'
    },
    'export': { operation: 'export/url', input: 'command' }
  }
});
```

**Coût**: 2 conversions au lieu d'1 (50 conversions/jour au lieu de 25)

---

## 5. Priorisation

### 🔴 Urgent (pour fonctionner maintenant):
1. Tester CloudConvert avec multiple inputs (TikTok)
2. Si ça marche: Dupliquer pour Instagram
3. Si ça ne marche pas: Implémenter merge audio en 2 jobs

### 🟡 Moyen terme (amélioration UX):
1. Modal Instagram avec tab switcher vidéos
2. Génération narration TTS pour Instagram Reels
3. Conversion automatique image → vidéo (actuellement via Seedream)

### 🟢 Long terme (optimisation):
1. Batch processing (plusieurs vidéos à la fois)
2. Cache des conversions (éviter reconversion même vidéo)
3. Prévisualisation vidéo avant publication
4. Montage vidéo avancé (trim, filters, transitions)

---

## 6. Migrations SQL à exécuter

### Dans Supabase SQL Editor:

#### Migration 3 (TikTok):
```sql
-- Voir SUPABASE_SETUP.md section 3
```

#### Migration 4 (Instagram):
```sql
-- Voir SUPABASE_SETUP.md section 4
```

---

**Date de création**: 2026-02-02
**Status**: En attente d'implémentation
**Complexité estimée**: 6-8h pour modal Instagram + tests
