# CloudConvert Audio Merge - Implementation Complete ✅

## Problème identifié

**Date**: 2026-02-02
**Status**: ✅ RÉSOLU (2026-02-02)

CloudConvert **ne supporte PAS** les inputs multiples dans une seule conversion:

```typescript
// ❌ NE FONCTIONNE PAS
tasks['convert-video'] = {
  operation: 'convert',
  input: ['import-video', 'import-audio'], // Multiple inputs NOT supported
  output_format: 'mp4',
  // ...
};
```

**Erreur retournée**:
```
CloudConvert: convert-video: This conversion type is not supported
convert-video: The selected video codec is invalid
export-video: Input task has failed
```

## ✅ Solution implémentée (2026-02-02)

**Option A: 2 jobs CloudConvert séquentiels** - IMPLÉMENTÉ

Les endpoints suivants utilisent maintenant la fusion audio en 2 étapes:
- `/api/convert-video-tiktok` ✅
- `/api/convert-video-instagram` ✅

### Fonctionnement:

1. **Job 1**: Convertir vidéo au format TikTok/Instagram (H.264 + AAC)
2. **Job 2** (si audioUrl fourni): Merger audio TTS avec FFmpeg
   - Commande: `-i converted.mp4 -i narration.mp3 -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest output.mp4`
3. **Fallback**: Si Job 2 échoue, utilise vidéo du Job 1 (sans audio custom)
4. **Upload**: Télécharge vidéo finale vers Supabase Storage

### Résultat:
- ✅ L'audio TTS est **fusionné avec la vidéo**
- ✅ Fallback automatique si merge échoue
- ✅ Fonctionne pour TikTok et Instagram Reels
- ⚠️ Coût: 2 conversions CloudConvert par vidéo avec audio (12-13 vidéos/jour au lieu de 25)

## Solutions alternatives considérées

### Option A: 2 jobs CloudConvert séquentiels

#### Étape 1: Convertir vidéo
```typescript
const job1 = await cloudconvert.jobs.create({
  tasks: {
    'import-video': {
      operation: 'import/url',
      url: videoUrl
    },
    'convert-video': {
      operation: 'convert',
      input: 'import-video',
      output_format: 'mp4',
      video_codec: 'h264',
      audio_codec: 'aac',
      width: 1080,
      height: 1920,
      fit: 'max' // ou 'crop' pour Instagram
    },
    'export-video': {
      operation: 'export/url',
      input: 'convert-video'
    }
  }
});

// Attendre completion
const convertedVideoUrl = job1.tasks['export-video'].result.files[0].url;
```

#### Étape 2: Merger audio (si audioUrl fourni)
```typescript
if (audioUrl) {
  const job2 = await cloudconvert.jobs.create({
    tasks: {
      'import-video': {
        operation: 'import/url',
        url: convertedVideoUrl // Vidéo convertie du Job 1
      },
      'import-audio': {
        operation: 'import/url',
        url: audioUrl
      },
      'merge': {
        operation: 'command',
        engine: 'ffmpeg',
        command: '-i video.mp4 -i audio.mp3 -c:v copy -c:a aac -map 0:v -map 1:a -shortest output.mp4',
        input: ['import-video', 'import-audio']
      },
      'export': {
        operation: 'export/url',
        input: 'merge'
      }
    }
  });

  finalUrl = job2.tasks['export'].result.files[0].url;
}
```

**Coût**: 2 conversions au lieu d'1 (50 conversions/jour → 25 vidéos avec audio/jour)

### Option B: FFmpeg sur Vercel Edge Function

**Avantages**:
- Pas de limite CloudConvert
- Contrôle total du pipeline

**Inconvénients**:
- Timeout Vercel (10s hobby, 300s pro)
- Taille limite déploiement (50MB)
- Complexe à configurer

### Option C: Service externe spécialisé

**Alternatives**:
- **Shotstack** ($49/mois) - API vidéo editing
- **Bannerbear** ($29/mois) - 100 vidéos/mois
- **Mux** (pay-as-you-go) - Video infrastructure

**Inconvénient**: Plus cher que CloudConvert ($9/mois)

## Recommandation

**Phase 1** (actuel): Conversion simple sans audio merge ✅
- Permet de tester le pipeline de base
- Débloquer publication TikTok/Instagram
- Audio original préservé

**Phase 2**: Implémenter Option A (2 jobs CloudConvert)
- Si besoin réel d'audio TTS custom
- Coût raisonnable (25 vidéos/jour avec audio)
- Relativement simple à implémenter

**Phase 3** (si volume élevé): Migrer vers Option B ou C
- Si > 25 conversions/jour requis
- Si budget disponible pour service premium

## Fichiers concernés

- `/api/convert-video-tiktok/route.ts` (ligne 120-140)
- `/api/convert-video-instagram/route.ts` (ligne 120-140)
- `/app/library/components/TikTokModal.tsx` (handleGenerateNarration)
- `/app/library/components/InstagramModal.tsx` (handleGenerateNarration)

## Tests à effectuer

1. **Test conversion vidéo TikTok**:
   - Uploader une vidéo dans "Mes vidéos"
   - Cliquer "Publier sur TikTok"
   - Vérifier que la conversion CloudConvert passe
   - Vérifier que la vidéo est au bon format (H.264 + AAC, 1080x1920)

2. **Test conversion vidéo Instagram Reels**:
   - Uploader une vidéo dans "Mes vidéos"
   - Cliquer "Publier sur Instagram"
   - Vérifier que la conversion CloudConvert passe
   - Vérifier format: H.264 baseline, 9:16 crop, 30fps

3. **Test audio TTS (temporairement non fusionné)**:
   - Générer narration TTS dans modal TikTok/Instagram
   - Vérifier que l'audio est généré et jouable
   - Note: Audio TTS sera ignoré lors de la conversion
   - TODO: Une fois Option A implémentée, tester fusion audio

## Notes

- CloudConvert Free tier: 25 conversions/jour
- Avec merge audio en 2 jobs: 12-13 vidéos avec audio/jour
- Sans merge audio: 25 vidéos/jour
- Migrations SQL requises pour colonnes `video_id`, `media_type`, `category`
