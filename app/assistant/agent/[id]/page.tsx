'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/context';
import dynamic from 'next/dynamic';
import type { ClientAgent } from '@/lib/agents/client-context';
import { CLIENT_AGENTS } from '@/lib/agents/client-context';
import UpsellBanner from '@/app/components/UpsellBanner';

const CrmDashboard = dynamic(() => import('./components/CrmDashboard'), { ssr: false });
const AgentDashboard = dynamic(() => import('./components/AgentDashboard'), { ssr: false });
const OnboardingDossier = dynamic(() => import('./components/OnboardingDossier'), { ssr: false });
const AgentSetupGuide = dynamic(() => import('../../components/AgentSetupGuide'), { ssr: false });
const AgentTutorial = dynamic(() => import('./components/AgentTutorial'), { ssr: false });
const CampaignWizard = dynamic(() => import('./components/CampaignWizard'), { ssr: false });
const AgentDocuments = dynamic(() => import('./components/AgentDocuments'), { ssr: false });
const DocumentEditor = dynamic(() => import('./components/DocumentEditor'), { ssr: false });
const SpreadsheetEditor = dynamic(() => import('./components/SpreadsheetEditor'), { ssr: false });

const AGENTS_WITH_DASHBOARD = [
  'marketing', 'commercial', 'email', 'content', 'seo', 'ads', 'comptable',
  'rh', 'onboarding', 'dm_instagram', 'tiktok_comments', 'gmaps', 'chatbot', 'whatsapp', 'linkedin',
  'ceo', 'qa',
];

// ─── Types ─────────────────────────────────────────────────

interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; created_at: string; }
interface AgentInfo { name: string; avatar_url: string; avatar_3d_url: string; title: string; gradient_from: string; gradient_to: string; }
interface UploadedFile { id: string; name: string; size: number; uploaded_at: string; url?: string; }
interface AgentTask { id: string; type: string; description: string; status: string; result?: string; created_at: string; agent?: string; }

// ─── Agent settings config per role ─────────────────────────

