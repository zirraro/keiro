# Configuration Instagram/Meta pour Publication Automatique

Guide complet pour configurer la publication automatique sur Instagram depuis Keiro.

---

## Prérequis

Avant de commencer, vous devez avoir :
1. ✅ Un compte Instagram **Business** (pas un compte personnel)
2. ✅ Une Page Facebook connectée à ce compte Instagram Business
3. ✅ Droits d'administrateur sur cette Page Facebook

---

## Étape 1 : Créer une Application Meta

### 1.1 Accéder au Facebook Developers

1. Allez sur [https://developers.facebook.com/](https://developers.facebook.com/)
2. Connectez-vous avec votre compte Facebook
3. Cliquez sur **"My Apps"** (en haut à droite)
4. Cliquez sur **"Create App"**

### 1.2 Configurer l'Application

1. **Type d'app** : Choisissez "Business"
2. **Nom de l'app** : `Keiro - Publication Instagram` (ou le nom de votre choix)
3. **Email de contact** : Votre email professionnel
4. Cliquez sur **"Create App"**

### 1.3 Récupérer App ID et App Secret

1. Dans le dashboard de votre app, allez dans **Settings → Basic**
2. Notez votre **App ID** et **App Secret** (cliquez sur "Show" pour voir le secret)
3. Ajoutez un **App Domain** : `keiro.vercel.app` (ou votre domaine personnalisé)
4. **Save Changes**

---

## Étape 2 : Configurer les Produits Meta

### 2.1 Ajouter Facebook Login

1. Dans le dashboard, cliquez sur **"Add Product"**
2. Trouvez **"Facebook Login"** et cliquez sur **"Set Up"**
3. Choisissez **"Web"** comme plateforme
4. Dans **Valid OAuth Redirect URIs**, ajoutez :
   ```
   https://keiro.vercel.app/auth/instagram-callback
   https://localhost:3002/auth/instagram-callback
   ```
5. **Save Changes**

### 2.2 Ajouter Instagram Basic Display (optionnel pour début)

Ceci est automatiquement activé quand vous demandez les permissions Instagram.

---

## Étape 3 : Activer les Permissions Instagram

### 3.1 Demander les Permissions

Vous devez demander les permissions suivantes dans **App Review** :
- `instagram_basic`
- `instagram_content_publish`
- `pages_show_list`
- `pages_read_engagement`
- `instagram_manage_insights`
- `business_management`

**Note** : En mode développement, vous pouvez utiliser votre compte pour tester sans validation Meta.

---

## Étape 4 : Appliquer la Migration Supabase

### 4.1 Via Supabase Dashboard

1. Allez sur [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet Keiro
3. Allez dans **SQL Editor**
4. Créez une nouvelle query et collez le contenu de `supabase/migrations/20260125_add_instagram_tokens.sql`
5. Cliquez sur **Run**

### 4.2 Via Supabase CLI (optionnel)

```bash
cd c:/Users/vcgle/Documents/GitHub/keiro
supabase db push
```

---

## Étape 5 : Configurer les Variables d'Environnement

### 5.1 Local (.env.local)

Ajoutez ces lignes dans votre fichier `.env.local` :

```env
# Meta/Instagram API
META_APP_ID=votre_app_id_ici
META_APP_SECRET=votre_app_secret_ici
NEXT_PUBLIC_META_REDIRECT_URI=http://localhost:3002/auth/instagram-callback
```

### 5.2 Production (Vercel)

1. Allez sur [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. Sélectionnez votre projet Keiro
3. Allez dans **Settings → Environment Variables**
4. Ajoutez les 3 variables suivantes :

| Key | Value | Environments |
|-----|-------|--------------|
| `META_APP_ID` | `votre_app_id` | Production, Preview |
| `META_APP_SECRET` | `votre_app_secret` | Production, Preview |
| `NEXT_PUBLIC_META_REDIRECT_URI` | `https://keiro.vercel.app/auth/instagram-callback` | Production, Preview |

5. Cliquez sur **Save**
6. **Redéployez** votre application

---

## Étape 6 : Tester la Connexion

### 6.1 En Local

1. Démarrez votre serveur local :
   ```bash
   npm run dev
   ```

2. Allez sur `http://localhost:3002/library`
3. Cliquez sur le modal de connexion Instagram
4. Cliquez sur **"Connecter Instagram"**
5. Vous serez redirigé vers Facebook pour autoriser l'app
6. Sélectionnez votre Page Facebook (celle connectée à Instagram Business)
7. Autorisez les permissions demandées
8. Vous serez redirigé vers `/auth/instagram-callback`
9. Si tout fonctionne, vous verrez "✅ Compte Instagram connecté avec succès !"

### 6.2 En Production

Même processus sur `https://keiro.vercel.app`

---

## Étape 7 : Publier sur Instagram

### 7.1 Depuis la Galerie

1. Allez dans **Galerie** (`/library`)
2. Cliquez sur une image
3. Cliquez sur le bouton **Instagram** (icône)
4. Le modal Instagram s'ouvre :
   - Éditez la caption
   - Ajoutez des hashtags (ou utilisez "Suggérer avec IA")
5. Cliquez sur **"Publier maintenant"** (si vous êtes connecté à Instagram)
   - OU **"Prêt à publier"** pour sauvegarder en brouillon

### 7.2 Vérification

- Le post devrait apparaître immédiatement sur votre compte Instagram Business
- Vous verrez une notification de succès avec un lien vers le post
- Le post sera aussi sauvegardé dans votre base Supabase

---

## Flux Complet de Publication

```
1. Utilisateur clique sur image dans galerie
   ↓
2. Modal Instagram s'ouvre
   ↓
3. Check : Utilisateur connecté à Instagram ?
   ↓ Non → Afficher bouton "Connecter Instagram"
   ↓ Oui → Afficher boutons "Publier maintenant" + "Brouillon"
   ↓
4. Utilisateur édite caption + hashtags
   ↓
5. Clique sur "Publier maintenant"
   ↓
6. POST /api/library/instagram/publish
   ↓
7. Récupère token Instagram depuis Supabase
   ↓
8. Appelle Meta Graph API (publishImageToInstagram)
   ↓
9. Sauvegarde post dans instagram_posts table
   ↓
10. Retourne lien du post Instagram
```

---

## Débogage

### Erreur "Compte Instagram non connecté"

Vérifiez que :
- La migration Supabase a été appliquée
- Les colonnes `instagram_business_account_id` et `instagram_access_token` existent dans `profiles`
- Vous avez bien complété le flux OAuth

### Erreur "Invalid x-api-key" ou "Invalid OAuth token"

Vérifiez que :
- Les variables `META_APP_ID` et `META_APP_SECRET` sont correctes
- Le token n'a pas expiré (les tokens de Page Facebook sont long-lived)
- Votre app Meta est en mode "Live" (pas "Development")

### Erreur "Aucune Page Facebook trouvée"

Vérifiez que :
- Vous êtes administrateur de la Page Facebook
- La Page est connectée à un compte Instagram Business
- Les permissions `pages_show_list` sont accordées

### Erreur "Aucun compte Instagram Business trouvé"

Vérifiez que :
- Votre compte Instagram est bien un compte Business (pas Creator ou Personnel)
- Il est connecté à une Page Facebook
- Dans Instagram → Paramètres → Compte → Comptes liés → Lier à Facebook

---

## Architecture des Fichiers Créés

```
keiro/
├── supabase/migrations/
│   └── 20260125_add_instagram_tokens.sql         # Migration pour tokens
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── instagram-oauth/route.ts          # Initie OAuth
│   │   │   └── instagram-callback/route.ts        # Échange code → token
│   │   └── library/
│   │       └── instagram/
│   │           └── publish/route.ts               # Publie sur Instagram
│   └── auth/
│       └── instagram-callback/
│           └── page.tsx                           # Page de retour OAuth
├── lib/
│   └── meta.ts                                    # Fonctions Meta Graph API (déjà existant)
└── .env.example                                   # Variables d'environnement
```

---

## Ressources Officielles

- [Meta Developers](https://developers.facebook.com/)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api/)
- [Content Publishing](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)
- [Permissions Instagram](https://developers.facebook.com/docs/permissions/reference/)

---

## Support

Si vous rencontrez des problèmes, vérifiez :
1. Les logs dans la console du navigateur
2. Les logs dans Vercel (Functions → Logs)
3. Les logs Supabase (Database → Logs)
4. Le dashboard Meta Developers (App → Roles → Test Users)

**Besoin d'aide ?** Contactez le support ou consultez la documentation Meta.
