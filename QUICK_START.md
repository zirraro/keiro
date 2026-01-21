# Guide de Démarrage Rapide - Optimisation des Mots-clés

## 🎯 Objectif

Générer automatiquement des mots-clés optimisés pour catégoriser les actualités françaises en utilisant l'API Claude (Haiku).

## ⚡ Installation Rapide

### 1. Installer les dépendances

```bash
npm install @anthropic-ai/sdk
```

### 2. Configurer la clé API

#### Option A: Variable d'environnement (recommandé pour un test rapide)

**Windows CMD:**
```cmd
set ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici
```

**Windows PowerShell:**
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-api03-votre-cle-ici"
```

**Linux/Mac:**
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici
```

#### Option B: Fichier .env (recommandé pour un usage permanent)

1. Copiez `.env.example` vers `.env`:
   ```bash
   cp .env.example .env
   ```

2. Éditez `.env` et ajoutez votre clé:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici
   ```

3. Installez dotenv si pas déjà fait:
   ```bash
   npm install dotenv
   ```

4. Modifiez les scripts pour charger .env (ajoutez en haut):
   ```javascript
   require('dotenv').config();
   ```

### 3. Tester la connexion API

```bash
node test_api_connection.js
```

Vous devriez voir:
```
✅ SUCCÈS! Réponse de Claude: "OK"
🎉 La connexion à l'API fonctionne parfaitement!
```

## 🚀 Utilisation

### Méthode 1: Script automatique (plus simple)

**Windows:**
```cmd
optimize.bat
```

**Linux/Mac:**
```bash
chmod +x optimize.sh
./optimize.sh
```

### Méthode 2: Ligne de commande directe

```bash
node run_keyword_optimization.js
```

### Méthode 3: Étapes manuelles (pour plus de contrôle)

```bash
# Étape 1: Générer les mots-clés
node generate_keywords.js

# Étape 2: Vérifier le JSON (optionnel)
cat generated_keywords.json

# Étape 3: Mettre à jour le fichier TypeScript
node update_keywords.js
```

## 📋 Ce qui sera modifié

Le script va:

1. ✅ Créer `generated_keywords.json` avec tous les nouveaux mots-clés
2. ✅ Mettre à jour `lib/newsProviders.ts` automatiquement
3. ✅ Ajouter la catégorie **"Musique"** (actuellement inexistante)
4. ✅ Enrichir massivement **"Automobile"** (50-100 mots-clés au lieu de ~18)
5. ✅ Améliorer toutes les autres catégories

## 📊 Résultat attendu

Avant (exemple Automobile):
```javascript
'Automobile': ['auto', 'voiture', 'véhicule', 'électrique', 'hybride', 'tesla', 'renault', 'peugeot', 'citroën', 'bmw', 'mercedes', 'audi', 'volkswagen', 'salon auto', 'permis de conduire', 'code de la route', 'sécurité routière', 'accident de la route']
```

Après (Automobile optimisé):
```javascript
'Automobile': ['automobile', 'auto', 'voiture', 'véhicule', 'tesla', 'renault', 'peugeot', 'citroën', 'ds', 'alpine', 'bugatti', 'bmw', 'mercedes', 'audi', 'volkswagen', 'toyota', 'hyundai', 'kia', 'ford', 'porsche', 'ferrari', 'lamborghini', 'électrique', 'hybride', 'essence', 'diesel', 'suv', 'berline', 'citadine', 'sportive', 'batterie', 'autonomie', 'recharge', 'borne', 'superchargeur', 'pile à combustible', 'hydrogène', 'salon auto', 'mondial de l\'auto', 'essai', 'comparatif', 'nouveauté', 'lancement', 'permis de conduire', 'code de la route', 'sécurité routière', 'accident', 'assurance auto', 'contrôle technique', 'rolls-royce', 'bentley', 'maserati', 'aston martin', 'mclaren', 'byd', 'nio', 'xpeng', 'geely', ...]
```

## 💰 Coût

- **Modèle**: Claude 3 Haiku (le moins cher)
- **Coût estimé**: ~0.001-0.01 USD par exécution (~1 centime)
- **Tokens**: ~3000-5000 input + ~6000-8000 output

## ✅ Vérification

Après l'optimisation, testez votre application:

```bash
npm run dev
```

Vérifiez que:
- ✅ Les catégories "Automobile" et "Musique" contiennent des articles
- ✅ La catégorisation automatique est plus précise
- ✅ Pas d'erreurs TypeScript

## 🆘 Dépannage

### ❌ "ANTHROPIC_API_KEY not found"

La variable d'environnement n'est pas définie. Relisez l'étape 2.

### ❌ "Cannot find module '@anthropic-ai/sdk'"

Installez le package:
```bash
npm install @anthropic-ai/sdk
```

### ❌ Erreur 401 (Unauthorized)

Votre clé API est invalide. Vérifiez sur https://console.anthropic.com/

### ❌ Le fichier JSON est vide ou invalide

Relancez la génération:
```bash
node generate_keywords.js
```

## 📚 Documentation complète

Pour plus de détails, consultez:
- `KEYWORD_OPTIMIZATION_README.md` - Documentation complète
- `lib/newsProviders.ts` - Code source de la catégorisation

## 🎉 Succès!

Si tout fonctionne, vous devriez voir:

```
╔══════════════════════════════════════════════════════════════╗
║                    ✅ SUCCÈS COMPLET ✅                      ║
╚══════════════════════════════════════════════════════════════╝

📋 Résumé:
  1. Mots-clés générés par Claude API (Haiku)
  2. Fichier newsProviders.ts mis à jour avec succès
  3. Nouvelle catégorie "Musique" ajoutée
  4. Catégorie "Automobile" massivement enrichie
  5. Toutes les catégories optimisées
```

---

**Temps total estimé**: 2-5 minutes
**Difficulté**: ⭐⭐☆☆☆ (Facile)