interface SettingField { key: string; label: string; type: 'toggle' | 'select' | 'time' | 'number' | 'text' | 'header'; options?: { value: string; label: string }[]; default: any; description: string; }

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
      { key: 'signature', label: 'Type de signature', type: 'select', options: [{ value: 'custom', label: 'Nom personnalisé' }, { value: 'founder', label: 'Nom du fondateur (profil)' }, { value: 'company', label: 'Nom de l\'entreprise' }, { value: 'team', label: 'L\'equipe + entreprise' }], default: 'founder', description: 'Comment signer les emails' },
      { key: 'signature_name', label: 'Nom de signature personnalisé', type: 'text', default: '', description: 'Ex: Marie de MonBusiness. Utilise quand le type est "Nom personnalisé"' },
      // Ciblage
      { key: 'target_types', label: 'Types de commerce cibles', type: 'select', options: [{ value: 'all', label: 'Tous' }, { value: 'restaurant', label: 'Restaurants' }, { value: 'boutique', label: 'Boutiques' }, { value: 'coach', label: 'Coaches' }, { value: 'beauty', label: 'Beaute/Coiffure' }], default: 'all', description: 'Cibler un type specifique de prospect' },
      { key: 'min_score', label: 'Score minimum', type: 'number', default: 0, description: 'N\'envoyer qu\'aux prospects avec ce score minimum' },
      // Reponses
      { key: 'auto_reply_positive', label: 'Auto-reponse (positif)', type: 'toggle', default: false, description: 'Repondre automatiquement aux reponses positives' },
      { key: 'auto_reply_neutral', label: 'Auto-reponse (neutre)', type: 'toggle', default: true, description: 'Repondre automatiquement aux accuses de reception' },
      { key: 'stop_on_negative', label: 'Stop si negatif', type: 'toggle', default: true, description: 'Arreter la sequence si le prospect repond negativement' },
    ],
    content: [
      // ── Instagram ──
      { key: '_header_ig', label: '\u{1F4F8} Instagram', type: 'header', default: '', description: '' },
      { key: 'posts_per_day_ig', label: 'Posts/jour', type: 'number', default: 3, description: 'Publications Instagram par jour' },
      { key: 'formats_ig', label: 'Formats preferes', type: 'select', options: [{ value: 'all', label: 'Tous (posts, reels, stories, carrousels)' }, { value: 'reels', label: 'Reels/Videos' }, { value: 'stories', label: 'Stories' }, { value: 'carousel', label: 'Carrousels' }, { value: 'static', label: 'Photos' }], default: 'all', description: 'Types de contenu Instagram' },
      { key: 'stories_enabled', label: 'Stories', type: 'toggle', default: true, description: 'Publier des stories pour plus de visibilite' },
      { key: 'use_hashtags', label: 'Hashtags', type: 'toggle', default: true, description: 'Ajouter des hashtags pertinents' },
      { key: 'max_hashtags', label: 'Max hashtags', type: 'number', default: 15, description: 'Nombre max par post' },
      // ── TikTok ──
      { key: '_header_tt', label: '\u{1F3B5} TikTok', type: 'header', default: '', description: '' },
      { key: 'posts_per_day_tt', label: 'Videos/jour', type: 'number', default: 1, description: 'Videos TikTok par jour' },
      { key: 'formats_tt', label: 'Style video', type: 'select', options: [{ value: 'all', label: 'Mix (face cam + montage)' }, { value: 'facecam', label: 'Face camera' }, { value: 'montage', label: 'Montage/B-roll' }, { value: 'slideshow', label: 'Slideshow' }], default: 'all', description: 'Type de videos TikTok' },
      { key: 'tt_trend_surfing', label: 'Surf tendances TikTok', type: 'toggle', default: true, description: 'Surfer sur les sons et trends du moment' },
      // ── LinkedIn ──
      { key: '_header_li', label: '\u{1F4BC} LinkedIn', type: 'header', default: '', description: '' },
      { key: 'posts_per_day_li', label: 'Posts/jour', type: 'number', default: 2, description: 'Publications LinkedIn par jour' },
      { key: 'formats_li', label: 'Format prefere', type: 'select', options: [{ value: 'all', label: 'Mix (texte + image)' }, { value: 'text', label: 'Texte seul (thought leadership)' }, { value: 'image', label: 'Image + texte' }, { value: 'carousel', label: 'Carrousel PDF' }], default: 'all', description: 'Type de posts LinkedIn' },
      { key: 'li_tone', label: 'Ton LinkedIn', type: 'select', options: [{ value: 'professional', label: 'Professionnel' }, { value: 'casual_pro', label: 'Pro decontracte' }, { value: 'expert', label: 'Expert/Thought leader' }, { value: 'storytelling', label: 'Storytelling' }], default: 'casual_pro', description: 'Style d\'ecriture LinkedIn' },
      // ── Global ──
      { key: '_header_global', label: '\u2699\uFE0F General', type: 'header', default: '', description: '' },
      { key: 'publish_hour_1', label: 'Creneau matin', type: 'time', default: '09:00', description: '1er creneau de publication' },
      { key: 'publish_hour_2', label: 'Creneau midi', type: 'time', default: '13:30', description: '2eme creneau' },
      { key: 'publish_hour_3', label: 'Creneau soir', type: 'time', default: '18:00', description: '3eme creneau' },
      { key: 'auto_publish', label: 'Publication auto', type: 'toggle', default: true, description: 'Publier sans validation manuelle' },
      { key: 'visual_style', label: 'Style visuel global', type: 'select', options: [{ value: 'brand', label: 'DA de marque' }, { value: 'modern', label: 'Moderne/Tech' }, { value: 'warm', label: 'Chaleureux/Artisanal' }, { value: 'minimal', label: 'Minimaliste' }, { value: 'bold', label: 'Bold/Colore' }], default: 'brand', description: 'Direction artistique des visuels (toutes plateformes)' },
      { key: 'caption_style', label: 'Style legendes', type: 'select', options: [{ value: 'short', label: 'Court' }, { value: 'medium', label: 'Moyen' }, { value: 'long', label: 'Long (storytelling)' }], default: 'medium', description: 'Longueur des legendes' },
      { key: 'trend_surfing', label: 'Surf tendances global', type: 'toggle', default: true, description: 'Contenu base sur les tendances du moment' },
    ],
    dm_instagram: [
      { key: 'max_dms_day', label: 'Max DMs/jour', type: 'number', default: 50, description: 'Limite de DMs prepares par jour' },
      { key: 'target', label: 'Cible prioritaire', type: 'select', options: [{ value: 'new_followers', label: 'Nouveaux abonnes' }, { value: 'engaged', label: 'Utilisateurs engages' }, { value: 'prospects', label: 'Prospects CRM' }, { value: 'story_viewers', label: 'Viewers de stories' }], default: 'new_followers', description: 'A qui envoyer les DMs en priorite' },
      { key: 'auto_reply', label: 'Reponse auto DMs recus', type: 'toggle', default: true, description: 'Repondre automatiquement aux DMs entrants' },
      { key: 'dm_tone', label: 'Ton des DMs', type: 'select', options: [{ value: 'casual', label: 'Casual (ami entrepreneur)' }, { value: 'value', label: 'Value-first (conseil gratuit)' }, { value: 'direct', label: 'Direct (proposition)' }], default: 'casual', description: 'Approche des messages' },
      { key: 'first_dm_type', label: 'Premier DM', type: 'select', options: [{ value: 'compliment', label: 'Compliment sur le business' }, { value: 'question', label: 'Question ouverte' }, { value: 'story_reply', label: 'Reaction a une story' }], default: 'compliment', description: 'Comment ouvrir la conversation' },
      { key: 'include_visual', label: 'Visual personnalisé', type: 'toggle', default: true, description: 'Générer un visuel personnalisé avec le DM' },
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
      { key: 'meta_auto', label: 'Meta descriptions auto', type: 'toggle', default: true, description: 'Générer automatiquement les meta descriptions SEO' },
      { key: 'image_alt', label: 'Alt text images auto', type: 'toggle', default: true, description: 'Générer automatiquement les textes alt des images' },
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
      { key: 'first_post_auto', label: 'Premier post auto', type: 'toggle', default: true, description: 'Générer et publier le premier post automatiquement' },
      { key: 'check_frequency', label: 'Frequence check', type: 'select', options: [{ value: 'daily', label: 'Quotidien' }, { value: 'hourly', label: 'Chaque heure (J1-J3)' }], default: 'daily', description: 'A quelle frequence verifier l\'avancement' },
      { key: 'nps_after_days', label: 'NPS apres (jours)', type: 'number', default: 7, description: 'Demander un score NPS apres X jours' },
    ],
    retention: [
      { key: 'inactivity_alert_days', label: 'Alerte inactivite (jours)', type: 'number', default: 3, description: 'Jours sans connexion avant alerte' },
      { key: 'reactivation_email', label: 'Email reactivation auto', type: 'toggle', default: true, description: 'Envoyer un email de reactivation automatiquement' },
      { key: 'reactivation_offer', label: 'Offre reactivation', type: 'toggle', default: false, description: 'Inclure une offre speciale dans le mail de reactivation' },
      { key: 'milestone_notifications', label: 'Notifications milestones', type: 'toggle', default: true, description: 'Feliciter le client a chaque milestone (1er post, 1er prospect, etc.)' },
      { key: 'weekly_report', label: 'Rapport résultats hebdo', type: 'toggle', default: true, description: 'Envoyer un rapport de résultats chaque semaine' },
      { key: 'churn_prediction', label: 'Prediction churn', type: 'toggle', default: true, description: 'Detecter les signaux de depart et intervenir proactivement' },
    ],
    rh: [
      { key: 'contract_auto', label: 'Génération contrats auto', type: 'toggle', default: false, description: 'Générer automatiquement les brouillons de contrats' },
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
function _uiLoc(): string { if (typeof window === 'undefined') return 'fr-FR'; try { return localStorage.getItem('keiro_language') === 'en' ? 'en-US' : 'fr-FR'; } catch { return 'fr-FR'; } }
function formatDate(iso: string) { return new Date(iso).toLocaleDateString(_uiLoc(), { day: 'numeric', month: 'short' }); }
function formatDateTime(iso: string) { return new Date(iso).toLocaleDateString(_uiLoc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }

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

// ─── Editorial Calendar Full (Planning tab) ──────────────────
type ViewMode = 'day' | 'week' | 'month';

const STATUS_COLORS: Record<string, string> = {
  draft: 'border-amber-500/40 bg-amber-500/10',
  approved: 'border-blue-500/40 bg-blue-500/10',
  published: 'border-emerald-500/40 bg-emerald-500/10',
  // Soften 'failed' so the client doesn't see a red flag. The cron
  // retries automatically; if it stays failed long enough we'll show
  // a 'Recharger' inline action via the modal.
  publish_failed: 'border-amber-500/30 bg-amber-500/5',
  retry_pending: 'border-amber-500/30 bg-amber-500/5',
  skipped: 'border-gray-500/20 bg-gray-500/5',
  deleted_on_ig: 'border-gray-500/20 bg-gray-500/5',
};
const STATUS_DOT: Record<string, string> = {
  draft: 'bg-amber-400',
  approved: 'bg-blue-400',
  published: 'bg-emerald-400',
  publish_failed: 'bg-amber-400',
  retry_pending: 'bg-amber-400',
  skipped: 'bg-gray-400',
  deleted_on_ig: 'bg-gray-400',
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  approved: 'Programmé',
  published: 'Publié',
  publish_failed: 'En attente de relance',
  retry_pending: 'En attente de relance',
  skipped: 'En pause',
  deleted_on_ig: 'Archivé',
};
const PLATFORM_META: Record<string, { label: string; emoji: string; tag: string }> = {
  instagram: { label: 'Instagram', emoji: '\u{1F4F7}', tag: 'IG' },
  tiktok:    { label: 'TikTok',    emoji: '\u{1F3B5}', tag: 'TT' },
  linkedin:  { label: 'LinkedIn',  emoji: '\u{1F4BC}', tag: 'LI' },
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function EditorialCalendarFull({ agentId: _agentId }: { agentId: string }) {
  void _agentId;
  const { locale } = useLanguage();
  const en = locale === 'en';
  const tCal = en
    ? {
        day: 'Day', week: 'Week', month: 'Month', today: 'Today',
        status: 'STATUS', network: 'NETWORK',
        published: 'Published', scheduled: 'Scheduled', drafts: 'Drafts',
        failed: 'Failed', skipped: 'Skipped',
        noContent: "No content yet — launch a campaign to get started",
        noPostsToday: 'No posts scheduled for this day',
        disabledHint: '(TikTok / LinkedIn disabled — re-enable from the main agent panel)',
        nPosts: (n: number) => `${n} post${n > 1 ? 's' : ''}`,
        thisMonth: (n: number, last: number) => `${n} post(s) this month  (through day ${last})`,
        none: 'None',
        delete: 'Delete', publish: 'Publish', regenerate: 'Regenerate', confirmDelete: 'Delete?',
      }
    : {
        day: 'Jour', week: 'Semaine', month: 'Mois', today: "Aujourd'hui",
        status: 'STATUT', network: 'RÉSEAU',
        published: 'Publiés', scheduled: 'Programmés', drafts: 'Brouillons',
        failed: 'Échecs', skipped: 'Ignorés',
        noContent: 'Aucun contenu — lance une campagne pour commencer',
        noPostsToday: 'Aucun post programmé ce jour',
        disabledHint: '(TikTok / LinkedIn désactivés — réactiver dans le panneau principal)',
        nPosts: (n: number) => `${n} post${n > 1 ? 's' : ''}`,
        thisMonth: (n: number, last: number) => `${n} post(s) ce mois  (jusqu'au ${last})`,
        none: 'Aucune',
        delete: 'Suppr', publish: 'Publier', regenerate: 'Régénérer', confirmDelete: 'Supprimer ?',
      };
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Skipped is HIDDEN by default — those are noise (network disabled,
  // QA salvaged after retry, etc). User can opt-in via the chip.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(['draft', 'approved', 'published']));
  const [platformFilter, setPlatformFilter] = useState<Set<string>>(new Set(['instagram', 'tiktok', 'linkedin']));
  const [selected, setSelected] = useState<any>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchDays, setBatchDays] = useState<number>(7);
  const [batchMode, setBatchMode] = useState<'auto' | 'notify'>('notify');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const launchBatch = useCallback(async () => {
    setBatchBusy(true);
    setBatchResult(null);
    try {
      const platforms = Array.from(platformFilter);
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch_plan', days: batchDays, platforms, publishMode: batchMode }),
      });
      const j = await res.json();
      if (j?.ok) {
        setBatchResult(`✓ ${j.created} brouillons créés${j.failed ? ` · ${j.failed} échecs` : ''}`);
        setTimeout(() => { setBatchOpen(false); window.location.reload(); }, 1200);
      } else {
        setBatchResult(j?.error || 'Échec planification');
      }
    } catch (e: any) {
      setBatchResult(e?.message || 'Échec planification');
    } finally {
      setBatchBusy(false);
    }
  }, [batchDays, batchMode, platformFilter]);
  const [view, setView] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  // Active platforms — derived from connection state. Hides TikTok and
  // LinkedIn from filters when the client has nothing scheduled there
  // AND no connection. We treat "no posts in window" as "deactivated"
  // for the purpose of the filter chips so the UI stays clean.
  const [activePlatforms, setActivePlatforms] = useState<Set<string>>(new Set(['instagram']));

  useEffect(() => {
    fetch('/api/agents/content', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        action: 'calendar',
        startDate: ymd(new Date(Date.now() - 60 * 86400000)),
        endDate: ymd(new Date(Date.now() + 60 * 86400000)),
      }),
    }).then(r => r.json()).then(d => setPosts(d.posts || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Refresh active platform set whenever posts arrive. Instagram always
  // shown; TikTok/LinkedIn shown only if the client has any post on
  // them (active subscription) or has them connected.
  useEffect(() => {
    const seen = new Set<string>(['instagram']);
    for (const p of posts) {
      const plat = p.platform || 'instagram';
      if (PLATFORM_META[plat]) seen.add(plat);
    }
    setActivePlatforms(seen);
    // When a platform disappears from active list, also drop it from
    // the user's filter so they don't accidentally hide everything.
    setPlatformFilter(prev => {
      const next = new Set<string>();
      for (const p of prev) if (seen.has(p)) next.add(p);
      // If user filtered out everything that's still active, default to all active.
      if (next.size === 0) seen.forEach(p => next.add(p));
      return next;
    });
  }, [posts]);

  const filteredAll = useMemo(() => posts.filter(p => {
    if (!statusFilter.has(p.status)) return false;
    if (!platformFilter.has(p.platform || 'instagram')) return false;
    return true;
  }), [posts, statusFilter, platformFilter]);

  const counts = useMemo(() => ({
    draft: posts.filter(p => p.status === 'draft').length,
    approved: posts.filter(p => p.status === 'approved').length,
    published: posts.filter(p => p.status === 'published').length,
    failed: posts.filter(p => p.status === 'publish_failed').length,
    skipped: posts.filter(p => p.status === 'skipped').length,
  }), [posts]);

  // Group posts by ymd date string for fast day-cell rendering.
  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of filteredAll) {
      const key = (p.scheduled_date || ymd(new Date(p.created_at))).substring(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [filteredAll]);

  const toggleStatus = (s: string) => {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };
  const togglePlatform = (p: string) => {
    setPlatformFilter(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };

  const navigate = (delta: number) => {
    setCursor(prev => {
      const n = new Date(prev);
      if (view === 'day') n.setDate(n.getDate() + delta);
      else if (view === 'week') n.setDate(n.getDate() + 7 * delta);
      else n.setMonth(n.getMonth() + delta);
      return n;
    });
  };
  const goToday = () => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    setCursor(t);
  };

  const cursorLabel = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = view === 'month'
      ? { month: 'long', year: 'numeric' }
      : view === 'week'
        ? { day: 'numeric', month: 'short' }
        : { weekday: 'long', day: 'numeric', month: 'long' };
    if (view === 'week') {
      const start = new Date(cursor);
      start.setDate(cursor.getDate() - cursor.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString('fr-FR', opts)} – ${end.toLocaleDateString('fr-FR', opts)}`;
    }
    return cursor.toLocaleDateString('fr-FR', opts);
  }, [cursor, view]);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>;

  return (
    <div className="space-y-3">
      {/* Top bar: view switcher + nav — wraps on mobile, full-width buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white/[0.02] border border-white/10 rounded-xl p-2">
        <div className="flex items-center gap-1 flex-1 sm:flex-initial">
          {(['day', 'week', 'month'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 sm:flex-initial px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium transition ${view === v ? 'bg-purple-600 text-white shadow' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
            >
              {v === 'day' ? tCal.day : v === 'week' ? tCal.week : tCal.month}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-base flex items-center justify-center" aria-label={en ? 'Previous' : 'Précédent'}>‹</button>
            <button onClick={goToday} className="px-3 py-2 min-h-[40px] rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs whitespace-nowrap">{tCal.today}</button>
            <button onClick={() => navigate(1)} className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-base flex items-center justify-center" aria-label={en ? 'Next' : 'Suivant'}>›</button>
          </div>
          <span className="ml-2 text-[11px] sm:text-xs font-semibold text-white/90 capitalize truncate max-w-[200px]">{cursorLabel}</span>
        </div>
      </div>

      {/* Filters: status (multi-select) + platform (multi-select) */}
      <div className="flex flex-wrap items-center gap-2 bg-white/[0.02] border border-white/10 rounded-xl p-2">
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="text-[9px] font-bold text-white/60 uppercase tracking-wide mr-1">{tCal.status}</span>
          {/* Failed + skipped chips intentionally NOT shown — the
              client doesn't need to be confronted with 'échec' or
              'ignoré' badges. Failed posts are silently retried by
              the cron; skipped become reschedulable from the modal.
              We keep only the 3 forward-looking statuses. */}
          {[
            { key: 'published', label: tCal.published, count: counts.published, color: 'bg-emerald-500' },
            { key: 'approved', label: tCal.scheduled, count: counts.approved, color: 'bg-blue-500' },
            { key: 'draft', label: tCal.drafts, count: counts.draft, color: 'bg-amber-500' },
          ].map(f => {
            const active = statusFilter.has(f.key);
            return (
              <button
                key={f.key}
                onClick={() => toggleStatus(f.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition flex items-center gap-1 ${active ? f.color + ' text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white/80' : 'bg-white/40'}`} />
                {f.label}
                <span className={`text-[9px] px-1 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-white/15'}`}>{f.count}</span>
              </button>
            );
          })}
        </div>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="text-[9px] font-bold text-white/60 uppercase tracking-wide mr-1">{tCal.network}</span>
          {Array.from(activePlatforms).map(p => {
            const meta = PLATFORM_META[p];
            const active = platformFilter.has(p);
            // Per-network active colour so the user can SEE which
            // network is filtering the calendar at a glance.
            const activeStyle = p === 'instagram'
              ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white border-pink-400 shadow-lg shadow-pink-500/30'
              : p === 'tiktok'
                ? 'bg-black text-white border-fuchsia-400 shadow-lg shadow-fuchsia-500/30'
                : p === 'linkedin'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/30'
                  : 'bg-white/15 text-white border-white/30';
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`px-3 py-1.5 min-h-[36px] rounded-lg text-[11px] font-bold transition flex items-center gap-1 border ${active ? activeStyle : 'bg-white/5 text-white/70 hover:bg-white/10 border-transparent'}`}
              >
                <span>{meta?.emoji || ''}</span>
                {meta?.label || p}
              </button>
            );
          })}
          {!activePlatforms.has('tiktok') && !activePlatforms.has('linkedin') && (
            <span className="text-[9px] text-white/40 italic ml-1">{tCal.disabledHint}</span>
          )}
          <button
            onClick={() => setBatchOpen(true)}
            className="ml-auto px-3 py-1.5 min-h-[36px] rounded-lg text-[11px] font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white border border-emerald-300/40 shadow-lg shadow-emerald-500/30 transition flex items-center gap-1.5"
            title={en ? 'Plan a batch of drafts (week / month)' : 'Planifier un lot de brouillons (semaine / mois)'}
          >
            <span>{'\uD83D\uDDD3\uFE0F'}</span> {en ? 'Plan batch' : 'Planifier'}
          </button>
        </div>
      </div>

      {/* Batch planning modal */}
      {batchOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={() => !batchBusy && setBatchOpen(false)}>
          <div className="bg-gray-900 rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-black text-white mb-1">{en ? 'Plan a batch' : 'Planifier un lot'}</h3>
                <p className="text-[11px] text-white/60 leading-relaxed">{en ? 'Léna creates a stack of drafts for the next N days. Review then publish — or let auto-publish handle it.' : 'Léna crée un stack de brouillons pour les N prochains jours. Tu valides puis publies — ou tu laisses la publication auto.'}</p>
              </div>
              <button onClick={() => !batchBusy && setBatchOpen(false)} className="text-white/40 hover:text-white text-lg p-1 -mt-1">×</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-white/60 mb-1.5">{en ? 'How far ahead?' : 'Jusqu\'à quand ?'}</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[3, 7, 14, 30].map(n => (
                    <button
                      key={n}
                      onClick={() => setBatchDays(n)}
                      className={`px-2 py-2 min-h-[44px] rounded-lg text-xs font-bold transition border ${batchDays === n ? 'bg-emerald-500 text-white border-emerald-300 shadow-lg shadow-emerald-500/30' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}
                    >
                      {n === 3 ? (en ? '3d' : '3j') : n === 7 ? (en ? '1 wk' : '1 sem') : n === 14 ? (en ? '2 wks' : '2 sem') : (en ? '1 mo' : '1 mois')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-white/60 mb-1.5">{en ? 'Networks' : 'Réseaux'}</label>
                <p className="text-[10px] text-white/50 italic">
                  {Array.from(platformFilter).map(p => PLATFORM_META[p]?.label || p).join(' · ') || (en ? 'Pick at least one network filter above.' : 'Sélectionne au moins un réseau dans les filtres ci-dessus.')}
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-white/60 mb-1.5">{en ? 'Publication mode' : 'Mode publication'}</label>
                <div className="space-y-1.5">
                  <button
                    onClick={() => setBatchMode('notify')}
                    className={`w-full text-left p-3 min-h-[56px] rounded-xl border transition ${batchMode === 'notify' ? 'bg-amber-500/15 border-amber-400 shadow-lg shadow-amber-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                  >
                    <div className="text-xs font-bold text-white mb-0.5">{'\uD83D\uDD14'} {en ? 'Notify + I validate (1 credit / post)' : 'Me notifier + je valide (1 crédit / post)'}</div>
                    <div className="text-[10px] text-white/60 leading-relaxed">{en ? 'You get an email/notif before each publish, you click to confirm.' : 'Tu reçois un email/notif avant chaque publication, tu cliques pour confirmer.'}</div>
                  </button>
                  <button
                    onClick={() => setBatchMode('auto')}
                    className={`w-full text-left p-3 min-h-[56px] rounded-xl border transition ${batchMode === 'auto' ? 'bg-purple-500/15 border-purple-400 shadow-lg shadow-purple-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                  >
                    <div className="text-xs font-bold text-white mb-0.5">{'\u26A1'} {en ? 'Auto-publish (hands-off)' : 'Publication auto (mains libres)'}</div>
                    <div className="text-[10px] text-white/60 leading-relaxed">{en ? 'Léna publishes at the optimal time. No validation needed.' : 'Léna publie au meilleur moment. Pas de validation à faire.'}</div>
                  </button>
                </div>
              </div>

              {batchResult && (
                <div className={`p-2.5 rounded-lg text-[11px] ${batchResult.startsWith('✓') ? 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-200' : 'bg-red-500/15 border border-red-400/30 text-red-200'}`}>
                  {batchResult}
                </div>
              )}

              <button
                onClick={launchBatch}
                disabled={batchBusy || platformFilter.size === 0}
                className="w-full py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-black text-sm disabled:opacity-50 transition shadow-lg shadow-emerald-500/30"
              >
                {batchBusy ? (en ? 'Generating...' : 'Génération en cours...') : (en ? `Plan ${batchDays} days` : `Planifier ${batchDays} jour${batchDays > 1 ? 's' : ''}`)}
              </button>
              <p className="text-[10px] text-white/40 text-center leading-relaxed">{en ? 'Each draft uses ~3 credits to generate. You can review/edit/skip them in the calendar.' : 'Chaque brouillon coûte ~3 crédits à générer. Tu peux les relire/éditer/zapper dans le calendrier.'}</p>
            </div>
          </div>
        </div>
      )}

      {/* CALENDAR */}
      {view === 'month' && <MonthGrid cursor={cursor} byDay={byDay} onSelect={setSelected} en={en} tCal={tCal} />}
      {view === 'week' && <WeekStrip cursor={cursor} byDay={byDay} onSelect={setSelected} en={en} />}
      {view === 'day' && <DayList cursor={cursor} byDay={byDay} onSelect={setSelected} en={en} tCal={tCal} />}

      {/* Selected post modal */}
      {selected && (
        <PostModal selected={selected} onClose={() => setSelected(null)} en={en} tCal={tCal} />
      )}

      {filteredAll.length === 0 && <div className="text-center py-8 text-white/50 text-sm">{tCal.noContent}</div>}
    </div>
  );
}

