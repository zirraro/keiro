'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ClientAgent } from '@/lib/agents/client-context';
import { CLIENT_AGENTS } from '@/lib/agents/client-context';

const CrmDashboard = dynamic(() => import('./components/CrmDashboard'), { ssr: false });
const AgentDashboard = dynamic(() => import('./components/AgentDashboard'), { ssr: false });
const OnboardingDossier = dynamic(() => import('./components/OnboardingDossier'), { ssr: false });
const AgentSetupGuide = dynamic(() => import('../../components/AgentSetupGuide'), { ssr: false });
const AgentTutorial = dynamic(() => import('./components/AgentTutorial'), { ssr: false });

const AGENTS_WITH_DASHBOARD = [
  'marketing', 'commercial', 'email', 'content', 'seo', 'ads', 'comptable',
  'rh', 'onboarding', 'dm_instagram', 'tiktok_comments', 'gmaps', 'chatbot', 'whatsapp',
  'ceo', 'qa',
];

// ─── Types ─────────────────────────────────────────────────

interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; created_at: string; }
interface AgentInfo { name: string; avatar_url: string; avatar_3d_url: string; title: string; gradient_from: string; gradient_to: string; }
interface UploadedFile { id: string; name: string; size: number; uploaded_at: string; url?: string; }
interface AgentTask { id: string; type: string; description: string; status: string; result?: string; created_at: string; agent?: string; }

// ─── Agent settings config per role ─────────────────────────

interface SettingField { key: string; label: string; type: 'toggle' | 'select' | 'time' | 'number' | 'text'; options?: { value: string; label: string }[]; default: any; description: string; }

