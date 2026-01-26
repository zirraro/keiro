# ⚠️ BUCKET INSTAGRAM NON PUBLIC - Images noires

## Problème
Les images Instagram s'affichent en noir car le bucket Supabase Storage n'est pas public.

## Solution - RENDRE LE BUCKET PUBLIC

### Étape 1 : Ouvre Supabase Dashboard
- Va sur https://supabase.com/dashboard
- Sélectionne ton projet Keiro
- Va dans **"Storage"** (menu gauche)

### Étape 2 : Trouve le bucket "instagram-media"
- Tu devrais voir le bucket **"instagram-media"** dans la liste
- Si tu ne le vois pas, crée-le (bouton "New bucket")

### Étape 3 : Rendre le bucket PUBLIC
1. **Clique sur le bucket "instagram-media"**
2. **Clique sur l'icône ⚙️ (Settings)** en haut à droite
3. **Coche "Public bucket"**
4. **Clique "Save"**

### Étape 4 : Vérifier les permissions
Dans l'onglet "Policies" du bucket :
- Tu devrais avoir une policy "Public Access" automatique
- Si elle n'existe pas, crée-la :

```sql
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'instagram-media' );
```

### Étape 5 : Recharge ton app

Les images devraient maintenant s'afficher correctement !

## ⚡ Alternative rapide via SQL

Si tu préfères, exécute ce SQL dans "SQL Editor" :

```sql
-- Mettre le bucket instagram-media en public
UPDATE storage.buckets
SET public = true
WHERE name = 'instagram-media';

-- Ajouter policy d'accès public
CREATE POLICY IF NOT EXISTS "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'instagram-media' );
```

## 🔧 Troubleshooting

**Si les images sont toujours noires :**
1. Vérifie que le bucket est bien marqué "Public" dans Supabase Dashboard
2. Ouvre la console navigateur (F12) et regarde les erreurs
3. Clique droit sur une image noire → "Ouvrir l'image dans un nouvel onglet"
   - Si tu vois une erreur 403 → Le bucket n'est pas public
   - Si l'image s'affiche → Le problème est ailleurs (cache navigateur)

**Si le bucket n'existe pas :**
1. Va dans Storage → "New bucket"
2. Nom: `instagram-media`
3. Coche "Public bucket"
4. Clique "Create bucket"
5. Recharge ton app Keiro → la sync créera les images automatiquement
