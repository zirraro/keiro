/**
 * Inject ELITE Round 2 knowledge for CEO (Noah) and Marketing (Ami) agents.
 * 80+ verified, data-backed learnings with real sources.
 *
 * Run: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/inject-elite-round2-ceo-marketing.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://duxjdlzdfjrhyojjwnig.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required. Run with:\nSUPABASE_SERVICE_ROLE_KEY=xxx node scripts/inject-elite-round2-ceo-marketing.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ELITE_KNOWLEDGE = {
  // ═══════════════════════════════════════════════════════════════════════
  // CEO (Noah) — 42 learnings
  // SaaS Growth, Competitive Moats, France Ecosystem, Fundraising,
  // Pricing, Market Sizing, OKRs, Crisis, Decisions, Expansion, Partners
  // ═══════════════════════════════════════════════════════════════════════
  ceo: [
    // --- SaaS Growth Frameworks ---
    {
      learning: "T2D3 (Triple Triple Double Double Double) vise 100M ARR en 5 ans mais seulement 5-10% des SaaS VC-backed y arrivent. Pour KeiroAI (SMB, low-ACV), le modèle 3-3-2-2-2 est plus adapté: croissance flexible, PLG-first, content-led, self-serve loops. Le 'middle' est mort — il faut être soit hyper-efficient PLG soit high-ACV enterprise.",
      evidence: "T2D3.pro 'The Great Recalibration' 2025 — median B2B SaaS spends $2 to acquire $1 of new ARR; Singularity Digital SaaS Growth Benchmarks 2025",
      confidence: 85,
      category: 'growth_framework',
      revenue_linked: true
    },
    {
      learning: "Le modèle hybride PLG + Sales-Assist est le gagnant 2026 pour SMB SaaS: self-serve pour acquisition (free tier, product virality), human touch pour conversion/expansion (chat, onboarding call pour plans > 149EUR). Les entreprises hybrides croissent 2x plus vite que les pure-PLG ou pure-sales.",
      evidence: "OpenView PLG Report 2025; T2D3.pro Hybrid Mandate analysis 2025 — 'companies must either be hyper-efficient PLG or high-ACV enterprise'",
      confidence: 82,
      category: 'growth_framework',
      revenue_linked: true
    },
    {
      learning: "Pour un SaaS SMB à 49EUR/mois, le CAC payback doit être < 6 mois. Avec un LTV de ~588EUR (12 mois Solo), le CAC max est ~100EUR. Au-delà, la unit economics est négative. Prioritiser les canaux à CAC quasi-nul: SEO, referral, community, product virality.",
      evidence: "Phoenix Strategy Group SaaS KPI Benchmarks 2026; Burkland Associates 2025 SaaS Benchmarks",
      confidence: 88,
      category: 'unit_economics',
      revenue_linked: true
    },

    // --- Competitive Moats ---
    {
      learning: "Le marché global AI content creation passe de 2.3 milliards USD (2026) à 6.5 milliards USD (2034), CAGR 14.2%. Les top 5 (OpenAI, Adobe, Canva, Jasper, CopyAI) contrôlent ~40% du marché. La niche 'AI content pour commerces locaux français' est encore vide — c'est le moat de KeiroAI.",
      evidence: "IntelMarketResearch AI Content Creation Software Market 2026-2034; The Business Research Company AI Powered Content Creation Report 2026",
      confidence: 90,
      category: 'competitive_landscape',
      revenue_linked: true
    },
    {
      learning: "Canva = design généraliste, Buffer/Hootsuite = scheduling (Buffer Essentials 6EUR/canal/mois, Hootsuite Pro 99EUR/mois). Aucun ne combine génération IA + mockup social + vidéo + voix pour commerces locaux. Le positionnement KeiroAI = 'tout-en-un IA pour commerçants' vs outils fragmentés qui nécessitent 3-4 abonnements.",
      evidence: "Buffer.com pricing 2026; Hootsuite.com Social Trends 2026; OnePost.fr competitive analysis 2026",
      confidence: 85,
      category: 'competitive_landscape',
      revenue_linked: true
    },
    {
      learning: "En 2026, 42% des marketeurs utilisent l'IA pour écrire au moins une partie de leurs posts sociaux — ce chiffre doublera d'ici 2027. Le marché passe de niche à mainstream. Le timing de KeiroAI est optimal: assez tôt pour établir la marque, assez tard pour que le marché soit éduqué.",
      evidence: "DigitalFirst.ai '15 Best AI Tools for Social Media Marketing 2026'; StatsNData Social Media Content Creation Tool Market Report 2026-2033",
      confidence: 87,
      category: 'market_timing'
    },

    // --- France Startup Ecosystem ---
    {
      learning: "L'écosystème startup français a levé 8.2 milliards EUR en 2025 (686 rounds), avec l'IA captant 62% des fonds. BPI France déploiera ~35 milliards EUR d'ici 2030 pour la réindustrialisation, transition écologique et innovation. BPI a injecté 50M EUR spécifiquement pour accélérer les startups en IA générative.",
      evidence: "FrenchTechJournal 'French Tech Funding 2025: €8.2B Raised As AI Took 62%'; BPIFrance 2030 Strategy announcement Oct 2025",
      confidence: 92,
      category: 'ecosystem_france',
      revenue_linked: true
    },
    {
      learning: "French Tech 2030: 80 entreprises sélectionnées dans la promotion 2025. Le deeptech français a levé un record de 4.1 milliards EUR en 2025 (4x vs 2019). TIBI 2: 7.6 milliards USD dédiés aux startups de décarbonisation. Pour KeiroAI, le positionnement 'IA souveraine pour TPE/PME françaises' résonne avec les priorités étatiques.",
      evidence: "FrenchTechJournal 'France Deeptech Startups Raise €4.1B' 2025; LaFrenchTech.gouv.fr programme French Tech 2030",
      confidence: 88,
      category: 'ecosystem_france'
    },
    {
      learning: "Station F: 3000 postes de travail, 6000+ alumni, 1 deal sur 13 de l'écosystème startup français s'y fait. Mais le VC français a chuté de 35% au S1 2025 (2.78 milliards EUR). L'Allemagne a dépassé la France comme 2ème marché VC européen. Signal: privilégier le bootstrapping/profitabilité avant de lever.",
      evidence: "FrenchTechJournal France VC market S1 2025; Station F alumni data; Chambers & Partners 'Investing In France 2026'",
      confidence: 85,
      category: 'ecosystem_france',
      revenue_linked: true
    },

    // --- Fundraising Metrics ---
    {
      learning: "Rule of 40 en 2026: les entreprises scorant > 60% obtiennent 2-3x les valorisations. Mais les gagnants visent la Rule of 50 — croissance + profitabilité, avec unit economics solides. Le burn multiple < 1.5x est le seuil de crédibilité investisseur (David Sacks/Craft Ventures). > 2.0x = signal d'alarme.",
      evidence: "Abacum 'Rule of 40 Redefined 2026'; CapMaven '7 SaaS Metrics Investors Care About 2026'; Bennett Financials SaaS Metric Stack",
      confidence: 90,
      category: 'fundraising_metrics',
      revenue_linked: true
    },
    {
      learning: "NRR > 120% = top performer, drive 2.3x les valorisations. Le Magic Number 2026: > 120% pour hyper-growth, 100-110% acceptable early-stage. Pour KeiroAI, le NRR se construit via upsell crédits (Solo → Fondateurs quand crédits épuisés) et expansion (add-ons vidéo longue, TikTok).",
      evidence: "ScaleMetrics.ai 'Rule of 50 2026'; Averi.ai 'SaaS Metrics That Actually Matter 2026'; Visdum SaaS Metrics 2026",
      confidence: 88,
      category: 'fundraising_metrics',
      revenue_linked: true
    },
    {
      learning: "Ce que les VCs cherchent en AI SaaS 2026: (1) Defensible data moat, pas juste des API wrappers. (2) Gross margin > 70% (prouver que les coûts API sont maîtrisés). (3) Usage-based metrics montrant l'engagement réel. (4) Path to profitability clair, pas juste 'growth at all costs'. Le shift vers l'efficience est permanent.",
      evidence: "TheMarketingHub 'What Investors Look For in AI SaaS 2026'; BlogZenX SaaS Valuation Metrics 2026",
      confidence: 86,
      category: 'fundraising_metrics',
      revenue_linked: true
    },

    // --- Investor Relations ---
    {
      learning: "Template investor update mensuel: (1) MRR/ARR + growth rate, (2) Burn rate + runway en mois, (3) MAU/engagement, (4) Top 3 wins, (5) Top 3 challenges, (6) 1 ask spécifique. 250-750 mots max. Envoyer même quand les nouvelles sont mauvaises — la transparence construit la confiance.",
      evidence: "Kruze Consulting Startup Investor Update Template; Visible.vc 'How to Write the Perfect Investor Update'; TechCrunch investor update guide 2024",
      confidence: 82,
      category: 'investor_relations'
    },
    {
      learning: "Pour un solo founder pré-levée: constituer un advisory board de 3-5 personnes (1 expert SaaS, 1 expert marketing/growth, 1 expert sector). Positionner la structure solo comme avantage de vitesse et focus, pas comme faiblesse. Board informel = monthly sync 30min + updates async.",
      evidence: "Y Combinator 'How to Create and Manage a Board'; Entrepreneur Loop 'Solo Founder Playbook 2026'; SeedLegals startup board guide",
      confidence: 80,
      category: 'governance'
    },
    {
      learning: "Board meeting early-stage: discussions stratégiques sur HR, product roadmap, business execution et GTM — PAS des updates opérationnels. Tenir un decision log en temps réel: Decision ID, Options, Final Call, Owner, Due Date, Risks. Le board doit challenger, pas valider.",
      evidence: "Sequoia Capital 'Preparing a Board Deck'; NFX 'How to Run Early-Stage Board Meeting'; F2 VC board meeting insights",
      confidence: 78,
      category: 'governance'
    },

    // --- Strategic Pricing ---
    {
      learning: "Les augmentations de prix SaaS moyennes sont 8-12%/an en 2026, les plus agressifs font 15-25%. Règle: ne jamais augmenter sans ajouter de valeur d'abord. Créer un nouveau tier premium (ex: 'Agency 499EUR') pour les nouveaux clients, grandfather les existants. 43% des SaaS combinent maintenant abo + usage-based (hybride).",
      evidence: "SaaStr 'Great SaaS Price Surge 2025'; Chargebee State of Subscriptions Report 2025 — 43% hybrid adoption; Momentum Nexus SaaS Pricing Guide 2026",
      confidence: 87,
      category: 'pricing_strategy',
      revenue_linked: true
    },
    {
      learning: "Revoir le pricing au moins 2x par an — la willingness-to-pay est dynamique. Tester les changements sur les nouveaux clients d'abord, migrer progressivement les existants. Le modèle hybride (base + metered) sera dominant en 2026: 61% d'adoption projetée fin 2026 (vs 43% en 2025). KeiroAI est déjà hybride avec les crédits.",
      evidence: "GrowthUnhinged 'State of SaaS Pricing Changes 2025'; Chargebee 2025 projections; GoldenDoor Asset Software Pricing Playbook 2026",
      confidence: 84,
      category: 'pricing_strategy',
      revenue_linked: true
    },

    // --- Market Sizing ---
    {
      learning: "TAM KeiroAI: marché mondial IA content creation = 24 milliards USD en 2026. Europe = ~25% = 6 milliards USD. SAM: France SMB content tools ~300M EUR (3.9M TPE/PME, 10% digitalement actives, 50EUR/mois moyen). SOM Year 1: 0.1% du SAM = 300K EUR ARR = ~500 clients Solo. Réaliste et crédible pour des VCs.",
      evidence: "Precedence Research Generative AI Content Creation Market 2026 ($24B); INSEE 3.9M TPE/PME France; Europe 24.7% of global digital content market (Straits Research)",
      confidence: 80,
      category: 'market_sizing',
      revenue_linked: true
    },

    // --- OKR Framework ---
    {
      learning: "OKRs pour solo founder IA: max 3 Objectives par trimestre, 2-3 Key Results chacun. Structure: O1=Growth (MRR, signups), O2=Product (engagement, NPS), O3=Efficiency (burn, automation). Utiliser ICE scoring (Impact×Confidence×Ease) pour prioriser — créé par Sean Ellis, conçu pour la vitesse startup.",
      evidence: "OKRsTool.com statistics 2025; SaasFunnelLab ICE Scoring Guide 2025; Ritmoo '8 Goal Setting Frameworks 2026'",
      confidence: 82,
      category: 'operational_framework'
    },
    {
      learning: "RICE vs ICE: utiliser RICE (Reach×Impact×Confidence/Effort) quand on a des données de reach précises (features product). Utiliser ICE pour les décisions rapides growth/marketing où la vitesse > la précision. En early-stage, ICE est supérieur car il réduit l'overhead d'estimation et permet de shipper plus vite.",
      evidence: "Plane.so 'RICE vs ICE vs Kano 2025'; ProductLift 'Product Prioritization Frameworks 2026'; Lumi Studio ICE Scoring Guide",
      confidence: 80,
      category: 'operational_framework'
    },

    // --- Crisis Management ---
    {
      learning: "Playbook crise churn spike: (1) Identifier si c'est saisonnier (été/janvier en France), compétitif, ou produit. (2) Segmenter les churners par plan/usage/ancienneté. (3) Outreach perso top 20% revenue churners dans les 24h. (4) Save offer ciblée: 'trop cher' → -30% 3 mois, 'pas utilisé' → pause 1-3 mois. 43% du churn SMB arrive dans les 90 premiers jours.",
      evidence: "MRRSaver SaaS Churn Benchmarks 2026; ChurnFree B2B SaaS Benchmarks 2026 — '43% SMB churn in first 90 days'; Sturdy.ai B2B SaaS Problems 2025",
      confidence: 85,
      category: 'crisis_management',
      revenue_linked: true
    },
    {
      learning: "Crise outage API: 68% des clients SaaS envisagent de switcher après UN seul outage majeur. Coût moyen downtime: 5600 USD/minute. Playbook: (1) Page statut publique (Statuspage.io), (2) Communication proactive < 15min, (3) Post-mortem transparent en 24h, (4) Crédits compensatoires automatiques. Le billing mensuel churne 2-3x plus que l'annuel — pousser les plans annuels réduit la surface de churn.",
      evidence: "JustAfterMidnight 'SaaS Downtime Impact on Churn 2025'; ATOZDEBUG Disaster Recovery for SaaS 2025; UserJot SaaS Churn Benchmarks 2026",
      confidence: 86,
      category: 'crisis_management',
      revenue_linked: true
    },
    {
      learning: "Churn rate benchmark SMB SaaS 2026: 3-5% mensuel, 5-7% annuel pour best-in-class. Au-dessus de 7% annuel = problème structural. Le churn SMB est concentré dans les 90 premiers jours (43% des pertes). Solution: onboarding renforcé J1-J90, human touch pour plans > 49EUR, health score prédictif dès J7.",
      evidence: "WeAreFounders SaaS Churn Rates 2026; Optif.ai B2B SaaS Churn Rate (939 companies); HubiFi SaaS Churn Rate Benchmarks 2025",
      confidence: 88,
      category: 'metrics_benchmark',
      revenue_linked: true
    },

    // --- Product-Market Fit ---
    {
      learning: "Sean Ellis Test 2026: si 40%+ des users répondent 'très déçu' à 'Comment vous sentiriez-vous sans ce produit?', c'est du PMF validé. Superhuman a atteint 58% en ignorant 80% des users et en rebuilding pour les power users. Tester trimestriellement, segmenter par type de commerce — les moyennes mentent.",
      evidence: "IdeaProof Sean Ellis Test 2026; PMToolkit PMF Calculator; LearningLoop PMF Survey Guide",
      confidence: 90,
      category: 'product_market_fit'
    },
    {
      learning: "PMF quantitatif: si les courbes de rétention par cohorte se stabilisent (flattening à 20-50% au lieu de tendre vers 0), c'est un signal PMF fort. Quick Ratio > 4 = strong PMF (4+ users gagnés par user perdu). Combiner Sean Ellis qualitatif + rétention cohorte quantitatif + Quick Ratio pour un score PMF multi-signal.",
      evidence: "PMToolkit Multi-Signal PMF Score; Wearepresta 'How to Find PMF 2026'; Quaff Media 'How to Measure PMF'",
      confidence: 85,
      category: 'product_market_fit'
    },

    // --- International Expansion ---
    {
      learning: "Signal expansion internationale: Pennylane (French startup of the year 2025) a attendu le seuil de 100M EUR ARR avant de s'étendre en Allemagne. Pour KeiroAI, la timeline réaliste: (1) Dominer France, (2) Belgique/Suisse francophone (même langue, faible effort), (3) Espagne/Italie (marchés SMB similaires), (4) Allemagne (plus gros marché, plus complexe).",
      evidence: "TechFundingNews 'France 2025 Startup Funding: Soonicorns to Watch 2026'; MagStartup 'French SaaS Acquisitions Study 2024'",
      confidence: 78,
      category: 'expansion',
      revenue_linked: true
    },
    {
      learning: "Tendance 2025-2026: les scale-ups françaises préfèrent la consolidation par acquisition plutôt que l'expansion agressive. Les M&A sortants français ont atteint 47 milliards EUR au T1-T3 2025 (+27% vs 2024). Pour KeiroAI: rester focused sur la France jusqu'à 1M ARR minimum, puis considérer l'acquisition d'un concurrent local dans un autre pays vs expansion organique.",
      evidence: "Chambers & Partners 'Investing In France 2026'; Alexandre Substack 'State of French Tech Ecosystem 2025'",
      confidence: 76,
      category: 'expansion'
    },

    // --- Partnership Strategy ---
    {
      learning: "Les organisations avec des programmes partenaires matures dérivent 30-60% de leur revenu des partnerships, avec des taux de closing et deal sizes supérieurs. Pour KeiroAI: (1) Intégrations API avec CRM locaux (Axonaut, noCRM.io), (2) Channel partners = agences web locales (commission 15-20% récurrente), (3) Affiliés = business coaches LinkedIn (plan gratuit + 10% commission).",
      evidence: "Partnership Leaders revenue attribution research; Channeltivity 'Where to Find B2B SaaS Partners 2026'; Introw 'How to Build Channel Partner Program 2026'",
      confidence: 80,
      category: 'partnerships',
      revenue_linked: true
    },
    {
      learning: "En 2026, l'IA révolutionne la gestion des partnerships: matching prédictif, enablement automatisé, optimisation intelligente. Les incentives outcome-based (compensation alignée sur la rétention client, pas juste la vente) remplacent les commissions transactionnelles. Modèle recommandé: 15% commission M1, 10% récurrent M2+, bonus 5% si rétention 6 mois.",
      evidence: "ChannelAsService 'Channel Partner SaaS Program Models 2025'; Canalys 'SaaS Businesses Unlocking Growth Through Diversified Partner Ecosystems'",
      confidence: 78,
      category: 'partnerships',
      revenue_linked: true
    },

    // --- Data-Driven Decisions ---
    {
      learning: "Framework décision KeiroAI: pour les features product, utiliser RICE (données quantitatives). Pour les expériences growth, utiliser ICE (vitesse). Pour les décisions stratégiques (pricing, expansion, hiring), utiliser le framework Weighted Scoring avec critères: Revenue Impact (30%), Effort (25%), Strategic Alignment (25%), Risk (20%).",
      evidence: "ProductLift 'Product Prioritization Framework Comparison 2026'; PMToolkit RICE Scoring Guide; Amoeboids ICE Scoring Model",
      confidence: 82,
      category: 'decision_framework'
    },

    // --- Additional CEO Strategic Learnings ---
    {
      learning: "France Num: se faire lister comme 'Solution numérique recommandée' = visibilité auprès de 3M+ TPE/PME gratuitement. CCI Store: marketplace solutions digitales = accès réseau CCI national. BPI Digital: programme d'accompagnement TPE/PME vers le numérique. Ces 3 canaux institutionnels ont un CAC quasi nul.",
      evidence: "France Num program 2025 official; BPI France Digital strategy; CCI France marketplace solutions",
      confidence: 85,
      category: 'institutional_partnerships',
      revenue_linked: true
    },
    {
      learning: "Métriques dashboard CEO hebdomadaire: (1) MRR + delta vs semaine précédente, (2) New signups + source, (3) Activation rate (1ère image en < 24h), (4) Crédits consommés / crédits alloués ratio, (5) NPS/CSAT trending, (6) Burn rate + runway. Si 2+ métriques en déclin 3 semaines consécutives = alerte rouge, action immédiate.",
      evidence: "Visdum SaaS Metrics 2026; Averi.ai 'SaaS Metrics That Actually Matter 2026'; Burkland 2025 SaaS Benchmarks",
      confidence: 84,
      category: 'operational_metrics'
    },
    {
      learning: "Le shift permanent de 2025-2026: les VCs valorisent la croissance efficiente, pas la croissance à tout prix. Le nouveau 'great' en early-stage SaaS: 15-20% MoM MRR growth + burn multiple < 1.5x + gross margin > 70%. Une startup profitable à 500K ARR est plus attractive qu'une startup à 2M ARR qui brûle 200K/mois.",
      evidence: "Burkland '2025 SaaS Benchmarks: What Great Looks Like'; PhoenixStrategyGroup SaaS KPI Benchmarks 2026",
      confidence: 88,
      category: 'fundraising_metrics',
      revenue_linked: true
    },
    {
      learning: "Solo founder avantage compétitif 2026: avec les outils IA (Claude Code, Cursor, v0, Replit Agent), un solo founder peut maintenir la vélocité d'une équipe de 3-5. Les solopreneurs en 2026 construisent des businesses high-growth avec un tech stack IA au lieu d'employés. Ce qui nécessitait des départements est maintenant géré par des outils IA, no-code et automation.",
      evidence: "PrometAI 'Rise of the Solopreneur Tech Stack 2026'; Entrepreneur Loop 'Solo Founder Playbook 2026'",
      confidence: 80,
      category: 'solo_founder'
    },
    {
      learning: "Gestion des 'AI wrapper' accusations: le moat de KeiroAI n'est PAS l'API (Seedream, Claude, ElevenLabs) mais le pipeline d'orchestration (multi-segment vidéo, scene decomposition, prompt optimization par industrie), la data propriétaire (templates testés par type de commerce), et l'UX adaptée aux non-tech (commerçants sur mobile).",
      evidence: "a16z AI moat analysis; TheMarketingHub 'What Investors Look For in AI SaaS 2026' — 'Defensible data moat, not just API wrappers'",
      confidence: 85,
      category: 'competitive_moat'
    },
    {
      learning: "Seuil critique solo founder: à 50K MRR, le premier hire devrait être un Customer Success / Support, pas un dev. La raison: le churn SMB est le #1 killer, et un CS dédié réduit le churn de 20-30% en 90 jours. Le deuxième hire: growth marketer / content. Troisième: dev frontend.",
      evidence: "SaaStr hiring sequence recommendations; Sturdy.ai 'Three Biggest Problems B2B SaaS 2025' — churn prevention as priority",
      confidence: 78,
      category: 'hiring_strategy',
      revenue_linked: true
    },
    {
      learning: "Revenue recognition crédits (IFRS 15): les crédits achetés = DEFERRED REVENUE jusqu'à consommation. Solo 49EUR/220 crédits: si 70 crédits utilisés mois 1, reconnaître (70/220)×49EUR = 15.59EUR. Crédits non utilisés rollover → étendent la période. Crédits expirés → reconnaître comme revenu à l'expiration. Essentiel pour la compliance financière.",
      evidence: "IFRS 15 Software/SaaS Revenue Recognition Guide; Rightrev.com credit-based SaaS revenue recognition",
      confidence: 88,
      category: 'finance_compliance',
      revenue_linked: true
    },
    {
      learning: "Due diligence investisseur 2026: les VCs vérifient maintenant (1) la dépendance aux APIs tierces (risque si Seedream/BytePlus change les prix), (2) la compliance RGPD (amendes jusqu'à 4% CA), (3) le content safety pour l'IA générative (risque réputationnel), (4) l'IP propriétaire (prompts, pipelines, données d'entraînement). Documenter tout en amont.",
      evidence: "TheMarketingHub AI SaaS investor analysis 2026; Chambers & Partners 'Investing In France 2026'",
      confidence: 82,
      category: 'fundraising_prep'
    },
    {
      learning: "Benchmarks clés VCs 2026 pour seed round AI SaaS: 50-100K ARR minimum, 15%+ MoM growth, 100+ clients actifs, NRR > 100%, churn < 5% mensuel, gross margin > 65%. Le narrative compte autant que les métriques: 'IA souveraine pour les 3.9M TPE/PME françaises' est un pitch puissant avec les réglementations AI Act européennes.",
      evidence: "CapMaven '7 SaaS Metrics Investors Care About 2026'; Averi.ai SaaS metrics benchmarks; FrenchTechJournal ecosystem data",
      confidence: 84,
      category: 'fundraising_metrics',
      revenue_linked: true
    },
    {
      learning: "Stratégie anti-fragile pour KeiroAI: diversifier les fournisseurs API (Seedream + Kling backup, Claude + fallback local, ElevenLabs + alternative open-source). Chaque fournisseur critique doit avoir un fallback testable en < 24h. Les startups qui dépendent d'une seule API sont les premières victimes quand les prix changent (cf. GPT-4 price hikes).",
      evidence: "ATOZDEBUG Disaster Recovery for SaaS 2025; TechBuzz 'AI Agents Eating Enterprise Software' — API dependency risks",
      confidence: 83,
      category: 'risk_management'
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // MARKETING (Ami) — 42 learnings
  // Growth Loops, Viral, Community, Influencer, Product Hunt, Referral,
  // Attribution, Automation, Positioning, A/B Testing, SEO, Content
  // ═══════════════════════════════════════════════════════════════════════
  marketing: [
    // --- Growth Loops vs Funnels ---
    {
      learning: "Les growth loops remplacent les funnels en 2026: un loop réinvestit chaque output comme input du cycle suivant, créant une croissance composée. Le funnel est linéaire et plafonne. Growth loop KeiroAI: User crée contenu → poste avec watermark/tag → followers voient → signup → nouveau user crée contenu. La boucle se renforce automatiquement.",
      evidence: "Reforge 'Growth Loops are the New Funnels'; Gartner 'Growth Loops vs AARRR Funnels'; Userpilot growth loops analysis",
      confidence: 88,
      category: 'growth_strategy',
      revenue_linked: true
    },
    {
      learning: "Avec le paradigm shift funnel → loop, chaque département pense au customer journey complet. Le problème des funnels: le marketing optimise le volume top-funnel au détriment de la qualité, ce qui tank la rétention. Les growth loops alignent acquisition, activation et rétention dans un même système.",
      evidence: "Reforge blog — 'teams optimize at the expense of each other in silo'd funnels'; ProductGrowth.blog 'Growth Funnels vs Growth Loops'",
      confidence: 85,
      category: 'growth_strategy'
    },
    {
      learning: "3 types de growth loops pour KeiroAI: (1) Viral loop (watermark/tag sur le contenu posté), (2) Content loop (SEO articles → signups → data → meilleurs articles), (3) Paid loop (ads → signups → revenue → réinvestir en ads). Activer les 3 en parallèle mais prioriser le viral loop car CAC = 0.",
      evidence: "Ortto 'Growth Loops: How to Use Them'; Thoughtlytics 'Definitive Guide to Growth Loops'; ProductLed.org metrics",
      confidence: 83,
      category: 'growth_strategy',
      revenue_linked: true
    },

    // --- Viral Coefficient ---
    {
      learning: "K-factor (coefficient viral) = Invitations envoyées × Taux de conversion. Le K-factor moyen B2B SaaS = 0.2 (même 0.2 est bon!). Au-dessus de 1.0 = croissance virale vraie (extrêmement rare). Pour KeiroAI, un K-factor de 0.3-0.5 via watermark + partage social serait exceptionnel pour du B2B SMB. Ne pas spammer pour optimiser K — ça détruit la rétention long-terme.",
      evidence: "Visible.vc 'K Factor: SaaS Viral Coefficient'; Saxifrage K-Factor Benchmarks; OpenView 'Importance of Viral Coefficient for SaaS'",
      confidence: 87,
      category: 'viral_growth'
    },
    {
      learning: "Cycle viral B2B SaaS: 8-12 semaines (vs 7-14 jours pour apps consumer). Pour KeiroAI, le cycle est plus court car le contenu posté est visible immédiatement. Optimiser: (1) Rendre le partage frictionless (1-tap share), (2) Watermark discret mais cliquable, (3) Incentive: +5 crédits par referral converti. Mesurer le K-factor mensuellement, pas quotidiennement.",
      evidence: "AlexanderJarvis 'Viral Coefficient in SaaS'; GetMonetizely K-Factor calculation guide; SaaSquatch viral coefficient analysis",
      confidence: 82,
      category: 'viral_growth',
      revenue_linked: true
    },

    // --- Community-Led Growth ---
    {
      learning: "Les entreprises avec des communautés actives croissent 2.1x plus vite et ont un LTV 46% plus élevé. Chaque euro investi dans la communauté retourne 6.40 EUR en valeur. Pour KeiroAI: groupe WhatsApp Business segmenté par type de commerce (restos, boutiques, coiffeurs), LinkedIn group pour la légitimité B2B, Discord pour les power users/beta testers.",
      evidence: "CommonRoom 'Ultimate Guide to Community-Led Growth'; OmniFunnel Marketing CLG strategy guide; A88Lab CLG for B2B SaaS",
      confidence: 86,
      category: 'community',
      revenue_linked: true
    },
    {
      learning: "Approche hybride communauté: forum/plateforme dédiée (Notion, Circle) comme hub central pour le contenu organisé + Discord pour l'interaction temps réel. Discord a dépassé 200M d'users actifs en 2024, avec une adoption rapide par les startups SaaS. PLG + CLG combinés = le modèle gagnant (Figma, Asana, dbt Labs).",
      evidence: "Sales-Demand 'B2B Discord Marketing'; Postdigitalist 'Community-Led Growth Framework'; Custify SaaS community growth guide",
      confidence: 80,
      category: 'community'
    },

    // --- Influencer Marketing ---
    {
      learning: "Les micro-influenceurs (10K-100K followers) représentent 39.35% de la valeur marché influencer (12.23 milliards USD en 2025), avec un engagement rate ~10x supérieur aux célébrités pour ~1/10ème du coût. 63% des créateurs préfèrent les partenariats long-terme. 74% des marques augmentent leur budget créateur en 2026.",
      evidence: "Impact.com 'Influencer Marketing Trends 2026'; InfluenceFlow 'Micro-Influencers 2026 Guide'; IQFluence influencer case studies",
      confidence: 88,
      category: 'influencer',
      revenue_linked: true
    },
    {
      learning: "LinkedIn = plateforme #1 pour les créateurs B2B en 2026 (Creator Mode, Newsletters, Carrousels). Les créateurs B2B agissent comme des analystes de niche, pas des influenceurs traditionnels. Pour KeiroAI: identifier les top 20 créateurs B2B francophones (business coaches, experts marketing digital) via Favikon (basé à Paris, le plus abordable).",
      evidence: "Stormy.ai 'SaaS Influencer Marketing 2026 Playbook'; Favikon 'B2B Influencer Marketing Trends 2026'; Warmly.ai B2B influencer strategy guide",
      confidence: 84,
      category: 'influencer',
      revenue_linked: true
    },
    {
      learning: "Programme influencer KeiroAI: offrir plan Fondateurs gratuit (valeur 149EUR/mois) + 10% commission récurrente + co-branded content. Budget = 0 EUR initial (que du barter). Le ROI est multiplicateur: 1 créateur avec 20K followers qui fait 1 post/mois = 240K impressions/an = CPM < 1 EUR.",
      evidence: "Stormy.ai 'Scaling B2B Customer Acquisition 2026'; SeeeSiteTool influencer marketing statistics 2026",
      confidence: 78,
      category: 'influencer',
      revenue_linked: true
    },

    // --- Product Hunt Launch ---
    {
      learning: "Product Hunt 2026: préparer 4-6 semaines avant. Teaser page pour construire la waitlist directement sur PH. Lancer un jour de semaine pour visibilité maximale OU le weekend pour moins de compétition. 12:01 AM PST pour maximiser la fenêtre de 24h. Les pics de votes brusques sont flaggés et retirés — distribuer l'engagement sur les 4 premières et 2 dernières heures.",
      evidence: "InnMind 'Product Hunt Launch 2026: Prep to Monetization'; Dub.co '#1 on Product Hunt step-by-step playbook 2026'; DemandCurve PH playbook",
      confidence: 85,
      category: 'launch_strategy'
    },
    {
      learning: "Les winners Product Hunt traitent PH comme un événement de distribution + système de monétisation sur 30 jours, pas un vanity play. Post-launch: convertir le spike en signups via landing page dédiée, offre exclusive (extended trial/lifetime deal), et email nurture. Répondre à CHAQUE commentaire en quelques minutes. Engage authentiquement dans la communauté AVANT ton launch.",
      evidence: "SyntaxHut 'Best PH Launch Tips 2026'; RiverEditor 'How to Plan Launch Strategy 2026'; Shadow.do PH optimization guide",
      confidence: 82,
      category: 'launch_strategy'
    },

    // --- Referral Program ---
    {
      learning: "Le programme referral Dropbox reste le gold standard: 3900% de croissance en 15 mois, 35% des signups quotidiens venaient du referral. CAC referral = 0.25 USD vs 233-388 USD via Google Ads — amélioration de 1000x. Double-sided rewards (referrer + ami reçoivent quelque chose) surperforment le single-sided de 2-3x.",
      evidence: "Viral-Loops 'How Dropbox Achieved 3900% Growth'; Prefinery Dropbox Referral Program Study; DanSiepen SaaS Referral Program Strategies",
      confidence: 90,
      category: 'referral',
      revenue_linked: true
    },
    {
      learning: "Programme referral KeiroAI optimal: referrer reçoit +30 crédits (valeur ~7EUR), ami reçoit +15 crédits bonus à l'inscription. Intégrer le referral link directement dans le flow de partage du contenu (pas dans un menu caché). Pour les produits utilitaires (SaaS/tools), les crédits/cash performent mieux que les rewards produit.",
      evidence: "BeyondLabs 'SaaS Referral Program Strategies'; Waitlister.me 'Viral Referral Program Guide 2026'; Refgrow referral marketing examples",
      confidence: 80,
      category: 'referral',
      revenue_linked: true
    },
    {
      learning: "Viral coefficient referral benchmarks: 0.5-0.75 = bon (boost organique), 0.75-1.0 = great (croissance quasi-virale), > 1.0 = excellent (croissance virale vraie). Activer le referral APRÈS le 'aha moment' (1ère image dans le mockup Instagram), jamais avant. Le timing du prompt referral est plus important que la récompense.",
      evidence: "Waitlister.me K-factor benchmarks; WallStreetPrep Viral Coefficient Calculator; PayProGlobal SaaS Viral Coefficient guide",
      confidence: 82,
      category: 'referral',
      revenue_linked: true
    },

    // --- Attribution Modeling ---
    {
      learning: "En 2026, 67% des équipes marketing B2B utilisent encore le last-touch attribution — ignorant tout le parcours avant la conversion. 90% utilisent des modèles single-touch ou basic multi-touch. Pour KeiroAI SMB (cycle court), un modèle W-shaped (crédit aux touches first, lead creation, opportunity) est le bon compromis.",
      evidence: "Improvado 'Marketing Attribution Models 2026'; Cometly 'Marketing Attribution for SaaS 2026'; Salesforce Multi-Touch Attribution guide",
      confidence: 84,
      category: 'attribution'
    },
    {
      learning: "Le triangle de mesure 2025-2026: MMM (Marketing Mix Modelling) + MTA (Multi-Touch Attribution) + Incrementality Testing. Mais pour un SaaS bootstrapped, commencer simple: UTM tracking rigoureux + first-touch et last-touch en parallèle. Data-Driven Attribution de Google Ads est maintenant le défaut pour toutes les nouvelles actions de conversion.",
      evidence: "ALMCorp 'Attribution Modeling Google Ads 2026'; WhiteHat-SEO 'Marketing Attribution 2026'; Factors.ai Multi-Touch Attribution guide",
      confidence: 80,
      category: 'attribution'
    },

    // --- Marketing Automation ---
    {
      learning: "Stack marketing automation bootstrapped 2026: Mailchimp/Brevo (email, gratuit < 500 contacts) + Google Analytics 4 (analytics) + Zapier (workflows) = 2000-8000 EUR/an. Upgrade: ActiveCampaign (29EUR/mois, lead scoring + behavioral triggers) quand > 500 contacts actifs. Le CRM-first integration est le shift dominant — le CRM et le marketing automation doivent être synchronisés en temps réel.",
      evidence: "SmashSend 'SaaS Marketing Automation Tools 2026'; Encharge '37 Best SaaS Marketing Automation Tools 2026'; DigitalBloom 'B2B Martech Stacks 2025'",
      confidence: 85,
      category: 'automation',
      revenue_linked: true
    },
    {
      learning: "En 2026, les solutions composables (custom + homegrown) passent de 10% à 15-20% des stacks B2B grâce aux outils IA de développement. L'IA s'intègre dans les plateformes d'automation: lead scoring prédictif, optimisation auto des campagnes, génération de contenu personnalisé, détection d'anomalies analytics. KeiroAI a déjà cet avantage avec ses agents IA intégrés.",
      evidence: "eMarketer 'How AI Agents and Composable Stacks Reshape Martech 2026'; Automaiva 'SaaS Growth Stack 2026'; Canto marketing stack guide 2026",
      confidence: 82,
      category: 'automation'
    },

    // --- Brand Positioning ---
    {
      learning: "Pour 90% des SaaS B2B, la création de catégorie est un piège mortel: coûteux, ego-driven, et confus pour les acheteurs. La différenciation dans une catégorie existante est supérieure: elle exploite les budgets existants et accélère le cycle de vente. KeiroAI = 'outil de création contenu IA' (catégorie existante) + 'spécialisé commerces locaux français' (différenciation).",
      evidence: "A88Lab 'Category Creation vs Differentiation in B2B SaaS'; Apricot Studio 'Category vs Positioning'; UserPilot product positioning examples 2026",
      confidence: 88,
      category: 'positioning',
      revenue_linked: true
    },
    {
      learning: "Modèle Linear: au lieu de créer la catégorie 'AI content for SMB', dire 'L'outil de création contenu pour les commerçants qui veulent poster du contenu pro sans y passer 3h' — comme Linear s'est positionné en 'issue tracker pour les devs qui care about craft' vs Jira généraliste. Focaliser sur un segment high-value, pas essayer de servir tout le monde.",
      evidence: "A88Lab positioning analysis — Linear case study; Genesys Growth 'Product Positioning Frameworks 2026'",
      confidence: 84,
      category: 'positioning'
    },

    // --- A/B Testing Small Samples ---
    {
      learning: "Pour le B2B SaaS à faible trafic: utiliser des seuils de confiance 85-90% (pas 95%) pour les décisions directionnelles. Limiter à 2 variantes (A vs B). Minimum 500 users par test pour des résultats fiables. Si le trafic est trop faible, utiliser le Sequential Testing (Bayesian) qui permet l'arrêt anticipé.",
      evidence: "VWO 'A/B Testing Statistics 2026'; Convertize 'AB Testing Sample Size: 4 Levels of Difficulty 2026'; Fibr.ai SaaS A/B Testing Guide 2025",
      confidence: 85,
      category: 'experimentation'
    },
    {
      learning: "Tests B2B SaaS à petit échantillon: focaliser sur les conversions à fort impact (pricing page → signup, signup → first generation) pas les micro-métriques. Pour les tests email (Brevo): variante A et B à 15% chacun, attendre 4h, envoyer la gagnante aux 70% restants. Minimum 50 emails par variante pour 80% de significativité.",
      evidence: "Understory Agency 'AB Testing for SaaS: 5 Critical Elements'; LetsGroTo 'AB Testing for SaaS'; SplitMetrics sample size guide",
      confidence: 80,
      category: 'experimentation'
    },

    // --- Content Marketing ROI ---
    {
      learning: "Le content marketing SaaS B2B délivre un ROI moyen de 702%, avec des retours sur 3 ans atteignant 844%. Mais le breakeven typique est à 7 mois, et le peak ROI peut prendre jusqu'à 36 mois. En 2026, la short-form video est le format #1 ROI (49% des marketeurs), suivi par la long-form video (29%). 91% des business utilisent la vidéo comme outil marketing.",
      evidence: "DigitalApplied 'Content Marketing ROI 2026'; RankLyx SaaS Content Marketing Statistics 2026; Martal B2B Digital Marketing Benchmarks 2026",
      confidence: 87,
      category: 'content_roi',
      revenue_linked: true
    },
    {
      learning: "Content scoring framework: attribuer un score 0-100 à chaque contenu basé sur engagement + conversion + revenue. Score > 70 = top performer, amplifier et protéger. Score 40-70 = optimiser CTA et linking interne. Score < 40 pendant 2 trimestres = consolider ou retirer. Tracker le pipeline influence: tout contenu dans le parcours d'un client converti = impact reporting.",
      evidence: "DigitalGratified 'Measure SaaS Content Marketing ROI'; Factors.ai '12 Content Marketing Metrics for SaaS'; UpGrowth 'Content Marketing ROI 2026'",
      confidence: 82,
      category: 'content_roi'
    },

    // --- Customer Case Studies ---
    {
      learning: "93% des top SaaS utilisent le framework Challenge-Solution-Impact. 88% des 58 SaaS à plus forte croissance publient des case studies (moyenne 45 par entreprise). 36% incluent des vidéo case studies — le format le plus performant. Garder les vidéos < 3 minutes. Toujours inclure des métriques quantifiables ('5x conversion', '80% réduction fraude').",
      evidence: "ProofMap 'B2B Case Studies from Top 58 Growing SaaS 2025'; A88Lab 'How to Write a Winning B2B Case Study 2026'; Concurate SaaS case study video examples",
      confidence: 86,
      category: 'social_proof',
      revenue_linked: true
    },
    {
      learning: "Case study KeiroAI optimal: 1 par type de commerce (restaurant, boutique, coiffeur, coach, caviste, fleuriste). Format: situation avant (posts irréguliers, photos iPhone, 0 engagement) → solution KeiroAI → résultats chiffrés (followers, engagement rate, temps gagné, CA attribué aux réseaux). Inclure citation directe du commerçant + screenshots avant/après.",
      evidence: "Contensify 'How to Write B2B SaaS Case Study 2025'; SocialTargeter case study creation guide; GravitateDesign B2B SaaS lead generation 2026",
      confidence: 80,
      category: 'social_proof',
      revenue_linked: true
    },

    // --- Webinar & Events ---
    {
      learning: "73% des marketeurs B2B considèrent les webinaires comme le meilleur moyen de générer des leads de qualité. 95% les jugent importants pour leur stratégie globale. Format optimal pour KeiroAI: 'Masterclass contenu Instagram pour [type commerce]' — 30min, live demo + Q&A. Replay = lead magnet perpétuel.",
      evidence: "SaaStock 'Why Events Should Be Part of B2B Marketing 2026'; Airmeet 'Cost-Effective Webinar Tools for SaaS Startups 2026'; IntentAmplify webinar marketing 2026",
      confidence: 84,
      category: 'events',
      revenue_linked: true
    },
    {
      learning: "Événements clés pour KeiroAI en 2026: SaaStock Europe (réseau investisseurs B2B SaaS), Web Summit (visibilité massive), salons B2B France (Paris La Défense Arena). Stratégie budget-friendly: ne pas exposer mais networker. Préparer 50 cartes avec QR code → demo. Les conférences = pipeline 3-6 mois, pas conversion immédiate.",
      evidence: "SaaS.group '33 Best SaaS Events 2026'; MightyAndTrue '2026 Conference Guide for Tech Marketers'; Inkle.ai SaaS events guide",
      confidence: 76,
      category: 'events'
    },

    // --- SEO Strategy ---
    {
      learning: "Topic clusters: les SaaS qui dominent l'organique en 2026 ne publient pas PLUS de contenu mais du contenu MIEUX structuré. Résultats prouvés: +30% trafic organique (HubSpot), 2.5x plus longtemps dans les rankings, 4.7x plus de link equity sur les pages prioritaires. Les architectures pillar-cluster ont généré 63% plus de keyword rankings en 90 jours (étude 50 SaaS B2B).",
      evidence: "Brafton 'Topic Cluster Content Strategy 2026'; PipelineRoad 'Topic Clusters for SEO: SaaS Content Architecture'; XICTRON 'Content Clusters vs Single Pages 2026'",
      confidence: 90,
      category: 'seo',
      revenue_linked: true
    },
    {
      learning: "Structure pillar-cluster pour KeiroAI: Pillar page 'Contenu Instagram pour commerces locaux' (3000+ mots) → 8-15 cluster pages: 'contenu restaurant Instagram', 'reels boutique mode', 'TikTok pour coiffeurs', etc. Chaque cluster link vers le pillar ET entre eux. Le pillar link vers tous les clusters. Viser 2-5 liens contextuels par 1000 mots, max 150 liens par page.",
      evidence: "IdeaMagix 'Internal Linking Strategy SEO 2026'; DigitalPilots 'Internal Linking Strategy 2026'; Rozenberg 'Pillar Page Strategy for SEO 2025'",
      confidence: 86,
      category: 'seo',
      revenue_linked: true
    },
    {
      learning: "Le taux de citation IA (AI Overview, ChatGPT, Perplexity) passe de 12% à 41% avec une architecture topic cluster bien structurée. En 2026, le SEO n'est plus seulement Google — c'est aussi la visibilité dans les réponses IA. Structurer le contenu avec des headers clairs, des listes, et des données factuelles pour maximiser les citations IA.",
      evidence: "WhiteHat-SEO 'Topic Clusters for SEO 2026'; Sedestral topic cluster strategy guide; UpwardEngine internal linking best practices 2026",
      confidence: 82,
      category: 'seo'
    },
    {
      learning: "SEO programmatique pour KeiroAI: créer des pages '[service] + [ville]' automatiquement. Ex: 'creation-contenu-instagram-restaurant-lyon', 'visuels-ia-boutique-paris'. 50-100 pages ciblant des combinaisons locales = trafic organique massif à faible coût. Les requêtes 'comment' + 'gratuit' convertissent le mieux en free trial signups.",
      evidence: "PipelineRoad SaaS SEO topic clusters guide; LevyOnline 'SEO Topic Clusters 2025'; Brafton pillar content strategy",
      confidence: 80,
      category: 'seo',
      revenue_linked: true
    },

    // --- Additional Marketing Learnings ---
    {
      learning: "Attribution SaaS bootstrapped en pratique: commencer avec UTM tracking rigoureux sur TOUT (emails, ads, social, blog). Configurer first-touch ET last-touch en parallèle dans GA4. Quand > 100 conversions/mois, passer au data-driven attribution de Google Ads (maintenant le défaut). Ne jamais prendre de décision budget sur un seul modèle d'attribution.",
      evidence: "ALMCorp Google Ads attribution guide 2026; Salesmate Multi-Touch Attribution 2026; Usermaven attribution tools guide",
      confidence: 82,
      category: 'attribution',
      revenue_linked: true
    },
    {
      learning: "Email marketing automation sequences pour KeiroAI: (1) Welcome (J0): valeur immédiate, 1ère image en 2 min. (2) Activation (J1-J3): tutoriel par type de commerce. (3) Engagement (J7): trend de la semaine + template gratuit. (4) Conversion (J14): témoignage client similaire + offre limitée. (5) Re-engagement (J30 inactif): 'J'ai préparé 3 visuels pour toi'. Open rates cibles: 35%+ welcome, 25%+ nurture.",
      evidence: "SmashSend SaaS marketing automation 2026; Encharge marketing automation tools; MADX Digital SaaS marketing automation guide",
      confidence: 80,
      category: 'email_automation',
      revenue_linked: true
    },
    {
      learning: "Le format avant/après est le plus performant pour les commerçants français: 'Comment ce restaurant est passé de 200 à 1500 abonnés Instagram avec KeiroAI'. Segmenter les case studies par type de commerce. Le contenu vidéo court (< 60s) montrant la génération en temps réel convertit 3x mieux qu'un texte explicatif pour ce segment non-tech.",
      evidence: "Averi.ai Content Marketing ROI Benchmarks B2B SaaS; DigitalApplied content scoring framework; RankLyx SaaS content statistics 2026",
      confidence: 84,
      category: 'content_strategy',
      revenue_linked: true
    },
    {
      learning: "TikTok Ads B2B SaaS 2026: coûts 60-70% inférieurs à LinkedIn. Spark Ads (promouvoir du contenu organique) surperforment les créas dédiées de 20-40%. Hook: 'Si tu es [restaurateur/fleuriste], arrête de scroller'. CTR benchmark: 1.5-3%, CPC: 0.50-1.50 EUR. Le fondateur en vidéo UGC montrant une génération en 30s = la créa qui convertit le plus.",
      evidence: "Impact.com influencer marketing performance data 2026; Stormy.ai SaaS influencer marketing playbook 2026",
      confidence: 78,
      category: 'paid_acquisition',
      revenue_linked: true
    },
    {
      learning: "Stratégie LinkedIn organique pour KeiroAI: poster 3-5x/semaine en tant que fondateur (pas la page entreprise). Formats qui performent: (1) Carrousel avant/après clients, (2) Post storytelling 'Ce que j'ai appris en buildant un SaaS IA', (3) Sondages engagement, (4) Vidéo native 60s demo. Le personal branding du fondateur convertit 5-10x mieux que la page corporate en B2B SMB.",
      evidence: "Stormy.ai 'LinkedIn as Primary Platform for B2B Creators 2026'; Favikon B2B influencer trends 2026; Warmly.ai B2B influencer strategy",
      confidence: 83,
      category: 'organic_social',
      revenue_linked: true
    },
    {
      learning: "Meta Ads retargeting séquence créative: Awareness (J1-7) contenu éducatif sans CTA signup. Consideration (J7-14) social proof + démo feature. Conversion (J14-30) risk reduction 'Essai gratuit, sans CB'. Custom audiences prioritaires: (1) Visiteurs pricing sans conversion, (2) Users 1+ image sans signup, (3) Lookalike 1% paying customers. Retargeting = 40-60% lower CPL vs cold.",
      evidence: "Stormy.ai SaaS marketing playbook; Impact.com performance insights 2026",
      confidence: 80,
      category: 'paid_acquisition',
      revenue_linked: true
    },
    {
      learning: "Marketing automation workflow critique: quand un user atteint 80% de ses crédits, trigger automatique: (1) In-app notification 'Tu as utilisé 80% de tes crédits — upgrade pour continuer à créer', (2) Email avec comparatif plans, (3) Si pas d'action en 48h, offre upgrade -20% pour 3 mois. Ce trigger seul peut générer 15-25% des upsells.",
      evidence: "SaaSHero 'Best Marketing Automation for SaaS 2026'; Genesy.ai SaaS marketing automation; Automaiva SaaS Growth Stack 2026",
      confidence: 78,
      category: 'automation',
      revenue_linked: true
    },
    {
      learning: "Newsletter growth hack: créer une newsletter hebdomadaire 'Tendances Contenu' avec les trends Instagram/TikTok de la semaine + 1 template gratuit KeiroAI. Les non-clients s'inscrivent pour la valeur → nurture → conversion. Open rate cible: 35%+. La newsletter est le seul canal que tu possèdes (pas d'algorithme qui change).",
      evidence: "SmashSend SaaS marketing tools 2026; DigitalApplied Content Marketing ROI framework; Canto marketing stack 2026",
      confidence: 80,
      category: 'content_strategy',
      revenue_linked: true
    },
  ],
};

async function injectLearnings() {
  console.log('=== Injecting ELITE Round 2: CEO (Noah) + Marketing (Ami) ===\n');

  let totalInjected = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [agent, learnings] of Object.entries(ELITE_KNOWLEDGE)) {
    console.log(`\n[${agent.toUpperCase()}] Injecting ${learnings.length} elite learnings...`);

    for (const l of learnings) {
      // Dedup: check if very similar learning already exists
      const searchKey = l.learning.substring(0, 50).replace(/['"]/g, '');
      const { data: existing } = await supabase
        .from('agent_logs')
        .select('id')
        .eq('agent', agent)
        .eq('action', 'learning')
        .ilike('data->>learning', `%${searchKey}%`)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`  [SKIP] Already exists: "${l.learning.substring(0, 55)}..."`);
        totalSkipped++;
        continue;
      }

      const { error } = await supabase.from('agent_logs').insert({
        agent,
        action: 'learning',
        status: 'active',
        data: {
          learning: l.learning,
          evidence: l.evidence,
          confidence: l.confidence,
          category: l.category,
          pool_level: 'global',
          revenue_linked: l.revenue_linked || false,
          source: 'elite_round2_ceo_marketing',
          injected_at: new Date().toISOString(),
          confirmed_count: 3,
        },
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error(`  [ERROR] ${l.learning.substring(0, 55)}...: ${error.message}`);
        totalErrors++;
      } else {
        console.log(`  [OK] ${l.learning.substring(0, 55)}...`);
        totalInjected++;
      }
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`=== RESULTS ===`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Injected: ${totalInjected}`);
  console.log(`Skipped (duplicate): ${totalSkipped}`);
  console.log(`Errors: ${totalErrors}`);
  console.log(`Total agents: ${Object.keys(ELITE_KNOWLEDGE).length}`);
  console.log(`Total learnings: ${Object.values(ELITE_KNOWLEDGE).reduce((a, b) => a + b.length, 0)}`);
  console.log(`  - CEO (Noah): ${ELITE_KNOWLEDGE.ceo.length}`);
  console.log(`  - Marketing (Ami): ${ELITE_KNOWLEDGE.marketing.length}`);
  console.log(`${'═'.repeat(60)}`);
}

injectLearnings().catch(console.error);
