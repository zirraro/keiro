# Système d'Optimisation des Mots-clés - README

> **Système complet et automatisé pour optimiser la catégorisation des actualités françaises via l'API Claude**

## Démarrage Rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer votre clé API
# Créez un fichier .env.local et ajoutez:
# ANTHROPIC_API_KEY=sk-ant-api03-votre-cle-ici

# 3. Tester la connexion
npm run keywords:test

# 4. Optimiser les mots-clés
npm run keywords:optimize
```

## Documentation

| Document | Description | Pour qui |
|----------|-------------|----------|
| **START_HERE.md** | Vue d'ensemble + tutoriel complet | Tout le monde (commencez ici!) |
| **QUICK_START.md** | Démarrage rapide en 6 étapes | Utilisateurs pressés |
| **NPM_SCRIPTS.md** | Guide des scripts npm | Utilisateurs npm |
| **KEYWORD_OPTIMIZATION_README.md** | Documentation technique | Développeurs |
| **INSTALLATION_COMPLETE.txt** | Guide d'installation | Nouveaux utilisateurs |
| **SYSTEM_SUMMARY.txt** | Résumé complet | Vue d'ensemble |
| **FILES_CREATED.md** | Liste des fichiers créés | Référence |

## Scripts Disponibles

```bash
npm run keywords:test      # Tester la connexion API
npm run keywords:generate  # Générer les mots-clés
npm run keywords:update    # Mettre à jour newsProviders.ts
npm run keywords:optimize  # Tout faire automatiquement (recommandé)
npm run keywords:list      # Lister les fichiers créés
```

## Fichiers Créés

### Scripts (5 fichiers)
- `generate_keywords.js` - Génération via API Claude
- `update_keywords.js` - Mise à jour du TypeScript
- `run_keyword_optimization.js` - Script principal
- `test_api_connection.js` - Test de connexion
- `list_created_files.js` - Liste les fichiers

### Lanceurs (2 fichiers)
- `optimize.bat` - Windows (double-clic)
- `optimize.sh` - Linux/Mac

### Documentation (7 fichiers)
- `START_HERE.md`
- `QUICK_START.md`
- `KEYWORD_OPTIMIZATION_README.md`
- `NPM_SCRIPTS.md`
- `INSTALLATION_COMPLETE.txt`
- `SYSTEM_SUMMARY.txt`
- `FILES_CREATED.md`

## Objectif

Le système optimise **17 catégories** d'actualités:

| Catégorie | Statut | Avant | Après |
|-----------|--------|-------|-------|
| Musique | NOUVEAU | 0 | 50-100 |
| Automobile | PRIORITÉ MAX | ~18 | 50-100 |
| People | AMÉLIORÉ | ~50 | 70-100 |
| 14 autres | Enrichies | 10-30 | 40-100 |

## Coût

- **Modèle**: Claude 3 Haiku (le moins cher)
- **Prix**: ~0.001-0.01 USD par optimisation (~1 centime)
- **Durée**: 6-11 secondes

## Support

1. Consultez `START_HERE.md` pour un tutoriel complet
2. Vérifiez les logs console pendant l'exécution
3. Inspectez `generated_keywords.json` après génération

## Prochaines Étapes

1. **Lisez** `START_HERE.md`
2. **Testez** avec `npm run keywords:test`
3. **Optimisez** avec `npm run keywords:optimize`
4. **Vérifiez** votre app avec `npm run dev`

---

**Créé avec Claude Code • Anthropic © 2025**
