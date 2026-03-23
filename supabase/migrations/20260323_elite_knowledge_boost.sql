-- ═══ ELITE KNOWLEDGE BOOST — All agents ═══
-- Inject ultra-elite learnings for CEO, Marketing, Commercial, Content, and all agents
-- These are high-confidence (0.85+) best practices that elevate all agents

-- ═══ CEO (NOAH) — Strategy + Code + Growth + ML ═══
INSERT INTO agent_knowledge (content, summary, agent, category, confidence, source, created_by) VALUES
('CEO RULE: Analyser les metriques de conversion chaque semaine. Si taux < 2%, pivoter la strategie immediatement. Regarder: CAC, LTV, churn rate, MRR, ARR.', 'KPI strategie conversion CEO', 'ceo', 'best_practice', 0.95, 'elite_boost', 'system'),
('CEO RULE: Growth hacking loop — Test → Mesure → Scale. Ne jamais scaler un canal avec ROAS < 3. Allouer 70% du budget au canal qui performe le plus, 20% test, 10% exploration.', 'Growth loop CEO allocation budget', 'ceo', 'best_practice', 0.92, 'elite_boost', 'system'),
('CEO INSIGHT: Les meilleurs SaaS B2B ont un ratio LTV/CAC > 3x. Si notre ratio est inferieur, reduire le CAC via content marketing organique plutot qu augmenter les prix.', 'Ratio LTV/CAC SaaS', 'ceo', 'insight', 0.90, 'elite_boost', 'system'),
('CEO RULE: Pour optimiser le code des agents, privilegier: 1. Reducir les appels API (batching), 2. Cache les resultats frequents, 3. Paralleliser les taches independantes, 4. Monitorer les timeouts Vercel (300s max).', 'Optimisation code agents', 'ceo', 'best_practice', 0.93, 'elite_boost', 'system'),
('CEO INSIGHT: Le fine-tuning LLM n est pertinent que si on a >10K exemples de qualite. Sinon, le few-shot prompting + RAG est plus efficace et moins couteux. Notre approche RAG + learnings est optimale.', 'Fine-tuning vs RAG decision', 'ceo', 'insight', 0.88, 'elite_boost', 'system'),
('CEO RULE: Chaque agent doit avoir un KPI clair mesurable. Email=reply rate, Content=engagement rate, Commercial=conversion rate, DM=response rate. Si le KPI stagne 7 jours, le CEO doit intervenir.', 'KPI par agent mesurable', 'ceo', 'best_practice', 0.95, 'elite_boost', 'system'),
('CEO STRATEGY: Product-Led Growth — le produit doit se vendre tout seul. Le chatbot Max + les agents visibles en mode demo = pipeline d acquisition organique. Chaque visiteur doit voir la valeur en < 30 secondes.', 'Product-Led Growth strategy', 'ceo', 'insight', 0.90, 'elite_boost', 'system'),
('CEO RULE: Rapport hebdomadaire obligatoire avec: 1. Metriques cles (MRR, churn, CAC, conversions), 2. Top 3 wins, 3. Top 3 problemes, 4. Actions pour la semaine suivante. Envoyer a contact@keiroai.com chaque lundi.', 'Rapport hebdomadaire CEO', 'ceo', 'best_practice', 0.95, 'elite_boost', 'system'),
('CEO INSIGHT: Machine Learning pour scoring prospects: features = engagement_score, days_since_contact, email_opens, clicks, business_type, note_google. Un simple gradient boosting surperformera les regles manuelles.', 'ML scoring prospects', 'ceo', 'insight', 0.85, 'elite_boost', 'system'),
('CEO RULE: Si un agent echoue > 3 fois sur la meme tache, generer un rapport technique detaille avec cause racine, impact business, et solution proposee. Envoyer a contact@keiroai.com pour action humaine.', 'Rapport echecs agents vers admin', 'ceo', 'best_practice', 0.95, 'elite_boost', 'system'),

-- ═══ AMI (MARKETING) — Ultra-elite marketing ═══
('MARKETING RULE: Regle des 3C — Contenu qui Convertit = Clair + Court + CTA. Chaque post doit avoir 1 seul message, 1 seul CTA, max 3 lignes de caption.', 'Regle 3C contenu marketing', 'marketing', 'best_practice', 0.95, 'elite_boost', 'system'),
('MARKETING INSIGHT: Le contenu UGC (User Generated Content) convertit 4x mieux que le branded content. Encourager les clients a poster leur experience avec KeiroAI.', 'UGC > branded content', 'marketing', 'insight', 0.88, 'elite_boost', 'system'),
('MARKETING RULE: Calendrier editorial optimal: Lundi=motivation/tips, Mardi=cas client, Mercredi=behind the scenes, Jeudi=tendance IA, Vendredi=offre/CTA, Weekend=engagement leger.', 'Calendrier editorial semaine', 'marketing', 'best_practice', 0.92, 'elite_boost', 'system'),
('MARKETING INSIGHT: Les Reels Instagram de 7-15 secondes ont 2x plus de reach que les posts statiques. Priorite au format video court pour la visibilite.', 'Reels > posts statiques', 'marketing', 'insight', 0.90, 'elite_boost', 'system'),
('MARKETING RULE: Funnel AIDA pour chaque touchpoint: Attention (hook visuel) → Interet (probleme client) → Desir (solution + preuve) → Action (CTA clair). Tester chaque etape separement.', 'Funnel AIDA marketing', 'marketing', 'best_practice', 0.93, 'elite_boost', 'system'),
('MARKETING INSIGHT: Le meilleur moment pour poster: Instagram 12h-14h et 18h-20h, TikTok 19h-22h, LinkedIn 8h-10h mardi-jeudi, Email 9h-10h mardi et jeudi. Adapter selon les analytics reels.', 'Horaires publication optimaux', 'marketing', 'insight', 0.88, 'elite_boost', 'system'),

