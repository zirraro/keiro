# Option B — Gestion complète de la boîte Gmail : dossier de soumission

> **Objectif** : obtenir `gmail.modify` pour que Hugo gère la boîte du client
> (lire pour trier, corbeille, archiver, ranger en dossiers, brouillons et
> réponses). À terme c'est le SEUL mode : Option A (`gmail.send`) disparaît.

## Décision de périmètre (2026-07-30) — LIRE EN PREMIER

**On demande UN SEUL scope restreint : `gmail.modify`.**

Avant, le code demandait `gmail.readonly` + `gmail.compose` + `gmail.modify`.
C'est redondant : `gmail.modify` est un sur-ensemble des deux (« all read/write
operations except immediate, permanent deletion »). Vérifié contre **tous** les
appels réellement effectués par le code :

| Opération | Endpoint | Couvert par modify |
|---|---|---|
| Lister / lire les messages | `messages.list`, `messages.get` | ✅ |
| Archiver, marquer lu, étiqueter, déplacer | `messages/{id}/modify` | ✅ |
| Mettre à la corbeille | `messages/{id}/trash` | ✅ |
| Envoyer | `messages.send` | ✅ |
| Brouillons (créer / modifier / envoyer) | `drafts.*` | ✅ |
| Lister / créer des libellés | `labels.*` | ✅ |
| Identifier la boîte | `profile` | ✅ |

**Pourquoi ça compte** : Google contrôle la minimalité des scopes et rejette les
demandes qui se chevauchent. Trois scopes restreints à justifier au lieu d'un
seul, c'était un motif de refus gratuit — pour exactement la même capacité.

Scopes finaux de l'écran de consentement :
`gmail.modify` (restreint) · `business.manage` (sensible) ·
`userinfo.email` · `userinfo.profile` (non sensibles).
→ `gmail.send` est **retiré** : `modify` l'englobe.

## État du code — FAIT

- Scope gaté (`lib/gmail-oauth.ts`) : `gmail.modify` si `GMAIL_OPTION_B=on` **ou**
  toggle par utilisateur `full_mailbox`, sinon `gmail.send`. Prod inchangée tant
  que rien n'est activé.
- Toutes les primitives : `lib/gmail-read.ts` (lecture, trash, archive, label,
  move, star), `lib/gmail-oauth.ts` (brouillons, envoi), `lib/agents/mailbox-manager.ts`
  (triage complet avec classification et réponses).
- **Journalisation** de chaque accès (`logGoogleDataAccess`) — exigence CASA V7
  et Limited Use : on peut prouver ce qui a été lu et écrit, et quand.
- **Jamais de suppression définitive** : uniquement la corbeille, restaurable.
- Toggle par utilisateur, réversible : le client repasse en envoi seul quand il veut.
- Privacy policy à jour avec `gmail.modify` + clause Limited Use (section 4.4).
- UI de démonstration : `GmailNativeInbox` dans le panneau Hugo (liste des mails
  reçus + bouton de préparation de réponse) + `ReplyModeToggle` (auto/brouillon).
- Client OAuth secondaire possible (`GOOGLE_CLIENT_ID_OPTION_B`) pour filmer ou
  tester en mode Test sans toucher au client de production.

## Ce que TU dois faire, dans l'ordre

### Étape 0 — Prérequis vérifiables (avant de toucher à Google)
- [ ] **2FA activé** sur : compte Google propriétaire du projet, Supabase, OVH, GitHub. Google et le CASA le demandent, et c'est vérifié.
- [ ] Dernier run du workflow `security-audit` **sans High/Critical** (GitHub → Actions).
- [ ] `keiroai.com` toujours validé dans **Search Console** sous le compte propriétaire du projet GCP.
- [ ] Écran de consentement : nom « KeiroAI », logo, email de support @keiroai.com, page d'accueil `https://keiroai.com`, confidentialité `https://keiroai.com/legal/privacy`, CGU `https://keiroai.com/legal/terms`.

### Étape 1 — Console Google : le scope
1. console.cloud.google.com → projet KeiroAI → **APIs & Services → OAuth consent screen → Data access**.
2. **Add or remove scopes** : ajoute `https://www.googleapis.com/auth/gmail.modify`.
3. **Retire** `gmail.readonly`, `gmail.compose` et `gmail.send` s'ils y figurent (modify les couvre ; en laisser fait perdre la minimalité).
4. Garde `business.manage`, `userinfo.email`, `userinfo.profile`.
5. Enregistre → l'app repasse en « Verification required » pour `gmail.modify`.

### Étape 2 — Justification du scope (à coller tel quel)

