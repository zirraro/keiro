# 🚀 Optimisation des Mots-clés - START HERE

> **Système complet d'optimisation automatique des mots-clés de catégorisation d'actualités françaises via l'API Claude**

---

## ⚡ Démarrage Ultra-Rapide (2 minutes)

```bash
# 1. Installer les dépendances
npm install

# 2. Définir votre clé API (Windows CMD)
set ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici

# 3. Tester la connexion
npm run keywords:test

# 4. Optimiser les mots-clés
npm run keywords:optimize
```

**C'est tout!** Votre fichier `lib/newsProviders.ts` est maintenant optimisé.

---

## 📁 Structure des Fichiers

```
keiro/
│
├── 📖 START_HERE.md                    ← Vous êtes ici!
├── 📋 INSTALLATION_COMPLETE.txt        ← Guide d'installation complet
├── 🚀 QUICK_START.md                   ← Guide de démarrage rapide
├── 📚 KEYWORD_OPTIMIZATION_README.md   ← Documentation complète
├── 💻 NPM_SCRIPTS.md                   ← Guide des scripts npm
│
├── 🤖 generate_keywords.js             ← Génération via Claude API
├── ✏️  update_keywords.js               ← Mise à jour du TypeScript
├── 🎯 run_keyword_optimization.js      ← Script principal (tout auto)
├── 🔍 test_api_connection.js           ← Test de connexion API
├── 📝 list_created_files.js            ← Liste les fichiers créés
│
├── 🪟 optimize.bat                     ← Lanceur Windows (double-clic)
├── 🐧 optimize.sh                      ← Lanceur Linux/Mac
│
├── ⚙️  .env.example                     ← Configuration (mise à jour)
└── 📦 package.json                     ← Scripts npm ajoutés
```

---

## 🎯 Ce qui sera modifié

### Avant (exemple):
```javascript
'Automobile': ['auto', 'voiture', 'tesla', 'renault', ...] // ~18 mots-clés
'People': ['célébrité', 'star', 'acteur', ...]            // ~50 mots-clés
// Pas de catégorie "Musique"
```

### Après:
```javascript
'Automobile': ['automobile', 'auto', 'voiture', 'tesla', 'renault', 'peugeot',
               'électrique', 'hybride', 'batterie', 'byd', 'nio', ...]  // 50-100 mots-clés!

'Musique': ['musique', 'concert', 'album', 'single', 'festival', 'spotify',
            'aya nakamura', 'taylor swift', 'beyoncé', ...]  // NOUVELLE catégorie!

'People': ['people', 'célébrité', 'star', 'mbappé', 'squeezie', 'léna situations',
           'paparazzi', 'koh-lanta', ...]  // Enrichie!

// + 14 autres catégories enrichies (Tech, Finance, Sport, Culture...)
```

---

## 🛠️ Méthodes d'utilisation

### Méthode 1: Scripts NPM (Recommandé)

```bash
npm run keywords:test      # Tester la connexion
npm run keywords:optimize  # Tout optimiser (1 commande!)
```

### Méthode 2: Scripts de lancement

**Windows:**
```cmd
optimize.bat
```

**Linux/Mac:**
```bash
chmod +x optimize.sh
./optimize.sh
```

### Méthode 3: Node.js direct

```bash
node test_api_connection.js       # Test
node run_keyword_optimization.js  # Optimisation
```

---

## 📚 Documentation

| Fichier | Description | Quand l'utiliser |
|---------|-------------|------------------|
| `START_HERE.md` | Vue d'ensemble | Première lecture |
| `INSTALLATION_COMPLETE.txt` | Installation détaillée | Configuration initiale |
| `QUICK_START.md` | Démarrage rapide | Utilisation quotidienne |
| `NPM_SCRIPTS.md` | Scripts npm | Utilisation avec npm |
| `KEYWORD_OPTIMIZATION_README.md` | Doc complète | Référence technique |

---

## 🎓 Tutoriel Complet

### Étape 1: Prérequis

