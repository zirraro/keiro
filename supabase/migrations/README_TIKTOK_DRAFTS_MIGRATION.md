# Migration TikTok Drafts - Video Support

## Problème résolu

Les aperçus d'images dans l'onglet "Brouillons TikTok" étaient cassés car :
- Le code frontend cherchait `draft.media_url`
- La base de données avait encore l'ancien nom de colonne `image_url`

## Solution temporaire (Code)

Le code a été mis à jour avec une compatibilité descendante :

### Frontend (`TikTokDraftsTab.tsx`)
```typescript
src={draft.media_url || (draft as any).image_url}
```

### Backend API (`/api/library/tiktok-drafts/route.ts`)
```typescript
const normalizedData = data?.map((draft: any) => ({
  ...draft,
  media_url: draft.media_url || draft.image_url,
  media_type: draft.media_type || 'image',
  category: draft.category || 'draft'
})) || [];
```

## Migration requise (Base de données)

Pour une solution permanente, exécutez cette migration dans Supabase SQL Editor :

**Fichier** : `20260202_add_video_support_to_tiktok_drafts_SAFE.sql`

Cette migration :
1. ✅ Renomme `image_url` → `media_url`
2. ✅ Ajoute colonne `video_id` (UUID, nullable)
3. ✅ Ajoute colonne `media_type` (TEXT, default 'image')
4. ✅ Ajoute colonne `category` (TEXT, default 'draft')
5. ✅ Crée des index pour optimiser les requêtes

### Comment exécuter

1. Allez sur [Supabase Dashboard](https://app.supabase.com)
2. Projet : Keiro
3. SQL Editor → Nouvelle requête
4. Copiez le contenu de `20260202_add_video_support_to_tiktok_drafts_SAFE.sql`
5. Exécutez la requête
6. Vérifiez les logs pour confirmer le succès

### Vérification

Après exécution, vérifiez que la table a bien été modifiée :

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tiktok_drafts'
ORDER BY ordinal_position;
```

Résultat attendu :
- ✅ `media_url` (TEXT) existe
- ✅ `video_id` (UUID, nullable) existe
- ✅ `media_type` (TEXT, default 'image') existe
- ✅ `category` (TEXT, default 'draft') existe
- ❌ `image_url` n'existe plus (renommé)

## Backward Compatibility

Le code actuel continue de fonctionner **même si la migration n'est pas exécutée** grâce aux fallbacks. Cependant, pour de meilleures performances et une structure de données cohérente, il est recommandé d'exécuter la migration dès que possible.

## Status

- ✅ Code frontend compatible
- ✅ Code backend compatible
- ⏳ Migration DB en attente d'exécution
- ✅ Pas de breaking changes
