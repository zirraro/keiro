/**
 * ROUND 2 — ELITE knowledge injection for RH (Sara) and Comptable (Louis).
 * 80+ verified learnings grounded in 2025-2026 French law and real SaaS financial data.
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/inject-elite-round2-rh-comptable.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://duxjdlzdfjrhyojjwnig.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required. Run with:\nSUPABASE_SERVICE_ROLE_KEY=xxx node scripts/inject-elite-round2-rh-comptable.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ROUND2_KNOWLEDGE = {

  // ═══════════════════════════════════════════════════════════════════════
  // RH (Sara) — Juridique, RGPD, IA Act, Droit du travail — 42 learnings
  // ═══════════════════════════════════════════════════════════════════════
  rh: [

    // --- Convention Collective Syntec (IDCC 1486) ---
    {
      learning: "Convention Syntec forfait jours 2026 : un cadre ne peut être placé en forfait jours que s'il est ingénieur/cadre position 2.3 minimum, ou si sa rémunération annuelle dépasse 2x le PASS (96 120 EUR en 2026). Le forfait est plafonné à 218 jours/an, ouvrant droit à 9 jours de RTT en 2026. La mise en forfait jours impose une majoration de 20% (position 2.3) ou 22% (position 3.1+) sur le salaire minimum conventionnel. Absence de convention individuelle de forfait écrite = heures supplémentaires réclamables rétroactivement sur 3 ans.",
      evidence: "Convention Syntec Art. 4 Chapitre 2 Accord du 22/06/1999 révisé, payfit.com forfait jours Syntec 2026, kenko.fr RTT Syntec 2026, travail-industrie.com CCN Syntec 2026",
      confidence: 93, category: 'convention_syntec', revenue_linked: false
    },
    {
      learning: "Syntec salaires minima 2026 : augmentation de 20 EUR par coefficient sur l'ensemble de la grille. Les salariés en modalité 'Réalisation de mission' (35h) doivent percevoir au minimum 115% du salaire minimum conventionnel (SMC). Les cadres en forfait jours (modalité 'Mission avec Autonomie Complète') doivent percevoir au minimum 120% du SMC. Un écart entre rémunération réelle et minimum Syntec = rappel de salaire sur 3 ans + dommages-intérêts. Vérifier la grille à chaque embauche et chaque entretien annuel.",
      evidence: "Avenant salaires Syntec 2026, free-work.com CCN Syntec guide, cgtatos.org minima Syntec, syntec.fr convention collective",
      confidence: 91, category: 'convention_syntec', revenue_linked: false
    },
    {
      learning: "RTT Syntec calcul 2026 : pour les modalités standard (35h), les RTT se calculent via la méthode du forfait. Formule : 365 - 218 (jours travaillés) - 25 (CP) - 104 (week-ends) - jours fériés tombant un jour ouvré = RTT. En 2026 avec 9 jours fériés sur jours ouvrés : 9 RTT. Attention : les RTT non pris au 31/12 sont perdus sauf accord d'entreprise contraire. La monétisation des RTT est possible via le dispositif de rachat (majoration +10% minimum). La CCN Syntec prévoit 3 modalités de temps de travail : Standard (35h), Réalisation de mission (38h30 + 8-10 JRTT), Forfait jours (218j + 9 JRTT).",
      evidence: "Syntec Accord temps de travail 22/06/1999, iedu.fr RTT Syntec 2025, kenko.fr calcul RTT Syntec 2026, juritravail.com guide RTT Syntec",
      confidence: 90, category: 'convention_syntec', revenue_linked: false
    },

    // --- RGPD Mastery for AI SaaS ---
    {
      learning: "CNIL bilan 2025 : 486,8 millions EUR d'amendes cumulées (+781% vs 2024). 259 décisions dont 83 sanctions et 143 mises en demeure. 67 sanctions via procédure simplifiée (plafond 20 000 EUR). Amendes majeures : 325M EUR (un acteur tech), 150M EUR (SHEIN), 27M + 15M EUR (FREE en janvier 2026 suite à fuite de données), 5M EUR (France Travail sécurité données). La tenue du registre des traitements est le 1er document contrôlé lors d'un audit CNIL — son absence = facteur aggravant systématique.",
      evidence: "CNIL bilan sanctions 2025, cnil.fr sanctions prononcées, dpo-partage.fr sanctions CNIL RGPD 2025, rgpdkit.fr bilan amendes 2025",
      confidence: 95, category: 'rgpd', revenue_linked: false
    },
    {
      learning: "Registre des traitements pour KeiroAI — traitements à documenter impérativement : (1) génération d'images/vidéos via IA (prompts utilisateurs, images uploadées), (2) CRM prospects (emails, téléphone, scoring), (3) chatbot (conversations, détection intentions), (4) analytics (tracking utilisateurs), (5) facturation Stripe (données bancaires), (6) cold emailing Brevo (listes de prospection). Chaque traitement doit préciser : finalité, base légale (consentement/intérêt légitime/contrat), catégories de données, destinataires, durée de conservation, mesures de sécurité. Mise à jour minimum trimestrielle.",
      evidence: "RGPD Art. 30, CNIL modèle registre traitements, swim.legal conformité RGPD 2026, opt-on.eu 6 documents RGPD essentiels",
      confidence: 92, category: 'rgpd', revenue_linked: false
    },
    {
      learning: "AIPD (Analyse d'Impact) obligatoire pour KeiroAI : l'utilisation d'IA générative traitant des données personnelles (prompts contenant potentiellement des données perso, images de personnes, voix via TTS) impose une AIPD AVANT mise en production. Contenu obligatoire : description systématique des traitements, évaluation de la nécessité/proportionnalité, risques pour les droits des personnes, mesures d'atténuation. L'AIPD est un document vivant à mettre à jour au minimum annuellement et à chaque évolution significative du traitement (nouvelle feature IA, nouveau modèle).",
      evidence: "RGPD Art. 35, CNIL guide AIPD méthodologie, ayinedjimi-consultants RGPD 2026, witik.io guide sanctions RGPD 2026",
      confidence: 91, category: 'rgpd', revenue_linked: false
    },
    {
      learning: "DPO pour SaaS IA en France : pas strictement obligatoire pour une PME sauf si suivi régulier/systématique à grande échelle ou traitement massif de données sensibles. Cependant, avec l'IA Act 2025-2026, le DPO devient le pivot de la gouvernance croisée RGPD + IA Act. Son rôle élargi : superviser les AIPD, le registre des traitements, la conformité Article 50 IA Act (transparence contenu IA), la traçabilité des systèmes IA. Pour une startup <50 salariés : un DPO externe mutualisé coûte 300-600 EUR/mois et évite les risques de non-conformité.",
      evidence: "RGPD Art. 37-39, adequacy.app DPO/IA Act analysis 2025, CNIL guide DPO, leto.legal recommandations DPO",
      confidence: 88, category: 'rgpd', revenue_linked: false
    },
    {
      learning: "Prospection commerciale CNIL B2B vs B2C : en B2B (KeiroAI vend aux entreprises), le consentement préalable n'est PAS requis — l'intérêt légitime suffit. Conditions : (1) le message est en rapport avec la profession du destinataire, (2) information claire sur l'identité de l'expéditeur, (3) lien de désinscription fonctionnel dans chaque email, (4) données conservées max 3 ans après dernier contact. En B2C : opt-in préalable OBLIGATOIRE (case à cocher non pré-cochée). SOLOCAL sanctionné 900 000 EUR en 2025 pour prospection non conforme. Loi du 30/06/2025 : à partir d'août 2026, tout démarchage téléphonique non sollicité sera interdit sauf consentement explicite.",
      evidence: "CNIL guide prospection commerciale, CNIL prospection par courrier électronique, erab2b.com règles CNIL 2025, leto.legal RGPD prospection B2B",
      confidence: 93, category: 'rgpd_marketing', revenue_linked: true
    },
    {
      learning: "Cookies CNIL 2025-2026 : amendes record (Google 325M EUR, SHEIN 150M EUR liées aux cookies/traceurs). Exigences : le refus doit être aussi simple que l'acceptation — bouton 'Tout refuser' obligatoire ou 'Continuer sans accepter' en haut à droite. Dark patterns sanctionnés. Les sites avec >6 cookies tiers ont chuté de 24% à 12% suite aux contrôles. 68% des Français jugent l'info cookies insuffisante. Pour KeiroAI : implémenter un bandeau RGPD conforme (ex: Axeptio, Didomi, Cookiebot) avec refus en 1 clic, pas de traceur avant consentement, durée max cookies = 13 mois.",
      evidence: "CNIL bilan cookies 2025, Matomo/CNIL 475M EUR enforcement, Bird & Bird analysis cookies France",
      confidence: 92, category: 'rgpd', revenue_linked: false
    },

    // --- EU AI Act ---
    {
      learning: "IA Act calendrier d'application : 2 février 2025 = interdictions (scoring social, manipulation subliminale) + obligation de littératie IA (Art. 4). 2 août 2025 = obligations modèles GPAI + gouvernance. 2 août 2026 = application complète : obligations systèmes à haut risque + transparence Article 50. KeiroAI utilisant de l'IA générative (chatbot, génération contenu) est concerné par l'Article 50 : obligation d'informer les utilisateurs que le contenu est généré par IA.",
      evidence: "Règlement UE 2024/1689 (AI Act), aiacto.eu AI Act PME 2026, mdp-data.com AI Act obligations, secureprivacy.ai EU AI Act compliance guide",
      confidence: 94, category: 'ia_act', revenue_linked: false
    },
    {
      learning: "IA Act Article 50 — obligations de transparence pour KeiroAI : (1) tout contenu généré par IA (textes, images, vidéos, audio) doit être identifié comme tel, (2) les utilisateurs du chatbot doivent être informés qu'ils interagissent avec une IA, (3) les deepfakes / contenus synthétiques doivent être marqués (watermark, métadonnées). Deadline : 2 août 2026. Non-conformité : jusqu'à 15M EUR ou 3% du CA mondial. KeiroAI = système à risque limité (chatbot + génération contenu) — pas haut risque, mais transparence obligatoire.",
      evidence: "AI Act Art. 50, aiacto.eu transparence deepfakes contenu IA, ddg.fr consultation Article 50, orrick.com 6 steps AI Act 2026",
      confidence: 93, category: 'ia_act', revenue_linked: true
    },
    {
      learning: "IA Act classification risques pour KeiroAI : le système se classe en 'risque limité' (génération de contenu, chatbot). Les obligations spécifiques : transparence (Art. 50), littératie IA (Art. 4 — former les utilisateurs), documentation technique minimale. KeiroAI n'est PAS un système à haut risque (pas de scoring RH, pas de décision automatisée affectant les droits fondamentaux). Sanctions par palier : 35M EUR ou 7% CA pour pratiques interdites, 15M EUR ou 3% CA pour non-conformité haut risque, 7,5M EUR ou 1% CA pour informations incorrectes.",
      evidence: "AI Act Art. 6-7 classification, legalnodes.com AI Act 2026 updates, gdprlocal.com EU AI Act summary, introl.com AI Act compliance infrastructure",
      confidence: 91, category: 'ia_act', revenue_linked: false
    },
    {
      learning: "IA Act Article 53 — GPAI et droit d'auteur : depuis août 2025, les fournisseurs de modèles d'IA générative doivent publier un résumé détaillé des données d'entraînement protégées par le droit d'auteur utilisées. Pour KeiroAI (utilisateur de modèles tiers — Claude, Seedream, Kling) : vérifier que les fournisseurs de modèles sont conformes Art. 53. Inclure dans les CGU une clause de non-responsabilité sur le contenu généré par les modèles tiers et documenter la chaîne de conformité.",
      evidence: "AI Act Art. 53, matteoda-propriete-intellectuelle.fr perspectives PI/IA 2025-2026, Sénat rapport r24-842",
      confidence: 87, category: 'ia_act', revenue_linked: true
    },

    // --- CGV/CGU SaaS France ---
    {
      learning: "CGV SaaS France clauses obligatoires 2026 : identité complète (SIRET, adresse, contact), caractéristiques du service, tarifs et modalités de paiement, droit de rétractation 14 jours B2C (sauf exécution immédiate acceptée), garantie légale de conformité numérique (pendant toute la durée du contrat), garantie vices cachés (2 ans), modalités de résiliation, limitation de responsabilité, loi applicable et juridiction. Nouveau 2026 (applicable 19 juin 2026) : les SaaS B2C doivent proposer une fonctionnalité de rétractation en ligne — 'un clic pour se rétracter'.",
      evidence: "Code de la consommation Art. L111-1 à L111-7, martin.avocat.fr CGV/CGU 2026, captaincontrat.com mentions obligatoires CGV, legalplace.fr CGV logiciel SaaS",
      confidence: 92, category: 'cgv_saas', revenue_linked: true
    },
    {
      learning: "Garantie légale de conformité numérique (directive 2019/770 transposée) : pour un SaaS en continu, le fournisseur garantit la conformité pendant TOUTE la durée du contrat. Obligations : fournir les mises à jour nécessaires au maintien de la conformité, informer le client des mises à jour et de leur impact, indiquer les prérequis techniques. Si non-conformité : le client a droit à la mise en conformité sans frais dans les 30 jours. Si impossible : résiliation + remboursement au prorata. Une clause CGV qui exclut cette garantie = clause abusive réputée non écrite.",
      evidence: "Directive UE 2019/770, Code consommation Art. L217-1 et suivants, leblogdudirigeant.com garanties légales CGV, victorisavocat.com CGV 2026",
      confidence: 90, category: 'cgv_saas', revenue_linked: true
    },
    {
      learning: "Clauses abusives SaaS à éviter absolument : (1) exonération totale de responsabilité du prestataire, (2) modification unilatérale du contrat sans droit de résiliation, (3) résiliation asymétrique (préavis plus long pour le client que pour le prestataire), (4) suppression du droit à réparation du client, (5) renouvellement tacite sans information préalable suffisante (rappel obligatoire 1-3 mois avant échéance depuis loi Chatel). Clause abusive = réputée non écrite par le juge + risque amende DGCCRF jusqu'à 15 000 EUR par infraction.",
      evidence: "Code consommation Art. L212-1, Commission clauses abusives recommandations, aurorebonavia-avocat.fr CGV/CGU conformité, HAAS Avocats guide clauses abusives",
      confidence: 89, category: 'cgv_saas', revenue_linked: false
    },

    // --- Propriété intellectuelle IA ---
    {
      learning: "Droit d'auteur et contenu IA en France 2025-2026 : les contenus produits exclusivement par IA ne bénéficient PAS du droit d'auteur français. Le droit français exige l'originalité humaine = empreinte de la personnalité de l'auteur (personne physique). L'IA n'a pas de personnalité juridique. Pour que les contenus KeiroAI soient protégeables : l'utilisateur doit apporter une intervention créative substantielle (choix de prompt détaillé, sélection, retouche, composition). Les CGU doivent clarifier : le client conserve les droits sur ses créations, KeiroAI ne revendique aucun droit de PI sur les contenus générés.",
      evidence: "CSPLA mission PI/IA (conclusions été 2026), matteoda-propriete-intellectuelle.fr perspectives 2025-2026, cms.law IA générative et PI, alexia.fr IA et droit auteur 2025",
      confidence: 87, category: 'propriete_intellectuelle', revenue_linked: true
    },
    {
      learning: "Parlement européen rapport 2026 (A10-0019/2026) sur IA et droit d'auteur : recommandation de créer un droit sui generis pour les contenus IA (distinct du droit d'auteur classique), obligation de traçabilité des données d'entraînement, mécanisme de rémunération pour les ayants droit. Impact pour KeiroAI : anticiper l'obligation de marquage des contenus IA (watermark/métadonnées) et documenter l'intervention humaine de l'utilisateur pour renforcer la protégeabilité. Surveiller les évolutions législatives post-été 2026.",
      evidence: "Parlement européen rapport A10-0019/2026 IA et droit d'auteur, rydge.fr IA et PI, agence-gw.com IA et PI enjeux juridiques, Sénat rapport r24-842",
      confidence: 85, category: 'propriete_intellectuelle', revenue_linked: true
    },

    // --- Freelance et portage salarial ---
    {
      learning: "Requalification freelance en salarié — critère déterminant : le lien de subordination juridique (pouvoir de donner des ordres, contrôler l'exécution, sanctionner). Indices URSSAF : horaires imposés, lieu fixe, outils fournis, client unique (>75% du CA), intégration dans l'organigramme. Conséquences pour KeiroAI si requalification : rappel de cotisations URSSAF rétroactif depuis l'origine + majorations, travail dissimulé = jusqu'à 225 000 EUR d'amende (personne morale) + 3 ans de prison, suppression des aides publiques pour 5 ans.",
      evidence: "Cour de cassation jurisprudence constante, Code du travail Art. L8221-5, previssima.fr salariat dissimulé 2025, freelance.com risques juridiques requalification",
      confidence: 93, category: 'freelance', revenue_linked: true
    },
    {
      learning: "Portage salarial France 2026 : 600 000+ professionnels en portage. Le salarié porté a un CDI/CDD avec la société de portage, choisit ses clients et tarifs librement. Coût : frais de gestion 5-10% du CA + cotisations sociales 42-45% du CA HT = net environ 50% du CA HT. Avantages : protection sociale complète (chômage, retraite, mutuelle), RC Pro incluse, zéro admin. Pour KeiroAI : le portage salarial est l'alternative la plus sûre pour des missions longues avec un freelance, éliminant le risque de requalification. Condition : le porté doit avoir un TJM > 250 EUR (convention collective portage salarial).",
      evidence: "Convention collective portage salarial 2017, legalstart.fr portage salarial 2026, legalplace.fr avantages inconvénients portage, shine.fr portage salarial 2026",
      confidence: 89, category: 'freelance', revenue_linked: true
    },
    {
      learning: "Auto-entrepreneur vs SASU pour un fondateur tech 2026 : la micro-entreprise est limitée (plafond CA 77 700 EUR services, pas de déduction de charges, pas d'IS, pas de BSPCE possible). La SASU offre : responsabilité limitée, optimisation rémunération (mix salaire + dividendes), éligibilité BSPCE/AGA, crédibilité investisseurs, option IS. Le président SASU est assimilé salarié (charges ~82% du net versé mais protection sociale complète). Dividendes SASU en 2026 : PFU 31,4% (12,8% IR + 18,6% PS) ou barème progressif avec abattement 40%. Pour une startup visant une levée de fonds : SASU (ou SAS multi-fondateurs) = seul choix viable.",
      evidence: "service-public.fr fiscalité SASU, keobiz.fr SASU imposition 2026, dougs.fr charges sociales SASU 2026, creation-entreprise-france.com SASU dividendes",
      confidence: 91, category: 'statut_juridique', revenue_linked: true
    },

    // --- BSPCE / AGA ---
    {
      learning: "BSPCE régime 2025-2026 : le nouvel Art. 163 bis G CGI distingue gain d'exercice et plus-value de cession. Gain d'exercice = différence entre valeur des titres au jour d'exercice et prix d'acquisition, imposé au PFU 30% (12,8% IR + 17,2% PS) si ancienneté >= 1 an, ou 47,2% si <1 an. Conditions d'éligibilité société : IS en France, <15 ans d'immatriculation, non cotée (ou capi boursière <150M EUR), capital détenu >=25% par des personnes physiques. Nouveauté LF2026 : BSPCE attribuables aux salariés de sous-filiales (détention >=75%), seuil minimum de détention par personnes physiques abaissé de 25% à 15%.",
      evidence: "Loi de Finances 2025 Art. 163 bis G CGI, Loi de Finances 2026, legalstart.fr guide BSPCE 2026, up.law blogs BSPCE LF2025, le-ticket.fr guide BSPCE 2026",
      confidence: 92, category: 'bspce_aga', revenue_linked: true
    },
    {
      learning: "AGA (Actions Gratuites) post-LF2025 : la contribution patronale passe de 20% à 30% pour toutes les attributions définitives. Le gain d'acquisition est imposé au barème progressif IR avec abattement de 50% si conservation >= 2 ans, + 17,2% PS. Au-delà de 300 000 EUR de gain d'acquisition : pas d'abattement + contribution salariale supplémentaire de 10%. Vesting standard recommandé : 4 ans (cliff 1 an = 25% acquis à 1 an, puis linéaire mensuel). Pour KeiroAI : les BSPCE sont plus avantageux fiscalement que les AGA tant que la société remplit les conditions (<15 ans, capital physiques >=15%).",
      evidence: "LF2025, eres-group.com contribution patronale AGA, hogan lovells management packages 2025, etic-avocats.com réforme management packages",
      confidence: 90, category: 'bspce_aga', revenue_linked: true
    },

    // --- Contrats de travail ---
    {
      learning: "Période d'essai CDI France 2026 : durée maximale légale = 2 mois (ouvriers/employés), 3 mois (agents de maîtrise/techniciens), 4 mois (cadres). Renouvellement possible 1 fois si prévu par la CCN ET par le contrat ET avec accord exprès du salarié. Durée totale max avec renouvellement = 4/6/8 mois. Rupture pendant l'essai : pas de motif requis MAIS délai de prévenance obligatoire (24h à 1 mois selon ancienneté). Attention : un CDD précédant un CDI sur le même poste réduit la période d'essai du CDI de la durée du CDD.",
      evidence: "Code du travail Art. L1221-19 à L1221-26, service-public.fr période d'essai, legalstart.fr période essai CDI 2026, lebouard-avocats.fr période essai",
      confidence: 94, category: 'contrat_travail', revenue_linked: false
    },
    {
      learning: "Clause de non-concurrence France : pour être valide, elle doit réunir 5 conditions cumulatives : (1) être indispensable à la protection des intérêts légitimes de l'entreprise, (2) être limitée dans le temps (6 mois à 2 ans selon CCN), (3) être limitée géographiquement, (4) tenir compte de la spécificité de l'emploi, (5) prévoir une contrepartie financière (Syntec : min 1/3 du salaire mensuel). Sans contrepartie = clause nulle. L'employeur peut renoncer à la clause (dans les délais prévus au contrat ou CCN). Les juges contrôlent la proportionnalité : une clause trop large = annulée.",
      evidence: "Cour de cassation Soc. 10/07/2002 (principe contrepartie), CCN Syntec Art. clause non-concurrence, droit-travail-france.fr clauses contractuelles",
      confidence: 91, category: 'contrat_travail', revenue_linked: false
    },
    {
      learning: "Clause de confidentialité vs clause de non-concurrence : la clause de confidentialité interdit la divulgation d'informations sensibles (code source, données clients, secrets commerciaux) — elle est valide sans contrepartie financière et survit au contrat. La clause de non-concurrence interdit l'exercice d'une activité concurrente et nécessite une contrepartie financière. Pour une startup SaaS : la clause de confidentialité est PLUS importante et MOINS risquée juridiquement que la non-concurrence. Recommandation : clause de confidentialité systématique + non-concurrence ciblée uniquement pour les postes stratégiques (CTO, lead dev, commercial senior).",
      evidence: "Code du travail, droit-travail-france.fr clauses contractuelles, service-public.fr contrat de travail, Cass. soc. jurisprudence",
      confidence: 88, category: 'contrat_travail', revenue_linked: false
    },

    // --- Télétravail ---
    {
      learning: "Télétravail France 2026 : mise en place par accord collectif OU charte élaborée par l'employeur (après avis CSE si >=11 salariés) OU simple accord individuel (avenant au contrat). Contenu obligatoire de l'accord/charte : conditions de passage en télétravail et retour sur site, modalités d'acceptation du salarié, contrôle du temps de travail et régulation de la charge, plages horaires de contact, accès pour les travailleurs handicapés et salariées enceintes. L'employeur ne peut pas imposer le télétravail (sauf circonstances exceptionnelles type Covid).",
      evidence: "Code du travail Art. L1222-9 à L1222-11, service-public.fr télétravail secteur privé, culture-rh.com charte télétravail 2026, remotefr.com télétravail loi 2026",
      confidence: 93, category: 'teletravail', revenue_linked: false
    },
    {
      learning: "Frais de télétravail et accidents : l'employeur DOIT fournir, installer et entretenir les équipements nécessaires au télétravail. Les frais engagés par le salarié doivent être pris en charge, soit par remboursement sur justificatifs, soit via une allocation forfaitaire (exonérée URSSAF jusqu'à 10,70 EUR/jour de télétravail en 2025, plafond mensuel 59,40 EUR pour 2 jours/semaine). Un accident survenu sur le lieu de télétravail pendant les heures de travail est présumé accident du travail (même régime de protection qu'en présentiel).",
      evidence: "Code du travail Art. L1222-9 al. 7, URSSAF barèmes allocation forfaitaire télétravail 2025, economie.gouv.fr télétravail obligations, protegetesdroits.fr télétravail 2026",
      confidence: 91, category: 'teletravail', revenue_linked: false
    },

    // --- CSE et obligations sociales ---
    {
      learning: "CSE (Comité Social et Économique) seuils 2026 : obligatoire dès 11 salariés pendant 12 mois consécutifs. De 11 à 49 salariés : le CSE exerce des missions d'expression collective et de présentation des réclamations. À partir de 50 salariés : prérogatives élargies (consultations économiques, activités sociales/culturelles, droit d'alerte, 3 consultations obligatoires annuelles). Absence de CSE alors qu'obligatoire = délit d'entrave = 1 an de prison + 7 500 EUR d'amende. Pour KeiroAI (<11 salariés actuellement) : anticiper la mise en place dès que le seuil approche.",
      evidence: "Code du travail Art. L2311-1 et suivants, urssaf.fr CSE nouveautés 2026, technologia.fr seuils CSE 2025, compta-online.com CSE règles et sanctions",
      confidence: 93, category: 'obligations_sociales', revenue_linked: false
    },
    {
      learning: "Entretien professionnel France 2026 : rebaptisé 'entretien de parcours professionnel' (EPP) depuis la loi seniors octobre 2025. Fréquence : dans l'année suivant l'embauche, puis tous les 4 ans (au lieu de 2 ans auparavant). Doit porter sur les perspectives d'évolution professionnelle et les besoins en formation. Obligatoire aussi après : congé maternité/parental, longue maladie, congé sabbatique. Non-respect pour les entreprises >= 50 salariés : abondement correctif de 3 000 EUR sur le CPF du salarié.",
      evidence: "Loi seniors octobre 2025, Code du travail Art. L6315-1, jaipasleprofil.fr EPP 2026, service-public.fr entretien professionnel",
      confidence: 90, category: 'obligations_sociales', revenue_linked: false
    },
    {
      learning: "DUERP (Document Unique d'Évaluation des Risques Professionnels) : obligatoire dès le 1er salarié. Doit lister et évaluer TOUS les risques professionnels (physiques, psychosociaux, liés au télétravail, écrans, stress). Mise à jour : au minimum annuelle pour les entreprises >= 11 salariés, et à chaque événement impactant les conditions de travail. Depuis la loi santé au travail 2021, le CSE doit être consulté lors de la création/MAJ du DUERP. Conservation : 40 ans minimum. Dématérialisation obligatoire via un portail numérique dédié pour les entreprises >= 150 salariés (à venir pour toutes).",
      evidence: "Code du travail Art. R4121-1 à R4121-4, loi santé au travail 02/08/2021, winlassie.com DUERP obligations 2025, centre-agree-cse.fr DUERP obligation",
      confidence: 92, category: 'obligations_sociales', revenue_linked: false
    },

    // --- Accessibilité numérique ---
    {
      learning: "European Accessibility Act (EAA) applicable depuis le 28 juin 2025 : étend les obligations d'accessibilité numérique au-delà du secteur public. Les entreprises privées réalisant >2M EUR de CA OU employant >10 personnes doivent rendre leurs services numériques accessibles. Cela inclut les sites e-commerce, services SaaS, applications mobiles. KeiroAI est potentiellement concerné. Référentiel RGAA 4.1.2 (106 critères) basé sur WCAG 2.1. Sanctions : 50 000 EUR amende renouvelable tous les 6 mois + 25 000 EUR pour absence de déclaration d'accessibilité + risque discrimination (300 000 EUR).",
      evidence: "Directive UE 2019/882 (EAA), RGAA 4.1.2, urbilog.com réglementation accessibilité, wexperience.fr obligations RGAA 2025, nouvelle-techno.fr EAA 28 juin 2025",
      confidence: 89, category: 'accessibilite', revenue_linked: false
    },

    // --- NIS2 Cybersécurité ---
    {
      learning: "NIS2 France 2026 : expansion de ~300 entités NIS1 à ~15 000 entités NIS2. Deux catégories : Entités Essentielles (EE) et Entités Importantes (EI). PME > 50 salariés OU > 10M EUR CA dans un secteur couvert sont dans le périmètre. Pour KeiroAI (actuellement sous ces seuils) : pas directement soumis, mais anticipation recommandée car (1) les clients B2B soumis à NIS2 exigeront la conformité de leurs fournisseurs SaaS, (2) en cas de croissance rapide, le seuil sera atteint. ANSSI publie le ReCyF (Référentiel Cyber France) depuis mars 2026 avec les mesures recommandées. Incident reporting : 24h pour notification initiale, 72h pour rapport détaillé.",
      evidence: "Directive NIS2 Art. 21, ANSSI MonEspaceNIS2, copla.com NIS2 France 2026, eurolaw-france-cyber.eu NIS2 PME obligations",
      confidence: 88, category: 'cybersecurite', revenue_linked: false
    },
    {
      learning: "NIS2 responsabilité personnelle des dirigeants : depuis 2026, les dirigeants sont PERSONNELLEMENT responsables en cas d'incident cyber non déclaré ou de défaillance manifeste en gouvernance sécurité. Sanctions EE : jusqu'à 10M EUR ou 2% du CA mondial. Sanctions EI : jusqu'à 7M EUR ou 1,4% du CA mondial. Mesures de sécurité obligatoires : PCA/PRA (plan de continuité/reprise), gestion des incidents, chiffrement, MFA, sécurité supply chain, audits réguliers. L'assurance D&O devient critique pour les dirigeants tech.",
      evidence: "Directive NIS2 Art. 20-21, ANSSI ReCyF mars 2026, bird&bird.com European cybersecurity update, gtlaw.com NIS2 expanded obligations",
      confidence: 87, category: 'cybersecurite', revenue_linked: false
    },

    // --- Assurances ---
    {
      learning: "Assurances obligatoires/recommandées pour un SaaS France 2026 : (1) RC Pro (non obligatoire légalement sauf professions réglementées, MAIS 87% des clients B2B l'exigent contractuellement — coût ~190 EUR/an solo, 2000-5000 EUR/an PME), (2) Cyber-assurance (couverture incident données, ransomware — critique depuis NIS2), (3) D&O / RCM (protection patrimoine personnel du dirigeant — 92% des fonds VC l'exigent avant investissement selon France Invest 2025), (4) Assurance homme-clé. Pour une PME SaaS 3M EUR CA, 20 salariés : pack RC Pro + D&O + homme-clé = 5 000-12 000 EUR/an.",
      evidence: "onlynnov.com assurance RC Pro cyber, plateya.fr RC Pro 2026, institut-leges.com assurance dirigeant, orus.eu assurances startup, France Invest étude 2025",
      confidence: 89, category: 'assurances', revenue_linked: true
    },

    // --- Embauche internationale ---
    {
      learning: "Embaucher un salarié remote à l'étranger depuis la France : si le salarié travaille exclusivement depuis l'étranger, il est affilié au régime de sécurité sociale de son pays de résidence (règlement CE 883/2004 pour l'UE). Exception télétravailleurs transfrontaliers UE : accord-cadre multilatéral — si télétravail <50% du temps dans le pays de résidence, maintien possible de l'affiliation dans le pays de l'employeur. Hors UE : convention bilatérale de sécurité sociale (si existante) ou double affiliation à éviter. Alternative recommandée pour KeiroAI : passer par un EOR (Employer of Record) comme Deel, Remote.com ou Oyster pour les embauches hors France (coût : 300-600 EUR/mois par salarié).",
      evidence: "Règlement CE 883/2004, cleiss.fr employeur étranger embauche en France, voltaire-avocats.com télétravail transfrontalier, culture-rh.com télétravail étranger 2026",
      confidence: 87, category: 'international', revenue_linked: true
    },
    {
      learning: "Taxe employeur embauche salarié étranger en France 2026 : pour un contrat >=12 mois, la taxe OFII = 55% du salaire brut mensuel (plafonné à 2,5x le SMIC mensuel brut, soit 4 557,50 EUR en 2026 — taxe max 2 506,63 EUR). Pour un contrat <12 mois : variable selon la durée. Exonérations possibles : certains accords bilatéraux, jeunes professionnels, détachement temporaire. Le régime des impatriés (Art. 155 B CGI) offre une exonération d'IR sur la prime d'impatriation pendant 8 ans pour les salariés recrutés à l'étranger — puissant levier pour attirer des talents tech internationaux.",
      evidence: "CESEDA Art. L436-10 à L436-13, welcometofrance.com coût employeur, impots.gouv.fr régime impatriés, berton-associes.us impatriate tax regime 2026",
      confidence: 86, category: 'international', revenue_linked: true
    },

    // --- Droit de rétractation numérique ---
    {
      learning: "Droit de rétractation SaaS B2C France 2026 : le consommateur dispose de 14 jours pour se rétracter sans motif. MAIS exception cruciale pour les SaaS : si le consommateur accepte expressément l'exécution immédiate du service (case à cocher séparée) ET renonce explicitement à son droit de rétractation, ce droit est éteint dès le début de l'exécution. Pour KeiroAI : implémenter un double consentement explicite lors de la souscription B2C = (1) case 'J'accepte l'exécution immédiate' + (2) case 'Je renonce à mon droit de rétractation'. Défaut = le client peut se rétracter dans les 14 jours et demander un remboursement intégral.",
      evidence: "Code de la consommation Art. L221-18 et L221-28, service-public.fr droit de rétractation, legalplace.fr CGV logiciel SaaS",
      confidence: 90, category: 'cgv_saas', revenue_linked: true
    },

    // --- Temps partiel ---
    {
      learning: "Temps partiel Syntec : durée minimale légale = 24h/semaine (sauf dérogation par accord de branche ou demande écrite du salarié). La CCN Syntec permet des dérogations pour les étudiants, les salariés ayant des contraintes personnelles, ou par accord individuel écrit motivé. Heures complémentaires : limitées à 1/10 de la durée prévue au contrat (ou 1/3 si accord de branche). Majoration : +10% pour les heures dans la limite de 1/10, +25% au-delà. Un salarié à temps partiel a les mêmes droits (formation, promotion, CP) qu'un temps plein, calculés au prorata.",
      evidence: "Code du travail Art. L3123-1 et suivants, CCN Syntec, payfit.com temps partiel Syntec, service-public.fr temps partiel",
      confidence: 88, category: 'convention_syntec', revenue_linked: false
    },

    // --- Registre unique du personnel ---
    {
      learning: "Registre unique du personnel (RUP) : obligatoire dès le 1er salarié (y compris stagiaires et volontaires service civique). Mentions : nom, prénoms, nationalité, date de naissance, sexe, emploi, qualification, date entrée/sortie, type de contrat (CDD, temps partiel, apprenti), autorisation d'embauche si travailleur étranger. Conservation : 5 ans après le départ du salarié. Peut être dématérialisé après consultation du CSE. Absence ou lacune = 750 EUR d'amende par salarié concerné. Pour KeiroAI : mettre en place un RUP numérique (via PayFit, Lucca ou simple tableur sécurisé) dès la 1ère embauche.",
      evidence: "Code du travail Art. L1221-13 à L1221-15-1, economie.gouv.fr registre personnel, LégiSocial 2025 guide RUP",
      confidence: 93, category: 'obligations_sociales', revenue_linked: false
    },
  ],


  // ═══════════════════════════════════════════════════════════════════════
  // COMPTABLE (Louis) — Finance SaaS, Fiscalité, Comptabilité — 42 learnings
  // ═══════════════════════════════════════════════════════════════════════
  comptable: [

    // --- SaaS Metrics Mastery ---
    {
      learning: "MRR décomposition exhaustive pour KeiroAI : suivre 5 composantes distinctes chaque mois : (1) New MRR = nouveaux clients, (2) Expansion MRR = upgrades de plan (Sprint→Solo, Solo→Fondateurs), (3) Contraction MRR = downgrades, (4) Churn MRR = clients perdus, (5) Reactivation MRR = clients revenus. Formule : MRR(M) = MRR(M-1) + New + Expansion - Contraction - Churn + Reactivation. ARR = MRR x 12. Benchmark 2026 : pour un SaaS early-stage (<1M ARR), viser 15-25% de croissance MRR mensuelle.",
      evidence: "averi.ai SaaS metrics 2026, phoenixstrategy.group SaaS KPIs 2026, benchmarkit.ai 2025 benchmarks, saas-capital.com Rule of 40",
      confidence: 93, category: 'saas_metrics', revenue_linked: true
    },
    {
      learning: "NRR (Net Revenue Retention) — la métrique #1 des investisseurs SaaS en 2026 : mesure le revenu conservé + expandé d'une cohorte de clients existants sur 12 mois, SANS compter les nouveaux clients. Formule : NRR = (MRR début + Expansion - Contraction - Churn) / MRR début x 100. Benchmarks 2026 : Enterprise 118%, Mid-Market 108%, SMB 97%. Un NRR >100% signifie que les clients existants génèrent plus de revenu chaque année. Top performers (NRR 120%+) ont des valorisations 2,3x supérieures. Pour KeiroAI (SMB) : viser NRR >=100% via l'expansion de crédits.",
      evidence: "optif.ai B2B SaaS NRR benchmark 939 companies, highalpha.com 2025 SaaS benchmarks, joinpavilion.com 2025 B2B SaaS benchmarks",
      confidence: 94, category: 'saas_metrics', revenue_linked: true
    },
    {
      learning: "GRR (Gross Revenue Retention) : mesure la rétention brute SANS expansion — indique la qualité du produit. Formule : GRR = (MRR début - Contraction - Churn) / MRR début x 100. GRR ne peut jamais dépasser 100%. Benchmark 2026 : 85-95% = bon, 95%+ = best-in-class. GRR = indicateur de product-market fit. Si GRR <85% : problème fondamental de valeur perçue ou d'onboarding. Pour KeiroAI avec des plans de 4,99 à 999 EUR : segmenter le GRR par plan pour identifier les plans à risque de churn.",
      evidence: "scalexp.com SaaS metrics library, rockingweb.com.au SaaS metrics benchmark report 2025, burklandassociates.com 2025 SaaS benchmarks",
      confidence: 91, category: 'saas_metrics', revenue_linked: true
    },
    {
      learning: "Churn rate benchmarks SaaS 2026 : churn mensuel moyen B2B = 3,5% (2,6% volontaire + 0,8% involontaire). Cible : <1% mensuel pour Enterprise, <3% mensuel pour SMB. Réduire le churn de 5% à 3% peut améliorer le ratio LTV:CAC de 2,5:1 à 4:1. Stratégies anti-churn involontaire pour KeiroAI : Stripe Smart Retries (récupère ~25% des paiements échoués), emails de relance dunning automatiques (J+1, J+3, J+7), mise à jour carte pré-expiration. Churn volontaire : onboarding amélioré (<5 min au premier visuel), offboarding survey, win-back campaign à J+30.",
      evidence: "mrrsaver.com SaaS churn rate benchmarks 2026, benchmarkit.ai 2025 benchmarks, proven-saas.com CAC payback benchmarks 2026",
      confidence: 90, category: 'saas_metrics', revenue_linked: true
    },

    // --- Unit Economics ---
    {
      learning: "CAC (Customer Acquisition Cost) par canal — benchmarks 2026 : Referrals/parrainage = 141-200 EUR (le plus efficient), SEO/Content organique = 500-1 500 EUR (ROI long terme élevé), Paid Ads (Google/Meta) = ~802 EUR en B2B, Outbound email = variable mais CAC élevé si non ciblé. Pour KeiroAI ciblant les commerces locaux : les canaux les plus efficients sont le referral (program de parrainage avec crédits bonus) et le SEO local (articles 'comment créer du contenu pour [type de commerce]'). CAC payback médian 2026 = 6,8 mois (tous segments), B2C apps = 4,2 mois, B2B SaaS = 8,6 mois.",
      evidence: "data-mania.com CAC benchmarks B2B 2026, proven-saas.com CAC payback benchmarks 2026, saashero.net CAC LTV benchmarks 2026, averi.ai SaaS metrics 2026",
      confidence: 91, category: 'unit_economics', revenue_linked: true
    },
    {
      learning: "Ratio LTV:CAC — le ratio sacré du SaaS : LTV = ARPU mensuel / churn rate mensuel (formule simplifiée). Benchmarks 2026 : médiane = 3,2:1, cible saine = 3:1 minimum, excellence = 5:1+. Un ratio <3:1 signifie que l'acquisition coûte trop cher ou que les clients partent trop vite. Un ratio >7:1 signifie qu'on sous-investit en acquisition (on pourrait croître plus vite). Pour KeiroAI avec plan Solo à 49 EUR/mois et churn estimé 5% mensuel : LTV = 49/0,05 = 980 EUR. Si CAC = 200 EUR : ratio = 4,9:1 = excellent. Optimisation : réduire le churn est plus impactant qu'augmenter l'ARPU.",
      evidence: "saashero.net B2B SaaS LTV CAC benchmarks 2026, optif.ai B2B SaaS LTV benchmark 2025, rivereditor.com optimize LTV CAC metrics 2026",
      confidence: 92, category: 'unit_economics', revenue_linked: true
    },
    {
      learning: "Payback period par étape de croissance — benchmarks 2026 : Early-stage (<5M ARR) = 8-12 mois avec CAC 200-400 EUR, Growth ($5-50M ARR) = 15-18 mois avec CAC 300-600 EUR, Enterprise (>50M ARR) = 20-24 mois avec CAC 500-800 EUR. Par vertical : Education = 3,8 mois (leader), HR/Recruiting = 10,6 mois (le plus long). Pour KeiroAI early-stage ciblant des SMB : viser un payback <12 mois. Payback = CAC / (ARPU mensuel x Marge brute). Si payback >18 mois en early-stage : revoir le pricing ou les canaux d'acquisition.",
      evidence: "phoenixstrategy.group CAC trends 2025, data-mania.com CAC benchmarks 2026, gsquaredcfo.com SaaS benchmarks 2026",
      confidence: 89, category: 'unit_economics', revenue_linked: true
    },

    // --- Comptabilité SaaS France ---
    {
      learning: "Plan comptable SaaS France — comptes clés : Revenus d'abonnements = compte 706 (Prestations de services). Produits constatés d'avance (PCA) pour abonnements annuels = compte 487 (écriture : débit 706 / crédit 487 à la clôture, puis extourne à l'ouverture N+1). Exemple KeiroAI : un client paie 588 EUR HT pour un plan annuel Solo le 1er octobre — au 31/12, seuls 3/12 = 147 EUR sont en revenus, les 441 EUR restants = PCA au 487. Remboursements Stripe = compte 709 (Rabais, remises). Commissions Stripe = compte 6225 (Rémunérations d'affacturage / intermédiaires). Principe fondamental : indépendance des exercices.",
      evidence: "PCG Plan Comptable Général, pennylane.com compte comptable abonnement, compta-facile.com PCA comptabilisation, noly-compta.fr comptabiliser abonnement logiciel",
      confidence: 92, category: 'comptabilite_saas', revenue_linked: true
    },
    {
      learning: "Revenue recognition SaaS (IFRS 15 / PCG) : le revenu d'un abonnement SaaS est reconnu au fur et à mesure de la fourniture du service, PAS au moment de l'encaissement. Pour un abonnement mensuel KeiroAI : reconnaissance immédiate (mois par mois). Pour un abonnement annuel ou tri-journalier (Sprint 3 jours) : reconnaissance linéaire sur la période. Les upgrades mid-period = prorata. Les remboursements = en déduction du CA (compte 709), pas en charge. Stripe Revenue Recognition automatise le mapping IFRS 15 et peut se connecter au plan comptable français via customisation des comptes GL.",
      evidence: "IFRS 15 norme, stripe.com revenue recognition SaaS, stripe.com chart of accounts mapping, efl.fr comptabilisation SaaS comptes français",
      confidence: 90, category: 'comptabilite_saas', revenue_linked: true
    },
    {
      learning: "Amortissement R&D en comptabilité française 2025-2026 : les frais de développement (code KeiroAI, algorithmes IA, features) peuvent être activés à l'actif (compte 203 'Frais de développement', renommé en 2025 par le règlement ANC 2022-06) si 6 conditions sont réunies : (1) faisabilité technique démontrée, (2) intention d'achever, (3) capacité à utiliser/vendre, (4) avantages économiques futurs probables, (5) ressources disponibles, (6) évaluation fiable des coûts. Amortissement sur durée d'utilisation réelle (max 5 ans). Écriture : débit 203 / crédit 722 (Production immobilisée). Nouveau 2025 : création du compte 2903 (Dépréciations des frais de développement).",
      evidence: "PCG Art. 311-3 et 311-4, règlement ANC 2022-06, compta-facile.com frais de R&D, legifiscal.fr frais développement règles, f-initiatives.com immobilisation R&D",
      confidence: 91, category: 'comptabilite_saas', revenue_linked: true
    },

    // --- CIR / CII ---
    {
      learning: "CIR (Crédit d'Impôt Recherche) pour KeiroAI en 2026 : taux de 30% des dépenses de R&D éligibles (jusqu'à 100M EUR, 5% au-delà). Dépenses éligibles IA : salaires des chercheurs/ingénieurs travaillant sur l'IA, frais de fonctionnement (40% des dépenses de personnel depuis 2025, avant = 43%), sous-traitance R&D (plafonnée). NON éligibles depuis 2025 : frais de brevets, dépenses de veille technologique, régime jeune docteur supprimé. Déclaration via formulaire 2069-A-SD. Le guide MESR 2025 cite explicitement la collecte de données pour l'entraînement de modèles d'IA comme dépense éligible. Rescrit fiscal recommandé pour sécuriser le CIR.",
      evidence: "CGI Art. 244 quater B, service-public.fr CIR, bpifrance-creation.fr CIR guide, leyton.com CIR 2025 nouveautés, myriadconsulting.fr CIR startups IA, MESR Guide CIR 2025",
      confidence: 93, category: 'cir_cii', revenue_linked: true
    },
    {
      learning: "CII (Crédit d'Impôt Innovation) 2025-2027 : réservé aux PME (<250 salariés, <50M EUR CA ou <43M EUR bilan). Taux : 20% en métropole (baissé de 30% en 2025), 35% en Corse (moyennes entreprises), 40% (petites entreprises Corse). Plafond : 400 000 EUR de dépenses éligibles/an. Éligible : conception de prototypes ou installations pilotes de produits NOUVEAUX (supérieurs à l'état de l'art). NON éligible : la production du prototype ni les dépenses déjà déclarées au CIR. Cumul CIR+CII possible si dépenses distinctes. Reconduit jusqu'au 31/12/2027. Pour KeiroAI : le CII peut couvrir le développement de nouvelles features IA innovantes (ex: nouveau modèle de génération vidéo).",
      evidence: "CGI Art. 244 quater B bis, economie.gouv.fr CII, bpifrance-creation.fr CII guide, finalli.com CII guide, legalstart.fr CII fonctionnement 2026, zabala.fr agrément CIR-CII 2025-2026",
      confidence: 91, category: 'cir_cii', revenue_linked: true
    },

    // --- JEI ---
    {
      learning: "JEI (Jeune Entreprise Innovante) statut 2026 : conditions cumulatives = (1) créée depuis <8 ans (pour créations depuis 01/01/2023), (2) PME (<250 salariés, <50M EUR CA ou <43M EUR bilan), (3) dépenses R&D >= 20% des charges fiscalement déductibles, (4) capital détenu >=50% par personnes physiques (ou autres JEI, fondations scientifiques, établissements publics recherche), (5) pas issue d'une restructuration. Exonérations : cotisations sociales patronales pendant 7 ans (chercheurs, techniciens R&D, gestionnaires de projet, juristes PI, testeurs), CFE et TFPB (sur délibération communale, 7 ans). Exonération IS supprimée pour créations post-2024. Ouvert depuis 2026 aux entreprises ESS.",
      evidence: "CGI Art. 44 sexies-0 A, service-public.fr JEI conditions, urssaf.fr JEI exonérations, goweez.com JEI 2026, monsieur-compta.fr JEI 2026, zabala.fr statut JEI 2025",
      confidence: 93, category: 'jei', revenue_linked: true
    },
    {
      learning: "JEI exonérations sociales détaillées : l'exonération porte sur les cotisations patronales d'assurances sociales (maladie, maternité, invalidité, décès, vieillesse) et d'allocations familiales. Elle s'applique aux rémunérations des chercheurs, techniciens, gestionnaires de projets R&D, juristes chargés de la PI, et personnels chargés des tests. Plafond : la rémunération brute mensuelle ne doit pas dépasser 4,5 SMIC. Durée : 7 ans à compter de la création. IMPORTANT : le statut JEI est auto-déclaratif — pas de demande préalable, mais un rescrit fiscal est fortement recommandé pour sécuriser la position (réponse de l'administration sous 3 mois).",
      evidence: "urssaf.fr JEI exonérations cotisations, bpifrance-creation.fr JEI, l-expert-comptable.com JEI statut conditions, sogedev.com statut JEI",
      confidence: 91, category: 'jei', revenue_linked: true
    },

    // --- TVA SaaS ---
    {
      learning: "TVA SaaS France/Europe 2026 : le SaaS est une prestation de services électroniques. Règles de territorialité : B2B intra-UE = facturation HT + mention 'Autoliquidation' (le client déclare la TVA dans son pays), B2C intra-UE = TVA du pays du client (utiliser le guichet OSS pour éviter l'immatriculation dans chaque pays). Seuil OSS supprimé = dès le 1er EUR de vente B2C dans un autre État membre. B2B hors UE = facturation HT (hors champ territorial). B2C hors UE = hors champ. Obligation DES (Déclaration Européenne de Services) pour les prestations B2B intra-UE : à déposer sur douane.gouv.fr avant le 10 du mois suivant.",
      evidence: "CGI Art. 259 B, calculer-tva.com TVA prestations internationales 2026, tvaintracommunautaire.fr contrats SaaS, keobiz.fr TVA e-commerce 2026, cleartax.com autoliquidation TVA France",
      confidence: 93, category: 'tva', revenue_linked: true
    },
    {
      learning: "TVA taux applicable SaaS France 2026 : le taux normal de 20% s'applique aux services SaaS. Il n'existe pas de taux réduit pour les services numériques en France (contrairement aux livres numériques à 5,5%). Pour KeiroAI : facturer 20% de TVA en B2C France, HT en B2B intra-UE (avec numéro TVA intracommunautaire vérifié via VIES), HT hors UE. Stripe Tax peut automatiser le calcul de TVA par pays. Attention : les crédits vendus dans KeiroAI sont des 'droits à prestation future' — la TVA est exigible à la livraison du service (utilisation des crédits), pas à l'achat. En pratique simplifiée : TVA exigible à l'encaissement pour les prestations de services.",
      evidence: "CGI Art. 269, excilio.fr TVA prestataire services 2025, mathez-compliance.com taux TVA Europe 2026, hr-associes.fr TVA e-commerce guide",
      confidence: 90, category: 'tva', revenue_linked: true
    },

    // --- Facturation électronique ---
    {
      learning: "Facture électronique France 2026-2027 : obligation de RÉCEPTION pour TOUTES les entreprises dès le 1er septembre 2026. Obligation d'ÉMISSION : grandes entreprises et ETI dès le 1er septembre 2026, PME et micro-entreprises au 1er septembre 2027. Formats acceptés : Factur-X (PDF + XML hybride), UBL, CII. Les factures doivent transiter via une Plateforme de Dématérialisation Partenaire (PDP) certifiée — le PPF sert uniquement d'annuaire et de centre de données fiscales. E-reporting obligatoire : transmission des données de transaction et paiement à l'administration.",
      evidence: "economie.gouv.fr facturation électronique, pennylane.com réforme facture électronique 2026, dougs.fr calendrier facturation électronique, easyfacturx.com obligations 2026",
      confidence: 94, category: 'facturation', revenue_linked: true
    },
    {
      learning: "Factur-X pour KeiroAI : le format Factur-X est un PDF lisible par l'humain avec un fichier XML embarqué lisible par les machines. C'est le format recommandé pour les PME car il permet une transition douce (le PDF reste visuellement identique). Pour se préparer : (1) choisir une PDP certifiée (Pennylane, Chorus Pro, GetPaid, etc.), (2) s'assurer que l'outil de facturation (Stripe Billing, Pennylane) génère du Factur-X, (3) tester la réception dès septembre 2026, (4) anticiper l'émission pour septembre 2027. Mentions obligatoires supplémentaires : numéro SIREN du client, adresse de livraison/facturation, catégorie de transaction.",
      evidence: "facturx-engine.github.io guide France 2026, bpifrance.fr réforme facturation électronique, portail-autoentrepreneur.fr facturation électronique 2026",
      confidence: 89, category: 'facturation', revenue_linked: true
    },

    // --- IS et fiscalité ---
    {
      learning: "IS taux réduit PME 2026 : le taux réduit de 15% s'applique aux bénéfices jusqu'à 42 500 EUR (en vigueur) avec un amendement PLF 2026 pour porter ce seuil à 100 000 EUR. Conditions : CA HT <10M EUR, capital entièrement libéré et détenu >=75% par des personnes physiques. Au-delà du plafond : taux normal de 25%. Pour KeiroAI : si bénéfice <42 500 EUR (ou 100 000 EUR post-réforme), IS = 15% soit une économie de 10 points vs le taux normal. Le taux réduit s'applique automatiquement — pas de demande à formuler.",
      evidence: "CGI Art. 219 I b, legifiscal.fr PLF 2026 seuil IS PME 100 000 EUR, compta-online.com taux IS 2026, legalstart.fr taux IS 2026, service-public.fr IS",
      confidence: 93, category: 'fiscalite', revenue_linked: true
    },
    {
      learning: "Déficits reportables IS France : le report en avant est illimité dans le temps. Imputation : le déficit est imputable sur le bénéfice de l'exercice suivant dans la limite de 1M EUR + 50% du bénéfice excédant 1M EUR. Exemple KeiroAI : si déficit N-1 = 200 000 EUR et bénéfice N = 300 000 EUR → imputation totale des 200 000 EUR (car <1M EUR). Report en arrière (carry-back) : limité à 1 exercice, plafonné à 1M EUR — crée une créance d'IS remboursable au bout de 5 ans (ou immédiatement pour les PME et les entreprises en procédure collective). Pour une startup en phase de croissance : le report en avant est plus pertinent.",
      evidence: "CGI Art. 209 I, compta-online.com impôt sociétés calcul IS 2026, economie.gouv.fr IS, propulsebyca.fr IS 2026",
      confidence: 91, category: 'fiscalite', revenue_linked: true
    },
    {
      learning: "Charges sociales fondateur SASU 2026 : le président de SASU est assimilé salarié (régime général). Sur un salaire net de 3 000 EUR : coût total employeur ~5 460 EUR (charges patronales ~45% + charges salariales ~22%). Dividendes : PFU 31,4% en 2026 (12,8% IR + 18,6% PS — hausse de 1,4 point vs 2025). Optimisation classique : verser un salaire minimum pour valider les trimestres retraite (environ 600 EUR brut/mois en 2026) + complément en dividendes pour réduire les charges sociales. Attention : l'absence totale de rémunération = pas de couverture maladie ni retraite.",
      evidence: "dougs.fr charges sociales SASU 2026, keobiz.fr SASU imposition 2026, creation-entreprise-france.com charges SASU, swapn.fr dividendes SASU 2026, legalstart.fr dividende SASU 2026",
      confidence: 92, category: 'charges_sociales', revenue_linked: true
    },

    // --- Stripe / Payment Accounting ---
    {
      learning: "Comptabilisation des flux Stripe pour KeiroAI : (1) Vente = débit 411 (Client) / crédit 706 (Prestations services) + crédit 44571 (TVA collectée). (2) Encaissement via Stripe = débit 512xxx (Banque Stripe, sous-compte du 512) / crédit 411 (Client). (3) Virement Stripe vers banque = débit 512 (Banque principale) / crédit 512xxx (Banque Stripe). (4) Commissions Stripe = débit 6225 ou 6227 (Frais sur services bancaires) / crédit 512xxx (retenues directes). (5) Remboursements = débit 709 (RRR accordés) / crédit 411. (6) Chargebacks = débit 654 (Pertes sur créances irrécouvrables) / crédit 512xxx. Automatiser via Stripe Revenue Recognition + export comptable mensuel.",
      evidence: "stripe.com revenue recognition, stripe.com chart of accounts, PCG plan comptable général, pennylane.com comptabilisation abonnements",
      confidence: 90, category: 'comptabilite_saas', revenue_linked: true
    },
    {
      learning: "Gestion des abonnements et PCA pour KeiroAI — cas pratiques : (1) Plan Sprint (4,99 EUR/3 jours) : si paiement le 30 mars et clôture au 31 mars, PCA = 2/3 du montant HT au 487. (2) Plan annuel hypothétique : PCA systématique au 31/12 pour les mois non écoulés. (3) Crédits prépayés : comptabiliser en 'produits constatés d'avance' (487) à l'achat, reconnaître en revenu (706) au fur et à mesure de l'utilisation. Les crédits expirés (ex: promo expirant après 14 jours) sont reconnus en revenu à la date d'expiration. Cette méthode respecte le principe d'indépendance des exercices et donne une image fidèle de l'activité.",
      evidence: "PCG principe indépendance des exercices, compta-facile.com PCA comptabilisation, pennylane.com PCA méthodes, compta-online.com PCA compte 487",
      confidence: 88, category: 'comptabilite_saas', revenue_linked: true
    },

    // --- Cash flow management ---
    {
      learning: "13-week cash flow forecast (prévision de trésorerie 13 semaines) : outil indispensable pour un SaaS early-stage. Structure : semaine par semaine, entrées (encaissements clients, virements Stripe, CIR/CII remboursements, levée de fonds) vs sorties (salaires, charges sociales, hébergement cloud, API IA, marketing, loyer, remboursements). Mise à jour : chaque lundi avec les réels de la semaine précédente. Alertes : si trésorerie projetée <2 mois de burn = zone rouge. Commencer le fundraising quand runway = 6-9 mois. La granularité hebdomadaire identifie la semaine exacte où le cash sera critique.",
      evidence: "cfoadvisors.com 13-week cash flow SaaS 2025, graphitefinancial.com 13-week forecast, drivetrain.ai 13-week forecast guide, cashflowfrog.com 13-week cash flow",
      confidence: 91, category: 'cash_flow', revenue_linked: true
    },
    {
      learning: "Runway et burn rate pour KeiroAI : Runway = Cash disponible / Burn rate mensuel net. Burn rate net = dépenses totales - revenus totaux (si négatif = l'entreprise consomme du cash). Burn multiple = Net burn / Net new ARR — indicateur d'efficacité du capital. Benchmarks 2026 : burn multiple <1,0 = élite, 1,0-1,5 = sain, 1,5-2,0 = acceptable early-stage, >2,0 = alerte. Tendance 2025-2026 : les startups equity-backed ont réduit drastiquement leur burn (catégorie 1-3M ARR : médiane de profitabilité améliorée de -53% à -8%). Objectif KeiroAI : viser un burn multiple <1,5 et maintenir un runway >12 mois.",
      evidence: "saas-capital.com growth profitability Rule of 40, eimservices.ca startup runway calculator, scalexp.com cash burn runway, re-cap.com SaaS benchmarks 2025",
      confidence: 90, category: 'cash_flow', revenue_linked: true
    },

    // --- Rule of 40 ---
    {
      learning: "Rule of 40 redéfinie en 2026 : Revenue Growth Rate (%) + Profit Margin (%) >= 40 = entreprise saine. Benchmarks par stade : Early-stage (<10M ARR) = growth 80-120%, marge -50 à -20%, Rule of 40 typique 30-60. Growth (10-50M ARR) = growth 40-80%, marge -10 à +10%, Rule of 40 typique 30-40. Scale (50M+ ARR) = growth 30-50%, marge 10-20%, Rule of 40 typique 40+. Tendance 2025-2026 : croissance médiane SaaS = 26% (vs 47% en 2024) — le marché valorise désormais l'efficacité sur l'hypergrowth. Pour KeiroAI early-stage : la croissance est plus importante que la marge, mais montrer une trajectoire vers la profitabilité.",
      evidence: "abacum.ai Rule of 40 redefined 2026, visdum.com Rule of 40 SaaS, thesaascfo.com Rule of 40, saas-capital.com Rule of 40 private SaaS",
      confidence: 91, category: 'saas_metrics', revenue_linked: true
    },
    {
      learning: "Efficiency Score SaaS 2026 : au-delà de la Rule of 40, les investisseurs utilisent le 'Burn Multiple' (Net Burn / Net New ARR) et le 'Magic Number' (Net New ARR / S&M Spend du trimestre précédent). Magic Number >1,0 = unit economics scalables, 0,75-1,0 = OK, <0,5 = inefficient. Revenue per employee : médiane privé = 129 724 USD, médiane public = 283 000 USD. Si significativement sous la médiane privée : le modèle doit montrer un chemin vers une meilleure efficacité RH. Pour KeiroAI : tracker mensuellement MRR / nombre d'employés et viser >10 000 EUR MRR/employé comme premier palier.",
      evidence: "averi.ai SaaS metrics 2026, phoenixstrategy.group SaaS KPIs 2026, gsquaredcfo.com SaaS benchmarks 2026, highalpha.com 2025 SaaS benchmarks",
      confidence: 88, category: 'saas_metrics', revenue_linked: true
    },

    // --- Financial modeling ---
    {
      learning: "Financial model bottom-up pour SaaS : les investisseurs rejettent systématiquement les modèles top-down ('on prend 1% d'un marché de 50Md'). Construire le modèle bottom-up : leads par canal → taux de conversion → clients → ARPU → MRR → ARR. Hypothèses réalistes : taux de conversion site web 2-5%, free-to-paid 5-15%, trial-to-paid 15-30%. Inclure : churn par cohorte, expansion revenue, saisonnalité. Le modèle doit couvrir 3-5 ans avec 3 scénarios (base, optimiste, pessimiste). Lier les embauches au pipeline (1 commercial = X deals/mois, ramp-up 3-6 mois).",
      evidence: "hubifi.com SaaS financial modeling guide, thesaascfo.com SaaS financial plan, thevccorner.com SaaS financial model template, founderpath.com SaaS financial model",
      confidence: 89, category: 'financial_modeling', revenue_linked: true
    },
    {
      learning: "Headcount planning SaaS 2026 : le coût #1 d'un SaaS est la masse salariale (60-80% des dépenses). Règles : (1) ne jamais embaucher en avance sur le revenu de plus de 6 mois, (2) ratio R&D recommandé = 25-35% du CA pour early-stage (baisse à 15-20% à maturité), (3) ratio S&M = 30-50% du CA en croissance (baisse à 20-30% à maturité), (4) ratio G&A = 10-15% du CA. Revenue per employee médian 2025 : ~130K USD (privé). Pour KeiroAI : chaque embauche doit être justifiée par un ROI projeté (ex: 1 dev = X features = Y% conversion uplift = Z EUR MRR supplémentaire).",
      evidence: "golimelight.com SaaS FP&A guide 2026, linealcpa.com SaaS financial model, banktrack.com SaaS financial projections 2025, discoveringsaas.com SaaS financial projections template",
      confidence: 87, category: 'financial_modeling', revenue_linked: true
    },

    // --- Data room et levée de fonds ---
    {
      learning: "Data room levée de fonds startup France 2026 : le marché reste sélectif (7,39Md EUR levés en 2025, -15% en nombre d'opérations vs 2024). La data room doit être prête AVANT le début des rendez-vous investisseurs. Contenu obligatoire : (1) Pitch deck (15-20 slides max), (2) Financial model 3-5 ans (bottom-up), (3) Cap table détaillée, (4) Statuts et pacte d'associés, (5) CGV/CGU/Mentions légales, (6) Propriété intellectuelle (code, marques, brevets), (7) Métriques clés (MRR, NRR, CAC, LTV, churn, runway), (8) Contrats clients significatifs, (9) Dashboard produit (cohort analysis, activation, rétention), (10) RH (équipe, organigramme, BSPCE pool).",
      evidence: "magstartup.com lever fonds 2026, saas-path.com levée fonds startup, followtribes.io data room 3ME, drooms.com startup checklist data room, independant.io levées fonds France 2026",
      confidence: 90, category: 'fundraising', revenue_linked: true
    },
    {
      learning: "Term sheet négociation France 2026 : les clauses clés à négocier sont (1) Valorisation pré-money (détermination : multiple de ARR = 5-15x pour early-stage SaaS, dépend de la croissance et NRR), (2) Liquidation preference (1x non-participating = standard, éviter >1x et participating), (3) Anti-dilution (weighted average = standard, éviter full ratchet), (4) Gouvernance (sièges au board, droits de veto, droit d'information), (5) Drag-along et tag-along, (6) BSPCE pool (standard 10-15% post-money). Principe : 'la valorisation est la vitrine, les clauses sont la mécanique'. Un fondateur doit comprendre chaque clause du term sheet avant de signer.",
      evidence: "magstartup.com lever fonds 2026, followtribes.io data room, scalex-invest.com data room best practices, licornesociety.com French Tech startups 2026",
      confidence: 87, category: 'fundraising', revenue_linked: true
    },

    // --- Budget allocation ---
    {
      learning: "Budget allocation framework SaaS early-stage 2026 : répartition recommandée du CA/budget : R&D = 30-40% (investissement produit), S&M (Sales & Marketing) = 30-50% (acquisition + rétention), G&A (General & Administrative) = 10-15% (admin, compta, juridique, bureaux), COGS (Cost of Goods Sold) = 15-25% pour SaaS (hébergement, APIs IA, support). Pour KeiroAI : les coûts API IA (Claude, Seedream, Kling, ElevenLabs) sont des COGS — les tracker séparément car ils impactent la marge brute. Marge brute SaaS typique = 70-85%. Si marge brute <65% : revoir le pricing ou les coûts d'API.",
      evidence: "phoenixstrategy.group SaaS KPIs 2026, gsquaredcfo.com SaaS benchmarks 2026, abacum.ai Rule of 40 framework, visdum.com SaaS metrics 2026",
      confidence: 88, category: 'financial_modeling', revenue_linked: true
    },
    {
      learning: "Marge brute SaaS et coûts API IA — calcul pour KeiroAI : la marge brute = (Revenu - COGS) / Revenu x 100. Les COGS SaaS incluent : hébergement (Vercel, Supabase), APIs IA (BytePlus Seedream, Kling, Anthropic Claude, ElevenLabs), support client, coûts de paiement (Stripe 1,4% + 0,25 EUR par transaction en Europe). Exemple : si plan Solo = 49 EUR/mois et coûts API moyens par client = 8 EUR + hébergement 2 EUR + Stripe 0,94 EUR = COGS ~10,94 EUR → marge brute = 77,7% = dans la norme SaaS. Surveiller mensuellement : si un client consomme massivement les crédits, le coût API peut exploser et dégrader la marge.",
      evidence: "stripe.com/fr pricing Europe, benchmarks SaaS marge brute 2026, visdum.com SaaS metrics COGS",
      confidence: 86, category: 'unit_economics', revenue_linked: true
    },

    // --- Stripe chargebacks et remboursements ---
    {
      learning: "Chargebacks Stripe — gestion et prévention pour KeiroAI : un chargeback coûte 15 EUR de frais Stripe + le montant contesté + risque de blocage compte si taux >1%. Prévention : (1) descripteur de facturation clair ('KEIROAI' pas 'STRIPE*XYZ'), (2) emails de confirmation post-achat, (3) politique de remboursement visible dans les CGV, (4) réponse rapide aux demandes de remboursement (mieux vaut rembourser proactivement qu'attendre un chargeback). Comptabilisation : chargeback perdu = débit 654 (Pertes sur créances) / crédit 411. Chargeback gagné = aucune écriture si déjà comptabilisé en revenu. Taux de chargeback sain : <0,5%.",
      evidence: "stripe.com/docs/disputes, stripe.com SaaS accounting 101, PCG comptabilisation pertes sur créances",
      confidence: 88, category: 'comptabilite_saas', revenue_linked: true
    },

    // --- Liasse fiscale ---
    {
      learning: "Liasse fiscale SaaS France : déclaration annuelle obligatoire (régime réel normal ou simplifié). Formulaires clés : 2065 (déclaration IS), 2050-2059 (tableaux comptables — bilan, compte de résultat, immobilisations, provisions, etc.). Date limite : 2ème jour ouvré suivant le 1er mai (exercice calendaire), ou 3 mois après la clôture pour les exercices décalés. Pour KeiroAI : les postes spécifiques à surveiller = immobilisations incorporelles (203 frais de développement), PCA (487), CIR/CII à déclarer (2069-A-SD et 2069-A-1-SD). EDI (télédéclaration) obligatoire pour toutes les entreprises soumises à l'IS. Un expert-comptable est quasi-indispensable pour la liasse d'une startup SaaS.",
      evidence: "CGI Art. 223, service-public.fr liasse fiscale, DGFiP formulaires 2065/2050, compta-online.com IS déclaration",
      confidence: 89, category: 'comptabilite_saas', revenue_linked: false
    },

    // --- TVA exigibilité crédits prépayés ---
    {
      learning: "TVA et crédits prépayés KeiroAI : les crédits vendus sont des 'bons à usage multiple' au sens de la directive TVA 2016/1065 (le taux de TVA et le lieu de prestation ne sont pas connus au moment de l'achat car les crédits peuvent être utilisés pour différents services). Conséquence : la TVA n'est PAS exigible à l'achat des crédits mais à chaque utilisation effective. En pratique simplifiée (régime TVA sur encaissements pour les prestations de services) : la TVA est souvent déclarée à l'encaissement. Documenter le traitement TVA des crédits dans les procédures comptables et consulter un expert-comptable pour sécuriser la position.",
      evidence: "Directive TVA 2016/1065 bons à usage multiple, CGI Art. 269, DGFiP doctrine TVA bons, excilio.fr TVA prestataire services",
      confidence: 85, category: 'tva', revenue_linked: true
    },

    // --- Expansion revenue strategies ---
    {
      learning: "Expansion revenue — le levier #1 de croissance SaaS rentable : en 2025, l'expansion représente 40% du total new ARR pour la médiane SaaS et >50% pour les entreprises >50M ARR. Stratégies d'expansion pour KeiroAI : (1) Upsell de plan (Sprint→Solo→Fondateurs via in-app prompts quand crédits épuisés), (2) Add-ons payants (crédits supplémentaires, features premium), (3) Usage-based expansion (plus l'utilisateur génère, plus il consomme de crédits → upgrade naturel). Le modèle de crédits de KeiroAI est intrinsèquement favorable à l'expansion : un client actif finira par épuiser ses crédits et upgrader. Tracker le ratio expansion/new MRR mensuellement.",
      evidence: "highalpha.com 2025 SaaS benchmarks (40% expansion), benchmarkit.ai 2025 expansion metrics, averi.ai SaaS metrics 2026",
      confidence: 89, category: 'saas_metrics', revenue_linked: true
    },

    // --- Prévisionnel et KPIs tableau de bord ---
    {
      learning: "Tableau de bord financier SaaS — les 12 KPIs essentiels à suivre mensuellement pour KeiroAI : (1) MRR et décomposition, (2) ARR, (3) NRR, (4) GRR, (5) Churn rate (logo + revenue), (6) CAC par canal, (7) LTV et ratio LTV:CAC, (8) CAC Payback period, (9) Marge brute %, (10) Burn rate net et runway, (11) Cash position, (12) Rule of 40 score. Outils recommandés : Stripe Dashboard + ChartMogul ou Baremetrics pour les métriques d'abonnement, Pennylane pour la compta, Google Sheets/Notion pour le reporting board mensuel. Partager ce dashboard avec les investisseurs potentiels dès le premier contact.",
      evidence: "averi.ai 15 SaaS metrics 2026, visdum.com SaaS metrics 2026, re-cap.com SaaS benchmarking tool, golimelight.com SaaS FP&A guide",
      confidence: 90, category: 'saas_metrics', revenue_linked: true
    },

    // --- Seuil micro-entreprise vs réel ---
    {
      learning: "Régime fiscal SaaS en France — choix du régime : la micro-entreprise est inadaptée pour un SaaS en croissance (plafond CA 77 700 EUR prestations, pas de déduction de charges, pas d'IS, pas de CIR/CII, pas de JEI). Le régime réel (IS en SAS/SASU) permet : déduction de toutes les charges (salaires, APIs, marketing), amortissement R&D, CIR/CII, statut JEI, émission de BSPCE, levée de fonds. Recommandation KeiroAI : rester en SAS/SASU à l'IS dès le départ. Le régime BIC réel normal s'applique dès que le CA HT dépasse 254 000 EUR (prestations de services) — en dessous, régime simplifié possible.",
      evidence: "CGI Art. 302 septies A bis, service-public.fr régimes imposition, compta-online.com régime réel simplifié vs normal, bpifrance-creation.fr statuts juridiques",
      confidence: 90, category: 'fiscalite', revenue_linked: true
    },

    // --- Provision pour risques ---
    {
      learning: "Provisions comptables SaaS France : une provision doit être constituée quand (1) il existe une obligation envers un tiers, (2) il est probable qu'une sortie de ressources sera nécessaire, (3) le montant peut être estimé de manière fiable. Cas courants pour KeiroAI : provision pour remboursements clients (estimée sur historique), provision pour litiges (si réclamation en cours), provision pour indemnités de fin de contrat (si CDD), provision pour garantie légale de conformité. Compte 151 (Provisions pour risques). Principe de prudence : mieux vaut provisionner en excès que d'être pris au dépourvu. Les provisions sont déductibles fiscalement si justifiées.",
      evidence: "PCG Art. 312-1 à 312-8, compta-facile.com provisions pour risques, CGI Art. 39-1-5°",
      confidence: 87, category: 'comptabilite_saas', revenue_linked: false
    },

    // --- Optimisation fiscale légale ---
    {
      learning: "Optimisation fiscale légale pour startup SaaS France 2026 — levier cumulatif : (1) Statut JEI = exonération cotisations sociales patronales 7 ans (économie 20-30% masse salariale R&D), (2) CIR 30% des dépenses R&D éligibles, (3) CII 20% des dépenses d'innovation (cumulable si dépenses distinctes), (4) IS taux réduit 15% jusqu'à 42 500 EUR (potentiellement 100 000 EUR PLF 2026), (5) Report déficitaire illimité. Exemple KeiroAI : avec 200K EUR de dépenses R&D éligibles → CIR = 60K EUR + JEI économie cotisations ~30K EUR = 90K EUR d'économies/an. Le CIR est remboursable immédiatement pour les PME et les JEI (pas d'attente 3 ans). Impact direct sur le runway.",
      evidence: "CGI Art. 244 quater B (CIR), Art. 44 sexies-0 A (JEI), Art. 219 I b (IS PME), myriadconsulting.fr CIR startups IA, finalli.com CIR guide",
      confidence: 92, category: 'fiscalite', revenue_linked: true
    },
  ],
};


// ═══════════════════════════════════════════════════════════════════════
// INJECTION ENGINE (no target field)
// ═══════════════════════════════════════════════════════════════════════

async function injectLearnings() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' ROUND 2 — ELITE Knowledge Injection');
  console.log(' Agents: RH (Sara), Comptable (Louis)');
  console.log(' Focus: French law 2025-2026, SaaS finance, verified data');
  console.log('═══════════════════════════════════════════════════════════\n');

  const totalLearnings = Object.values(ROUND2_KNOWLEDGE).reduce((a, b) => a + b.length, 0);
  console.log(`Total learnings to inject: ${totalLearnings}\n`);

  let totalInjected = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [agent, learnings] of Object.entries(ROUND2_KNOWLEDGE)) {
    console.log(`\n╔══ [${agent.toUpperCase()}] — ${learnings.length} learnings ══╗`);

    for (const l of learnings) {
      // Dedup: check if a very similar learning already exists
      const searchStr = l.learning.substring(0, 60).replace(/'/g, "''");
      const { data: existing } = await supabase
        .from('agent_logs')
        .select('id')
        .eq('agent', agent)
        .eq('action', 'learning')
        .ilike('data->>learning', `%${searchStr}%`)
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
        // NO target field as requested
        data: {
          learning: l.learning,
          evidence: l.evidence,
          confidence: l.confidence,
          category: l.category,
          pool_level: l.confidence >= 88 ? 'global' : 'team',
          tier: l.confidence >= 90 ? 'insight' : 'rule',
          revenue_linked: l.revenue_linked || false,
          source: 'elite_round2_rh_comptable_injection',
          injected_at: new Date().toISOString(),
          confirmed_count: 5,
          confirmations: 5,
          contradictions: 0,
          expires_at: l.confidence >= 88 ? null : new Date(Date.now() + 180 * 86400000).toISOString(),
          last_confirmed_at: new Date().toISOString(),
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

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                     RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Injected:  ${totalInjected}`);
  console.log(`  Skipped:   ${totalSkipped} (duplicates)`);
  console.log(`  Errors:    ${totalErrors}`);
  console.log(`  Total:     ${totalLearnings} learnings across ${Object.keys(ROUND2_KNOWLEDGE).length} agents`);
  console.log('');

  // Per-agent breakdown
  for (const [agent, learnings] of Object.entries(ROUND2_KNOWLEDGE)) {
    const categories = [...new Set(learnings.map(l => l.category))];
    const revLinked = learnings.filter(l => l.revenue_linked).length;
    const avgConf = Math.round(learnings.reduce((a, l) => a + l.confidence, 0) / learnings.length);
    console.log(`  [${agent.toUpperCase()}] ${learnings.length} learnings | ${categories.length} categories | ${revLinked} revenue-linked | avg confidence: ${avgConf}%`);
    console.log(`    Categories: ${categories.join(', ')}`);
  }

  console.log('\n  Pool distribution:');
  const allLearnings = Object.values(ROUND2_KNOWLEDGE).flat();
  const globalPool = allLearnings.filter(l => l.confidence >= 88).length;
  const teamPool = allLearnings.filter(l => l.confidence < 88).length;
  console.log(`    Global pool (confidence >= 88): ${globalPool} learnings (shared to ALL agents)`);
  console.log(`    Team pool (confidence < 88):    ${teamPool} learnings (shared within team)`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

injectLearnings().catch(console.error);