function getAgentSettings(agentId: string): SettingField[] {
  const common: SettingField[] = [
    { key: 'mode', label: 'Mode d\'execution', type: 'select', options: [{ value: 'auto', label: 'Automatique (agit seul)' }, { value: 'notify', label: 'Notification avant action' }, { value: 'manual', label: 'Manuel (vous decidez)' }], default: 'notify', description: 'Controle le niveau d\'autonomie de l\'agent' },
    { key: 'active', label: 'Agent actif', type: 'toggle', default: true, description: 'Desactiver pour mettre en pause temporairement' },
    { key: 'notifications', label: 'Notifications email', type: 'toggle', default: true, description: 'Recevoir un email quand l\'agent agit' },
  ];
  const byAgent: Record<string, SettingField[]> = {
    email: [
      // Envoi
      { key: 'send_hour_1', label: 'Heure envoi matin', type: 'time', default: '09:00', description: '1er creneau d\'envoi (heure locale)' },
      { key: 'send_hour_2', label: 'Heure envoi apres-midi', type: 'time', default: '14:00', description: '2eme creneau d\'envoi' },
      { key: 'max_per_day', label: 'Max emails/jour', type: 'number', default: 50, description: 'Limite d\'emails envoyes par jour (max 300 Brevo)' },
      // Sequence
      { key: 'auto_relance', label: 'Relance auto', type: 'toggle', default: true, description: 'Relancer automatiquement les non-reponses' },
      { key: 'relance_delay', label: 'Delai entre relances (jours)', type: 'number', default: 3, description: 'Jours entre chaque relance' },
      { key: 'max_steps', label: 'Nombre de relances max', type: 'number', default: 3, description: 'Nombre total d\'emails dans la sequence (1 initial + X relances)' },
      { key: 'reactivation_days', label: 'Reactivation apres (jours)', type: 'number', default: 30, description: 'Jours avant de reactiver un prospect sans reponse' },
      // Style
      { key: 'tone', label: 'Ton d\'ecriture', type: 'select', options: [{ value: 'friendly', label: 'Amical (tutoiement)' }, { value: 'formal', label: 'Professionnel (vouvoiement)' }, { value: 'casual', label: 'Decontracte' }, { value: 'premium', label: 'Premium/Luxe' }], default: 'friendly', description: 'Style d\'ecriture des emails' },
      { key: 'signature', label: 'Type de signature', type: 'select', options: [{ value: 'custom', label: 'Nom personnalise' }, { value: 'founder', label: 'Nom du fondateur (profil)' }, { value: 'company', label: 'Nom de l\'entreprise' }, { value: 'team', label: 'L\'equipe + entreprise' }], default: 'founder', description: 'Comment signer les emails' },
      { key: 'signature_name', label: 'Nom de signature personnalise', type: 'text', default: '', description: 'Ex: Marie de MonBusiness. Utilise quand le type est "Nom personnalise"' },
      // Ciblage
      { key: 'target_types', label: 'Types de commerce cibles', type: 'select', options: [{ value: 'all', label: 'Tous' }, { value: 'restaurant', label: 'Restaurants' }, { value: 'boutique', label: 'Boutiques' }, { value: 'coach', label: 'Coaches' }, { value: 'beauty', label: 'Beaute/Coiffure' }], default: 'all', description: 'Cibler un type specifique de prospect' },
      { key: 'min_score', label: 'Score minimum', type: 'number', default: 0, description: 'N\'envoyer qu\'aux prospects avec ce score minimum' },
      // Reponses
      { key: 'auto_reply_positive', label: 'Auto-reponse (positif)', type: 'toggle', default: false, description: 'Repondre automatiquement aux reponses positives' },
      { key: 'auto_reply_neutral', label: 'Auto-reponse (neutre)', type: 'toggle', default: true, description: 'Repondre automatiquement aux accuses de reception' },
      { key: 'stop_on_negative', label: 'Stop si negatif', type: 'toggle', default: true, description: 'Arreter la sequence si le prospect repond negativement' },
    ],
    content: [
      // Volume
      { key: 'posts_per_day_ig', label: 'Posts Instagram/jour', type: 'number', default: 3, description: 'Nombre de publications Instagram par jour' },
      { key: 'posts_per_day_tt', label: 'Posts TikTok/jour', type: 'number', default: 3, description: 'Nombre de publications TikTok par jour' },
      { key: 'posts_per_day_li', label: 'Posts LinkedIn/jour', type: 'number', default: 3, description: 'Nombre de publications LinkedIn par jour' },
      // Horaires
      { key: 'publish_hour_1', label: 'Publication matin', type: 'time', default: '09:00', description: '1er creneau de publication' },
      { key: 'publish_hour_2', label: 'Publication midi', type: 'time', default: '13:30', description: '2eme creneau de publication' },
      { key: 'publish_hour_3', label: 'Publication soir', type: 'time', default: '18:00', description: '3eme creneau de publication' },
      // Style
      { key: 'auto_publish', label: 'Publication auto', type: 'toggle', default: true, description: 'Publier sans validation manuelle' },
      { key: 'visual_style', label: 'Style visuel', type: 'select', options: [{ value: 'brand', label: 'DA de marque' }, { value: 'modern', label: 'Moderne/Tech' }, { value: 'warm', label: 'Chaleureux/Artisanal' }, { value: 'minimal', label: 'Minimaliste' }, { value: 'bold', label: 'Bold/Colore' }], default: 'brand', description: 'Direction artistique des visuels' },
      { key: 'caption_style', label: 'Style des legendes', type: 'select', options: [{ value: 'short', label: 'Court (1-2 lignes)' }, { value: 'medium', label: 'Moyen (3-5 lignes)' }, { value: 'long', label: 'Long (storytelling)' }], default: 'medium', description: 'Longueur des legendes' },
      { key: 'use_hashtags', label: 'Hashtags', type: 'toggle', default: true, description: 'Ajouter automatiquement des hashtags pertinents' },
      { key: 'max_hashtags', label: 'Nombre max hashtags', type: 'number', default: 15, description: 'Nombre maximum de hashtags par post' },
      // Formats
      { key: 'formats', label: 'Formats preferes', type: 'select', options: [{ value: 'all', label: 'Tous (posts, reels, carrousels)' }, { value: 'reels', label: 'Reels/Videos prioritaire' }, { value: 'carousel', label: 'Carrousels prioritaire' }, { value: 'static', label: 'Images statiques' }], default: 'all', description: 'Types de contenu a privilegier' },
      { key: 'trend_surfing', label: 'Surf tendances', type: 'toggle', default: true, description: 'Creer du contenu base sur les tendances du moment' },
    ],
    dm_instagram: [
      { key: 'max_dms_day', label: 'Max DMs/jour', type: 'number', default: 50, description: 'Limite de DMs prepares par jour' },
      { key: 'target', label: 'Cible prioritaire', type: 'select', options: [{ value: 'new_followers', label: 'Nouveaux abonnes' }, { value: 'engaged', label: 'Utilisateurs engages' }, { value: 'prospects', label: 'Prospects CRM' }, { value: 'story_viewers', label: 'Viewers de stories' }], default: 'new_followers', description: 'A qui envoyer les DMs en priorite' },
      { key: 'auto_reply', label: 'Reponse auto DMs recus', type: 'toggle', default: true, description: 'Repondre automatiquement aux DMs entrants' },
      { key: 'dm_tone', label: 'Ton des DMs', type: 'select', options: [{ value: 'casual', label: 'Casual (ami entrepreneur)' }, { value: 'value', label: 'Value-first (conseil gratuit)' }, { value: 'direct', label: 'Direct (proposition)' }], default: 'casual', description: 'Approche des messages' },
      { key: 'first_dm_type', label: 'Premier DM', type: 'select', options: [{ value: 'compliment', label: 'Compliment sur le business' }, { value: 'question', label: 'Question ouverte' }, { value: 'story_reply', label: 'Reaction a une story' }], default: 'compliment', description: 'Comment ouvrir la conversation' },
      { key: 'include_visual', label: 'Visual personnalise', type: 'toggle', default: true, description: 'Generer un visuel personnalise avec le DM' },
      { key: 'handover_score', label: 'Score handover', type: 'number', default: 60, description: 'Score a partir duquel vous etes notifie pour closer' },
      { key: 'handover_exchanges', label: 'Echanges avant handover', type: 'number', default: 3, description: 'Nombre d\'echanges avant notification' },
    ],
    commercial: [
      { key: 'scoring_threshold', label: 'Seuil score contact', type: 'number', default: 30, description: 'Score minimum pour contacter un prospect' },
      { key: 'auto_qualify', label: 'Qualification auto', type: 'toggle', default: true, description: 'Qualifier automatiquement les prospects (type, quartier, etc.)' },
      { key: 'auto_enrich', label: 'Enrichissement auto', type: 'toggle', default: true, description: 'Rechercher automatiquement les reseaux sociaux et contacts' },
      { key: 'prospect_sources', label: 'Sources prospection', type: 'select', options: [{ value: 'all', label: 'Toutes (Google, Maps, Social)' }, { value: 'google', label: 'Google Search' }, { value: 'maps', label: 'Google Maps' }, { value: 'social', label: 'Reseaux sociaux' }], default: 'all', description: 'Ou chercher les prospects' },
      { key: 'daily_prospect_target', label: 'Objectif prospects/jour', type: 'number', default: 20, description: 'Nombre de nouveaux prospects a trouver par jour' },
      { key: 'priority_types', label: 'Types prioritaires', type: 'select', options: [{ value: 'all', label: 'Tous' }, { value: 'restaurant', label: 'Restaurants' }, { value: 'boutique', label: 'Boutiques' }, { value: 'coach', label: 'Coaches' }, { value: 'premium', label: 'Premium (agences, avocats)' }], default: 'all', description: 'Types de commerce a cibler en priorite' },
      { key: 'auto_assign_agent', label: 'Assigner auto aux agents', type: 'toggle', default: true, description: 'Assigner automatiquement les prospects qualifies aux agents Email/DM' },
      { key: 'crm_update_frequency', label: 'Mise a jour CRM', type: 'select', options: [{ value: 'realtime', label: 'Temps reel' }, { value: 'hourly', label: 'Chaque heure' }, { value: 'daily', label: 'Quotidien' }], default: 'realtime', description: 'Frequence de mise a jour du pipeline CRM' },
    ],
    seo: [
      { key: 'articles_per_month', label: 'Articles/mois', type: 'number', default: 8, description: 'Nombre d\'articles SEO par mois' },
      { key: 'article_length', label: 'Longueur articles', type: 'select', options: [{ value: 'short', label: 'Court (800-1000 mots)' }, { value: 'medium', label: 'Moyen (1500-2000 mots)' }, { value: 'long', label: 'Long (2500+ mots)' }], default: 'medium', description: 'Longueur cible des articles' },
      { key: 'auto_publish_blog', label: 'Publication auto', type: 'toggle', default: false, description: 'Publier les articles sans validation' },
      { key: 'keyword_strategy', label: 'Strategie mots-cles', type: 'select', options: [{ value: 'longtail', label: 'Longue traine (volume faible, conversion haute)' }, { value: 'competitive', label: 'Competitif (volume haut, difficulte haute)' }, { value: 'local', label: 'Local (ville + metier)' }, { value: 'mix', label: 'Mix equilibre' }], default: 'longtail', description: 'Type de mots-cles a cibler' },
      { key: 'internal_linking', label: 'Liens internes', type: 'toggle', default: true, description: 'Ajouter automatiquement des liens vers les pages du site' },
      { key: 'meta_auto', label: 'Meta descriptions auto', type: 'toggle', default: true, description: 'Generer automatiquement les meta descriptions SEO' },
      { key: 'image_alt', label: 'Alt text images auto', type: 'toggle', default: true, description: 'Generer automatiquement les textes alt des images' },
    ],
    ads: [
      { key: 'daily_budget', label: 'Budget quotidien (EUR)', type: 'number', default: 20, description: 'Budget max par jour pour les campagnes' },
      { key: 'monthly_budget', label: 'Budget mensuel (EUR)', type: 'number', default: 500, description: 'Budget max par mois toutes campagnes' },
      { key: 'auto_optimize', label: 'Optimisation auto', type: 'toggle', default: true, description: 'Ajuster automatiquement les encheres et budgets' },
      { key: 'platform', label: 'Plateforme pub', type: 'select', options: [{ value: 'meta', label: 'Meta (Instagram + Facebook)' }, { value: 'google', label: 'Google Ads' }, { value: 'tiktok', label: 'TikTok Ads' }, { value: 'all', label: 'Toutes' }], default: 'meta', description: 'Ou diffuser les publicites' },
      { key: 'target_radius', label: 'Rayon ciblage (km)', type: 'number', default: 10, description: 'Rayon geographique autour de votre commerce' },
      { key: 'min_roas', label: 'ROAS minimum', type: 'number', default: 3, description: 'Retour minimum sur investissement pub (x fois le budget)' },
      { key: 'auto_pause_underperform', label: 'Pause auto sous-performance', type: 'toggle', default: true, description: 'Mettre en pause les campagnes sous le ROAS minimum' },
      { key: 'ab_testing', label: 'A/B testing auto', type: 'toggle', default: true, description: 'Tester automatiquement differentes creatives' },
    ],
    tiktok_comments: [
      { key: 'comments_per_day', label: 'Commentaires/jour', type: 'number', default: 30, description: 'Nombre de commentaires strategiques par jour' },
      { key: 'engage_hour_1', label: 'Creneau engagement 1', type: 'time', default: '12:00', description: 'Premier creneau d\'engagement' },
      { key: 'engage_hour_2', label: 'Creneau engagement 2', type: 'time', default: '18:00', description: 'Deuxieme creneau (prime time)' },
      { key: 'target_hashtags', label: 'Hashtags cibles', type: 'select', options: [{ value: 'trending', label: 'Trending' }, { value: 'niche', label: 'Niche metier' }, { value: 'local', label: 'Local' }, { value: 'mix', label: 'Mix' }], default: 'mix', description: 'Types de hashtags ou engager' },
      { key: 'comment_style', label: 'Style commentaires', type: 'select', options: [{ value: 'supportive', label: 'Encourageant' }, { value: 'expert', label: 'Expert/conseil' }, { value: 'funny', label: 'Drole/fun' }, { value: 'question', label: 'Questions engageantes' }], default: 'supportive', description: 'Ton des commentaires' },
      { key: 'follow_engaged', label: 'Follow les engages', type: 'toggle', default: true, description: 'Suivre automatiquement les createurs qui repondent' },
      { key: 'comment_to_dm', label: 'Comment-to-DM', type: 'toggle', default: false, description: 'Mot-cle declencheur pour envoyer un DM auto apres commentaire' },
    ],
    chatbot: [
      { key: 'greeting', label: 'Message d\'accueil', type: 'select', options: [{ value: 'default', label: 'Standard' }, { value: 'promo', label: 'Avec offre promo' }, { value: 'minimal', label: 'Minimal' }, { value: 'question', label: 'Question ouverte' }], default: 'default', description: 'Premier message affiche aux visiteurs' },
      { key: 'collect_email', label: 'Collecter email', type: 'toggle', default: true, description: 'Demander l\'email dans la conversation' },
      { key: 'collect_phone', label: 'Collecter telephone', type: 'toggle', default: false, description: 'Demander le telephone' },
      { key: 'auto_qualify', label: 'Qualifier auto', type: 'toggle', default: true, description: 'Detecter le type de business et les besoins automatiquement' },
      { key: 'response_speed', label: 'Vitesse de reponse', type: 'select', options: [{ value: 'instant', label: 'Instantane' }, { value: 'natural', label: 'Naturel (1-3s delai)' }, { value: 'slow', label: 'Lent (5-10s, plus humain)' }], default: 'natural', description: 'Delai avant reponse du chatbot' },
      { key: 'escalate_to_human', label: 'Escalade humain', type: 'toggle', default: true, description: 'Proposer de parler a un humain apres 3 questions' },
      { key: 'proactive_popup', label: 'Popup proactif', type: 'toggle', default: true, description: 'Ouvrir le chat automatiquement apres 30s sur le site' },
      { key: 'popup_delay', label: 'Delai popup (sec)', type: 'number', default: 30, description: 'Secondes avant que le chatbot s\'ouvre automatiquement' },
    ],
    whatsapp: [
      { key: 'send_hour', label: 'Heure d\'envoi', type: 'time', default: '10:00', description: 'Heure optimale pour les messages WhatsApp' },
      { key: 'max_messages_day', label: 'Max messages/jour', type: 'number', default: 30, description: 'Limite de messages WhatsApp par jour' },
      { key: 'auto_reply', label: 'Reponse auto', type: 'toggle', default: true, description: 'Repondre automatiquement aux messages recus' },
      { key: 'reply_delay', label: 'Delai reponse (min)', type: 'number', default: 2, description: 'Delai avant reponse auto (plus naturel)' },
      { key: 'tone', label: 'Ton', type: 'select', options: [{ value: 'friendly', label: 'Amical (tutoiement)' }, { value: 'formal', label: 'Professionnel' }, { value: 'casual', label: 'Decontracte + emojis' }], default: 'casual', description: 'Style des messages WhatsApp' },
      { key: 'auto_followup', label: 'Relance auto', type: 'toggle', default: true, description: 'Relancer les prospects sans reponse apres 48h' },
      { key: 'followup_delay_hours', label: 'Delai relance (heures)', type: 'number', default: 48, description: 'Heures avant de relancer un prospect silencieux' },
      { key: 'collect_info', label: 'Collecter infos', type: 'toggle', default: true, description: 'Detecter email, type business, besoins' },
      { key: 'handover_score', label: 'Score notification', type: 'number', default: 60, description: 'Score a partir duquel vous etes notifie pour closer' },
      { key: 'use_templates', label: 'Templates pre-approuves', type: 'toggle', default: true, description: 'Utiliser les templates WhatsApp Business (hors fenetre 24h)' },
    ],
    marketing: [
      { key: 'analysis_frequency', label: 'Frequence analyse', type: 'select', options: [{ value: 'daily', label: 'Quotidienne' }, { value: 'weekly', label: 'Hebdomadaire' }, { value: 'realtime', label: 'Temps reel' }], default: 'daily', description: 'A quelle frequence AMI analyse les performances' },
      { key: 'advise_agents', label: 'Conseiller les agents', type: 'toggle', default: true, description: 'AMI recommande des actions aux autres agents' },
      { key: 'sync_analytics', label: 'Sync analytics auto', type: 'toggle', default: true, description: 'Synchroniser automatiquement les stats des plateformes' },
      { key: 'community_management', label: 'Community management', type: 'toggle', default: true, description: 'Gerer les commentaires et interactions communaute' },
      { key: 'competitor_watch', label: 'Veille concurrents', type: 'toggle', default: false, description: 'Surveiller les publications des concurrents' },
    ],
    gmaps: [
      { key: 'scan_frequency', label: 'Frequence scan', type: 'select', options: [{ value: 'daily', label: 'Quotidien' }, { value: 'weekly', label: 'Hebdomadaire' }], default: 'daily', description: 'A quelle frequence scanner les avis Google Maps' },
      { key: 'auto_reply_reviews', label: 'Reponse auto avis', type: 'toggle', default: true, description: 'Repondre automatiquement aux avis Google' },
      { key: 'reply_positive', label: 'Repondre aux positifs', type: 'toggle', default: true, description: 'Repondre aussi aux avis positifs (remerciements)' },
      { key: 'reply_negative', label: 'Repondre aux negatifs', type: 'toggle', default: false, description: 'Repondre aux avis negatifs (attention : validation recommandee)' },
      { key: 'scan_radius_km', label: 'Rayon de scan (km)', type: 'number', default: 5, description: 'Rayon autour de votre adresse pour scanner les concurrents' },
      { key: 'alert_low_rating', label: 'Alerte note basse', type: 'toggle', default: true, description: 'Notifier si un nouvel avis < 3 etoiles' },
    ],
    comptable: [
      { key: 'daily_check', label: 'Check quotidien', type: 'toggle', default: true, description: 'Verifier la tresorerie chaque jour' },
      { key: 'alert_threshold', label: 'Seuil alerte (EUR)', type: 'number', default: 500, description: 'Alerter si le solde passe sous ce montant' },
      { key: 'invoice_reminder', label: 'Rappel factures', type: 'toggle', default: true, description: 'Rappeler les factures impayees automatiquement' },
      { key: 'invoice_delay_days', label: 'Delai rappel facture (jours)', type: 'number', default: 7, description: 'Jours de retard avant le rappel' },
      { key: 'forecast_months', label: 'Prevision (mois)', type: 'number', default: 3, description: 'Horizon de la prevision financiere' },
      { key: 'weekly_report', label: 'Rapport hebdo', type: 'toggle', default: true, description: 'Envoyer un rapport financier chaque semaine' },
    ],
    onboarding: [
      { key: 'auto_welcome', label: 'Email bienvenue auto', type: 'toggle', default: true, description: 'Envoyer un email de bienvenue automatiquement' },
      { key: 'setup_guide', label: 'Guide pas-a-pas', type: 'toggle', default: true, description: 'Afficher le guide interactif d\'onboarding' },
      { key: 'auto_activate_agents', label: 'Activer agents auto', type: 'toggle', default: true, description: 'Activer automatiquement les agents du plan choisi' },
      { key: 'first_post_auto', label: 'Premier post auto', type: 'toggle', default: true, description: 'Generer et publier le premier post automatiquement' },
      { key: 'check_frequency', label: 'Frequence check', type: 'select', options: [{ value: 'daily', label: 'Quotidien' }, { value: 'hourly', label: 'Chaque heure (J1-J3)' }], default: 'daily', description: 'A quelle frequence verifier l\'avancement' },
      { key: 'nps_after_days', label: 'NPS apres (jours)', type: 'number', default: 7, description: 'Demander un score NPS apres X jours' },
    ],
    retention: [
      { key: 'inactivity_alert_days', label: 'Alerte inactivite (jours)', type: 'number', default: 3, description: 'Jours sans connexion avant alerte' },
      { key: 'reactivation_email', label: 'Email reactivation auto', type: 'toggle', default: true, description: 'Envoyer un email de reactivation automatiquement' },
      { key: 'reactivation_offer', label: 'Offre reactivation', type: 'toggle', default: false, description: 'Inclure une offre speciale dans le mail de reactivation' },
      { key: 'milestone_notifications', label: 'Notifications milestones', type: 'toggle', default: true, description: 'Feliciter le client a chaque milestone (1er post, 1er prospect, etc.)' },
      { key: 'weekly_report', label: 'Rapport resultats hebdo', type: 'toggle', default: true, description: 'Envoyer un rapport de resultats chaque semaine' },
      { key: 'churn_prediction', label: 'Prediction churn', type: 'toggle', default: true, description: 'Detecter les signaux de depart et intervenir proactivement' },
    ],
    rh: [
      { key: 'contract_auto', label: 'Generation contrats auto', type: 'toggle', default: false, description: 'Generer automatiquement les brouillons de contrats' },
      { key: 'rgpd_check', label: 'Check RGPD auto', type: 'toggle', default: true, description: 'Verifier la conformite RGPD regulierement' },
      { key: 'legal_alerts', label: 'Alertes legales', type: 'toggle', default: true, description: 'Alerter sur les obligations legales a venir' },
      { key: 'doc_language', label: 'Langue documents', type: 'select', options: [{ value: 'fr', label: 'Francais' }, { value: 'en', label: 'Anglais' }, { value: 'both', label: 'Bilingue' }], default: 'fr', description: 'Langue des documents generes' },
    ],
  };
  return [...common, ...(byAgent[agentId] || [])];
}