> KeiroAI is an AI assistant for small local businesses (bakeries, restaurants,
> hair salons, florists, independent professionals). Our agent "Hugo" manages the
> business owner's mailbox on their behalf, because these owners have no
> assistant and no time: their inbox is buried under advertising and they miss
> real customer emails.
>
> With `gmail.modify`, Hugo performs exactly the operations a human assistant
> would: it reads each incoming message in order to classify it, moves
> advertising and newsletters to the trash, archives what is already handled,
> files the rest into folders (Prospects, Customers, Invoices, To handle), and
> either prepares a draft reply or sends a reply to genuine customer emails —
> according to a setting the user controls. When Hugo is unsure, it notifies the
> user instead of acting.
>
> We request `gmail.modify` alone rather than a combination of `gmail.readonly`,
> `gmail.compose` and `gmail.send`, because `gmail.modify` is the single minimum
> scope that covers all of the above; requesting several overlapping scopes would
> grant no less access.
>
> We never permanently delete data: messages are moved to the user's Gmail trash
> and remain restorable. Every read and every write performed on the user's
> behalf is logged with a timestamp, so the user can audit exactly what the
> assistant did. The feature is opt-in, per user, and reversible at any time —
> turning it off returns the integration to sending only. Google user data is
> never sold, never used for advertising, and never used to train or improve any
> generalized AI or ML model.

### Étape 3 — Vidéo de démonstration (obligatoire)

Règles strictes, une seule erreur = rejet automatique :
- **Écran de consentement OAuth en ANGLAIS** — règle le compte/navigateur en English AVANT de filmer.
- L'URL `keiroai.com` doit être **visible** dans la barre d'adresse.
- Le scope doit être **lisible** à l'écran : zoome 4-5 secondes sur la ligne
  « Read, compose, send and permanently delete all your email from Gmail ».
- Chaque capacité doit être **montrée en action**, pas décrite.

Déroulé à filmer (3 à 5 minutes, YouTube en « non répertorié ») :
1. Page d'accueil `keiroai.com`, puis connexion à l'app.
2. Panneau de Hugo → bouton de connexion Gmail → **écran de consentement en anglais**, zoom sur le scope.
3. **Lecture** : la boîte du client s'affiche dans KeiroAI (liste des messages reçus).
4. **Tri** : lancer le triage → montrer une pub partie à la corbeille, un message archivé, un message rangé dans un dossier créé par Hugo.
5. **Brouillon** : Hugo prépare une réponse à un vrai email → montrer le brouillon **dans Gmail**.
6. **Envoi** : basculer le réglage sur envoi automatique → montrer une réponse envoyée.
7. **Réversibilité** : montrer le toggle qui coupe la gestion complète, et le lien de déconnexion.
8. Filmer aussi `keiroai.com/legal/privacy` en descendant jusqu'à la section 4.4 (Limited Use + `gmail.modify`).

Pour filmer, il faut que le scope soit réellement demandé : passe
`GMAIL_OPTION_B=on` sur le VPS (ou utilise ton compte, qui a déjà le toggle
`full_mailbox`), filme, puis remets `off` si tu ne veux pas exposer les vrais
clients avant l'approbation.

### Étape 4 — CASA (obligatoire pour un scope restreint en production)
1. Google envoie une invitation vers un laboratoire agréé (souvent **TAC Security**).
2. Choisir **Tier 2 — self-scan + LOV (Letter of Validation)**.
3. Lancer le scan sur `keiroai.com` + fournir l'accès au dépôt si demandé.
4. Corriger tout **High/Critical** (rien de connu à ce jour ; le pack `docs/security/` couvre les réponses au questionnaire).
5. La LOV est valable 12 mois → **re-scan annuel** à prévoir.

### Étape 5 — Après approbation
1. `GMAIL_OPTION_B=on` dans `.env.local` du VPS, puis `bash scripts/deploy.sh`.
2. Chaque client existant doit **reconnecter Gmail** une fois (son token actuel ne porte que `gmail.send`).
3. Retirer le repli Option A du code une fois tous les clients migrés (le mode envoi seul n'aura plus de raison d'être).

## Rappel non-régression
- Flag off et toggle off = Option A pure. Rien ne change pour les clients actuels.
- Les primitives Option B renvoient `enabled:false` tant que rien n'est activé.

## Documents du pack sécurité (déjà écrits, à fournir sur demande)
`docs/security/` : politique de sécurité, rétention et suppression des données,
plan de réponse à incident, traitement des données utilisateur Google,
checklist ASVS L2, plan de remédiation.
