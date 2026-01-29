# 🔍 Diagnostic Complet TikTok - Keiro

**Date:** 2026-01-29
**Status:** 🔴 Problèmes critiques identifiés

---

## ❌ PROBLÈMES IDENTIFIÉS

### 🚨 CRITIQUE #1: Violation des restrictions TikTok (API Non-Auditée)

**Localisation:** `lib/tiktok.ts` lignes 254 et 349

**Problème:**
```typescript
privacy_level: 'PUBLIC_TO_EVERYONE'  // ❌ INTERDIT pour apps non-auditées
```

**Guideline TikTok:**
> "Posts created by unaudited clients will be restricted to **SELF_ONLY** visibility"

**Impact:**
- ❌ Publication TikTok échoue silencieusement
- ❌ API TikTok rejette les posts avec privacy = PUBLIC_TO_EVERYONE
- ❌ Limitation: 5 utilisateurs / 24h pour apps non-auditées

**Solution requise:**
```typescript
privacy_level: 'SELF_ONLY'  // ✅ Conforme guideline
```

---

### 🚨 CRITIQUE #2: Mauvaise méthode d'upload (FILE_UPLOAD vs PULL_FROM_URL)

**Localisation:** `lib/tiktok.ts` ligne 261

**Problème actuel:**
```typescript
source_info: {
  source: 'FILE_UPLOAD',  // ❌ Non optimal pour contenu server-side
  video_size: videoSize,
  chunk_size: chunkSize,
  total_chunk_count: totalChunkCount,
}
```

**Guideline TikTok:**
> "For server-side content generation, use **PULL_FROM_URL** source type"

**Impact:**
- ⚠️ Upload plus lent et complexe (3 étapes vs 1 étape)
- ⚠️ Utilise plus de bande passante
- ⚠️ Plus de points de défaillance

**Solution recommandée:**
```typescript
source_info: {
  source: 'PULL_FROM_URL',
  video_url: publicSupabaseUrl  // TikTok télécharge directement
}
```

---

### ⚠️ PROBLÈME #3: Scopes OAuth potentiellement manquants

**Localisation:** `app/api/auth/tiktok-oauth/route.ts` lignes 21-26

**Scopes actuels demandés:**
```typescript
const scopes = [
  'user.info.basic',      // ✅ OK
  'video.list',           // ✅ OK
  'video.publish',        // ✅ OK
  'video.upload',         // ✅ OK
].join(',');
```

**Problème:**
- Si l'utilisateur a connecté TikTok AVANT l'ajout de nouveaux scopes, il aura des permissions insuffisantes
- Erreur: "Failed to fetch TikTok videos" = probablement scope `video.list` non accordé

**Vérification requise:**
1. User doit RE-CONNECTER son compte TikTok pour obtenir TOUS les scopes
2. Ajouter détection de scope manquant dans error handling

---

### ⚠️ PROBLÈME #4: Pas de watermark (Conforme, mais limitation)

**Guideline TikTok:**
> "Do not add promotional branding such as watermarks, logos, or names to posted content"

**Status:** ✅ Actuellement conforme (pas de watermark ajouté)

**Note:** Si vous vouliez ajouter watermark Keiro, ce n'est PAS autorisé.

---

### ⚠️ PROBLÈME #5: UX Requirements TikTok non implémentées

**Guidelines TikTok obligatoires:**