-- ═══ COMMERCIAL (LEO) — Growth hacking + vente elite ═══
('COMMERCIAL RULE: Regle des 5 touches — Un prospect a besoin de 5-7 points de contact avant de convertir. Email → DM → Contenu → Relance → Appel. Ne JAMAIS abandonner avant 5 touches.', 'Regle 5 touches conversion', 'commercial', 'best_practice', 0.95, 'elite_boost', 'system'),
('COMMERCIAL INSIGHT: Le cold outreach le plus efficace = personnalisation extreme. Mentionner 1 element specifique du business du prospect (note Google, post recent, produit phare) dans les 2 premieres lignes.', 'Personnalisation cold outreach', 'commercial', 'insight', 0.93, 'elite_boost', 'system'),
('COMMERCIAL RULE: Scoring prospects — Priorite A: note Google >4.0 + Instagram actif + secteur premium. Priorite B: 1 critere manquant. Priorite C: reste. Concentrer 80% des efforts sur A.', 'Scoring priorite prospects', 'commercial', 'best_practice', 0.92, 'elite_boost', 'system'),
('COMMERCIAL INSIGHT: Growth hack: scraper les concurrents de nos prospects actuels. Si un restaurant utilise KeiroAI et performe, proposer la meme chose aux restaurants du meme quartier.', 'Growth hack concurrents locaux', 'commercial', 'insight', 0.88, 'elite_boost', 'system'),
('COMMERCIAL RULE: Objection handling — Prix: montrer le ROI en temps gagne (10h/semaine × tarif horaire). Pas convaincu: proposer essai 14 jours gratuit. Pas le temps: c est justement le probleme qu on resout.', 'Gestion objections vente', 'commercial', 'best_practice', 0.95, 'elite_boost', 'system'),
('COMMERCIAL INSIGHT: Le follow-up optimal: J+1 apres premier contact, J+3 relance douce, J+7 valeur ajoutee (cas client similaire), J+14 derniere chance avec urgence. Jamais plus de 5 relances.', 'Sequence follow-up optimale', 'commercial', 'insight', 0.90, 'elite_boost', 'system'),

-- ═══ CONTENT (LENA) — Ultra-elite designer/DA/monteur ═══
('CONTENT RULE: Chaque visual doit suivre la DA KeiroAI: fond sombre (#0c1a3a), accents violet/bleu, typographie bold, style tech premium. Jamais de fond blanc generique.', 'DA KeiroAI visuals', 'content', 'best_practice', 0.95, 'elite_boost', 'system'),
('CONTENT RULE: Prompt engineering elite pour Seedream: toujours specifier 1. Style (isometric, 3D, photo-realistic), 2. Eclairage (studio, golden hour, neon), 3. Composition (rule of thirds, centered, dynamic), 4. Couleurs (palette precise hex), 5. Mood (energetic, calm, professional).', 'Prompt engineering Seedream elite', 'content', 'best_practice', 0.95, 'elite_boost', 'system'),
('CONTENT INSIGHT: Les transitions video les plus performantes sur TikTok/Reels: zoom rapide, whip pan, match cut, morph transition. Eviter les transitions basiques (fondu, glissement).', 'Transitions video elite TikTok', 'content', 'insight', 0.90, 'elite_boost', 'system'),
('CONTENT RULE: Direction artistique par type de business: Restaurant=warm colors+food photography, Boutique=lifestyle+minimal, Coach=bold typography+motivation, Coiffeur=before/after+glamour.', 'DA par type de business', 'content', 'best_practice', 0.92, 'elite_boost', 'system'),
('CONTENT RULE: Montage video elite — Hook dans les 0.3s (mouvement ou texte choc), rythme coupe toutes les 2-3s, musique trending, sous-titres toujours actifs, CTA dans les 3 dernieres secondes.', 'Montage video reels elite', 'content', 'best_practice', 0.93, 'elite_boost', 'system'),
('CONTENT INSIGHT: Les carousels Instagram ont 3x plus de saves que les posts simples. Format ideal: 5-7 slides, premiere slide = hook, derniere = CTA, contenu actionable au milieu.', 'Carousels > posts simples', 'content', 'insight', 0.90, 'elite_boost', 'system'),
('CONTENT RULE: Ne JAMAIS utiliser de texte dans les images generees (Seedream genere du texte illisible). Le texte doit etre superpose en post-production avec des overlays propres.', 'Pas de texte dans images generees', 'content', 'best_practice', 0.95, 'elite_boost', 'system'),

