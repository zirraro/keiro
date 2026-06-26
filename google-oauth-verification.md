# Google OAuth Verification — KeiroAI (dossier Trust & Safety)

> Équivalent Google du dossier `meta-app-review-v4-*.md`. Dernier rejet Google : **24 juin 2026**.
> Objectif : passer la vérification de l'écran de consentement OAuth + (pour Gmail) l'évaluation
> de sécurité CASA. On GARDE toutes les features (Gmail envoi+réponses, avis Google) — décision founder 26/06.

---

## 1. Ce que Google reproche (rejet) → action → qui

| Problème Google | Cause réelle | Statut | Qui |
|---|---|---|---|
| **Page d'accueil — site pas enregistré à votre nom + valider la propriété** | keiroai.com pas vérifié dans Search Console sous le compte qui possède le projet GCP, et/ou WHOIS masqué/incohérent | ⏳ À FAIRE | **Founder (console + registrar)** |
| **Niveaux d'accès minimaux** | On demandait un scope restreint inutile (`gmail.modify`) | ✅ FAIT (code) | Claude |
| **Règles de confidentialité** | Pas de divulgation « Google API Services / Limited Use » | ✅ FAIT (code) | Claude |
| **Accès approprié aux données** | Chaque scope doit mapper une feature visible + vidéo démo | ⏳ Vidéo à filmer | **Founder** (script fourni) |
| **Consignes de marque** | Écran de consentement à aligner (nom/logo/domaine) | ⏳ À FAIRE | **Founder** (valeurs fournies) |

---

## 2. Scopes demandés (APRÈS minimisation) + justification

L'écran de consentement GCP doit lister EXACTEMENT ces scopes (retirer `gmail.modify` côté console aussi) :

| Scope | Catégorie Google | Coût vérif | Feature visible | Justification (form) |
|---|---|---|---|---|
| `gmail.send` | **Sensible** | **GRATUIT** | « Envoyer depuis mon Gmail » (Hugo) | Envoyer/répondre aux emails depuis l'adresse Gmail du client. |
| `gmail.readonly` | **Restreint** | **CASA (payant)** | Détecter les réponses prospects | Lire les réponses entrantes pour l'auto-reply. **← le SEUL scope qui coûte.** |
| `business.manage` | **Sensible** | **GRATUIT** | Avis Google auto (Théo) | Lire les avis de la fiche et publier les réponses approuvées. |
| `userinfo.email` | Standard | GRATUIT | Identifier la boîte connectée | Afficher quelle adresse est connectée. |
| `openid` / `profile` | Standard | GRATUIT | Login | Connexion. |

**RETIRÉ : `gmail.modify`** — ne servait qu'à marquer les emails lus ; dédup déjà via
`gmail_last_poll_at` + message_id. Retiré du code ET à retirer de l'écran de consentement.

> ✅ **Correction importante** : `gmail.send` est SENSIBLE (pas restreint) → vérification GRATUITE.
> `business.manage` (avis Google) = SENSIBLE → GRATUIT aussi.
> ⚠️ Le SEUL scope qui déclenche l'audit **CASA** (auditeur tiers, annuel, payant) = **`gmail.readonly`**
> (lecture de la boîte pour détecter les réponses).
>
> 🟢 **INTERIM IMPLÉMENTÉ (juin 2026, décision founder)** : `gmail.readonly` RETIRÉ. On envoie depuis le
> Gmail du client (`gmail.send`) avec un `Reply-To: contact@keiroai.com` qui route les réponses vers
> `/api/webhooks/email-inbound` — **exactement comme le mail domaine perso**. Résultat : **zéro scope
> restreint demandé → zéro CASA → vérification Google 100% gratuite**. Poller Gmail désactivé
> (flag `GMAIL_INBOUND_POLL`, défaut off). Tradeoff assumé : en attendant, les réponses transitent par
> KeiroAI (le client ne les voit pas dans son Gmail, et on ne lit pas ses autres mails).
>
> 🔵 **PLUS TARD** : réintroduire `gmail.readonly` + lancer l'audit **CASA** pour lire la boîte complète
> (réponses visibles dans le Gmail du client + mails non envoyés par nous). Remettre le scope dans
> `lib/gmail-oauth.ts` et poser `GMAIL_INBOUND_POLL=on`.
>
> Sous **100 utilisateurs**, l'app non vérifiée fonctionne déjà gratuitement (écran d'avertissement).

---

## 3. Action Founder — Page d'accueil / propriété du domaine (le blocant du 24 juin)

1. **Search Console** : aller sur https://search.google.com/search-console, ajouter la propriété
   **Domaine** `keiroai.com` et valider par **enregistrement DNS TXT** chez le registrar.
   → Utiliser **le MÊME compte Google** que celui qui possède le projet Google Cloud de l'app.