// ─── Helpers ───────────────────────────────────────────────

function generateId() { return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
function formatFileSize(bytes: number) { if (bytes < 1024) return bytes + ' o'; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko'; return (bytes / (1024 * 1024)).toFixed(1) + ' Mo'; }
function formatDate(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
function formatDateTime(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => { const c = () => setM(window.innerWidth < 1024); c(); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c); }, []);
  return m;
}

function getAgentSuggestions(agentId: string): string[] {
  const s: Record<string, string[]> = {
    marketing: ['Analyse mes KPIs', 'Plan marketing ce mois-ci'],
    commercial: ['Prospects chauds a relancer', 'Taux de conversion pipeline'],
    email: ['Sequence email prospects froids', 'Taux d\'ouverture'],
    content: ['Calendrier editorial semaine', '5 idees posts Instagram'],
    seo: ['Analyse SEO mon site', 'Mots-cles a cibler'],
    ads: ['Campagne Meta Ads', 'Optimise budget ROAS'],
    comptable: ['Point tresorerie', 'Factures en retard'],
    rh: ['Contrat de prestation', 'Conformite RGPD'],
    onboarding: ['Configurer mon espace', 'Agents a activer'],
    dm_instagram: ['Campagne DMs', 'Messages d\'approche'],
    tiktok_comments: ['Engager communaute', 'Engagement TikTok'],
    gmaps: ['Fiche Google Maps', 'Repondre avis clients'],
    chatbot: ['Leads captures', 'Optimiser reponses auto'],
    whatsapp: ['Envoie un message a mes prospects chauds', 'Analyse mes conversations WhatsApp'],
  };
  return s[agentId] || ['Que peux-tu faire ?', 'Analyse performances'];
}

function renderContent(content: string) {
  return content.split('\n').map((line, i) => {
    if (/^[\-\*]\s/.test(line.trim())) return <div key={i} className="flex items-start gap-2 ml-2"><span className="text-purple-400">&#8226;</span><span>{line.trim().slice(2)}</span></div>;
    if (line.trim() === '') return <div key={i} className="h-2" />;
    return <p key={i} className={i > 0 ? 'mt-1' : ''}>{line}</p>;
  });
}

// ─── Day names for planning ─────────────────────────────────

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ─── Main Component ─────────────────────────────────────────

export default function AgentWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const agentId = params.id as string;

  // Core
  const [agent, setAgent] = useState<ClientAgent | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  // Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'planning' | 'history' | 'campaigns' | 'settings' | 'profile'>('dashboard');

  // Chat (slide-over)
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Files
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Dashboard
  const hasDashboard = AGENTS_WITH_DASHBOARD.includes(agentId);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [agentSetupDone, setAgentSetupDone] = useState<boolean | null>(null);
  const [userPlan, setUserPlan] = useState('free');

  // History (tasks done by agent)
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Settings
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);

  // QA state
  const [qaResult, setQaResult] = useState<any>(null);
  const [qaRunning, setQaRunning] = useState(false);

  // Widget key for integrations
  const [widgetKey, setWidgetKey] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/widget/config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.widgets && d.widgets.length > 0) {
          setWidgetKey(d.widgets[0].widget_key);
        }
      }).catch(() => {});
  }, []);

  // ─── Init agent ────────────────────────────────────────
  useEffect(() => { const f = CLIENT_AGENTS.find(a => a.id === agentId); if (f) setAgent(f); }, [agentId]);

  // ─── Clara: auto-open chat when profile is incomplete ──
  useEffect(() => {
    if (agentId !== 'onboarding' || pageLoading) return;
    // Check dossier completeness
    (async () => {
      try {
        const res = await fetch('/api/business-dossier', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const dossier = data.dossier;
          const filled = dossier ? Object.values(dossier).filter((v: any) => v && String(v).trim().length > 0).length : 0;
          if (filled < 10) {
            // Profile incomplete — auto-open chat with intro message
            setChatOpen(true);
            if (messages.length === 0) {
              setMessages([{
                id: 'clara_intro',
                role: 'assistant',
                content: `Salut ! Je suis Clara, ton guide onboarding. Ton profil business n'est pas encore complet — discutons ensemble pour le remplir. Je te pose quelques questions et je m'occupe du reste. Tes 17 agents IA pourront ensuite travailler beaucoup mieux pour toi !\n\nCommençons : comment s'appelle ton commerce et quel est ton type d'activité ?`,
                created_at: new Date().toISOString(),
              }]);
            }
          }
        }
      } catch {}
    })();
  }, [agentId, pageLoading]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load chat + agent info ────────────────────────────
  useEffect(() => {
    if (!agentId) return;
    async function load() {
      try {
        const res = await fetch(`/api/agents/client-chat?agent_id=${agentId}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.messages) setMessages(data.messages.map((m: any, i: number) => ({ id: m.id || `h_${i}`, role: m.role, content: m.content, created_at: m.created_at || new Date().toISOString() })));
          if (data.agent) setAgentInfo(data.agent);
          if (data.files) setFiles(data.files);
        }
      } catch {} finally { setPageLoading(false); }
    }
    load();
  }, [agentId]);

  // ─── Load avatar fallback ─────────────────────────────
  useEffect(() => {
    if (agentInfo || !agent) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/avatars');
        const data = await res.json();
        const m = data.avatars?.find((a: any) => a.id === agentId);
        if (m) setAgentInfo({ name: agent.displayName, avatar_url: m.avatar_url || '', avatar_3d_url: m.avatar_3d_url || '', title: agent.title || '', gradient_from: agent.gradientFrom || '#8b5cf6', gradient_to: agent.gradientTo || '#6d28d9' });
      } catch {}
    })();
  }, [agent, agentId, agentInfo]);

  // ─── Check agent setup status ─────────────────────────
  useEffect(() => {
    fetch(`/api/agents/settings?agent_id=${agentId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setAgentSetupDone(!!d.settings?.setup_completed);
        if (d.subscription_plan) setUserPlan(d.subscription_plan);
      })
      .catch(() => setAgentSetupDone(true));
  }, [agentId]);

  // ─── Load dashboard ───────────────────────────────────
  useEffect(() => {
    if (!hasDashboard || dashboardData) return;
    setDashboardLoading(true);
    (async () => {
      try { const res = await fetch(`/api/agents/dashboard?agent_id=${agentId}`, { credentials: 'include' }); if (res.ok) setDashboardData(await res.json()); } catch {} finally { setDashboardLoading(false); }
    })();
  }, [agentId, hasDashboard, dashboardData]);

  // ─── Load task history ────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'history' || tasks.length > 0) return;
    setTasksLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/agents/dashboard?agent_id=${agentId}&type=logs`, { credentials: 'include' });
        if (res.ok) { const data = await res.json(); setTasks(data.logs || data.recommendations || []); }
      } catch {} finally { setTasksLoading(false); }
    })();
  }, [activeTab, agentId, tasks.length]);

  // ─── Load settings from localStorage ──────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`keiro_agent_settings_${agentId}`);
      if (stored) { setSettings(JSON.parse(stored)); return; }
    } catch {}
    // Init defaults
    const fields = getAgentSettings(agentId);
    const defaults: Record<string, any> = {};
    fields.forEach(f => { defaults[f.key] = f.default; });
    setSettings(defaults);
  }, [agentId]);

  // ─── Save settings ───────────────────────────────────
  const handleSaveSettings = useCallback(() => {
    try { localStorage.setItem(`keiro_agent_settings_${agentId}`, JSON.stringify(settings)); } catch {}
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }, [agentId, settings]);

  // ─── Chat handlers ───────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  const handleSend = useCallback(async () => {
    const text = input.trim(); if (!text || isLoading) return;
    setMessages(prev => [...prev, { id: generateId(), role: 'user', content: text, created_at: new Date().toISOString() }]);
    setInput(''); setIsLoading(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    try {
      const res = await fetch('/api/agents/client-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ agent_id: agentId, message: text }) });
      const replyContent = res.ok ? ((await res.json()).message || 'Reponse recue.') : 'Merci ! Je traite ta demande.';
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: replyContent, created_at: new Date().toISOString() }]);
    } catch { setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: 'Oups, probleme de connexion.', created_at: new Date().toISOString() }]); }
    finally { setIsLoading(false); }
  }, [input, isLoading, agentId]);

  // ─── Voice input (Web Speech API) ────────────────────
  const toggleVoiceInput = useCallback(() => {
    if (isRecording) {
      // Stop recording
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsRecording(false);
      return;
    }

    // Start recording with Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Ton navigateur ne supporte pas la reconnaissance vocale. Utilise Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onerror = () => { setIsRecording(false); };
    recognition.onend = () => { setIsRecording(false); };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording]);

  // ─── File handlers ───────────────────────────────────
  const handleFileUpload = useCallback(async (fl: FileList | null) => {
    if (!fl?.length) return; setUploading(true);
    for (let i = 0; i < fl.length; i++) {
      const fd = new FormData(); fd.append('file', fl[i]); fd.append('agent_id', agentId);
      try {
        const r = await fetch('/api/agents/agent-files', { method: 'POST', credentials: 'include', body: fd });
        if (r.ok) {
          const d = await r.json();
          setFiles(p => [...p, { id: d.id || generateId(), name: fl[i].name, size: fl[i].size, uploaded_at: new Date().toISOString(), url: d.file?.url || d.url }]);

          // If dossier was auto-updated from file content, show confirmation in chat
          if (d.dossier_updated && d.fields_extracted) {
            const fieldLabels: Record<string, string> = {
              company_name: 'nom de l\'entreprise', company_description: 'description', business_type: 'type d\'activite',
              founder_name: 'fondateur', employees_count: 'nb employes', city: 'ville', address: 'adresse',
              catchment_area: 'zone', main_products: 'produits/services', price_range: 'gamme de prix',
              unique_selling_points: 'points forts', competitors: 'concurrents', target_audience: 'cible',
              ideal_customer_profile: 'profil client ideal', customer_pain_points: 'problemes clients',
              brand_tone: 'ton de marque', visual_style: 'style visuel', brand_colors: 'couleurs',
              business_goals: 'objectifs business', marketing_goals: 'objectifs marketing',
              website_url: 'site web', instagram_handle: 'Instagram', tiktok_handle: 'TikTok',
              facebook_url: 'Facebook', google_maps_url: 'Google Maps',
              phone: 'telephone', email: 'email', horaires_ouverture: 'horaires',
              specialite: 'specialite', posting_frequency: 'frequence', monthly_budget: 'budget',
            };
            const extracted = d.fields_extracted.map((f: string) => fieldLabels[f] || f).join(', ');
            const count = d.fields_extracted.length;
            setMessages(prev => [...prev, {
              id: `file_${Date.now()}`,
              role: 'assistant',
              content: `\u2705 Parfait ! J'ai analyse ton fichier "${fl[i].name}" et j'ai rempli ${count} champs de ton profil :\n\n**${extracted}**\n\nTon dossier est a jour et tous les agents y ont acces immediatement !`,
              created_at: new Date().toISOString(),
            }]);
            setChatOpen(true);
          } else if (!d.dossier_updated) {
            // File uploaded but nothing extracted — notify user
            setMessages(prev => [...prev, {
              id: `file_${Date.now()}`,
              role: 'assistant',
              content: `J'ai bien recu ton fichier "${fl[i].name}". Je n'ai pas pu en extraire d'infos pour ton profil — tu peux me les donner directement dans le chat !`,
              created_at: new Date().toISOString(),
            }]);
            setChatOpen(true);
          }
        }
      } catch {}
    } setUploading(false);
  }, [agentId]);

  const handleDeleteFile = useCallback(async (fid: string) => {
    try { await fetch(`/api/agents/agent-files?id=${fid}&agent_id=${agentId}`, { method: 'DELETE', credentials: 'include' }); setFiles(p => p.filter(f => f.id !== fid)); } catch {}
  }, [agentId]);

  // ─── Derived ──────────────────────────────────────────
  const dn = agent?.displayName || agentInfo?.name || agentId;
  const title = agent?.title || agentInfo?.title || '';
  const gf = agent?.gradientFrom || agentInfo?.gradient_from || '#8b5cf6';
  const gt = agent?.gradientTo || agentInfo?.gradient_to || '#6d28d9';
  const av = agentInfo?.avatar_3d_url || agentInfo?.avatar_url || null;
  const icon = agent?.icon || '\uD83E\uDD16';
  const desc = agent?.description || '';

  // ─── Planning mock data (from tasks/activities) ───────
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - d.getDay() + 1 + i);
    return d;
  });

  // ─── Loading ──────────────────────────────────────────
  if (pageLoading) return (
    <div className="min-h-screen bg-[#0c1a3a] pt-16 flex items-center justify-center">
      <div className="text-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400 mx-auto mb-4" /><p className="text-white/60 text-sm">Chargement...</p></div>
    </div>
  );

  const settingFields = getAgentSettings(agentId);

  // ─── RENDER ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0c1a3a] pt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:pb-8">

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/assistant')} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 shadow-lg" style={{ background: `linear-gradient(135deg, ${gf}, ${gt})`, padding: '2.5px' }}>
            <div className="w-full h-full rounded-2xl overflow-hidden bg-gray-900 flex items-center justify-center">
              {av ? <img src={av} alt={dn} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} /> : <span className="text-2xl">{icon}</span>}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-xl lg:text-2xl leading-tight">{dn}</h1>
            <p className="text-white/50 text-sm">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-green-500/15 border border-green-500/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-300 text-[10px] font-medium">Actif</span>
            </div>
            <button
              onClick={() => {
                try {
                  sessionStorage.setItem('keiro_wizard_active', 'true');
                  sessionStorage.setItem('keiro_wizard_agent', agentId);
                  sessionStorage.setItem('keiro_wizard_next', '0');
                  sessionStorage.setItem('keiro_wizard_total', '1');
                  sessionStorage.setItem('keiro_wizard_agents', JSON.stringify([agentId]));
                  window.location.reload();
                } catch {}
              }}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/40 hover:text-white/70 transition"
              title="Voir le tutoriel"
            >
              <span className="text-[10px] font-bold">i</span>
            </button>
            <button onClick={() => setChatOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Chat
            </button>
          </div>
        </div>

        {/* Agent tutorial overlay (appears during wizard) */}
        <AgentTutorial agentId={agentId} />

        {/* ═══ TABS ═══ */}
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10 mb-6 overflow-x-auto">
          {([
            { key: 'dashboard' as const, label: 'Dashboard', icon: '\uD83D\uDCCA' },
            ...(agentId === 'onboarding' ? [{ key: 'profile' as const, label: 'Mon profil', icon: '\uD83D\uDCCB' }] : []),
            { key: 'campaigns' as const, label: 'Campagnes', icon: '\u{1F3AF}' },
            { key: 'planning' as const, label: 'Planning', icon: '\uD83D\uDCC5' },
            { key: 'history' as const, label: 'Historique', icon: '\u26A1' },
            { key: 'settings' as const, label: 'Parametres', icon: '\u2699\uFE0F' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-white shadow-md'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
              style={activeTab === tab.key ? { background: `linear-gradient(135deg, ${gf}, ${gt})` } : undefined}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ TAB: DASHBOARD ═══ */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px] gap-4">
            <div className="space-y-4 min-w-0">
              {/* Setup guide removed — PreviewBanner in each agent panel handles this */}

              {hasDashboard && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                  {dashboardLoading ? (
                    <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto" /></div>
                  ) : agentId === 'commercial' ? (
                    <CrmDashboard data={dashboardData || { prospects: [], activities: [], pipeline: {}, stats: { total: 0, hot: 0, warm: 0, cold: 0, converted: 0, conversionRate: 0 } }} />
                  ) : agentId === 'onboarding' ? (
                    <OnboardingDossier />
                  ) : agentId === 'qa' ? (
                    <div className="p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-white font-bold text-sm">{'\u{1F9EA}'} QA Agent — Tests clients</h3>
                        <div className="flex gap-2">
                          <a href="/admin/qa" className="px-3 py-1.5 bg-white/10 text-white text-[10px] font-medium rounded-lg hover:bg-white/15">Dashboard QA</a>
                        </div>
                      </div>

                      {/* Quick launch buttons */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                          { group: 'full', label: 'Tout tester', icon: '\u{1F9EA}', color: 'from-purple-600 to-blue-600' },
                          { group: 'quick', label: 'Test rapide', icon: '\u26A1', color: 'from-amber-600 to-orange-600' },
                          { group: 'agents', label: 'Agents', icon: '\u{1F916}', color: 'from-green-600 to-emerald-600' },
                          { group: 'content', label: 'Contenu', icon: '\u{1F3A8}', color: 'from-pink-600 to-rose-600' },
                          { group: 'acquisition', label: 'Acquisition', icon: '\u{1F4C8}', color: 'from-blue-600 to-cyan-600' },
                          { group: 'infrastructure', label: 'Infra', icon: '\u{1F527}', color: 'from-slate-600 to-neutral-600' },
                          { group: 'library', label: 'Galerie', icon: '\u{1F4DA}', color: 'from-indigo-600 to-violet-600' },
                        ].map(btn => (
                          <button
                            key={btn.group}
                            onClick={async () => {
                              setQaRunning(true);
                              try {
                                const res = await fetch(`/api/qa?group=${btn.group}`);
                                const data = await res.json();
                                setQaResult(data);
                              } catch {} finally { setQaRunning(false); }
                            }}
                            disabled={qaRunning}
                            className={`px-3 py-3 bg-gradient-to-r ${btn.color} text-white text-xs font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all text-center`}
                          >
                            <span className="text-lg block mb-1">{btn.icon}</span>
                            {btn.label}
                          </button>
                        ))}
                      </div>

                      {qaRunning && (
                        <div className="text-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto mb-3" />
                          <p className="text-white/50 text-sm">Tests en cours...</p>
                        </div>
                      )}

                      {qaResult && !qaRunning && (
                        <>
                          {/* Summary */}
                          <div className={`rounded-xl p-4 ${qaResult.status === 'pass' ? 'bg-emerald-500/10 border border-emerald-500/20' : qaResult.status === 'warn' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-white font-bold text-sm">{qaResult.status === 'pass' ? '\u2705' : qaResult.status === 'warn' ? '\u26A0\uFE0F' : '\u{1F6A8}'} {qaResult.status.toUpperCase()}</span>
                              <span className="text-white/50 text-xs">{qaResult.summary.pass}/{qaResult.summary.total} OK | {qaResult.summary.duration_ms}ms</span>
                            </div>
                          </div>

                          {/* Checks */}
                          <div className="space-y-1 max-h-96 overflow-y-auto">
                            {qaResult.checks.map((c: any, i: number) => (
                              <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${c.status === 'pass' ? 'bg-white/[0.02]' : c.status === 'warn' ? 'bg-amber-500/5' : 'bg-red-500/5'}`}>
                                <span className="flex-shrink-0">{c.status === 'pass' ? '\u2713' : c.status === 'warn' ? '!' : '\u2717'}</span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-white/80 font-medium">{c.name}</span>
                                  <span className="text-white/40 ml-2">{c.message}</span>
                                  {c.fix && <p className="text-purple-400 text-[10px] mt-0.5">Fix: {c.fix}</p>}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Copy report button */}
                          <button
                            onClick={() => {
                              const lines = [`# QA KeiroAI — ${qaResult.status.toUpperCase()}`, `${qaResult.summary.pass}/${qaResult.summary.total} OK | ${qaResult.summary.duration_ms}ms\n`];
                              qaResult.checks.forEach((c: any) => { lines.push(`${c.status === 'pass' ? '[OK]' : c.status === 'warn' ? '[WARN]' : '[FAIL]'} ${c.name}: ${c.message}${c.fix ? ` | Fix: ${c.fix}` : ''}`); });
                              navigator.clipboard.writeText(lines.join('\n'));
                            }}
                            className="w-full px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15 transition-all"
                          >
                            {'\u{1F4CB}'} Copier le rapport
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <AgentDashboard agentId={agentId} agentName={dn} gradientFrom={gf} gradientTo={gt} data={{...(dashboardData?.data || dashboardData || {}), connections: dashboardData?.connections}} />
                  )}
                </div>
              )}
              {/* Quick actions */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Actions rapides
                </h3>
                <div className="flex flex-wrap gap-2">
                  {getAgentSuggestions(agentId).map(s => (
                    <button key={s} onClick={() => { setInput(s); setChatOpen(true); }} className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/60 text-xs transition-all">{s}</button>
                  ))}
                </div>
              </div>
            </div>
            {/* Compact sidebar — messages count + file upload (only for Clara, Finance, Prospection, CEO, AMI) */}
            <div className="hidden lg:block space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-center">
                  <div className="text-white font-bold text-xl">{messages.length}</div>
                  <div className="text-white/30 text-[9px]">Messages</div>
                </div>
              </div>
              {['onboarding', 'finance', 'comptable', 'commercial', 'ceo', 'marketing'].includes(agentId) && (
                <>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-white/20 hover:border-white/30 rounded-xl p-2 text-center cursor-pointer transition-all"
                  >
                    <input ref={fileInputRef} type="file" className="hidden" multiple onChange={e => handleFileUpload(e.target.files)} />
                    <span className="text-white/30 text-[10px]">{uploading ? 'Upload...' : '+ Fichier'}</span>
                  </div>
                  {files.slice(0, 3).map(f => (
                    <div key={f.id} className="text-[9px] text-white/30 truncate px-1">{f.name}</div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: PLANNING ═══ */}
        {activeTab === 'planning' && (
          <div className="space-y-6">
            {/* Weekly planner */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-sm">{'\uD83D\uDCC5'} Planning de la semaine</h3>
                <span className="text-white/30 text-xs">Semaine du {weekDays[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {weekDays.map((day, i) => {
                  const isToday = day.toDateString() === today.toDateString();
                  const isPast = day < today && !isToday;
                  const dayTasks = tasks.filter(t => {
                    const td = new Date(t.created_at);
                    return td.toDateString() === day.toDateString();
                  });
                  return (
                    <div key={i} className={`rounded-xl p-3 min-h-[120px] transition-all ${isToday ? 'bg-purple-600/15 border border-purple-500/30' : isPast ? 'bg-white/[0.02] border border-white/5' : 'bg-white/[0.04] border border-white/10'}`}>
                      <div className={`text-center mb-2 ${isToday ? 'text-purple-300' : 'text-white/40'}`}>
                        <div className="text-[10px] font-semibold uppercase">{DAYS[i]}</div>
                        <div className={`text-lg font-bold ${isToday ? 'text-purple-300' : 'text-white/60'}`}>{day.getDate()}</div>
                      </div>
                      {dayTasks.length > 0 ? (
                        <div className="space-y-1">
                          {dayTasks.slice(0, 3).map((t, j) => (
                            <div key={j} className={`text-[9px] px-1.5 py-1 rounded-md truncate ${t.status === 'success' ? 'bg-green-500/15 text-green-300' : t.status === 'pending' ? 'bg-amber-500/15 text-amber-300' : 'bg-white/10 text-white/50'}`}>
                              {t.description?.substring(0, 30) || t.type || 'Tache'}
                            </div>
                          ))}
                          {dayTasks.length > 3 && <div className="text-[8px] text-white/30 text-center">+{dayTasks.length - 3} autres</div>}
                        </div>
                      ) : (
                        <div className="text-[9px] text-white/15 text-center mt-2">{isPast ? 'Aucune' : '\u2014'}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scheduled actions */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-white font-bold text-sm mb-3">{'\uD83D\uDD52'} Prochaines actions programmees</h3>
              {settings.mode === 'auto' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.04] rounded-xl">
                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    <div className="flex-1 min-w-0"><div className="text-white text-xs font-medium">Mode automatique actif</div><div className="text-white/40 text-[10px]">{dn} execute les taches selon votre parametrage</div></div>
                    <span className="text-green-400 text-[10px] font-medium px-2 py-0.5 bg-green-500/15 rounded-full">Auto</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-white/30 text-xs mb-2">Aucune action programmee</p>
                  <button onClick={() => setChatOpen(true)} className="text-purple-400 text-xs font-medium hover:text-purple-300 transition-colors">
                    Demander a {dn} de planifier {'\u2192'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: HISTORY ═══ */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">{'\u26A1'} Actions effectuees par {dn}</h3>
              <span className="text-white/30 text-xs">{tasks.length} action{tasks.length !== 1 ? 's' : ''}</span>
            </div>

            {tasksLoading ? (
              <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>
            ) : tasks.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
                <div className="text-3xl mb-3">{icon}</div>
                <p className="text-white/40 text-sm mb-1">Aucune action pour le moment</p>
                <p className="text-white/20 text-xs">Discutez avec {dn} pour lancer des actions</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task, i) => (
                  <div key={task.id || i} className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${
                      task.status === 'success' ? 'bg-green-500/20 text-green-400' : task.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/40'
                    }`}>
                      {task.status === 'success' ? '\u2713' : task.status === 'error' ? '\u2717' : '\u2022'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-medium">{task.description || task.type || 'Action'}</div>
                      {task.result && <div className="text-white/40 text-[10px] mt-0.5 truncate">{task.result}</div>}
                      <div className="text-white/20 text-[10px] mt-1">{formatDateTime(task.created_at)}</div>
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full flex-shrink-0 ${
                      task.status === 'success' ? 'bg-green-500/15 text-green-400' : task.status === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-white/40'
                    }`}>
                      {task.status === 'success' ? 'Termine' : task.status === 'error' ? 'Erreur' : task.status || 'En cours'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: MON PROFIL (Clara only) ═══ */}
        {activeTab === 'profile' && agentId === 'onboarding' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <OnboardingDossier />
          </div>
        )}

        {/* ═══ TAB: CAMPAIGNS ═══ */}
        {activeTab === 'campaigns' && (
          <div className="max-w-5xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-sm">{'\u{1F3AF}'} Campagnes de {dn}</h3>
                <p className="text-white/40 text-xs mt-0.5">Lance des actions, suis leur progression</p>
              </div>
              <button
                onClick={() => { setChatOpen(true); setInput(`Lance une nouvelle campagne pour `); }}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl"
              >
                + Nouvelle campagne
              </button>
            </div>

            {/* Active campaigns from agent_logs */}
            <div className="space-y-3">
              {tasks.length > 0 ? tasks.filter(t => t.type !== 'heartbeat').slice(0, 20).map((task, i) => (
                <div key={task.id || i} className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${task.status === 'success' ? 'bg-emerald-400' : task.status === 'error' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium">{task.description || task.type || 'Action'}</p>
                      {task.result && <p className="text-white/40 text-[10px] mt-0.5 truncate">{task.result}</p>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${
                      task.status === 'success' ? 'bg-emerald-500/15 text-emerald-400' : task.status === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                    }`}>
                      {task.status === 'success' ? 'Termine' : task.status === 'error' ? 'Echec' : 'En cours'}
                    </span>
                    <span className="text-white/20 text-[9px]">{task.created_at ? new Date(task.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                </div>
              )) : (
                <div className="text-center py-12">
                  <p className="text-4xl mb-3">{'\u{1F3AF}'}</p>
                  <p className="text-white/50 text-sm">Aucune campagne en cours</p>
                  <p className="text-white/30 text-xs mt-1">Demande a {dn} de lancer une action via le chat</p>
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="rounded-xl bg-gradient-to-r from-purple-600/10 to-blue-600/10 border border-purple-500/20 p-4">
              <p className="text-purple-300 text-xs font-semibold mb-2">Actions rapides</p>
              <div className="flex flex-wrap gap-2">
                {getAgentSuggestions(agentId).map(s => (
                  <button key={s} onClick={() => { setInput(s); setChatOpen(true); }} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 text-[10px] transition-all">{s}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB: SETTINGS ═══ */}
        {activeTab === 'settings' && (
          <div className="max-w-5xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-sm">{'\u2699\uFE0F'} Parametrage de {dn}</h3>
                <p className="text-white/40 text-xs mt-0.5">Configurez le comportement de l&apos;agent selon vos besoins</p>
              </div>
              <button
                onClick={handleSaveSettings}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
                  settingsSaved
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                }`}
              >
                {settingsSaved ? '\u2713 Sauvegarde !' : 'Sauvegarder'}
              </button>
            </div>

            {/* Recommended badge */}
            <div className="rounded-xl bg-gradient-to-r from-purple-600/10 to-blue-600/10 border border-purple-500/20 px-4 py-3 flex items-center gap-3">
              <span className="text-lg">{'\uD83D\uDCA1'}</span>
              <div className="flex-1">
                <div className="text-purple-300 text-xs font-semibold">Parametrage recommande actif</div>
                <div className="text-white/40 text-[10px]">Basé sur votre type de business et les meilleures pratiques</div>
              </div>
            </div>

            {/* Settings fields — 2 columns on desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {settingFields.map(field => (
                <div key={field.key} className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-medium">{field.label}</div>
                      <div className="text-white/30 text-[10px] mt-0.5">{field.description}</div>
                    </div>

                    {field.type === 'toggle' && (
                      <button
                        onClick={() => setSettings(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                        className={`w-11 h-6 rounded-full flex-shrink-0 transition-all relative ${settings[field.key] ? 'bg-purple-600' : 'bg-white/15'}`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${settings[field.key] ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    )}

                    {field.type === 'select' && (
                      <select
                        value={settings[field.key] || field.default}
                        onChange={e => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 appearance-none flex-shrink-0 min-w-[140px]"
                      >
                        {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}

                    {field.type === 'time' && (
                      <input
                        type="time"
                        value={settings[field.key] || field.default}
                        onChange={e => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 flex-shrink-0"
                      />
                    )}

                    {field.type === 'number' && (
                      <input
                        type="number"
                        value={settings[field.key] ?? field.default}
                        onChange={e => setSettings(prev => ({ ...prev, [field.key]: parseInt(e.target.value) || 0 }))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 flex-shrink-0 w-20 text-center"
                        min={0}
                      />
                    )}

                    {field.type === 'text' && (
                      <input
                        type="text"
                        value={settings[field.key] ?? field.default}
                        onChange={e => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.description}
                        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 flex-1 min-w-[150px]"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Customization section */}
            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h4 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                <span>{'\u{1F3A8}'}</span> Personnaliser {dn}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-[10px] font-medium mb-1.5 block">Nom personnalise</label>
                  <input type="text" value={settings.custom_name || ''} onChange={e => setSettings(prev => ({ ...prev, custom_name: e.target.value }))} placeholder={dn} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
                </div>
                <div>
                  <label className="text-white/60 text-[10px] font-medium mb-1.5 block">Couleur d&apos;accent</label>
                  <div className="flex gap-2 flex-wrap">
                    {['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#0c1a3a'].map(c => (
                      <button key={c} onClick={() => setSettings(prev => ({ ...prev, accent_color: c }))} className={`w-8 h-8 rounded-lg transition-all ${settings.accent_color === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`} style={{ background: c }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-white/60 text-[10px] font-medium mb-1.5 block">Avatar personnalise</label>
                  <div className="flex items-center gap-3">
                    {settings.custom_avatar ? (
                      <img src={settings.custom_avatar} alt="Avatar" className="w-12 h-12 rounded-full object-cover border-2 border-white/20" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-lg">{icon}</div>
                    )}
                    <label className="cursor-pointer px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white/60 text-[10px] font-medium rounded-lg transition-all">
                      Changer
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setSettings(prev => ({ ...prev, custom_avatar: ev.target?.result as string }));
                        };
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                    {settings.custom_avatar && (
                      <button onClick={() => setSettings(prev => ({ ...prev, custom_avatar: undefined }))} className="text-[10px] text-red-400 hover:text-red-300">Retirer</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-white/60 text-[10px] font-medium mb-1.5 block">Personnalite</label>
                  <select value={settings.personality || 'default'} onChange={e => setSettings(prev => ({ ...prev, personality: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/50">
                    <option value="default">Par defaut</option>
                    <option value="formal">Professionnel (vouvoiement)</option>
                    <option value="casual">Decontracte (tutoiement)</option>
                    <option value="fun">Fun et energique</option>
                    <option value="premium">Premium et sobre</option>
                  </select>
                </div>
                <div>
                  <label className="text-white/60 text-[10px] font-medium mb-1.5 block">Emoji</label>
                  <input type="text" value={settings.custom_emoji || ''} onChange={e => setSettings(prev => ({ ...prev, custom_emoji: e.target.value.slice(0, 2) }))} placeholder={icon} className="w-16 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-lg text-center focus:outline-none focus:ring-1 focus:ring-purple-500/50" maxLength={2} />
                </div>
              </div>
            </div>

            {/* Integration section for embeddable agents */}
            {(() => {
              const integrations: Record<string, { title: string; description: string; code: string; note?: string }> = {
                content: {
                  title: 'Connecter Instagram & TikTok',
                  description: 'Lena publie automatiquement sur tes reseaux. Connecte tes comptes pour activer la publication auto.',
                  code: 'Va dans Mon compte → Reseaux sociaux → Connecter Instagram / TikTok',
                  note: 'Une fois connecte, Lena publie 3x/jour automatiquement selon ton calendrier editorial',
                },
                dm_instagram: {
                  title: 'Connecter Instagram pour les DMs',
                  description: 'Jade envoie et recoit des DMs Instagram en ton nom. Connecte ton compte pour activer la prospection DM.',
                  code: 'Va dans Mon compte → Reseaux sociaux → Connecter Instagram',
                  note: 'Les DMs sont prepares par l\'IA et envoyes automatiquement. Tu peux repondre depuis KeiroAI.',
                },
                marketing: {
                  title: 'Connecter Instagram & TikTok Analytics',
                  description: 'Ami analyse tes performances sur tous tes reseaux. Connecte tes comptes pour des insights detailles.',
                  code: 'Va dans Mon compte → Reseaux sociaux → Connecter Instagram / TikTok',
                  note: 'Ami analyse automatiquement tes likes, reach, engagement et te donne des recommandations',
                },
                commercial: {
                  title: 'Connecter Google Maps pour la prospection',
                  description: 'Leo trouve des prospects sur Google Maps dans ta zone. Active la prospection automatique.',
                  code: 'La prospection Google Maps est activee automatiquement. Configure ta zone dans les parametres ci-dessus.',
                },
                seo: {
                  title: 'Connecter ton site web pour le SEO',
                  description: 'Oscar optimise le referencement de ton site. Ajoute ton URL pour commencer.',
                  code: 'Renseigne ton site web dans ton profil (Clara → Mon profil) et Oscar commencera a analyser ton SEO.',
                },
                ads: {
                  title: 'Connecter Meta Ads & Google Ads',
                  description: 'Felix cree et optimise tes campagnes publicitaires. Connecte tes comptes pub pour commencer.',
                  code: 'Va dans Mon compte → Integrations → Connecter Meta Ads / Google Ads',
                  note: 'Felix gere ton budget pub automatiquement et optimise ton ROAS',
                },
                tiktok_comments: {
                  title: 'Connecter TikTok',
                  description: 'Axel engage ta communaute TikTok automatiquement. Connecte ton compte pour activer.',
                  code: 'Va dans Mon compte → Reseaux sociaux → Connecter TikTok',
                },
                comptable: {
                  title: 'Connecter Stripe pour le suivi financier',
                  description: 'Louis suit tes revenus et depenses automatiquement. Stripe est connecte par defaut avec ton abonnement.',
                  code: 'Le suivi financier est actif automatiquement via ton abonnement KeiroAI.',
                },
                chatbot: {
                  title: 'Integrer Max (Chatbot) sur ton site',
                  description: 'Max accueille tes visiteurs 24/7, repond a leurs questions et capture leurs coordonnees. Colle ce code avant </body> :',
                  code: `<script src="https://keiroai.com/embed/widget.js" data-key="VOTRE_CLE" data-agent="chatbot" data-color="${gf}"></script>`,
                },
                onboarding: {
                  title: 'Integrer Clara sur ton site e-commerce',
                  description: 'Clara guide tes clients dans leur parcours d\'achat, recommande des produits et pousse a la conversion. Colle ce code avant </body> :',
                  code: `<script src="https://keiroai.com/embed/widget.js" data-key="VOTRE_CLE" data-agent="onboarding" data-color="${gf}"></script>`,
                },
                email: {
                  title: 'Formulaire de capture email',
                  description: 'Ajoute un formulaire sur ton site pour capturer les emails de tes visiteurs. Hugo les ajoutera automatiquement a tes sequences email.',
                  code: `<form action="https://keiroai.com/api/widget/lead" method="POST" style="display:flex;gap:8px">
  <input type="hidden" name="widget_key" value="VOTRE_CLE" />
  <input type="email" name="email" placeholder="Ton email" required style="padding:10px 16px;border:1px solid #ddd;border-radius:8px;flex:1" />
  <button type="submit" style="padding:10px 20px;background:${gf};color:white;border:none;border-radius:8px;cursor:pointer">S'inscrire</button>
</form>`,
                },
                whatsapp: {
                  title: 'Bouton WhatsApp sur ton site',
                  description: 'Ajoute un bouton WhatsApp flottant. Tes visiteurs peuvent te contacter directement et Stella repond automatiquement.',
                  code: `<a href="https://wa.me/VOTRE_NUMERO?text=Bonjour%20!" target="_blank" style="position:fixed;bottom:20px;right:90px;z-index:9999;width:56px;height:56px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3)">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
</a>`,
                  note: 'Remplace VOTRE_NUMERO par ton numero WhatsApp au format international (ex: 33612345678)',
                },
                gmaps: {
                  title: 'QR Code pour les avis Google',
                  description: 'Imprime ce QR code et affiche-le a la caisse, sur les tables ou sur les sacs. Tes clients scannent et laissent un avis Google en 30 secondes.',
                  code: `<div style="text-align:center;padding:20px">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=VOTRE_LIEN_GOOGLE_AVIS" alt="QR Code Avis Google" style="width:200px;border-radius:12px" />
  <p style="margin-top:8px;font-size:14px;color:#333">Scannez pour laisser un avis !</p>
</div>`,
                  note: 'Remplace VOTRE_LIEN_GOOGLE_AVIS par le lien de ta fiche Google Maps → "Ecrire un avis"',
                },
              };

              const config = integrations[agentId];
              if (!config) return null;

              // Replace VOTRE_CLE with actual widget key
              const displayCode = widgetKey ? config.code.replace(/VOTRE_CLE/g, widgetKey) : config.code;

              return (
                <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                    <span>{'\u{1F517}'}</span> {config.title}
                  </h4>
                  <p className="text-white/40 text-xs mb-4">{config.description}</p>
                  <div className="bg-black/30 rounded-lg p-3 font-mono text-[11px] text-green-400 break-all select-all cursor-text whitespace-pre-wrap">
                    {displayCode}
                  </div>
                  {config.note && (
                    <p className="text-amber-400/70 text-[10px] mt-2 flex items-center gap-1">
                      <span>{'\u26A0\uFE0F'}</span> {config.note}
                    </p>
                  )}
                  {/* Only show widget key for embeddable agents (chatbot, onboarding, email, whatsapp, gmaps) */}
                  {['chatbot', 'onboarding', 'email', 'whatsapp', 'gmaps'].includes(agentId) && (
                    <>
                      {widgetKey && (
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-white/30 text-[10px]">Ta cle :</span>
                          <code className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded font-mono select-all">{widgetKey}</code>
                          <button onClick={() => navigator.clipboard.writeText(widgetKey)} className="text-[10px] text-white/40 hover:text-white/60">Copier</button>
                        </div>
                      )}
                      {!widgetKey && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/widget/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ agent_type: agentId === 'onboarding' ? 'onboarding' : 'chatbot' }) });
                              const d = await res.json();
                              if (d.widget?.widget_key) setWidgetKey(d.widget.widget_key);
                            } catch {}
                          }}
                          className="mt-3 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-xl"
                        >
                          Generer ma cle d&apos;integration
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ═══ FLOATING CHAT BUTTON ═══ */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)} className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full shadow-2xl hover:scale-105 flex items-center justify-center transition-all lg:bottom-8 lg:right-8" style={{ background: `linear-gradient(135deg, ${gf}, ${gt})` }}>
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          {messages.length > 0 && <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-green-400 border-2 border-[#0c1a3a] flex items-center justify-center"><span className="text-[8px] text-green-900 font-bold">{messages.length}</span></div>}
        </button>
      )}

      {/* ═══ CHAT SLIDE-OVER ═══ */}
      {chatOpen && (
        <>
          {isMobile && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setChatOpen(false)} />}
          <div className={`fixed z-50 flex flex-col ${isMobile ? 'inset-0' : 'top-20 right-4 bottom-4 w-[420px] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden'}`} style={{ animation: 'slideIn 0.25s ease-out' }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: `linear-gradient(135deg, ${gf}, ${gt})` }}>
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/15">
                {av ? <img src={av} alt={dn} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} /> : <span className="text-lg">{icon}</span>}
              </div>
              <div className="flex-1 min-w-0"><h3 className="text-white font-semibold text-sm">{dn}</h3><div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-400" /><span className="text-white/60 text-[10px]">En ligne</span></div></div>
              <button onClick={() => setChatOpen(false)} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0a1628]">
              {messages.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: `linear-gradient(135deg, ${gf}40, ${gt}40)` }}><span className="text-3xl">{icon}</span></div>
                  <h4 className="text-white font-semibold text-sm mb-1">Discute avec {dn}</h4>
                  <p className="text-white/50 text-xs max-w-[260px]">{desc}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 justify-center">{getAgentSuggestions(agentId).map(s => <button key={s} onClick={() => setInput(s)} className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/50 text-[10px] hover:bg-white/10">{s}</button>)}</div>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[85%]">
                    <div className={`rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${msg.role === 'user' ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-sm' : 'bg-white/[0.07] text-white/90 rounded-bl-sm border border-white/5'}`}>
                      {msg.role === 'assistant' ? renderContent(msg.content) : msg.content.split('\n').map((l, j) => <p key={j} className={j > 0 ? 'mt-1' : ''}>{l}</p>)}
                    </div>
                    <p className={`text-[9px] mt-0.5 ${msg.role === 'user' ? 'text-right' : ''} text-white/20`}>{new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
              {isLoading && <div className="flex justify-start"><div className="bg-white/[0.07] rounded-xl px-4 py-3 rounded-bl-sm"><div className="flex gap-1.5"><div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" /><div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} /><div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} /></div></div></div>}
              <div ref={messagesEndRef} />
            </div>
            {/* Input */}
            <div className="border-t border-white/10 bg-[#0f1f3d] p-3 flex-shrink-0">
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={input} onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={`Message a ${dn}...`} rows={1} className="flex-1 px-3 py-2.5 border border-white/15 rounded-xl text-[13px] text-white placeholder-white/35 bg-white/5 focus:ring-2 focus:ring-purple-500/50 outline-none resize-none" style={{ maxHeight: 100 }} disabled={isLoading} />
                <button onClick={toggleVoiceInput} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-white/10 hover:bg-white/20'}`} title={isRecording ? 'Arreter' : 'Dicter'}>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" /></svg>
                </button>
                <button onClick={handleSend} disabled={isLoading || !input.trim()} className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white flex items-center justify-center disabled:opacity-30 transition-all flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}
