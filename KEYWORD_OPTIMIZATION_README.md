# Optimisation des Mots-clés de Catégorisation

## Description

Ce système utilise l'API Claude (Haiku) pour générer automatiquement des listes exhaustives de mots-clés optimisés pour la catégorisation d'actualités françaises.

## Prérequis

1. **Node.js** installé sur votre machine
2. **Package @anthropic-ai/sdk** installé:
   ```bash
   npm install @anthropic-ai/sdk
   ```
3. **Clé API Anthropic** dans les variables d'environnement:
   ```bash
   export ANTHROPIC_API_KEY="sk-ant-..."
   # Ou sur Windows:
   set ANTHROPIC_API_KEY=sk-ant-...
   ```

## Utilisation

### Option 1: Script automatique (recommandé)

Exécutez simplement le script principal qui fait tout:

```bash
cd C:\Users\vcgle\Documents\GitHub\keiro
node run_keyword_optimization.js
```

Ce script va:
1. ✅ Appeler l'API Claude pour générer les mots-clés
2. ✅ Sauvegarder le JSON généré
3. ✅ Mettre à jour automatiquement `lib/newsProviders.ts`
4. ✅ Afficher un résumé des modifications

### Option 2: Étapes manuelles

Si vous voulez plus de contrôle:

#### Étape 1: Génération des mots-clés
```bash
node generate_keywords.js
```
→ Crée `generated_keywords.json` avec tous les mots-clés

#### Étape 2: Vérification manuelle (optionnel)
Ouvrez `generated_keywords.json` pour inspecter les mots-clés générés.

#### Étape 3: Mise à jour du fichier TypeScript
```bash
node update_keywords.js
```
→ Remplace l'objet `CATEGORY_KEYWORDS` dans `lib/newsProviders.ts`

## Catégories optimisées

Le système optimise 17 catégories:

### Nouvelles catégories
- **Musique** (nouvelle) - Artistes, albums, concerts, festivals, streaming

### Catégories améliorées massivement
- **Automobile** - Marques (Tesla, Renault, BYD...), électrique, hybride, salons auto
- **People** - Célébrités, influenceurs français/internationaux

### Autres catégories enrichies
- Tech (IA, startups, GAFAM, crypto)
- Finance (bourse, banques, fintech)
- Business (licornes, e-commerce)
- Sport (foot, tennis, F1, basket)
- Culture (streaming, cinéma, séries)
- Politique (gouvernement, partis, réformes)
- Santé (médecine, nutrition, bien-être)
- Climat (énergies renouvelables, COP)
- Science (espace, recherche, découvertes)
- Gaming (jeux vidéo, esport, consoles)
- Lifestyle (mode, beauté, voyages)
- Restauration (chefs, gastronomie, émissions)
- International (conflits, diplomatie)
- Tendances (buzz, viral, TikTok)

## Structure des mots-clés

Chaque catégorie contient 50-100 mots-clés incluant:

- ✅ **Termes génériques** (voiture, concert, politique...)
- ✅ **Termes spécifiques** (électrique, festival, manifestation...)
- ✅ **Noms propres** (Tesla, Beyoncé, Macron...)
- ✅ **Marques** (Renault, Spotify, Netflix...)
- ✅ **Variantes orthographiques** (beyonce/beyoncé, ia/ai...)
- ✅ **Abréviations** (f1, psg, om, ia...)
- ✅ **Expressions courantes** (pouvoir d'achat, salon auto...)
- ✅ **Termes d'actualité 2025-2026**

## Fichiers générés

```
keiro/
├── generate_keywords.js           # Script de génération via Claude API
├── update_keywords.js             # Script de mise à jour du TypeScript
├── run_keyword_optimization.js    # Script principal (tout automatique)
├── generated_keywords.json        # JSON généré (backup)
└── lib/
    └── newsProviders.ts           # Fichier mis à jour avec nouveaux mots-clés
```

## Coût estimé

- **Modèle utilisé**: `claude-3-haiku-20240307` (le moins cher)
- **Coût par appel**: ~0.001-0.01 USD (environ 1 centime)
- **Tokens utilisés**: ~3000-5000 tokens input + ~6000-8000 tokens output

## Personnalisation

Pour personnaliser le prompt ou ajouter des catégories:

1. Éditez `generate_keywords.js`
2. Modifiez la variable `prompt` (ligne ~15)
3. Relancez `node run_keyword_optimization.js`

## Vérification

Après l'optimisation, vérifiez que:

1. ✅ Le fichier `lib/newsProviders.ts` compile sans erreur TypeScript
2. ✅ L'application charge correctement les actualités
3. ✅ Les catégories "Automobile" et "Musique" contiennent des articles
4. ✅ La catégorisation automatique est plus précise

Pour tester:
```bash
npm run dev
# Ou
npm start
```

## Dépannage

### Erreur "ANTHROPIC_API_KEY not found"
→ Vérifiez que la variable d'environnement est définie:
```bash
echo $ANTHROPIC_API_KEY  # Linux/Mac
echo %ANTHROPIC_API_KEY%  # Windows CMD
```

### Erreur "Cannot find module '@anthropic-ai/sdk'"
→ Installez le package:
```bash
npm install @anthropic-ai/sdk
```

### Le JSON généré est invalide
→ Vérifiez le fichier `generated_keywords.json` manuellement
→ Relancez `node generate_keywords.js`

### Le fichier TypeScript n'est pas mis à jour
→ Vérifiez que le pattern de remplacement correspond
→ Exécutez `node update_keywords.js` manuellement avec le JSON correct

## Support

Pour toute question ou problème:
1. Vérifiez les logs console pendant l'exécution
2. Inspectez `generated_keywords.json` pour voir la sortie de Claude
3. Vérifiez que l'API Claude est accessible (pas de problème réseau)

---

**Note**: Ce système utilise Claude Haiku pour un excellent rapport qualité/prix. Si vous voulez des résultats encore plus sophistiqués, vous pouvez changer le modèle vers `claude-3-5-sonnet-20241022` dans `generate_keywords.js` (ligne ~35), mais cela coûtera plus cher.