2. **WHOIS** : vérifier le registrant de `keiroai.com` (ex: `whois keiroai.com`). Si protection de
   confidentialité activée ou nom ≠ toi/ta société → soit rendre le WHOIS public avec ton nom/société,
   soit s'assurer que l'email du compte registrar = ton domaine. C'est ce que vise « pas enregistré à
   votre nom ».
3. **Écran de consentement GCP** (APIs & Services → OAuth consent screen) :
   - **Authorized domains** : `keiroai.com`
   - **Application home page** : `https://keiroai.com`
   - **Privacy policy** : `https://keiroai.com/legal/privacy`
   - **Terms of service** : `https://keiroai.com/legal/terms`

---

## 4. Action Founder — Consignes de marque (écran de consentement)

- **App name** : `KeiroAI` (exactement, cohérent avec le site — pas de « Google » dans le nom)
- **User support email** : `support@keiroai.com` (ou `privacy@keiroai.com`)
- **App logo** : logo KeiroAI officiel (carré, fond propre, identique au site)
- **Developer contact** : email @keiroai.com
- Ne PAS utiliser de marque/logo Google dans le branding de l'app.

---

## 5. Action Founder — Vidéo démo (exigée pour « accès approprié aux données »)

Filmer 1 vidéo (lien YouTube non répertorié) qui montre, pour CHAQUE scope, le flux complet OAuth → feature :

1. Se connecter sur https://keiroai.com, aller dans l'agent Email (Hugo).
2. Cliquer **Connecter Gmail** → montrer l'écran de consentement Google (les scopes affichés) → accepter.
3. Montrer un email **envoyé depuis l'adresse Gmail du client** (scope `gmail.send`).
4. Montrer une **réponse entrante lue** et la **réponse auto** rédigée par l'assistant (scope `gmail.readonly`).
5. Aller dans l'agent Avis (Théo) → **Connecter Google Business** → accepter → montrer un **avis récupéré**
   et une **réponse postée** (scope `business.manage`).
6. Montrer où **révoquer l'accès** (paramètres compte) + le lien Politique de confidentialité.

---

## 6. RÉPONSE à coller dans le fil Trust & Safety (FR)

> À envoyer UNE FOIS les actions §3, §4, §5 réellement faites. Remplacer les [crochets].

---

Bonjour,

Merci pour votre revue détaillée. Nous avons traité l'ensemble des points soulevés :

**1. Page d'accueil & propriété du domaine**
Nous avons validé la propriété de `keiroai.com` dans la Google Search Console avec le compte
propriétaire du projet Cloud de l'application. Le registrant WHOIS du domaine correspond désormais à
notre société. Sur l'écran de consentement OAuth, le domaine autorisé est `keiroai.com`, la page
d'accueil est `https://keiroai.com`, la politique de confidentialité `https://keiroai.com/legal/privacy`
et les conditions `https://keiroai.com/legal/terms`.

**2. Niveaux d'accès minimaux**
Nous avons réduit nos scopes au strict nécessaire et **ne demandons aucun scope restreint**. Nous avons
retiré `gmail.modify` et `gmail.readonly` ; la détection des réponses passe désormais par un `Reply-To`
routé vers notre pipeline (sans lire la boîte de l'utilisateur). Les scopes demandés et leur usage exact :
- `gmail.send` (sensible) — envoyer et répondre aux emails depuis l'adresse Gmail du client.
- `business.manage` (sensible) — lire les avis de la fiche Google Business du client et publier ses réponses.
- `userinfo.email` — identifier la boîte connectée.

**3. Règles de confidentialité & accès approprié aux données**
Notre politique de confidentialité (`https://keiroai.com/legal/privacy`, section 4.4) décrit
précisément chaque scope Google, les données consultées et leur finalité. Elle inclut l'engagement de
**Limited Use** : conformité à la Google API Services User Data Policy, aucune vente de données, aucun
usage publicitaire, **aucun entraînement de modèles d'IA/ML généralisés** sur les données Google, et
aucun accès humain hors consentement/sécurité/obligation légale.

**4. Vidéo de démonstration**
Vous trouverez ici une démonstration complète du parcours OAuth et de chaque fonctionnalité associée à
chaque scope : [LIEN VIDÉO YOUTUBE NON RÉPERTORIÉ].

**5. Consignes de marque**
L'écran de consentement affiche le nom « KeiroAI », notre logo officiel, un email de support
@keiroai.com et nos liens légaux, en cohérence avec le site.

Nous restons à votre disposition pour tout complément et vous remercions de poursuivre la vérification.

Bien cordialement,
[Nom], KeiroAI

---

## 7. Fait côté code (déployé)

- `lib/gmail-oauth.ts` — scope `gmail.modify` retiré (minimum scopes).
- `app/api/agents/email/poll-inbound/route.ts` — mark-read retiré (plus besoin de `modify`).
- `app/legal/privacy/page.tsx` — section 4.4 « Google Services — Gmail & Business Profile (Limited Use) »
  avec divulgation complète + non-entraînement IA + date mise à jour.