1. ✅ **Privacy Selection** - Actuellement SELF_ONLY (après fix #1)
2. ❌ **Commercial Content Disclosure** - Non implémenté
3. ❌ **AI-Generated Content Label** - Non implémenté (REQUIS pour contenu Seedream!)
4. ❌ **Brand Content Toggle** - Non implémenté
5. ❌ **Comment Settings** - Partiellement (disable_comment existe)
6. ❌ **Duet/Stitch/Download Settings** - Partiellement implémenté

**Impact:**
- App peut être rejetée lors de review TikTok
- Violation des guidelines UX

---

## 🔧 CORRECTIFS REQUIS

### Fix #1: Changer privacy_level à SELF_ONLY (URGENT)

**Fichier:** `lib/tiktok.ts`

**Lignes 252-260:**
```typescript
post_info: {
  title: '',
  privacy_level: 'SELF_ONLY',  // ✅ CHANGÉ
  disable_duet: false,
  disable_comment: false,
  disable_stitch: false,
  video_cover_timestamp_ms: 1000,
}
```

**Lignes 346-353:**
```typescript
post_info: {
  title: title || '',
  description: description || '',
  privacy_level: 'SELF_ONLY',  // ✅ CHANGÉ
  disable_duet: false,
  disable_comment: false,
  disable_stitch: false,
}
```

---

### Fix #2: Implémenter PULL_FROM_URL (Recommandé)

**Avantages:**
- ✅ Plus simple (1 seule requête API au lieu de 3)
- ✅ Plus rapide
- ✅ Moins de points de défaillance
- ✅ Recommandé par TikTok pour server-side content

**Nouvelle fonction dans `lib/tiktok.ts`:**
```typescript
/**
 * Publish video using PULL_FROM_URL (recommended for server-side)
 */
export async function publishTikTokVideoFromUrl(
  accessToken: string,
  videoUrl: string,
  caption: string = '',
  options?: {
    disable_duet?: boolean;
    disable_comment?: boolean;
    disable_stitch?: boolean;
  }
): Promise<{ publish_id: string }> {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: caption.substring(0, 150), // TikTok max title length
        privacy_level: 'SELF_ONLY',
        disable_duet: options?.disable_duet ?? false,
        disable_comment: options?.disable_comment ?? false,
        disable_stitch: options?.disable_stitch ?? false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl, // TikTok downloads from this URL
      },
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to publish TikTok video');
  }

  return data.data;
}
```

---

### Fix #3: Meilleure détection erreurs scope

**Fichier:** `app/api/tiktok/sync-media/route.ts`

**Amélioration détection:**
```typescript
} catch (videoError: any) {
  console.error('[TikTokSync] TikTok API error:', videoError.message);

  // Détection plus précise des erreurs de scope
  const errorMsg = videoError.message.toLowerCase();
  const isScopeError =
    errorMsg.includes('scope') ||
    errorMsg.includes('permission') ||
    errorMsg.includes('not authorized') ||
    errorMsg.includes('access_token_invalid') ||
    errorMsg.includes('insufficient') ||
    errorMsg.includes('video.list'); // Scope spécifique manquant

  if (isScopeError) {
    return NextResponse.json({
      ok: false,
      error: '⚠️ Permissions TikTok insuffisantes.\n\nVeuillez RECONNECTER votre compte TikTok pour accorder toutes les autorisations nécessaires (user.info.basic, video.list, video.publish, video.upload).',
      needsReconnect: true,
      requiredScopes: ['user.info.basic', 'video.list', 'video.publish', 'video.upload']
    }, { status: 403 });
  }

  return NextResponse.json({
    ok: false,
    error: `Erreur TikTok API: ${videoError.message}`
  }, { status: 500 });
}
```

---

### Fix #4: Ajouter AI-Generated Content Label (OBLIGATOIRE)

**TikTok Guideline:**
> "Label AI-generated content"

**Fichier:** `lib/tiktok.ts`

**Ajouter champ dans post_info:**
```typescript
post_info: {
  title: caption,
  privacy_level: 'SELF_ONLY',
  disable_duet: false,
  disable_comment: false,
  disable_stitch: false,
  video_cover_timestamp_ms: 1000,
  ai_generated_content: true,  // ✅ AJOUTÉ - Requis par guidelines
  content_disclosure: {
    branded_content: false,
    ai_generated: true
  }
}
```

**Note:** Vérifier documentation TikTok pour nom exact du champ (peut varier selon version API)

---

## ✅ VÉRIFICATIONS SUPABASE

### Bucket `generated-images`

**Configuration requise:**
```sql
-- Vérifier existence
SELECT * FROM storage.buckets WHERE name = 'generated-images';

-- Configuration attendue:
-- - public: true
-- - file_size_limit: 104857600 (100MB)
-- - allowed_mime_types: ['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png']
```

**Politique RLS requise:**
```sql
-- Allow authenticated users to upload their own content
CREATE POLICY "Users upload own content"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'generated-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-images');
```

### Table `profiles`

**Vérifier colonnes TikTok:**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name LIKE 'tiktok_%';
```

**Colonnes attendues:**
- `tiktok_user_id` (TEXT)
- `tiktok_username` (TEXT)
- `tiktok_display_name` (TEXT)
- `tiktok_avatar_url` (TEXT)
- `tiktok_access_token` (TEXT) - ENCRYPTED
- `tiktok_refresh_token` (TEXT) - ENCRYPTED
- `tiktok_token_expiry` (TIMESTAMPTZ)
- `tiktok_connected_at` (TIMESTAMPTZ)

### Table `tiktok_posts`

**Vérifier existence:**
```sql
SELECT * FROM information_schema.tables
WHERE table_name = 'tiktok_posts';
```

**Structure attendue:**
- `id` (TEXT PRIMARY KEY)
- `user_id` (UUID REFERENCES auth.users)
- `video_description`, `duration`, `cover_image_url`
- `cached_video_url`, `share_url`
- `view_count`, `like_count`, `comment_count`, `share_count`
- `posted_at`, `synced_at`

---

## 🧪 TESTS RECOMMANDÉS

### Test #1: Vérifier connexion TikTok

**Dans console Vercel Logs:**
```
1. User clique "Connecter TikTok"
2. Chercher logs: [TikTokCallback] ✅ Step 5/5 complete: Success!
3. Vérifier que tiktok_user_id est sauvegardé
```

### Test #2: Vérifier scopes OAuth

**Requête SQL Supabase:**
```sql
SELECT
  id,
  tiktok_user_id,
  tiktok_username,
  tiktok_token_expiry,
  tiktok_connected_at
FROM profiles
WHERE id = 'USER_ID_HERE';
```

**Si token_expiry < NOW(), token expiré → Refresh automatique devrait se déclencher**

### Test #3: Test publication vidéo

**Flow complet:**
```
1. Générer vidéo avec Seedream I2V
2. Vérifier logs: [DownloadAndStore] ✓ SUCCESS! Saved to gallery
3. Cliquer "Publier sur TikTok"
4. Vérifier logs: [TikTokPublish] Video published: { publish_id: '...' }
5. Vérifier sur TikTok mobile app → Post devrait être en SELF_ONLY (brouillons)
```

### Test #4: Sync vidéos TikTok

**Dans TikTokWidget:**
```
1. Cliquer "Synchroniser"
2. Si erreur "Failed to fetch" → RECONNECTER compte TikTok
3. Vérifier logs: [TikTokSync] Fetched X videos
4. Vérifier table tiktok_posts contient les vidéos
```

---

## 🚀 PROCHAINES ÉTAPES

### Priorité URGENTE (Faire maintenant)

1. ✅ **Changer `privacy_level` à `SELF_ONLY`** dans `lib/tiktok.ts`
2. ✅ **Reconnecter compte TikTok** pour obtenir tous les scopes
3. ✅ **Tester publication complète** et vérifier brouillons TikTok

### Priorité HAUTE (Cette semaine)

4. ⚠️ Implémenter `PULL_FROM_URL` pour simplifier upload
5. ⚠️ Ajouter label `ai_generated_content` (requis guidelines)
6. ⚠️ Améliorer error handling scopes

### Priorité MOYENNE (Avant soumission app)

7. 📋 Implémenter tous les UX requirements TikTok:
   - Commercial content disclosure
   - Brand content toggle
   - Comment/Duet/Stitch settings UI
8. 📋 Créer vidéo démo pour soumission TikTok
9. 📋 Documentation complète des scopes utilisés

---

## 📊 RÉSUMÉ STATUT

| Composant | Statut | Action requise |
|-----------|--------|----------------|
| **Privacy Level** | 🔴 Non-conforme | Changer à SELF_ONLY |
| **Upload Method** | 🟡 Fonctionne mais non-optimal | Implémenter PULL_FROM_URL |
| **OAuth Scopes** | 🟡 OK mais user doit reconnecter | Force reconnect |
| **AI Content Label** | 🔴 Manquant | Ajouter champ |
| **Database (Supabase)** | ✅ OK | Vérifier RLS policies |
| **Video Save (download-and-store)** | ✅ OK | Logs complets implémentés |
| **UX Requirements** | 🔴 Partiellement | Implémenter disclosure UI |
| **Watermark** | ✅ Conforme | Aucune action |

---

## 🎯 SUCCÈS CRITÈRES

### Pour que TikTok fonctionne aujourd'hui:

1. ✅ `privacy_level: 'SELF_ONLY'` dans lib/tiktok.ts
2. ✅ User reconnecte TikTok avec tous scopes
3. ✅ Test publication → Apparaît dans brouillons TikTok

### Pour soumission app TikTok:

1. ✅ Tous les fixes ci-dessus
2. ✅ UX requirements implémentés
3. ✅ Vidéo démo 2-5 min
4. ✅ Documentation scopes + justifications
5. ✅ AI-generated content labeling

---

**Généré le:** 2026-01-29 à 15:42 UTC
**Par:** Claude Sonnet 4.5 (Diagnostic Expert)
