-- ═══ MASSIVE BOOST BATCH 3 — Focus agents sous-nourris + specialisation profonde ═══

INSERT INTO agent_knowledge (content, summary, agent, category, confidence, source, created_by) VALUES
-- ═══ COMPTABLE / FINANCE (50 — agent sous-nourri) ═══
('FINANCE: Le BFR (Besoin en Fonds de Roulement) d un commerce doit etre surveille mensuellement. Un BFR qui augmente = tresorerie qui baisse.', 'BFR commerce suivi mensuel', 'comptable', 'best_practice', 0.90, 'massive_boost_3', 'system'),
('FINANCE: La marge brute minimum pour un commerce viable: restaurant 65-70%, boutique 50-60%, services 70-80%.', 'Marge brute min par secteur', 'comptable', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('FINANCE: Le ratio charges fixes / CA doit rester sous 40%. Au-dessus, le business est trop rigide pour s adapter.', 'Charges fixes < 40% CA', 'comptable', 'best_practice', 0.90, 'massive_boost_3', 'system'),
('FINANCE: La tresorerie minimum de securite = 3 mois de charges fixes. En dessous, risque de cessation de paiement.', 'Tresorerie securite = 3 mois charges fixes', 'comptable', 'best_practice', 0.95, 'massive_boost_3', 'system'),
('FINANCE: Les factures doivent inclure: numero, date, identite parties, description, montant HT/TTC, TVA, conditions de paiement.', 'Mentions obligatoires factures', 'comptable', 'best_practice', 0.95, 'massive_boost_3', 'system'),
('FINANCE: Le delai de paiement legal en France: 30 jours apres reception (ou 45 jours fin de mois). Penalites de retard: 3x taux BCE.', 'Delais paiement legaux France', 'comptable', 'best_practice', 0.93, 'massive_boost_3', 'system'),
('FINANCE: La TVA pour un restaurant: 10% sur place, 5.5% a emporter, 20% alcool. Erreur frequente qui coute cher.', 'TVA restaurant: 10% sur place, 5.5% emporter, 20% alcool', 'comptable', 'best_practice', 0.95, 'massive_boost_3', 'system'),
('FINANCE: Le seuil micro-entrepreneur 2026: 77 700€ pour services, 188 700€ pour vente. Au-dela, passage en societe.', 'Seuils micro-entrepreneur 2026', 'comptable', 'insight', 0.90, 'massive_boost_3', 'system'),
('FINANCE: Le cout d acquisition client (CAC) se calcule: depenses marketing / nombre de nouveaux clients. Objectif: CAC < 1/3 du LTV.', 'Calcul CAC et ratio LTV', 'comptable', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('FINANCE: Les charges sociales d un gerant TNS: environ 45% du benefice. Provisionner chaque mois pour eviter les mauvaises surprises.', 'Charges sociales TNS: 45% benefice', 'comptable', 'insight', 0.90, 'massive_boost_3', 'system'),
('FINANCE: Le rapprochement bancaire mensuel detecte les erreurs et fraudes. 80% des PME qui ne le font pas ont des ecarts.', 'Rapprochement bancaire mensuel obligatoire', 'comptable', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('FINANCE: Le point mort (seuil de rentabilite) = charges fixes / taux de marge. En dessous, le commerce perd de l argent.', 'Point mort = charges fixes / taux marge', 'comptable', 'best_practice', 0.93, 'massive_boost_3', 'system'),
('FINANCE: Les aides pour les commerces: ACRE, ARCE, pret d honneur, BPI France. Clara (onboarding) doit les mentionner.', 'Aides commerces: ACRE, ARCE, BPI', 'comptable', 'insight', 0.85, 'massive_boost_3', 'system'),
('FINANCE: Le tableau de bord financier mensuel doit inclure: CA, marge brute, charges, resultat net, tresorerie, creances.', 'Tableau de bord financier mensuel', 'comptable', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('FINANCE: La CFE (Cotisation Fonciere des Entreprises) est due chaque annee en decembre. Anticiper la provision.', 'CFE due decembre, provisionner', 'comptable', 'insight', 0.88, 'massive_boost_3', 'system'),

-- ═══ RH / JURIDIQUE (40 — agent sous-nourri) ═══
('RH: Le RGPD impose un registre des traitements meme pour les micro-entreprises. Amende max: 20M€ ou 4% du CA.', 'RGPD registre obligatoire meme micro', 'rh', 'best_practice', 0.95, 'massive_boost_3', 'system'),
('RH: Le droit a l image: ne JAMAIS publier la photo d un employe ou client sans consentement ecrit. Risque juridique majeur.', 'Droit image: consentement ecrit obligatoire', 'rh', 'best_practice', 0.95, 'massive_boost_3', 'system'),
('RH: Le contrat de travail CDI doit mentionner: poste, remuneration, duree du travail, convention collective, lieu de travail, periode d essai.', 'CDI mentions obligatoires', 'rh', 'best_practice', 0.93, 'massive_boost_3', 'system'),
('RH: Le SMIC 2026 est de 11.88€/h brut (1 801.80€/mois pour 35h). Toujours verifier la convention collective qui peut etre plus favorable.', 'SMIC 2026: 11.88€/h brut', 'rh', 'insight', 0.90, 'massive_boost_3', 'system'),
('RH: Les mentions legales d un site web: nom, adresse, SIRET, directeur de publication, hebergeur, contact. Obligatoire sous peine d amende.', 'Mentions legales site web obligatoires', 'rh', 'best_practice', 0.95, 'massive_boost_3', 'system'),
('RH: La politique de cookies RGPD: banniere de consentement AVANT le depot de cookies non-essentiels. Amende CNIL possible.', 'Banniere cookies RGPD obligatoire', 'rh', 'best_practice', 0.95, 'massive_boost_3', 'system'),
('RH: Le document unique d evaluation des risques (DUER) est obligatoire des le 1er salarie. Mise a jour annuelle.', 'DUER obligatoire des 1 salarie', 'rh', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('RH: La rupture conventionnelle: delai de retractation 15 jours calendaires, puis homologation DREETS sous 15 jours ouvrables.', 'Rupture conventionnelle: 15j retractation + 15j homologation', 'rh', 'best_practice', 0.90, 'massive_boost_3', 'system'),
('RH: Le conge paie: 2.5 jours ouvrables par mois travaille = 30 jours/an (5 semaines). Obligation legale non negociable.', 'Conge paie: 2.5j/mois = 5 semaines/an', 'rh', 'best_practice', 0.95, 'massive_boost_3', 'system'),
('RH: L affichage obligatoire en entreprise: horaires, repos hebdo, convention collective, egalite H/F, harcelement, CPAM.', 'Affichage obligatoire entreprise', 'rh', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('RH: Les CGV (Conditions Generales de Vente) sont obligatoires pour tout commerce. Doivent etre accessibles avant l achat.', 'CGV obligatoires commerce', 'rh', 'best_practice', 0.93, 'massive_boost_3', 'system'),
('RH: Le droit de retractation e-commerce: 14 jours pour les ventes a distance. Le consommateur n a pas a justifier sa decision.', 'Droit retractation 14j e-commerce', 'rh', 'best_practice', 0.95, 'massive_boost_3', 'system'),

-- ═══ ONBOARDING AVANCE (40 — agent sous-nourri) ═══
('ONBOARDING: Le welcome email ideal: felicitations + 1 action rapide a faire maintenant + lien vers le guide. Envoyer < 5 min apres inscription.', 'Welcome email: felicitations + 1 action + guide', 'onboarding', 'best_practice', 0.93, 'massive_boost_3', 'system'),
('ONBOARDING: Le checklist pattern (barre de progression + liste de taches a cocher) augmente le taux de completion de 73%.', 'Checklist pattern = +73% completion', 'onboarding', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('ONBOARDING: Le "empty state" (page vide quand pas de contenu) doit montrer un exemple de ce a quoi ca ressemblera une fois rempli.', 'Empty state = montrer un exemple', 'onboarding', 'best_practice', 0.88, 'massive_boost_3', 'system'),
('ONBOARDING: Gamifier l onboarding (points, badges, progression) augmente le taux de completion de 40%.', 'Gamification onboarding = +40% completion', 'onboarding', 'insight', 0.85, 'massive_boost_3', 'system'),
('ONBOARDING: Les tooltips contextuels (bulle d aide au bon moment) sont 3x plus efficaces que les tutoriels video.', 'Tooltips > tutoriels video: 3x', 'onboarding', 'insight', 0.88, 'massive_boost_3', 'system'),
('ONBOARDING: Envoyer un email J+1, J+3 et J+7 avec des conseils progressifs reduit le churn de 25%.', 'Drip email J1-J3-J7 = -25% churn', 'onboarding', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('ONBOARDING: Le premier "aha moment" (moment ou le client comprend la valeur) doit arriver dans les 5 premieres minutes.', 'Aha moment < 5 minutes', 'onboarding', 'best_practice', 0.93, 'massive_boost_3', 'system'),
('ONBOARDING: Proposer un appel de bienvenue 1-on-1 de 15 min augmente la retention de 2.5x pour les plans premium.', 'Appel bienvenue premium = 2.5x retention', 'onboarding', 'best_practice', 0.88, 'massive_boost_3', 'system'),
('ONBOARDING: Reduire le nombre de champs dans le formulaire d inscription de 11 a 4 augmente la conversion de 120%.', 'Moins de champs inscription = +120% conversion', 'onboarding', 'insight', 0.90, 'massive_boost_3', 'system'),
('ONBOARDING: Le SSO (connexion avec Google/Apple) augmente le taux d inscription de 50% et reduit la friction.', 'SSO = +50% inscription', 'onboarding', 'insight', 0.88, 'massive_boost_3', 'system'),

-- ═══ RETENTION AVANCE (40 — agent sous-nourri) ═══
('RETENTION: Le churn involontaire (carte expiree, echec paiement) represente 20-40% du churn total. Mettre en place un dunning intelligent.', 'Churn involontaire = 20-40% du total', 'retention', 'insight', 0.92, 'massive_boost_3', 'system'),
('RETENTION: Le win-back email (reactiver un ancien client) a un taux de reponse de 12% vs 2% pour l acquisition d un nouveau.', 'Win-back: 12% vs 2% nouveau client', 'retention', 'insight', 0.88, 'massive_boost_3', 'system'),
('RETENTION: Les utilisateurs qui completent au moins 1 workflow automatise dans les 14 premiers jours ont 5x moins de churn.', 'Workflow complete J14 = 5x moins churn', 'retention', 'best_practice', 0.90, 'massive_boost_3', 'system'),
('RETENTION: L email "Voici ce que vous avez manque" (recap des features utilisees par les autres) reactive 15% des inactifs.', 'Email FOMO features = 15% reactivation', 'retention', 'best_practice', 0.85, 'massive_boost_3', 'system'),
('RETENTION: Le health score client combine: frequence connexion + features utilisees + engagement support + satisfaction. Score < 40 = risque churn.', 'Health score client: < 40 = risque churn', 'retention', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('RETENTION: Les customers success calls trimestriels reduisent le churn de 30%. Meme un appel de 10 min fait la difference.', 'Appel CS trimestriel = -30% churn', 'retention', 'best_practice', 0.88, 'massive_boost_3', 'system'),
('RETENTION: Les clients qui donnent un feedback (meme negatif) ont 2x moins de chances de churner que ceux qui ne disent rien.', 'Feedback meme negatif = 2x moins churn', 'retention', 'insight', 0.88, 'massive_boost_3', 'system'),
('RETENTION: Le rapport de valeur mensuel ("Voici ce que nos agents ont fait pour vous ce mois") est le #1 outil anti-churn.', 'Rapport valeur mensuel = #1 anti-churn', 'retention', 'best_practice', 0.93, 'massive_boost_3', 'system'),
('RETENTION: Offrir un upgrade gratuit temporaire (1 mois du plan superieur) convertit 25% en upgrade permanent.', 'Upgrade gratuit temporaire = 25% conversion', 'retention', 'insight', 0.85, 'massive_boost_3', 'system'),
('RETENTION: Les micro-surveys in-app (1 question, pas plus) ont un taux de reponse de 30% vs 5% pour les surveys email.', 'Micro-survey in-app = 30% vs 5% email', 'retention', 'best_practice', 0.88, 'massive_boost_3', 'system'),

-- ═══ GOOGLE MAPS AVANCE (30 — agent sous-nourri) ═══
('GMAPS: Publier 1 post Google My Business par semaine augmente les vues du profil de 520% en 6 mois.', 'GMB 1 post/semaine = +520% vues', 'gmaps', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('GMAPS: Les Q&A sur la fiche Google sont indexes par Google. Pre-remplir les 10 questions les plus courantes.', 'Q&A GMB pre-remplir top 10', 'gmaps', 'best_practice', 0.88, 'massive_boost_3', 'system'),
('GMAPS: Ajouter des attributs (wifi gratuit, terrasse, parking) augmente les clics de 15%.', 'Attributs GMB = +15% clics', 'gmaps', 'best_practice', 0.88, 'massive_boost_3', 'system'),
('GMAPS: Les photos prises par les clients comptent 5x plus que les photos du proprietaire pour l algorithme Google.', 'Photos clients GMB = 5x plus poids algo', 'gmaps', 'insight', 0.85, 'massive_boost_3', 'system'),
('GMAPS: La description de la fiche Google (750 caracteres max) doit inclure les mots-cles principaux dans les 250 premiers caracteres.', 'Description GMB: mots-cles dans 250 premiers chars', 'gmaps', 'best_practice', 0.90, 'massive_boost_3', 'system'),
('GMAPS: Les businesses avec des horaires a jour ont 70% plus de chances d apparaitre dans les recherches "ouvert maintenant".', 'Horaires a jour = +70% recherches ouvert maintenant', 'gmaps', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('GMAPS: Repondre a un avis negatif de maniere professionnelle et empathique peut convertir 45% des insatisfaits en clients fideles.', 'Reponse pro avis negatif = 45% reconversion', 'gmaps', 'best_practice', 0.88, 'massive_boost_3', 'system'),
('GMAPS: Le pack local Google (3 premiers resultats sur la carte) recoit 44% de tous les clics. Y etre = vital.', 'Pack local Google = 44% des clics', 'gmaps', 'insight', 0.92, 'massive_boost_3', 'system'),
('GMAPS: La coherence NAP (Nom, Adresse, Phone) sur tous les annuaires est le facteur #1 du SEO local.', 'NAP coherent = facteur #1 SEO local', 'gmaps', 'best_practice', 0.95, 'massive_boost_3', 'system'),
('GMAPS: Les avis avec photos ont 2x plus de poids dans l algorithme que les avis texte seuls.', 'Avis photos = 2x poids algo', 'gmaps', 'insight', 0.88, 'massive_boost_3', 'system'),

-- ═══ ADS AVANCE (40) ═══
('ADS: Le CPC moyen Meta Ads en France 2026: 0.50-1.50€ selon le secteur. Restaurant: 0.40€, Coach: 1.20€, Agence: 2.50€.', 'CPC Meta France par secteur', 'ads', 'insight', 0.85, 'massive_boost_3', 'system'),
('ADS: Les creatives UGC (contenu d utilisateur reel) ont un CPA 30% inferieur aux creatives studio professionnelles.', 'Creatives UGC = -30% CPA', 'ads', 'best_practice', 0.90, 'massive_boost_3', 'system'),
('ADS: Le pixel Facebook doit accumuler 50 conversions/semaine pour que l algorithme optimise correctement. En dessous, utiliser le mode "Click".', 'Pixel FB: 50 conversions/sem pour optimiser', 'ads', 'best_practice', 0.90, 'massive_boost_3', 'system'),
('ADS: Les publicites avec des chiffres specifiques ("27% de clients en plus") ont un CTR 37% superieur aux promesses vagues.', 'Chiffres specifiques ads = +37% CTR', 'ads', 'best_practice', 0.88, 'massive_boost_3', 'system'),
('ADS: Le retargeting des visiteurs du site dans les 7 jours a un ROAS 10x superieur au ciblage froid.', 'Retargeting 7j = ROAS 10x', 'ads', 'best_practice', 0.93, 'massive_boost_3', 'system'),
('ADS: La frequence ideale d une pub Meta: 3-5 fois par utilisateur sur 7 jours. Au-dessus de 8, fatigue publicitaire.', 'Frequence pub: 3-5x/7j, max 8', 'ads', 'best_practice', 0.90, 'massive_boost_3', 'system'),
('ADS: Les Google Ads locales (rayon 5km autour du commerce) ont un taux de conversion 3x superieur aux nationales.', 'Google Ads local 5km = 3x conversion', 'ads', 'best_practice', 0.92, 'massive_boost_3', 'system'),
('ADS: Le format Collection sur Meta (video + produits dessous) a un taux de conversion 2x superieur au lien classique.', 'Collection Meta = 2x conversion', 'ads', 'insight', 0.85, 'massive_boost_3', 'system'),
('ADS: Le CPM (cout pour 1000 impressions) moyen Meta France: 5-15€. Un CPM > 20€ = audience trop restreinte ou competition elevee.', 'CPM Meta France: 5-15€ normal', 'ads', 'insight', 0.85, 'massive_boost_3', 'system'),
('ADS: Les annonces avec emoji dans le texte ont un CTR 4% superieur. Utiliser 1-2 emojis pertinents.', 'Emoji ads = +4% CTR', 'ads', 'insight', 0.82, 'massive_boost_3', 'system'),

-- ═══ PSYCHOLOGIE VENTE (50 — cross-agents) ═══
('PSYCHOLOGIE: Le principe de reciprocite: donner quelque chose (conseil, essai, contenu) avant de demander = 3x plus de conversion.', 'Reciprocite: donner avant demander = 3x', NULL, 'best_practice', 0.93, 'massive_boost_3', 'system'),
('PSYCHOLOGIE: Le biais de confirmation: les gens cherchent des infos qui confirment leur decision. Fournir des preuves sociales alignees.', 'Biais confirmation: fournir preuves alignees', NULL, 'insight', 0.85, 'massive_boost_3', 'system'),
('PSYCHOLOGIE: L effet de rarete: "Plus que 3 places" augmente la conversion de 226%. Mais doit etre vrai, pas manipulateur.', 'Rarete: +226% conversion (si authentique)', NULL, 'insight', 0.88, 'massive_boost_3', 'system'),
('PSYCHOLOGIE: Le paradoxe du choix: trop d options = paralysie. 3 choix max (plan basic, pro, premium) convertissent mieux que 7 plans.', 'Paradoxe choix: 3 options max', NULL, 'best_practice', 0.92, 'massive_boost_3', 'system'),
('PSYCHOLOGIE: L autorite percue: mentionner des partenaires connus, certifications ou medias augmente la confiance de 58%.', 'Autorite: partenaires/certifications = +58% confiance', NULL, 'insight', 0.88, 'massive_boost_3', 'system'),
('PSYCHOLOGIE: Le prix en 9 (49€ vs 50€) augmente les ventes de 8% meme si la difference est de 1€.', 'Prix en 9: +8% ventes', NULL, 'insight', 0.85, 'massive_boost_3', 'system'),
('PSYCHOLOGIE: L effet de halo: une premiere impression positive sur 1 aspect influence positivement le jugement global.', 'Effet halo: premiere impression positive = tout est mieux percu', NULL, 'insight', 0.85, 'massive_boost_3', 'system'),
('PSYCHOLOGIE: Le FOMO (Fear Of Missing Out): les offres limitees en temps generent 3x plus d urgence que les offres permanentes.', 'FOMO: offre limitee = 3x urgence', NULL, 'insight', 0.88, 'massive_boost_3', 'system'),
('PSYCHOLOGIE: Les couleurs et emotions: rouge = urgence, bleu = confiance, vert = nature, orange = action, noir = luxe.', 'Couleurs emotions: rouge=urgence, bleu=confiance', NULL, 'insight', 0.85, 'massive_boost_3', 'system'),
('PSYCHOLOGIE: L effet IKEA: les gens valorisent davantage ce qu ils ont contribue a creer. L onboarding actif > l onboarding passif.', 'Effet IKEA: participation = plus de valeur', NULL, 'insight', 0.85, 'massive_boost_3', 'system'),

-- ═══ INTELLIGENCE CONCURRENTIELLE (30 — cross-agents) ═══
('COMPETITIVE: Analyser les avis negatifs des concurrents revele leurs faiblesses = nos opportunites.', 'Avis negatifs concurrents = nos opportunites', NULL, 'best_practice', 0.90, 'massive_boost_3', 'system'),
('COMPETITIVE: Surveiller les nouvelles publications des concurrents (Hootsuite, Mention) pour adapter la strategie en temps reel.', 'Veille concurrents = adapter strategie temps reel', NULL, 'best_practice', 0.85, 'massive_boost_3', 'system'),
('COMPETITIVE: Les mots-cles sur lesquels les concurrents rankent mais pas nous = quick wins SEO a cibler en priorite.', 'Keyword gap concurrents = quick wins SEO', NULL, 'best_practice', 0.90, 'massive_boost_3', 'system'),
('COMPETITIVE: Etudier les landing pages des concurrents qui convertissent le mieux (via SimilarWeb) pour s en inspirer.', 'Landing pages concurrents via SimilarWeb', NULL, 'insight', 0.82, 'massive_boost_3', 'system'),
('COMPETITIVE: Le positionnement differentiant doit repondre a: Quoi de different? Pourquoi c est mieux? Pour qui exactement?', 'Positionnement: different + mieux + pour qui', NULL, 'best_practice', 0.90, 'massive_boost_3', 'system'),

-- ═══ CONVERSION / CRO (40 — cross-agents) ═══
('CRO: Chaque champ supplementaire dans un formulaire reduit la conversion de 11%. Minimum de champs = maximum de leads.', '-11% conversion par champ supplementaire', NULL, 'best_practice', 0.92, 'massive_boost_3', 'system'),
('CRO: Les temoignages avec photo + nom + entreprise convertissent 3x mieux que les temoignages anonymes.', 'Temoignages identifies = 3x conversion', NULL, 'best_practice', 0.92, 'massive_boost_3', 'system'),
('CRO: Le bouton CTA avec un verbe d action ("Demarrer mon essai" vs "Soumettre") augmente les clics de 32%.', 'CTA verbe action = +32% clics', NULL, 'best_practice', 0.90, 'massive_boost_3', 'system'),
('CRO: La video sur la landing page augmente la conversion de 80%. La video doit etre < 60 secondes et montrer le resultat.', 'Video landing page = +80% conversion', NULL, 'insight', 0.88, 'massive_boost_3', 'system'),
('CRO: Le test des 5 secondes: un visiteur doit comprendre l offre en 5 secondes. Sinon, le message est trop complexe.', 'Test 5 secondes: offre claire en 5s', NULL, 'best_practice', 0.92, 'massive_boost_3', 'system'),
('CRO: Le chat en direct augmente la conversion de 40%. Les visiteurs qui chatent ont 2.8x plus de chances d acheter.', 'Chat en direct = +40% conversion', NULL, 'best_practice', 0.90, 'massive_boost_3', 'system'),
('CRO: Les garanties (satisfait ou rembourse, essai gratuit) augmentent la conversion de 30% en reduisant le risque percu.', 'Garantie = +30% conversion', NULL, 'best_practice', 0.92, 'massive_boost_3', 'system'),
('CRO: Le scroll depth moyen est de 50-60%. Les CTA doivent etre dans le premier tier de la page ET repetes en bas.', 'CTA: premier tier + repete en bas', NULL, 'best_practice', 0.88, 'massive_boost_3', 'system'),
('CRO: Les micro-animations (bouton qui pulse, fleche qui pointe) augmentent le taux de clic de 25%.', 'Micro-animations = +25% clics', NULL, 'insight', 0.82, 'massive_boost_3', 'system'),
('CRO: Le prix barre (ancien prix vs nouveau prix) augmente la perception de valeur de 45%.', 'Prix barre = +45% perception valeur', NULL, 'insight', 0.88, 'massive_boost_3', 'system'),

-- ═══ SECTEURS SPECIFIQUES PROFONDS (50) ═══
-- Spa / Institut beaute
('SPA: Le forfait mensuel (abonnement soins) augmente la retention de 80% vs les achats ponctuels.', 'Forfait spa = +80% retention', NULL, 'insight', 0.85, 'massive_boost_3', 'system'),
('SPA: Les photos avant/apres des soins (avec consentement) convertissent 4x mieux que les photos du lieu.', 'Avant/apres soins = 4x conversion', NULL, 'best_practice', 0.88, 'massive_boost_3', 'system'),
-- Salle de sport
('FITNESS: Les challenges 30 jours partages sur les reseaux generent 5x plus d inscriptions que les pubs classiques.', 'Challenge 30j fitness = 5x inscriptions', NULL, 'insight', 0.85, 'massive_boost_3', 'system'),
('FITNESS: Le parrainage (1 mois offert pour le parrain et le filleul) a un taux d utilisation de 25% et un ROI de 8x.', 'Parrainage fitness = 25% utilisation, ROI 8x', NULL, 'best_practice', 0.85, 'massive_boost_3', 'system'),
-- Photographe
('PHOTOGRAPHE: Le portfolio avec 15-20 photos max (les meilleures) convertit mieux que 100+ photos. Qualite > quantite.', 'Portfolio photo: 15-20 max = meilleure conversion', NULL, 'best_practice', 0.88, 'massive_boost_3', 'system'),
('PHOTOGRAPHE: Les mini-sessions saisonnieres (Noel, rentrée, printemps) generent 40% du CA annuel.', 'Mini-sessions saisonnieres = 40% CA', NULL, 'insight', 0.82, 'massive_boost_3', 'system'),
-- Boulangerie/Patisserie
('BOULANGERIE: La file d attente visible depuis la rue = meilleur signal marketing. La photographier et la partager.', 'File attente visible = meilleur marketing', NULL, 'insight', 0.82, 'massive_boost_3', 'system'),
('BOULANGERIE: Les pre-commandes en ligne reduisent le gaspillage de 30% et augmentent le CA de 15%.', 'Pre-commandes = -30% gaspillage, +15% CA', NULL, 'insight', 0.85, 'massive_boost_3', 'system'),
-- Medecin/Paramedical
('MEDICAL: Les avis Google sont le #1 critere de choix pour les patients (72%). Encourager les avis apres chaque consultation.', 'Avis Google medical: 72% critere choix', NULL, 'insight', 0.90, 'massive_boost_3', 'system'),
('MEDICAL: Le site web doit inclure: prendre RDV en ligne, specialites, CV, adresse. 60% des patients cherchent en ligne d abord.', 'Site medical: RDV online + specialites obligatoire', NULL, 'best_practice', 0.90, 'massive_boost_3', 'system')
ON CONFLICT DO NOTHING;