// MONTH GRID — classic 5-6 row × 7 column calendar
function MonthGrid({ cursor, byDay, onSelect, en, tCal }: { cursor: Date; byDay: Map<string, any[]>; onSelect: (p: any) => void; en: boolean; tCal: any }) {
  const today = ymd(new Date());
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lastOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  // Calendar starts on Monday — push back to first Mon ≤ firstOfMonth
  const gridStart = new Date(firstOfMonth);
  const dow = (firstOfMonth.getDay() + 6) % 7; // 0 = Mon
  gridStart.setDate(firstOfMonth.getDate() - dow);
  // 6 weeks max (covers any month)
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  const dayNames = en
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/10">
        {dayNames.map(n => (
          <div key={n} className="px-2 py-2 text-[10px] font-bold text-white/40 uppercase tracking-wide text-center">{n}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const k = ymd(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = k === today;
          const dayPosts = byDay.get(k) || [];
          return (
            <div key={i} className={`min-h-[60px] sm:min-h-[88px] p-1 sm:p-1.5 border-b border-r border-white/5 last:border-r-0 ${inMonth ? '' : 'bg-black/20 opacity-40'} ${isToday ? 'bg-purple-500/5' : ''}`}>
              <div className={`text-[10px] sm:text-[11px] font-bold mb-1 ${isToday ? 'text-purple-300' : inMonth ? 'text-white/70' : 'text-white/30'}`}>{d.getDate()}</div>
              {/* Mobile: tap whole cell → open day list. Desktop: per-post pills. */}
              {dayPosts.length > 0 && (
                <>
                  {/* Mobile dot summary (≤sm) */}
                  <button
                    onClick={() => dayPosts[0] && onSelect(dayPosts[0])}
                    className="sm:hidden w-full flex flex-wrap gap-0.5 items-center"
                    aria-label={`${dayPosts.length} post(s)`}
                  >
                    {dayPosts.slice(0, 4).map(p => (
                      <span key={p.id} className={`w-2 h-2 rounded-full ${STATUS_DOT[p.status] || 'bg-white/20'}`} />
                    ))}
                    {dayPosts.length > 4 && <span className="text-[8px] text-white/50">+{dayPosts.length - 4}</span>}
                  </button>
                  {/* Desktop full pills (≥sm) */}
                  <div className="hidden sm:block space-y-0.5">
                    {dayPosts.slice(0, 3).map(p => (
                      <button
                        key={p.id}
                        onClick={() => onSelect(p)}
                        className={`w-full flex items-center gap-1 px-1 py-0.5 rounded border ${STATUS_COLORS[p.status] || 'border-white/10'} hover:scale-[1.02] transition group`}
                      >
                        {p.visual_url ? (
                          <img src={p.visual_url} alt="" className="w-6 h-6 object-cover rounded shrink-0" />
                        ) : (
                          <div className="w-6 h-6 bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded shrink-0" />
                        )}
                        <div className="text-[8px] text-white/80 truncate text-left flex-1">{(p.hook || p.caption || '').substring(0, 22)}</div>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[p.status] || 'bg-white/20'}`} />
                      </button>
                    ))}
                    {dayPosts.length > 3 && (
                      <div className="text-[8px] text-white/50 text-center">+{dayPosts.length - 3}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[9px] text-white/50 text-right px-3 py-1.5 border-t border-white/10">
        {byDay.size > 0
          ? tCal.thisMonth(Array.from(byDay.values()).reduce((a, b) => a + b.length, 0), lastOfMonth.getDate())
          : (en ? 'No posts' : 'Aucun post')}
      </div>
    </div>
  );
}

// WEEK STRIP — 7 columns with full-card thumbnails
function WeekStrip({ cursor, byDay, onSelect, en }: { cursor: Date; byDay: Map<string, any[]>; onSelect: (p: any) => void; en: boolean }) {
  const today = ymd(new Date());
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7)); // Mon
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  const dayShort = en
    ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    : ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-7 gap-2 sm:gap-3">
      {days.map((d, i) => {
        const k = ymd(d);
        const isToday = k === today;
        const dayPosts = byDay.get(k) || [];
        return (
          <div key={k} className={`bg-white/[0.02] border ${isToday ? 'border-purple-500/50 ring-1 ring-purple-500/20' : 'border-white/10'} rounded-xl p-2.5 min-h-[180px]`}>
            <div className="flex items-baseline justify-between mb-2.5 pb-2 border-b border-white/5">
              <div className={`flex items-baseline gap-1.5 ${isToday ? 'text-purple-300' : 'text-white/70'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{dayShort[i]}</span>
                <span className="text-lg font-black leading-none">{d.getDate()}</span>
              </div>
              {dayPosts.length > 0 && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isToday ? 'bg-purple-500/30 text-purple-200' : 'bg-white/10 text-white/60'}`}>
                  {dayPosts.length}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {dayPosts.map(p => {
                const meta = PLATFORM_META[p.platform || 'instagram'];
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p)}
                    className={`w-full text-left rounded-xl border ${STATUS_COLORS[p.status] || 'border-white/10'} overflow-hidden hover:ring-2 hover:ring-purple-500/40 transition shadow-sm`}
                  >
                    {p.visual_url ? (
                      <div className="relative aspect-square">
                        <img src={p.visual_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        <span className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/40 ${STATUS_DOT[p.status] || 'bg-white/30'}`} />
                        {meta?.tag && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/65 text-white text-[9px] font-bold tracking-wide">
                            {meta.tag}
                          </span>
                        )}
                        {p.scheduled_time && (
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5">
                            <div className="text-[10px] text-white font-bold">{p.scheduled_time.substring(0, 5)}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-square bg-gradient-to-br from-purple-900/30 to-pink-900/30 flex items-center justify-center p-2.5">
                        <span className="text-[10px] text-white/70 text-center line-clamp-4 leading-snug">{(p.hook || p.caption || '').substring(0, 80)}</span>
                      </div>
                    )}
                  </button>
                );
              })}
              {dayPosts.length === 0 && (
                <div className="flex items-center justify-center text-[10px] text-white/15 py-6 italic">{en ? '· empty' : '· vide'}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// DAY LIST — vertical timeline with large cards
function DayList({ cursor, byDay, onSelect, en, tCal }: { cursor: Date; byDay: Map<string, any[]>; onSelect: (p: any) => void; en: boolean; tCal: any }) {
  const k = ymd(cursor);
  const dayPosts = byDay.get(k) || [];
  const dateLocale = en ? 'en-US' : 'fr-FR';
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-white capitalize">{cursor.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
        <span className="text-[10px] text-white/60">{tCal.nPosts(dayPosts.length)}</span>
      </div>
      {dayPosts.length === 0 ? (
        <div className="text-center py-12 text-white/40 text-sm">{tCal.noPostsToday}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {dayPosts.map(p => {
            const meta = PLATFORM_META[p.platform || 'instagram'];
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className={`text-left rounded-xl border ${STATUS_COLORS[p.status] || 'border-white/10'} overflow-hidden hover:ring-1 hover:ring-purple-500/40 transition`}
              >
                {p.visual_url ? (
                  <div className="aspect-video relative">
                    <img src={p.visual_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold text-white ${STATUS_DOT[p.status] || 'bg-white/20'}`}>{STATUS_LABELS[p.status]}</span>
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold bg-black/60 text-white">{meta?.emoji} {meta?.label}</span>
                  </div>
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-purple-900/30 to-pink-900/30 flex items-center justify-center p-3">
                    <span className="text-xs text-white/60 text-center line-clamp-3">{(p.hook || p.caption || '').substring(0, 100)}</span>
                  </div>
                )}
                <div className="p-2 space-y-1">
                  <div className="text-[10px] text-white/50">{p.scheduled_time?.substring(0, 5) || ''} {p.format ? `· ${p.format}` : ''}</div>
                  <div className="text-xs text-white/80 line-clamp-2">{p.hook || (p.caption || '').substring(0, 80)}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Modal — kept similar to the previous design
function PostModal({ selected: initial, onClose, en, tCal }: { selected: any; onClose: () => void; en: boolean; tCal: any }) {
  const [selected, setSelected] = useState<any>(initial);
  const cur = selected.overlay_text || null;
  const [overlayText, setOverlayText] = useState<string>(cur?.text || '');
  const [overlayPos, setOverlayPos] = useState<'top' | 'bottom' | 'center'>(cur?.position || 'bottom');
  const [overlayTone, setOverlayTone] = useState<'punchy' | 'elegant' | 'playful'>(cur?.tone || 'punchy');
  const [overlayBusy, setOverlayBusy] = useState(false);
  const [overlaySuggestBusy, setOverlaySuggestBusy] = useState(false);
  const [overlaySuggestNote, setOverlaySuggestNote] = useState<string | null>(null);

  const suggestOverlay = useCallback(async () => {
    setOverlaySuggestBusy(true);
    setOverlaySuggestNote(null);
    try {
      const res = await fetch('/api/me/overlay-text/suggest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: selected.id, tone: overlayTone }),
      });
      const j = await res.json();
      if (j.ok) {
        if (j.suggestion) {
          setOverlayText(j.suggestion.text || '');
          if (j.suggestion.position) setOverlayPos(j.suggestion.position);
          if (j.suggestion.tone) setOverlayTone(j.suggestion.tone);
          setOverlaySuggestNote(en ? '✨ Suggestion ready — review then Apply.' : '✨ Suggestion prête — relis puis Appliquer.');
        } else {
          setOverlaySuggestNote(j.reason || (en ? 'Image is stronger without text.' : 'Image plus forte sans texte.'));
        }
      } else {
        setOverlaySuggestNote(j.error || (en ? 'Suggestion failed' : 'Suggestion échouée'));
      }
    } catch (e: any) {
      setOverlaySuggestNote(e?.message || (en ? 'Suggestion failed' : 'Suggestion échouée'));
    } finally {
      setOverlaySuggestBusy(false);
    }
  }, [selected.id, overlayTone, en]);

  const applyOverlay = useCallback(async () => {
    setOverlayBusy(true);
    try {
      const res = await fetch('/api/me/overlay-text', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: selected.id, text: overlayText, position: overlayPos, tone: overlayTone }),
      });
      const j = await res.json();
      if (j.ok) {
        if (j.removed) {
          // overlay stripped — visual_url reverted by API
          setSelected((s: any) => ({ ...s, overlay_text: null }));
        } else {
          setSelected((s: any) => ({
            ...s,
            visual_url: j.visual_url,
            overlay_text: { text: overlayText, position: overlayPos, tone: overlayTone, original_visual_url: cur?.original_visual_url || s.visual_url },
          }));
        }
      } else {
        alert(j.error || (en ? 'Failed' : 'Échec'));
      }
    } finally {
      setOverlayBusy(false);
    }
  }, [selected.id, overlayText, overlayPos, overlayTone, cur, en]);

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_DOT[selected.status] || 'bg-white/10'} text-white`}>{STATUS_LABELS[selected.status] || selected.status}</span>
            <span className="text-[10px] text-white/40">{PLATFORM_META[selected.platform || 'instagram']?.label} · {selected.format} · {selected.scheduled_date}</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        {selected.visual_url && <img src={selected.visual_url} alt="" className="w-full max-h-[50vh] object-contain bg-black" />}
        <div className="px-4 py-3 space-y-2">
          {selected.hook && <p className="text-sm font-bold text-white">{selected.hook}</p>}
          {(selected.status === 'draft' || selected.status === 'approved') ? (
            <textarea
              defaultValue={selected.caption || ''}
              onBlur={async (e) => {
                if (e.target.value !== selected.caption) {
                  try { await fetch('/api/agents/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'update_caption', postId: selected.id, caption: e.target.value }) }); } catch {}
                }
              }}
              className="w-full text-xs text-white/70 bg-white/5 border border-white/10 rounded-lg p-2 min-h-[80px] resize-y focus:ring-1 focus:ring-purple-500/50 focus:outline-none"
              placeholder="Description du post..."
            />
          ) : (
            <p className="text-xs text-white/70 whitespace-pre-wrap">{selected.caption}</p>
          )}
          {selected.hashtags && <p className="text-xs text-blue-400">{Array.isArray(selected.hashtags) ? selected.hashtags.join(' ') : selected.hashtags}</p>}
          {selected.instagram_permalink && <a href={selected.instagram_permalink} target="_blank" rel="noopener" className="text-[10px] text-purple-400 hover:underline">Voir sur Instagram {'\u2197'}</a>}
        </div>

        {/* Text overlay editor */}
        {selected.visual_url && !selected.visual_url.endsWith('.mp4') && (
          <div className="px-4 py-3 border-t border-white/10 bg-white/[0.02]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-white/60">{en ? 'Text overlay' : 'Texte sur l\'image'}</span>
              <div className="flex items-center gap-2">
                {selected.overlay_text?.text && <span className="text-[9px] text-white/40 italic">{en ? 'Active' : 'Actif'}</span>}
                <button
                  onClick={suggestOverlay}
                  disabled={overlaySuggestBusy}
                  className="px-2 py-1 min-h-[28px] rounded-md text-[10px] font-bold bg-gradient-to-r from-fuchsia-600/30 to-purple-600/30 hover:from-fuchsia-600/50 hover:to-purple-600/50 text-fuchsia-200 border border-fuchsia-400/30 disabled:opacity-50 transition flex items-center gap-1"
                  title={en ? 'Ask Léna for a punchline based on this post' : 'Demander à Léna une punchline pour ce post'}
                >
                  {overlaySuggestBusy ? '...' : '\u2728'} {en ? 'Suggest' : 'Suggestion IA'}
                </button>
              </div>
            </div>
            <textarea
              value={overlayText}
              onChange={e => setOverlayText(e.target.value)}
              placeholder={en ? 'Short punchline (3-8 words). Empty = remove.' : 'Punchline courte (3-8 mots). Vide = supprimer.'}
              rows={2}
              maxLength={60}
              className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
            {overlaySuggestNote && (
              <p className="text-[10px] text-fuchsia-200/80 mt-1.5 italic leading-snug">{overlaySuggestNote}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <select value={overlayPos} onChange={e => setOverlayPos(e.target.value as any)} className="bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white/80">
                <option value="top">{en ? 'Top' : 'Haut'}</option>
                <option value="center">{en ? 'Center' : 'Centre'}</option>
                <option value="bottom">{en ? 'Bottom' : 'Bas'}</option>
              </select>
              <select value={overlayTone} onChange={e => setOverlayTone(e.target.value as any)} className="bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white/80">
                <option value="punchy">{en ? 'Punchy' : 'Punchy'}</option>
                <option value="elegant">{en ? 'Elegant' : 'Élégant'}</option>
                <option value="playful">{en ? 'Playful' : 'Joueur'}</option>
              </select>
              <button
                onClick={applyOverlay}
                disabled={overlayBusy}
                className="ml-auto px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold rounded-lg disabled:opacity-50"
              >
                {overlayBusy ? '...' : (overlayText.trim() ? (en ? 'Apply' : 'Appliquer') : (en ? 'Remove' : 'Supprimer'))}
              </button>
            </div>
          </div>
        )}
        {(selected.status === 'draft' || selected.status === 'approved') && (
          <div className="px-4 pb-4 flex gap-2">
            <button onClick={async () => { try { await fetch('/api/agents/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'publish_single', postId: selected.id }) }); onClose(); window.location.reload(); } catch {} }} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl min-h-[44px]">{'\uD83D\uDE80'} {tCal.publish}</button>
            <button onClick={async () => { try { await fetch('/api/agents/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'regenerate_single', postId: selected.id }) }); onClose(); } catch {} }} className="py-2.5 px-4 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-[10px] font-medium rounded-xl min-h-[44px]">{'\uD83D\uDD04'} {tCal.regenerate}</button>
            <button onClick={async () => { if (!confirm(tCal.confirmDelete)) return; try { await fetch('/api/agents/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'skip_single', postId: selected.id }) }); onClose(); window.location.reload(); } catch {} }} className="py-2.5 px-4 bg-red-600/20 hover:bg-red-600/30 text-red-300 text-[10px] font-medium rounded-xl min-h-[44px]">{'\uD83D\uDDD1'} {tCal.delete}</button>
          </div>
        )}
        {/* Republier — for posts that previously failed or were skipped.
            One click resets status to 'approved' and reschedules to today
            so the cron can pick it up again. The client never has to think
            about 'failed' / 'skipped' as terminal states. */}
        {(selected.status === 'publish_failed' || selected.status === 'retry_pending' || selected.status === 'skipped') && (
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={async () => {
                try {
                  await fetch('/api/agents/content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ action: 'republish_single', postId: selected.id }),
                  });
                  onClose();
                  window.location.reload();
                } catch {}
              }}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl min-h-[44px]"
            >
              {'\uD83D\uDE80'} Republier
            </button>
            <button
              onClick={async () => {
                if (!confirm(tCal.confirmDelete)) return;
                try {
                  await fetch('/api/agents/content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ action: 'delete_post', postId: selected.id }),
                  });
                  onClose();
                  window.location.reload();
                } catch {}
              }}
              className="py-2.5 px-4 bg-red-600/20 hover:bg-red-600/30 text-red-300 text-[10px] font-medium rounded-xl min-h-[44px]"
            >
              {'\uD83D\uDDD1'} {tCal.delete}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentWorkspacePage() {
  const { t: tLang, locale } = useLanguage();
  const nn = (tLang as any).notif || {};
  const isEn = locale === 'en';
  const params = useParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const agentId = params.id as string;

  // Core
  const [agent, setAgent] = useState<ClientAgent | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [isVisitor, setIsVisitor] = useState(false);
  const [creditsLow, setCreditsLow] = useState(false);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);

  // Tabs — support ?tab=history from notification links
  const searchParams = useSearchParams();
  const initialTab = (['dashboard', 'planning', 'history', 'campaigns', 'settings', 'profile'].includes(searchParams.get('tab') || '') ? searchParams.get('tab') : 'dashboard') as any;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'planning' | 'history' | 'campaigns' | 'settings' | 'profile' | 'documents' | 'editor'>(initialTab);
  const [showCampaignWizard, setShowCampaignWizard] = useState(false);

  // Open chat with notification message if redirected from notification
  useEffect(() => {
    const openChat = searchParams.get('openChat');
    const chatMsg = searchParams.get('chatMsg');
    if (openChat === 'true') {
      setChatOpen(true);
      if (chatMsg) {
        const decoded = decodeURIComponent(chatMsg);
        setMessages(prev => prev.length === 0 ? [{ id: 'notif-' + Date.now(), role: 'assistant' as const, content: decoded, created_at: new Date().toISOString() }] : prev);
      }
    }
  }, []);

  // Expose campaign wizard opener for child components
  useEffect(() => {
    (window as any).__openCampaignWizard = () => setShowCampaignWizard(true);
    return () => { delete (window as any).__openCampaignWizard; };
  }, []);

  // Chat (slide-over)
  const [chatOpen, setChatOpen] = useState(false);
  // chatMinimised: chat is "alive" but collapsed to a small floating
  // bubble so the user can read/scroll the screen without losing the
  // conversation context. Tapping the bubble re-expands.
  const [chatMinimised, setChatMinimised] = useState(false);
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

  // ─── Check if visitor + credits ────────────────────────
  useEffect(() => {
    import('@/lib/supabase/client').then(({ supabaseBrowser }) => {
      const sb = supabaseBrowser();
      sb.auth.getSession().then(({ data }: any) => {
        if (!data?.session) { setIsVisitor(true); return; }
        // Check credits balance
        sb.from('profiles').select('credits_balance').eq('id', data.session.user.id).single()
          .then(({ data: p }: any) => {
            if (p?.credits_balance != null) {
              setCreditsBalance(p.credits_balance);
              if (p.credits_balance < 50) setCreditsLow(true);
            }
          }).catch(() => {});
      });
    }).catch(() => setIsVisitor(true));
  }, []);

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

  // ─── Detect just_connected (after OAuth redirect) ─────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const justConnected = params.get('just_connected');
    if (justConnected) {
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);

      // Force dashboard reload to pick up new connection
      setDashboardData(null);

      // Show success message in chat
      const network = justConnected === 'instagram' ? 'Instagram' : justConnected === 'google' ? 'Google Business' : justConnected === 'gmail' ? 'Gmail' : justConnected;
      const contentMsg = agentId === 'content' ? 'Tu peux maintenant lancer une publication ou laisser Lena creer du contenu automatiquement !' : '';
      const dmMsg = agentId === 'dm_instagram' ? 'Tes conversations DM vont apparaitre ici. Jade prospecte automatiquement pour toi !' : '';
      const gmailMsg = justConnected === 'gmail' ? 'Tes emails de prospection partiront maintenant de ton propre Gmail. Meilleur taux d\'ouverture garanti !' : '';
      setMessages(prev => [...prev, {
        id: `connected_${Date.now()}`,
        role: 'assistant',
        content: `\u2705 ${network} connecte avec succes ! ${gmailMsg || contentMsg || dmMsg || 'L\'agent est pret a travailler pour toi.'}`,
        created_at: new Date().toISOString(),
      }]);
      setChatOpen(true);

      // For content agent: trigger first post generation + publish if auto mode
      if (agentId === 'content' && justConnected === 'instagram') {
        // Generate first post via chat
        fetch('/api/agents/client-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ agent_id: 'content', message: 'Genere mon premier post Instagram ! Un post accrocheur adapte a mon business, pret a publier. Inclus le visuel, la legende et les hashtags.' }),
        }).then(r => r.json()).then(d => {
          if (d.reply) {
            setMessages(prev => [...prev, {
              id: `first_post_${Date.now()}`,
              role: 'assistant',
              content: d.reply,
              created_at: new Date().toISOString(),
            }]);
          }
        }).catch(() => {});

        // Also trigger actual content generation via content agent API
        fetch('/api/agents/content?slot=morning', {
          credentials: 'include',
          headers: { 'Authorization': 'Bearer ' + (typeof window !== 'undefined' ? document.cookie.split('sb-')[1]?.split('=')[0] || '' : '') },
        }).catch(() => {});
      }

      // For DM agent: force reload conversations
      if (agentId === 'dm_instagram' && justConnected === 'instagram') {
        // Retry conversations fetch after token propagation
        setTimeout(() => { window.location.reload(); }, 2000);
      }

      // Mark agent as setup completed
      fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, setup_completed: true, auto_mode: true }),
      }).catch(() => {});
    }
  }, [agentId]);

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
    const loadDash = async () => {
      try { const res = await fetch(`/api/agents/dashboard?agent_id=${agentId}`, { credentials: 'include' }); if (res.ok) setDashboardData(await res.json()); } catch {} finally { setDashboardLoading(false); }
    };
    loadDash();

    // Auto-refresh dashboard every 60s so client sees agent results in real-time
    const interval = setInterval(() => {
      fetch(`/api/agents/dashboard?agent_id=${agentId}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setDashboardData(d); })
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [agentId, hasDashboard]);

  // ─── Load task history (timeline items + action logs) ────────────────────────────────
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  useEffect(() => {
    if (activeTab !== 'history' || tasks.length > 0) return;
    setTasksLoading(true);
    (async () => {
      try {
        // Fetch both timeline items and action logs in parallel
        const [timelineRes, logsRes] = await Promise.all([
          fetch(`/api/agents/dashboard?agent_id=${agentId}&type=timeline`, { credentials: 'include' }),
          fetch(`/api/agents/dashboard?agent_id=${agentId}&type=logs`, { credentials: 'include' }),
        ]);
        if (timelineRes.ok) {
          const tData = await timelineRes.json();
          setTimelineItems(tData.items || []);
        }
        if (logsRes.ok) {
          const lData = await logsRes.json();
          setTasks(lData.logs || lData.recommendations || []);
        }
      } catch {} finally { setTasksLoading(false); }
    })();
  }, [activeTab, agentId, tasks.length]);

  // ─── Load settings from SERVER (org_agent_configs) then localStorage fallback ──────
  useEffect(() => {
    const fields = getAgentSettings(agentId);
    const defaults: Record<string, any> = {};
    fields.forEach(f => { defaults[f.key] = f.default; });

    fetch(`/api/agents/settings?agent_id=${agentId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.settings && Object.keys(d.settings).length > 0) {
          // Merge server settings over defaults (server is source of truth)
          setSettings({ ...defaults, ...d.settings });
          return;
        }
        // Fallback: try localStorage (migration from old saves)
        try {
          const stored = localStorage.getItem(`keiro_agent_settings_${agentId}`);
          if (stored) { setSettings({ ...defaults, ...JSON.parse(stored) }); return; }
        } catch {}
        setSettings(defaults);
      })
      .catch(() => {
        // Offline fallback
        try {
          const stored = localStorage.getItem(`keiro_agent_settings_${agentId}`);
          if (stored) { setSettings({ ...defaults, ...JSON.parse(stored) }); return; }
        } catch {}
        setSettings(defaults);
      });
  }, [agentId]);

  // ─── Auto-save settings with debounce (1.5s after last change) ───────
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleSaveSettings = useCallback(async () => {
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, ...settings }),
      });
    } catch {}
    try { localStorage.setItem(`keiro_agent_settings_${agentId}`, JSON.stringify(settings)); } catch {}
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }, [agentId, settings]);

  // Auto-save when settings change (debounced)
  const settingsInitRef = useRef(false);
  useEffect(() => {
    if (!settingsInitRef.current) { settingsInitRef.current = true; return; } // Skip initial load
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { handleSaveSettings(); }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [settings, handleSaveSettings]);

  // ─── Chat handlers ───────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  const handleSend = useCallback(async () => {
    const text = input.trim(); if (!text || isLoading) return;
    setMessages(prev => [...prev, { id: generateId(), role: 'user', content: text, created_at: new Date().toISOString() }]);
    setInput(''); setIsLoading(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    try {
      const res = await fetch('/api/agents/client-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ agent_id: agentId, message: text }) });
      const data = await res.json();
      if (res.ok && data.message) {
        setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: data.message, created_at: new Date().toISOString() }]);
      } else {
        // Show the actual error to debug, never "je traite ta demande"
        const errorMsg = data.error === 'Credits insuffisants'
          ? 'Tu n\'as plus de crédits. Passe au plan supérieur pour continuer à discuter avec tes agents.'
          : data.error === 'Connexion requise'
          ? 'Connecte-toi pour discuter avec tes agents.'
          : `Désolé, je n'ai pas pu répondre. ${data.error || 'Réessaie dans quelques secondes.'}`;
        setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: errorMsg, created_at: new Date().toISOString() }]);
      }
    } catch { setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: 'Connexion perdue. Vérifie ta connexion internet et réessaie.', created_at: new Date().toISOString() }]); }
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
      // Show processing indicator in chat
      const processingMsgId = `processing_${Date.now()}`;
      setMessages(prev => [...prev, {
        id: processingMsgId,
        role: 'assistant',
        content: `\u23F3 Analyse du fichier "${fl[i].name}" en cours... Extraction des donnees et mise a jour du profil.`,
        created_at: new Date().toISOString(),
      }]);
      setChatOpen(true);

      const fd = new FormData(); fd.append('file', fl[i]); fd.append('agent_id', agentId);
      try {
        const r = await fetch('/api/agents/agent-files', { method: 'POST', credentials: 'include', body: fd });
        // Remove processing message
        setMessages(prev => prev.filter(m => m.id !== processingMsgId));
        if (r.ok) {
          const d = await r.json();
          setFiles(p => [...p, { id: d.id || generateId(), name: fl[i].name, size: fl[i].size, uploaded_at: new Date().toISOString(), url: d.file?.url || d.url }]);

          // Build the acknowledgement message. Two independent signals can
          // fire: dossier_updated (business info extracted), visual_classified
          // (image classified + indexed in agent_uploads). We combine them
          // into one message instead of two awkward bubbles. Each agent has
          // its own voice so Clara and Léna don't sound like twins.
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
          const contentTypeLabels: Record<string, string> = {
            product: 'un produit', dish: 'un plat', space: 'ton espace',
            ambiance: 'une ambiance', team: 'ton equipe', behind_scenes: 'un behind-the-scenes',
            customer: 'un client', logo: 'ton logo', document: 'un document',
            video: 'une video', data: 'un fichier de donnees (Excel)', deck: 'une presentation (slides)', audio: 'un fichier audio',
            other: 'un visuel',
          };

          // Each agent ACTS, doesn't wait. The client gave us a file —
          // the default should be "I'm integrating it into my work now",
          // with an OPTIONAL invitation to redirect if the client has a
          // specific angle in mind. Never make the client feel like the
          // agent is idle awaiting instructions.
          const voices: Record<string, { name: string; autoAction: string; optionalAsk: string }> = {
            onboarding: {
              name: 'Clara',
              autoAction: "Je l'integre a ton dossier et je le partage avec les autres agents (Lena, Jade, Hugo…) pour qu'ils puissent s'en servir.",
              optionalAsk: "Si t'as un contexte precis a ajouter (quand c'etait pris, qui figure dessus, info a retenir), dis-le moi.",
            },
            content: {
              name: 'Lena',
              autoAction: "Je l'integre a ta strategie de contenu et je l'utilise pour tes prochains posts Instagram / LinkedIn / TikTok.",
              optionalAsk: "Si tu veux que je parte dans une direction precise (theme, angle, format, ton), dis-le moi, sinon je choisis selon ce qui matche ton business et l'actu.",
            },
            dm_instagram: {
              name: 'Jade',
              autoAction: "Je l'integre a tes DMs — je peux l'envoyer comme reponse visuelle ou comme hook quand je prospecte des comptes pertinents.",
              optionalAsk: "Tu veux que je l'envoie a un segment precis (nouveaux followers, prospects) ou je choisis selon la conversation ?",
            },
            email: {
              name: 'Hugo',
              autoAction: "Je l'integre a tes sequences email — je peux l'inserer dans un visuel accroche ou comme preuve sociale.",
              optionalAsk: "Tu veux qu'il parte a un type de prospect specifique ou je l'utilise dans la sequence la plus pertinente ?",
            },
            commercial: {
              name: 'Leo',
              autoAction: "Je l'integre a ton enrichissement CRM — si c'est un prospect / contact je mets a jour la fiche.",
              optionalAsk: "Si c'est un type de cible precis a ajouter au pipeline, dis-le moi.",
            },
            marketing: {
              name: 'Ami',
              autoAction: "Je l'integre a mon analyse marketing et je le cite dans ton brief quotidien.",
              optionalAsk: "Tu veux que je l'utilise pour un canal specifique (Instagram, LinkedIn, email, ads) ou je l'exploite la ou il rendra le mieux ?",
            },
            rh: { name: 'Sara', autoAction: "Je l'archive dans tes documents RH/juridique.", optionalAsk: "Dis-moi si tu veux une action specifique dessus (contrat a rediger, verification legale…)." },
            comptable: { name: 'Louis', autoAction: "Je l'integre a ta compta — je peux en extraire les chiffres et l'inclure dans ton previsionnel.", optionalAsk: "Tu veux un traitement specifique (analyse de marge, extraction de postes) ?" },
          };
          const voice = voices[agentId] || {
            name: 'Ton agent',
            autoAction: "Je l'integre a mon travail et je le partage avec les autres agents pertinents.",
            optionalAsk: "Si tu veux une direction precise, dis-le moi.",
          };

          const lines: string[] = [];
          // Always open with confirmation + what I see
          if (d.visual_classified) {
            const what = contentTypeLabels[d.content_type || 'other'] || 'un visuel';
            lines.push(`\u{1F4C1} Recu "${fl[i].name}" — c'est ${what}${d.post_angle ? `, angle reconnu : *${d.post_angle}*` : ''}.`);
          } else {
            lines.push(`\u{1F4C1} Recu "${fl[i].name}" — sauvegarde dans ton workspace.`);
          }

          if (d.dossier_updated && d.fields_extracted?.length) {
            const extracted = d.fields_extracted.map((f: string) => fieldLabels[f] || f).join(', ');
            lines.push(`\u2705 ${d.fields_extracted.length} champs du profil remplis automatiquement : **${extracted}**.`);
          }

          // Agent takes action proactively
          lines.push(voice.autoAction);
          // Optional redirect invitation — always at the end, low-key
          lines.push(`\u{1F4AD} ${voice.optionalAsk}`);

          setMessages(prev => [...prev, {
            id: `file_${Date.now()}`,
            role: 'assistant',
            content: lines.join('\n\n'),
            created_at: new Date().toISOString(),
          }]);
          setChatOpen(true);
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
    <div className="min-h-screen bg-[#0c1a3a] pt-16 relative">
      {/* Visitor overlay — blur + signup CTA */}
      {isVisitor && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center pointer-events-none" style={{ top: 64 }}>
          <div className="absolute inset-0 backdrop-blur-[2px] bg-black/10" />
          <div className="relative pointer-events-auto bg-gray-900/95 backdrop-blur-xl border border-purple-500/20 rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 w-full sm:max-w-md mx-4 mb-0 sm:mb-0 text-center">
            {/* Close button */}
            <button onClick={() => window.location.href = '/assistant'} className="absolute top-3 right-3 text-white/20 hover:text-white/50 transition p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="text-3xl mb-3">{'\u{1F512}'}</div>
            <h3 className="text-lg font-bold text-white mb-1">Decouvre tes agents IA</h3>
            <p className="text-xs text-white/50 mb-4">Cree ton compte gratuit pour acceder a l&apos;espace complet de tes 18 agents IA et automatiser ton business.</p>
            <a href="/login" className="block w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-sm rounded-xl hover:shadow-lg transition mb-2">
              Essai gratuit 7 jours — 0{'\u20AC'}
            </a>
            <p className="text-[10px] text-white/30">Carte requise, aucun debit. Annulation en 1 clic.</p>
          </div>
        </div>
      )}

      <div className={`max-w-7xl mx-auto px-4 py-6 pb-28 sm:pb-8 ${isVisitor ? 'pointer-events-none select-none' : ''}`}>

        {/* Upsell banner — only shown when credits low or margin < warn threshold */}
        {!isVisitor && <UpsellBanner />}

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
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-green-500/15 border border-green-500/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-300 text-[10px] font-medium">Actif</span>
            </div>
            {creditsLow && (
              <a href="/pricing" className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 border border-amber-500/20 rounded-full hover:bg-amber-500/25 transition">
                <span className="text-amber-300 text-[10px] font-medium">{creditsBalance} credits</span>
                <span className="text-amber-400 text-[10px]">{'\u2197'}</span>
              </a>
            )}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/15 border border-white/10 rounded-full cursor-pointer transition"
            >
              <input ref={fileInputRef} type="file" className="hidden" multiple onChange={e => handleFileUpload(e.target.files)} />
              <span className="text-white/40 text-[10px]">{uploading ? '...' : '+'} Fichier</span>
            </div>
            <button
              onClick={() => {
                try {
                  sessionStorage.setItem('keiro_tour_replay', agentId);
                  // Dispatch event instead of reloading
                  window.dispatchEvent(new CustomEvent('keiro-tour-replay', { detail: agentId }));
                } catch {}
              }}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/40 hover:text-white/70 transition"
              title={nn.formViewTutorial || 'Voir le tutoriel'}
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

        {/* Campaign wizard modal */}
        {showCampaignWizard && (
          <CampaignWizard
            agentId={agentId}
            agentName={dn}
            onClose={() => setShowCampaignWizard(false)}
            onActivated={() => {
              // Force reload dashboard + settings
              setDashboardData(null);
              // Reload settings from server
              const fields = getAgentSettings(agentId);
              const defaults: Record<string, any> = {};
              fields.forEach((f: any) => { defaults[f.key] = f.default; });
              fetch(`/api/agents/settings?agent_id=${agentId}`, { credentials: 'include' })
                .then(r => r.json())
                .then(d => { if (d.settings) setSettings({ ...defaults, ...d.settings }); })
                .catch(() => {});
              // Show campaign result in chat if available
              try {
                const result = (window as any).__campaignResult;
                if (result) {
                  setMessages(prev => [...prev, { id: `campaign_${Date.now()}`, role: 'assistant', content: result, created_at: new Date().toISOString() }]);
                  setChatOpen(true);
                  delete (window as any).__campaignResult;
                }
              } catch {}
            }}
          />
        )}

        {/* ═══ TABS — sticky so navigation is always reachable while scrolling ═══ */}
        <div className="sticky top-16 z-40 -mx-4 px-4 py-2 mb-5 bg-[#0c1a3a]/85 backdrop-blur-md border-b border-white/5">
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10 overflow-x-auto whitespace-nowrap scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {([
              { key: 'dashboard' as const, label: isEn ? 'Dashboard' : 'Tableau de bord', icon: '\uD83D\uDCCA' },
              ...(agentId === 'onboarding' ? [{ key: 'profile' as const, label: isEn ? 'My profile' : 'Mon profil', icon: '\uD83D\uDCCB' }] : []),
              ...(['email', 'ads', 'commercial', 'dm_instagram'].includes(agentId) ? [{ key: 'campaigns' as const, label: isEn ? 'Campaigns' : 'Campagnes', icon: '\u{1F3AF}' }] : []),
              ...(['content', 'email'].includes(agentId) ? [{ key: 'planning' as const, label: isEn ? 'Planning' : 'Planning', icon: '\uD83D\uDCC5' }] : []),
              ...(['rh', 'comptable'].includes(agentId) ? [{ key: 'editor' as const, label: isEn ? 'Editor' : 'Éditeur', icon: '\u270D\uFE0F' }] : []),
              { key: 'documents' as const, label: 'Documents', icon: '\uD83D\uDCC1' },
              { key: 'history' as const, label: isEn ? 'History' : 'Historique', icon: '\u26A1' },
              { key: 'settings' as const, label: isEn ? 'Settings' : 'Paramètres', icon: '\u2699\uFE0F' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  // Sync URL so back/forward + bookmarks work
                  try {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', tab.key);
                    window.history.replaceState({}, '', url.toString());
                  } catch {}
                }}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'text-white shadow-md'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                style={activeTab === tab.key ? { background: `linear-gradient(135deg, ${gf}, ${gt})` } : undefined}
              >
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>
          {/* Cross-tab quick switch CTA — content + email show a one-click
              jump to Planning since it's the most-used 2nd tab. Reduces
              the navigation friction the founder flagged. */}
          {['content', 'email'].includes(agentId) && activeTab === 'dashboard' && (
            <div className="mt-2 flex items-center justify-end">
              <button
                onClick={() => {
                  setActiveTab('planning');
                  try {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', 'planning');
                    window.history.replaceState({}, '', url.toString());
                  } catch {}
                }}
                className="text-[11px] text-purple-300 hover:text-purple-200 font-semibold flex items-center gap-1"
              >
                {isEn ? 'See full planning calendar' : 'Voir le planning complet'} →
              </button>
            </div>
          )}
        </div>

        {/* ═══ TAB: DASHBOARD ═══ */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="space-y-4 min-w-0">
              {/* Launch campaign button removed from here — moved to inside agent panels */}

              {hasDashboard && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                  {dashboardLoading ? (
                    <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto" /></div>
                  ) : agentId === 'commercial' ? (
                    <div data-tour="agent-dashboard"><CrmDashboard data={dashboardData || { prospects: [], activities: [], pipeline: {}, stats: { total: 0, hot: 0, warm: 0, cold: 0, converted: 0, conversionRate: 0 } }} /></div>
                  ) : agentId === 'onboarding' ? (
                    <div data-tour="agent-dashboard"><OnboardingDossier /></div>
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
                            {(qaResult.checks || []).map((c: any, i: number) => (
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
                    <AgentDashboard agentId={agentId} agentName={dn} gradientFrom={gf} gradientTo={gt} data={{...(dashboardData?.data || {}), connections: dashboardData?.connections || {}}} />
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
            {/* Sidebar removed — upload moved to header, messages count removed */}
          </div>
        )}

        {/* ═══ TAB: PLANNING ═══ */}
        {activeTab === 'planning' && (
          <EditorialCalendarFull agentId={agentId} />
        )}
        {false && (
          <div className="space-y-6">
            {/* OLD Weekly planner — REPLACED by EditorialCalendarFull */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-sm">{'\uD83D\uDCC5'} Planning de la semaine</h3>
                <span className="text-white/30 text-xs">{isEn ? 'Week of' : 'Semaine du'} {weekDays[0].toLocaleDateString(_uiLoc(), { day: 'numeric', month: 'short' })}</span>
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
                          {dayTasks.length > 3 && <div className="text-[10px] text-white/30 text-center">+{dayTasks.length - 3} autres</div>}
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

        {/* ═══ TAB: EDITEUR — Sara docs / Louis spreadsheet ═══ */}
        {activeTab === 'editor' && agentId === 'rh' && (
          <DocumentEditor agentId={agentId} agentName="Sara" />
        )}
        {activeTab === 'editor' && agentId === 'comptable' && (
          <SpreadsheetEditor agentId={agentId} agentName="Louis" />
        )}

        {/* ═══ TAB: DOCUMENTS — Fichiers generes par l'agent ═══ */}
        {activeTab === 'documents' && (
          <AgentDocuments agentId={agentId} gradientFrom={gf} />
        )}

        {/* ═══ TAB: HISTORY — Planning operationnel + actions ═══ */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>
            ) : (
              <>
                {/* Timeline items — posts, emails, prospects */}
                {timelineItems.length > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-bold text-sm">{'\uD83D\uDCC5'} Planning {dn}</h3>
                      <span className="text-white/30 text-xs">{timelineItems.length} element{timelineItems.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-1.5">
                      {timelineItems.map((item, i) => {
                        const isCompleted = item.type === 'completed';
                        const isFailed = item.type === 'failed';
                        const isScheduled = item.type === 'scheduled';
                        const isDraft = item.type === 'draft';
                        const isHot = item.type === 'hot';
                        const statusColor = isCompleted ? 'border-emerald-500/30 bg-emerald-500/5' : isFailed ? 'border-red-500/30 bg-red-500/5' : isScheduled ? 'border-blue-500/30 bg-blue-500/5' : isHot ? 'border-orange-500/30 bg-orange-500/5' : 'border-white/10 bg-white/[0.02]';
                        const dotColor = isCompleted ? 'bg-emerald-400' : isFailed ? 'bg-red-400' : isScheduled ? 'bg-blue-400' : isHot ? 'bg-orange-400' : 'bg-white/30';
                        const badge = isCompleted ? 'Termine' : isFailed ? 'Echec' : isScheduled ? 'Prevu' : isDraft ? 'Brouillon' : isHot ? 'Chaud' : item.status || '';
                        const badgeStyle = isCompleted ? 'bg-emerald-500/15 text-emerald-400' : isFailed ? 'bg-red-500/15 text-red-400' : isScheduled ? 'bg-blue-500/15 text-blue-400' : isHot ? 'bg-orange-500/15 text-orange-400' : 'bg-white/10 text-white/40';
                        return (
                          <div key={item.id || i} className={`rounded-xl border ${statusColor} px-3 py-2.5 flex items-start gap-3`}>
                            {item.image ? (
                              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                                <img src={item.image} alt="" className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className={`w-3 h-3 rounded-full ${dotColor} flex-shrink-0 mt-1`} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-white text-xs font-medium truncate">{item.title}</div>
                              {item.subtitle && <div className="text-white/40 text-[10px] mt-0.5">{item.subtitle}</div>}
                              <div className="text-white/20 text-[10px] mt-0.5">
                                {item.date ? formatDateTime(item.date) : ''}{item.time ? ` a ${item.time}` : ''}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className={`text-[9px] px-2 py-0.5 rounded-full ${badgeStyle}`}>{badge}</span>
                              {item.link && <a href={item.link} target="_blank" rel="noopener" className="text-[9px] text-purple-400 hover:text-purple-300">Voir {'\u2197'}</a>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Action logs */}
                {tasks.length > 0 && (
                  <>
                    <div className="flex items-center justify-between mt-2">
                      <h3 className="text-white font-bold text-sm">{'\u26A1'} Actions {dn}</h3>
                      <span className="text-white/30 text-xs">{tasks.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {tasks.map((task, i) => (
                        <div key={task.id || i} className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5 flex items-start gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                            task.status === 'success' ? 'bg-emerald-400' : task.status === 'error' ? 'bg-red-400' : 'bg-white/30'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-white/80 text-[11px]">{task.description || task.type || 'Action'}</div>
                            {task.result && <div className="text-white/30 text-[10px] mt-0.5 truncate">{task.result}</div>}
                          </div>
                          <span className="text-[9px] text-white/20 flex-shrink-0">{formatDateTime(task.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {tasks.length === 0 && timelineItems.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
                    <div className="text-3xl mb-3">{icon}</div>
                    <p className="text-white/40 text-sm mb-1">Aucune activite pour le moment</p>
                    <p className="text-white/20 text-xs">Lancez une campagne pour voir l'historique ici</p>
                  </div>
                )}
              </>
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
                    <span className="text-white/20 text-[9px]">{task.created_at ? new Date(task.created_at).toLocaleString(_uiLoc(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
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
              {settingsSaved && (
                <span className="text-[10px] text-emerald-400 animate-in fade-in duration-300">{'\u2713'} Sauvegarde auto</span>
              )}
            </div>

            {/* Recommended badge */}
            <div className="rounded-xl bg-gradient-to-r from-purple-600/10 to-blue-600/10 border border-purple-500/20 px-4 py-3 flex items-center gap-3">
              <span className="text-lg">{'\uD83D\uDCA1'}</span>
              <div className="flex-1">
                <div className="text-purple-300 text-xs font-semibold">Parametrage recommande actif</div>
                <div className="text-white/40 text-[10px]">Basé sur votre type de business et les meilleures pratiques</div>
              </div>
            </div>

            {/* Adaptive performance insights — shown for the content agent
                when we have a performance_ranking in settings. Helps the
                client see the auto-optimisation loop at work. */}
            {agentId === 'content' && settings?.performance_ranking && (
              <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 px-4 py-4">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-lg">{'\uD83D\uDCCA'}</span>
                  <div className="flex-1">
                    <div className="text-emerald-300 text-xs font-semibold">Stratégie adaptative active</div>
                    <div className="text-white/50 text-[10px] mt-0.5">
                      Mise à jour chaque nuit à partir de l&apos;engagement IG de tes 30 derniers posts.
                      Confiance : {settings.performance_ranking.confidence === 'high' ? '\uD83D\uDFE2 élevée' : settings.performance_ranking.confidence === 'medium' ? '\uD83D\uDFE1 moyenne' : '\uD83D\uDD34 faible (patiente encore quelques jours)'}
                    </div>
                  </div>
                </div>

                {settings.performance_ranking.confidence !== 'low' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1.5">Meilleurs formats</div>
                      <div className="space-y-1">
                        {(settings.performance_ranking.by_format || []).slice(0, 3).map((f: any, i: number) => (
                          <div key={f.format} className="flex items-center justify-between text-[11px]">
                            <span className={i === 0 ? 'text-emerald-300 font-semibold capitalize' : 'text-white/60 capitalize'}>
                              {i === 0 ? '\u2B50 ' : `${i + 1}. `}{f.format}
                            </span>
                            <span className="text-white/40">{f.sample_size} posts</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1.5">Sujets qui marchent</div>
                      <div className="space-y-1">
                        {(settings.performance_ranking.by_pillar || []).slice(0, 3).map((p: any, i: number) => (
                          <div key={p.pillar} className="flex items-center justify-between text-[11px]">
                            <span className={i === 0 ? 'text-emerald-300 font-semibold' : 'text-white/60'}>
                              {i === 0 ? '\u2B50 ' : `${i + 1}. `}{p.pillar === 'tips' ? 'Conseils' : p.pillar === 'trends' ? 'Tendances' : p.pillar === 'demo' ? 'Démo produit' : p.pillar === 'social_proof' ? 'Preuve sociale' : p.pillar}
                            </span>
                            <span className="text-white/40">{p.sample_size}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1.5">Heures optimales</div>
                      <div className="space-y-1">
                        {(settings.performance_ranking.optimal_hours || []).length > 0 ? (
                          settings.performance_ranking.optimal_hours.map((h: string, i: number) => (
                            <div key={h} className="flex items-center gap-1.5 text-[11px]">
                              <span className={i === 0 ? 'text-emerald-300 font-semibold' : 'text-white/60'}>
                                {i === 0 ? '\u2B50 ' : ''}{h}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[11px] text-white/40 italic">Plus de data requise</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-white/40">
                  Jade utilise ces signaux automatiquement pour choisir format, sujet et heure de publication du prochain post.
                </div>
              </div>
            )}

            {/* Settings fields — grouped by category with step indicators */}
            {(() => {
              // Group settings by category (inferred from field keys)
              const groups: { title: string; icon: string; fields: typeof settingFields }[] = [];
              const modeFields = settingFields.filter(f => ['mode', 'active', 'notifications', 'auto_publish', 'auto_reply'].includes(f.key));
              const scheduleFields = settingFields.filter(f => f.key.includes('hour') || f.key.includes('per_day') || f.key.includes('frequency') || f.key.includes('max_per_day') || f.key.includes('max_dms'));
              const styleFields = settingFields.filter(f => f.key.includes('tone') || f.key.includes('style') || f.key.includes('caption') || f.key.includes('format') || f.key.includes('hashtag') || f.key.includes('signature'));
              const targetFields = settingFields.filter(f => f.key.includes('target') || f.key.includes('score') || f.key.includes('source') || f.key.includes('types') || f.key.includes('prospect'));
              const autoFields = settingFields.filter(f => f.key.includes('auto_') && !['auto_publish', 'auto_reply'].includes(f.key) || f.key.includes('relance') || f.key.includes('handover') || f.key.includes('reactivation') || f.key.includes('stop_'));
              const otherFields = settingFields.filter(f => !modeFields.includes(f) && !scheduleFields.includes(f) && !styleFields.includes(f) && !targetFields.includes(f) && !autoFields.includes(f));

              if (modeFields.length) groups.push({ title: 'Mode & Controle', icon: '\u{1F3AE}', fields: modeFields });
              if (scheduleFields.length) groups.push({ title: 'Frequence & Horaires', icon: '\u{1F552}', fields: scheduleFields });
              if (styleFields.length) groups.push({ title: 'Style & Ton', icon: '\u{1F3A8}', fields: styleFields });
              if (targetFields.length) groups.push({ title: 'Ciblage', icon: '\u{1F3AF}', fields: targetFields });
              if (autoFields.length) groups.push({ title: 'Automatisation', icon: '\u{1F916}', fields: autoFields });
              if (otherFields.length) groups.push({ title: 'Avance', icon: '\u2699\uFE0F', fields: otherFields });

              return groups.map((group, gi) => (
                <details key={gi} open={gi === 0} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden mb-3">
                  <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-white/5 transition">
                    <span>{group.icon}</span>
                    <span className="text-xs font-bold text-white flex-1">{group.title}</span>
                    <span className="text-[10px] text-white/30">{group.fields.length} options</span>
                  </summary>
                  <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {group.fields.map((field: any) => (
                field.type === 'header' ? (
                  <div key={field.key} className="col-span-full mt-2 mb-0.5 flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{field.label}</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                ) : (
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
                        className="bg-[#1a2744] border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 flex-shrink-0 min-w-[140px]"
                      >
                        {field.options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
              )))}
                  </div>
                </details>
              ));
            })()}

            {/* Customization section */}
            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h4 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                <span>{'\u{1F3A8}'}</span> Personnaliser {dn}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-[10px] font-medium mb-1.5 block">Nom personnalisé</label>
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
                  <label className="text-white/60 text-[10px] font-medium mb-1.5 block">Avatar personnalisé</label>
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
                  note: 'Une fois connecte, Lena publie automatiquement selon ta frequence choisie',
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

              // Integration code only for Business+ plans (fondateurs, business, elite, agence)
              const integrationPlans = new Set(['fondateurs', 'business', 'elite', 'agence', 'admin']);
              const hasIntegration = integrationPlans.has(userPlan);

              // Replace VOTRE_CLE with actual widget key
              const displayCode = widgetKey ? config.code.replace(/VOTRE_CLE/g, widgetKey) : config.code;

              // Agents that don't need code embed (just connection instructions) — show to all
              const noCodeAgents = new Set(['content', 'dm_instagram', 'gmaps', 'comptable']);
              const needsCode = !noCodeAgents.has(agentId);

              if (needsCode && !hasIntegration) {
                return (
                  <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 text-center">
                    <span className="text-2xl">{'\u{1F512}'}</span>
                    <h4 className="text-white font-bold text-sm mt-2 mb-1">Integration disponible avec Business</h4>
                    <p className="text-white/40 text-xs mb-3">Integre {dn} directement sur ton site web avec un code embed.</p>
                    <a href="/pricing" className="inline-block px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold rounded-xl hover:opacity-90 transition">Passer au Business</a>
                  </div>
                );
              }

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
                          Générer ma cle d&apos;integration
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
      {/* Visible when chat is fully closed OR minimised — same bubble
          re-expands the chat. Avatar visible when minimised so the
          user knows the conversation is still alive (vs the generic
          chat icon when starting fresh). */}
      {(!chatOpen || chatMinimised) && (
        <button
          onClick={() => { setChatOpen(true); setChatMinimised(false); }}
          className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full shadow-2xl hover:scale-105 flex items-center justify-center transition-all lg:bottom-8 lg:right-8 overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${gf}, ${gt})` }}
          aria-label={chatMinimised ? `Rouvrir la conversation avec ${dn}` : `Ouvrir une conversation avec ${dn}`}
          title={chatMinimised ? `Rouvrir la conversation avec ${dn}` : `Ouvrir une conversation avec ${dn}`}
        >
          {chatMinimised && av ? (
            <img src={av} alt={dn} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} />
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          )}
          {chatMinimised && messages.length > 0 && (
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a1628]" />
          )}
        </button>
      )}

      {/* ═══ CHAT SLIDE-OVER ═══ */}
      {chatOpen && !chatMinimised && (
        <>
          {isMobile && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setChatMinimised(true)} />}
          <div className={`fixed z-50 flex flex-col ${isMobile ? 'inset-0' : 'bottom-4 right-4 w-[380px] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden'}`} style={{ animation: 'slideIn 0.25s ease-out', ...(!isMobile ? { height: 'min(480px, calc(100vh - 100px))' } : {}), ...(isMobile ? { paddingTop: 'env(safe-area-inset-top, 0px)' } : {}) }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0" style={{ background: `linear-gradient(135deg, ${gf}, ${gt})` }}>
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/15">
                {av ? <img src={av} alt={dn} className="w-full h-full object-cover" style={{ objectPosition: 'top center' }} /> : <span className="text-lg">{icon}</span>}
              </div>
              <div className="flex-1 min-w-0"><h3 className="text-white font-semibold text-sm truncate">{dn}</h3><div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-400" /><span className="text-white/60 text-[10px]">En ligne</span></div></div>
              {/* Minimise — keeps the conversation alive but collapses
                  to the floating bubble so the user can read the screen
                  without losing context. Mobile users get this by tapping
                  the backdrop too. */}
              <button
                onClick={() => setChatMinimised(true)}
                className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors flex-shrink-0"
                aria-label="Réduire la conversation"
                title="Réduire (garde la conversation ouverte)"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" /></svg>
              </button>
              <button
                onClick={() => { setChatOpen(false); setChatMinimised(false); }}
                className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors flex-shrink-0"
                aria-label="Fermer la conversation"
                title="Fermer"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
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
            <div className="border-t border-white/10 bg-[#0f1f3d] p-3 flex-shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}>
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
