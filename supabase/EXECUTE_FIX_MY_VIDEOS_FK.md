# Correction urgente: Foreign Key my_videos → library_folders

## Problème identifié

La table `my_videos` fait référence à une table `folders` qui n'existe pas. Elle devrait référencer `library_folders`.

## Solution

Exécuter la migration SQL suivante dans le **SQL Editor** de Supabase Dashboard:

### Étape 1: Ouvrir Supabase Dashboard
1. Aller sur https://supabase.com/dashboard
2. Sélectionner votre projet Keiro
3. Cliquer sur "SQL Editor" dans la sidebar

### Étape 2: Copier-coller et exécuter ce SQL

```sql
-- Drop the incorrect foreign key constraint if it exists
ALTER TABLE IF EXISTS my_videos
DROP CONSTRAINT IF EXISTS my_videos_folder_id_fkey;

-- Add the correct foreign key constraint
ALTER TABLE IF EXISTS my_videos
ADD CONSTRAINT my_videos_folder_id_fkey
FOREIGN KEY (folder_id) REFERENCES library_folders(id)
ON DELETE SET NULL;

-- Comment for documentation
COMMENT ON CONSTRAINT my_videos_folder_id_fkey ON my_videos IS 'Foreign key to library_folders table (fixed reference)';
```

### Étape 3: Vérifier le résultat

Exécuter cette requête pour vérifier que la contrainte est bien en place:

```sql
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'my_videos'
  AND kcu.column_name = 'folder_id';
```

Résultat attendu:
```
constraint_name           | my_videos_folder_id_fkey
table_name                | my_videos
column_name               | folder_id
foreign_table_name        | library_folders
foreign_column_name       | id
```

## Impact

- ✅ Permet aux vidéos d'être correctement assignées aux dossiers
- ✅ Pas d'impact sur les données existantes (ON DELETE SET NULL)
- ✅ Fix immédiat pour le système de rangement

## Fichier de migration

Le fichier SQL complet est disponible dans:
`supabase/migrations/20260205_fix_my_videos_folder_fk.sql`
