# Configuration API Claude pour Suggestions Instagram

## 📋 Prérequis

Une clé API Claude (Anthropic) est requise pour la fonctionnalité "Suggérer avec IA" dans le modal Instagram.

## 🔑 Obtenir votre clé API Claude

1. Visitez [console.anthropic.com](https://console.anthropic.com/)
2. Connectez-vous ou créez un compte
3. Allez dans "API Keys"
4. Créez une nouvelle clé API
5. Copiez la clé (elle commence par `sk-ant-api...`)

## ⚙️ Configuration Locale (Développement)

Éditez le fichier `.env.local` à la racine du projet :

```bash
ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici
```

Redémarrez le serveur de développement :
```bash
npm run dev
```

## 🚀 Configuration Production (Vercel)

### Option 1 : Via le Dashboard Vercel

1. Allez sur [vercel.com](https://vercel.com/)
2. Sélectionnez votre projet **keiro**
3. Cliquez sur **Settings** (⚙️)
4. Dans le menu latéral, cliquez sur **Environment Variables**
5. Ajoutez une nouvelle variable :
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-api03-votre-cle-ici`
   - **Environment:** Sélectionnez `Production`, `Preview`, et `Development`
6. Cliquez sur **Save**
7. Redéployez votre application :
   - Allez dans **Deployments**
   - Cliquez sur les 3 points `...` du dernier déploiement
   - Sélectionnez **Redeploy**

### Option 2 : Via la CLI Vercel

```bash
cd Documents/GitHub/keiro
vercel env add ANTHROPIC_API_KEY
# Entrez votre clé API quand demandé
# Sélectionnez Production, Preview, Development

# Redéployer
vercel --prod
```

### Option 3 : Via Git (Automatique)

Après avoir ajouté la variable d'environnement dans le dashboard Vercel,
tout nouveau push sur `main` utilisera automatiquement la clé :

```bash
git push origin main
```

## ✅ Vérification

### En local
1. Ouvrez votre app : http://localhost:3000
2. Allez dans **Galerie** → Cliquez sur une image → **Préparer post Instagram**
3. Cliquez sur **✨ Suggérer avec IA**
4. Si configuré correctement, vous verrez une description et des hashtags générés

### En production
1. Ouvrez votre app déployée : https://keiro.vercel.app
2. Connectez-vous
3. Allez dans **Galerie** → Cliquez sur une image → **Préparer post Instagram**
4. Cliquez sur **✨ Suggérer avec IA**
5. Si configuré correctement, vous verrez une description et des hashtags générés

## ❌ Erreurs Courantes

### "Could not resolve authentication method. Expected either apiKey or authToken to be set"

**Cause :** La variable `ANTHROPIC_API_KEY` n'est pas configurée ou est vide.

**Solution :**
1. Vérifiez que la variable existe dans Vercel Environment Variables
2. Vérifiez que la valeur n'est pas vide
3. Redéployez après avoir ajouté la variable

### "Invalid API Key"

**Cause :** La clé API est incorrecte ou expirée.

**Solution :**
1. Vérifiez que la clé commence par `sk-ant-api`
2. Créez une nouvelle clé dans la console Anthropic
3. Remplacez la valeur dans Vercel

### La suggestion ne marche qu'en local, pas en production

**Cause :** La variable d'environnement n'est pas configurée pour Production.

**Solution :**
1. Dans Vercel → Settings → Environment Variables
2. Vérifiez que `ANTHROPIC_API_KEY` a bien **Production** coché
3. Redéployez l'application

## 💰 Coûts

L'API Claude utilise un modèle payant à l'usage :
- **Modèle utilisé :** `claude-3-5-sonnet-20241022`
- **Tokens par requête :** ~500-800 tokens
- **Coût estimé :** ~$0.003 par suggestion (moins d'un centime)

### Limites recommandées
Pour éviter les surprises, configurez des limites dans la console Anthropic :
1. Console Anthropic → Settings → Usage Limits
2. Définissez un budget mensuel (ex: $10/mois = ~3000 suggestions)

## 🔐 Sécurité

⚠️ **IMPORTANT :**
- Ne commitez JAMAIS votre clé API dans Git
- Le fichier `.env.local` est déjà dans `.gitignore`
- Utilisez uniquement les variables d'environnement Vercel pour la production
- Régénérez votre clé si elle a été exposée accidentellement

## 📞 Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs Vercel : Dashboard → votre projet → Logs
2. Vérifiez les logs de la console navigateur (F12 → Console)
3. Contactez le support Anthropic : support@anthropic.com
