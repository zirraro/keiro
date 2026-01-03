# Configuration Supabase pour Keiro

## 1. Créer la table `profiles`

### Option A : Via l'interface Supabase (recommandé)

1. Allez sur votre dashboard Supabase : https://supabase.com/dashboard
2. Sélectionnez votre projet Keiro
3. Dans le menu latéral, cliquez sur **SQL Editor**
4. Cliquez sur **New query**
5. Copiez-collez le contenu du fichier `supabase/migrations/create_profiles_table.sql`
6. Cliquez sur **Run** pour exécuter la migration

### Option B : Via Supabase CLI

```bash
# Si vous avez Supabase CLI installé
supabase db push
```

## 2. Configurer l'authentification par email/password

1. Dans votre dashboard Supabase, allez dans **Authentication** → **Providers**
2. Activez **Email** si ce n'est pas déjà fait
3. **Désactivez** les providers OAuth que vous ne voulez pas :
   - Google
   - GitHub
   - etc.

### Configuration pour éviter les emails en spam

**Important** : Par défaut, Supabase utilise ses propres serveurs email qui peuvent être bloqués comme spam.

#### Solution 1 : Configurer un domaine personnalisé (Recommandé pour production)

1. Dans **Settings** → **Auth** → **SMTP Settings**
2. Configurez vos propres paramètres SMTP :
   - **Host** : smtp.gmail.com (ou votre provider)
   - **Port** : 587 (TLS) ou 465 (SSL)
   - **Username** : votre-email@votre-domaine.com
   - **Password** : mot de passe d'application
   - **Sender email** : noreply@votre-domaine.com
   - **Sender name** : KeiroAI

#### Solution 2 : Utiliser un service d'emailing (Recommandé)

Services recommandés :
- **SendGrid** (gratuit jusqu'à 100 emails/jour)
- **Resend** (gratuit jusqu'à 100 emails/jour)
- **Mailgun**
- **Postmark**

Configuration avec SendGrid :
1. Créez un compte sur sendgrid.com
2. Générez une API Key
3. Dans Supabase, configurez SMTP :
   - Host: smtp.sendgrid.net
   - Port: 587
   - Username: apikey
   - Password: <votre_api_key>

#### Solution 3 : Pour le développement uniquement

Pendant le développement, vous pouvez :
1. Demander aux utilisateurs de vérifier leurs spam
2. Ajouter `@supabase.io` à leur liste blanche
3. Utiliser **Confirm email** désactivé temporairement :
   - Dans **Authentication** → **Email Auth**
   - Décochez "Confirm email"
   - ⚠️ **NE PAS FAIRE EN PRODUCTION** - risque de faux comptes

## 3. Configuration des templates d'email

1. Dans **Authentication** → **Email Templates**
2. Personnalisez les templates pour votre marque :

### Template "Confirm signup"

```html
<h2>Bienvenue sur KeiroAI !</h2>
<p>Cliquez sur le lien ci-dessous pour confirmer votre inscription :</p>
<p><a href="{{ .ConfirmationURL }}">Confirmer mon email</a></p>
```

### Template "Magic Link"

```html
<h2>Connexion à KeiroAI</h2>
<p>Cliquez sur le lien ci-dessous pour vous connecter :</p>
<p><a href="{{ .Token }}">Se connecter</a></p>
```

## 4. Configuration URL de redirection

1. Dans **Authentication** → **URL Configuration**
2. Ajoutez vos URLs autorisées :
   - `http://localhost:3000` (développement)
   - `https://votre-domaine.vercel.app` (production)
   - `https://votre-domaine.com` (domaine personnalisé)

## 5. Tester la configuration

1. Créez un compte de test
2. Vérifiez que vous recevez l'email de confirmation
3. Vérifiez qu'il n'est PAS dans les spams
4. Testez la connexion

## 6. Vérifications de sécurité

- [ ] Row Level Security (RLS) activé sur la table `profiles`
- [ ] Les policies permettent seulement aux utilisateurs de voir leur propre profil
- [ ] Les emails utilisent SMTP personnalisé (pas les serveurs Supabase par défaut)
- [ ] Les URLs de redirection sont correctement configurées
- [ ] L'authentification OAuth non-nécessaire est désactivée

## Support

En cas de problème :
1. Vérifiez les logs dans **Authentication** → **Logs**
2. Vérifiez la console du navigateur pour les erreurs
3. Testez avec différents fournisseurs d'email (Gmail, Outlook, etc.)
