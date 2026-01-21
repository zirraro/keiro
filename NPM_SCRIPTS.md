# Scripts NPM pour l'Optimisation des Mots-clés

## 🚀 Utilisation rapide avec npm

Des scripts npm ont été ajoutés à `package.json` pour simplifier l'utilisation.

### Scripts disponibles

```bash
# 1. Tester la connexion à l'API Claude
npm run keywords:test

# 2. Générer les mots-clés (étape 1)
npm run keywords:generate

# 3. Mettre à jour newsProviders.ts (étape 2)
npm run keywords:update

# 4. Tout faire automatiquement (recommandé)
npm run keywords:optimize

# 5. Lister les fichiers créés
npm run keywords:list
```

## 📋 Workflow complet

### Première utilisation

1. **Installer les dépendances** (si pas déjà fait):
   ```bash
   npm install
   ```

2. **Configurer la clé API**:

   Option A - Variable d'environnement:
   ```bash
   # Windows CMD
   set ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici

   # Windows PowerShell
   $env:ANTHROPIC_API_KEY="sk-ant-api03-votre-cle-ici"

   # Linux/Mac
   export ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici
   ```

   Option B - Fichier .env (recommandé):
   ```bash
   # Installer dotenv si pas déjà fait
   npm install dotenv --save-dev

   # Créer le fichier .env
   cp .env.example .env

   # Éditer .env et ajouter votre clé
   ```

3. **Tester la connexion**:
   ```bash
   npm run keywords:test
   ```

   Résultat attendu:
   ```
   ✅ SUCCÈS! Réponse de Claude: "OK"
   🎉 La connexion à l'API fonctionne parfaitement!
   ```

4. **Lancer l'optimisation**:
   ```bash
   npm run keywords:optimize
   ```

   Ce script va:
   - ✅ Générer les mots-clés via Claude API
   - ✅ Créer `generated_keywords.json`
   - ✅ Mettre à jour `lib/newsProviders.ts`
   - ✅ Afficher un résumé

### Utilisation avancée (étapes manuelles)

Si vous voulez plus de contrôle sur le processus:

```bash
# Étape 1: Générer les mots-clés
npm run keywords:generate

# Étape 2: Vérifier le JSON généré (optionnel)
cat generated_keywords.json

# Étape 3: Mettre à jour le fichier TypeScript
npm run keywords:update
```

## 🔍 Vérification

Après l'optimisation, vérifiez que tout fonctionne:

```bash
# Lister les fichiers créés
npm run keywords:list

# Lancer votre application
npm run dev
```

Vérifiez dans votre application:
- ✅ La catégorie "Musique" existe et contient des articles
- ✅ La catégorie "Automobile" contient beaucoup plus d'articles
- ✅ La catégorisation est plus précise

## 📊 Détails des scripts

### `npm run keywords:test`
- **Fichier**: `test_api_connection.js`
- **Fonction**: Teste la connexion à l'API Claude
- **Durée**: ~2 secondes
- **Coût**: ~0.0001 USD (quasi gratuit)

### `npm run keywords:generate`
- **Fichier**: `generate_keywords.js`
- **Fonction**: Génère les mots-clés via Claude API (Haiku)
- **Sortie**: Crée `generated_keywords.json`
- **Durée**: ~5-10 secondes
- **Coût**: ~0.001-0.01 USD (~1 centime)

### `npm run keywords:update`
- **Fichier**: `update_keywords.js`
- **Fonction**: Met à jour `lib/newsProviders.ts` avec les nouveaux mots-clés
- **Durée**: ~1 seconde
- **Coût**: Gratuit (local)

### `npm run keywords:optimize`
- **Fichier**: `run_keyword_optimization.js`
- **Fonction**: Exécute `keywords:generate` puis `keywords:update`
- **Durée**: ~6-11 secondes
- **Coût**: ~0.001-0.01 USD (~1 centime)

### `npm run keywords:list`
- **Fichier**: `list_created_files.js`
- **Fonction**: Liste tous les fichiers créés avec leur taille
- **Durée**: <1 seconde
- **Coût**: Gratuit (local)

## 💡 Astuces

### Utiliser un alias plus court

Ajoutez ceci à votre `~/.bashrc` ou `~/.zshrc` (Linux/Mac):
```bash
alias kw-test='npm run keywords:test'
alias kw-gen='npm run keywords:generate'
alias kw-update='npm run keywords:update'
alias kw-optimize='npm run keywords:optimize'
```

Puis utilisez simplement:
```bash
kw-test      # Au lieu de npm run keywords:test
kw-optimize  # Au lieu de npm run keywords:optimize
```

### Automatiser avec un hook Git

Vous pouvez ajouter un hook Git pour régénérer les mots-clés automatiquement:

Créez `.git/hooks/pre-commit`:
```bash
#!/bin/bash
# Régénérer les mots-clés avant chaque commit
npm run keywords:optimize
```

Rendez-le exécutable:
```bash
chmod +x .git/hooks/pre-commit
```

### Planifier une régénération automatique

**Windows (Task Scheduler)**:
1. Ouvrez le Planificateur de tâches
2. Créez une tâche quotidienne
3. Action: `npm run keywords:optimize`
4. Dossier: `C:\Users\vcgle\Documents\GitHub\keiro`

**Linux/Mac (cron)**:
```bash
# Éditer crontab
crontab -e

# Ajouter (régénération tous les lundis à 9h)
0 9 * * 1 cd /path/to/keiro && npm run keywords:optimize
```

## 🆘 Dépannage

### ❌ "npm: command not found"
→ Node.js n'est pas installé. Téléchargez-le sur https://nodejs.org/

### ❌ "Cannot find module"
→ Installez les dépendances: `npm install`

### ❌ "ANTHROPIC_API_KEY not found"
→ Vérifiez que vous avez défini la variable (voir étape 2)

### ❌ Script npm ne fonctionne pas
→ Vérifiez que vous êtes dans le bon dossier:
```bash
cd C:\Users\vcgle\Documents\GitHub\keiro
npm run keywords:optimize
```

## 📚 Documentation complète

- **Guide rapide**: `QUICK_START.md`
- **Documentation complète**: `KEYWORD_OPTIMIZATION_README.md`
- **Instructions d'installation**: `INSTALLATION_COMPLETE.txt`

## ✅ Checklist

Avant de lancer l'optimisation:
- [ ] Node.js installé (`node --version`)
- [ ] Dépendances installées (`npm install`)
- [ ] Clé API configurée (`npm run keywords:test` réussit)
- [ ] Dans le bon dossier (`pwd` ou `cd`)

Après l'optimisation:
- [ ] Fichier `generated_keywords.json` créé
- [ ] Fichier `lib/newsProviders.ts` modifié
- [ ] Application fonctionne (`npm run dev`)
- [ ] Catégorie "Musique" visible
- [ ] Catégorie "Automobile" enrichie

---

**💡 Conseil**: Utilisez `npm run keywords:optimize` pour tout faire en une seule commande!
