-- ═══ GLOBAL CALENDAR + COMMUNITY BUILDING BOOST ═══

INSERT INTO agent_knowledge (content, summary, agent, category, confidence, source, created_by) VALUES
-- Community building strategy
('COMMUNITY RULE: La creation de communaute est la strategie de conversion la plus puissante a long terme. Un membre de communaute a 8x plus de chance de convertir qu un prospect froid. Priorite: engager avant de vendre.', 'Community = meilleure conversion', NULL, 'best_practice', 0.95, 'global_boost', 'system'),
('COMMUNITY RULE: Lancer un challenge communautaire 7 jours par trimestre. Format: 1 action/jour simple, hashtag dedie, partage de resultats, winner a la fin. Genere 5x plus d engagement que les posts classiques.', 'Challenge communautaire trimestriel', NULL, 'best_practice', 0.93, 'global_boost', 'system'),
('COMMUNITY INSIGHT: Les lives/AMA (Ask Me Anything) generent 3x plus de commentaires que les posts. Programmer 1 live/mois minimum. Le client ou l agent (via stories) repond aux questions en direct.', 'Lives AMA engagement x3', NULL, 'insight', 0.90, 'global_boost', 'system'),
('COMMUNITY RULE: User Generated Content (UGC) = contenu gratuit + social proof. Encourager les clients a poster avec un hashtag dedie. Reposter les meilleurs contenus. Offrir un avantage aux contributeurs.', 'UGC strategie communaute', NULL, 'best_practice', 0.92, 'global_boost', 'system'),
('COMMUNITY INSIGHT: Les groupes prives (WhatsApp, Telegram, Discord) ont un taux de retention 4x superieur aux pages publiques. Creer un groupe VIP pour les meilleurs clients de chaque business.', 'Groupes prives retention x4', NULL, 'insight', 0.88, 'global_boost', 'system'),

-- International calendar awareness
('CALENDAR RULE: Adapter les campagnes au pays du client. Fete des meres en mars au UK mais mai en France. Ramadan variable. Eid crucial au Moyen-Orient. 8 mars = MEGA event en Russie/Europe de l Est. Carnaval en fevrier au Bresil.', 'Calendrier adapte par region', NULL, 'best_practice', 0.95, 'global_boost', 'system'),
('CALENDAR INSIGHT: Black Friday est mondial mais les dates varient: White Friday au Moyen-Orient, Buen Fin au Mexique (mi-novembre), Black Week en Scandinavie (semaine entiere). Toujours anticiper 3 semaines avant.', 'Black Friday mondial variations', NULL, 'insight', 0.90, 'global_boost', 'system'),
('CALENDAR RULE: Les events religieux (Ramadan, Noel orthodoxe, Paques orthodoxe, Eid) doivent etre traites avec respect absolu. Jamais de promos agressives pendant le ramadan. Contenu adapte: iftar deals, family moments.', 'Events religieux respect et adaptation', NULL, 'best_practice', 0.95, 'global_boost', 'system'),
('CALENDAR INSIGHT: Les soldes ont des dates legales differentes par pays. FR: janvier+juin. BE: janvier+juillet. ES: janvier+juillet. UK: Boxing Day puis janvier. Toujours verifier les dates locales.', 'Soldes dates legales par pays', NULL, 'insight', 0.88, 'global_boost', 'system'),
('CALENDAR RULE: Anticiper les campagnes: J-21 pour les gros events (Noel, Black Friday), J-14 pour les moyens (Fete des meres), J-7 pour les petits (Chandeleur). NOAH doit declencher la preparation automatiquement.', 'Anticipation campagnes par taille event', NULL, 'best_practice', 0.93, 'global_boost', 'system'),

-- Growth via community
('GROWTH COMMUNITY: La strategie communaute en 5 etapes: 1. Creer un hashtag de marque, 2. Lancer un challenge mensuel, 3. Reposter les UGC, 4. Creer un groupe VIP, 5. Organiser des events online. Chaque etape double l engagement.', 'Strategie communaute 5 etapes', NULL, 'best_practice', 0.92, 'global_boost', 'system'),
('GROWTH COMMUNITY: Les ambassadeurs de marque (micro-influenceurs clients) sont 10x moins chers et 3x plus efficaces que la pub classique. Identifier les clients les plus engages et leur proposer un programme ambassadeur.', 'Ambassadeurs micro-influenceurs', NULL, 'insight', 0.90, 'global_boost', 'system'),
('GROWTH COMMUNITY: Le contenu educatif (tips, tutorials, behind the scenes) genere 2x plus de saves et partages que le contenu promotionnel. Ratio ideal: 70% valeur, 20% engagement, 10% promotion.', 'Ratio contenu 70-20-10', NULL, 'best_practice', 0.93, 'global_boost', 'system'),

-- Regional adaptation for agents
('MARKETING REGIONAL: Pour le Moyen-Orient, poster entre 21h-1h (prime time), eviter le vendredi (jour sacre), contenu en arabe + anglais, visuels luxe/famille. Pour la Scandinavie, ton minimaliste, eco-friendly, posting 7h-9h.', 'Adaptation regionale marketing', 'marketing', 'best_practice', 0.90, 'global_boost', 'system'),
('CONTENT REGIONAL: Adapter le style visuel par region: France=chic/artisanal, UK=modern/clean, US=bold/colorful, Espagne=warm/vibrant, Moyen-Orient=luxe/gold, Scandinavie=minimal/nature, LATAM=festif/colorful.', 'Style visuel par region', 'content', 'best_practice', 0.92, 'global_boost', 'system'),
('EMAIL REGIONAL: Les horaires d envoi optimaux varient: FR 9h-10h mardi/jeudi, UK 10h-11h mardi, US 8h-10h EST mardi/mercredi, ME 10h-12h dimanche/lundi, LATAM 10h-11h mardi/mercredi.', 'Horaires email par region', 'email', 'best_practice', 0.90, 'global_boost', 'system')
ON CONFLICT DO NOTHING;
