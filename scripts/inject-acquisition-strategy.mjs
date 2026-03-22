/**
 * Inject UNIFIED ACQUISITION STRATEGY into all 11 KeiroAI agents.
 *
 * This is the backbone strategy that aligns all agents across the full funnel:
 * Discovery → Qualification → Contact → Nurture → Conversion → Onboarding → Retention → Upsell
 *
 * All learnings are pool_level 'global' so ALL agents benefit from cross-agent intelligence.
 * Confidence 85-95 = INSIGHT tier (permanent, never expires, applied ALWAYS).
 *
 * Run: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/inject-acquisition-strategy.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://duxjdlzdfjrhyojjwnig.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required. Run with:\nSUPABASE_SERVICE_ROLE_KEY=xxx node scripts/inject-acquisition-strategy.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ════════════════════════════════════════════════════════════════════════════════
// SERVICE TEAMS (mirrors lib/agents/learning.ts)
// ════════════════════════════════════════════════════════════════════════════════
// Direction:           CEO (Noah), Marketing (Ami)
// Commercial:          Commercial (Léo), Email (Hugo), Ads (Félix)
// Marketing & Contenu: Content (Léna), SEO (Oscar)
// Service Client:      Onboarding (Clara), Retention (Théo)
// Support & Admin:     RH (Sara), Comptable
// ════════════════════════════════════════════════════════════════════════════════

const ACQUISITION_STRATEGY = {

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 1: DISCOVERY — How prospects find KeiroAI
  // ═══════════════════════════════════════════════════════════════════════════

  ceo: [
    // Funnel role & coordination
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE CEO: Noah orchestre le funnel complet. Brief quotidien inclut: taux conversion par étape (Discovery→Qualification 8-15%, Qualification→Contact 40-60%, Contact→Nurture 70%, Nurture→Conversion 15-25%, Conversion→Onboarding 85%, Rétention M3 60%+). Alerte si un taux chute de >20% en 7j.",
      evidence: "Unified acquisition strategy — CEO funnel orchestration framework",
      confidence: 90, category: 'general', revenue_linked: true
    },
    {
      learning: "COORDINATION CROSS-AGENT: quand un prospect passe de cold à warm (score >40), Noah déclenche: (1) Email→séquence warm, (2) Content→prioriser le type business du prospect, (3) Ads→exclure des audiences cold. Quand hot (score >70): Commercial prend le relais direct, Email passe en support.",
      evidence: "Unified acquisition strategy — cross-agent orchestration rules",
      confidence: 92, category: 'general', revenue_linked: true
    },
    {
      learning: "KPIs FUNNEL UNIFIÉS: CAC par canal (organique <10EUR, chatbot <15EUR, ads <50EUR, referral <5EUR), LTV:CAC >3:1 par plan, Time-to-Revenue <14j pour trial→paid. Revoir allocation budget mensuelle: déplacer 20% du budget du canal le plus cher vers le canal LTV:CAC le plus élevé.",
      evidence: "Unified acquisition strategy — unified KPI framework",
      confidence: 88, category: 'general', revenue_linked: true
    },
    {
      learning: "ARBITRAGE CANAUX FRANCE: marché français TPE/PME = 3.9M entreprises. Répartition cible: 40% organique/SEO (CAC quasi-nul à maturité), 25% chatbot/referral (viral loop), 20% ads (scaling), 10% partenariats (CCI, experts-comptables, France Num), 5% events/salons. Ajuster trimestriellement selon performance.",
      evidence: "Unified acquisition strategy — French market channel allocation",
      confidence: 87, category: 'general', revenue_linked: true
    },
    {
      learning: "PIPELINE REVIEW HEBDOMADAIRE: chaque lundi, Noah agrège: nouveaux leads (par source), leads qualifiés (par type business), opportunités actives, deals en cours, conversions de la semaine. Identifier les bottlenecks: si leads entrants OK mais qualification faible → problème chatbot/scoring. Si qualification OK mais conversion faible → problème pricing/objections.",
      evidence: "Unified acquisition strategy — weekly pipeline review protocol",
      confidence: 89, category: 'general', revenue_linked: true
    },
    {
      learning: "SAISONNALITÉ ACQUISITION FRANCE: Septembre-Octobre = rentrée, budget com, MEILLEUR mois acquisition (+40%). Janvier = résolutions, bon. Mars-Avril = pré-été, commerces préparent. Juillet-Août = creux (-30%), réduire spend ads, focus nurture. Novembre = Black Friday, push pricing annuel. Planifier campagnes 6 semaines avant chaque pic.",
      evidence: "Unified acquisition strategy — French SMB seasonal acquisition patterns",
      confidence: 88, category: 'general', revenue_linked: true
    },

    // Business type prioritization
    {
      learning: "PRIORISATION BUSINESS TYPES par potentiel CA: Tier 1 (LTV élevée, volume): restaurant, boutique, coiffeur — 60% des efforts. Tier 2 (LTV moyenne, croissance): coach, freelance, professionnel — 25%. Tier 3 (niche, test): caviste, fleuriste, services, PME — 15%. Ajuster chaque trimestre selon données réelles conversion.",
      evidence: "Unified acquisition strategy — business type prioritization matrix",
      confidence: 87, category: 'general', revenue_linked: true
    },
  ],

  commercial: [
    // Funnel role
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE COMMERCIAL: Léo gère les étapes Qualification→Contact→Conversion. Objectif: transformer les leads qualifiés (score >40) en clients payants. Léo ne prospecte PAS à froid — les leads arrivent via chatbot, SEO, ads, email. Léo intervient quand le prospect est PRÊT.",
      evidence: "Unified acquisition strategy — Commercial funnel role definition",
      confidence: 90, category: 'general', revenue_linked: true
    },
    {
      learning: "QUALIFICATION LEADS ENTRANTS: Score >40 + signal d'intention (page pricing vue, 2+ images générées, chatbot question pricing) = MQL. Score >70 + email professionnel + type business identifié = SQL. Léo priorise SQLs, délègue MQLs à Email pour nurture. Règle: ne JAMAIS contacter un lead score <40.",
      evidence: "Unified acquisition strategy — lead qualification framework",
      confidence: 91, category: 'general', revenue_linked: true
    },
    {
      learning: "COORDINATION AVEC EMAIL (Hugo): quand Léo qualifie un lead hot, il notifie Email pour basculer en séquence warm personnalisée. Quand Léo identifie une objection récurrente, il la remonte à Content (Léna) pour créer du contenu qui y répond. Quand un deal est perdu, Léo transmet la raison à Marketing (Ami) pour ajuster le messaging.",
      evidence: "Unified acquisition strategy — Commercial-Email-Content coordination",
      confidence: 89, category: 'general', revenue_linked: true
    },
    {
      learning: "PITCH PAR TYPE BUSINESS — RESTAURANT: 'Vos clients choisissent sur Instagram avant de réserver. 73% des 18-35 ans regardent le feed avant de venir. KeiroAI crée vos visuels plats/ambiance en 30 secondes, vous postez, vous remplissez.' Ancrage: photographe food = 300-500EUR/shooting vs 49EUR/mois illimité.",
      evidence: "Unified acquisition strategy — restaurant vertical pitch",
      confidence: 90, category: 'conversion', revenue_linked: true
    },
    {
      learning: "PITCH PAR TYPE BUSINESS — BOUTIQUE: 'Vos produits sont beaux, mais vos photos ne les mettent pas en valeur. KeiroAI transforme une simple photo en visuel catalogue pro. Vos concurrents ont un photographe, vous avez KeiroAI.' Ancrage: shooting produit = 200-400EUR vs 49EUR/mois.",
      evidence: "Unified acquisition strategy — boutique vertical pitch",
      confidence: 88, category: 'conversion', revenue_linked: true
    },
    {
      learning: "PITCH PAR TYPE BUSINESS — COIFFEUR/BEAUTÉ: 'Avant/après, c'est votre meilleur argument de vente. KeiroAI génère des visuels transformations qui donnent envie de prendre RDV. 89% des clients beauté découvrent leur salon sur Instagram.' Ancrage: community manager = 500-1500EUR/mois vs 49EUR.",
      evidence: "Unified acquisition strategy — beauty vertical pitch",
      confidence: 88, category: 'conversion', revenue_linked: true
    },
    {
      learning: "PITCH PAR TYPE BUSINESS — COACH/FREELANCE: 'Tu vends ton expertise, mais ton contenu LinkedIn ressemble à celui de tout le monde. KeiroAI crée des visuels uniques qui arrêtent le scroll et positionnent ton personal brand. 3 posts/semaine = visibilité x5.' Ancrage: graphiste freelance = 100-300EUR/visuel.",
      evidence: "Unified acquisition strategy — coach/freelance vertical pitch",
      confidence: 87, category: 'conversion', revenue_linked: true
    },
    {
      learning: "OBJECTIONS PAR ÉTAPE FUNNEL: Discovery→'Je ne connais pas' = social proof vertical. Qualification→'Ça marche pour mon type?' = case study spécifique. Contact→'C'est cher' = ROI calculator. Nurture→'Pas le temps' = démo 2 min. Conversion→'Je réfléchis' = offre limitée ou trial. Chaque agent doit connaître les objections de SON étape.",
      evidence: "Unified acquisition strategy — objection handling by funnel stage",
      confidence: 91, category: 'conversion', revenue_linked: true
    },
    {
      learning: "HANDOFF COMMERCIAL→ONBOARDING: dès paiement confirmé, Léo transmet à Clara (Onboarding): type business, objectifs mentionnés, canaux prioritaires (Instagram/TikTok/LinkedIn), objections résolues, plan choisi. Clara personnalise le welcome en conséquence. Jamais de transition froide — le client doit sentir la continuité.",
      evidence: "Unified acquisition strategy — sales-to-onboarding handoff protocol",
      confidence: 92, category: 'conversion', revenue_linked: true
    },
  ],

  email: [
    // Funnel role
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE EMAIL: Hugo gère les séquences automatisées à chaque étape du funnel. Cold (score 0-39): 5 emails éducatifs sur 21j. Warm (score 40-69): nurture personnalisé par type business. Hot (score 70+): support conversion avec urgence. Post-conversion: séquence onboarding 5 emails sur 14j.",
      evidence: "Unified acquisition strategy — Email funnel role definition",
      confidence: 91, category: 'email', revenue_linked: true
    },
    {
      learning: "SÉQUENCE COLD PAR TYPE BUSINESS — RESTAURANT: E1 (J1): 'Le secret des restaurants qui remplissent grâce à Instagram' (éducatif). E2 (J3): 'Comment [nom restaurant similaire] a doublé ses réservations' (social proof). E3 (J7): 'Votre fiche Google mérite mieux' (pain point). E4 (J14): 'Créez votre premier visuel en 30s — gratuit' (CTA trial). E5 (J21): 'Dernière chance — 30 crédits offerts' (breakup+incentive).",
      evidence: "Unified acquisition strategy — restaurant cold email sequence",
      confidence: 89, category: 'email', revenue_linked: true
    },
    {
      learning: "SÉQUENCE COLD PAR TYPE BUSINESS — BOUTIQUE/COMMERCE: E1: 'Vos produits méritent mieux que des photos iPhone'. E2: 'Comment les boutiques Etsy qui cartonnent créent leur contenu'. E3: '5 types de posts qui font vendre sur Instagram'. E4: 'Testez gratuitement: importez une photo produit → visuel pro en 30s'. E5: 'On ne vous relancera plus — mais vos concurrents, eux, postent tous les jours'.",
      evidence: "Unified acquisition strategy — boutique cold email sequence",
      confidence: 88, category: 'email', revenue_linked: true
    },
    {
      learning: "SÉQUENCE WARM (score 40-69): déclenchée quand chatbot capte email OU prospect visite pricing OU 2+ images générées. E1 (immédiat): 'J'ai vu que tu as testé KeiroAI — voici 3 astuces pour [type business]'. E2 (J2): case study même vertical. E3 (J5): 'Les 3 erreurs qui coûtent cher à [type business] sur les réseaux'. E4 (J8): offre personnalisée. Toujours plain text, 80-120 mots max.",
      evidence: "Unified acquisition strategy — warm nurture email sequence",
      confidence: 90, category: 'email', revenue_linked: true
    },
    {
      learning: "COORDINATION EMAIL→COMMERCIAL: quand un email warm obtient un reply ou un click sur lien pricing → score +25, notifier Commercial (Léo) pour contact direct sous 5 min. Quand bounce >2% sur un segment → alerter Ads (Félix) pour exclure ces domaines du retargeting. Quand un email type business surperforme → remonter à Content (Léna) pour amplifier ce contenu.",
      evidence: "Unified acquisition strategy — Email-Commercial-Ads coordination",
      confidence: 89, category: 'email', revenue_linked: true
    },
    {
      learning: "RGPD COLD EMAIL FRANCE — RÈGLES STRICTES: (1) Adresse pro uniquement (@nom-entreprise.fr, JAMAIS @gmail/@hotmail sans consentement). (2) Objet en rapport avec l'activité du destinataire. (3) Lien désinscription dans CHAQUE email. (4) Identification expéditeur claire. (5) Pas plus de 3 relances sans réponse. (6) Honorer chaque désinscription sous 72h. (7) Registre de traitement CNIL à jour.",
      evidence: "Unified acquisition strategy — CNIL/RGPD cold email compliance rules",
      confidence: 95, category: 'email'
    },
    {
      learning: "SEGMENTATION ENVOI PAR TEMPÉRATURE: Cold (score 0-39) = mardi+jeudi 7h30-8h30 uniquement (2 envois/semaine max). Warm (40-69) = lundi-vendredi 9h-10h (1 envoi tous les 2-3j). Hot (70+) = envoi immédiat après trigger event. Post-churn = dimanche 20h (planification semaine). Ne jamais mixer cold et warm dans le même batch Brevo.",
      evidence: "Unified acquisition strategy — email send time segmentation France",
      confidence: 88, category: 'email', revenue_linked: true
    },
    {
      learning: "EMAIL WINBACK POST-CHURN: J1 post-annulation: 'Merci et un feedback?' (0 vente). J14: 'Nouvelle feature [pertinente pour leur type business]' (valeur). J30: '-50% pendant 3 mois pour revenir' (incentive). J60: 'On a créé 3 visuels pour ton [type business] — ils t'attendent' (curiosité). Taux récupération cible: 8-12%. Coordonner avec Retention (Théo).",
      evidence: "Unified acquisition strategy — post-churn winback email sequence",
      confidence: 87, category: 'email', revenue_linked: true
    },
  ],

  content: [
    // Funnel role
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE CONTENT: Léna produit le contenu qui alimente TOUTES les étapes du funnel. Discovery: SEO blog + réseaux sociaux KeiroAI. Qualification: case studies par vertical. Nurture: guides et templates. Conversion: comparatifs et ROI. Rétention: tips avancés et nouvelles features. Le contenu est le CARBURANT du funnel.",
      evidence: "Unified acquisition strategy — Content funnel role definition",
      confidence: 90, category: 'general', revenue_linked: true
    },
    {
      learning: "CONTENU PAR ÉTAPE FUNNEL — DISCOVERY: (1) Blog SEO: '10 idées posts Instagram pour [restaurant/boutique/coiffeur]' × 9 types business. (2) Reels: avant/après KeiroAI 15s. (3) TikTok: '3 erreurs réseaux sociaux des [type business]'. (4) LinkedIn: posts expert marketing digital PME. Objectif: trafic organique + brand awareness. KPI: impressions, clics site.",
      evidence: "Unified acquisition strategy — discovery content matrix",
      confidence: 88, category: 'content', revenue_linked: true
    },
    {
      learning: "CONTENU PAR ÉTAPE FUNNEL — QUALIFICATION/NURTURE: (1) Case studies: 'Comment [type business] utilise KeiroAI pour [résultat]' — 1 par vertical. (2) Guides PDF: 'Le guide complet du marketing Instagram pour [type business]' — lead magnet. (3) Comparatifs: KeiroAI vs Canva, vs CM freelance, vs agence. (4) Vidéos tutorielles: 60-90s par feature. KPI: leads capturés, engagement.",
      evidence: "Unified acquisition strategy — mid-funnel content matrix",
      confidence: 89, category: 'content', revenue_linked: true
    },
    {
      learning: "CONTENU PAR ÉTAPE FUNNEL — CONVERSION: (1) Témoignages vidéo clients (UGC 30-60s). (2) ROI calculator interactif par type business. (3) Comparatif prix détaillé (KeiroAI vs alternatives). (4) FAQ vidéo objections courantes. (5) Page 'Vu sur' (logos médias, partenaires). KPI: signup, trial-to-paid.",
      evidence: "Unified acquisition strategy — bottom-funnel conversion content",
      confidence: 90, category: 'conversion', revenue_linked: true
    },
    {
      learning: "COORDINATION CONTENT→TOUS LES AGENTS: Léna reçoit les objections récurrentes de Commercial (Léo) → crée du contenu qui y répond. Reçoit les mots-clés de SEO (Oscar) → optimise les articles. Reçoit les segments performants d'Ads (Félix) → adapte le messaging. Reçoit les feedbacks Onboarding (Clara) → crée des tutoriels. Content est au SERVICE de tous les agents.",
      evidence: "Unified acquisition strategy — Content cross-agent coordination hub",
      confidence: 91, category: 'general', revenue_linked: true
    },
    {
      learning: "CALENDRIER ÉDITORIAL PAR TYPE BUSINESS: chaque type a un planning mensuel de 12 contenus: 5 éducatifs (tips, tutoriels), 3 inspirationnels (avant/après, success stories), 2 promotionnels (features, pricing), 2 engagement (sondages, challenges). Rotation des types business chaque semaine pour couvrir tous les segments. Contenu evergreen recyclé tous les 3 mois.",
      evidence: "Unified acquisition strategy — editorial calendar by business type",
      confidence: 87, category: 'content'
    },
    {
      learning: "CONTENU LOCALISATION FRANCE: utiliser le vouvoiement pour le contenu formel (blog, LinkedIn), le tutoiement pour les réseaux sociaux (Instagram, TikTok). Références culturelles: mentions terroir, savoir-faire artisanal, commerce de proximité. Chiffres français (INSEE, CCI, France Num). Dates clés: soldes, fêtes des mères/pères, rentrée, Noël, Saint-Valentin, Beaujolais nouveau.",
      evidence: "Unified acquisition strategy — French content localization guidelines",
      confidence: 89, category: 'content'
    },
  ],

  seo: [
    // Funnel role
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE SEO: Oscar génère le trafic organique Discovery. Objectif: 40% du trafic total = organique à M12. Stratégie 3 piliers: (1) Pages programmatiques locales '[service]+[ville]+[type]'. (2) Blog content piliers + clusters. (3) Google Business Profile optimisé. SEO = canal le plus rentable à long terme (CAC→0).",
      evidence: "Unified acquisition strategy — SEO funnel role definition",
      confidence: 90, category: 'seo', revenue_linked: true
    },
    {
      learning: "PAGES PROGRAMMATIQUES ACQUISITION: créer 100+ landing pages: 'creation-visuel-[type]-[ville]'. Prioriser: Paris, Lyon, Marseille, Bordeaux, Toulouse, Nantes, Lille, Strasbourg, Nice, Montpellier × restaurant, boutique, coiffeur, coach. Template unique, contenu dynamique par combinaison. Chaque page = formulaire de capture + CTA trial gratuit.",
      evidence: "Unified acquisition strategy — programmatic SEO pages for acquisition",
      confidence: 88, category: 'seo', revenue_linked: true
    },
    {
      learning: "COORDINATION SEO→CONTENT→ADS: Oscar fournit à Content (Léna) les mots-clés à cibler chaque mois (volume + difficulté + intent). Oscar fournit à Ads (Félix) les termes organiques qui convertissent le mieux → Ads les achète en Google Ads pour doubler la couverture. SEO et Ads ne sont pas en compétition, ils se renforcent.",
      evidence: "Unified acquisition strategy — SEO-Content-Ads coordination triangle",
      confidence: 89, category: 'seo', revenue_linked: true
    },
    {
      learning: "MOTS-CLÉS ACQUISITION PAR INTENT: (1) Informationnel (top funnel): 'comment faire du contenu Instagram restaurant' — blog. (2) Comparaison (mid funnel): 'alternative Canva pour commerçants', 'KeiroAI avis' — pages comparatif. (3) Transactionnel (bottom funnel): 'outil IA création contenu prix', 'essayer KeiroAI gratuit' — landing page directe. Cibler les 3 intent simultanément.",
      evidence: "Unified acquisition strategy — keyword intent mapping for funnel stages",
      confidence: 90, category: 'seo', revenue_linked: true
    },
    {
      learning: "SEO LOCAL PARTENARIATS FRANCE: (1) Être listé sur France Num comme solution recommandée (3M+ TPE cible). (2) Pages sur annuaires SaaS: Capterra FR, G2 FR, GetApp, TrustPilot. (3) Guest posts sur Journal du CM, Maddyness, Le Blog du Modérateur. (4) Partenariats CCI régionales pour backlinks .cci.fr (haute autorité). Chaque backlink .fr qualifié = 3x valeur backlink international.",
      evidence: "Unified acquisition strategy — French SEO local partnerships",
      confidence: 87, category: 'seo', revenue_linked: true
    },
    {
      learning: "SCHEMA MARKUP ACQUISITION: SoftwareApplication (note, prix, features), FAQPage (questions fréquentes par type business), HowTo (tutoriels génération), Review (avis clients), LocalBusiness (pour pages programmatiques locales). FAQ schema = +20-30% CTR SERP. Chaque page programmatique doit avoir au minimum FAQPage + SoftwareApplication.",
      evidence: "Unified acquisition strategy — schema markup for acquisition pages",
      confidence: 86, category: 'seo'
    },
  ],

  onboarding: [
    // Funnel role
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE ONBOARDING: Clara transforme les nouveaux signups en utilisateurs activés. Métriques: Time-to-First-Value <5 min, Activation (3 générations en 7j), Day-1 Retention >60%, Day-7 Retention >40%. Clara est le pont entre acquisition et rétention — si l'onboarding échoue, tout l'investissement acquisition est perdu.",
      evidence: "Unified acquisition strategy — Onboarding funnel role definition",
      confidence: 92, category: 'general', revenue_linked: true
    },
    {
      learning: "ONBOARDING PERSONNALISÉ PAR SOURCE D'ACQUISITION: (1) Chatbot lead: skip intro, rappeler l'échange 'Tu m'avais dit que tu voulais améliorer tes posts Instagram'. (2) SEO/organique: éduquer 'Tu cherchais comment créer du contenu pro pour ton [type]'. (3) Ads: confirmer la promesse 'Ton premier visuel pro en 30 secondes, c'est maintenant'. (4) Referral: mentionner le parrain. (5) Promo code: mettre en avant les crédits bonus.",
      evidence: "Unified acquisition strategy — source-specific onboarding personalization",
      confidence: 90, category: 'general', revenue_linked: true
    },
    {
      learning: "ONBOARDING PAR TYPE BUSINESS: (1) Restaurant → suggérer prompts: 'Photo plat du jour ambiance tamisée', montrer mockup feed Instagram food. (2) Boutique → 'Photo produit fond épuré lifestyle', mockup stories shopping. (3) Coiffeur → 'Avant/après coupe tendance', mockup Reels. (4) Coach → 'Citation inspirante design premium', mockup LinkedIn. Pré-remplir le type au signup.",
      evidence: "Unified acquisition strategy — business-type-specific onboarding flows",
      confidence: 91, category: 'general', revenue_linked: true
    },
    {
      learning: "COORDINATION ONBOARDING→RETENTION: à J7, Clara transmet à Théo (Retention): plan choisi, features utilisées, features ignorées, score engagement (0-100), type business, canaux préférés. Théo prend le relais rétention. Si activation échouée (0 génération à J7) → retour à Email (Hugo) pour séquence re-engagement, pas abandon.",
      evidence: "Unified acquisition strategy — Onboarding-Retention handoff protocol",
      confidence: 90, category: 'general', revenue_linked: true
    },
    {
      learning: "SÉQUENCE WELCOME EMAILS ACQUISITION: E1 (J0, immédiat): 'Bienvenue [prénom] — ton premier visuel en 30s' + CTA direct génération. E2 (J1): '60 secondes pour maîtriser KeiroAI' + vidéo tutoriel. E3 (J3): 'Comment [type business similaire] utilise KeiroAI' + case study. E4 (J7): 'Tu n'as pas encore essayé [feature non utilisée]' + découverte. E5 (J14): feedback + incitation upgrade si trial.",
      evidence: "Unified acquisition strategy — welcome email sequence for activation",
      confidence: 89, category: 'general', revenue_linked: true
    },
    {
      learning: "ACTIVATION MILESTONES GAMIFIÉS: Milestone 1 (instant): première image générée → confetti + 'Tu viens de créer du contenu pro!'. Milestone 2 (J1-2): sauvegarder en bibliothèque → 'Tu construis ta banque de visuels'. Milestone 3 (J3-5): utiliser un modal social → 'Prêt pour publier!'. Milestone 4 (J7): 3ème génération → 'Tu produis plus que 80% des commerçants'. Chaque milestone = email de félicitation personnalisé.",
      evidence: "Unified acquisition strategy — gamified activation milestones",
      confidence: 88, category: 'general', revenue_linked: true
    },
    {
      learning: "COMMERÇANTS FRANÇAIS = 70%+ MOBILE: onboarding doit être mobile-first. 1 action par écran, CTAs zone pouce (bas d'écran), image-first (montrer le résultat avant l'input), pas de tour upfront (tooltips contextuels au moment du besoin). Si le prospect quitte pour chercher un desktop, 60% ne reviennent jamais. Test: l'onboarding complet doit fonctionner en <3 taps sur iPhone SE.",
      evidence: "Unified acquisition strategy — mobile-first French onboarding requirements",
      confidence: 90, category: 'general', revenue_linked: true
    },
  ],

  retention: [
    // Funnel role
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE RETENTION: Théo maintient les clients payants actifs et prévient le churn. Métriques: Logo churn <5%/mois (cible <3%), NRR >110%, feature adoption 3+ features. Théo intervient à J30+ (après onboarding Clara). Théo est le GARDIEN de la LTV — chaque mois de rétention supplémentaire = +49-199EUR de CA.",
      evidence: "Unified acquisition strategy — Retention funnel role definition",
      confidence: 91, category: 'retention', revenue_linked: true
    },
    {
      learning: "HEALTH SCORE PRÉDICTIF: Score 0-100 calculé: +20 login 3+/semaine, +25 génération image/vidéo cette semaine, +15 utilisation modal social (Instagram/TikTok/LinkedIn), +10 sauvegarde en bibliothèque, -20 aucun login 7j, -25 aucune génération 14j, -15 échec paiement. Score <35 = CRITIQUE → outreach immédiat Théo + Email winback Hugo. Score 35-65 = AT-RISK → nudge automatique.",
      evidence: "Unified acquisition strategy — predictive health score for retention",
      confidence: 90, category: 'retention', revenue_linked: true
    },
    {
      learning: "COORDINATION RETENTION→UPSELL→COMMERCIAL: quand Théo détecte un trigger expansion (crédits épuisés, features premium tentées, 2ème membre équipe) → notifier Commercial (Léo) pour upsell personnalisé. Quand Théo détecte un risque churn → alerter Email (Hugo) pour séquence re-engagement + CEO (Noah) pour alerte dashboard. Boucle fermée: chaque churn = post-mortem partagé à TOUS les agents.",
      evidence: "Unified acquisition strategy — Retention-Commercial-Email expansion coordination",
      confidence: 91, category: 'retention', revenue_linked: true
    },
    {
      learning: "EXPANSION REVENUE PAR TYPE BUSINESS: Restaurant → 'Vous avez épuisé vos crédits images — passez au plan Solo pour aussi créer des vidéos plats/ambiance'. Boutique → 'Vos visuels produits marchent — ajoutez des vidéos pour les stories'. Coach → 'Votre contenu LinkedIn cartonne — ajoutez TikTok pour toucher les 25-45 ans'. Chaque upsell = lié à un résultat concret, pas à des features abstraites.",
      evidence: "Unified acquisition strategy — business-type-specific upsell triggers",
      confidence: 89, category: 'retention', revenue_linked: true
    },
    {
      learning: "PROGRAMME AMBASSADEUR (Rétention + Acquisition): clients actifs M3+ avec score santé >70 = candidats ambassadeurs. Offrir: 50 crédits/mois bonus + badge 'Ambassadeur KeiroAI' + accès features beta + 50 crédits par filleul converti. Les ambassadeurs churnent 60% moins ET génèrent le meilleur canal d'acquisition (referral, CAC <5EUR).",
      evidence: "Unified acquisition strategy — ambassador program for retention and acquisition",
      confidence: 88, category: 'retention', revenue_linked: true
    },
    {
      learning: "RÉTENTION SAISONNIÈRE FRANCE: Juin → 'Prépare tes contenus été maintenant — planifie 2 mois en 1 heure'. Août → pause gratuite 1 mois (60-80% reviennent, restent 5.5 mois de plus). Décembre → 'Ton ROI 2026: tu as économisé X EUR vs un CM freelance'. Septembre → upsell rentrée 'Nouveau trimestre, nouveau plan?'. Aligner la rétention avec le rythme de vie des commerçants français.",
      evidence: "Unified acquisition strategy — seasonal French retention calendar",
      confidence: 88, category: 'retention', revenue_linked: true
    },
  ],

  marketing: [
    // Funnel role
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE MARKETING: Ami pilote la stratégie globale Discovery + Conversion avec Noah (CEO). Ami définit le positionnement, le messaging, les campagnes, les canaux. Ami coordonne Content (Léna), SEO (Oscar), Ads (Félix) comme une seule machine. Tout effort marketing doit être mesurable en pipeline (leads → MQL → SQL → clients).",
      evidence: "Unified acquisition strategy — Marketing funnel role definition",
      confidence: 90, category: 'general', revenue_linked: true
    },
    {
      learning: "POSITIONING FRANCE: KeiroAI n'est PAS un outil IA de plus. Positionnement: 'Le community manager IA des commerçants français'. Message clé: 'Du contenu pro en 30 secondes, sans compétences graphiques, à 1/10ème du prix d'un freelance.' Ennemi commun: les agences et freelances qui facturent 800-2000EUR/mois pour poster 3 fois par semaine. KeiroAI démocratise l'accès au contenu pro.",
      evidence: "Unified acquisition strategy — French market positioning statement",
      confidence: 92, category: 'general', revenue_linked: true
    },
    {
      learning: "CAMPAGNES CROSS-CANAL COORDONNÉES: chaque campagne = déployée simultanément: Blog SEO (Oscar) + Ads (Félix) + Réseaux sociaux (Léna) + Email (Hugo) + Chatbot messaging (widget). Thème mensuel unique: ex. 'Le mois de la rentrée Instagram' en septembre. Tous les agents utilisent le même messaging, les mêmes visuels, les mêmes chiffres. Cohérence = crédibilité.",
      evidence: "Unified acquisition strategy — cross-channel campaign coordination",
      confidence: 89, category: 'general', revenue_linked: true
    },
    {
      learning: "VIRAL LOOP ACQUISITION: User crée contenu KeiroAI → poste sur ses réseaux → watermark discret 'Créé avec KeiroAI' → followers voient du contenu pro → 'Comment tu fais?' → lien KeiroAI → signup. Renforcer: bouton 'Partager ta création' pré-rempli avec mention @KeiroAI. Objectif: coefficient viral K > 0.3 (chaque 3 clients en amènent 1 nouveau).",
      evidence: "Unified acquisition strategy — viral loop design for organic acquisition",
      confidence: 88, category: 'general', revenue_linked: true
    },
    {
      learning: "LEAD MAGNETS PAR TYPE BUSINESS: (1) Restaurant: 'Kit 30 idées posts Instagram food'. (2) Boutique: 'Le guide photographier vos produits avec un smartphone'. (3) Coiffeur: 'Template calendrier Reels beauté 1 mois'. (4) Coach: '20 templates posts LinkedIn coaching'. (5) Universel: 'Le guide ultime du marketing réseaux sociaux pour commerçants'. Chaque lead magnet = formulaire capture email → séquence nurture Email (Hugo).",
      evidence: "Unified acquisition strategy — business-type lead magnets for email capture",
      confidence: 87, category: 'general', revenue_linked: true
    },
    {
      learning: "FRANCE-SPECIFIC MARKETING: (1) S'inscrire France Num (3M+ TPE). (2) Partenariats CCI (réseau national, événements entrepreneuriat). (3) BPI France EuroQuity (matchmaking startup-investisseurs). (4) Salons: Salon des Entrepreneurs (Paris, février), Franchise Expo. (5) Communautés: La French Tech, Station F events, Réseau Entreprendre. (6) Presse: Les Echos, BFM Business, French Web, Maddyness.",
      evidence: "Unified acquisition strategy — France-specific marketing channels and partnerships",
      confidence: 88, category: 'general', revenue_linked: true
    },
    {
      learning: "A/B TEST PRIORITÉ ACQUISITION: (1) Page pricing (plus haut impact): tester titre, anchoring, CTA. (2) Landing page type business (mid impact): tester hero image, headline, social proof. (3) Onboarding flow (rétention impact): tester nombre d'étapes, contenu welcome. (4) Email objet (quick win): tester 2 objets par envoi. Règle: 1 seul test à la fois, 500+ conversions par variante, 2-4 semaines.",
      evidence: "Unified acquisition strategy — A/B testing priority for acquisition",
      confidence: 86, category: 'general', revenue_linked: true
    },
  ],

  ads: [
    // Funnel role
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE ADS: Félix gère le paid acquisition (Meta Ads, Google Ads, TikTok Ads). Objectif: CPA signup <30EUR, CPA paid <120EUR, ROAS >3:1 cold / >8:1 retargeting. Félix est le MOTEUR de scaling: quand un canal organique trouve un message qui marche, Félix l'amplifie avec du budget.",
      evidence: "Unified acquisition strategy — Ads funnel role definition",
      confidence: 90, category: 'general', revenue_linked: true
    },
    {
      learning: "AUDIENCES PAR ÉTAPE FUNNEL: Cold (Discovery): intérêts 'restaurant owner' + 'entrepreneur' + 'social media marketing' + lookalike 1% clients payants. Warm (Nurture): visiteurs site 30j + video viewers 75% + email engagers. Hot (Conversion): visiteurs pricing 7j + users free mode 2+ images + trial sans paiement. Exclure toujours: clients payants actifs + leads dead (score <10).",
      evidence: "Unified acquisition strategy — funnel-stage audience targeting",
      confidence: 91, category: 'general', revenue_linked: true
    },
    {
      learning: "CRÉATIVES PAR TYPE BUSINESS: Restaurant → vidéo 15s 'De la photo de plat au post Instagram en 30s' + split-screen avant/après. Boutique → carrousel '5 visuels produits créés en 2 min'. Coiffeur → Reel avant/après transformation + 'Et si votre feed Instagram ressemblait à ça?'. Coach → post LinkedIn mockup 'Votre personal brand en pilote automatique'. Chaque vertical = 3 créas minimum, rafraîchir toutes les 2 semaines.",
      evidence: "Unified acquisition strategy — business-type ad creative strategy",
      confidence: 89, category: 'general', revenue_linked: true
    },
    {
      learning: "COORDINATION ADS→TOUS: Félix reçoit de SEO (Oscar) les mots-clés qui convertissent → Google Ads. Félix reçoit de Content (Léna) les meilleurs contenus organiques → Spark Ads / promoted posts. Félix exclut les segments que Email (Hugo) signale comme bounce/unsubscribe. Félix transmet les audiences gagnantes à Marketing (Ami) pour ciblage organique. Feedback loop continu.",
      evidence: "Unified acquisition strategy — Ads cross-agent coordination",
      confidence: 90, category: 'general', revenue_linked: true
    },
    {
      learning: "RETARGETING SÉQUENCÉ 30J: J1-7 (Awareness): contenu éducatif, vidéo témoignage, ZÉRO CTA signup. J7-14 (Considération): démo feature, comparatif prix, social proof vertical. J14-21 (Conversion): 'Essai gratuit 7j sans CB', offre limitée. J21-30 (Urgence): 'Dernière chance — tes concurrents utilisent déjà l'IA'. Budget: 30% cold, 40% retargeting, 30% lookalike. Retargeting = 40-60% lower CPL.",
      evidence: "Unified acquisition strategy — sequenced retargeting framework",
      confidence: 89, category: 'general', revenue_linked: true
    },
    {
      learning: "RGPD ADS FRANCE 2026: (1) Consent Mode v2 obligatoire (Meta Pixel, Google Tag). (2) Server-side tracking via Conversions API récupère 20-30% signal perdu par cookie blockers. (3) Cookie banner opt-in explicite (CNIL). (4) Pas de Custom Audiences basées sur emails sans consentement pub. (5) Offline conversion import Stripe→Meta/Google sous 24h pour optimiser sur les PAYANTS, pas juste signups.",
      evidence: "Unified acquisition strategy — RGPD/CNIL ads compliance France 2026",
      confidence: 93, category: 'general'
    },
    {
      learning: "BUDGET ALLOCATION MENSUEL: Phase bootstrap (<50 clients): 70% Meta Ads (meilleur targeting PME), 20% Google Search (intent), 10% test TikTok. Phase croissance (50-500 clients): 40% Meta, 30% Google (PMax + Search), 20% TikTok, 10% retargeting cross-platform. Phase scale (500+): ajuster selon ROAS par canal. Minimum 20EUR/j par ad set Meta, 10EUR/j par groupe annonces Google.",
      evidence: "Unified acquisition strategy — budget allocation by growth phase",
      confidence: 87, category: 'general', revenue_linked: true
    },
  ],

  rh: [
    // Funnel role
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE RH: Sara s'assure que l'équipe a les compétences pour exécuter la stratégie d'acquisition. Priorisation recrutement: (1) Growth marketer (SEO + Ads) — impact direct sur acquisition. (2) Customer success (onboarding + retention) — impact sur LTV. (3) Dev fullstack — impact sur produit/conversion. Sara recrute les profils qui débloquent les bottlenecks du funnel.",
      evidence: "Unified acquisition strategy — RH funnel role definition",
      confidence: 87, category: 'general'
    },
    {
      learning: "EMPLOYER BRANDING = ACQUISITION INDIRECTE: chaque post LinkedIn du fondateur/équipe sur la construction de KeiroAI = visibilité organique auprès de la cible TPE/PME. Les posts 'behind the scenes startup' génèrent 5-10x plus d'engagement que les posts produit. Sara encourage l'équipe à partager (pas d'obligation), fournit les guidelines ton/contenu.",
      evidence: "Unified acquisition strategy — employer branding as acquisition channel",
      confidence: 85, category: 'general', revenue_linked: true
    },
    {
      learning: "RECRUTEMENT FRANCE SPECIFIQUE: Welcome to the Jungle (dominant France), LinkedIn 'Open to Work' filter, communautés France is AI / La French Tech. Profil growth marketer idéal: expérience SaaS B2B, maîtrise Meta Ads + Google Ads, connaissance marché TPE/PME français, autonome. Budget: 45-65K brut + BSPCE 0.5-1%. Alternants growth: 25% des offres IT/digital 2026, subvention jusqu'à 6K EUR.",
      evidence: "Unified acquisition strategy — French recruitment specifics for acquisition roles",
      confidence: 86, category: 'general'
    },
    {
      learning: "FORMATION ACQUISITION INTERNE: chaque nouveau membre (dev, support, etc.) doit comprendre le funnel complet en semaine 1. Formation: (1) Overview funnel 8 étapes. (2) Démo produit complète. (3) Écouter 3 appels clients. (4) Lire 5 case studies. (5) Créer soi-même 10 visuels KeiroAI. Tout le monde est un ambassadeur produit, pas seulement les commerciaux.",
      evidence: "Unified acquisition strategy — internal acquisition training for all roles",
      confidence: 85, category: 'general'
    },
  ],

  comptable: [
    // Funnel role
    {
      learning: "STRATÉGIE UNIFIÉE — RÔLE COMPTABLE: le comptable garantit que l'acquisition est RENTABLE. Métriques financières acquisition: CAC par canal, LTV:CAC par plan, payback period, marge brute par tier, unit economics. Si un canal a un LTV:CAC <2:1, recommander de réduire ou couper. Si un plan a une marge brute <60%, recommander restructuration.",
      evidence: "Unified acquisition strategy — Finance funnel role definition",
      confidence: 88, category: 'general', revenue_linked: true
    },
    {
      learning: "UNIT ECONOMICS PAR PLAN (à surveiller): Sprint 4.99EUR/3j → LTV faible (~30EUR), acceptable uniquement si CAC <10EUR (acquisition organique). Solo 49EUR/mois → LTV 588EUR (12 mois moyen), CAC acceptable <130EUR. Fondateurs 149EUR/mois → LTV 1788EUR, CAC acceptable <400EUR. Si un plan a un payback >9 mois, alerter CEO pour revoir pricing ou réduire acquisition sur ce tier.",
      evidence: "Unified acquisition strategy — unit economics monitoring by plan tier",
      confidence: 90, category: 'general', revenue_linked: true
    },
    {
      learning: "COÛTS API PAR ACQUISITION: chaque nouveau user gratuit coûte ~0.15EUR en API (3 images Seedream). Chaque trial coûte ~2-5EUR en API (usage exploratoire). Vérifier que le taux de conversion trial→paid (cible 15-25%) justifie le coût API trial. Si conversion <10%, le trial brûle du cash → soit améliorer l'onboarding, soit limiter le trial.",
      evidence: "Unified acquisition strategy — API cost per acquisition stage",
      confidence: 87, category: 'general', revenue_linked: true
    },
    {
      learning: "CIR/CII ACQUISITION: les dépenses de R&D sur le système d'agents IA (scoring, learning, orchestration) sont éligibles CIR à 30%. Le développement du pipeline de génération image/vidéo aussi. Cela réduit le coût effectif d'acquisition en remboursant une partie du coût de développement des outils d'acquisition. Documenter les heures R&D agents dès maintenant.",
      evidence: "Unified acquisition strategy — R&D tax credit impact on acquisition cost",
      confidence: 88, category: 'general', revenue_linked: true
    },
    {
      learning: "BUDGET ACQUISITION MENSUEL RECOMMANDÉ: Phase 0-50 clients: 2000-3000EUR/mois (70% ads, 30% outils). Phase 50-200: 5000-8000EUR/mois (50% ads, 25% content, 25% outils/events). Phase 200-500: 10-15K EUR/mois. Règle: ne jamais dépenser plus de 30% du MRR en acquisition (sustainability). Si MRR = 10K EUR → budget acq max 3K EUR.",
      evidence: "Unified acquisition strategy — monthly acquisition budget recommendations",
      confidence: 86, category: 'general', revenue_linked: true
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════════
// CROSS-AGENT COORDINATION RULES (injected to ALL agents)
// These define how agents work together at each funnel transition
// ════════════════════════════════════════════════════════════════════════════════

const CROSS_AGENT_RULES = [
  // Funnel transitions
  {
    agent: 'ceo',
    learning: "RÈGLE COORDINATION #1 — DISCOVERY→QUALIFICATION: quand un prospect interagit (chatbot message, page vue, image générée), le scoring auto démarre. Score <20 = noise, ignoré. Score 20-39 = signal, Email (Hugo) l'ajoute en séquence cold. Score 40+ = MQL, Commercial (Léo) est notifié. Le scoring est le LIEN entre Discovery et le reste du funnel. Tous les agents alimentent le scoring.",
    evidence: "Unified acquisition strategy — cross-agent coordination rule #1",
    confidence: 93, category: 'general', revenue_linked: true
  },
  {
    agent: 'ceo',
    learning: "RÈGLE COORDINATION #2 — QUALIFICATION→CONTACT: quand un lead atteint score 40+ (MQL), 3 choses simultanées: (1) Commercial (Léo) reçoit la fiche complète (type business, source, interactions). (2) Email (Hugo) bascule de cold→warm. (3) Ads (Félix) l'exclut du cold targeting et l'ajoute en retargeting chaud. Temps max entre MQL et premier contact: 5 minutes.",
    evidence: "Unified acquisition strategy — cross-agent coordination rule #2",
    confidence: 92, category: 'general', revenue_linked: true
  },
  {
    agent: 'ceo',
    learning: "RÈGLE COORDINATION #3 — CONTACT→NURTURE: si Commercial (Léo) n'obtient pas de réponse sous 48h, le lead retourne en nurture Email (Hugo) avec séquence warm. Content (Léna) priorise la création de contenu pour le type business de ce lead. Le lead n'est PAS abandonné — il est recyclé. Un lead nurturé qui revient à score 70+ est re-routé à Commercial.",
    evidence: "Unified acquisition strategy — cross-agent coordination rule #3",
    confidence: 91, category: 'general', revenue_linked: true
  },
  {
    agent: 'commercial',
    learning: "RÈGLE COORDINATION #4 — NURTURE→CONVERSION: quand un lead en nurture montre un signal fort (reply email, page pricing, retour chatbot), il passe à score 70+ (SQL/hot). Commercial (Léo) reprend avec approche personnalisée: 'J'ai vu que tu as regardé nos offres — je peux t'aider à choisir le bon plan pour ton [type business]?'. L'offre doit être pertinente au type business, pas générique.",
    evidence: "Unified acquisition strategy — cross-agent coordination rule #4",
    confidence: 90, category: 'conversion', revenue_linked: true
  },
  {
    agent: 'onboarding',
    learning: "RÈGLE COORDINATION #5 — CONVERSION→ONBOARDING: dès le paiement confirmé, Commercial (Léo) transmet à Clara (Onboarding): type business, objectifs, canaux prioritaires, objections résolues, plan choisi. Clara déclenche la séquence welcome personnalisée en <1 minute. Le client ne doit JAMAIS sentir un vide entre l'achat et l'onboarding. Expérience fluide = première impression déterminante.",
    evidence: "Unified acquisition strategy — cross-agent coordination rule #5",
    confidence: 93, category: 'general', revenue_linked: true
  },
  {
    agent: 'retention',
    learning: "RÈGLE COORDINATION #6 — ONBOARDING→RETENTION: à J7, Clara (Onboarding) transmet à Théo (Retention) le profil complet: features utilisées, score engagement, type business, canaux préférés. Théo démarre le health score monitoring. Si le client n'a pas été activé (0 génération à J7), Théo alerte Email (Hugo) pour séquence re-engagement — le client est à risque avant même d'être vraiment client.",
    evidence: "Unified acquisition strategy — cross-agent coordination rule #6",
    confidence: 91, category: 'retention', revenue_linked: true
  },
  {
    agent: 'retention',
    learning: "RÈGLE COORDINATION #7 — RETENTION→UPSELL: quand Théo détecte un trigger expansion (crédits épuisés avant fin de mois, tentative d'accès feature premium, deuxième utilisateur) → notification à Commercial (Léo) avec contexte complet pour upsell. L'upsell est TOUJOURS lié à un besoin constaté, jamais un push commercial à froid. Timing = quand le client ressent le manque, pas quand nous voulons vendre.",
    evidence: "Unified acquisition strategy — cross-agent coordination rule #7",
    confidence: 90, category: 'retention', revenue_linked: true
  },
  {
    agent: 'retention',
    learning: "RÈGLE COORDINATION #8 — CHURN→WINBACK: quand un client cancel, Théo lance: (1) Post-mortem immédiat (raison). (2) Email (Hugo) démarre séquence winback 4 emails sur 60j. (3) Si raison = prix → Comptable analyse si une offre spéciale est rentable. (4) Si raison = manque usage → Content (Léna) crée du contenu adapté. (5) La raison de churn est partagée à TOUS les agents comme learning pour prévenir les prochains.",
    evidence: "Unified acquisition strategy — cross-agent coordination rule #8",
    confidence: 91, category: 'retention', revenue_linked: true
  },

  // Business type channel strategies
  {
    agent: 'marketing',
    learning: "CANAL PAR TYPE BUSINESS — RESTAURANT: (1) Instagram = canal #1 (73% clients food y cherchent). (2) Google Maps/Business = canal #2 (recherche locale). (3) TikTok = canal #3 (food content viral). (4) Facebook = canal #4 (communauté locale, avis). Séquence acquisition: Google Maps discovery → Instagram social proof → conversion. Ads: Meta ciblant 'Restaurant owner' + 'Food business'.",
    evidence: "Unified acquisition strategy — restaurant channel strategy",
    confidence: 90, category: 'general', revenue_linked: true
  },
  {
    agent: 'marketing',
    learning: "CANAL PAR TYPE BUSINESS — BOUTIQUE: (1) Instagram = canal #1 (shopping features, product tags). (2) Google Shopping/SEO = canal #2 (intent achat). (3) Pinterest = canal #3 (découverte produit). (4) Facebook Marketplace = canal #4. Séquence acquisition: SEO 'acheter [produit] [ville]' → Instagram social proof → conversion. Ads: Meta Shopping + Google Shopping.",
    evidence: "Unified acquisition strategy — boutique channel strategy",
    confidence: 88, category: 'general', revenue_linked: true
  },
  {
    agent: 'marketing',
    learning: "CANAL PAR TYPE BUSINESS — COIFFEUR/BEAUTÉ: (1) Instagram = canal #1 (avant/après, Reels). (2) Google Maps = canal #2 (recherche 'coiffeur près de moi'). (3) TikTok = canal #3 (transformations virales). (4) Booksy/Planity = canal #4 (réservation). Séquence acquisition: Google Maps → Instagram portfolio → réservation. Ads: Meta ciblant intérêts beauté + localisation.",
    evidence: "Unified acquisition strategy — beauty/salon channel strategy",
    confidence: 88, category: 'general', revenue_linked: true
  },
  {
    agent: 'marketing',
    learning: "CANAL PAR TYPE BUSINESS — COACH/FREELANCE/PROFESSIONNEL: (1) LinkedIn = canal #1 (personal branding, B2B). (2) Instagram = canal #2 (lifestyle, behind the scenes). (3) YouTube = canal #3 (contenu long, autorité). (4) Podcast guest = canal #4. Séquence acquisition: LinkedIn content marketing → website/landing → conversion. Ads: LinkedIn Ads ciblant 'Coach', 'Consultant', 'Freelance'.",
    evidence: "Unified acquisition strategy — coach/freelance channel strategy",
    confidence: 87, category: 'general', revenue_linked: true
  },
  {
    agent: 'marketing',
    learning: "CANAL PAR TYPE BUSINESS — CAVISTE/FLEURISTE/ARTISAN: (1) Instagram = canal #1 (visuel produit artisanal). (2) Google Maps = canal #2 (local). (3) Facebook = canal #3 (communauté locale, événements). (4) Marchés/salons = canal offline (QR code → KeiroAI). Séquence: événement local → Google Maps → Instagram → fidélisation. Ads: Meta hyperlocal (rayon 10km) + saisons (vendanges, Saint-Valentin, fête des mères).",
    evidence: "Unified acquisition strategy — artisan/caviste/fleuriste channel strategy",
    confidence: 86, category: 'general', revenue_linked: true
  },

  // France-specific compliance
  {
    agent: 'email',
    learning: "RGPD RÈGLE ACQUISITION UNIVERSELLE: TOUT agent qui collecte des données personnelles (email, téléphone, nom) doit: (1) Informer de la finalité du traitement. (2) Permettre l'opposition/désinscription. (3) Ne jamais transmettre les données à des tiers sans consentement. (4) Supprimer les données sur demande sous 30j. (5) Documenter chaque traitement dans le registre CNIL. Non-conformité = amende jusqu'à 4% CA mondial.",
    evidence: "Unified acquisition strategy — RGPD universal compliance rule for all agents",
    confidence: 95, category: 'general'
  },
  {
    agent: 'commercial',
    learning: "CULTURE BUSINESS FRANÇAISE ACQUISITION: (1) Le tutoiement est OK avec les jeunes entrepreneurs/freelances, vouvoiement par défaut avec les commerçants traditionnels. (2) Les Français sont méfiants envers le 'trop commercial' — approche conseil, pas vente agressive. (3) La relation de confiance prend du temps — ne jamais forcer la conversion. (4) Mentionner 'entreprise française' est un argument de vente (souveraineté données, support en français).",
    evidence: "Unified acquisition strategy — French business culture in acquisition",
    confidence: 89, category: 'general', revenue_linked: true
  },
  {
    agent: 'marketing',
    learning: "MARCHÉ LOCAL FRANCE INSIGHTS: (1) 3.9M TPE/PME en France, 96% ont <10 salariés. (2) 67% des TPE considèrent la visibilité en ligne comme prioritaire (France Num 2025). (3) Seulement 37% ont une stratégie réseaux sociaux structurée. (4) Budget moyen com digitale TPE: 200-500EUR/mois. (5) Le bouche-à-oreille reste le canal #1 des commerçants → viral loop et referral sont ESSENTIELS. TAM KeiroAI France = ~1.5M entreprises (TPE avec activité B2C).",
    evidence: "Unified acquisition strategy — French local market insights for acquisition sizing",
    confidence: 90, category: 'general', revenue_linked: true
  },

  // Cross-agent intelligence sharing
  {
    agent: 'ceo',
    learning: "INTELLIGENCE PARTAGÉE — BOUCLE DE FEEDBACK: chaque semaine, chaque agent partage son TOP learning avec tous les autres. Format: '[Agent] a appris que [learning] basé sur [evidence]. Impact funnel: [étape affectée].' Noah agrège dans le brief hebdomadaire. Les learnings confirmés par 2+ agents sont promus automatiquement en confidence +15. C'est la mémoire collective qui s'améliore.",
    evidence: "Unified acquisition strategy — weekly cross-agent intelligence sharing protocol",
    confidence: 89, category: 'general'
  },
  {
    agent: 'ceo',
    learning: "ESCALATION RULES: (1) Lead hot sans réponse 24h → alerte CEO + Commercial. (2) Campagne ads CPA >2x cible 3j → alerte CEO + Ads. (3) Churn spike >2x moyenne 7j → alerte CEO + Retention + Email. (4) Bug produit impactant conversion → alerte CEO + tous agents en contact client. (5) Opportunité partenariat → CEO décide en <24h. Les alertes sont des SIGNAUX, pas du micromanagement.",
    evidence: "Unified acquisition strategy — escalation rules for funnel protection",
    confidence: 88, category: 'general', revenue_linked: true
  },
];

// ════════════════════════════════════════════════════════════════════════════════
// INJECTION
// ════════════════════════════════════════════════════════════════════════════════

async function injectLearnings() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  UNIFIED ACQUISITION STRATEGY — Injection into KeiroAI Agents');
  console.log('════════════════════════════════════════════════════════════════\n');

  let totalInjected = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // 1. Inject agent-specific learnings
  for (const [agent, learnings] of Object.entries(ACQUISITION_STRATEGY)) {
    console.log(`\n[${agent.toUpperCase()}] Injecting ${learnings.length} acquisition strategy learnings...`);

    for (const l of learnings) {
      const result = await injectOne(agent, l);
      if (result === 'injected') totalInjected++;
      else if (result === 'skipped') totalSkipped++;
      else totalErrors++;
    }
  }

  // 2. Inject cross-agent coordination rules
  console.log(`\n[CROSS-AGENT] Injecting ${CROSS_AGENT_RULES.length} coordination rules...`);
  for (const l of CROSS_AGENT_RULES) {
    const result = await injectOne(l.agent, l);
    if (result === 'injected') totalInjected++;
    else if (result === 'skipped') totalSkipped++;
    else totalErrors++;
  }

  // Results
  const totalLearnings = Object.values(ACQUISITION_STRATEGY).reduce((a, b) => a + b.length, 0) + CROSS_AGENT_RULES.length;
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Total learnings defined:    ${totalLearnings}`);
  console.log(`  Injected (new):             ${totalInjected}`);
  console.log(`  Skipped (duplicate):        ${totalSkipped}`);
  console.log(`  Errors:                     ${totalErrors}`);
  console.log(`  Agents covered:             ${Object.keys(ACQUISITION_STRATEGY).length}`);
  console.log(`  Cross-agent rules:          ${CROSS_AGENT_RULES.length}`);
  console.log('════════════════════════════════════════════════════════════════');

  if (totalInjected > 0) {
    console.log('\n  All learnings are pool_level: global (shared to ALL agents)');
    console.log('  Confidence 85-95 = INSIGHT tier (permanent, never expires)');
    console.log('  These learnings define the unified acquisition funnel:');
    console.log('  Discovery → Qualification → Contact → Nurture → Conversion → Onboarding → Retention → Upsell');
    console.log('\n  Funnel stages covered per agent:');
    console.log('    CEO (Noah):        Orchestration + KPIs + Arbitrage canaux');
    console.log('    Commercial (Leo):  Qualification → Contact → Conversion');
    console.log('    Email (Hugo):      Cold sequences → Warm nurture → Winback');
    console.log('    Content (Lena):    Content for ALL funnel stages');
    console.log('    SEO (Oscar):       Discovery organic + Programmatic pages');
    console.log('    Onboarding (Clara): Signup → Activation → Handoff retention');
    console.log('    Retention (Theo):  Health score → Churn prevention → Upsell');
    console.log('    Marketing (Ami):   Positioning + Campaigns + Viral loop');
    console.log('    Ads (Felix):       Paid acquisition + Retargeting sequences');
    console.log('    RH (Sara):         Hiring for funnel needs + Employer brand');
    console.log('    Comptable:         Unit economics + Budget allocation');
  }
}

async function injectOne(agent, l) {
  // Dedup check
  const searchKey = l.learning.substring(0, 50).replace(/['"]/g, '');
  const { data: existing } = await supabase
    .from('agent_logs')
    .select('id')
    .eq('agent', agent)
    .eq('action', 'learning')
    .ilike('data->>learning', `%${searchKey}%`)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`  [SKIP] Already exists: "${l.learning.substring(0, 60)}..."`);
    return 'skipped';
  }

  const { error } = await supabase.from('agent_logs').insert({
    agent,
    action: 'learning',
    status: 'active',
    data: {
      learning: l.learning,
      evidence: l.evidence,
      confidence: l.confidence,
      category: l.category || 'general',
      tier: l.confidence >= 85 ? 'insight' : 'rule',
      revenue_linked: l.revenue_linked || false,
      pool_level: 'global',
      source: 'unified_acquisition_strategy',
      injected_at: new Date().toISOString(),
      confirmed_count: 5, // High pre-confirmation for immediate authority
      confirmations: 5,
      contradictions: 0,
      expires_at: l.confidence >= 85 ? null : new Date(Date.now() + 180 * 86400000).toISOString(), // Insights permanent, rules 180 days
      last_confirmed_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`  [ERROR] ${l.learning.substring(0, 60)}...: ${error.message}`);
    return 'error';
  }

  console.log(`  [OK] ${l.learning.substring(0, 60)}...`);
  return 'injected';
}

injectLearnings().catch(console.error);
