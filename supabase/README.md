# Supabase Database Setup

Ce dossier contient les migrations et schémas pour la base de données Supabase.

## Configuration requise

1. Compte Supabase avec projet créé
2. Accès au SQL Editor dans le dashboard Supabase

## Installation du schéma Analytics

### Étape 1: Créer la table `image_analytics`

1. Connectez-vous à votre dashboard Supabase : https://supabase.com/dashboard
2. Sélectionnez votre projet Keiro
3. Dans le menu de gauche, cliquez sur **SQL Editor**
4. Cliquez sur **New query**
5. Copiez le contenu du fichier `migrations/001_image_analytics_schema.sql`
6. Collez-le dans l'éditeur SQL
7. Cliquez sur **Run** pour exécuter la migration

### Étape 2: Vérifier la création

Exécutez cette requête SQL pour vérifier que la table existe :

```sql
SELECT * FROM image_analytics LIMIT 1;
```

Si la table existe, vous verrez les colonnes définies (même si la table est vide).

### Étape 3: (Optionnel) Ajouter des données de test

Pour tester l'interface analytics avec des données fictives, vous pouvez insérer des données de test :

```sql
-- Insérer des analytics de test pour les images existantes
INSERT INTO image_analytics (
  user_id,
  saved_image_id,
  views,
  likes,
  comments,
  shares,
  engagement_rate,
  posted_at,
  category,
  marketing_strategy,
  visual_style
)
SELECT
  user_id,
  id,
  FLOOR(RANDOM() * 1000 + 100)::INT AS views,
  FLOOR(RANDOM() * 100 + 10)::INT AS likes,
  FLOOR(RANDOM() * 20 + 2)::INT AS comments,
  FLOOR(RANDOM() * 30 + 5)::INT AS shares,
  ROUND((RANDOM() * 10 + 2)::NUMERIC, 2) AS engagement_rate,
  NOW() - (RANDOM() * INTERVAL '30 days') AS posted_at,
  news_category AS category,
  tone AS marketing_strategy,
  visual_style
FROM saved_images
WHERE created_at > NOW() - INTERVAL '60 days'
LIMIT 20;
```

Cette requête créera 20 entrées d'analytics basées sur vos images existantes avec des métriques aléatoires.

## Structure de la table `image_analytics`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique (auto-généré) |
| `user_id` | UUID | ID de l'utilisateur (référence auth.users) |
| `saved_image_id` | UUID | ID de l'image (référence saved_images) |
| `views` | INT | Nombre de vues |
| `likes` | INT | Nombre de likes |
| `comments` | INT | Nombre de commentaires |
| `shares` | INT | Nombre de partages |
| `saves` | INT | Nombre de sauvegardes |
| `engagement_rate` | DECIMAL | Taux d'engagement calculé |
| `posted_at` | TIMESTAMP | Date de publication |
| `platform` | VARCHAR | Plateforme (instagram, facebook, etc.) |
| `post_url` | TEXT | URL du post publié |
| `template_name` | VARCHAR | Nom du template utilisé |
| `marketing_strategy` | VARCHAR | Stratégie (inspirant, expert, etc.) |
| `visual_style` | VARCHAR | Style visuel |
| `category` | VARCHAR | Catégorie du contenu |
| `created_at` | TIMESTAMP | Date de création |
| `updated_at` | TIMESTAMP | Date de dernière mise à jour |

## Sécurité (RLS)

La table `image_analytics` est protégée par Row Level Security (RLS). Les utilisateurs peuvent uniquement :
- Voir leurs propres analytics (`user_id = auth.uid()`)
- Créer des analytics pour leurs images
- Modifier leurs propres analytics
- Supprimer leurs propres analytics

## API Endpoints

### GET `/api/assistant/stats`

Récupère les statistiques d'analytics de l'utilisateur authentifié.

**Réponse :**
```json
{
  "ok": true,
  "stats": {
    "postsThisWeek": 12,
    "avgEngagement": 347,
    "avgViews": 450,
    "avgLikes": 85,
    "topCategory": "Tech",
    "improvement": 40,
    "totalPosts": 25,
    "tableExists": true
  },
  "chartData": {
    "engagementTrend": [...],
    "bestTimes": {...},
    "topCategories": [...]
  }
}
```

## Prochaines étapes

1. **Phase 2**: Intégration Meta API pour récupération automatique des métriques Instagram
2. **Phase 3**: Machine Learning pour prédictions et recommandations
3. **Phase 4**: Export de rapports PDF personnalisés
