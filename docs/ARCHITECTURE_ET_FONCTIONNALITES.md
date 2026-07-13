# KeiroAI — Architecture, Fonctionnalités & Doctrines (état 13 juil 2026)

> Document de référence pour revue stratégique (Fable 5). Objectif : donner une vue complète de **ce qu'on fait**, **comment c'est construit**, **les fonctions par agent** et **les doctrines/stratégies** — afin d'évaluer à quel point nos axes d'amélioration/consolidation ont été challengés et bien adaptés.

---

## 1. Vision produit

KeiroAI = **une équipe d'agents IA marketing "clé en main" pour les commerces locaux et PME francophones**. Le commerçant délègue : création de contenu, publication multi-réseaux, prospection, réponses (DM/commentaires/avis), SEO, docs juridiques/finance. Promesse : *"remplace ton community manager + ton commercial + ton service client"*, exécution régulière, qualité constante, valeur business.

Marché cible (ICP) : instituts de beauté, restaurants, coiffeurs, boutiques, coachs, artisans, fleuristes, cavistes… Langue par défaut FR (i18n EN complet).

---

## 2. Stack technique

| Couche | Choix |
|---|---|
| Frontend/Backend | **Next.js (App Router, TypeScript)** — un seul monolithe, API routes + Server Components |
| Hébergement | **VPS OVH** (4 vCPU/8 Go, Gravelines) + **pm2** (app + worker) ; déploiement `git pull + build + pm2 reload` |
| Données | **Supabase** : Postgres + PostgREST + Storage (buckets médias) + Auth |
| Styles | **Tailwind v4** (`@custom-variant dark` sur classe `.dark`/`.light`, thème dark-first) |
| LLM | **Router multi-modèle** (`lib/agents/llm-router.ts`) : Claude Sonnet 4.6 (qualité), Haiku 4.5 (volume), Gemini (fallback + gros contexte) |
| Images | **Seedream** (génération éditoriale) + Supabase Image Transform (WebP display) |
| Vidéo/Reels | **Kling / Seedance** (image-to-video), montage Ken Burns multi-mouvements, mux audio |
| Audio | TTS + génération musique/narration (selon langue client) |
| Email | Chaîne de fallback **Brevo API → Resend → Brevo SMTP** (`sendEmailWithFallback`) |
| Paiement | **Stripe** (abonnements + add-ons + packs crédits) |

**Automatisation** : ~**35 crons** (scheduler central + jobs dédiés) — publication programmée, refresh trends, health scores, digests admin, remédiation auto, token lifecycle, tiktok health, video-poll, winback, trial-nurture, etc.

