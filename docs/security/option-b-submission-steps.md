# Option B (Gmail readonly + compose) — étapes de soumission détaillées

> Objectif : obtenir les scopes RESTREINTS `gmail.readonly` + `gmail.compose`
> pour la gestion complète de la boîte mail (lecture native + brouillons natifs),
> SANS casser l'Option A (`gmail.send`) déjà approuvée et en prod.
>
> Principe de non-régression : **tout le code Option B est gaté derrière
> `GMAIL_OPTION_B`**. Tant que ce flag n'est pas `on`, l'app demande uniquement
> `gmail.send` et se comporte exactement comme aujourd'hui. On n'active le flag
> qu'APRÈS l'approbation Google.

## État du code (fait)
- Scopes gatés (`lib/gmail-oauth.ts`) : `readonly`+`compose` si `GMAIL_OPTION_B=on`, sinon `send`.
- Primitives natives gatées (`lib/gmail-read.ts`) : `listRecentGmail` (readonly) + `createGmailDraft` (compose), inertes si flag off.
- Endpoints gatés (`/api/me/gmail-inbox` GET+POST) : renvoient `enabled:false` tant que le flag est off.
- Journalisation d'accès Google (`logGoogleDataAccess`) sur chaque lecture/brouillon (exigence CASA V7 + Limited Use).
- Pack docs sécurité (`docs/security/`) : politique, rétention/suppression, incident, data-handling, checklist ASVS L2.

## Ordre des opérations (à faire — toi)

### Étape 0 — Prérequis (avant de toucher à Google)
- [ ] **MFA/2FA** activé et prouvable sur : compte Google (owner), Supabase, OVH, GitHub. (CASA #4)
- [ ] Le workflow `security-audit` passe sans High/Critical (onglet Actions → dernier run). (CASA #10)
- [ ] Privacy policy live liste bien `gmail.readonly` + `gmail.compose` + clause **Limited Use**. (déjà : keiroai.com/legal/privacy — vérifier que les 2 scopes y figurent)

### Étape 1 — Google Cloud Console (ajout des scopes)
1. console.cloud.google.com → projet KeiroAI → **APIs & Services → OAuth consent screen**.
2. **Data access → Add or remove scopes** → ajoute :
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`
   (garde `gmail.send`, `userinfo.email`, `userinfo.profile`)
3. **Save** → l'app repasse en **"Verification required"** pour les 2 nouveaux scopes.
4. Renseigne, pour chaque scope restreint, la **justification** (voir textes prêts plus bas).

> ⚠️ Ne PAS activer `GMAIL_OPTION_B` encore. La prod continue en `gmail.send`.

### Étape 2 — Vidéo de démonstration (obligatoire)
Google exige une vidéo (YouTube non répertorié) montrant :
1. L'écran de consentement OAuth (en anglais) avec **les 2 scopes** demandés.
2. `gmail.readonly` EN ACTION : la boîte du client s'affiche dans KeiroAI (Hugo lit les réponses des prospects).
3. `gmail.compose` EN ACTION : Hugo crée un **brouillon dans le dossier Brouillons Gmail** du client, que le client relit puis envoie.
4. Le lien vers la **privacy policy** + clause Limited Use.

> Pour filmer : activer `GMAIL_OPTION_B=on` sur un environnement de test (ou brièvement), connecter un compte Gmail de test, montrer inbox + brouillon via l'UI Hugo. Puis remettre off.

### Étape 3 — CASA (Cloud Application Security Assessment) Tier 2
1. Depuis la Console, quand Google le demande pour les scopes restreints → tu es dirigé vers **CASA** (via un assesseur autorisé, ex. **TAC Security / affiliés**, ou l'auto-scan approuvé).
2. Fournis les docs de `docs/security/` (politique sécu, rétention, incident, data-handling, checklist ASVS L2).
3. Lance le **scan statique + dynamique** sur keiroai.com → corrige tout **High/Critical** (plan : `remediation-plan.md`).
4. À la fin → **Letter of Validation (LOV)**, valable 12 mois, transmise à Google.

### Étape 4 — Attendre l'approbation Google
- Verification restreinte = plusieurs semaines. Tant que ce n'est pas approuvé, **ne pas** flip le flag.

### Étape 5 — Activation (le jour où Google approuve)
```bash
ssh root@51.68.226.25
cd /opt/keiro
grep -q GMAIL_OPTION_B .env.local || echo 'GMAIL_OPTION_B=on' >> .env.local
bash scripts/deploy.sh   # rebuild
```
- Les clients qui reconnectent Gmail verront le nouvel écran (readonly+compose).
- Les clients déjà connectés en `gmail.send` gardent leur token ; on peut demander une reconnexion pour élargir le scope.

## Justifications de scope (prêtes à coller dans la Console)

**gmail.readonly**
> KeiroAI reads the incoming emails in the user's mailbox solely to detect and surface replies from the user's own prospects/customers, so our assistant "Hugo" can draft accurate, context-aware responses on the user's behalf. We do not modify, label, archive or delete any message. Data is used only to provide this in-app feature to the user, per Google Limited Use.

**gmail.compose**
> KeiroAI creates and updates email drafts in the user's Gmail Drafts folder so the user can review and send them from their own account. This powers the "prepare a reply for me to approve" workflow. We never send without the user's action for this scope. Data is used only to provide this feature to the user, per Google Limited Use.

## Rappel non-régression
- `GMAIL_OPTION_B` off = Option A pure (aujourd'hui). Rien ne change pour les clients actuels.
- Aucun code de production n'appelle Gmail readonly/compose tant que le flag est off (vérifié : les primitives renvoient `enabled:false`).
