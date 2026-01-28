# Configuration Resend pour les emails de support

## Vue d'ensemble

Le système de support de Keiro utilise **Resend** pour envoyer les emails depuis le formulaire de contact. Les emails sont envoyés à `contact@keiroai.com`.

**Sans configuration :** Les messages sont loggés dans la console mais pas envoyés par email (mode développement).

**Avec Resend :** Les emails sont envoyés automatiquement avec un template HTML professionnel.

---

## 🚀 Configuration Resend (5 minutes)

### Étape 1 : Créer un compte Resend

1. Allez sur [resend.com](https://resend.com)
2. Cliquez sur "Sign Up" (gratuit : 100 emails/jour, 3000 emails/mois)
3. Confirmez votre email

### Étape 2 : Ajouter votre domaine

**Option A : Domaine personnalisé (Recommandé)**

1. Dans Resend Dashboard, cliquez sur **Domains** → **Add Domain**
2. Entrez votre domaine : `keiroai.com`
3. Ajoutez les DNS records fournis par Resend :
   ```
   Type  Name              Value
   TXT   _resend           [valeur fournie par Resend]
   MX    @                 feedback-smtp.us-east-1.amazonses.com
   TXT   resend._domainkey [DKIM key fournie]
   ```
4. Attendez la vérification DNS (5-30 minutes)
5. ✅ Status : "Verified"

**Option B : Sous-domaine Resend (Rapide)**

Si vous voulez tester rapidement :
1. Utilisez le sous-domaine par défaut fourni par Resend
2. Les emails seront envoyés depuis `noreply@resend.dev`
3. **Attention :** Risque de spam, à utiliser uniquement en test

### Étape 3 : Créer une clé API

1. Dans Resend Dashboard, cliquez sur **API Keys**
2. Cliquez sur **Create API Key**
3. Nom : `Keiro Support Emails`
4. Permissions : **Full Access** (ou Send Access minimum)
5. Copiez la clé API (commence par `re_...`)

### Étape 4 : Ajouter la clé dans Vercel

#### Via Vercel Dashboard

1. Allez sur [vercel.com](https://vercel.com)
2. Sélectionnez votre projet Keiro
3. Allez dans **Settings** → **Environment Variables**
4. Ajoutez une nouvelle variable :
   - **Name:** `RESEND_API_KEY`
   - **Value:** `re_votre_cle_api_ici` (la clé copiée)
   - **Environment:** Production + Preview + Development
5. Cliquez sur **Save**
6. **Redéployez** votre app pour que la variable soit prise en compte

#### Via Vercel CLI (Alternative)

```bash
# Si vous utilisez Vercel CLI
vercel env add RESEND_API_KEY

# Entrez votre clé API quand demandé
# Sélectionnez tous les environnements (Production, Preview, Development)
```

### Étape 5 : Configuration locale (.env.local)

Pour tester en local, créez/modifiez `.env.local` :

```bash
# .env.local (NE PAS COMMITER)
RESEND_API_KEY=re_votre_cle_api_ici
```

---

## ✅ Vérification du setup

### Test rapide

1. Allez sur votre app déployée : `https://votre-app.vercel.app/pricing`
2. Scrollez jusqu'à la section "Une question ? Besoin d'aide ?"
3. Cliquez sur "Email" → Remplissez le formulaire
4. Envoyez le message

**Résultat attendu :**
- ✅ Message "Message envoyé !" affiché
- ✅ Email reçu à `contact@keiroai.com` sous 1-2 minutes
- ✅ Email avec template HTML professionnel
- ✅ Bouton "Reply" fonctionne (répond à l'email du client)

### Vérifier les logs

Dans Vercel → Votre projet → **Runtime Logs** :

```
[Support] New contact request: {
  name: "Client Name",
  email: "client@example.com",
  subject: "Question tarif",
  timestamp: "2026-01-28T..."
}
[Support] Email sent via Resend: re_abc123xyz
```

Si vous voyez `No RESEND_API_KEY configured` :
- ❌ La variable d'environnement n'est pas configurée
- Solution : Ajoutez `RESEND_API_KEY` dans Vercel Settings
- Redéployez l'app

---

## 📧 Où le formulaire de contact est accessible

### 1. Page Tarif (/pricing)

Section "Une question ? Besoin d'aide ?" avec 2 options :
- **Appel téléphonique** → Calendly
- **Email** → `contact@keiroai.com` (lien mailto direct)

### 2. Modal d'erreur (Instagram/TikTok)

Quand une erreur de publication se produit :
- Modal avec 2 boutons support :
  - **Appel téléphonique** → Calendly
  - **Email** → Ouvre formulaire pré-rempli avec :
    - Contexte erreur (titre)
    - Détails techniques (copiables)

### 3. Partout ailleurs

Ajoutez le modal de contact n'importe où :

```tsx
import ContactSupportModal from '@/app/library/components/ContactSupportModal';

function MyComponent() {
  const [showContactModal, setShowContactModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowContactModal(true)}>
        Contacter le support
      </button>

      <ContactSupportModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        errorContext="Mon problème" // Optionnel
        technicalDetails="Erreur XYZ..." // Optionnel
      />
    </>
  );
}
```

---

## 📊 Template d'email

Les emails de support utilisent un template HTML professionnel :

**Header :** Gradient violet/bleu avec icône 📧
**Contenu :**
- Nom du client
- Email (cliquable)
- Sujet
- Message (avec formatage)
- Détails techniques (si fournis, dans bloc gris)

**Footer :**
- Date et heure
- IP client
- User-Agent

**Reply-To :** Configuré automatiquement sur l'email du client

---

## 💰 Tarifs Resend

### Plan Gratuit
- ✅ **100 emails/jour**
- ✅ **3,000 emails/mois**
- ✅ Domaine personnalisé
- ✅ API complète
- ✅ Webhooks
- ✅ Logs 30 jours

**Parfait pour démarrer !** Si vous recevez 100+ emails support/jour, c'est un bon signe 🎉

### Plans payants

Si vous dépassez 3000 emails/mois :
- **Pro** : $20/mois → 50,000 emails
- **Business** : Sur mesure

---

## 🔧 Dépannage

### Email non reçu à contact@keiroai.com

1. **Vérifiez le domaine Resend :**
   - Status doit être "Verified" (vert)
   - DNS records correctement configurés
   - Attendez 30 min après ajout DNS

2. **Vérifiez les logs Resend :**
   - Allez dans **Emails** dans Resend Dashboard
   - Cherchez l'email envoyé
   - Status doit être "Delivered"
   - Si "Bounced" ou "Rejected" : vérifiez l'adresse `contact@keiroai.com`

3. **Vérifiez le dossier spam :**
   - Les emails de support peuvent arriver en spam initialement
   - Marquez comme "Not Spam" pour former le filtre

### Erreur "API Key invalid"

```
Error: Authentication error (resend)
```

**Solution :**
- La clé API est incorrecte ou révoquée
- Créez une nouvelle clé dans Resend Dashboard
- Mettez à jour `RESEND_API_KEY` dans Vercel
- Redéployez

### Mode développement sans envoi

Si vous **ne voulez pas** configurer Resend en développement :
- ❌ Ne définissez pas `RESEND_API_KEY` dans `.env.local`
- ✅ Les messages seront loggés dans la console
- ✅ Parfait pour tester l'UI sans spammer

---

## 🎯 Points importants

### Sécurité

- ✅ Rate limiting : Vercel limite les requêtes API automatiquement
- ✅ Validation email : Regex côté serveur
- ✅ Headers sécurisés : IP + User-Agent loggés
- ⚠️ **Ajoutez un CAPTCHA** si spam (Turnstile, reCAPTCHA)

### Email deliverability

Pour maximiser la délivrabilité :
1. ✅ Utilisez un domaine vérifié (pas `@resend.dev`)
2. ✅ Configurez SPF, DKIM, DMARC (Resend le fait automatiquement)
3. ✅ Évitez les mots spam ("gratuit", "urgent", etc.)
4. ✅ Réchauffez le domaine progressivement (commencez lentement)

### Monitoring

Resend Dashboard vous montre :
- 📊 Taux de délivrabilité
- 📈 Volume d'emails par jour
- 🚨 Emails en erreur (bounces)
- 📧 Logs détaillés

---

## 📚 Ressources

- [Documentation Resend](https://resend.com/docs)
- [API Reference](https://resend.com/docs/api-reference/introduction)
- [DNS Configuration](https://resend.com/docs/dashboard/domains/introduction)
- [Troubleshooting](https://resend.com/docs/knowledge-base/deliverability)

---

## ✅ Checklist finale

- [ ] Compte Resend créé
- [ ] Domaine `keiroai.com` ajouté et vérifié
- [ ] Clé API créée
- [ ] `RESEND_API_KEY` ajoutée dans Vercel (Production + Preview)
- [ ] App redéployée
- [ ] Test formulaire contact → Email reçu
- [ ] Email pas en spam
- [ ] Reply-To fonctionne

---

**Dernière mise à jour :** 2026-01-28