-- ═══ EMAIL (HUGO) — Elite email marketing ═══
('EMAIL RULE: Subject line qui convertit: max 6 mots, personnalise (prenom ou ville), curiosite ou urgence. Ex: "Victor, 5 couverts en plus?" plutot que "Decouvrez notre solution marketing".', 'Subject lines elite', 'email', 'best_practice', 0.95, 'elite_boost', 'system'),
('EMAIL INSIGHT: Les emails envoyes le mardi et jeudi entre 9h-10h ont les meilleurs taux d ouverture (22-25% vs 15% moyenne). Eviter le lundi matin et le vendredi apres-midi.', 'Timing email optimal', 'email', 'insight', 0.90, 'elite_boost', 'system'),
('EMAIL RULE: Structure email parfaite: 1. Hook personnel (1 ligne), 2. Probleme du prospect (1 ligne), 3. Solution (2 lignes), 4. Preuve (1 cas client), 5. CTA (1 ligne, 1 action). Total < 100 mots.', 'Structure email parfaite', 'email', 'best_practice', 0.95, 'elite_boost', 'system'),

-- ═══ DM (JADE) — Elite Instagram DM ═══
('DM RULE: Premier DM = jamais de pitch. Toujours commencer par un compliment sincere et specifique sur le business du prospect. Le pitch vient au 2eme ou 3eme message.', 'Premier DM = compliment', 'dm_instagram', 'best_practice', 0.95, 'elite_boost', 'system'),
('DM INSIGHT: Les DMs envoyes en reponse a une story ont 3x plus de taux de reponse que les cold DMs. Toujours reagir a une story recente avant d envoyer le message principal.', 'Story reply > cold DM', 'dm_instagram', 'insight', 0.92, 'elite_boost', 'system'),

-- ═══ SEO (OSCAR) — Elite SEO ═══
('SEO RULE: Article SEO elite = min 1500 mots, H1 unique avec mot-cle principal, 3-5 H2, liens internes (min 3), images avec alt text, meta description < 160 chars, URL slug court et descriptif.', 'Structure article SEO elite', 'seo', 'best_practice', 0.93, 'elite_boost', 'system'),
('SEO INSIGHT: Les mots-cles longue traine (3+ mots) convertissent 2.5x mieux que les mots-cles courts. Cibler "marketing IA pour restaurant lyon" plutot que "marketing IA".', 'Mots-cles longue traine', 'seo', 'insight', 0.90, 'elite_boost', 'system'),

-- ═══ WHATSAPP (STELLA) — Elite conversational ═══
('WHATSAPP RULE: Temps de reponse < 5 min = taux de conversion 5x superieur. Configurer auto-reply immediat puis reponse detaillee dans les 2 min.', 'Temps reponse WhatsApp', 'whatsapp', 'best_practice', 0.93, 'elite_boost', 'system'),
('WHATSAPP INSIGHT: Les messages avec emojis ont 25% plus de reponses. Utiliser 1-2 emojis max, jamais plus. Les emojis les plus efficaces: fire, rocket, sparkles, thumbs up.', 'Emojis WhatsApp conversion', 'whatsapp', 'insight', 0.88, 'elite_boost', 'system'),

-- ═══ SHARED (ALL AGENTS) — Intelligence collective ═══
('SHARED RULE: Tous les agents travaillent pour le meme objectif: augmenter le chiffre d affaires et satisfaire les clients. Chaque action doit etre evaluee par son impact business direct.', 'Objectif commun CA + satisfaction', NULL, 'best_practice', 0.98, 'elite_boost', 'system'),
('SHARED RULE: Connaissance des autres agents — Chaque agent sait que 16 autres agents existent et travaillent en parallele. Avant d agir, verifier si un autre agent n a pas deja traite le sujet.', 'Conscience inter-agents', NULL, 'best_practice', 0.95, 'elite_boost', 'system'),
('SHARED INSIGHT: La synergie multi-canal est la cle. Un prospect contacte par email + DM + contenu pertinent a 5x plus de chances de convertir qu un prospect contacte sur un seul canal.', 'Synergie multi-canal conversion', NULL, 'insight', 0.93, 'elite_boost', 'system'),
('SHARED RULE: Personnalisation > Volume. 10 actions ultra-personnalisees valent mieux que 100 actions generiques. Toujours utiliser le dossier client et les donnees CRM pour personnaliser.', 'Personnalisation > volume', NULL, 'best_practice', 0.95, 'elite_boost', 'system'),
('SHARED INSIGHT: Les entreprises qui utilisent KeiroAI gagnent en moyenne 10h/semaine. Cet argument est le plus puissant en conversion. Le temps gagne = argent gagne.', 'Argument 10h/semaine', NULL, 'insight', 0.92, 'elite_boost', 'system')
ON CONFLICT DO NOTHING;
