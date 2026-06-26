# CASA / Sécurité — état de préparation KeiroAI

> Préparation à l'évaluation Google CASA Tier 2 (basée sur OWASP ASVS) pour le scope restreint
> `gmail.readonly` (à activer plus tard). Sert aussi de durcissement sécurité général.
> Audit interne : 26 juin 2026.

---

## A. Checklist SAQ (Self-Assessment Questionnaire) — ce que l'auditeur va demander

### ✅ DÉJÀ EN PLACE (à valoriser)
- **Headers de sécurité HTTP complets** : HSTS (preload), CSP, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy — `next.config.ts` headers(). `poweredByHeader: false`.
- **TLS partout** : HTTPS forcé (HSTS), Supabase + APIs en HTTPS.
- **service_role jamais exposée au client** (aucune clé `NEXT_PUBLIC_*SERVICE_ROLE`).
- **Auth cron cohérente** : Bearer `CRON_SECRET` sur les 33 routes cron, rejet si secret absent/mismatch.
- **Auth admin** : pattern `is_admin` sur les routes sensibles.
- **Pas de secrets dans les logs** (tokens tronqués / jamais loggés).
- **`.env` non commité** (seul `.env.example` est suivi par git ; `.gitignore` couvre `.env*`).
- **Webhooks signés** : Stripe (`constructEvent`), WhatsApp (HMAC), Facebook data-deletion (signed_request).
- **Mot de passe SMTP chiffré** AES-256-GCM authentifié (`lib/smtp-crypto.ts`).

### ✅ CORRIGÉ LE 26 JUIN (commit f4729ee)
- **Chiffrement au repos des tokens OAuth Google** (Gmail + Google Business) : AES-256-GCM via
  `lib/token-crypto.ts` (réutilise la clé `SMTP_ENC_KEY` déjà présente — **aucun nouvel env requis**).
  Rétro-compatible : anciens tokens en clair lus tels quels, nouveaux écrits chiffrés, migration
  automatique au prochain refresh/reconnect.
- **Auth ajoutée sur `/api/admin/avatars`** (écrivait avec service_role sans contrôle admin).
- **Garde sur `/api/auth/reassociate`** : réassociation possible uniquement vers le compte authentifié
  dont l'email correspond (empêche l'appropriation de données orphelines).
- **Rejet des signatures webhook invalides** : Instagram (401 si signature présente ≠ attendue,
  comparaison timing-safe) + Resend (fail-closed si secret configuré mais signature absente/invalide).
- **Texte RGPD aligné** (data-deletion : « chiffrés au repos, AES-256-GCM »).

### ✅ CORRIGÉ LE 26 JUIN — BATCH 2 (commit b78ffbb)
- **Rate limiting** des endpoints publics : `lib/rate-limit.ts` (fenêtre par IP) appliqué à
  `webhooks/email-inbound` (120/min) et `freemium/capture-email` (10/min). Réutilisable partout via `enforceRateLimit`.
