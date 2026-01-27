# 🔍 Diagnostic Rapide - Images Instagram Noires

## Cause probable
La table `instagram_posts` existe mais **aucune donnée n'a été synchronisée depuis Instagram**.

## ✅ Solution en 2 étapes (2 minutes)

### Étape 1 : Exécuter RESET_INSTAGRAM_COMPLET.sql dans Supabase
1. Va sur **Supabase Dashboard** → **SQL Editor**
2. Copie TOUT le contenu de `RESET_INSTAGRAM_COMPLET.sql`
3. Colle et clique **RUN**
4. Vérifie : "Success. No rows returned"

### Étape 2 : Synchroniser tes posts Instagram
1. Va sur **keiroai.com/library**
2. Ouvre la console navigateur (F12)
3. Exécute ce code :

```javascript
fetch('/api/instagram/sync-media', {
  method: 'POST',
  credentials: 'include'
})
.then(r => r.json())
.then(data => {
  console.log('✅ Sync result:', data);
  alert(`${data.cached} images synchronisées sur ${data.total} posts`);
  setTimeout(() => location.reload(), 2000);
})
.catch(err => {
  console.error('❌ Error:', err);
  alert('Erreur: ' + err.message);
});
```

4. Attends le message de succès
5. La page se recharge automatiquement
6. **Les images devraient maintenant s'afficher** ✅

---

## 🔍 Si ça ne marche toujours pas

**Vérifie dans la console (F12) :**
1. Onglet **Console** : Cherche les logs `[InstagramWidget]`
2. Onglet **Network** : Filtre "Img" → regarde les statuts HTTP

**Envoie-moi :**
- Screenshot de la console avec les erreurs
- Le résultat du fetch `/api/instagram/sync-media`
- Une URL d'image qui s'affiche en noir

---

## 📌 Pourquoi les images étaient noires ?
- ❌ **Avant** : Widget cherchait `post.cachedUrl` (n'existe pas)
- ✅ **Maintenant** : Widget cherche `post.cached_media_url` (correct)
- ⚠️ **Mais** : La table est vide → il faut **synchroniser** pour télécharger les images depuis Instagram

---

**Note :** Une fois que tu as connecté Instagram, la synchronisation devrait être **automatique** au chargement de la page library. Si les images sont noires, c'est probablement que le sync n'a pas encore eu lieu ou a échoué silencieusement.
