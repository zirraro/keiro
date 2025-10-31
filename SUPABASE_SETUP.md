# Configuration Supabase pour la Librairie

## 📋 Prérequis

1. Un compte Supabase (gratuit sur [supabase.com](https://supabase.com))
2. Un projet Supabase créé
3. Les variables d'environnement configurées dans `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

## 🗃️ Étape 1: Créer la base de données

### Option A: Via l'interface Supabase (Recommandé)
1. Allez sur [supabase.com/dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet
3. Allez dans **SQL Editor**
4. Créez une nouvelle requête
5. Copiez-collez le contenu du fichier `supabase/migrations/001_create_library_items.sql`
6. Cliquez sur **Run** pour exécuter la migration

### Option B: Via Supabase CLI
```bash
# Installer Supabase CLI
npm install -g supabase

# Se connecter à Supabase
supabase login

# Lier votre projet
supabase link --project-ref your-project-ref

# Appliquer la migration
supabase db push
```

## 📊 Structure de la table créée

La table `library_items` stocke:
- **id**: Identifiant unique (UUID)
- **user_id**: Référence à l'utilisateur (nullable pour l'instant)
- **type**: Type d'item ('generation' ou 'upload')
- **title**: Titre du visuel
- **image_url**: URL de l'image complète
- **thumbnail_url**: URL de la miniature (optionnel)
- **news_title**: Titre de l'actualité (pour les générations)
- **news_url**: URL de l'actualité
- **business_type**: Type de business
- **metadata**: Données JSON supplémentaires
- **created_at** / **updated_at**: Horodatages

## ✅ Vérifier que tout fonctionne

1. Après avoir exécuté la migration, allez dans **Table Editor** sur Supabase
2. Vous devriez voir la table `library_items`
3. Les politiques RLS sont activées avec accès public (temporaire)

## 🔐 Sécurité (À faire plus tard)

Pour l'instant, la table a une politique d'accès public. Quand vous ajouterez l'authentification:

1. Modifiez les politiques RLS pour restreindre l'accès
2. Exemple de politique authentifiée:
```sql
-- Supprimer la politique publique
DROP POLICY "Public access for library_items" ON public.library_items;

-- Créer des politiques par utilisateur
CREATE POLICY "Users can view their own items" ON public.library_items
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own items" ON public.library_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own items" ON public.library_items
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own items" ON public.library_items
  FOR DELETE
  USING (auth.uid() = user_id);
```

## 📝 Prochaines étapes

Une fois la migration exécutée, l'application sera capable de:
- ✅ Sauvegarder les visuels générés dans la librairie
- ✅ Sauvegarder les images uploadées dans la librairie
- ✅ Afficher tous les items dans la page Librairie
- ✅ Rechercher et filtrer les items sauvegardés

## 🆘 Problèmes courants

**Erreur: "relation 'auth.users' does not exist"**
- Solution: Activez l'authentification dans votre projet Supabase (Settings > Authentication)

**Erreur de connexion**
- Vérifiez que les variables d'environnement sont correctes
- Redémarrez le serveur Next.js après avoir modifié .env.local

**Les items ne s'affichent pas**
- Vérifiez dans Table Editor que des données ont été insérées
- Ouvrez la console du navigateur pour voir les erreurs