- **Routes ouvertes verrouillées** : `/api/ingest` et `/api/publish` exigent maintenant l'auth
  (écrivaient/relayaient sans aucun contrôle ; `publish` utilise désormais `user.id`, plus l'userId arbitraire du body).
- **Anti-injection PostgREST** : `lib/safe-filter.ts` (`pgSafe`/`phoneSafe`/`emailSafe`) appliqué au webhook WhatsApp.
- **Politique de divulgation** : `SECURITY.md` + `/.well-known/security.txt` (contact security@keiroai.com) — attendu par CASA.
- **Fuite d'erreur** : `/api/ingest` ne renvoie plus l'objet Postgrest brut.

### 🔧 BACKLOG restant (non bloquant pour la vérif gratuite ; à finir avant de soumettre `gmail.readonly`/CASA)
| Item | Sévérité | Plan SÛR |
|---|---|---|
| Chiffrer les tokens **Meta/TikTok/LinkedIn** | Haute | **Refactor d'abord, chiffrer ensuite.** 49 fetch directs sur 23 fichiers → chiffrer en écriture sans couvrir CHAQUE lecture casserait des intégrations client en prod. Étapes : (1) créer `lib/meta-api.ts`/`lib/tiktok-api.ts`/`lib/linkedin-api.ts` qui centralisent les appels + déchiffrent le token ; (2) migrer tous les call sites vers ces helpers ; (3) chiffrer en écriture + script de migration one-shot. À tester intégration par intégration. (Tokens Google déjà chiffrés.) |
| Rate limiting sur le reste (`widget/*`, `chatbot/message`) | Moyenne | Étendre `enforceRateLimit` (helper déjà prêt) |
| Sanitiser les autres `.or()/.ilike()` (`internal-source:93`, `knowledge-rag`) | Moyenne | `pgSafe()` (helper déjà prêt) |
| Suppression self-service réelle (`DELETE /api/me`) + purge sur callback FB | Moyenne | Route authentifiée qui efface profil/tokens/contenus |
| Validation `zod` sur routes publiques + écritures DB | Basse | Schémas déclaratifs |
| Wrapper d'erreur générique global | Basse | `{ error:'internal', errorId }` corrélé au log |
| Dépendances vulnérables | Moyenne | Audit complet = surtout outillage **dev/build** (supabase CLI, eslint) non embarqué en prod. Runtime : `ws` (pas de version 8.x non vulnérable pour l'instant), `xlsx` (pas de fix → remplacer par `exceljs` si utilisé). Certains fixes = breaking (`nodemailer@9`, `@vercel/blob@2`) → à traiter à part avec tests. |

---

## B. Google Cloud Console — annuler/débloquer la demande et tout faire accepter

### Où aller
`https://console.cloud.google.com/` → sélectionner LE projet de l'app → **APIs & Services → OAuth consent screen**
(et l'onglet **Verification Center** / « Centre de validation » si présent).

### 1. Annuler / retirer une demande de vérification bloquée
- Dans **OAuth consent screen**, si une vérification est « in progress » ou bloquée, clique **Cancel verification**
  (ou « Annuler la validation »). Ça remet l'app en mode **Testing** sans la supprimer.
- En mode **Testing** : ajoute les comptes de test dans **Test users** → l'app fonctionne pour eux SANS
  écran d'avertissement et SANS vérification (idéal pour avancer pendant qu'on prépare le dossier).
- Tu peux modifier les scopes / l'URL / le logo en mode Testing, puis **re-soumettre proprement**.

### 2. Re-soumettre pour faire accepter tous les scopes (version gratuite actuelle)
Comme on ne demande plus AUCUN scope restreint (interim), la vérif est **standard et gratuite** :
1. **OAuth consent screen** → User type **External**, statut **In production**.
2. Renseigner : App name `KeiroAI`, logo, support email @keiroai.com, **Authorized domains** `keiroai.com`,
   home `https://keiroai.com`, privacy `https://keiroai.com/legal/privacy`, terms `https://keiroai.com/legal/terms`.
3. **Scopes** : ne garder QUE `gmail.send`, `business.manage`, `userinfo.email`, `openid`/`profile`.
   **Supprimer** `gmail.readonly` et `gmail.modify` de la liste.
4. **Domain verification** : valider `keiroai.com` dans Search Console (DNS TXT) avec CE compte Google.
5. Soumettre → fournir la **vidéo démo** + les justifications de scopes (cf `google-oauth-verification.md`).
6. Répondre dans le fil Trust & Safety avec le texte fourni (`google-oauth-verification.md` §6).

### 3. Plus tard — activer `gmail.readonly` (lecture boîte) → déclenche CASA
1. Re-ajouter `gmail.readonly` dans `lib/gmail-oauth.ts` + écran de consentement + `GMAIL_INBOUND_POLL=on`.
2. Re-soumettre la vérif → Google demandera une **attestation CASA**.
3. Aller chez un assesseur agréé (cf section C), passer le **Tier 2 self-scan**, obtenir la **Letter of Validation** (12 mois), la transmettre à Google.

---

## C. CASA — fonctionnement & coût concret

- **CASA = Cloud Application Security Assessment**, requis 1×/an pour tout scope **restreint**.
- Google ne fait pas l'audit : un **assesseur tiers agréé** le fait (Leviathan/Bishop Fox, TAC Security, NCC, DEKRA…).
- **Déroulé** : demande de vérif → Google exige CASA → questionnaire SAQ sur la plateforme de l'assesseur
  → (Tier 2) scan automatisé de l'app → **Letter of Validation** valable 12 mois → transmise à Google.

| Tier | Pour qui | Coût indicatif/an |
|---|---|---|
| Tier 2 – self-scan | SaaS standard comme KeiroAI | **0 à ~1–2 k€** |
| Tier 2 – assisté | si scan insuffisant | ~2–6 k€ |
| Tier 3 – pentest complet | très haut risque (banque/santé) | 8–30 k€+ |

→ **KeiroAI = Tier 2 self-scan** réaliste. La checklist SAQ §A ci-dessus = ce qu'on prépare pour passer ce scan
du premier coup.

---

## D. SOC 2 / ISO 27001 — état & lien avec CASA

- **On N'A PAS** SOC 2 ni ISO 27001 aujourd'hui (ce sont des **certifications organisationnelles** auditées par
  un tiers, coûteuses : SOC 2 Type II ≈ 10–40 k€ + 6–12 mois ; ISO 27001 similaire).
- **On n'en a PAS besoin pour CASA** : Google **accepte** une attestation **CASA** (la voie la moins chère),
  OU **en alternative** un certificat **ISO 27001 / SOC 2 Type II** valide. Donc si un jour on obtient SOC 2 pour
  d'autres raisons (gros clients B2B qui l'exigent), il **remplace** CASA.
- **Reco** : rester sur **CASA Tier 2 self-scan** tant qu'on n'a pas de client entreprise qui exige SOC 2.
  Le durcissement de la §A nous rapproche aussi d'un futur SOC 2/ISO si besoin (mêmes contrôles).

**En clair** : aujourd'hui 0 € (interim sans scope restreint). CASA = quelques centaines d'€/an seulement quand
on activera la lecture complète de la boîte Gmail. SOC 2 = pas nécessaire, sauf exigence d'un gros client B2B.
