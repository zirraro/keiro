# TikTok Video Requirements - Guide Complet

## Exigences Strictes TikTok

### Format Vidéo
- **Container**: MP4 (recommandé), MOV, WebM, AVI
- **Codec Vidéo**: H.264 (AVC) - **OBLIGATOIRE**
  - ❌ **PAS** H.265 (HEVC)
  - ❌ **PAS** VP9
  - ❌ **PAS** autres codecs
- **Codec Audio**: AAC - **OBLIGATOIRE**
  - ❌ **PAS** MP3
  - ❌ **PAS** Opus
  - ❌ **PAS** sans audio (audio REQUIS)

### Spécifications Techniques
- **Résolution**:
  - Minimum: 540px (largeur)
  - Maximum: 1080px (largeur) x 1920px (hauteur)
  - Recommandé: 1080x1920 (9:16 vertical)
- **Aspect Ratio**:
  - Préféré: 9:16 (vertical, pour TikTok mobile)
  - Accepté: 1:1 (carré), 16:9 (horizontal)
- **Durée**:
  - Minimum: 3 secondes
  - Maximum: Variable selon compte (typiquement 10 minutes = 600s)
- **Taille fichier**:
  - Maximum: 287 MB (limite TikTok)
  - Recommandé: < 100 MB pour upload rapide
- **Frame Rate**: 23-60 FPS
- **Bitrate**:
  - Vidéo: 1-4 Mbps
  - Audio: 128-192 kbps

### Restrictions de Contenu
- ❌ Pas de watermark d'autres plateformes (Instagram, YouTube, etc.)
- ❌ Pas de contenu dupliqué
- ✅ Respect des droits d'auteur
- ✅ Audio obligatoire (même silence)

## Comment Vérifier Votre Vidéo

### Avec FFmpeg (ligne de commande)
```bash
# Vérifier format et codec
ffmpeg -i video.mp4

# Exemple sortie attendue:
# Video: h264 (High), yuv420p, 1080x1920, 2000 kb/s, 30 fps
# Audio: aac (LC), 44100 Hz, stereo, 128 kb/s
```

### Avec VLC Media Player
1. Ouvrir la vidéo dans VLC
2. Menu: Outils > Informations sur les codecs (Ctrl+J)
3. Vérifier:
   - Codec vidéo: H264 - MPEG-4 AVC
   - Codec audio: MPEG AAC Audio

## Problèmes Courants et Solutions

### Erreur: "Content Sharing Guidelines"
**Causes possibles**:
1. Codec vidéo incorrect (ex: H.265 au lieu de H.264)
2. Audio manquant ou codec audio incorrect
3. Format fichier corrompu
4. Résolution non supportée
5. Durée < 3 secondes

**Solution**: Réencoder la vidéo avec FFmpeg
```bash
ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 23 \
       -c:a aac -b:a 128k -ar 44100 \
       -vf "scale='min(1080,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease" \
       -movflags +faststart output_tiktok.mp4
```

### Erreur: "Video too large"
**Solution**: Réduire taille/bitrate
```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 28 -c:a aac -b:a 96k output_small.mp4
```

### Erreur: "Invalid duration"
**Solution**: Vérifier durée >= 3s
```bash
ffmpeg -i input.mp4 2>&1 | grep Duration
```

## Optimisation Vidéo pour TikTok

### Commande FFmpeg Optimale
```bash
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -profile:v high \
  -level 4.2 \
  -preset medium \
  -crf 23 \
  -maxrate 4M \
  -bufsize 8M \
  -c:a aac \
  -b:a 128k \
  -ar 44100 \
  -ac 2 \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" \
  -movflags +faststart \
  -pix_fmt yuv420p \
  -r 30 \
  output_tiktok_optimized.mp4
```

**Explication**:
- `libx264`: Codec H.264
- `profile:v high`: Profile élevé (meilleure qualité)
- `crf 23`: Qualité constante (18-28 recommandé)
- `maxrate 4M`: Bitrate max 4 Mbps
- `aac`: Codec audio AAC
- `scale`: Redimensionner à 1080x1920
- `movflags +faststart`: Streaming optimisé
- `yuv420p`: Espace couleur compatible

## Validation Automatique Keiro

Notre système valide automatiquement:
- ✅ Taille fichier (< 100MB)
- ✅ Format container (MP4, MOV, WebM, AVI)
- ✅ Signature fichier (magic bytes)

**Non validable côté serveur** (limitations Vercel):
- ⚠️ Codec vidéo (H.264)
- ⚠️ Codec audio (AAC)
- ⚠️ Résolution
- ⚠️ Durée exacte

**Ces vérifications sont faites par TikTok lors de l'upload.**

## Recommandations Keiro

### Pour Upload Utilisateur
1. Utiliser MP4 avec H.264 + AAC
2. Résolution: 1080x1920 (vertical)
3. Durée: 5-60 secondes recommandé
4. Taille: < 50MB pour meilleure performance

### Pour Vidéos Générées (Seedream I2V)
- Format de sortie: MP4 H.264 + AAC (déjà optimisé)
- Résolution: 1080x1920
- Durée: 5 secondes par défaut

## Outils de Conversion Recommandés

### En Ligne (gratuit)
- CloudConvert: https://cloudconvert.com/mp4-converter
- Online-Convert: https://www.online-convert.com/
- FreeConvert: https://www.freeconvert.com/video-converter

### Logiciels Desktop
- HandBrake: https://handbrake.fr/ (gratuit, open-source)
- FFmpeg: https://ffmpeg.org/ (ligne de commande)
- Shotcut: https://shotcut.org/ (éditeur vidéo gratuit)

### Paramètres HandBrake Recommandés
1. Format: MP4
2. Video Codec: H.264 (x264)
3. Framerate: Same as source
4. Quality: Constant Quality RF 22-24
5. Audio Codec: AAC
6. Audio Bitrate: 128 kbps

## Support

Si vous rencontrez des problèmes:
1. Vérifiez que votre vidéo respecte TOUTES les exigences ci-dessus
2. Essayez de réencoder avec la commande FFmpeg optimale
3. Contactez le support Keiro avec:
   - URL de la vidéo
   - Message d'erreur complet
   - Sortie de `ffmpeg -i votre_video.mp4`

---

**Dernière mise à jour**: 2026-01-29
**Version**: 1.0
