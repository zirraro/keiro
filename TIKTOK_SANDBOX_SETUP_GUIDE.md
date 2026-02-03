# 🎯 Guide Complet - Configuration TikTok Sandbox

**Objectif**: Résoudre les erreurs de publication ET synchronisation TikTok en mode Sandbox

---

## ❌ Problèmes Actuels

1. **Publication échoue**: `"Please review our integration guidelines"`
2. **Sync vidéos échoue**: `"Failed to fetch videos TikTok"`

**Cause racine**: Configuration Sandbox TikTok incomplète

---

## ✅ SOLUTION COMPLÈTE (30 minutes)

### ÉTAPE 1: Activer les Scopes dans Developer Dashboard

**🔗 URL**: [TikTok Developer Portal](https://developers.tiktok.com/)

1. **Aller dans "Manage Apps"**
2. **Sélectionner votre app Keiro**
3. **Cliquer sur l'onglet "Scopes & Permissions"** (ou "API Products")

4. **Activer les scopes suivants** (cocher les cases):
   ```
   ✅ user.info.basic       - Infos utilisateur (username, avatar)
   ✅ video.list            - Lire la liste des vidéos (REQUIS pour sync)
   ✅ video.upload          - Uploader des fichiers vidéo
   ✅ video.publish         - Publier des vidéos (Direct Post)
   ```

5. **Cliquer "Save" ou "Apply Changes"**

⚠️ **CRITIQUE**: Si ces scopes ne sont pas activés, **MÊME reconnecté**, l'utilisateur ne recevra pas les permissions.

---

### ÉTAPE 2: Basculer en Mode Sandbox

**Dans le même Developer Dashboard:**

1. **En haut de la page**, à côté du nom de votre app
2. **Cliquer sur le toggle "Sandbox"** (si pas déjà activé)
3. **Créer un Sandbox** (si demandé):
   - Name: `Keiro Sandbox Test`
   - Clone from: `Production` (ou créer vide)
   - Cliquer **Confirm**

---

### ÉTAPE 3: Ajouter Target Users (Comptes Test)

**Dans Sandbox Settings:**

1. **Aller dans "Sandbox Settings"** (dans le menu latéral)
2. **Section "Target Users"**
3. **Cliquer "Add account"**

4. **Se connecter avec votre compte TikTok de test**:
   - **IMPORTANT**: Ce compte DOIT être celui que vous utilisez dans Keiro
   - Username TikTok: `___________` (noter ici)
   - Email TikTok: `___________` (noter ici)

5. **Accepter les TikTok Developer Terms of Service**

6. **Vérifier que le compte apparaît** dans la liste "Target Users"

⚠️ **Limite Sandbox**: Maximum **10 comptes** autorisés

---

### ÉTAPE 4: Vérifier la Configuration des Scopes

**Toujours dans Developer Dashboard:**

1. **Onglet "Scopes & Permissions"**
2. **Vérifier l'état de chaque scope**:

   ```
   Scope                 Status           Sandbox    Production
   ─────────────────────────────────────────────────────────────
   user.info.basic       ✅ Approved      ✅ Yes      ✅ Yes
   video.list            ⚠️ Pending       ✅ Yes      ❌ No
   video.upload          ⚠️ Pending       ✅ Yes      ❌ No
   video.publish         ⚠️ Pending       ✅ Yes      ❌ No
   ```

**Statuts possibles**:
- ✅ **Approved**: Scope actif (production)
- ⚠️ **Pending**: En attente d'audit (fonctionne en sandbox)
- ❌ **Not Requested**: Scope non demandé (à activer)

**En mode Sandbox**: Tous les scopes activés fonctionnent MÊME s'ils sont "Pending"

---

### ÉTAPE 5: Reconnecter le Compte TikTok dans Keiro

**Maintenant que TikTok est configuré, reconnectez votre compte:**

1. **Aller sur votre app Keiro** (en dev ou prod)
2. **Aller dans Profil / Paramètres**
3. **Section "Connexions Réseaux Sociaux"**
4. **TikTok**: Cliquer **"Déconnecter"**

5. **Reconnectez-vous**:
   - Cliquer **"Connecter TikTok"**
   - Se connecter avec le MÊME compte ajouté aux "Target Users"
   - **Autoriser TOUS les scopes** dans la popup TikTok:
     ```
     ✅ Accéder à vos informations de profil
     ✅ Voir vos vidéos
     ✅ Uploader des vidéos
     ✅ Publier des vidéos
     ```

6. **Vérifier la connexion réussie**:
   - Username TikTok devrait s'afficher
   - Badge "Connecté" visible

---

### ÉTAPE 6: Tester la Synchronisation

**Test 1: Sync vidéos existantes**

1. **Dans Keiro, aller sur Library**
2. **Widget TikTok** (en haut de page)
3. **Cliquer "🔄 Synchroniser mes posts TikTok"**

**Résultat attendu**:
```
✅ Synchronisation réussie
✅ X vidéos récupérées
```

**Si erreur persiste**: Vérifier dans les logs du navigateur (F12 → Console):
```javascript
[TikTok] Failed to fetch videos: SCOPE_ERROR
```
→ Retourner à l'Étape 1 (scopes pas activés)

---

### ÉTAPE 7: Tester la Publication

**Test 2: Publier une vidéo**

1. **Uploader une vidéo .mov** (ou utiliser une existante)
2. **Cliquer "Publier sur TikTok"**
3. **Remplir description + hashtags**
4. **Cliquer "Publier vidéo"**

**Résultat attendu**:
```
✅ Vidéo publiée avec succès sur TikTok!
✅ Publication réussie
💬 Les interactions vont commencer
```

**Si erreur persiste**: Vérifier que:
- [ ] Compte dans "Target users" ✅
- [ ] Pas dépassé 5 posts / 24h (limite sandbox)
- [ ] Vidéo au bon format (CloudConvert ✅)

---

## 📊 Récapitulatif Configuration

### Scopes Requis (à activer dans Dashboard)

| Scope | Utilité | Sandbox | Prod |
|-------|---------|---------|------|
| `user.info.basic` | Username, avatar | ✅ | ✅ |
| `video.list` | **Sync vidéos** | ✅ | Audit |
| `video.upload` | Upload fichier | ✅ | Audit |
| `video.publish` | **Publier** | ✅ | Audit |

### Limitations Sandbox vs Production

| Critère | Sandbox | Production (post-audit) |
|---------|---------|------------------------|
| Comptes autorisés | 10 max (Target users) | ∞ |
| Posts/jour | 5 total | ∞ |
| Visibilité posts | `SELF_ONLY` uniquement | Publique possible |
| Fetch vidéos | ✅ (si scope activé) | ✅ |
| Upload vidéos | ✅ (si scope activé) | ✅ |
| Publish vidéos | ✅ (privé uniquement) | ✅ (public) |

---

## 🔧 Troubleshooting

### Erreur: "Failed to fetch videos"

**Causes possibles**:
1. ❌ Scope `video.list` pas activé dans Dashboard
2. ❌ Compte pas dans "Target users"
3. ❌ Token expiré → Reconnecter

**Solution**:
→ Vérifier Étape 1 (activer scope) + Étape 3 (target users) + Étape 5 (reconnecter)

---

### Erreur: "Please review integration guidelines"

**Causes possibles**:
1. ❌ Compte pas dans "Target users" Sandbox
2. ❌ Dépassé 5 posts / 24h (limite sandbox)
3. ❌ Scope `video.publish` pas activé

**Solution**:
→ Vérifier Étape 3 (target users) + attendre 24h si limite dépassée

---

### Erreur: "Insufficient permissions"

**Cause**:
❌ L'utilisateur a autorisé l'app AVANT que les scopes soient activés dans le Dashboard

**Solution**:
1. Activer TOUS les scopes (Étape 1)
2. **Révoquer l'accès** dans TikTok Settings:
   - [TikTok Settings](https://www.tiktok.com/setting/privacy-and-safety/data)
   - Section "Manage apps and websites"
   - Trouver "Keiro" → Cliquer "Remove access"
3. Reconnecter dans Keiro (Étape 5)

---

## 📋 Checklist Finale

Avant de tester, vérifier que:

**TikTok Developer Dashboard**:
- [ ] Mode Sandbox activé
- [ ] Scopes activés: `user.info.basic`, `video.list`, `video.upload`, `video.publish`
- [ ] Compte test ajouté aux "Target users"
- [ ] Sandbox configuré avec les bons scopes

**Keiro App**:
- [ ] Compte TikTok déconnecté puis reconnecté
- [ ] Tous les scopes autorisés lors de l'OAuth
- [ ] Username TikTok affiché dans Keiro

**Tests**:
- [ ] Sync vidéos fonctionne (widget TikTok)
- [ ] Publication vidéo fonctionne (mode SELF_ONLY)
- [ ] CloudConvert conversion OK (format 9:16, audio)

---

## 🚀 Passage en Production (Optionnel)

Une fois les tests réussis en Sandbox:

### 1. Préparer Documentation Audit

**Documents requis**:
- ✅ Vidéo démo workflow (3 min max)
- ✅ Explication use case (AI content creation)
- ✅ Preuve conformité TikTok (format, audio, guidelines)
- ✅ Politique confidentialité + Terms of Service

### 2. Soumettre pour Review

**Process**:
1. Developer Dashboard → "Submit for Review"
2. Section "Content Posting API - Direct Post"
3. Upload documentation
4. Attendre 1-2 semaines

### 3. Post-Approbation

**Changements après approbation**:
- ✅ Posts publics autorisés (changer `SELF_ONLY` → `PUBLIC_TO_EVERYONE`)
- ✅ Pas de limite comptes/posts
- ✅ Accès production API

---

## 📞 Support

**Si problème persiste après configuration**:

1. **Vérifier les logs navigateur** (F12 → Console):
   - Chercher `[TikTok]` ou `[TikTokSync]`
   - Noter le message d'erreur exact

2. **Vérifier côté serveur** (Vercel logs):
   - Chercher `[TikTokPublish]` ou `SCOPE_ERROR`
   - Noter l'erreur TikTok API

3. **Ressources TikTok**:
   - [Sandbox Documentation](https://developers.tiktok.com/doc/add-a-sandbox/)
   - [Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started)
   - [Scopes Reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)

---

**Date**: 2026-02-03
**Version**: 1.0
**Status**: Configuration Sandbox complète
