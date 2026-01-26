# ✅ INSTRUCTIONS FINALES - FIX INSTAGRAM DÉFINITIF

## 🎯 Ce qui a été fait

✅ **SQL complet** créé pour tout réinitialiser proprement
✅ **Taille des posts augmentée** (3 cols mobile, 6 cols desktop)
✅ **Bucket forcé en PUBLIC** dans le SQL
✅ **Table instagram_posts** recréée avec bonnes colonnes
✅ **Tout committé et poussé** vers GitHub

---

## 📋 CE QUE TU DOIS FAIRE MAINTENANT (5 minutes max)

### ÉTAPE 1 : Exécuter le SQL dans Supabase

1. **Ouvre Supabase Dashboard**
   - Va sur https://supabase.com/dashboard
   - Sélectionne ton projet "Keiro"
   - Clique sur **"SQL Editor"** (menu gauche)

2. **Copie TOUT le contenu** du fichier `RESET_INSTAGRAM_COMPLET.sql`
   - Le fichier est dans ton repo GitHub: `RESET_INSTAGRAM_COMPLET.sql`
   - OU copie directement depuis ci-dessous ⬇️

3. **Colle dans SQL Editor** et clique **"RUN"** (ou Ctrl+Enter)

4. **Vérifie le résultat:**
   - Tu devrais voir: "Success. No rows returned"
   - Si erreur, envoie-moi le message d'erreur EXACT

---

### ÉTAPE 2 : Recharger ton app Keiro

1. **Va sur ton app Keiro** (keiroai.com)
2. **Ouvre la console navigateur** (F12)
3. **Recharge la page** (Ctrl+R)
4. **Attends 5 secondes** (sync automatique)
5. **Les images Instagram devraient apparaître** ✅

---

## 🔍 Vérification

**Si les images sont TOUJOURS noires:**

1. Ouvre la console navigateur (F12) → onglet "Console"
2. Regarde les logs `[InstagramWidget]`
3. Envoie-moi les logs complets

**Si la table n'existe pas:**

1. Va dans Supabase → "Table Editor"
2. Vérifie que `instagram_posts` existe
3. Si elle n'existe pas, exécute à nouveau le SQL

**Si le bucket n'est pas public:**

1. Va dans Supabase → "Storage"
2. Clique sur `instagram-media`
3. Vérifie qu'il y a un badge **"Public"** à côté du nom
4. Si pas public, clique sur ⚙️ Settings → Coche "Public bucket" → Save

---

## 📊 Nouveautés

✅ **Posts Instagram plus grands** (3x2 mobile, 6x1 desktop)
✅ **Design plus propre** avec gaps et coins arrondis
✅ **6 posts affichés** au lieu de 8
✅ **Bucket PUBLIC** garanti par le SQL

---

## 🆘 En cas de problème

**Si ça ne fonctionne TOUJOURS pas:**

1. Copie les logs de la console navigateur (F12)
2. Envoie-moi une capture d'écran de la page
3. Dis-moi le message d'erreur exact du SQL (si erreur)

Je trouverai la solution définitive! 🚀