**Résilience** : `error-escalation` (log + RAG + analyse Claude + email admin), `auto-remediate` (marque emails sans MX invalides, auto-pause agents en tempête d'erreurs), `auto-fix`/`auto-improve`, garde-fous coût (budget caps, no-retry sur timeouts).

---

## 3. Les agents (roster & fonctions)

Chaque agent = persona nommé + panel dédié + doctrine. **Jamais "IA" dans la signature client-facing** ("Ton stratège", pas "ton strategist IA"). Agents proactifs (agissent automatiquement, ne demandent pas "raconte-moi ce que tu veux").

| Agent | Persona | Fonction |
|---|---|---|
| `content` | **Léna** | Génère visuels + reels (vrai mouvement i2v, QC anti-IA) + légendes/hooks, publie IG/TikTok/LinkedIn, planning 7–30 j, overlay texte, recyclage stories |
| `dm_instagram` | **Jade** | DM Instagram : **prospection** (prépare des DM personnalisés à envoyer manuellement — Meta interdit le cold auto), **conversations** (répond aux DM entrants), commentaires, comptes à suivre |
| `email` | **Hugo** | Prospection email (séquences value-first : conseil + aperçu article blog → clic ; relances de conversion ; pousse le plan Créateur), réponses inbound, brouillons multi-provider (Gmail/IMAP/Outlook) |
| `commercial` | **Léo** | Sourcing + qualification de prospects (Google Maps / scraping), **onglet prospection** : liste filtrable (activité/région/température), enchaînement d'appels, **édition de fiche CRM inline** (commentaire → `crm_prospects.notes` lu par tous les agents) |
| `gmaps` | **Théo (avis)** | Répond automatiquement aux avis Google (GBP), collecte d'avis, optimisation fiche |
| `seo` | **Théo (SEO)** | Rédige des articles blog optimisés (structure aérée obligatoire : tableaux/bullets/flèches), maillage interne, FAQ schema, images IA |
| `marketing` + `ceo` | **Ami** | Analyse cross-canal + stratégie, supervise tous les agents, briefs, ajuste selon objectifs |
| `chatbot` | **Clara** | Chatbot site web 24/7 (accueil, réponses, capture leads) + onboarding guidé + rétention |
| `rh` | **Sara** | Documents juridiques (CGV, RGPD, contrats, règlement intérieur) — éditeur + export à la marque |
| `comptable` | **Louis** | Business plans, prévisionnels, inventaires, budgets (Excel/PowerPoint à la marque). **Add-on 12€** ou inclus Business |
| `onboarding` | **Clara** | Profil business (dossier), plus il est complet, plus les agents sont précis |
| `instagram_comments` | — | Réponses auto personnalisées aux commentaires IG |
| `ads` | **Félix** | (bientôt) Meta/Google Ads |
| `whatsapp` | **Stella** | (bientôt, add-on 19€) WhatsApp Business — gated par `capability-status` (jamais facturé tant que "soon") |
| `tiktok_comments` | **Axel** | (bientôt) engagement communauté TikTok |
| `linkedin` | — | (bientôt) contenu + engagement LinkedIn B2B |

**Contexte partagé cross-agents** : les commentaires/notes sur une fiche prospect, le statut de canal (contacté sur tel réseau), la voix de marque (seed depuis le feed IG), le dossier business — tout est lu par les autres agents (coordination : follow=touch, inbound=toujours répondre, jamais de doublon multi-canal).

**Cerveaux partagés** (~80 modules `lib/agents/`) : `knowledge-rag` (apprentissage inter-agents), `sales-playbook` (langage par secteur), `hook-knowledge` (34 familles de hooks), `sector-knowledge`, `reach-strategy`, `client-language`, `scoring`, `prospect-qualification`/`-routes`/`-scraper`, `health-score`, `outcome-events` (moat data anonymisée), `channel-voice`, `business-timing`, etc.

---

## 4. Intégrations externes

- **Meta / Instagram** : Instagram Login (migré depuis OAuth Facebook), Graph API — publish (image/carrousel/reel/story), insights, comments, messages (`manage_messages` approuvé). Human Agent retiré (rejeté), indicateur 24/48/72h conservé.
- **TikTok** : Content Posting API — publication + flow de disclosure conforme UX guidelines. **Déclaration `is_aigc` obligatoire** (cause racine des 0 vues = contenu IA non déclaré ; déclarer = sans coût de portée).
- **LinkedIn** : OAuth + publication (bientôt élargi).
- **Google** : Business Profile (avis Théo), Search Console (SEO), OAuth (vérification Trust & Safety en cours — scopes minimisés + Limited Use).
- **Stripe** : abonnements (Créateur/Pro/Business + annuel), add-ons (Stella, Louis), packs crédits, coupons upsell.
- **Email** : Brevo (DKIM OK) + Resend backup ; SPF à compléter avec Brevo (action DNS).

---

## 5. Modèle économique & pricing

- Plans : **Créateur 49€ / Pro 99€ / Business 139€** (+ annuel = 2 mois offerts, onglet annuel pré-sélectionné). Add-ons : **Stella 19€** (WhatsApp), **Louis 12€** (finance). Packs de crédits ponctuels.
- **Modèle crédits** : chaque génération (image/vidéo/post) consomme des crédits ; marge pilotée (~80% cible sur Pro), coût par post suivi, alertes admin marge.
- **Essai** : cold = génération gratuite sans carte (`/generate`) ; essai 7 j avec carte (0€ débité) mentionné seulement quand on parle d'automatisation.
- **Anti-gaspillage** : budget caps sur APIs coûteuses (Places, vision QC), thinking sélectif, Sonnet→Haiku sur le volume, crons consolidés (46→9 sur un axe).

---

## 6. Doctrines & stratégies (le "moat")

1. **Qualité contenu (north star)** : réalisme anti-IA (personnes diverses, photo réaliste, jamais "IA" dans les captions), reels = **vrai mouvement i2v** + Ken Burns, **QC vision gate** (realism≥5 ET motion≥4, sinon rejet), cap overlay 20%, cohérence visuel-texte, préservation du lieu réel du client, réutilisation d'assets pénalisée. Qualité MAX / générations MIN.
2. **Prospection conforme** : DM cold = **préparés, envoi manuel** (Meta interdit l'auto) ; email = **valeur d'abord** (blog → clic → visite) puis conversion ; CRM jamais supprimé (dead/perdu seulement).
3. **Système commercial 4 étages** : ICP → qualification → routes → playbook/démo, avec feeders de signaux (dormance Insta, avis, géo) pour prioriser.
4. **TikTok** : déclaration AIGC systématique, stratégie de portée compte neuf, A/B republication reels 0-vues sur IG.
5. **SEO/Blog** : 88 articles catégorisés par métier, **forme aérée obligatoire** (tableaux/bullets/flèches, paragraphes courts, mobile-first), meta optimisées, liens cold→article.
6. **Personal branding** : média réel requis, jamais de visage IA.
7. **Data moat** (légal) : données anonymisées (K-anon=10) pour affiner LLM/vision.
8. **Résilience/observabilité** : digests admin (santé, coût, marge), auto-remédiation, escalade + partage de connaissance dans le RAG pour auto-réparation.

---

## 7. Axes d'amélioration / consolidation identifiés (à challenger par Fable 5)

Points ouverts / en cours où un regard critique est demandé :

- **Consolidation des agents** : 17 personas — lesquels fusionner/prioriser ? (ex : Théo joue avis + SEO ; Clara joue chatbot + onboarding + présentation d'agents).
- **i18n** : surfaces agents + CRM traduites ; reste une traîne mineure (quelques forms internes).
- **Délivrabilité email** : SPF à aligner sur Brevo ; validation MX + bounce→invalid déjà en place ; DMARC `p=none` (à durcir ?).
- **Stripe** : plans mensuels OK ; **annuel Créateur/Pro à créer**, **packs crédits à créer**, add-on Louis câblé (prix à créer).
- **Fonctions "bientôt"** : Ads (Félix), WhatsApp (Stella, BSP), TikTok comments (Axel), LinkedIn — priorisation ?
- **Throttle TikTok** : cause racine (AIGC non déclaré) corrigée — valider l'effet réel sur un compte neuf.
- **Coût/marge** : arbitrage qualité vs coût de génération (i2v, vision QC) — jusqu'où pousser ?
- **Onboarding self-serve** : Clara guide jusqu'au 1er post live — taux d'activation ?

---

## 8. Questions pour Fable 5

1. Notre découpage **fonctions par agent** est-il optimal, ou faut-il consolider ? Lesquels ?
2. La **stratégie email value-first** (blog → conversion) est-elle la bonne priorité vs une approche plus directe ?
3. Le **système commercial 4 étages** couvre-t-il les bons signaux, ou en manque-t-on (intention, timing) ?
4. L'**architecture monolithe Next.js + VPS mono-nœud** tient-elle la montée en charge, ou faut-il découpler (worker queue, multi-région) ?
5. Le **modèle crédits + marge** est-il lisible côté client et sain côté unit-economics ?
6. Où sont nos **angles morts** de conformité (Meta/TikTok/Google/RGPD) avant de scaler le démarchage ?
