# 🚨 IMAGES NOIRES - SOLUTION DÉFINITIVE

## Problème
Les images Instagram s'affichent en **noir** dans le widget car le bucket Supabase Storage n'est **PAS PUBLIC**.

## ✅ Solution en 2 étapes (2 minutes max)

### ÉTAPE 1 : Rendre le bucket PUBLIC dans Supabase

**Méthode A - Via Dashboard (RECOMMANDÉ):**
1. Va sur https://supabase.com/dashboard
2. Sélectionne ton projet "Keiro"
3. Clique sur **"Storage"** (menu gauche)
4. Trouve le bucket **"instagram-media"**
5. Clique sur l'icône **⚙️ Settings** à droite du nom
6. **COCHE "Public bucket"**
7. Clique **"Save"**

**Méthode B - Via SQL (plus rapide):**
1. Va sur https://supabase.com/dashboard
2. Sélectionne ton projet "Keiro"
3. Clique sur **"SQL Editor"** (menu gauche)
4. Copie-colle ce SQL :

```sql
-- Rendre le bucket PUBLIC
UPDATE storage.buckets
SET public = true
WHERE name = 'instagram-media';

-- Supprimer l'ancienne policy si elle existe
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- Créer la policy d'accès public
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'instagram-media' );
```

5. Clique **"RUN"**

### ÉTAPE 2 : Vider le cache navigateur

**Chrome/Edge:**
1. Appuie sur `Ctrl + Shift + R` (Windows) ou `Cmd + Shift + R` (Mac)
2. Ou ouvre DevTools (F12) → Clique droit sur ⟳ → "Empty Cache and Hard Reload"

**Firefox:**
1. Appuie sur `Ctrl + F5` (Windows) ou `Cmd + Shift + R` (Mac)

## 🎯 Vérification

Une fois fait :
1. Recharge ton app Keiro
2. Attends 5 secondes (sync automatique)
3. Les images Instagram devraient s'afficher ✅

## 🔍 Debugging

**Si les images sont TOUJOURS noires :**

1. **Vérifie le bucket est public :**
   - Va dans Supabase → Storage → "instagram-media"
   - Tu dois voir un badge **"Public"** à côté du nom

2. **Teste l'URL directement :**
   - Ouvre DevTools (F12) → Console
   - Regarde les erreurs réseau
   - Clique droit sur une image noire → "Ouvrir l'image dans un nouvel onglet"
   - Si tu vois une erreur 403 → Le bucket n'est toujours pas public
   - Si l'image s'affiche → C'est juste un problème de cache

3. **Vérifie que les images existent dans Storage :**
   - Va dans Supabase → Storage → "instagram-media"
   - Clique sur ton `user_id` (dossier)
   - Tu devrais voir des fichiers `.jpg` avec des noms comme `18070854790915903.jpg`

4. **Re-synchronise les posts Instagram :**
   - Ouvre DevTools (F12) → Console
   - Tape : `fetch('/api/instagram/sync-media', { method: 'POST', credentials: 'include' }).then(r => r.json()).then(console.log)`
   - Appuie sur Enter
   - Attends 10 secondes
   - Recharge la page

## 📊 Pourquoi ça arrive ?

Supabase Storage créé les buckets en **PRIVÉ par défaut**. Pour que les images s'affichent dans le navigateur, le bucket DOIT être public.

Le code de Keiro télécharge bien les images depuis Instagram et les stocke dans Supabase, mais si le bucket est privé, le navigateur ne peut pas les afficher.

## ⚡ Une fois pour toutes

Une fois que tu as rendu le bucket public, tu n'auras **PLUS JAMAIS** ce problème. Toutes les futures images s'afficheront automatiquement.
