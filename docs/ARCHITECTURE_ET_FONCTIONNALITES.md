# KeiroAI — Architecture, Fonctionnalités & Doctrines (état 13 juil 2026)

> Document de référence pour revue stratégique (Fable 5). Objectif : donner une vue **exacte et à jour** de ce qu'on fait, comment c'est construit, les fonctions par agent et les doctrines — pour évaluer à quel point nos axes d'amélioration/consolidation ont été challengés et bien adaptés.
>
> **Source de vérité** : `lib/agents/client-context.ts` (catalogue + visibilité), `lib/agents/avatar.ts` (personas), code de production.

---

## 1. Vision produit

KeiroAI = **une équipe d'agents IA marketing "clé en main" pour les commerces locaux et PME francophones**. Le commerçant délègue : création & publication de contenu, prospection, réponses (DM/commentaires/avis), présence Google, docs RH/finance. Promesse : *"remplace ton community manager + ton commercial + ton service client"*. Exécution régulière, qualité constante, valeur business. Langue par défaut FR (i18n EN complet).

Marché cible (ICP) : instituts de beauté, restaurants, coiffeurs, boutiques, coachs, artisans, fleuristes, cavistes…

---

## 2. Stack technique

| Couche | Choix |
|---|---|
| App | **Next.js (App Router, TypeScript)** — monolithe, API routes + Server Components |
| Hébergement | **VPS OVH** (4 vCPU/8 Go) + **pm2** (app + worker) ; déploiement `git pull + build + pm2 reload` |
| Données | **Supabase** : Postgres + PostgREST + Storage + Auth |
| Styles | **Tailwind v4** (dark-first, `@custom-variant dark` sur `.dark`/`.light`) |
| LLM | **Router multi-modèle** : Claude Sonnet 4.6 (qualité), Haiku 4.5 (volume), Gemini (fallback/gros contexte) |
| Images | **Seedream** + Supabase Image Transform (WebP display) |
| Reels/vidéo | **Kling / Seedance** (image-to-video) + Ken Burns multi-mouvements + mux audio |
| Email | Fallback **Brevo API → Resend → Brevo SMTP** |
| Paiement | **Stripe** (abonnements + add-ons + packs crédits) |

**Automatisation** : ~35 crons (scheduler + jobs dédiés : publication programmée, trends, health scores, digests admin, auto-remédiation, token lifecycle, tiktok health, video-poll, winback, trial-nurture…). **Résilience** : escalade d'erreurs (log + RAG + analyse Claude + email admin), auto-remédiation (emails sans MX → invalides, auto-pause agent en tempête d'erreurs), garde-fous coût.

---

## 3. Les agents — VÉRITÉ À JOUR

Principe clé : on a **consolidé agressivement**. Beaucoup de personas historiques ont été **absorbés** dans un agent-parent pour simplifier l'offre client. Ce qui suit distingue clairement **ce que le client voit/achète** de ce qui tourne en **back-office**.

### 3.1 — Agents visibles par le client : **10** (dont **8 payants** + **2 gratuits**)

