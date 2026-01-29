# 🎬 Migration Vidéos - Instructions

## 📋 Vue d'ensemble

Cette migration sépare les **images** et les **vidéos** dans deux tables distinctes pour une meilleure organisation.

**Avant:** Tout dans `saved_images` (images + vidéos mélangées)
**Après:**
- `saved_images` → Images uniquement
- `my_videos` → Vidéos uniquement (nouvelle table)

---

## 🚀 Étapes de migration (DANS L'ORDRE!)

### Étape 1: Créer la table my_videos

Dans **Supabase SQL Editor**, exécuter:

```bash
psql $DATABASE_URL < supabase/migrations/20260129_create_my_videos_table.sql
```

Ou copier-coller le contenu dans l'éditeur SQL Supabase.

**Résultat attendu:**
- ✅ Table `my_videos` créée
- ✅ Indexes créés
- ✅ RLS policies activées
- ✅ Trigger `updated_at` créé

### Étape 2: Migrer les vidéos existantes

Dans **Supabase SQL Editor**, exécuter:

```bash
psql $DATABASE_URL < supabase/migrations/20260129_migrate_existing_videos.sql
```

**Ce que ce script fait:**
1. Copie toutes les vidéos de `saved_images` → `my_videos`
2. Détecte les vidéos par extension (.mp4, .mov, .webm, .avi)
3. Préserve: title, thumbnail_url, folder_id, is_favorite, created_at
4. Ajoute: source_type ('seedream_i2v' si dans tiktok-videos/, sinon 'upload')

**Résultat attendu:**
- ✅ Message: "Migration complete: X videos migrated"
- ✅ Vérifier avec: `SELECT COUNT(*) FROM my_videos;`

### Étape 3: Vérifier la migration

```sql
-- Compter les vidéos migrées
SELECT COUNT(*) AS total_videos FROM my_videos;

-- Compter les images restantes
SELECT COUNT(*) AS total_images FROM saved_images;

-- Voir quelques vidéos migrées
SELECT id, title, video_url, source_type, created_at
FROM my_videos
ORDER BY created_at DESC
LIMIT 5;
```

### Étape 4 (OPTIONNEL): Nettoyer saved_images

**⚠️ ATTENTION: Sauvegarder d'abord !**

Après avoir vérifié que tout fonctionne:

```sql
-- Supprimer les vidéos de saved_images (elles sont maintenant dans my_videos)
DELETE FROM saved_images
WHERE
  LOWER(image_url) LIKE '%.mp4%'
  OR LOWER(image_url) LIKE '%.mov%'
  OR LOWER(image_url) LIKE '%.webm%'
  OR LOWER(image_url) LIKE '%.avi%';
```

---

## ✅ Vérifications post-migration

### 1. Tester l'onglet "Mes Vidéos"

1. Aller sur `/library`
2. Cliquer sur l'onglet 🎬 **Mes vidéos**
3. Vérifier que toutes vos vidéos apparaissent
4. Tester:
   - ⭐ Ajouter aux favoris
   - ✏️ Modifier le titre
   - 🎵 Publier sur TikTok
   - 🗑️ Supprimer

### 2. Tester génération vidéo Seedream

1. Aller dans Seedream I2V
2. Convertir une image en vidéo
3. La vidéo devrait:
   - ✅ S'enregistrer automatiquement dans `my_videos`
   - ✅ Apparaître dans l'onglet "Mes vidéos"
   - ✅ PAS dans "Mes images"

### 3. Vérifier les stats

```sql
-- Stats par source
SELECT
  source_type,
  COUNT(*) AS count,
  SUM(file_size) / (1024 * 1024) AS total_mb
FROM my_videos
GROUP BY source_type;

-- Vidéos publiées sur TikTok
SELECT COUNT(*) AS tiktok_published
FROM my_videos
WHERE published_to_tiktok = TRUE;
```

---

## 🔧 Rollback (en cas de problème)

Si vous devez revenir en arrière:

```sql
-- Remettre les vidéos dans saved_images
INSERT INTO saved_images (
  user_id,
  image_url,
  thumbnail_url,
  title,
  folder_id,
  is_favorite,
  created_at
)
SELECT
  user_id,
  video_url AS image_url,
  thumbnail_url,
  title,
  folder_id,
  is_favorite,
  created_at
FROM my_videos
ON CONFLICT DO NOTHING;

-- Supprimer my_videos (optionnel)
DROP TABLE IF EXISTS my_videos CASCADE;
```

---

## 📊 Structure my_videos

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Référence auth.users |
| title | TEXT | Titre de la vidéo |
| video_url | TEXT | URL Supabase Storage |
| thumbnail_url | TEXT | URL miniature/cover |
| duration | INTEGER | Durée en secondes |
| source_type | TEXT | 'seedream_i2v', 'upload', 'tiktok_sync' |
| original_image_id | UUID | Si converti depuis une image |
| width | INTEGER | Largeur vidéo (px) |
| height | INTEGER | Hauteur vidéo (px) |
| file_size | BIGINT | Taille en bytes |
| format | TEXT | 'mp4', 'mov', etc. |
| folder_id | UUID | Dossier (optionnel) |
| is_favorite | BOOLEAN | Favori |
| tiktok_publish_id | TEXT | ID publication TikTok |
| published_to_tiktok | BOOLEAN | Publié sur TikTok |
| tiktok_published_at | TIMESTAMPTZ | Date publication TikTok |
| created_at | TIMESTAMPTZ | Date création |
| updated_at | TIMESTAMPTZ | Date modification |

---

## 🐛 Troubleshooting

### Problème: "relation my_videos does not exist"
**Solution:** Exécuter l'étape 1 (création table)

### Problème: "Videos not showing in tab"
**Solutions:**
1. Vérifier RLS policies: `SELECT * FROM my_videos LIMIT 1;`
2. Vérifier l'authentification utilisateur
3. Regarder les logs console browser (F12)

### Problème: "Video upload fails after migration"
**Solutions:**
1. Vérifier que `download-and-store` route utilise `my_videos`
2. Vérifier le bucket `generated-images` existe
3. Tester avec `scripts/verify-supabase-tiktok.sql`

---

## 📞 Support

Si problèmes persistants:
1. Vérifier les logs Vercel
2. Vérifier les logs Supabase (Database → Logs)
3. Exécuter `scripts/verify-supabase-tiktok.sql` pour diagnostic complet

---

**Dernière mise à jour:** 2026-01-29
**Version:** 1.0.0