Vérifiez que vous avez:
- ✅ Node.js installé (`node --version`)
- ✅ npm fonctionnel (`npm --version`)
- ✅ Un compte Anthropic (https://console.anthropic.com/)
- ✅ Une clé API Claude

### Étape 2: Installation

```bash
# Dans le dossier keiro
cd C:\Users\vcgle\Documents\GitHub\keiro

# Installer les dépendances
npm install

# Vérifier que @anthropic-ai/sdk est installé
npm list @anthropic-ai/sdk
```

### Étape 3: Configuration de la clé API

**Option A - Variable d'environnement (temporaire):**

Windows CMD:
```cmd
set ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici
```

Windows PowerShell:
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-api03-votre-cle-ici"
```

Linux/Mac:
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici
```

**Option B - Fichier .env (permanent, recommandé):**

```bash
# Créer le fichier .env
cp .env.example .env

# Éditer .env et ajouter:
# ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici

# Installer dotenv (si pas déjà fait)
npm install dotenv --save-dev
```

### Étape 4: Test

```bash
npm run keywords:test
```

Vous devriez voir:
```
✅ SUCCÈS! Réponse de Claude: "OK"
🎉 La connexion à l'API fonctionne parfaitement!
```

### Étape 5: Optimisation

```bash
npm run keywords:optimize
```

Cela va:
1. Appeler Claude API (Haiku) pour générer les mots-clés
2. Créer `generated_keywords.json`
3. Mettre à jour `lib/newsProviders.ts` automatiquement
4. Afficher un résumé

### Étape 6: Vérification

```bash
# Lancer votre application
npm run dev

# Ouvrez http://localhost:3002
# Vérifiez que:
# - La catégorie "Musique" existe
# - La catégorie "Automobile" a plus d'articles
```

---

## 💰 Coût

- **Modèle**: Claude 3 Haiku (le moins cher d'Anthropic)
- **Coût par optimisation**: ~0.001-0.01 USD (~1 centime)
- **Tokens utilisés**: ~3000-5000 input + ~6000-8000 output

---

## 🆘 Problèmes Courants

### ❌ "ANTHROPIC_API_KEY not found"
→ La variable d'environnement n'est pas définie. Relisez l'Étape 3.

### ❌ "Cannot find module '@anthropic-ai/sdk'"
→ Installez: `npm install @anthropic-ai/sdk`

### ❌ Erreur 401 (Unauthorized)
→ Votre clé API est invalide. Vérifiez sur https://console.anthropic.com/

### ❌ Le script ne trouve pas le fichier
→ Vérifiez que vous êtes dans le bon dossier:
```bash
cd C:\Users\vcgle\Documents\GitHub\keiro
```

### ❌ Windows n'exécute pas les scripts .bat
→ Utilisez la méthode npm:
```bash
npm run keywords:optimize
```

---

## 📊 Catégories Optimisées

Le système optimise **17 catégories**:

| Catégorie | Statut | Mots-clés avant | Mots-clés après |
|-----------|--------|-----------------|-----------------|
| **Musique** | 🆕 NOUVEAU | 0 | 50-100 |
| **Automobile** | 🚀 PRIORITÉ MAX | ~18 | 50-100 |
| **People** | ⬆️ AMÉLIORÉ | ~50 | 70-100 |
| Tech | ✅ Enrichi | ~100 | 80-120 |
| Finance | ✅ Enrichi | ~30 | 60-90 |
| Business | ✅ Enrichi | ~20 | 50-80 |
| Sport | ✅ Enrichi | ~25 | 60-90 |
| Culture | ✅ Enrichi | ~20 | 50-80 |
| Politique | ✅ Enrichi | ~15 | 40-70 |
| Santé | ✅ Enrichi | ~20 | 50-80 |
| Climat | ✅ Enrichi | ~15 | 40-70 |
| Science | ✅ Enrichi | ~15 | 40-70 |
| Gaming | ✅ Enrichi | ~15 | 40-70 |
| Lifestyle | ✅ Enrichi | ~15 | 40-70 |
| Restauration | ✅ Enrichi | ~10 | 30-60 |
| International | ✅ Enrichi | ~15 | 40-70 |
| Tendances | ✅ Enrichi | ~30 | 50-80 |

---

## ✅ Checklist de Réussite

Après avoir suivi ce guide, vous devriez avoir:

- [x] Tous les fichiers créés (`npm run keywords:list`)
- [x] Connexion API testée (`npm run keywords:test`)
- [x] Mots-clés optimisés (`npm run keywords:optimize`)
- [x] Fichier `generated_keywords.json` créé
- [x] Fichier `lib/newsProviders.ts` mis à jour
- [x] Application fonctionnelle (`npm run dev`)
- [x] Catégorie "Musique" visible dans l'app
- [x] Catégorie "Automobile" enrichie

---

## 🎉 Prochaines Étapes

Une fois l'optimisation terminée:

1. **Testez votre application**:
   ```bash
   npm run dev
   ```

2. **Vérifiez les nouvelles catégories**:
   - Allez sur http://localhost:3002
   - Vérifiez que "Musique" existe
   - Vérifiez que "Automobile" a plus d'articles

3. **Ajustez si nécessaire**:
   - Si une catégorie manque encore d'articles, ajoutez des mots-clés manuellement
   - Relancez `npm run keywords:optimize` pour régénérer

4. **Committez vos changements**:
   ```bash
   git add lib/newsProviders.ts generated_keywords.json
   git commit -m "Optimize keywords with Claude API"
   git push
   ```

---

## 💡 Conseils Pro

- **Régénérez régulièrement**: Lancez `npm run keywords:optimize` une fois par mois pour avoir les mots-clés d'actualité
- **Sauvegardez le JSON**: Le fichier `generated_keywords.json` est un backup utile
- **Testez avant de commit**: Vérifiez toujours que l'app fonctionne après l'optimisation
- **Personnalisez le prompt**: Éditez `generate_keywords.js` pour adapter le prompt à vos besoins

---

## 📞 Support

Pour toute question:
1. Consultez la documentation complète: `KEYWORD_OPTIMIZATION_README.md`
2. Vérifiez les logs console pendant l'exécution
3. Inspectez `generated_keywords.json` pour voir la sortie de Claude

---

**🎯 Prêt à commencer? Exécutez simplement:**

```bash
npm run keywords:optimize
```

**C'est tout! Votre système de catégorisation sera optimisé en 2 minutes.**

---

*Créé avec Claude Code • Anthropic © 2025*
