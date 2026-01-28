# Configuration des Brouillons Instagram

## Problème résolu

Les brouillons Instagram ne fonctionnaient pas car :
- ❌ L'ancienne API `/api/library/instagram` était désactivée
- ❌ Aucune table pour stocker les brouillons séparément
- ❌ Suppression/modification impossible
- ❌ Affichage cassé des brouillons

## Solution implémentée

✅ **Nouvelle table `instagram_drafts`** - Stockage dédié aux brouillons
✅ **API `/api/library/instagram-drafts`** - CRUD complet fonctionnel
✅ **Modal d'erreur avec support** - Lien Calendly pour aide immédiate
✅ **Messages d'erreur clairs** - Détails techniques copiables

---

## 🚀 Étape 1 : Appliquer la migration SQL

### Option A : Via l'interface Supabase (Recommandée)

1. Allez sur [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet Keiro
3. Cliquez sur **SQL Editor** dans le menu latéral
4. Cliquez sur **+ New query**
5. Copiez-collez le contenu du fichier :
   ```
   supabase/migrations/20260128_instagram_drafts_table.sql
   ```
6. Cliquez sur **Run** (bouton en bas à droite)
7. Vérifiez le succès : ✅ "Success. No rows returned"

### Option B : Via Supabase CLI

```bash
# Connectez-vous à Supabase
npx supabase login

# Liez votre projet (remplacez PROJECT_REF par votre référence projet)
npx supabase link --project-ref YOUR_PROJECT_REF

# Appliquez la migration
npx supabase db push
```

---

## 🧪 Étape 2 : Tester les brouillons

1. Allez sur votre app déployée : `https://votre-app.vercel.app/library`
2. Sélectionnez une image
3. Cliquez sur "Préparer post Instagram"
4. Ajoutez une description et des hashtags
5. Cliquez sur "Brouillon" pour sauvegarder

**Résultat attendu :**
- ✅ Le brouillon apparaît dans l'onglet "Brouillons Instagram"
- ✅ Vous pouvez modifier le brouillon
- ✅ Vous pouvez supprimer le brouillon
- ✅ Plus d'erreur "Media ID not available"

---

## 📋 Étape 3 : Vérifier la table dans Supabase

1. Allez dans **Table Editor** sur Supabase
2. Cherchez la table `instagram_drafts`
3. Vérifiez les colonnes :
   - ✅ `id` (UUID)
   - ✅ `user_id` (UUID)
   - ✅ `saved_image_id` (UUID)
   - ✅ `image_url` (TEXT)
   - ✅ `caption` (TEXT)
   - ✅ `hashtags` (TEXT[])
   - ✅ `status` (TEXT)
   - ✅ `created_at`, `updated_at`, `scheduled_for` (TIMESTAMPTZ)

4. Vérifiez les **RLS Policies** :
   - ✅ Users can view own instagram drafts
   - ✅ Users can insert own instagram drafts
   - ✅ Users can update own instagram drafts
   - ✅ Users can delete own instagram drafts

---

## 🆘 Gestion des erreurs avec support

Quand une erreur se produit lors de la publication Instagram :

1. **Un modal s'affiche** avec :
   - 🔴 Message d'erreur clair pour l'utilisateur
   - 📋 Détails techniques (copiables)
   - 📞 Bouton "Contacter le support" → Ouvre Calendly

2. **Erreurs avec redirection support automatique** :
   - `Media ID not available` → Problème Meta API
   - `Token expiré` → Reconnexion Instagram requise
   - `Image invalide` → Format ou accessibilité problème
   - `Permissions insuffisantes` → Scopes Instagram manquants

3. **L'utilisateur peut** :
   - Copier l'erreur technique en 1 clic
   - Booker un appel support gratuit (15 min)
   - Partager l'erreur lors de l'appel

---

## 🔧 Dépannage

### La migration échoue

**Erreur : `relation "instagram_drafts" already exists`**
```sql
-- Supprimez l'ancienne table (sauvegardez les données si nécessaire)
DROP TABLE IF EXISTS public.instagram_drafts CASCADE;

-- Réexécutez la migration
```

**Erreur : `function uuid_generate_v4() does not exist`**
```sql
-- Activez l'extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Réexécutez la migration
```

### Les brouillons ne s'affichent pas

1. **Vérifiez la console navigateur** (F12) pour les erreurs API
2. **Vérifiez les RLS Policies** :
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'instagram_drafts';
   ```
3. **Vérifiez que l'utilisateur est authentifié** :
   ```sql
   SELECT auth.uid(); -- Doit retourner un UUID
   ```

### L'erreur "Media ID not available" persiste

Cette erreur vient de l'API Meta Graph. Le modal d'erreur donne maintenant les instructions pour :
- Contacter le support Keiro (Calendly)
- Copier les détails techniques
- Vérifier la connexion Instagram

**Causes fréquentes :**
- Image non accessible publiquement (URL privée)
- Token Instagram expiré (reconnectez Instagram)
- Format image non supporté (utilisez JPG/PNG)
- Rate limiting Instagram (trop de publications récentes)

---

## 📊 Données de migration

**Ancienne structure** (désactivée) :
- ❌ `/api/library/instagram` (GET/POST/PATCH/DELETE) → Tous désactivés
- ❌ Table `instagram_posts` utilisée pour brouillons → Maintenant réservée aux vrais posts Instagram

**Nouvelle structure** (active) :
- ✅ `/api/library/instagram-drafts` (GET/POST/PATCH/DELETE) → Tous fonctionnels
- ✅ Table `instagram_drafts` dédiée aux brouillons
- ✅ Table `instagram_posts` réservée aux posts synchronisés depuis Instagram

---

## ✅ Checklist de déploiement

- [ ] Migration SQL appliquée sur Supabase
- [ ] Table `instagram_drafts` visible dans Table Editor
- [ ] 4 RLS Policies actives
- [ ] Code déployé sur Vercel
- [ ] Test création brouillon → Succès
- [ ] Test modification brouillon → Succès
- [ ] Test suppression brouillon → Succès
- [ ] Test publication avec erreur → Modal s'affiche
- [ ] Lien Calendly fonctionne dans le modal d'erreur

---

## 📞 Support

Si vous rencontrez des problèmes avec cette migration :

**Option 1 : Calendly (Recommandé)**
- URL : https://calendly.com/contact-keiroai/30min
- Appel gratuit de 15-30 minutes
- Partagez les détails techniques copiés

**Option 2 : Documentation**
- Vérifiez `INSTAGRAM_DRAFTS_SETUP.md` (ce fichier)
- Consultez les logs Vercel pour les erreurs serveur
- Vérifiez les logs Supabase pour les erreurs RLS

---

**Dernière mise à jour :** 2026-01-28
