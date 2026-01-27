# 🔐 Images Instagram noires : LA VRAIE SOLUTION (2026)

## ⚠️ IMPORTANT : Il n'y a PAS de config CORS à faire !

**Les anciens guides sur CORS sont OBSOLÈTES.**

Dans Supabase moderne (2026), **la CORS est automatique** si tu utilises :
- ✅ `@supabase/supabase-js` (client officiel)
- ✅ Next.js avec Supabase
- ✅ Appels via le client Supabase

👉 **Tu n'as RIEN à configurer dans l'UI** (il n'y a plus de champ "CORS Configuration")

---

## 🎯 Pourquoi tes images Instagram sont noires ?

### 3 vraies raisons possibles :

### 1. Le cache n'existe pas (99% des cas) ❌

**Symptôme :** Le widget Instagram est vide ou montre des icônes Instagram roses

**Cause :** Tu n'as jamais synchronisé tes posts Instagram → la colonne `cached_media_url` est vide

**Solution :**
1. Lance **[FIX_INSTAGRAM_CACHE.sql](FIX_INSTAGRAM_CACHE.sql)** pour diagnostiquer
2. Si `posts_sans_cache` > 0 → Lance la sync Instagram :
   - Va sur `/library`
   - Dans le widget Instagram, clique "Synchroniser"
   - Attends 10-30 secondes

### 2. Le bucket n'est pas public 🔒

**Symptôme :** Erreur 403 dans la console (F12 → Network)

**Cause :** Le bucket Supabase Storage `instagram-media` n'est pas public

**Solution :**
```sql
-- Lance ce SQL dans Supabase SQL Editor
UPDATE storage.buckets
SET public = true
WHERE name IN ('instagram-media', 'tiktok-media');
```

OU via l'UI :
1. Va sur [Supabase Dashboard](https://app.supabase.com) → Storage
2. Clique sur `instagram-media`
3. Clique sur l'icône ⚙️ en haut
4. Active **"Public bucket"**
5. Sauvegarde

### 3. Problème dans le code (rare) 🐛

**Symptôme :** Console montre `[InstagramWidget] ❌ Image failed`

**Cause :** Bug dans le code frontend

**Solution :** Vérifie dans la console (F12) :
- Les URLs chargées
- Les erreurs réseau
- Les logs `[InstagramWidget]`

---

## 🚀 Workflow complet (du début à la fin)

```bash
# 1. Diagnostic : Lance ce SQL
FIX_INSTAGRAM_CACHE.sql

# 2. Si posts_sans_cache > 0 → Sync Instagram
/library → Widget Instagram → "Synchroniser"

# 3. Si bucket pas public → Lance ce SQL
UPDATE storage.buckets SET public = true WHERE name = 'instagram-media';

# 4. Recharge /library
Ctrl+Shift+R (vider le cache)

# 5. ✅ Vérifie console
Cherche "[InstagramWidget] ✅ Image loaded"
```

---

## 🧠 Et si j'ai VRAIMENT besoin de configurer CORS ?

**Dans 99% des cas : TU N'EN AS PAS BESOIN.**

Mais si tu fais des appels `fetch()` direct vers Supabase Storage (sans passer par le client), tu peux configurer CORS via la **CLI Supabase** (pas l'UI) :

### Étape 1 : Installer la CLI
```bash
npm install -g supabase
```

### Étape 2 : Login
```bash
supabase login
```

### Étape 3 : Lier ton projet
```bash
supabase link --project-ref TON_PROJECT_REF
```

(Trouve `TON_PROJECT_REF` dans Settings → General → Project URL)

### Étape 4 : Configurer CORS
```bash
supabase projects api update \
  --cors-allowed-origins "http://localhost:3002,https://ton-domaine.com"
```

**Mais encore une fois : tu n'en as probablement PAS besoin.**

---

## 🔍 Comment savoir si c'est un vrai problème CORS ?

Ouvre la console (F12) et cherche :

### ❌ CORS bloqué (rare)
```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```
→ Tu as besoin de configurer CORS via CLI (voir ci-dessus)

### ✅ Pas de CORS (99% des cas)
```
[InstagramWidget] ❌ Image failed: 17abcd123456 from cache
```
→ Le problème n'est PAS CORS, c'est :
- Bucket pas public
- URL manquante (pas de sync)
- Autre bug code

---

## 🧪 Tests rapides

### Test 1 : Vérifier le cache
```sql
-- Lance dans Supabase SQL Editor
SELECT
  COUNT(*) FILTER (WHERE cached_media_url IS NOT NULL) as avec_cache,
  COUNT(*) FILTER (WHERE cached_media_url IS NULL) as sans_cache
FROM instagram_posts;
```

**Attendu :** `avec_cache` > 0

### Test 2 : Vérifier que le bucket est public
```sql
-- Lance dans Supabase SQL Editor
SELECT name, public FROM storage.buckets WHERE name = 'instagram-media';
```

**Attendu :** `public` = `true`

### Test 3 : Tester une URL directement
1. Va sur [Supabase Dashboard](https://app.supabase.com) → Storage → `instagram-media`
2. Clique sur une image
3. Copie l'URL publique
4. Colle l'URL dans un nouvel onglet
5. **Attendu :** L'image s'affiche
6. **Si erreur 403 :** Le bucket n'est pas public → Lance le SQL de l'étape 2 ci-dessus

---

## 📋 Checklist finale

- [ ] J'ai lancé **FIX_INSTAGRAM_CACHE.sql** pour vérifier le cache
- [ ] Si `posts_sans_cache` > 0 → J'ai lancé la sync Instagram
- [ ] J'ai vérifié que le bucket `instagram-media` est **public**
- [ ] J'ai vidé le cache du navigateur (Ctrl+Shift+R)
- [ ] J'ai regardé la console (F12) pour les erreurs
- [ ] **Images Instagram s'affichent correctement** ✅

---

## ❓ FAQ

### Pourquoi les anciens tutos parlent de CORS dans l'UI ?
Parce qu'ils datent d'avant 2024. Supabase a supprimé la config CORS de l'UI et l'a rendue automatique.

### Je vois toujours des images noires
1. Vérifie la console (F12)
2. Lance **FIX_INSTAGRAM_CACHE.sql**
3. Vérifie que le bucket est public
4. Vide le cache navigateur

### J'ai une erreur "Access to fetch blocked by CORS"
C'est rare avec Supabase moderne. Si ça arrive :
1. Vérifie que tu utilises le client Supabase (`supabaseBrowser()`)
2. Ne fais PAS de `fetch()` direct vers les URLs Storage
3. Si vraiment nécessaire → Configure CORS via CLI (voir section ci-dessus)

### Comment savoir si mon bucket est public ?
Lance ce SQL :
```sql
SELECT name, public FROM storage.buckets WHERE name = 'instagram-media';
```

Si `public` = `false` :
```sql
UPDATE storage.buckets SET public = true WHERE name = 'instagram-media';
```

---

## 🎉 En résumé

1. **Pas de CORS à configurer** (c'est automatique avec Supabase moderne)
2. **Vrai problème = cache manquant ou bucket pas public**
3. **Solution = Sync Instagram + rendre bucket public**
4. **Si vraiment CORS needed → CLI uniquement**

Voilà la VRAIE solution 2026 ! 🚀
