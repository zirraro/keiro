# 🔍 DIAGNOSTIC COMPLET - IMAGES NOIRES

## Étape 1 : Vérifier que le bucket est PUBLIC

1. **Va sur Supabase Dashboard**
   - https://supabase.com/dashboard
   - Sélectionne ton projet Keiro
   - Clique sur **"Storage"** (menu gauche)

2. **Vérifie le bucket "instagram-media"**
   - Tu DOIS voir un badge **"Public"** à côté du nom du bucket
   - **SI TU NE VOIS PAS "Public"** :
     - Clique sur l'icône ⚙️ à droite du nom du bucket
     - **COCHE "Public bucket"**
     - Clique **"Save"**

3. **Screenshot demandé**
   - Fais une capture d'écran de la page Storage avec le bucket visible
   - Envoie-la moi pour que je confirme

---

## Étape 2 : Tester une URL directement

1. **Va dans Storage → instagram-media**
2. **Clique sur un fichier (par exemple un .jpg)**
3. **Copie l'URL publique** (devrait ressembler à: `https://[project].supabase.co/storage/v1/object/public/instagram-media/...`)
4. **Ouvre cette URL dans un nouvel onglet**

**RÉSULTAT:**
- ✅ **Image s'affiche** = Bucket est public, problème ailleurs
- ❌ **Erreur 403 ou JSON d'erreur** = Bucket PAS public

---

## Étape 3 : Console navigateur

1. **Sur ton app Keiro, ouvre la console (F12)**
2. **Onglet "Console"** - envoie-moi TOUS les logs qui commencent par `[InstagramWidget]`
3. **Onglet "Network"**:
   - Recharge la page
   - Filtre par "Img"
   - Regarde les images qui échouent
   - Clique sur une image rouge
   - Envoie-moi le **Status Code** (200, 403, 404?)

---

## Étape 4 : Re-synchroniser APRÈS avoir rendu public

Une fois que tu as **CONFIRMÉ** que le bucket est public:

1. **Ouvre la console navigateur (F12)**
2. **Copie-colle ce code et appuie sur Enter:**

```javascript
fetch('/api/instagram/sync-media', {
  method: 'POST',
  credentials: 'include'
})
.then(r => r.json())
.then(data => {
  console.log('Sync result:', data);
  alert(`Synchronisation terminée! ${data.cached} images sur ${data.total} posts.`);
  setTimeout(() => location.reload(), 2000);
})
.catch(err => {
  console.error('Sync error:', err);
  alert('Erreur: ' + err.message);
});
```

3. **Attends que ça dise "Synchronisation terminée!"**
4. **La page va se recharger automatiquement**
5. **Les images DOIVENT maintenant s'afficher**

---

## 🚨 SI LES IMAGES SONT TOUJOURS NOIRES

**Envoie-moi ces informations:**

1. Screenshot de la page Storage Supabase avec le bucket visible (montre si "Public" ou pas)
2. Tous les logs `[InstagramWidget]` de la console
3. Screenshot de l'onglet Network montrant le statut des requêtes d'images
4. Une URL d'image que tu as testé manuellement + ce qui s'est affiché

Avec ces infos, je trouverai la solution définitive! 🎯
