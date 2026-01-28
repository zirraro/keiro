# Fix Instagram Publication Error: "Media ID is not available"

## Problème

Erreur lors de la publication Instagram:
```json
{
  "error": "Media ID is not available",
  "imageUrl": "https://duxjdlzdfjrhyojjwnig.supabase.co/storage/v1/object/public/instagram-media/..."
}
```

**Cause:** Le bucket `instagram-media` n'est pas configuré comme public OU les policies RLS bloquent l'accès public.

Meta (Facebook/Instagram) API doit pouvoir **télécharger l'image depuis l'URL** pour créer le post. Si le bucket n'est pas public, Meta reçoit une erreur 403 Forbidden.

---

## Solution Rapide (3 minutes)

### Étape 1: Vérifier si le bucket est public

1. Va sur [Supabase Dashboard](https://app.supabase.com)
2. Sélectionne ton projet
3. Va dans **Storage** (menu gauche)
4. Clique sur le bucket **`instagram-media`**
5. Regarde en haut à droite: il doit y avoir **"Public bucket"**

**Si tu vois "Private bucket"**, passe à l'étape 2.

### Étape 2: Rendre le bucket public via l'interface

1. Clique sur les **3 points** (⋮) à côté du bucket `instagram-media`
2. Clique sur **"Edit bucket"**
3. **Coche la case "Public bucket"**
4. Clique sur **"Save"**

### Étape 3: Configurer les policies RLS (CRUCIAL)

Même avec un bucket public, les policies RLS peuvent bloquer l'accès. Exécute ce SQL dans **SQL Editor** de Supabase:

```sql
-- 1. Vérifier si le bucket est public
SELECT name, public FROM storage.buckets WHERE name = 'instagram-media';
-- Résultat attendu: public = true

-- 2. Si public = false, le rendre public
UPDATE storage.buckets
SET public = true
WHERE name = 'instagram-media';

-- 3. Supprimer les anciennes policies qui pourraient bloquer
DROP POLICY IF EXISTS "Public read access for instagram-media" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;

-- 4. Créer une policy de lecture publique CLAIRE
CREATE POLICY "Public Access for Instagram Media"
ON storage.objects FOR SELECT
USING ( bucket_id = 'instagram-media' );
```

### Étape 4: Tester immédiatement

1. **Copie une URL d'image** depuis le bucket `instagram-media`
   - Exemple: `https://[project].supabase.co/storage/v1/object/public/instagram-media/user-id/image.jpg`

2. **Teste dans ton navigateur** (navigation privée):
   - Colle l'URL dans la barre d'adresse
   - **L'image doit s'afficher** ✅
   - Si tu vois "Not found" ou "Forbidden" ❌, les policies bloquent encore

3. **Teste avec curl** (pour simuler Meta API):
```bash
curl -I https://[ton-projet].supabase.co/storage/v1/object/public/instagram-media/[user-id]/[image.jpg]
```

**Résultat attendu:**
```
HTTP/2 200
content-type: image/jpeg
```

**Résultat d'erreur:**
```
HTTP/2 403
# ou
HTTP/2 404
```

---

## Vérifications Supplémentaires

### Vérifier toutes les policies du bucket

```sql
-- Lister toutes les policies sur storage.objects
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'objects'
  AND schemaname = 'storage';
```

**Attention:** Si tu vois des policies avec `WITH CHECK` ou `USING` qui mentionnent `auth.uid()`, elles **bloquent l'accès public**.

### Supprimer les policies restrictives

```sql
-- Supprimer TOUTES les policies qui bloquent l'accès public
DROP POLICY IF EXISTS "Authenticated users can upload to instagram-media" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
```

### Créer des policies correctes

```sql
-- LECTURE PUBLIQUE (requis pour Instagram API)
CREATE POLICY "Public read instagram-media"
ON storage.objects FOR SELECT
USING ( bucket_id = 'instagram-media' );

-- UPLOAD réservé aux utilisateurs authentifiés
CREATE POLICY "Authenticated upload instagram-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'instagram-media' );

-- UPDATE/DELETE réservé au propriétaire
CREATE POLICY "Owner update instagram-media"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'instagram-media' AND auth.uid()::text = (storage.foldername(name))[1] );

CREATE POLICY "Owner delete instagram-media"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'instagram-media' AND auth.uid()::text = (storage.foldername(name))[1] );
```

---

## Test Final dans Keiro

1. Va sur ton app: `https://[ton-app].vercel.app/library`
2. Sélectionne une image
3. Clique sur **"Publier sur Instagram"**
4. Prépare une description et hashtags
5. Clique sur **"Post"**

**Résultat attendu:**
- ✅ "Post publié avec succès sur Instagram !"
- ✅ Post visible sur ton compte Instagram Business

**Si erreur persiste:**
- Vérifie dans les **Runtime Logs** de Vercel
- Cherche `[publishImageToInstagram]` pour voir l'erreur exacte de Meta API
- Copie l'erreur et contacte le support

---

## Checklist de Vérification

Avant de republier, vérifie:
- [ ] Bucket `instagram-media` est **public** dans Supabase Storage
- [ ] Policy `"Public read instagram-media"` existe (SELECT sur storage.objects)
- [ ] URL image accessible dans navigateur privé (pas de 403/404)
- [ ] Test curl retourne HTTP 200
- [ ] Compte Instagram Business connecté dans Keiro
- [ ] Token Instagram non expiré

---

## Pourquoi ça arrive ?

Par défaut, Supabase crée les buckets **privés** pour la sécurité. Mais pour Instagram/TikTok publication:
- Meta API doit **télécharger l'image** depuis l'URL
- Si l'URL retourne 403 Forbidden, Meta ne peut pas créer le media container
- → Erreur "Media ID is not available"

**Solution:** Bucket public + policy de lecture publique, mais upload/delete restreint aux utilisateurs authentifiés.

---

## Support

Si le problème persiste après avoir suivi ce guide:
1. Copie le message d'erreur complet depuis Vercel Runtime Logs
2. Fais un screenshot de Supabase Storage (montrant que le bucket est public)
3. Contacte le support via la page Tarif ou [contact@keiroai.com](mailto:contact@keiroai.com)

---

**Dernière mise à jour:** 2026-01-28
