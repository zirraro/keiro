# 🔧 Guide de dépannage - Images Instagram

## 📋 Problème

Les images Instagram s'affichent en **noir** dans l'aperçu du widget Instagram.

## 🎯 Solutions appliquées

### 1. Fix code (✅ Déjà fait)

- **Suppression de `crossOrigin="anonymous"`** dans `InstagramWidget.tsx`
  - Ce paramètre causait des erreurs CORS → canvas "tainted" → images noires
- **Ajout de transitions d'opacité** pour un chargement fluide
- **Amélioration des logs** pour diagnostiquer les problèmes

### 2. Configuration base de données (📝 À faire)

Tu as **3 fichiers SQL** à ta disposition :

---

## 📁 Fichiers SQL disponibles

### 1️⃣ `DIAGNOSTIC_IMAGES_INSTAGRAM.sql` ⚠️ COMMENCE PAR CELUI-CI

**Objectif :** Vérifier si les images Instagram ont des URLs cachées dans Supabase Storage.

**Utilisation :**
1. Va sur [Supabase Dashboard](https://app.supabase.com) → SQL Editor
2. Copie-colle **tout le contenu** du fichier
3. Exécute la requête

**Résultats attendus :**
```sql
-- Si tu vois :
posts_avec_cache: 10
posts_sans_cache: 0
```
✅ **Cache OK** → Les images devraient s'afficher maintenant

```sql
-- Si tu vois :
posts_avec_cache: 0
posts_sans_cache: 10
```
❌ **Cache manquant** → Passe à l'étape 2 (FIX_INSTAGRAM_CACHE.sql)

---

### 2️⃣ `FIX_INSTAGRAM_CACHE.sql` ⚙️ SI CACHE MANQUANT

**Objectif :** Diagnostiquer les URLs manquantes et lancer la synchronisation.

**Utilisation :**
1. Va sur [Supabase Dashboard](https://app.supabase.com) → SQL Editor
2. Copie-colle **tout le contenu** du fichier
3. Exécute la requête

**Important :** Ce fichier te dira de lancer la **synchronisation Instagram**.

**Comment lancer la sync :**

**Option A - Via le frontend (recommandé) :**
1. Va sur `/library` dans ton app
2. Dans le widget Instagram, clique sur le bouton **"Synchroniser"** ou **"Rafraîchir"**
3. Attends 10-30 secondes
4. Recharge la page

**Option B - Via curl (si pas de bouton UI) :**
```bash
curl -X POST http://localhost:3002/api/instagram/sync-media \
  -H "Content-Type: application/json" \
  -H "Cookie: TON_COOKIE_SESSION"
```

**Option C - Via la console navigateur :**
1. Va sur `/library`
2. Ouvre la console (F12)
3. Exécute :
```javascript
fetch('/api/instagram/sync-media', { method: 'POST' })
  .then(r => r.json())
  .then(console.log)
```

**Après la sync :** Relance `DIAGNOSTIC_IMAGES_INSTAGRAM.sql` pour vérifier que le cache est OK.

---

### 3️⃣ `SUPABASE_STORAGE_CORS_CONFIG.sql` 📦 Créer les buckets Storage

**Objectif :** Créer les buckets Supabase Storage avec les bonnes permissions.

**Utilisation :**
1. Va sur [Supabase Dashboard](https://app.supabase.com) → SQL Editor
2. Copie-colle **tout le contenu** du fichier
3. Exécute la requête

**Ce que ça fait :**
- Crée les buckets `instagram-media` et `tiktok-media` s'ils n'existent pas
- Configure les buckets en **public**
- Ajoute les **policies RLS** pour lire/écrire les fichiers

**⚠️ IMPORTANT : CORS est automatique (2026) !**

Tu n'as **PAS besoin** de configurer CORS manuellement. Supabase moderne gère la CORS automatiquement si tu utilises le client officiel (`@supabase/supabase-js`).

👉 **Il n'y a PLUS de champ "CORS Configuration" dans l'UI Supabase**

📖 Voir [GUIDE_CORS_SIMPLE.md](GUIDE_CORS_SIMPLE.md) pour comprendre pourquoi

---

## 🔄 Workflow complet de dépannage

```
1. Lance DIAGNOSTIC_IMAGES_INSTAGRAM.sql
   ↓
   Cache manquant ?
   ↓ OUI
2. Lance FIX_INSTAGRAM_CACHE.sql
   ↓
   Suis les instructions pour lancer sync Instagram
   ↓
3. Relance DIAGNOSTIC_IMAGES_INSTAGRAM.sql
   ↓
   Cache OK mais images toujours noires ?
   ↓ OUI
4. Lance SUPABASE_STORAGE_CORS_CONFIG.sql
   ↓
   Vérifie que les buckets sont "public = true"
   ↓
5. Vide le cache navigateur (Ctrl+Shift+R)
   ↓
6. ✅ Images Instagram devraient s'afficher !

(Pas besoin de config CORS - c'est automatique !)
```

---

## 🐛 Dépannage avancé

### Les images sont toujours noires après tout ça ?

**Vérifications supplémentaires :**

1. **Console navigateur (F12) :**
   - Cherche les logs `[InstagramWidget]`
   - Si tu vois `❌ Image failed` → problème de chargement
   - Si tu vois `✅ Image loaded` → image OK (peut-être un problème CSS)

2. **Réseau (F12 → Network) :**
   - Filtre par "Img"
   - Cherche les requêtes vers Supabase Storage
   - Si status = 403 → problème de permissions (relance SUPABASE_STORAGE_CORS_CONFIG.sql)
   - Si status = 404 → fichier manquant (relance sync Instagram)

3. **Supabase Storage :**
   - Va sur [Supabase Dashboard](https://app.supabase.com) → Storage → `instagram-media`
   - Vérifie que tu vois des fichiers (images)
   - Clique sur une image → copie l'URL publique
   - Ouvre l'URL dans un nouvel onglet
   - Si l'image s'affiche → configuration OK, problème dans le code frontend
   - Si erreur 403/404 → problème de configuration Storage

4. **Variables d'environnement :**
   - Vérifie que `NEXT_PUBLIC_SUPABASE_URL` est correcte dans `.env.local`
   - Vérifie que `NEXT_PUBLIC_SUPABASE_ANON_KEY` est correcte

---

## ✅ Checklist finale

- [ ] Fix code appliqué (`crossOrigin` supprimé)
- [ ] Diagnostic SQL lancé (DIAGNOSTIC_IMAGES_INSTAGRAM.sql)
- [ ] Sync Instagram lancée (si cache manquant)
- [ ] Buckets Storage créés (SUPABASE_STORAGE_CORS_CONFIG.sql)
- [ ] Buckets configurés en "public" ✅
- [ ] Cache vérifié (devrait être 100%)
- [ ] Cache navigateur vidé (Ctrl+Shift+R)
- [ ] Images Instagram s'affichent correctement dans `/library` ✅

**Note :** Pas besoin de config CORS - c'est automatique ! 🎉

---

## 📞 Si rien ne marche

**Dernière option :** Partage ces informations :
1. Résultat de `DIAGNOSTIC_IMAGES_INSTAGRAM.sql`
2. Screenshots de la console navigateur (F12)
3. Screenshots de Supabase Storage (liste des fichiers dans `instagram-media`)
4. URL publique d'une image depuis Supabase Storage

---

## 🎉 Bonus : Monitoring

Pour surveiller la santé du cache Instagram :

```sql
-- À lancer régulièrement (1x par semaine)
SELECT
  COUNT(*) FILTER (WHERE cached_media_url IS NOT NULL) as posts_cached,
  COUNT(*) FILTER (WHERE cached_media_url IS NULL) as posts_missing,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cached_media_url IS NOT NULL) / COUNT(*), 1) as cache_percentage
FROM instagram_posts;
```

**Objectif :** `cache_percentage` = 100%

Si ça descend en dessous de 95%, relance la sync Instagram.
