# 🚀 Guide de déploiement sur Vercel

## 📋 Prérequis

1. Compte Vercel (gratuit)
2. Compte GitHub avec votre repo Keiro
3. Compte Supabase avec projet configuré
4. Clé API Anthropic (Claude)

---

## 1️⃣ Configuration Supabase

### A. Créer le bucket Storage

1. Aller dans **Supabase Dashboard** → **Storage**
2. Cliquer sur **New bucket**
3. Nom: `instagram-media`
4. **Public bucket**: ✅ OUI
5. **File size limit**: 10 MB
6. Cliquer sur **Create bucket**

### B. Appliquer les migrations SQL

Dans **Supabase Dashboard** → **SQL Editor**, exécuter les 3 migrations SQL dans l'ordre :

**Migration 1 - Cache Instagram** (voir fichier SQL ci-dessus)
**Migration 2 - Assistant Marketing** (voir fichier SQL ci-dessus)
**Migration 3 - Rate Limiting** (voir fichier SQL ci-dessus)

Cliquer sur **Run** après chaque migration.

---

## 2️⃣ Variables d'environnement

### Variables nécessaires :

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_anon_key
SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# Instagram/Facebook
NEXT_PUBLIC_FACEBOOK_APP_ID=votre_app_id
FACEBOOK_APP_SECRET=votre_app_secret

# URL du site (sera remplie automatiquement par Vercel)
NEXT_PUBLIC_SITE_URL=https://votre-app.vercel.app

# Autres (si vous les avez)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

---

## 3️⃣ Déploiement sur Vercel

### Étape 1 : Push sur GitHub

```bash
# Dans votre projet local
git add .
git commit -m "Préparation déploiement Vercel"
git push origin main
```

### Étape 2 : Importer dans Vercel

1. Aller sur [vercel.com](https://vercel.com)
2. Cliquer sur **Add New Project**
3. Importer votre repo GitHub `keiro`
4. **Framework Preset**: Next.js (détecté automatiquement)
5. **Root Directory**: `./` (laisser par défaut)
6. Cliquer sur **Environment Variables**

### Étape 3 : Ajouter les variables d'environnement

Pour chaque variable ci-dessus :
1. Cliquer sur **Add**
2. Nom: `NEXT_PUBLIC_SUPABASE_URL`
3. Value: `https://votre-projet.supabase.co`
4. Environments: ✅ Production, ✅ Preview, ✅ Development

**IMPORTANT** : Copier-coller toutes les variables depuis votre fichier `.env.local`

### Étape 4 : Déployer

1. Cliquer sur **Deploy**
2. Attendre 2-3 minutes
3. Votre app sera disponible sur `https://votre-app.vercel.app`

---

## 4️⃣ Configuration post-déploiement

### A. Mettre à jour les URLs Instagram OAuth

1. Aller sur [developers.facebook.com](https://developers.facebook.com)
2. Sélectionner votre app Instagram
3. **Instagram Basic Display** → **Client OAuth Settings**
4. Ajouter dans **Valid OAuth Redirect URIs** :
   ```
   https://votre-app.vercel.app/api/auth/instagram-callback
   ```
5. Sauvegarder

### B. Mettre à jour Supabase Auth

1. **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. **Site URL**: `https://votre-app.vercel.app`
3. **Redirect URLs** (ajouter) :
   ```
   https://votre-app.vercel.app/auth/callback
   https://votre-app.vercel.app/api/auth/*
   ```
4. Sauvegarder

---

## 5️⃣ Vérifications

### Checklist après déploiement :

- [ ] Le site se charge correctement
- [ ] Connexion/Inscription fonctionne
- [ ] Génération d'images fonctionne
- [ ] Studio édition fonctionne
- [ ] Widget Instagram affiche des images (pas noir)
- [ ] Modal Instagram avec galerie fonctionne
- [ ] Assistant Marketing répond (vérifier limite 50 msg/mois)
- [ ] Connexion Instagram OAuth fonctionne

---

## 6️⃣ Commandes utiles

### Redéployer après modifications :

```bash
git add .
git commit -m "Fix: ..."
git push origin main
# Vercel redéploiera automatiquement
```

### Voir les logs en temps réel :

1. Vercel Dashboard → Votre projet
2. **Deployments** → Dernier déploiement
3. **Functions** → Cliquer sur une fonction
4. Voir les logs Claude, Supabase, etc.

---

## 💡 Conseils d'optimisation

### A. Caching agressif

Vercel met déjà en cache :
- Pages statiques
- Images optimisées
- Fonts

### B. Monitoring des coûts

**Claude Haiku (50 msg/mois par utilisateur) :**
- Coût par utilisateur : ~0.10€/mois
- 100 utilisateurs : ~10€/mois
- **Marge : 90€ si vous vendez 10€/mois**

**Supabase (plan gratuit) :**
- 500 MB database
- 1 GB file storage
- 2 GB bandwidth/mois
- **Passez à Pro (25$/mois) si >1000 users**

### C. Alertes de budget

1. **Anthropic Console** → **Usage** → **Set budget alerts**
2. Alerte à 50€/mois
3. Recevoir email si dépassement

---

## 🆘 Problèmes courants

### Images Instagram noires

**Cause** : Bucket `instagram-media` pas public

**Solution** :
1. Supabase → Storage → `instagram-media`
2. **Settings** → **Public bucket** : ✅
3. Redéployer

### Assistant ne répond pas

**Cause** : `ANTHROPIC_API_KEY` manquante ou invalide

**Solution** :
1. Vérifier la clé sur [console.anthropic.com](https://console.anthropic.com)
2. Vercel → Settings → Environment Variables
3. Ajouter/Mettre à jour `ANTHROPIC_API_KEY`
4. Redéployer

### Limite messages atteinte immédiatement

**Cause** : Table `assistant_usage_limits` pas créée

**Solution** :
1. Supabase → SQL Editor
2. Exécuter Migration 3 (Rate Limiting)
3. Vérifier table existe

---

## 📊 Monitoring production

### Logs Vercel
```
Vercel Dashboard → Functions → Runtime Logs
```

### Logs Supabase
```
Supabase Dashboard → Logs → Postgres Logs
```

### Usage Claude
```
console.anthropic.com → Usage
```

---

## ✅ C'est prêt !

Votre application est maintenant en production sur Vercel 🎉

**Prochaines étapes** :
1. Tester toutes les fonctionnalités
2. Inviter des beta-testeurs
3. Monitorer les coûts la première semaine
4. Ajuster les limites si nécessaire