| Agent (id) | Persona | Fonction | Plan mini |
|---|---|---|---|
| `marketing` | **Ami** | Directrice stratégie : analyse cross-canal, recommande, coordonne les agents | **Gratuit** |
| `onboarding` | **Clara** | Onboarding + suivi long terme (inactivité, milestones) — *inclut le chatbot site web et le moteur de rétention* | **Gratuit** |
| `content` | **Léna** | Publie IG/TikTok/**LinkedIn**, génère visuels + reels (vrai i2v, QC anti-IA), légendes, planning 7–30 j, overlay | Créateur (49€) |
| `dm_instagram` | **Jade** | DM + commentaires + engagement sur **IG, TikTok ET LinkedIn** dans un seul espace. Prospection = DM préparés à envoyer manuellement (Meta interdit le cold auto) ; conversations entrantes auto | Créateur |
| `email` | **Hugo** | Prospection email value-first (conseil + aperçu blog → clic ; relances conversion ; pousse Créateur), réponses inbound, brouillons multi-provider | Créateur |
| `commercial` | **Léo** | Sourcing/qualification prospects (Google Maps), onglet prospection filtrable (activité/région/température), appels enchaînés, **édition fiche CRM inline** partagée à tous les agents | Créateur |
| `rh` | **Sara** | RH & juridique : contrats, CGV, RGPD, conseils prud'hommes/QVT, docs à la marque | Créateur |
| `gmaps` | **Théo** | Réputation **& SEO** : répond aux avis Google, optimise la fiche GBP, référencement local + blog SEO (*a absorbé Oscar/SEO*) | Créateur |
| `whatsapp` | **Stella** | WhatsApp Business (confirmations, rappels anti no-show). Inclus Business **ou add-on 19€/mois** | Business (139€) |
| `comptable` | **Louis** | Finance : business plans, prévisionnels, Excel/PowerPoint à la marque. Inclus Business **ou add-on 12€/mois** | Business |

→ **8 agents "en vente"** (Léna, Jade, Hugo, Léo, Sara, Théo, Stella, Louis) + **Ami & Clara offerts** (stratégie + activation) pour donner de la valeur dès le plan gratuit.

### 3.2 — Back-office (non exposés au client)

| id | Rôle | Statut |
|---|---|---|
| `ceo` (**Noah**, alias Ami) | **Orchestrateur** : coordonne les agents, stratégies globales | `background` (invisible) |
| `ads` (**Félix**) | Meta/Google Ads | `admin_only` — **réservé fondateur, PAS commercialisé** |
| `tiktok_comments` (Axel) | Engagement TikTok | `admin_only` — **absorbé dans Jade** |
| `linkedin` (Emma) | LinkedIn | `admin_only` — **absorbé dans Léna/Jade** |
| `seo` (Oscar) | SEO | `admin_only` — **absorbé dans Théo** |
| `chatbot` / `retention` | Widget site + relances | `admin_only` — **fusionnés dans Clara** |
| `qa` | Testeur qualité auto | `admin_only` — outil interne |

**Bilan consolidation** : de ~17 personas historiques → **8 agents vendables** + 2 gratuits côté client, le reste tournant en coulisse ou fusionné. La complexité produit a déjà été fortement réduite.

### 3.3 — Cerveaux partagés (~80 modules `lib/agents/`)

`knowledge-rag` (apprentissage inter-agents), `sales-playbook` (langage par secteur), `hook-knowledge` (34 familles de hooks), `sector-knowledge`, `reach-strategy`, `scoring`, `prospect-qualification/-routes/-scraper`, `health-score`, `outcome-events` (data moat anonymisée K-anon=10), `channel-voice`, `client-language`, `business-timing`, `fiche-completeness`, etc. + contexte partagé cross-agents (note prospect lue par tous, statut de canal, voix de marque, dossier business).

---

## 4. Intégrations externes

- **Meta / Instagram** : Instagram Login + Graph API — publish (image/carrousel/reel/story), insights, comments, messages (`manage_messages` approuvé). Human Agent retiré (rejeté), indicateur 24/48/72h conservé.
- **TikTok** : Content Posting API + disclosure conforme. **Déclaration `is_aigc` obligatoire** (cause racine des 0 vues = IA non déclarée ; déclarer = sans coût de portée).
- **LinkedIn** : OAuth + publication (via Léna/Jade).
- **Google** : Business Profile (avis Théo), Search Console (SEO), OAuth (vérification Trust & Safety en cours — scopes minimisés + Limited Use).
- **Stripe** : abonnements + add-ons (Stella, Louis) + packs crédits + coupons.
- **Email** : Brevo (DKIM OK) + Resend backup ; SPF à compléter avec Brevo.

---

## 5. Modèle économique & pricing

- Plans publics : **Créateur 49€ / Pro 99€ / Business 139€** (+ annuel = 2 mois offerts, onglet annuel pré-sélectionné). Add-ons : **Stella 19€**, **Louis 12€**. Packs de crédits ponctuels.
- **Crédits** : chaque génération (image/vidéo/post) consomme des crédits ; marge pilotée (~80% cible Pro), coût/post suivi, alertes admin marge.
- **Essai** : cold = génération gratuite sans carte (`/generate`) ; essai 7 j avec carte (0€ débité) mentionné seulement quand on parle d'automatisation.
- **Anti-gaspillage** : budget caps sur APIs coûteuses, thinking sélectif, Sonnet→Haiku sur le volume, crons consolidés.

---

## 6. Doctrines & stratégies (le "moat")

1. **Qualité contenu (north star)** : anti-IA (personnes diverses, photo réaliste, jamais "IA" dans les captions), reels = **vrai mouvement i2v** + Ken Burns, **QC vision gate** (realism≥5 ET motion≥4 sinon rejet), cap overlay 20%, cohérence visuel-texte, préservation du lieu réel du client, réutilisation d'assets pénalisée. Qualité MAX / générations MIN.
2. **Prospection conforme** : DM cold = **préparés, envoi manuel** ; email = **valeur d'abord** (blog → clic → visite) puis conversion ; CRM jamais supprimé (dead/perdu seulement).
3. **Système commercial 4 étages** : ICP → qualification → routes → playbook/démo, + feeders de signaux (dormance Insta, avis, géo).
4. **TikTok** : AIGC systématique, stratégie portée compte neuf, A/B republication reels 0-vues sur IG.
5. **SEO/Blog** : 88 articles catégorisés par métier, **forme aérée obligatoire** (tableaux/bullets/flèches, mobile-first), meta optimisées, cold→article.
6. **Personal branding** : média réel requis, jamais de visage IA.
7. **Data moat** (légal) : données anonymisées pour affiner LLM/vision.
8. **Résilience/observabilité** : digests admin (santé/coût/marge), auto-remédiation, escalade + partage de connaissance dans le RAG.

---

## 7. Axes d'amélioration / consolidation (à challenger par Fable 5)

- **Consolidation agents** : déjà bien avancée (17→8 vendables). Reste-t-il à fusionner (ex : Léo prospection ↔ Hugo email ↔ Jade DM = un "pôle acquisition" unifié ?) ou au contraire à re-séparer pour la lisibilité ?
- **i18n** : surfaces agents + CRM traduites ; traîne mineure (quelques forms internes).
- **Délivrabilité email** : SPF à aligner sur Brevo ; validation MX + bounce→invalid en place ; DMARC `p=none` (durcir ?).
- **Stripe** : mensuel Créateur/Pro/Business OK + Business annuel + add-on Stella ✓. **À créer** : annuel Créateur/Pro, prix add-on Louis, prix packs crédits, coupon upsell Pro.
- **Fonctions non commercialisées** : Ads (Félix, fondateur only) — à ouvrir un jour ?
- **Throttle TikTok** : cause racine (AIGC) corrigée — valider l'effet sur compte neuf.
- **Coût/marge** : arbitrage qualité vs coût de génération (i2v, vision QC).
- **Onboarding self-serve** : Clara guide jusqu'au 1er post live — taux d'activation ?

---

## 8. Questions pour Fable 5

1. Notre consolidation **8 agents vendables** est-elle optimale, ou faut-il regrouper davantage (pôle acquisition) / clarifier davantage ?
2. La **stratégie email value-first** (blog → conversion) est-elle la bonne priorité vs une approche plus directe ?
3. Le **système commercial 4 étages** capte-t-il les bons signaux (intention, timing) ?
4. L'**architecture monolithe Next.js + VPS mono-nœud** tient-elle la montée en charge, ou découpler (worker queue, multi-région) ?
5. Le **modèle crédits + marge** est-il lisible client et sain en unit-economics ?
6. Où sont nos **angles morts conformité** (Meta/TikTok/Google/RGPD) avant de scaler le démarchage ?
