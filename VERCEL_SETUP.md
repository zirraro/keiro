# Configuration Vercel - Variables d'environnement

## Ajouter OPENAI_API_KEY dans Vercel

### Étapes à suivre:

1. **Aller sur Vercel Dashboard**
   - Ouvrez https://vercel.com/dashboard
   - Sélectionnez votre projet **keiro**

2. **Accéder aux Settings**
   - Cliquez sur l'onglet **Settings** (en haut)
   - Dans le menu de gauche, cliquez sur **Environment Variables**

3. **Ajouter la variable OPENAI_API_KEY**
   - Cliquez sur le bouton **Add New**
   - Remplissez les champs:

   ```
   Name: OPENAI_API_KEY
   Value: [VOTRE CLÉ API OPENAI - commençant par sk-proj-...]
   ```

   ⚠️ **Remplacez par votre vraie clé API OpenAI** (je vous l'ai envoyée séparément)

   - **IMPORTANT**: Cochez les 3 environnements:
     - ✅ **Production**
     - ✅ **Preview**
     - ✅ **Development**

4. **Cliquer sur Save**

5. **Redéployer l'application** (optionnel mais recommandé)
   - Allez dans l'onglet **Deployments**
   - Cliquez sur les **3 petits points** du dernier déploiement
   - Cliquez sur **Redeploy**
   - Confirmez

---

## Vérification

### Comment vérifier que ça fonctionne:

1. Attendez **1-2 minutes** après le redéploiement
2. Allez sur votre site Keiro
3. Ouvrez **Console DevTools** (F12)
4. Allez sur `/library` → "Mes vidéos"
5. Cliquez sur "Publier sur TikTok" sur une vidéo
6. Écrivez une description
7. Cliquez sur **"🎙️ Générer narration audio"**
8. Si ça fonctionne, vous verrez:
   - Le script condensé dans le textarea
   - Un lecteur audio avec la narration
   - Aucune erreur dans la console

### Si vous voyez une erreur:

- `OPENAI_API_KEY not configured` → La clé n'est pas chargée
  - **Solution**: Vérifiez que vous avez bien coché "Production" dans Vercel
  - Attendez 1-2 minutes et réessayez

- `Invalid API key` → La clé est incorrecte
  - **Solution**: Vérifiez que vous avez copié la clé complète

- `Quota exceeded` → Vous avez dépassé le quota OpenAI
  - **Solution**: Ajoutez des crédits à votre compte OpenAI

---

## Coûts estimés

### Par vidéo TikTok avec narration:
- **GPT-4o-mini** (condensation texte): ~$0.001
- **OpenAI TTS** (génération audio 5s): ~$0.015
- **Total**: ~$0.02 par vidéo

### Exemple de consommation:
- 10 vidéos/jour = $0.20/jour = $6/mois
- 50 vidéos/jour = $1/jour = $30/mois

---

## Sécurité

⚠️ **NE JAMAIS** commiter la clé API dans Git ou la partager publiquement!

✅ Toujours utiliser les variables d'environnement Vercel

---

**Date**: 2026-02-02
