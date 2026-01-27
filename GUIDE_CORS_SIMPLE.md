# 🔐 Qu'est-ce que CORS et comment le configurer ?

## 🤔 C'est quoi CORS ?

**CORS** = **C**ross-**O**rigin **R**esource **S**haring (Partage de ressources entre origines)

### Explication simple :

Imagine que ton site web est une **maison** et les images Supabase sont dans un **magasin**.

- ❌ **Sans CORS** : Le magasin (Supabase) refuse de te donner les images car tu n'as pas la permission
- ✅ **Avec CORS** : Le magasin dit "OK, ce site web peut accéder à mes images"

**En gros :** CORS c'est une **permission** que tu dois donner à ton site web pour qu'il puisse charger les images depuis Supabase.

---

## ⚠️ Pourquoi tu as ce problème ?

Quand tu essayes de charger une image Instagram depuis Supabase Storage dans ton widget, le navigateur vérifie :

1. **D'où vient la demande ?** → Ton site (ex: `localhost:3002` ou `keiro.app`)
2. **Est-ce que Supabase autorise cette origine ?** → Si non configuré = ❌ BLOQUÉ

Résultat : **Images noires** 🖤

---

## ✅ Comment configurer CORS sur Supabase ?

### Option 1 : Via le Dashboard (RECOMMANDÉ - le plus facile)

#### Étape 1 : Va sur Supabase Dashboard
1. Ouvre [https://app.supabase.com](https://app.supabase.com)
2. Sélectionne ton projet Keiro
3. Dans le menu de gauche, clique sur **Storage** 📦

#### Étape 2 : Configure le bucket `instagram-media`
1. Clique sur le bucket **`instagram-media`**
2. En haut à droite, clique sur le bouton **Settings** (icône engrenage ⚙️)
3. Tu vas voir une section **CORS Configuration**

#### Étape 3 : Remplis les champs CORS
Copie-colle exactement ces valeurs :

```
Allowed Origins:
*

Allowed Methods:
GET, HEAD, OPTIONS

Allowed Headers:
*

Exposed Headers:
Content-Length, Content-Type

Max Age:
3600
```

#### Étape 4 : Sauvegarde
Clique sur **Save** en bas

#### Étape 5 : Répète pour TikTok
Fais exactement la même chose pour le bucket **`tiktok-media`**

---

### Option 2 : Via le SQL (si Option 1 ne marche pas)

**Note :** Le SQL créé les buckets et les permissions, MAIS tu dois quand même faire la config CORS via le Dashboard (Option 1).

1. Lance le fichier **SUPABASE_STORAGE_CORS_CONFIG.sql** dans Supabase SQL Editor
2. Puis suis l'Option 1 pour configurer CORS

---

## 🧪 Comment tester si CORS est configuré ?

### Test 1 : Vérifier dans le Dashboard
1. Va sur [Supabase Dashboard](https://app.supabase.com) → Storage → `instagram-media`
2. Clique sur Settings ⚙️
3. Tu devrais voir les valeurs CORS que tu as configurées

### Test 2 : Vérifier dans ton app
1. Va sur `/library` dans ton app
2. Ouvre la console du navigateur (F12)
3. Regarde les logs :
   - ✅ `[InstagramWidget] ✅ Image loaded` → CORS OK !
   - ❌ `[InstagramWidget] ❌ Image failed` → CORS encore bloqué

### Test 3 : Vérifier directement l'URL
1. Va sur [Supabase Dashboard](https://app.supabase.com) → Storage → `instagram-media`
2. Clique sur une image
3. Copie l'URL publique (ex: `https://ABC.supabase.co/storage/v1/object/public/instagram-media/...`)
4. Ouvre cette URL dans un nouvel onglet
5. Si l'image s'affiche → Bucket public OK, vérifie CORS
6. Si erreur 403/404 → Bucket pas public, relance le SQL

---

## 🔄 Workflow complet (du début à la fin)

```
1. Lance FIX_INSTAGRAM_CACHE.sql dans Supabase SQL Editor
   ↓
   (Tu verras si tu as des posts sans cache)
   ↓
2. Si posts sans cache → Lance sync Instagram (/library → bouton Sync)
   ↓
3. Lance SUPABASE_STORAGE_CORS_CONFIG.sql dans Supabase SQL Editor
   ↓
4. Configure CORS via Dashboard (Option 1 ci-dessus)
   ↓
5. Recharge /library dans ton app
   ↓
6. ✅ Images Instagram devraient s'afficher !
```

---

## 🚨 Problèmes courants

### Problème 1 : Images toujours noires après config CORS
**Solutions :**
1. Vide le cache du navigateur (Ctrl+Shift+R ou Cmd+Shift+R)
2. Ouvre la console (F12) → Cherche les erreurs
3. Vérifie que le bucket est **public** (dans Dashboard Storage)
4. Relance la sync Instagram

### Problème 2 : Erreur "Access to fetch blocked by CORS policy"
**Solution :**
Tu n'as pas configuré CORS correctement. Suis l'Option 1 exactement comme indiqué.

### Problème 3 : Bucket `instagram-media` n'existe pas
**Solution :**
Lance **SUPABASE_STORAGE_CORS_CONFIG.sql** d'abord pour créer le bucket.

---

## 📝 Résumé ultra-simple

**En 3 étapes :**

1. **Crée les buckets** → Lance `SUPABASE_STORAGE_CORS_CONFIG.sql`
2. **Configure CORS** → Va sur Supabase Dashboard → Storage → Settings → Met `*` partout
3. **Teste** → Va sur `/library` et regarde si les images s'affichent

**Si ça marche pas :**
- Vide le cache
- Vérifie que les URLs sont dans `cached_media_url` (lance DIAGNOSTIC_IMAGES_INSTAGRAM.sql)
- Regarde la console navigateur pour les erreurs

---

## ❓ Questions fréquentes

### Pourquoi mettre `*` dans Allowed Origins ?
`*` = "Autorise TOUS les sites". C'est OK pour un bucket **public** (images Instagram visibles par tout le monde).

Si tu veux être plus strict :
```
Allowed Origins:
http://localhost:3002, https://keiro.app, https://www.keiro.app
```

### C'est dangereux de mettre `*` ?
Non, tant que le bucket contient seulement des images publiques (pas de données sensibles).

### Je dois faire ça pour chaque bucket ?
Oui, configure CORS pour :
- `instagram-media` (images Instagram)
- `tiktok-media` (vidéos TikTok)

---

## 🎉 Félicitations !

Une fois CORS configuré, tu n'auras plus jamais à le refaire. Les images Instagram s'afficheront toujours ! 🚀
