'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import SubscriptionModal from '@/components/SubscriptionModal';
import EmailGateModal from '@/components/EmailGateModal';
import SignupGateModal from '@/components/SignupGateModal';
import AdminBadge from '@/components/AdminBadge';
import ProfileEnrichmentModal, { shouldShowEnrichmentModal } from '@/components/ProfileEnrichmentModal';
import { useGenerationLimit } from '@/hooks/useGenerationLimit';
import { useEditLimit } from '@/hooks/useEditLimit';
import { useCredits } from '@/hooks/useCredits';
import { useFeedbackPopup } from '@/hooks/useFeedbackPopup';
import FeedbackPopup from '@/components/FeedbackPopup';
import FeedbackModal from '@/components/FeedbackModal';
import { CREDIT_COSTS, getVideoCreditCost, VIDEO_DURATIONS } from '@/lib/credits/constants';
import { supabase } from '@/lib/supabase';
import { supabaseBrowser } from '@/lib/supabase/client';
import { generateTextSuggestions } from '@/lib/text-suggestion';
import { addTextOverlay } from '@/lib/canvas-text-overlay';
import { addWatermark, isFreemiumUser } from '@/lib/add-watermark';
import { computeSocialScore } from '@/lib/news/socialRanker';
import { startCheckout } from '@/lib/stripe/checkout';
import { useLanguage } from '@/lib/i18n/context';
import { NEWS_REGIONS } from '@/lib/newsProviders';

/* ---------------- Types ---------------- */
type NewsCard = {
  id: string;
  title: string;
  description: string;
  url: string;
  image?: string;
  source?: string;
  date?: string;
  category?: string;
};

const POSITIVE_KEYWORDS = [
  // Mots positifs généraux
  'bonne nouvelle', 'bonnes nouvelles', 'bonne surprise', 'record', 'succès', 'succes', 'réussite', 'reussite',
  'victoire', 'champion', 'médaille', 'medaille', 'exploit', 'triomphe', 'bravo', 'félicitations', 'felicitations',
  'progrès', 'progres', 'avancée', 'avancee', 'percée', 'percee', 'découverte', 'decouverte', 'innovation',
  'inauguration', 'lancement', 'ouverture', 'naissance', 'mariage', 'solidarité', 'solidarite', 'générosité',
  'generosite', 'don', 'bénévole', 'benevole', 'sauvetage', 'guérison', 'guerison', 'rémission', 'remission',
  'espoir', 'optimisme', 'croissance', 'hausse', 'augmentation', 'création d\'emploi', 'embauche', 'recrutement',
  'solution', 'résolu', 'resolu', 'sauvé', 'sauve', 'héros', 'heros', 'héroïne', 'heroine',
  // Environnement positif
  'énergie renouvelable', 'energie renouvelable', 'transition écologique', 'biodiversité', 'biodiversite',
  'reforestation', 'protection', 'préservation', 'preservation', 'espèce sauvée', 'recyclage', 'zéro déchet',
  // Tech / Science positif
  'avancée scientifique', 'traitement', 'vaccin', 'remède', 'remede', 'thérapie', 'therapie', 'levée de fonds',
  'licorne', 'startup', 'french tech', 'intelligence artificielle au service',
  // Sport positif
  'titre', 'sacre', 'qualification', 'finale', 'or', 'argent', 'bronze', 'sélection', 'selection',
  // Social positif
  'gratuité', 'gratuite', 'gratuit', 'accessibilité', 'accessibilite', 'inclusion', 'égalité', 'egalite',
  'entraide', 'communauté', 'communaute', 'ensemble', 'unis',
  // Joie et émotion
  'récompense', 'meilleur', 'exceptionnel', 'incroyable', 'formidable', 'magnifique',
  'sourire', 'rire', 'joie', 'bonheur', 'fête', 'fete', 'célébration', 'celebration', 'cadeau',
  'offert', 'surprise', 'merveilleux', 'extraordinaire',
  'adoption', 'miracle', 'touchant', 'émouvant', 'emouvant', 'inspirant',
  'record du monde', 'première mondiale', 'premiere mondiale', 'jamais vu',
];

// Mots à exclure pour les bonnes nouvelles (négatifs)
const NEGATIVE_KEYWORDS = [
  'mort', 'décès', 'deces', 'tué', 'tue', 'meurtre', 'assassinat', 'attentat', 'guerre', 'conflit',
  'crise', 'crash', 'effondrement', 'faillite', 'licenciement', 'fermeture', 'catastrophe', 'tragédie',
  'tragedie', 'scandale', 'corruption', 'fraude', 'arnaque', 'escroquerie', 'agression', 'violence',
  'accident mortel', 'incendie', 'inondation', 'séisme', 'ouragan', 'tempête', 'alerte', 'danger',
  'pénurie', 'penurie', 'inflation', 'récession', 'recession', 'dette', 'déficit', 'deficit',
  'condamné', 'condamne', 'prison', 'garde à vue', 'mise en examen', 'procès', 'proces',
  'viol', 'abus', 'harcèlement', 'harcelement', 'disparition', 'enlèvement', 'enlevement', 'otage',
  'grève', 'greve', 'émeute', 'emeute', 'drogue', 'overdose', 'terrorisme', 'fusillade',
];

const CATEGORIES = [
  'Les bonnes nouvelles',
  'Dernières news',
  'Tech & Gaming',
  'Business & Finance',
  'Santé & Bien-être',
  'Sport',
  'Cinéma & Séries',
  'Musique & Festivals',
  'Politique',
  'Science & Environnement',
  'Nature & Animaux',
  'International',
  'Moteurs & Adrénaline',
  'Food & Gastronomie',
  'Lifestyle & People',
];

/* ---------------- Page principale ---------------- */
export default function GeneratePage() {
  const router = useRouter();
  const { t, locale } = useLanguage();

  /* --- Auth user ID for scoped localStorage --- */
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  /* --- Wizard step (1-4) --- */
  const [formStep, setFormStep] = useState(1);

  /* --- États pour les actualités --- */
  const [category, setCategory] = useState<string>('Derni\u00E8res news');
  const [newsRegion, setNewsRegion] = useState<string>('fr');
  const [searchQuery, setSearchQuery] = useState('');
  const [allNewsItems, setAllNewsItems] = useState<NewsCard[]>([]); // Toutes les news en cache
  const [loading, setLoading] = useState(true); // TRUE au départ pour afficher "Chargement..."
  const [error, setError] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsCard | null>(null);
  const [useNewsMode, setUseNewsMode] = useState<boolean>(true); // true = avec actualité, false = sans actualité
  const [monthlyStats, setMonthlyStats] = useState<{ images: number; videos: number; assistant: number } | null>(null);
  const [trendingData, setTrendingData] = useState<{ googleTrends: any[]; tiktokHashtags: any[]; trendingMusic: any[]; tiktokTrends: any[]; instagramTrends: any[]; linkedinTrends?: any[]; instagramHashtags?: any[]; tiktokRealHashtags?: any[]; keywords: string[] } | null>(null);
  const [trendTab, setTrendTab] = useState<'google' | 'tiktok' | 'instagram' | 'linkedin'>('google');

  /* --- Ref pour le scroll auto sur mobile --- */
  const promptSectionRef = useRef<HTMLDivElement>(null);
  const uploadSectionRef = useRef<HTMLDivElement>(null);
  const assistantPanelRef = useRef<HTMLDivElement>(null);

  /* --- Toujours afficher toutes les catégories --- */
  const availableCategories = CATEGORIES;

  /* --- Filtrer les news selon cat\u00E9gorie et recherche --- */
  const filteredNews = useMemo(() => {
    let items = allNewsItems;

    // Filtre sp\u00E9cial pour "Les bonnes nouvelles" :
    if (category === 'Les bonnes nouvelles') {
      items = allNewsItems.filter((item) => {
        const text = (item.title + ' ' + item.description).toLowerCase();
        const hasNegative = NEGATIVE_KEYWORDS.some(kw => text.includes(kw));
        if (hasNegative) return false;
        if (item.category === 'Les bonnes nouvelles') return true;
        const hasPositive = POSITIVE_KEYWORDS.some(kw => text.includes(kw));
        return hasPositive;
      }).sort((a, b) => {
        const scoreA = POSITIVE_KEYWORDS.filter(kw => (a.title + ' ' + a.description).toLowerCase().includes(kw)).length;
        const scoreB = POSITIVE_KEYWORDS.filter(kw => (b.title + ' ' + b.description).toLowerCase().includes(kw)).length;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
    } else if (category === 'Derni\u00E8res news') {
      // Toutes les news tri\u00E9es par date
      items = [...allNewsItems].sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
    } else {
      // Filtre par cat\u00E9gorie normale
      items = items.filter((item) => item.category === category);
    }

    // D\u00E9doublonnage global (toutes cat\u00E9gories)
    const seen = new Set<string>();
    items = items.filter(item => {
      const key = item.title.toLowerCase().substring(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filtre par recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter((item) =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );
    }

    return items.slice(0, 9); // max 9 = 3\u00D73 grille propre
  }, [allNewsItems, category, searchQuery]);

  // Nombre d'articles visibles (3 → 6 → 9 via bouton "Afficher plus")
  const [visibleNewsCount, setVisibleNewsCount] = useState(3);
  // Reset à 3 quand on change de catégorie ou de recherche
  useEffect(() => { setVisibleNewsCount(3); }, [category, searchQuery]);

  /* --- Astuce du jour (rotation quotidienne) --- */
  const MARKETING_TIPS = [
    { icon: '📊', text: t.generate.tip1 },
    { icon: '⏰', text: t.generate.tip2 },
    { icon: '🎨', text: t.generate.tip3 },
    { icon: '📱', text: t.generate.tip4 },
    { icon: '💬', text: t.generate.tip5 },
    { icon: '🔥', text: t.generate.tip6 },
    { icon: '✨', text: t.generate.tip7 },
    { icon: '🎯', text: t.generate.tip8 },
    { icon: '💡', text: t.generate.tip9 },
    { icon: '📈', text: t.generate.tip10 },
    { icon: '🌟', text: t.generate.tip11 },
    { icon: '🎬', text: t.generate.tip12 },
    { icon: '👥', text: t.generate.tip13 },
    { icon: '🔔', text: t.generate.tip14 },
    { icon: '💎', text: t.generate.tip15 },
    { icon: '🚀', text: t.generate.tip16 },
    { icon: '🎨', text: t.generate.tip17 },
    { icon: '📝', text: t.generate.tip18 },
    { icon: '🔄', text: t.generate.tip19 },
    { icon: '👀', text: t.generate.tip20 },
    { icon: '💪', text: t.generate.tip21 },
    { icon: '🎁', text: t.generate.tip22 },
    { icon: '📱', text: t.generate.tip23 },
    { icon: '🌈', text: t.generate.tip24 },
    { icon: '⚡', text: t.generate.tip25 },
    { icon: '🎯', text: t.generate.tip26 },
    { icon: '💫', text: t.generate.tip27 },
    { icon: '📢', text: t.generate.tip28 },
    { icon: '🏆', text: t.generate.tip29 },
    { icon: '🎪', text: t.generate.tip30 },
  ];

  const dailyTip = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return MARKETING_TIPS[dayOfYear % MARKETING_TIPS.length];
  }, []);

  /* --- Hot topics curatés (sujets réels Google Trends + TikTok, mis à jour régulièrement) --- */
  const HOT_BOOST_KEYWORDS = [
    // Politique/International — sujets dominants
    'iran', 'khamenei', 'frappe', 'missile', 'hezbollah', 'conflit', 'moyen-orient', 'moyen orient',
    'municipales', 'élections municipales', 'elections municipales', 'premier tour', 'macron',
    'dissuasion', 'nucléaire', 'nucleaire',
    'taxe shein', 'taxe temu', 'taxe colis', 'petits colis',
    // Sport — événements en cours
    'six nations', '6 nations', 'grand chelem', 'xv de france', 'france rugby',
    'formule 1', 'gp australie', 'norris', 'verstappen', 'hamilton ferrari',
    'ligue des champions', 'champions league', 'huitièmes', 'huitiemes',
    'indian wells', 'masters 1000',
    'coupe du monde 2026',
    // Fun/Viral — tendances TikTok + culture
    'fashion week', 'défilé', 'defile', 'paris fashion',
    'tiktok trend', 'mc courgette', 'ballerine', 'trend viral',
    'shein', 'temu', 'aliexpress',
  ];

  /* --- Trending news (3 plus tendance, diversifié: 1 fun/viral, 1 politique, 1 sport) --- */
  const trendingNews: Array<{ id: string; title: string; description: string; url: string; image?: string; source: string; date?: string; category?: string; _score: number; _matchedTrends?: string[] }> = useMemo(() => {
    if (allNewsItems.length === 0) return [];

    const trendKeywords = trendingData?.keywords || [];
    const allBoostKeywords = [...new Set([...trendKeywords, ...HOT_BOOST_KEYWORDS])];
    const withImages = allNewsItems.filter((item: any) => item.image);
    const scored = withImages.map((item: any) => {
      const baseScore = computeSocialScore({
        id: item.id,
        title: item.title,
        summary: item.description,
        url: item.url,
        image: item.image,
        source: item.source,
        publishedAt: item.date,
      });

      // Bonus si l'article matche des tendances réelles Google/TikTok + hot topics curatés
      const text = (item.title + ' ' + item.description).toLowerCase();
      const matched = allBoostKeywords.filter((kw: string) => text.includes(kw.toLowerCase()));
      const trendBonus = Math.min(0.4, matched.length * 0.1);

      return {
        ...item,
        _score: Math.min(1, baseScore + trendBonus),
        _matchedTrends: matched.slice(0, 3),
      };
    });
    scored.sort((a: any, b: any) => b._score - a._score);

    // Diversité: 1 fun/viral, 1 politique/international, 1 sport
    const FUN_CATS = ['Lifestyle & People', 'Musique & Festivals', 'Cinéma & Séries', 'Food & Gastronomie', 'Nature & Animaux', 'Tech & Gaming'];
    const POLITIQUE_CATS = ['Politique', 'International', 'Business & Finance'];
    const SPORT_CATS = ['Sport', 'Moteurs & Adrénaline'];

    const pickBest = (cats: string[]) => scored.find((item: any) =>
      cats.some(c => (item.category || '').includes(c) || c.includes(item.category || ''))
    );

    const fun = pickBest(FUN_CATS);
    const politique = pickBest(POLITIQUE_CATS);
    const sport = pickBest(SPORT_CATS);

    // Assembler les 3, fallback au top 3 si une catégorie manque
    const diverse: typeof scored = [];
    const usedIds = new Set<string>();
    for (const pick of [fun, sport, politique]) {
      if (pick && !usedIds.has(pick.id)) {
        diverse.push(pick);
        usedIds.add(pick.id);
      }
    }
    // Compléter avec les meilleurs restants si < 3
    for (const item of scored) {
      if (diverse.length >= 3) break;
      if (!usedIds.has(item.id)) {
        diverse.push(item);
        usedIds.add(item.id);
      }
    }

    return diverse.slice(0, 3);
  }, [allNewsItems, trendingData]);

  /* --- États pour l'upload logo/photo --- */
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoMode, setLogoMode] = useState<'overlay' | 'modify'>('overlay'); // Mode: ajouter en overlay ou modifier l'image
  const [logoPosition, setLogoPosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-left');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* --- États pour l'assistant prompt --- */
  const [businessType, setBusinessType] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [marketingAngle, setMarketingAngle] = useState('');
  const [imageAngle, setImageAngle] = useState('');
  const [contentAngle, setContentAngle] = useState(''); // Angle du contenu (éditorial)
  const [storyToTell, setStoryToTell] = useState(''); // Nouvel état : histoire à raconter
  const [publicationGoal, setPublicationGoal] = useState(''); // Nouvel état : but de la publication
  const [contentFocus, setContentFocus] = useState(50); // 0=100% business, 100=100% actualité
  const [emotionToConvey, setEmotionToConvey] = useState(''); // Nouvel état : émotion à transmettre
  const [optionalText, setOptionalText] = useState(''); // Nouvel état : texte à ajouter (optionnel)
  const [textSuggestions, setTextSuggestions] = useState<string[]>([]); // Suggestions de texte intelligentes
  const [showTextSuggestions, setShowTextSuggestions] = useState(false); // Afficher les suggestions
  const [platform, setPlatform] = useState('Instagram');
  const [tone, setTone] = useState('');
  const [visualStyle, setVisualStyle] = useState('');
  const [characterStyle, setCharacterStyle] = useState<'real' | 'fiction'>('real'); // Humains réels vs personnages fiction
  const [renderStyle, setRenderStyle] = useState<'photo' | 'illustration'>('photo'); // Photo réaliste vs illustration
  const [specialist, setSpecialist] = useState<string>('');

  // NOUVELLES questions EXPERTES pour personnalisation ultra-précise
  const [problemSolved, setProblemSolved] = useState(''); // Quel problème vous résolvez face à cette actu
  const [uniqueAdvantage, setUniqueAdvantage] = useState(''); // Votre avantage unique vs concurrence
  const [desiredVisualIdea, setDesiredVisualIdea] = useState(''); // Idée vague du visuel souhaité
  const [autoFillLoading, setAutoFillLoading] = useState(false);

  /* --- États pour le sélecteur de profil de communication --- */
  const [communicationProfile, setCommunicationProfile] = useState<'inspirant' | 'expert' | 'urgent' | 'conversationnel'>('inspirant');

  // Presets de tons par profil - Stratégies marketing détaillées
  const tonePresets = {
    inspirant: {
      tone: 'Inspirant et chaleureux',
      emotion: 'Inspiration et espoir',
      goal: 'Inspirer et créer une connexion émotionnelle',
      story: 'Transformation et réussite humaine',
      visualStyle: 'Lumineux et épuré',
      imageAngle: 'Storytelling visuel authentique et inspirant',
      marketingAngle: useNewsMode
        ? 'Inspirer l\'audience via l\'actualité pour créer une connexion émotionnelle'
        : 'Inspirer l\'audience avec un moment authentique et une histoire humaine',
      icon: '✨',
      label: t.generate.toneInspiringLabel,
      description: t.generate.toneInspiringDesc,
      details: t.generate.toneInspiringDetails,
      example: t.generate.toneInspiringExample,
      marketingStrategy: t.generate.toneInspiringStrategy,
      whenToUse: t.generate.toneInspiringWhenToUse
    },
    expert: {
      tone: 'Professionnel et pédagogique',
      emotion: 'Confiance et crédibilité',
      goal: 'Éduquer et établir une autorité',
      story: 'Expertise et valeur apportée',
      visualStyle: 'Moderne et structuré',
      imageAngle: 'Visuel clair avec mots-clés et données visuelles professionnelles',
      marketingAngle: useNewsMode
        ? 'Se positionner en expert face à l\'actualité pour établir son autorité'
        : 'Démontrer son expertise et son savoir-faire unique pour établir son autorité',
      icon: '🎯',
      label: t.generate.toneExpertLabel,
      description: t.generate.toneExpertDesc,
      details: t.generate.toneExpertDetails,
      example: t.generate.toneExpertExample,
      marketingStrategy: t.generate.toneExpertStrategy,
      whenToUse: t.generate.toneExpertWhenToUse
    },
    urgent: {
      tone: 'Dynamique et percutant',
      emotion: 'Urgence et excitation',
      goal: 'Pousser à l\'action immédiate',
      story: 'Opportunité limitée et bénéfices concrets',
      visualStyle: 'Énergique et contrasté',
      imageAngle: 'Impact visuel maximal avec call-to-action fort et urgence visible',
      marketingAngle: useNewsMode
        ? 'Profiter de l\'opportunité créée par l\'actualité pour pousser à l\'action'
        : 'Créer un sentiment d\'urgence et de rareté pour pousser à l\'action',
      icon: '⚡',
      label: t.generate.toneUrgentLabel,
      description: t.generate.toneUrgentDesc,
      details: t.generate.toneUrgentDetails,
      example: t.generate.toneUrgentExample,
      marketingStrategy: t.generate.toneUrgentStrategy,
      whenToUse: t.generate.toneUrgentWhenToUse
    },
    conversationnel: {
      tone: 'Amical et accessible',
      emotion: 'Proximité et authenticité',
      goal: 'Créer du dialogue et de l\'engagement',
      story: 'Expériences partagées et humanité',
      visualStyle: 'Naturel et chaleureux',
      imageAngle: 'Visuel naturel et authentique qui invite au dialogue',
      marketingAngle: useNewsMode
        ? 'Surfer sur la tendance de l\'actualité de manière conversationnelle'
        : 'Engager la conversation avec authenticité et proximité',
      icon: '💬',
      label: t.generate.toneDialogLabel,
      description: t.generate.toneDialogDesc,
      details: t.generate.toneDialogDetails,
      example: t.generate.toneDialogExample,
      marketingStrategy: t.generate.toneDialogStrategy,
      whenToUse: t.generate.toneDialogWhenToUse
    }
  };

  /* --- États pour la génération --- */
  const [generating, setGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null); // Image SANS overlays pour édition studio
  const [imageWithWatermarkOnly, setImageWithWatermarkOnly] = useState<string | null>(null); // Image avec watermark SEULEMENT (sans texte overlay)
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [imageSavedToLibrary, setImageSavedToLibrary] = useState(false);
  const [lastSavedImageId, setLastSavedImageId] = useState<string | null>(null);
  const [lastSavedVideoId, setLastSavedVideoId] = useState<string | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  /* --- États pour l'éditeur de texte overlay intégré (système array) --- */
  interface GenerateTextOverlay {
    id: string;
    text: string;
    position: number; // 0-100 percentage from top
    fontSize: number;
    fontFamily: string;
    textColor: string;
    backgroundColor: string;
    backgroundStyle: 'clean' | 'none' | 'transparent' | 'solid' | 'gradient' | 'blur' | 'outline' | 'minimal' | 'glow';
  }
  const [overlayText, setOverlayText] = useState('');
  const [textPosition, setTextPosition] = useState<number>(50); // 0=top, 50=center, 100=bottom
  const [textColor, setTextColor] = useState('#ffffff');
  const [textBackgroundColor, setTextBackgroundColor] = useState('rgba(0, 0, 0, 0.5)');
  const [fontSize, setFontSize] = useState(60);
  const [fontFamily, setFontFamily] = useState<'inter' | 'montserrat' | 'bebas' | 'roboto' | 'playfair'>('inter');
  const [backgroundStyle, setBackgroundStyle] = useState<'clean' | 'none' | 'transparent' | 'solid' | 'gradient' | 'blur' | 'outline' | 'minimal' | 'glow'>('none');
  const [textTemplate, setTextTemplate] = useState<'headline' | 'cta' | 'minimal' | 'bold' | 'elegant' | 'modern'>('headline');
  const [textPreviewUrl, setTextPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [baseOriginalImageUrl, setBaseOriginalImageUrl] = useState<string | null>(null);
  const [textOverlayItems, setTextOverlayItems] = useState<GenerateTextOverlay[]>([]);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);

  /* --- États pour le loader avancé --- */
  const [imageLoadingProgress, setImageLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState<'api' | 'download' | 'ready'>('api');

  /* --- États pour la génération vidéo --- */
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoTaskId, setVideoTaskId] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<string>('');
  const [videoSavedToLibrary, setVideoSavedToLibrary] = useState(false);
  const [enableAIText, setEnableAIText] = useState(false);
  const [aiTextStyle, setAITextStyle] = useState('wordflash'); // wordflash, wordstay, neon, cinema, impact, minimal
  const [subtitleFontSize, setSubtitleFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const [subtitlePosition, setSubtitlePosition] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [videoAspectRatio, setVideoAspectRatio] = useState('16:9');
  const [videoDuration, setVideoDuration] = useState(10);
  const [videoGenerationMode, setVideoGenerationMode] = useState<'simple' | 'advanced'>('simple');
  const [advancedSegments, setAdvancedSegments] = useState<Array<{
    index: number;
    duration: 5 | 10;
    prompt: string;
    cameraMovement: string;
    transition: string;
  }>>([]);
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [videoLongJobId, setVideoLongJobId] = useState<string | null>(null);
  const [videoLongSegments, setVideoLongSegments] = useState<any[]>([]);
  const [videoLongStatus, setVideoLongStatus] = useState<string>('');
  const [videoLongProgress, setVideoLongProgress] = useState(0);
  const [generationMode, setGenerationMode] = useState<'image' | 'video'>('image');
  const [lastProvider, setLastProvider] = useState<string>('');
  const [lastVideoProvider, setLastVideoProvider] = useState<string>('');

  /* --- États pour la génération audio TTS --- */
  const [addAudio, setAddAudio] = useState(false);
  const [audioTextSource, setAudioTextSource] = useState<'ai' | 'manual'>('ai');
  const [audioText, setAudioText] = useState('');
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('JBFqnCBsd6RMkjVDRZzb'); // ElevenLabs George (Homme narrateur)
  const [addMusic, setAddMusic] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState('none');
  const [generatedSubtitleText, setGeneratedSubtitleText] = useState('');
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const [videoEditorMerging, setVideoEditorMerging] = useState(false);

  /* --- États pour le studio d'édition --- */
  const [showEditStudio, setShowEditStudio] = useState(false);
  const [modalMinimized, setModalMinimized] = useState(false);
  const [editVersions, setEditVersions] = useState<string[]>([]); // Images propres (sans texte)
  const [versionPreviews, setVersionPreviews] = useState<Record<string, string>>({}); // Previews avec overlays pour miniatures
  const [selectedEditVersion, setSelectedEditVersion] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editStrength, setEditStrength] = useState(5.5);
  const [editingImage, setEditingImage] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'image' | 'edit' | 'text' | 'versions'>('image');
  const prevActiveTabRef = useRef<string>('image');
  const skipAutoEditRef = useRef(false); // Empêche l'auto-edit après clic "{t.generate.newText}"

  /* --- États pour le système freemium --- */
  const generationLimit = useGenerationLimit();
  const editLimit = useEditLimit();
  const credits = useCredits();
  const feedback = useFeedbackPopup();
  const [sprintTick, setSprintTick] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [showSignupGate, setShowSignupGate] = useState(false);
  const [showEditEmailGate, setShowEditEmailGate] = useState(false);
  const [showEditSignupGate, setShowEditSignupGate] = useState(false);
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);
  const [showRequiresAccountModal, setShowRequiresAccountModal] = useState(false);
  const [enrichmentProfile, setEnrichmentProfile] = useState<any>(null);
  const [enrichmentUserId, setEnrichmentUserId] = useState<string>('');
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);

  // ─── Advanced video segment helpers ───
  const initAdvancedSegments = useCallback(() => {
    const segCount = Math.ceil(videoDuration / 10);
    const segs = Array.from({ length: segCount }, (_, i) => ({
      index: i,
      duration: 10 as 5 | 10,
      prompt: '',
      cameraMovement: i === 0 ? 'dolly_in' : 'tracking',
      transition: i < segCount - 1 ? 'smooth' : 'fade',
    }));
    setAdvancedSegments(segs);
  }, [videoDuration]);

  const autoFillSegments = useCallback(async () => {
    if (!businessDescription && !businessType) return;
    setIsDecomposing(true);
    try {
      const basePrompt = `${businessType}${businessDescription ? ' — ' + businessDescription : ''}`;
      const res = await fetch('/api/seedream/video-long/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: basePrompt,
          duration: videoDuration,
          options: { renderStyle, tone, visualStyle },
        }),
      });
      const data = await res.json();
      if (data.ok && data.segments) {
        setAdvancedSegments(data.segments.map((s: any, i: number) => ({
          index: i,
          duration: s.duration || 10,
          prompt: s.prompt || '',
          cameraMovement: s.cameraMovement || 'tracking',
          transition: s.transition || 'smooth',
        })));
      }
    } catch (e) {
      console.error('[Advanced] Auto-fill failed:', e);
    } finally {
      setIsDecomposing(false);
    }
  }, [businessDescription, businessType, videoDuration, renderStyle, tone, visualStyle]);

  const updateSegment = useCallback((index: number, field: string, value: any) => {
    setAdvancedSegments(prev => prev.map((seg, i) =>
      i === index ? { ...seg, [field]: value } : seg
    ));
  }, []);

  const addSegment = useCallback(() => {
    setAdvancedSegments(prev => [
      ...prev,
      {
        index: prev.length,
        duration: 10 as 5 | 10,
        prompt: '',
        cameraMovement: 'tracking',
        transition: 'smooth',
      },
    ]);
  }, []);

  const removeSegment = useCallback((index: number) => {
    if (advancedSegments.length <= 2) return;
    setAdvancedSegments(prev =>
      prev.filter((_, i) => i !== index).map((seg, i) => ({ ...seg, index: i }))
    );
  }, [advancedSegments.length]);

  // Detect welcome param after email confirmation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome') === 'true') {
      setShowWelcome(true);
      window.history.replaceState({}, '', '/generate');
      // Auto-dismiss after 10s
      const timer = setTimeout(() => setShowWelcome(false), 10000);
      return () => clearTimeout(timer);
    }
  }, []);

  /* --- Fetch actualités + tendances (1 seul appel au chargement, cache 24h) --- */
  useEffect(() => {
    fetchAllNews();
    fetchTrends();
  }, []);

  useEffect(() => {
    fetchAllNews();
    fetchTrends(); // Re-fetch trends for the new region
  }, [newsRegion]);

  /* --- Fetch tendances réelles (Google Trends + TikTok, cache localStorage par région) --- */
  async function fetchTrends() {
    const TRENDS_CACHE_KEY = `keiro_trends_data_${newsRegion}`;
    const TRENDS_TTL = 12 * 60 * 60 * 1000; // 12h
    try {
      const cached = localStorage.getItem(TRENDS_CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (data && Date.now() - ts < TRENDS_TTL) {
          setTrendingData(data);
          return;
        }
      }
    } catch { /* */ }
    try {
      const res = await fetch(`/api/trends?region=${newsRegion}`);
      const json = await res.json();
      if (json.ok && json.data) {
        setTrendingData(json.data);
        try {
          localStorage.setItem(TRENDS_CACHE_KEY, JSON.stringify({ data: json.data, ts: Date.now() }));
        } catch { /* */ }
      }
    } catch (e) {
      console.error('[Trends] fetch error', e);
    }
  }

  /* --- Sprint countdown timer (refresh every 60s) --- */
  useEffect(() => {
    if (credits.plan !== 'sprint') return;
    const interval = setInterval(() => setSprintTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, [credits.plan]);

  /* --- Vérifier si l'utilisateur est connecté pour débloquer les limites --- */
  useEffect(() => {
    const checkAuth = async () => {
      const supabaseClient = supabaseBrowser();
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (user) {
        generationLimit.setHasAccount(true);
        editLimit.setHasAccount(true);
        setAuthUserId(user.id);
        console.log('[Generate] User authenticated:', user.email);

        // Load profile for enrichment modal
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('company_name, website, business_since, team_size, social_networks, posting_frequency, main_goal, marketing_budget, target_audience, acquisition_source, company_description, brand_tone, main_products, competitors, content_themes, social_goals_monthly')
          .eq('id', user.id)
          .single();

        if (profile && shouldShowEnrichmentModal(profile)) {
          setEnrichmentProfile(profile);
          setEnrichmentUserId(user.id);
          setShowEnrichmentModal(true);
        }
      } else {
        console.log('[Generate] No authenticated user');
      }
    };
    checkAuth();
  }, []);

  /* --- Auto-sélectionner la première catégorie avec des news si la catégorie actuelle est vide --- */
  /* DÉSACTIVÉ : laissons l'utilisateur choisir sa catégorie librement, même si elle est vide */

  /* --- Sauvegarder et restaurer l'état du formulaire --- */
  // Charger l'état sauvegardé SEULEMENT quand on connaît le userId (après auth)
  useEffect(() => {
    if (!authUserId) return; // Ne rien restaurer pour les visiteurs non connectés

    const storageKey = `keiro_form_${authUserId}`;
    const savedState = localStorage.getItem(storageKey);
    if (savedState) {
      try {
        const state = JSON.parse(savedState);

        // TTL : ignorer les données de plus de 2h
        if (state.savedAt) {
          const ageMs = Date.now() - new Date(state.savedAt).getTime();
          if (ageMs > 2 * 60 * 60 * 1000) {
            console.log('[Generate] Saved state expired (>2h), removing');
            localStorage.removeItem(storageKey);
            return;
          }
        }

        console.log('[Generate] Restoring saved form state for user:', authUserId);

        // Restaurer tous les états
        if (state.selectedNews) setSelectedNews(state.selectedNews);
        if (state.useNewsMode !== undefined) setUseNewsMode(state.useNewsMode);
        if (state.category) setCategory(state.category);
        if (state.communicationProfile) setCommunicationProfile(state.communicationProfile);
        if (state.businessType) setBusinessType(state.businessType);
        if (state.businessDescription) setBusinessDescription(state.businessDescription);
        if (state.targetAudience) setTargetAudience(state.targetAudience);
        if (state.tone) setTone(state.tone);
        if (state.emotionToConvey) setEmotionToConvey(state.emotionToConvey);
        if (state.visualStyle) setVisualStyle(state.visualStyle);
        if (state.publicationGoal) setPublicationGoal(state.publicationGoal);
        if (state.marketingAngle) setMarketingAngle(state.marketingAngle);
        if (state.imageAngle) setImageAngle(state.imageAngle);
        if (state.storyToTell) setStoryToTell(state.storyToTell);
        if (state.optionalText) setOptionalText(state.optionalText);
        if (state.platform) setPlatform(state.platform);
        if (state.specialist) setSpecialist(state.specialist);
        // Questions EXPERTES
        if (state.problemSolved) setProblemSolved(state.problemSolved);
        if (state.uniqueAdvantage) setUniqueAdvantage(state.uniqueAdvantage);
        if (state.desiredVisualIdea) setDesiredVisualIdea(state.desiredVisualIdea);
        if (state.contentFocus !== undefined) setContentFocus(state.contentFocus);

        // Nettoyer après restauration
        localStorage.removeItem(storageKey);
      } catch (error) {
        console.error('[Generate] Error loading saved state:', error);
      }
    }

    // Nettoyer aussi l'ancienne clé non scopée (migration)
    localStorage.removeItem('keiro_generate_form_state');
  }, [authUserId]);

  /* --- Charger les stats mensuelles (visuels + vidéos créés ce mois) --- */
  useEffect(() => {
    const fetchMonthlyStats = async () => {
      try {
        const sb = supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { count: imageCount } = await sb
          .from('saved_images')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', firstDayOfMonth);
        const { count: videoCount } = await sb
          .from('my_videos')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', firstDayOfMonth);
        const { data: assistantData } = await sb
          .from('assistant_usage_limits')
          .select('messages_this_month')
          .eq('user_id', user.id)
          .single();
        setMonthlyStats({ images: imageCount || 0, videos: videoCount || 0, assistant: assistantData?.messages_this_month || 0 });
      } catch (error) {
        console.error('[Generate] Error fetching monthly stats:', error);
      }
    };
    fetchMonthlyStats();
  }, []);

  // Sauvegarder l'état à chaque changement (SEULEMENT si connecté, avec debounce)
  useEffect(() => {
    if (!authUserId) return; // Ne pas sauvegarder pour les visiteurs non connectés

    const timeoutId = setTimeout(() => {
      const state = {
        selectedNews,
        useNewsMode,
        category,
        communicationProfile,
        businessType,
        businessDescription,
        targetAudience,
        tone,
        emotionToConvey,
        visualStyle,
        publicationGoal,
        marketingAngle,
        imageAngle,
        storyToTell,
        optionalText,
        platform,
        specialist,
        // Questions EXPERTES
        problemSolved,
        uniqueAdvantage,
        desiredVisualIdea,
        contentFocus,
        savedAt: new Date().toISOString()
      };

      localStorage.setItem(`keiro_form_${authUserId}`, JSON.stringify(state));
    }, 1000); // Debounce de 1 seconde

    return () => clearTimeout(timeoutId);
  }, [
    selectedNews,
    useNewsMode,
    category,
    communicationProfile,
    businessType,
    businessDescription,
    targetAudience,
    tone,
    emotionToConvey,
    visualStyle,
    publicationGoal,
    marketingAngle,
    imageAngle,
    storyToTell,
    optionalText,
    platform,
    specialist,
    // Questions EXPERTES
    problemSolved,
    uniqueAdvantage,
    desiredVisualIdea,
    contentFocus,
    authUserId
  ]);

  /* --- Auto-scroll vers la section upload sur mobile après sélection d'une actualité --- */
  useEffect(() => {
    if (selectedNews && uploadSectionRef.current) {
      // Vérifier si on est sur mobile (< 768px)
      const isMobile = window.innerWidth < 768;

      if (isMobile) {
        // Attendre un court instant pour que le rendu soit complet
        setTimeout(() => {
          uploadSectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }, 100);
      }
    }
  }, [selectedNews]);

  async function fetchAllNews() {
    const CACHE_KEY = 'keiro_news_cache_' + newsRegion;
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

    // 1. Charger le cache immédiatement (même s'il est expiré = stale-while-revalidate)
    let hasCache = false;
    let cacheExpired = false;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { items, ts } = JSON.parse(cached);
        if (items?.length > 0) {
          setAllNewsItems(items);
          setLoading(false);
          hasCache = true;
          cacheExpired = Date.now() - ts >= CACHE_TTL;
          if (!cacheExpired) return; // Cache frais → terminé
        }
      }
    } catch { /* localStorage indisponible */ }

    // 2. Phase 1 : fetch prioritaire "Les bonnes nouvelles" (2 flux, <3s)
    //    → le client voit du contenu immédiatement pendant que le reste charge
    if (!hasCache) {
      setLoading(true);
      try {
        const priorityRes = await fetch('/api/news?priority=true&region=' + newsRegion);
        if (priorityRes.ok) {
          const priorityData = await priorityRes.json();
          if (priorityData?.ok && priorityData.items?.length > 0) {
            setAllNewsItems(priorityData.items);
            setLoading(false); // Bonnes nouvelles visibles immédiatement
          }
        }
      } catch { /* silently continue to full fetch */ }
    }

    // 3. Phase 2 : fetch complet de toutes les catégories (en arrière-plan)
    try {
      setError(null);
      const res = await fetch('/api/news?all=true&region=' + newsRegion);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Erreur de chargement');
      const items = data.items || [];
      setAllNewsItems(items);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ items, ts: Date.now() }));
      } catch { /* quota exceeded */ }
    } catch (e: any) {
      console.error('fetchAllNews error', e);
      if (!hasCache) {
        setError(t.generate.errorLoadingNews);
        setAllNewsItems([]);
      }
      // Si on avait un cache expiré, on garde les anciennes news silencieusement
    } finally {
      setLoading(false);
    }
  }

  /* --- Gestion recherche instantanée (filtrage côté client) --- */
  function handleSearchChange(value: string) {
    setSearchQuery(value);
  }

  /* --- Upload logo/photo --- */
  async function handleFileUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || t.generate.errorUploadFailedPrefix);
      setLogoUrl(data.url);
    } catch (e: any) {
      alert(t.generate.alertUploadFailed);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }

  /* --- Remplissage automatique selon spécialité + profil communication --- */
  function applySpecialistSuggestion(specialistType: string) {
    // Récupérer les valeurs du profil actuel
    const currentProfile = tonePresets[communicationProfile];

    // Définir les objectifs et angles selon le specialist
    const specialistGoals: Record<string, any> = {
      seo: {
        goal: 'Augmenter la visibilité et le référencement naturel',
        imageAngle: 'Visuel clair avec mots-clés visuels du secteur',
        story: 'Expertise et autorité dans le domaine',
        marketingAngle: useNewsMode
          ? 'Se positionner en expert face à l\'actualité'
          : 'Se positionner en expert de son domaine avec un contenu éducatif',
      },
      marketing: {
        goal: 'Générer de l\'engagement et des conversions',
        imageAngle: 'Visuel accrocheur avec call-to-action visuel',
        story: 'Bénéfices concrets pour le client',
        marketingAngle: useNewsMode
          ? 'Profiter de l\'opportunité créée par l\'actualité'
          : 'Mettre en avant les bénéfices concrets pour déclencher l\'action',
      },
      content: {
        goal: 'Éduquer et créer du lien avec l\'audience',
        imageAngle: 'Storytelling visuel authentique',
        story: 'Valeurs de la marque et authenticité',
        marketingAngle: useNewsMode
          ? 'Surfer sur la tendance de l\'actualité'
          : 'Raconter une histoire authentique qui crée du lien',
      },
      copywriter: {
        goal: 'Convaincre et pousser à l\'action',
        imageAngle: 'Impact visuel maximal avec hiérarchie claire',
        story: 'Transformation et résultats',
        marketingAngle: useNewsMode
          ? 'Résoudre le problème soulevé par l\'actualité'
          : 'Résoudre un problème concret du client avec impact',
      },
    };

    const specialist = specialistGoals[specialistType];
    if (!specialist) return;

    // Adapter l'émotion selon le profil + specialist
    let adaptedEmotion = currentProfile.emotion;

    if (specialistType === 'seo') {
      // SEO privilégie la confiance
      if (communicationProfile === 'inspirant') adaptedEmotion = 'Confiance inspirante';
      else if (communicationProfile === 'expert') adaptedEmotion = 'Autorité et crédibilité';
      else if (communicationProfile === 'urgent') adaptedEmotion = 'Urgence professionnelle';
      else adaptedEmotion = 'Confiance accessible';
    } else if (specialistType === 'marketing') {
      // Marketing privilégie l'action
      if (communicationProfile === 'inspirant') adaptedEmotion = 'Désir et aspiration';
      else if (communicationProfile === 'expert') adaptedEmotion = 'Confiance et décision';
      else if (communicationProfile === 'urgent') adaptedEmotion = 'Urgence et excitation';
      else adaptedEmotion = 'Enthousiasme authentique';
    } else if (specialistType === 'content') {
      // Content privilégie la connexion
      if (communicationProfile === 'inspirant') adaptedEmotion = 'Inspiration et connexion';
      else if (communicationProfile === 'expert') adaptedEmotion = 'Valeur éducative';
      else if (communicationProfile === 'urgent') adaptedEmotion = 'Impact émotionnel fort';
      else adaptedEmotion = 'Authenticité et proximité';
    } else if (specialistType === 'copywriter') {
      // Copywriting privilégie la persuasion
      if (communicationProfile === 'inspirant') adaptedEmotion = 'Motivation et transformation';
      else if (communicationProfile === 'expert') adaptedEmotion = 'Persuasion rationnelle';
      else if (communicationProfile === 'urgent') adaptedEmotion = 'Urgence persuasive';
      else adaptedEmotion = 'Persuasion conversationnelle';
    }

    // Appliquer les valeurs combinées
    setPublicationGoal(specialist.goal);
    setImageAngle(specialist.imageAngle);
    setStoryToTell(specialist.story);
    setMarketingAngle(specialist.marketingAngle);
    setEmotionToConvey(adaptedEmotion);

    // Le ton et le style restent ceux du profil (déjà définis)
    // Mais on pourrait les ajuster légèrement si nécessaire
  }

  /* --- Auto-fill IA contextuel — rempli UNIQUEMENT l'étape demandée --- */
  async function handleAiAutoFill(step: 'direction' | 'creatif' | 'expert') {
    if (!businessType.trim()) {
      alert(t.generate.alertBusinessFirst);
      return;
    }
    if (useNewsMode && !selectedNews) {
      alert(locale === 'fr' ? 'S\u00E9lectionnez une actualit\u00E9 d\'abord pour que le remplissage automatique fasse le lien entre votre business et l\'actu.' : 'Select a news article first so auto-fill can link your business to current events.');
      return;
    }
    setAutoFillLoading(true);
    try {
      const res = await fetch('/api/auto-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsTitle: selectedNews?.title || '',
          newsDescription: selectedNews?.description || '',
          newsSource: selectedNews?.source || '',
          newsCategory: selectedNews?.category || '',
          businessType,
          businessDescription,
          communicationProfile,
          targetAudience,
          contentFocus,
        }),
      });
      const data = await res.json();
      if (data.ok && data.fields) {
        const f = data.fields;
        if (step === 'direction') {
          if (f.imageAngle) setImageAngle(f.imageAngle);
          if (f.marketingAngle) setMarketingAngle(f.marketingAngle);
          if (f.contentAngle) setContentAngle(f.contentAngle);
        } else if (step === 'creatif') {
          if (f.storyToTell) setStoryToTell(f.storyToTell);
          if (f.publicationGoal) setPublicationGoal(f.publicationGoal);
          setEmotionToConvey(f.emotionToConvey || f.emotion || tonePresets[communicationProfile]?.emotion || 'Inspiration et espoir');
        } else if (step === 'expert') {
          if (f.problemSolved) setProblemSolved(f.problemSolved);
          if (f.uniqueAdvantage) setUniqueAdvantage(f.uniqueAdvantage);
          if (f.desiredVisualIdea) setDesiredVisualIdea(f.desiredVisualIdea);
        }
      } else if (data.insufficientCredits) {
        alert(t.generate.alertInsufficientCredits);
      }
    } catch (err) {
      console.error('[AutoFill] Error:', err);
    } finally {
      setAutoFillLoading(false);
    }
  }

  /* --- Génération de suggestions de texte intelligentes --- */
  async function handleGenerateTextSuggestions() {
    if (useNewsMode && !selectedNews) {
      alert(t.generate.alertSelectNewsForSuggestions);
      return;
    }

    if (!businessType.trim()) {
      alert(t.generate.alertEnterBusinessForSuggestions);
      return;
    }

    if (!useNewsMode && !businessDescription.trim()) {
      alert(t.generate.alertDescribeBusinessForSuggestions);
      return;
    }

    // Générer les suggestions de texte avec IA
    setShowTextSuggestions(true);
    setTextSuggestions([`⏳ ${t.generate.generatingTextSuggestions}`]);

    try {
      const response = await fetch('/api/suggest-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsTitle: selectedNews?.title || null,
          newsDescription: selectedNews?.description || null,
          businessType,
          businessDescription,
          tone,
          targetAudience,
          mode: useNewsMode ? 'news' : 'free'
        })
      });

      const data = await response.json();

      if (data.ok && data.suggestions) {
        setTextSuggestions(data.suggestions);
        if (data.warning) {
          console.warn('[SuggestText]', data.warning);
        }
      } else {
        throw new Error(data.error || t.generate.generatingTextSuggestions);
      }
    } catch (error) {
      console.error('[SuggestText] Error:', error);
      // Fallback vers suggestions basiques
      const { generateTextSuggestions } = require('@/lib/text-suggestion');
      const suggestions = generateTextSuggestions({
        newsTitle: selectedNews?.title || businessType,
        newsDescription: selectedNews?.description || businessDescription,
        businessType,
        businessDescription,
        targetAudience,
        specialist: specialist as any,
        communicationProfile,
        marketingAngle,
        problemSolved: problemSolved || '',
        uniqueAdvantage,
      });
      setTextSuggestions(suggestions);
    }
  }

  // Helper: appliquer tous les overlays sur une image propre
  async function renderOverlaysOnImage(cleanImage: string, items: GenerateTextOverlay[]): Promise<string> {
    let result = cleanImage;
    for (const item of items) {
      result = await addTextOverlay(result, {
        text: item.text, position: item.position, fontSize: item.fontSize,
        fontFamily: item.fontFamily, textColor: item.textColor,
        backgroundColor: item.backgroundColor, backgroundStyle: item.backgroundStyle,
      });
    }
    return result;
  }

  /* --- Preview en temps réel du texte overlay (image principale) --- */
  useEffect(() => {
    if (!showEditStudio) {
      setTextPreviewUrl(null);
      return;
    }

    const hasCurrentText = activeTab === 'text' && overlayText.trim().length > 0;
    const hasAppliedItems = textOverlayItems.length > 0;
    if (!hasCurrentText && !hasAppliedItems) {
      setTextPreviewUrl(null);
      return;
    }

    // Utiliser la base de la version sélectionnée ou la base globale
    const baseImage = selectedEditVersion || baseOriginalImageUrl || imageWithWatermarkOnly || originalImageUrl || generatedImageUrl;
    if (!baseImage) {
      setTextPreviewUrl(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsGeneratingPreview(true);
      try {
        let currentImage = baseImage;

        // Appliquer tous les overlays existants séquentiellement
        for (const item of textOverlayItems) {
          // Sur l'onglet texte: skip l'overlay en cours d'édition (sera remplacé par le formulaire)
          // Sur les autres onglets: afficher tous les overlays tels quels
          if (hasCurrentText && item.id === editingOverlayId) continue;
          currentImage = await addTextOverlay(currentImage, {
            text: item.text, position: item.position, fontSize: item.fontSize,
            fontFamily: item.fontFamily, textColor: item.textColor,
            backgroundColor: item.backgroundColor, backgroundStyle: item.backgroundStyle,
          });
        }

        // Appliquer l'overlay en cours d'édition depuis le formulaire (uniquement sur l'onglet texte)
        if (hasCurrentText) {
          currentImage = await addTextOverlay(currentImage, {
            text: overlayText, position: textPosition, fontSize: fontSize,
            fontFamily: fontFamily, textColor: textColor,
            backgroundColor: textBackgroundColor, backgroundStyle: backgroundStyle,
          });
        }

        setTextPreviewUrl(currentImage);
      } catch (error) {
        console.error('Preview error:', error);
        setTextPreviewUrl(null);
      } finally {
        setIsGeneratingPreview(false);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [overlayText, textPosition, textColor, textBackgroundColor, fontSize, fontFamily, backgroundStyle, selectedEditVersion, generatedImageUrl, activeTab, showEditStudio, textOverlayItems, editingOverlayId, baseOriginalImageUrl, imageWithWatermarkOnly, originalImageUrl]);

  /* --- Auto-entrer en mode édition quand on a des overlays existants --- */
  useEffect(() => {
    if (activeTab === 'text' && showEditStudio && textOverlayItems.length > 0 && !editingOverlayId) {
      // Skip si l'utilisateur a volontairement cliqué "{t.generate.newText}"
      if (skipAutoEditRef.current) {
        skipAutoEditRef.current = false;
        return;
      }
      // Cas 1: Le formulaire a déjà du texte qui correspond à un overlay existant (ex: texte auto-généré)
      const currentText = overlayText.trim();
      if (currentText) {
        const matching = textOverlayItems.find(item => item.text === currentText);
        if (matching) {
          // Auto-entrer en mode édition pour cet overlay (évite le doublon sur la preview)
          setTextPosition(matching.position);
          setFontSize(matching.fontSize);
          setFontFamily(matching.fontFamily as any);
          setTextColor(matching.textColor);
          setTextBackgroundColor(matching.backgroundColor);
          setBackgroundStyle(matching.backgroundStyle as any);
          setEditingOverlayId(matching.id);
          return;
        }
      }
      // Cas 2: Formulaire vide ou texte ne correspond pas → charger le premier overlay
      if (!currentText) {
        const first = textOverlayItems[0];
        setOverlayText(first.text);
        setTextPosition(first.position);
        setFontSize(first.fontSize);
        setFontFamily(first.fontFamily as any);
        setTextColor(first.textColor);
        setTextBackgroundColor(first.backgroundColor);
        setBackgroundStyle(first.backgroundStyle as any);
        setEditingOverlayId(first.id);
      }
    }
  }, [activeTab, showEditStudio, textOverlayItems.length]);

  /* --- Auto-appliquer les modifications de texte quand on quitte l'onglet texte --- */
  useEffect(() => {
    const prevTab = prevActiveTabRef.current;
    prevActiveTabRef.current = activeTab;

    // Si on quitte l'onglet texte et qu'on a un overlay en cours d'édition
    if (prevTab === 'text' && activeTab !== 'text' && showEditStudio && editingOverlayId && overlayText.trim()) {
      // Auto-appliquer les modifications du formulaire dans textOverlayItems
      const updatedItem: GenerateTextOverlay = {
        id: editingOverlayId,
        text: overlayText.trim(),
        position: textPosition,
        fontSize: fontSize,
        fontFamily: fontFamily,
        textColor: textColor,
        backgroundColor: textBackgroundColor,
        backgroundStyle: backgroundStyle,
      };
      setTextOverlayItems(prev => prev.map(item => item.id === editingOverlayId ? updatedItem : item));
    }
  }, [activeTab]);

  /* --- Générer les miniatures avec overlays pour chaque version --- */
  useEffect(() => {
    if (!showEditStudio || textOverlayItems.length === 0 || editVersions.length === 0) {
      setVersionPreviews({});
      return;
    }

    let cancelled = false;
    const generatePreviews = async () => {
      const previews: Record<string, string> = {};
      for (const version of editVersions) {
        if (cancelled) return;
        try {
          previews[version] = await renderOverlaysOnImage(version, textOverlayItems);
        } catch {
          previews[version] = version; // Fallback: image sans overlay
        }
      }
      if (!cancelled) setVersionPreviews(previews);
    };

    const tid = setTimeout(generatePreviews, 200);
    return () => { cancelled = true; clearTimeout(tid); };
  }, [showEditStudio, editVersions, textOverlayItems]);

  /* --- Génération de l'image IA avec Seedream 4.0 --- */
  async function handleGenerate() {
    if (useNewsMode && !selectedNews) {
      alert(t.generate.alertSelectNews);
      return;
    }
    if (!businessType.trim()) {
      alert(t.generate.alertEnterBusiness);
      return;
    }
    if (!useNewsMode && !businessDescription.trim()) {
      alert(t.generate.alertDescribeBusiness);
      return;
    }

    // Réinitialiser l'état de sauvegarde pour la nouvelle génération
    setImageSavedToLibrary(false);
    setLastSavedImageId(null);

    // Vérifier si l'utilisateur est admin (whitelist) - UTILISER supabaseBrowser pour avoir la session
    const supabaseClient = supabaseBrowser();
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { isAdminUser, isAdminEmail } = await import('@/lib/adminWhitelist');

    // Vérifier admin via DB ou email
    let isAdmin = false;
    if (user?.id) {
      isAdmin = await isAdminUser(user.id);
    }
    if (!isAdmin && user?.email) {
      isAdmin = isAdminEmail(user.email);
    }

    console.log('[Generate] Admin check:', { userId: user?.id, email: user?.email, isAdmin });

    // Vérifier les limites de génération (freemium) - SAUF pour les admins
    if (!isAdmin) {
      if (generationLimit.requiredAction === 'email') {
        console.log('[Generate] Non-admin user requires email');
        setShowEmailGate(true);
        return;
      }
      if (generationLimit.requiredAction === 'signup') {
        console.log('[Generate] Non-admin user requires signup');
        setShowSignupGate(true);
        return;
      }
    } else {
      console.log('[Generate] ✅ Admin user detected - bypassing ALL generation limits');
    }

    setGenerating(true);
    setModalMinimized(false);
    setGenerationError(null);
    setGeneratedImageUrl(null);
    setImageLoadingProgress(0);
    setLoadingStep('api');

    // Simuler progression pendant l'appel API
    const progressInterval = setInterval(() => {
      setImageLoadingProgress(prev => {
        if (prev < 60) return prev + 10; // Progression rapide jusqu'à 60%
        if (prev < 85) return prev + 5;  // Ralentissement
        return prev; // Bloqué à 85% jusqu'à réponse API
      });
    }, 400);

    try {
      // Construire un prompt optimisé Community Manager Expert
      let promptParts: string[] = [];

      // 1. CRITICAL NO-TEXT RULE (premier = plus respecté par le modèle)
      promptParts.push(
        `🚫🚫🚫 ABSOLUTE RULE — READ THIS FIRST 🚫🚫🚫\n` +
        `This image must contain ABSOLUTELY ZERO TEXT of any kind:\n` +
        `- ZERO letters, numbers, words, writing, typography\n` +
        `- ZERO signs, labels, brands, logos, watermarks, captions, titles\n` +
        `- ZERO screens showing text, ZERO chalkboards with writing, ZERO price tags with numbers\n` +
        `- ZERO menus, ZERO posters with words, ZERO book covers with titles\n` +
        `- If storefronts or signs appear: they must be BLURRED or show ABSTRACT SHAPES only\n` +
        `- Every surface that could contain text must be BLANK, BLURRED, or filled with PATTERNS instead\n` +
        `THE IMAGE MUST BE 100% PURE VISUAL — NO READABLE CHARACTERS WHATSOEVER.`
      );

      // 2. SCENE + CREATIVE DIRECTION
      if (useNewsMode && selectedNews) {
        // Map news themes to CONCRETE visual elements via regex
        const newsContent = `${selectedNews.title || ''} ${selectedNews.description || ''}`;
        let newsVisualCues = '';
        if (/inflat|prix|co[uû]t|[eé]conom|recession|march[eé]|bourse|crise|banque|euro|dollar/i.test(newsContent)) {
          newsVisualCues = 'stacked coins, gold bars, market stall produce, overflowing shopping bags, open cash register drawers, luxury vs modest items contrast, piggy banks';
        } else if (/tech|ia\b|intellig|robot|num[eé]r|digital|app\b|startup|crypto|blockchain|donn[eé]e/i.test(newsContent)) {
          newsVisualCues = 'circuit board patterns, fiber optic light trails, robotic arms, silicon chips, server rack LEDs, holographic light beams, futuristic metallic surfaces';
        } else if (/sport|foot|match|olympi|champion|coupe|rugby|tennis|athl[eè]t/i.test(newsContent)) {
          newsVisualCues = 'stadium floodlights, golden trophies, colorful sportswear, balls, nets, athletics tracks, cheering crowd silhouettes, medal podiums';
        } else if (/m[eé]t[eé]o|climat|temp[eê]te|chaleur|froid|neige|pluie|inondation|s[eé]cheresse|canicule/i.test(newsContent)) {
          newsVisualCues = 'dramatic sky formations, visible rain drops, sun rays breaking through clouds, snow, wind-blown elements, barometers, thermometers';
        } else if (/sant[eé]|m[eé]dical|h[oô]pital|vaccin|virus|pand[eé]m|bien-[eê]tre|pharma/i.test(newsContent)) {
          newsVisualCues = 'stethoscopes, lab coats, green nature wellness elements, clean clinical surfaces, plants, vitamins, surgical tools, heartbeat monitors';
        } else if (/politique|[eé]lection|gouvern|pr[eé]sident|loi|r[eé]forme|vote|parlement/i.test(newsContent)) {
          newsVisualCues = 'civic building facades, podiums, waving flags, gathering crowds, formal architectural columns, ballot boxes, tricolor ribbons';
        } else if (/culture|musique|film|cin[eé]|art|spectacle|festival|concert|th[eé][aâ]tre/i.test(newsContent)) {
          newsVisualCues = 'stage spotlights, musical instruments, film camera lenses, paint splashes, festival garlands, theatrical curtains, colorful projections';
        } else if (/environnement|[eé]colog|vert\b|durable|recycl|bio\b|plan[eè]te|carbone/i.test(newsContent)) {
          newsVisualCues = 'lush greenery, solar panels, recycling bins, earth-toned textures, sustainable wood and bamboo, living plants, wind turbines';
        } else if (/[eé]ducation|[eé]cole|universit|[eé]tudiant|formation|apprenti|dipl[oô]m/i.test(newsContent)) {
          newsVisualCues = 'classroom desks, graduation caps, laboratory equipment, campus architecture, globes, microscopes, scientific models, colored pencils';
        } else {
          newsVisualCues = 'contextual environmental details reflecting current events, dynamic urban or natural backdrop elements, visible human activity and energy';
        }

        // Adapter le poids business/actu selon le curseur contentFocus (5 niveaux)
        const businessWeight = 100 - contentFocus; // % business
        const newsWeight = contentFocus; // % actualité
        let focusLabel: string;
        let focusInstruction: string;

        if (contentFocus <= 15) {
          focusLabel = 'BUSINESS TOTAL';
          focusInstruction = `PRIORITY 95/5: The business "${businessType}" is the ABSOLUTE HERO. The news is barely hinted at — a tiny background detail, a color, a shadow. The viewer sees ONLY the business. The news is an almost invisible whisper in the atmosphere.`;
        } else if (contentFocus <= 35) {
          focusLabel = 'BUSINESS-DOMINANT';
          focusInstruction = `PRIORITY 75/25: The business "${businessType}" dominates the frame. The news context appears as secondary environmental cues — objects on a shelf, a screen in the background, ambient colors reflecting the event. The business is front and center, the news sets the mood.`;
        } else if (contentFocus <= 65) {
          focusLabel = 'NEWSJACKING BALANCE';
          focusInstruction = `BALANCE 50/50: TRUE NEWSJACKING — the business and the news are EQUALLY present and VISUALLY INTERTWINED. The viewer cannot separate one from the other. The business is IN the news context, reacting, adapting, thriving. This is the sweet spot of newsjacking content.`;
        } else if (contentFocus <= 85) {
          focusLabel = 'NEWS-DOMINANT';
          focusInstruction = `PRIORITY 25/75: The news event DOMINATES the scene. The business "${businessType}" appears as a smart, relevant participant within the news context — surfing on the wave, commenting through its products/services, offering its perspective. The news is the stage, the business is a key actor on it.`;
        } else {
          focusLabel = 'NEWS TOTAL';
          focusInstruction = `PRIORITY 5/95: The news event is EVERYTHING. The business "${businessType}" is barely suggested — a branded object, a subtle product placement, a tiny recognizable element. The image is a powerful editorial shot of the news, with a whisper of the brand.`;
        }

        // Construire le contexte business enrichi avec TOUS les champs remplis
        let businessContext = `"${businessType}"`;
        if (businessDescription) businessContext += ` — ${businessDescription}`;

        let businessDepth = '';
        if (problemSolved) businessDepth += `\n- This business SOLVES: ${problemSolved}`;
        if (uniqueAdvantage) businessDepth += `\n- What makes it UNIQUE: ${uniqueAdvantage}`;
        if (targetAudience) businessDepth += `\n- Its clients/audience: ${targetAudience}`;
        if (marketingAngle) businessDepth += `\n- Marketing strategy: ${marketingAngle}`;

        // Construire le pont créatif news ↔ business
        let creativeBridge = '';
        if (desiredVisualIdea) creativeBridge += `\nVISUAL IDEA FROM CLIENT: "${desiredVisualIdea}" — USE THIS as the primary creative direction for the image. Interpret it to connect the business with the news.`;
        if (storyToTell) creativeBridge += `\nSTORY TO TELL: "${storyToTell}" — Weave this narrative into the visual scene.`;
        if (contentAngle) creativeBridge += `\nEDITORIAL ANGLE: "${contentAngle}" — Frame the image from this perspective.`;
        if (imageAngle) creativeBridge += `\nIMAGE APPROACH: "${imageAngle}"`;
        if (emotionToConvey) creativeBridge += `\nCORE EMOTION: "${emotionToConvey}" — The viewer MUST feel this when seeing the image.`;
        if (publicationGoal) creativeBridge += `\nPURPOSE: "${publicationGoal}" — This image must achieve this goal on social media.`;

        // Construire le prompt visuel — prioriser desiredVisualIdea comme description concrète
        if (desiredVisualIdea) {
          // Le concept visuel de Claude est LA scène principale
          promptParts.push(
            `\n\n🎯 SCENE TO CREATE:\n` +
            `${desiredVisualIdea}\n` +
            `\nCONTEXT — this image connects "${selectedNews.title}" with the business "${businessType}".\n` +
            (storyToTell ? `NARRATIVE: ${storyToTell}\n` : '') +
            (emotionToConvey ? `EMOTION: The viewer must feel ${emotionToConvey}.\n` : '') +
            `\nVISUAL DETAILS:\n` +
            `- News atmosphere elements: ${newsVisualCues}\n` +
            `- Business elements: ${businessType} products, tools, workspace — immediately recognizable.\n` +
            `- ${focusInstruction}\n` +
            (imageAngle ? `- Camera/framing: ${imageAngle}\n` : `- Camera: close to medium shot, editorial photography quality.\n`) +
            `- ONE unified scene where business and news coexist naturally.\n` +
            `If people are shown, natural diversity in ethnicity, age, and appearance.`
          );
        } else {
          // Pas de concept visuel spécifique — construire à partir des éléments
          promptParts.push(
            `\n\n🎯 NEWSJACKING SCENE (${focusLabel}):\n` +
            `Create a single image showing "${businessType}" (${businessDescription || 'a business'}) connected to the news "${selectedNews.title}".\n` +
            `${focusInstruction}\n` +
            (contentAngle ? `ANGLE: ${contentAngle}\n` : '') +
            (storyToTell ? `NARRATIVE: ${storyToTell}\n` : '') +
            (emotionToConvey ? `EMOTION: ${emotionToConvey}.\n` : '') +
            `\nVISUAL COMPOSITION:\n` +
            `FOREGROUND: ${businessType} in action — products, tools, workspace, team. Immediately recognizable.\n` +
            `ENVIRONMENT: News context visible through CONCRETE OBJECTS: ${newsVisualCues}\n` +
            `These elements share ONE unified scene — news objects in the business space, business products in the news context.\n` +
            (imageAngle ? `Camera: ${imageAngle}\n` : `Camera: close to medium shot, editorial photography quality.\n`) +
            `If people are shown, natural diversity in ethnicity, age, and appearance.`
          );
        }
      } else {
        // MODE SANS ACTUALITÉ
        promptParts.push(
          `\n\nSUBJECT: ${businessType}${businessDescription ? ` — ${businessDescription}` : ''}\n` +
          (targetAudience ? `For: ${targetAudience}\n` : '') +
          (problemSolved ? `Solves: ${problemSolved}\n` : '') +
          (uniqueAdvantage ? `Unique: ${uniqueAdvantage}\n` : '') +
          (desiredVisualIdea ? `Visual idea: ${desiredVisualIdea}\n` : '') +
          (storyToTell ? `Story: ${storyToTell}\n` : '') +
          (emotionToConvey ? `Emotion: ${emotionToConvey}\n` : '') +
          `\nShow this business at its BEST — in action, alive, magnetic.\n` +
          `Products, environment, atmosphere, the experience it delivers.\n` +
          `Cinematic quality: dramatic lighting, rich textures, depth of field.\n` +
          `The viewer must feel drawn to this business immediately.\n` +
          `If people are shown, ensure natural diversity in ethnicity, age, and appearance.`
        );
      }

      // 3. RENDER STYLE + TONE + CHARACTER STYLE
      const renderInstruction = renderStyle === 'illustration'
        ? 'RENDER STYLE: Stylized 3D illustration, digital art, cartoon or vector style. Colorful, clean, modern illustration look.'
        : 'RENDER STYLE: PHOTOREALISTIC. Real photograph taken with a professional camera. Real textures, real lighting, real materials. NOT a drawing, NOT an illustration, NOT 3D render, NOT digital art.';

      const characterInstruction = characterStyle === 'fiction'
        ? 'CHARACTERS: Use animated/illustrated fictional characters (3D render or stylized illustration style). NOT real photographs of people.'
        : 'CHARACTERS: If people appear, show REAL diverse humans (varied ethnicities, ages, body types). Photorealistic.';

      promptParts.push(
        `\n${renderInstruction}` +
        `\nTone: ${tone || 'professional'}, ${emotionToConvey || 'inspiring'}. Style: ${visualStyle || 'cinematic'}.` +
        `\n${characterInstruction}`
      );

      // 4. TEXT OVERLAY SPACE (si texte optionnel)
      if (optionalText && optionalText.trim()) {
        const isCTA = /\b(offre|promo|réduction|%|€|gratuit|limité|maintenant|découvr|inscri)/i.test(optionalText);
        promptParts.push(
          `\nLeave clean breathing room in the ${isCTA ? 'bottom third' : 'top third'} for text overlay. No busy patterns there.`
        );
      }

      // 5. QUALITY + ABSOLUTE NO-TEXT (repeated at end for reinforcement)
      promptParts.push(
        `\n\n4K, ${renderStyle === 'photo' ? 'shot on Canon EOS R5, 85mm f/1.4, natural film grain, ' : ''}depth of field, publication-ready for social media.\n` +
        `AVOID: flat compositions, stock-photo clichés, generic backgrounds${renderStyle === 'photo' ? ', digital art look, illustration style, 3D render, cartoon, painting' : ''}.\n` +
        `⛔ ABSOLUTELY ZERO TEXT in the image — no letters, words, numbers, signs, labels, logos, brand names, watermarks, captions, titles, menus, price tags, screens with text. Every surface must be BLANK or show PATTERNS/COLORS only. PURE VISUAL.`
      );

      const fullPrompt = promptParts.join(' ');

      console.log('[Generate] Full prompt:', fullPrompt);

      // Choisir entre i2i (si logo en mode modify) ou t2i
      const useI2I = logoUrl && logoMode === 'modify';
      const endpoint = useI2I ? '/api/seedream/i2i' : '/api/seedream/t2i';
      const requestBody = useI2I
        ? { prompt: fullPrompt, image: logoUrl }
        : { prompt: fullPrompt };

      console.log(`[Generate] Using ${useI2I ? 'i2i (modify image)' : 't2i'} endpoint`, {
        hasLogo: !!logoUrl,
        logoMode: logoMode,
        willAddLogoOverlay: logoUrl && logoMode === 'overlay'
      });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        // Crédits insuffisants
        if (res.status === 402 && errorData.insufficientCredits) {
          clearInterval(progressInterval);
          setGenerating(false);
          setShowInsufficientCreditsModal(true);
          return;
        }
        // Requiert un compte (mode gratuit bloqué)
        if (res.status === 403 && errorData.blocked) {
          clearInterval(progressInterval);
          setGenerating(false);
          if (errorData.reason === 'free_limit') {
            setShowSignupGate(true);
          } else {
            setShowRequiresAccountModal(true);
          }
          return;
        }
        throw new Error(errorData.error || `${t.generate.errorServerSuffix}: ${res.status}`);
      }

      const data = await res.json();
      clearInterval(progressInterval);
      setImageLoadingProgress(90);
      setLoadingStep('download');

      // Mettre à jour le solde crédits si retourné
      if (data.newBalance !== undefined) {
        credits.refresh();
      }

      if (!data?.ok) throw new Error(data?.error || t.generate.generatingInProgress);

      // Log provider discret (visible dans la console navigateur)
      if (data._p) {
        console.log(`[Generate] 🏷️ Provider: ${data._p}`);
        setLastProvider(data._p);
      }

      console.log('[Generate] Image generated, applying overlays CLIENT-SIDE...', {
        hasOptionalText: !!optionalText?.trim(),
        imageUrl: data.imageUrl.substring(0, 50)
      });

      // APPROCHE ROBUSTE : Conversion serveur + Canvas client
      // 1. Serveur convertit en data URL (évite CORS)
      // 2. Client applique overlays avec Canvas natif (garanti de fonctionner)

      let finalImageUrl = data.imageUrl;
      let initialOverlays: { text: string; position: number; fontSize: number; fontFamily: string; textColor: string; bgColor: string; bgStyle: string }[] = [];
      let cleanOriginalDataUrl: string | null = null; // Local var car React state async

      try {
        // Vérifier statut premium pour watermark (utiliser le plan depuis profiles, pas user_metadata)
        const { data: { user } } = await supabaseClient.auth.getUser();
        const hasPremiumPlan = !!(credits.plan && credits.plan !== 'free');
        const hasProvidedEmail = !!generationLimit.email;
        const hasCreatedAccount = generationLimit.hasAccount;
        const userEmail = user?.email || generationLimit.email || null;
        const isUserFreemium = isFreemiumUser(hasProvidedEmail, hasCreatedAccount, hasPremiumPlan, userEmail);

        // Préparer le texte overlay — seulement si le client a saisi un texte
        let textToApply = optionalText && optionalText.trim()
          ? optionalText.trim()
          : '';

        // Sauvegarder pour l'édition
        setOverlayText(textToApply);

        console.log('[Generate] Step 1: Converting image to data URL (server-side)...');

        // ÉTAPE 1 : Convertir l'image en data URL côté serveur (évite CORS)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const convertResponse = await fetch('/api/convert-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: data.imageUrl }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!convertResponse.ok) {
          throw new Error(`Conversion failed: ${convertResponse.status}`);
        }

        const convertData = await convertResponse.json();
        if (!convertData.ok) {
          throw new Error(convertData.error || 'Image conversion failed');
        }

        const dataUrl = convertData.dataUrl;
        console.log('[Generate] ✅ Image converted to data URL, size:', convertData.size);

        // SAUVEGARDER l'image originale SANS overlays pour l'édition studio
        setOriginalImageUrl(dataUrl);
        cleanOriginalDataUrl = dataUrl; // Local var pour auto-save (React state pas encore dispo)

        // ÉTAPE 2 : Appliquer overlays côté CLIENT avec Canvas
        console.log('[Generate] Step 2: Applying overlays with browser Canvas...');

        finalImageUrl = await new Promise<string>((resolve, reject) => {
          const img = new Image();

          img.onload = async () => {
            try {
              // Créer canvas aux dimensions de l'image
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');

              if (!ctx) {
                throw new Error('Cannot get canvas context');
              }

              // Dessiner l'image de base
              ctx.drawImage(img, 0, 0);

              // LOGO EN OVERLAY (si mode overlay activé)
              if (logoUrl && logoMode === 'overlay') {
                console.log('[Generate] Adding logo overlay...');
                const logoImg = new Image();
                await new Promise<void>((resolveLogo, rejectLogo) => {
                  logoImg.onload = () => {
                    try {
                      const logoSize = Math.floor(img.width * 0.12); // 12% de la largeur de l'image
                      const padding = Math.floor(img.width * 0.03);

                      // Position selon logoPosition
                      let logoX = padding;
                      let logoY = padding;

                      if (logoPosition === 'top-right') {
                        logoX = img.width - logoSize - padding;
                        logoY = padding;
                      } else if (logoPosition === 'bottom-left') {
                        logoX = padding;
                        logoY = img.height - logoSize - padding;
                      } else if (logoPosition === 'bottom-right') {
                        logoX = img.width - logoSize - padding;
                        logoY = img.height - logoSize - padding;
                      }

                      // Dessiner le logo
                      ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
                      console.log('[Generate] ✅ Logo overlay applied');
                      resolveLogo();
                    } catch (err) {
                      console.error('[Generate] Logo overlay error:', err);
                      rejectLogo(err as Error);
                    }
                  };
                  logoImg.onerror = () => {
                    console.error('[Generate] Failed to load logo for overlay');
                    rejectLogo(new Error('Failed to load logo'));
                  };
                  // Ne pas définir crossOrigin pour les data URLs
                  if (!logoUrl.startsWith('data:')) {
                    logoImg.crossOrigin = 'anonymous';
                  }
                  logoImg.src = logoUrl;
                });
              }

              // WATERMARK en bas à droite
              if (isUserFreemium) {
                const watermarkText = 'KeiroAI';
                const fontSize = Math.max(36, Math.floor(img.width * 0.03)); // Réduit à 3%
                const padding = Math.floor(img.width * 0.02);

                ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';

                const x = img.width - padding;
                const y = img.height - padding;

                // Ombre portée
                ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 4;
                ctx.shadowOffsetY = 4;

                // Contour noir
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
                ctx.lineWidth = Math.max(3, Math.floor(fontSize * 0.08));
                ctx.strokeText(watermarkText, x, y);

                // Texte blanc
                ctx.fillStyle = 'white';
                ctx.fillText(watermarkText, x, y);

                // Reset shadow
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                console.log('[Generate] ✅ Watermark applied');
              }

              // SAUVEGARDER l'image avec watermark UNIQUEMENT (avant d'ajouter le texte)
              const watermarkOnlyDataUrl = canvas.toDataURL('image/png', 1.0);
              setImageWithWatermarkOnly(watermarkOnlyDataUrl);
              console.log('[Generate] ✅ Image with watermark-only saved for studio');

              // TEXTE OVERLAY centré avec word wrapping
              if (textToApply) {
                // Taille proportionnelle à l'image, réduite si texte long
                const textLen = textToApply.length;
                let fontScale = 0.06; // 6% par défaut
                if (textLen > 40) fontScale = 0.045;
                if (textLen > 60) fontScale = 0.035;
                const fontSize = Math.max(36, Math.floor(img.width * fontScale));

                ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Word wrap : découper en lignes qui tiennent dans 80% de la largeur
                const maxWidth = img.width * 0.80;
                const words = textToApply.split(' ');
                const lines: string[] = [];
                let currentLine = '';
                for (const word of words) {
                  const testLine = currentLine ? `${currentLine} ${word}` : word;
                  if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                  } else {
                    currentLine = testLine;
                  }
                }
                if (currentLine) lines.push(currentLine);

                const lineHeight = fontSize * 1.25;
                const totalHeight = lines.length * lineHeight;
                const startY = (img.height / 2) - (totalHeight / 2) + (lineHeight / 2);

                lines.forEach((line, i) => {
                  const x = img.width / 2;
                  const y = startY + (i * lineHeight);

                  // Ombre portée forte
                  ctx.shadowColor = 'rgba(0, 0, 0, 1)';
                  ctx.shadowBlur = 12;
                  ctx.shadowOffsetX = 6;
                  ctx.shadowOffsetY = 6;

                  // Contour noir épais
                  ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
                  ctx.lineWidth = Math.max(4, Math.floor(fontSize * 0.10));
                  ctx.strokeText(line, x, y);

                  // Texte blanc
                  ctx.fillStyle = 'white';
                  ctx.fillText(line, x, y);

                  // Reset shadow
                  ctx.shadowColor = 'transparent';
                  ctx.shadowBlur = 0;
                  ctx.shadowOffsetX = 0;
                  ctx.shadowOffsetY = 0;
                });

                console.log('[Generate] ✅ Text overlay applied:', lines.length, 'lines, fontSize:', fontSize);
              }

              // Convertir en data URL
              const finalDataUrl = canvas.toDataURL('image/png', 1.0);
              console.log('[Generate] ✅ All overlays applied CLIENT-SIDE');
              resolve(finalDataUrl);

            } catch (error) {
              reject(error);
            }
          };

          img.onerror = () => {
            reject(new Error('Failed to load converted image'));
          };

          img.src = dataUrl;
        });

        // Créer un overlay item pour le texte initial (pour le stockage JSON en galerie)
        if (textToApply) {
          const overlayItem: GenerateTextOverlay = {
            id: Math.random().toString(36).substring(2, 9),
            text: textToApply,
            position: 50,
            fontSize: 60,
            fontFamily: 'inter',
            textColor: '#ffffff',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backgroundStyle: 'none',
          };
          setTextOverlayItems([overlayItem]);
          setEditingOverlayId(overlayItem.id);
          initialOverlays = [{ text: overlayItem.text, position: overlayItem.position, fontSize: overlayItem.fontSize, fontFamily: overlayItem.fontFamily, textColor: overlayItem.textColor, bgColor: overlayItem.backgroundColor, bgStyle: overlayItem.backgroundStyle }];
        }

      } catch (overlayError: any) {
        console.error('[Generate] ❌ Overlays FAILED:', overlayError);
        alert(`${t.generate.alertOverlayError}\n${overlayError.message}\n\n${t.generate.alertOverlayFallback}`);
        // Utiliser l'image originale (fallback)
        finalImageUrl = data.imageUrl;
      }

      console.log('[Generate] Final image ready:', {
        isDataURL: finalImageUrl.startsWith('data:'),
        length: finalImageUrl.length
      });

      setGeneratedImageUrl(finalImageUrl);
      setGeneratedPrompt(fullPrompt);

      // Incrémenter le compteur de génération pour le freemium
      generationLimit.incrementCount();

      // Génération audio TTS si demandée
      if (addAudio) {
        setGeneratingAudio(true);
        try {
          let textForAudio = '';

          // Déterminer le texte à narrer
          if (audioTextSource === 'ai') {
            // Générer automatiquement le texte depuis l'actualité ou le business
            textForAudio = selectedNews
              ? `${selectedNews.title}. ${selectedNews.description?.substring(0, 100) || ''}`
              : `${businessType}. ${businessDescription?.substring(0, 150) || ''}`;
          } else {
            // Utiliser le texte manuel
            textForAudio = audioText.trim();
          }

          if (textForAudio) {
            console.log('[Generate] Generating audio TTS:', textForAudio);
            const audioResponse = await fetch('/api/generate-audio-tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: textForAudio,
                targetDuration: 5,
                voice: selectedVoice,
                speed: 1.0
              })
            });

            const audioData = await audioResponse.json();
            if (audioData.ok) {
              setGeneratedAudioUrl(audioData.audioUrl);
              console.log('[Generate] ✅ Audio generated:', audioData.audioUrl);
            } else {
              console.error('[Generate] Audio generation failed:', audioData.error);
            }
          }
        } catch (audioError) {
          console.error('[Generate] Audio generation error:', audioError);
          // Ne pas bloquer la génération si l'audio échoue
        } finally {
          setGeneratingAudio(false);
        }
      }

      // Auto-save vers la galerie si l'utilisateur est connecté
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
          console.log('[Generate] User logged in, auto-saving to library...');
          const { data: { session } } = await supabaseClient.auth.getSession();
          const headers: HeadersInit = { 'Content-Type': 'application/json' };
          if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

          // Uploader l'image originale (sans overlay) pour édition future
          // Utilise cleanOriginalDataUrl (local) car setOriginalImageUrl React state pas encore dispo
          let originalCleanUrl: string | null = null;
          const origToUpload = cleanOriginalDataUrl || originalImageUrl;
          if (origToUpload) {
            try {
              if (origToUpload.startsWith('data:')) {
                const origBlob = await fetch(origToUpload).then(r => r.blob());
                const origFname = `${user.id}/${Date.now()}_original_${Math.random().toString(36).substring(7)}.png`;
                const { error: origUpErr } = await supabaseClient.storage
                  .from('generated-images')
                  .upload(origFname, origBlob, { contentType: 'image/png', upsert: false });
                if (!origUpErr) {
                  const { data: { publicUrl: origPubUrl } } = supabaseClient.storage.from('generated-images').getPublicUrl(origFname);
                  originalCleanUrl = origPubUrl;
                }
              } else if (origToUpload.startsWith('http')) {
                originalCleanUrl = origToUpload;
              }
            } catch (e) {
              console.warn('[Generate] Failed to upload original image:', e);
            }
          }

          // Convertir data URL en URL Supabase pour éviter 413
          let autoSaveImageUrl = finalImageUrl;
          if (finalImageUrl.startsWith('data:')) {
            try {
              const blob = await fetch(finalImageUrl).then(r => r.blob());
              const fname = `${user.id}/${Date.now()}_gen_${Math.random().toString(36).substring(7)}.png`;
              const { error: upErr } = await supabaseClient.storage
                .from('generated-images')
                .upload(fname, blob, { contentType: 'image/png', upsert: false });
              if (!upErr) {
                const { data: { publicUrl } } = supabaseClient.storage.from('generated-images').getPublicUrl(fname);
                autoSaveImageUrl = publicUrl;
                console.log('[Generate] Auto-save: uploaded to Supabase:', publicUrl);
              }
            } catch (e) {
              console.warn('[Generate] Auto-save upload failed:', e);
            }
          }

          const saveResponse = await fetch('/api/library/save', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              imageUrl: autoSaveImageUrl,
              originalImageUrl: originalCleanUrl,
              title: selectedNews?.title ? selectedNews.title.substring(0, 50) : (businessType ? businessType.substring(0, 50) : 'Image'),
              newsTitle: selectedNews?.title ? selectedNews.title.substring(0, 50) : null,
              newsCategory: selectedNews?.category || null,
              textOverlay: initialOverlays.length > 0 ? JSON.stringify(initialOverlays) : null,
              aiModel: 'seedream',
              tags: []
            })
          });
          const saveData = await saveResponse.json();
          if (saveData.ok && saveData.savedImage?.id) {
            setLastSavedImageId(saveData.savedImage.id);
            setMonthlyStats(prev => prev ? { ...prev, images: prev.images + 1 } : { images: 1, videos: 0, assistant: 0 });
            console.log('[Generate] Auto-saved to library:', saveData.savedImage.id);
          }
        }
      } catch (saveError) {
        console.error('[Generate] Auto-save error:', saveError);
      }
    } catch (e: any) {
      clearInterval(progressInterval);
      console.error('Generation error:', e);
      const errorMessage = e.message || t.generate.generatingInProgress;
      setGenerationError(
        errorMessage.includes('fetch')
          ? t.generate.errorServerContact
          : errorMessage
      );
    } finally {
      setGenerating(false);
    }
  }

  // Sauvegarder l'image dans la galerie
  async function saveToLibrary() {
    const baseImage = selectedEditVersion || generatedImageUrl;
    if (!baseImage) {
      console.error('[SaveToLibrary] Missing image data');
      return;
    }

    // Si déjà auto-sauvegardé et pas d'éditions, rediriger directement
    if (lastSavedImageId && !selectedEditVersion) {
      setSavingToLibrary(true);
      setImageSavedToLibrary(true);
      const quickToast = document.createElement('div');
      quickToast.style.cssText = 'position:fixed;top:1.25rem;right:1.25rem;background:linear-gradient(135deg,#16a34a,#059669);color:white;padding:0.875rem 1.5rem;border-radius:0.75rem;box-shadow:0 20px 25px -5px rgba(0,0,0,0.15);z-index:9999;display:flex;align-items:center;gap:0.75rem;font-size:0.875rem;font-weight:500;animation:toastSlideIn 0.3s ease-out;';
      quickToast.innerHTML = `<svg style="width:1.25rem;height:1.25rem" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg><span>${t.generate.toastRedirecting}</span><style>@keyframes toastSlideIn{from{opacity:0;transform:translateX(1rem)}to{opacity:1;transform:translateX(0)}}</style>`;
      document.body.appendChild(quickToast);
      // Mettre à jour le text_overlay en arrière-plan si nécessaire
      if (textOverlayItems.length > 0) {
        fetch('/api/library/update-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageId: lastSavedImageId,
            textOverlay: JSON.stringify(textOverlayItems.filter(i => i.text.trim()).map(i => ({ text: i.text, position: i.position, fontSize: i.fontSize, fontFamily: i.fontFamily, textColor: i.textColor, bgColor: i.backgroundColor, bgStyle: i.backgroundStyle }))),
          }),
        }).catch(e => console.warn('[SaveToLibrary] Background overlay update failed:', e));
      }
      setTimeout(() => { quickToast.style.transition = 'all 0.4s ease'; quickToast.style.opacity = '0'; quickToast.style.transform = 'translateX(1rem)'; }, 800);
      setTimeout(() => { quickToast.remove(); window.location.href = '/library'; }, 1100);
      return;
    }

    // Feedback immédiat pour l'utilisateur — toast visible instantanément
    setSavingToLibrary(true);
    const savingToast = document.createElement('div');
    savingToast.style.cssText = 'position:fixed;top:1.25rem;right:1.25rem;background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;padding:0.875rem 1.5rem;border-radius:0.75rem;box-shadow:0 20px 25px -5px rgba(0,0,0,0.15),0 8px 10px -6px rgba(0,0,0,0.1);z-index:9999;display:flex;align-items:center;gap:0.75rem;font-size:0.875rem;font-weight:500;backdrop-filter:blur(8px);animation:toastSlideIn 0.3s ease-out;';
    savingToast.innerHTML = `<div style="width:1.125rem;height:1.125rem;border:2.5px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.7s linear infinite"></div><span>${t.generate.toastSaving}</span><style>@keyframes spin{to{transform:rotate(360deg)}}@keyframes toastSlideIn{from{opacity:0;transform:translateX(1rem)}to{opacity:1;transform:translateX(0)}}</style>`;
    document.body.appendChild(savingToast);

    // Auto-appliquer les modifications en cours d'édition avant de sauvegarder
    let itemsToRender = [...textOverlayItems];
    if (editingOverlayId && overlayText.trim()) {
      const updatedItem: GenerateTextOverlay = {
        id: editingOverlayId,
        text: overlayText.trim(),
        position: textPosition,
        fontSize: fontSize,
        fontFamily: fontFamily,
        textColor: textColor,
        backgroundColor: textBackgroundColor,
        backgroundStyle: backgroundStyle,
      };
      itemsToRender = itemsToRender.map(item => item.id === editingOverlayId ? updatedItem : item);
      setTextOverlayItems(itemsToRender);
    }

    // Rendre les overlays texte sur l'image avant sauvegarde
    let imageToSave = baseImage;
    if (itemsToRender.length > 0) {
      try {
        const cleanBase = baseOriginalImageUrl || imageWithWatermarkOnly || originalImageUrl || baseImage;
        let rendered = cleanBase;
        for (const item of itemsToRender) {
          rendered = await addTextOverlay(rendered, {
            text: item.text, position: item.position, fontSize: item.fontSize,
            fontFamily: item.fontFamily, textColor: item.textColor,
            backgroundColor: item.backgroundColor, backgroundStyle: item.backgroundStyle,
          });
        }
        imageToSave = rendered;
      } catch (e) {
        console.warn('[SaveToLibrary] Overlay rendering failed, saving base image:', e);
      }
    }

    try {
      // Utiliser supabaseBrowser pour avoir accès à la session
      const supabaseClient = supabaseBrowser();
      const { data: { user } } = await supabaseClient.auth.getUser();

      if (!user) {
        savingToast.remove();
        alert(t.generate.alertLoginRequired);
        setSavingToLibrary(false);
        return;
      }

      console.log('[SaveToLibrary] Saving image to library...', selectedEditVersion ? '(edited version)' : '(original)');

      // ÉTAPE 1: Vérifier si l'URL est une data URL base64 (trop volumineuse)
      let finalImageUrl = imageToSave;

      if (imageToSave.startsWith('data:')) {
        console.log('[SaveToLibrary] Data URL detected, uploading to Supabase Storage...');

        // Convertir data URL en Blob
        const response = await fetch(imageToSave);
        const blob = await response.blob();

        // Générer un nom de fichier unique
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.png`;

        // Upload vers Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('generated-images')
          .upload(fileName, blob, {
            contentType: 'image/png',
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('[SaveToLibrary] Upload error:', uploadError);
          throw new Error(t.generate.alertUploadImageFailed);
        }

        // Obtenir l'URL publique
        const { data: { publicUrl } } = supabaseClient.storage
          .from('generated-images')
          .getPublicUrl(fileName);

        finalImageUrl = publicUrl;
        console.log('[SaveToLibrary] Image uploaded, public URL:', publicUrl);
      }

      // ÉTAPE 2: PAYLOAD ULTRA-MINIMAL avec URL courte
      // Sauvegarder l'image originale (sans overlay) séparément pour édition future
      let originalCleanUrl: string | null = null;
      if (originalImageUrl && originalImageUrl !== finalImageUrl) {
        // L'image originale est un data URL, il faut l'uploader sur Supabase Storage
        if (originalImageUrl.startsWith('data:')) {
          try {
            const origBlob = await fetch(originalImageUrl).then(r => r.blob());
            const origFileName = `${user.id}/${Date.now()}_original_${Math.random().toString(36).substring(7)}.png`;
            const { error: origUpErr } = await supabaseClient.storage
              .from('generated-images')
              .upload(origFileName, origBlob, { contentType: 'image/png', upsert: false });
            if (!origUpErr) {
              const { data: { publicUrl: origPubUrl } } = supabaseClient.storage
                .from('generated-images')
                .getPublicUrl(origFileName);
              originalCleanUrl = origPubUrl;
            }
          } catch (e) {
            console.warn('[SaveToLibrary] Failed to upload original image:', e);
          }
        } else {
          originalCleanUrl = originalImageUrl;
        }
      }

      const payload = {
        imageUrl: finalImageUrl,
        originalImageUrl: originalCleanUrl,
        title: selectedNews?.title ? selectedNews.title.substring(0, 50) : (businessType ? businessType.substring(0, 50) : 'Image'),
        newsTitle: selectedNews?.title ? selectedNews.title.substring(0, 50) : null,
        newsCategory: selectedNews?.category ? selectedNews.category.substring(0, 20) : null,
        newsDescription: null,
        newsSource: null,
        businessType: null,
        businessDescription: null,
        textOverlay: itemsToRender.length > 0 ? JSON.stringify(itemsToRender.filter(i => i.text.trim()).map(i => ({ text: i.text, position: i.position, fontSize: i.fontSize, fontFamily: i.fontFamily, textColor: i.textColor, bgColor: i.backgroundColor, bgStyle: i.backgroundStyle }))) : null,
        visualStyle: null,
        tone: null,
        generationPrompt: null,
        thumbnailUrl: null,
        folderId: null,
        aiModel: 'seedream',
        tags: []
      };

      // Log la taille pour debug
      const payloadSize = new Blob([JSON.stringify(payload)]).size;
      console.log('[SaveToLibrary] Payload size:', payloadSize, 'bytes');

      // Obtenir le token de session pour l'authentification
      const { data: { session } } = await supabaseClient.auth.getSession();
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
        console.log('[SaveToLibrary] Sending with auth token');
      } else {
        console.warn('[SaveToLibrary] No session token available');
      }

      // Si déjà auto-sauvé → PATCH (update), sinon → POST (insert)
      const isUpdate = !!lastSavedImageId;
      const response = await fetch('/api/library/save', {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: headers,
        body: JSON.stringify(isUpdate ? { id: lastSavedImageId, imageUrl: finalImageUrl, title: payload.title } : payload)
      });

      let data;
      try {
        console.log('[SaveToLibrary] Response status:', response.status, isUpdate ? '(UPDATE)' : '(INSERT)');

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[SaveToLibrary] Server error:', errorText);
          throw new Error(`${t.generate.errorServerSuffix} (${response.status}): ${errorText.substring(0, 100)}`);
        }

        data = await response.json();
      } catch (jsonError: any) {
        console.error('[SaveToLibrary] Error:', jsonError);
        throw new Error(jsonError.message || t.generate.errorSaveFailed);
      }

      if (data.ok) {
        setImageSavedToLibrary(true);
        if (data.savedImage?.id) setLastSavedImageId(data.savedImage.id);
        console.log('[SaveToLibrary] ✅ Image saved:', data.savedImage?.id);

        // Remplacer le toast "saving" par le toast "succès" + redirection
        savingToast.style.background = 'linear-gradient(135deg, #16a34a, #059669)';
        savingToast.style.transition = 'all 0.4s ease';
        savingToast.innerHTML = `<div style="display:flex;align-items:center;gap:0.75rem"><svg style="width:1.25rem;height:1.25rem" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg><span>${isUpdate ? t.generate.toastGalleryUpdated : t.generate.toastRedirecting}</span></div>`;
        setTimeout(() => { savingToast.style.opacity = '0'; savingToast.style.transform = 'translateX(1rem)'; }, 1200);
        setTimeout(() => { savingToast.remove(); window.location.href = '/library'; }, 1600);
      } else {
        throw new Error(data.error || t.generate.errorSaveFailed);
      }
    } catch (error: any) {
      console.error('[SaveToLibrary] ❌ Error:', error);
      savingToast.remove();
      alert(error.message || t.generate.alertSaveError);
    } finally {
      setSavingToLibrary(false);
    }
  }

  // Auto-sauvegarder une version éditée dans la galerie (silencieux, sans redirection)
  async function autoSaveEditedVersion(editedImageUrl: string) {
    try {
      const supabaseClient = supabaseBrowser();
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return;

      // Upload si data URL
      let finalUrl = editedImageUrl;
      if (editedImageUrl.startsWith('data:')) {
        const blob = await fetch(editedImageUrl).then(r => r.blob());
        const fname = `${user.id}/${Date.now()}_edit_${Math.random().toString(36).substring(7)}.png`;
        const { error: upErr } = await supabaseClient.storage
          .from('generated-images')
          .upload(fname, blob, { contentType: 'image/png', upsert: false });
        if (upErr) { console.warn('[AutoSave] Upload failed:', upErr); return; }
        const { data: { publicUrl } } = supabaseClient.storage.from('generated-images').getPublicUrl(fname);
        finalUrl = publicUrl;
      }

      // Rendre les overlays texte sur la nouvelle version si présents
      let imageWithOverlays = finalUrl;
      if (textOverlayItems.length > 0) {
        try {
          let rendered = finalUrl;
          for (const item of textOverlayItems) {
            rendered = await addTextOverlay(rendered, {
              text: item.text, position: item.position, fontSize: item.fontSize,
              fontFamily: item.fontFamily, textColor: item.textColor,
              backgroundColor: item.backgroundColor, backgroundStyle: item.backgroundStyle,
            });
          }
          // Upload la version avec texte si c'est un data URL
          if (rendered.startsWith('data:')) {
            const blob2 = await fetch(rendered).then(r => r.blob());
            const fname2 = `${user.id}/${Date.now()}_overlay_${Math.random().toString(36).substring(7)}.png`;
            const { error: upErr2 } = await supabaseClient.storage
              .from('generated-images')
              .upload(fname2, blob2, { contentType: 'image/png', upsert: false });
            if (!upErr2) {
              const { data: { publicUrl: pubUrl2 } } = supabaseClient.storage.from('generated-images').getPublicUrl(fname2);
              imageWithOverlays = pubUrl2;
            }
          }
        } catch (e) {
          console.warn('[AutoSave] Overlay rendering failed, saving clean version:', e);
        }
      }

      const { data: { session } } = await supabaseClient.auth.getSession();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      // Toujours créer une NOUVELLE entrée galerie pour chaque version (V2, V3, etc.)
      const baseTitle = selectedNews?.title ? selectedNews.title.substring(0, 50) : (businessType ? businessType.substring(0, 50) : 'Image');
      const versionNumber = editVersions.length;
      const res = await fetch('/api/library/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageUrl: imageWithOverlays,
          originalImageUrl: finalUrl, // La version propre sans overlay
          title: `${baseTitle} (V${versionNumber})`,
          newsTitle: selectedNews?.title ? selectedNews.title.substring(0, 50) : null,
          newsCategory: selectedNews?.category ? selectedNews.category.substring(0, 20) : null,
          textOverlay: textOverlayItems.length > 0 ? JSON.stringify(textOverlayItems.filter(i => i.text.trim()).map(i => ({ text: i.text, position: i.position, fontSize: i.fontSize, fontFamily: i.fontFamily, textColor: i.textColor, bgColor: i.backgroundColor, bgStyle: i.backgroundStyle }))) : null,
          aiModel: 'seedream',
          tags: ['studio-edit'],
        }),
      });
      const data = await res.json();
      if (data.ok && data.savedImage?.id) {
        console.log('[AutoSave] Saved V' + versionNumber + ' as new gallery entry:', data.savedImage.id);
      }
    } catch (err) {
      console.warn('[AutoSave] Error (non-blocking):', err);
    }
  }

  async function saveVideoToLibrary() {
    if (!generatedVideoUrl) {
      console.error('[SaveVideoToLibrary] Missing video URL');
      return;
    }

    setSavingToLibrary(true);

    try {
      // Utiliser supabaseBrowser pour avoir accès à la session
      const supabaseClient = supabaseBrowser();
      const { data: { user } } = await supabaseClient.auth.getUser();

      if (!user) {
        alert(t.generate.alertLoginRequired);
        setSavingToLibrary(false);
        return;
      }

      console.log('[SaveVideoToLibrary] Saving video to library...');

      // Payload pour la vidéo
      const payload = {
        videoUrl: generatedVideoUrl,
        title: selectedNews?.title ? selectedNews.title.substring(0, 50) : t.generate.generatedVideo,
        sourceType: 'seedream_i2v',
        duration: videoDuration || 5,
        thumbnailUrl: null,
        originalImageId: null,
        folderId: null,
        subtitleText: generatedSubtitleText || null,
        audioUrl: generatedAudioUrl || null,
      };

      console.log('[SaveVideoToLibrary] Payload:', payload);

      // Obtenir le token de session pour l'authentification
      const { data: { session } } = await supabaseClient.auth.getSession();
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
        console.log('[SaveVideoToLibrary] Sending with auth token');
      } else {
        console.warn('[SaveVideoToLibrary] No session token available');
      }

      // Si déjà auto-sauvé → PATCH (update), sinon → POST (insert)
      const isUpdate = !!lastSavedVideoId;
      const response = await fetch('/api/library/save-video', {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: headers,
        body: JSON.stringify(isUpdate ? { id: lastSavedVideoId, videoUrl: generatedVideoUrl, title: payload.title } : payload)
      });

      let data;
      try {
        console.log('[SaveVideoToLibrary] Response status:', response.status, isUpdate ? '(UPDATE)' : '(INSERT)');

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[SaveVideoToLibrary] Server error:', errorText);
          throw new Error(`${t.generate.errorServerSuffix} (${response.status}): ${errorText.substring(0, 100)}`);
        }

        data = await response.json();
      } catch (jsonError: any) {
        console.error('[SaveVideoToLibrary] Error:', jsonError);
        throw new Error(jsonError.message || t.generate.errorSaveFailed);
      }

      if (data.ok) {
        setVideoSavedToLibrary(true);
        if (data.video?.id) setLastSavedVideoId(data.video.id);
        console.log('[SaveVideoToLibrary] ✅ Video saved:', data.video?.id);

        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:1rem;right:1rem;background:#16a34a;color:white;padding:0.75rem 1.5rem;border-radius:0.5rem;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);z-index:50;transition:opacity 0.5s ease;opacity:1;';
        toast.innerHTML = `
          <div style="display:flex;align-items:center;gap:0.5rem">
            <svg style="width:1.25rem;height:1.25rem" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>${isUpdate ? t.generate.videoUpdated : t.generate.videoSaved}</span>
          </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; }, 300);
        setTimeout(() => { toast.remove(); window.location.href = '/library'; }, 500);
      } else {
        throw new Error(data.error || t.generate.errorSaveFailed);
      }
    } catch (error: any) {
      console.error('[SaveVideoToLibrary] ❌ Error:', error);
      alert(error.message || t.generate.alertVideoSaveError);
    } finally {
      setSavingToLibrary(false);
    }
  }

  // Génération de vidéo avec Seedream/SeedDance
  async function handleGenerateVideo() {
    if (useNewsMode && !selectedNews) {
      alert(t.generate.alertSelectNews);
      return;
    }
    if (!businessType.trim()) {
      alert(t.generate.alertEnterBusiness);
      return;
    }
    if (!useNewsMode && !businessDescription.trim()) {
      alert(t.generate.alertDescribeBusinessShort);
      return;
    }

    setGeneratingVideo(true);
    setModalMinimized(false);
    setGeneratedVideoUrl(null);
    setVideoTaskId(null);
    setVideoProgress(t.generate.creatingVideoTask);
    setGenerationError(null);
    setVideoSavedToLibrary(false);
    setLastSavedVideoId(null);

    try {
      // Construire le prompt vidéo enrichi — même logique que le prompt image
      const videoRenderStyle = renderStyle === 'illustration'
        ? 'Stylized 3D illustration, digital art, colorful animated style'
        : 'PHOTOREALISTIC footage, real camera, real textures, real lighting — NOT animation, NOT illustration';
      const videoCharStyle = characterStyle === 'fiction'
        ? 'animated fictional characters (3D or stylized)'
        : 'real diverse humans (varied ethnicities, ages)';

      let videoPrompt = '';
      if (useNewsMode && selectedNews) {
        const newsDesc = (selectedNews as any).description?.substring(0, 300) || '';
        videoPrompt = `${videoDuration}-second ultra-premium cinematic social media video. ${videoRenderStyle}.

THE STORY: A "${businessType}" business rides the wave of "${selectedNews.title}".
${businessDescription ? `Business detail: ${businessDescription}.` : ''}
${newsDesc ? `News context: ${newsDesc}.` : ''}

VISUAL FUSION — NEWS × BUSINESS (THE KEY TO THIS VIDEO):
The news topic and the business MUST be visually intertwined in EVERY frame. Not separate — FUSED.
Example: if news is "Tour de France" and business is "bakery" → show a bakery window decorated with cycling themes, croissants shaped like bikes, customers in cycling jerseys celebrating at the counter.
Example: if news is "Cannes Festival" and business is "jewelry" → show glamorous jewelry on a red carpet backdrop, golden necklaces catching spotlights, a jeweler's workshop with film posters.

SCENE STRUCTURE:
- Opening: Wide establishing shot that IMMEDIATELY shows BOTH the news atmosphere AND the business environment fused together. The viewer must understand the connection in 2 seconds.
- Middle: Close-ups on PRODUCTS/DETAILS that embody the news-business fusion. Focus on hands, objects, textures — NOT faces.
- Closing: Pull back to reveal the full scene — the business thriving in the context of this trending moment.

HUMAN DIVERSITY (CRITICAL — each person must be UNIQUE):
- Vary: age (20s, 40s, 60s), ethnicity (Black, White, Asian, Arab, mixed), hair (short, long, curly, straight, bald), clothing style, body type
- PREFER showing people from behind, in silhouette, or via hands/gestures — AI faces often look artificial
- When faces are shown, use medium-wide framing so faces are small in frame

Characters: ${videoCharStyle}.${targetAudience ? ` Target audience: ${targetAudience}.` : ''}
Emotional tone: ${tone || 'professional'}, ${emotionToConvey || 'inspiring'}. Cinematic style: ${visualStyle || 'cinematic'}.
${storyToTell ? `Narrative arc: ${storyToTell}.` : ''}
Camera: Anamorphic lens, shallow depth of field, professional color grading. ${videoDuration <= 10
  ? 'Single powerful tracking shot, golden hour lighting.'
  : 'Progressive camera work: crane establishing → tracking → macro close-ups → wide pullback.'} Dynamic subject movement. Film grain.
ZERO text, words, letters, numbers, signs, logos, watermarks. Pure visual storytelling.`;
      } else {
        videoPrompt = `${videoDuration}-second ultra-premium cinematic social media video. ${videoRenderStyle}.

THE STORY: "${businessType}" at its most captivating.
${businessDescription ? `Detail: ${businessDescription}.` : ''}

VISUAL STORYTELLING:
- Show this business at its absolute BEST — the atmosphere, the products, the human experience
- Focus on PRODUCTS, TEXTURES, CRAFTSMANSHIP — close-ups on hands working, materials gleaming, details that create desire
- Capture authentic moments: customers discovering, reacting, enjoying — show them from behind or in profile
- Every frame must make the viewer want to visit/buy/experience this immediately

HUMAN DIVERSITY (CRITICAL):
- Each person must look UNIQUE: vary age (20s-60s), ethnicity, hair, clothing, body type
- PREFER: over-the-shoulder shots, hands, silhouettes, wide shots where faces are small
- AVOID: multiple similar-looking people, generic stock-photo smiles

Characters: ${videoCharStyle}.${targetAudience ? ` Target audience: ${targetAudience}.` : ''}
Emotional tone: ${tone || 'professional'}, ${emotionToConvey || 'inspiring'}. Cinematic style: ${visualStyle || 'cinematic'}.
${storyToTell ? `Narrative arc: ${storyToTell}.` : ''}
Camera: Anamorphic lens, shallow depth of field, professional color grading. ${videoDuration <= 10
  ? 'Single powerful tracking shot, golden hour lighting.'
  : 'Progressive camera work: crane establishing → tracking → macro close-ups → wide pullback.'} Dynamic subject movement. Film grain.
ZERO text, words, letters, numbers, signs, logos, watermarks. Pure visual storytelling.`;
      }

      // Générer le texte des sous-titres si activé (overlay CSS, PAS envoyé à Seedream)
      if (enableAIText) {
        let subtitleText = '';

        if (addAudio && audioText.trim()) {
          subtitleText = audioText.trim();
        } else if (addAudio && audioTextSource === 'ai') {
          // For AI audio, generate a proper narration text matching the video duration
          try {
            const targetWords = Math.ceil(videoDuration * 2.5);
            const context = useNewsMode && selectedNews
              ? `${selectedNews.title}. Business: ${businessType}. ${businessDescription || ''}`
              : `Business: ${businessType}. ${businessDescription}`;
            const subtitleRes = await fetch('/api/suggest-narration-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ context, targetWords }),
            });
            const subtitleData = await subtitleRes.json();
            if (subtitleData.ok && subtitleData.suggestions?.length > 0) {
              subtitleText = subtitleData.suggestions[0].text;
            }
          } catch {
            subtitleText = useNewsMode && selectedNews ? selectedNews.title : businessDescription;
          }
        } else {
          try {
            setVideoProgress(t.generate.preparingVideo);
            const targetWords = Math.ceil(videoDuration * 2.5);
            const context = useNewsMode && selectedNews
              ? `${selectedNews.title}. Business: ${businessType}. ${businessDescription || ''}`
              : `Business: ${businessType}. ${businessDescription}`;

            const subtitleRes = await fetch('/api/suggest-narration-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ context, targetWords }),
            });
            const subtitleData = await subtitleRes.json();
            if (subtitleData.ok && subtitleData.suggestions?.length > 0) {
              const styleMap: Record<string, string> = {
                wordflash: 'catchy', wordstay: 'catchy', neon: 'catchy',
                cinema: 'informative', impact: 'catchy', minimal: 'informative'
              };
              const targetStyle = styleMap[aiTextStyle] || 'catchy';
              const match = subtitleData.suggestions.find((s: any) => s.style === targetStyle);
              subtitleText = match?.text || subtitleData.suggestions[0].text;
            }
          } catch (e) {
            console.warn('[Video] Failed to generate subtitle text, continuing without:', e);
          }
        }

        // Stocker le texte pour overlay CSS (modifiable dans les modals)
        if (subtitleText) {
          setGeneratedSubtitleText(subtitleText);
          console.log('[Video] Subtitle text generated (overlay CSS):', subtitleText);
        }
        // NE PAS envoyer le texte à Seedream - il génère du texte illisible
        // Le texte sera superposé en CSS dans les modals TikTok/Instagram
      }

      console.log('[Video] Starting generation with prompt:', videoPrompt);

      // Créer la tâche de génération
      // Déterminer le ratio selon la plateforme cible
      const platformRatio = platform === 'TikTok' ? '9:16'
        : platform === 'Instagram' ? '4:5'
        : platform === 'LinkedIn' ? '16:9'
        : platform === 'Twitter/X' ? '16:9'
        : '16:9';
      setVideoAspectRatio(platformRatio);

      // ====== Generate background music in parallel (if selected) ======
      let musicUrlPromise: Promise<string | null> | null = null;
      if (selectedMusic && selectedMusic !== 'none') {
        console.log('[Video] Starting background music generation:', selectedMusic);
        musicUrlPromise = fetch('/api/generate-music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ style: selectedMusic, duration: videoDuration }),
        })
          .then(r => r.json())
          .then(d => d.ok ? d.musicUrl : null)
          .catch(err => { console.warn('[Video] Music generation failed:', err); return null; });
      }

      // ====== VIDÉO LONGUE (>10s) — Multi-segments ======
      if (videoDuration > 10) {
        console.log('[VideoLong] Starting long video generation:', videoDuration, 's');
        setVideoProgress(`${t.generate.videoLongGenerating} (${videoDuration}s)...`);
        setVideoLongSegments([]);
        setVideoLongProgress(0);
        setVideoLongStatus(t.generate.creatingVideoTask);

        // Créer le job vidéo longue
        const longPayload: any = {
              prompt: videoPrompt,
              duration: videoDuration,
              aspectRatio: platformRatio,
              mode: videoGenerationMode,
              renderStyle: renderStyle,
              characterStyle: characterStyle,
              tone: tone,
              visualStyle: visualStyle,
            };
            // Pass advanced segments if configured
            if (videoGenerationMode === 'advanced' && advancedSegments.length > 0 && advancedSegments.some(s => s.prompt)) {
              longPayload.segments = advancedSegments;
            }
            const longRes = await fetch('/api/seedream/video-long', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(longPayload),
        });

        const longData = await longRes.json();
        console.log('[VideoLong] Job creation response:', longData);

        // Gestion erreurs crédits / compte
        if (longRes.status === 402 && longData.insufficientCredits) {
          setGeneratingVideo(false);
          setShowInsufficientCreditsModal(true);
          return;
        }
        if (longRes.status === 403 && longData.blocked) {
          setGeneratingVideo(false);
          setShowRequiresAccountModal(true);
          return;
        }

        if (!longData?.ok || !longData?.jobId) {
          throw new Error(longData?.error || 'Failed to create video generation job');
        }

        // Mettre à jour crédits
        if (longData.newBalance !== undefined) {
          credits.refresh();
        }

        const jobId = longData.jobId;
        setVideoLongJobId(jobId);

        // Initialiser les segments dans l'UI
        if (longData.segments) {
          setVideoLongSegments(longData.segments);
        }

        // Polling du job vidéo longue
        const maxLongAttempts = Math.ceil(videoDuration / 10) * 80; // ~80 polls par segment (6-7min)
        let longAttempt = 0;
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 5;

        const pollLongVideo = async (): Promise<void> => {
          while (longAttempt < maxLongAttempts) {
            longAttempt++;
            await new Promise(resolve => setTimeout(resolve, 5000));

            try {
              const statusRes = await fetch(`/api/seedream/video-long?jobId=${jobId}`);
              const statusData = await statusRes.json();
              console.log('[VideoLong] Poll:', statusData.status, statusData.completedSegments, '/', statusData.totalSegments);

              // Reset consecutive errors on successful poll
              consecutiveErrors = 0;

              // Mettre à jour l'UI
              if (statusData.segments) {
                setVideoLongSegments(statusData.segments);
              }

              const progress = statusData.totalSegments > 0
                ? Math.round((statusData.completedSegments / statusData.totalSegments) * 100)
                : 0;
              setVideoLongProgress(progress);

              // Check if any segment has failed
              if (statusData.segments) {
                const failedSeg = statusData.segments.find((s: any) => s.status === 'failed');
                if (failedSeg) {
                  throw new Error(locale === 'fr'
                    ? (videoGenerationMode === 'advanced'
                      ? `La g\u00E9n\u00E9ration vid\u00E9o a \u00E9chou\u00E9 au segment ${failedSeg.index + 1}. Veuillez r\u00E9essayer.`
                      : `La g\u00E9n\u00E9ration vid\u00E9o a \u00E9chou\u00E9. Veuillez r\u00E9essayer.`)
                    : (videoGenerationMode === 'advanced'
                      ? `Video generation failed at segment ${failedSeg.index + 1}. Please try again.`
                      : `Video generation failed. Please try again.`));
                }
              }

              if (statusData.status === 'generating') {
                setVideoLongStatus(`${t.generate.videoGeneratingSegment} ${statusData.completedSegments + 1}/${statusData.totalSegments}`);
                if (videoGenerationMode === 'advanced') {
                  setVideoProgress(`${t.generate.videoLongGenerating} \u2014 ${t.generate.videoSegment} ${statusData.completedSegments + 1}/${statusData.totalSegments} (${progress}%)`);
                } else {
                  setVideoProgress(`${t.generate.videoLongGenerating} (${progress}%)`);
                }
              } else if (statusData.status === 'merging') {
                setVideoLongStatus(t.generate.videoMerging);
                setVideoProgress(videoGenerationMode === 'advanced' ? t.generate.videoMerging : `${t.generate.videoLongGenerating} (95%)`);
                setVideoLongProgress(95);
              } else if (statusData.status === 'completed' && statusData.finalVideoUrl) {
                console.log('[VideoLong] Video ready:', statusData.finalVideoUrl, 'mergeSkipped:', statusData.mergeSkipped, 'segmentUrls:', statusData.segmentUrls?.length);
                let finalVideoUrl = statusData.finalVideoUrl;

                // If merge failed but we have all segment URLs, retry via dedicated merge route
                if (statusData.mergeSkipped && statusData.segmentUrls?.length > 1) {
                  console.log('[VideoLong] Server merge was skipped, retrying via dedicated merge route...');
                  setVideoProgress(videoGenerationMode === 'advanced' ? t.generate.videoMerging : `${t.generate.videoLongGenerating} (98%)`);
                  try {
                    const mergeRetryRes = await fetch('/api/seedream/video-long/merge', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ segmentUrls: statusData.segmentUrls, jobId }),
                    });
                    const mergeRetryData = await mergeRetryRes.json();
                    if (mergeRetryData.ok && mergeRetryData.mergedUrl) {
                      finalVideoUrl = mergeRetryData.mergedUrl;
                      console.log('[VideoLong] Dedicated merge route succeeded:', finalVideoUrl);
                    }
                  } catch (mergeRetryErr) {
                    console.warn('[VideoLong] Dedicated merge route failed:', mergeRetryErr);
                  }
                }

                // Audio TTS + background music merge
                const resolvedMusicUrl = musicUrlPromise ? await musicUrlPromise : null;
                const needsAudioMerge = addAudio || resolvedMusicUrl;

                if (needsAudioMerge) {
                  try {
                    let audioUrlForMerge = generatedAudioUrl;

                    // Generate voice narration if requested
                    if (addAudio && !audioUrlForMerge) {
                      setVideoProgress(t.generate.finalizingVideoProgress);
                      let textForAudio = '';
                      if (audioTextSource === 'ai') {
                        textForAudio = useNewsMode && selectedNews
                          ? `${selectedNews.title}. ${selectedNews.description?.substring(0, 100) || ''}`
                          : `${businessType}. ${businessDescription?.substring(0, 150) || ''}`;
                      } else {
                        textForAudio = audioText.trim();
                      }
                      if (textForAudio) {
                        const audioRes = await fetch('/api/generate-audio-tts', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ text: textForAudio, targetDuration: videoDuration, voice: selectedVoice, speed: 1.0 })
                        });
                        const audioData = await audioRes.json();
                        if (audioData.ok && audioData.audioUrl) {
                          audioUrlForMerge = audioData.audioUrl;
                          setGeneratedAudioUrl(audioData.audioUrl);
                        }
                      }
                    }

                    // Merge voice + music (or just one) into the video
                    if (audioUrlForMerge || resolvedMusicUrl) {
                      setVideoProgress(t.generate.finalizingVideoProgress);
                      const mergePayload: any = { videoUrl: finalVideoUrl };
                      if (audioUrlForMerge) mergePayload.audioUrl = audioUrlForMerge;
                      if (resolvedMusicUrl) mergePayload.musicUrl = resolvedMusicUrl;

                      console.log('[VideoLong] Merging audio:', { voice: !!audioUrlForMerge, music: !!resolvedMusicUrl });
                      const mergeRes = await fetch('/api/merge-audio-video', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(mergePayload)
                      });
                      const mergeData = await mergeRes.json();
                      if (mergeData.ok && mergeData.mergedUrl) {
                        finalVideoUrl = mergeData.mergedUrl;
                      }
                    }
                  } catch (audioErr) {
                    console.warn('[VideoLong] Audio/music merge error:', audioErr);
                  }
                }

                setGeneratedVideoUrl(finalVideoUrl);
                setVideoProgress('');
                setGeneratingVideo(false);
                setVideoLongProgress(100);
                setVideoLongStatus('');

                // Auto-save
                try {
                  const sbClient = supabaseBrowser();
                  const { data: { user: vUser } } = await sbClient.auth.getUser();
                  if (vUser) {
                    const { data: { session: vSession } } = await sbClient.auth.getSession();
                    const vHeaders: HeadersInit = { 'Content-Type': 'application/json' };
                    if (vSession?.access_token) vHeaders['Authorization'] = `Bearer ${vSession.access_token}`;
                    await fetch('/api/library/save-video', {
                      method: 'POST',
                      headers: vHeaders,
                      body: JSON.stringify({
                        videoUrl: finalVideoUrl,
                        title: selectedNews?.title ? selectedNews.title.substring(0, 50) : t.generate.generatedVideo,
                        sourceType: 'seedream_i2v',
                        duration: videoDuration,
                        subtitleText: generatedSubtitleText || null,
                        audioUrl: generatedAudioUrl || null,
                      })
                    });
                  }
                } catch (autoSaveErr) {
                  console.error('[VideoLong] Auto-save error:', autoSaveErr);
                }
                return;
              } else if (statusData.status === 'failed') {
                throw new Error(statusData.error || t.generate.errorVideoGenerationFailed);
              }
            } catch (fetchError: any) {
              // Stop immediately on definitive failures
              if (fetchError.message?.includes('chou') || fetchError.message?.includes('ailed') || fetchError.message?.includes('segment')) {
                throw fetchError;
              }
              consecutiveErrors++;
              console.warn(`[VideoLong] Poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, fetchError);
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                throw new Error(locale === 'fr'
                  ? 'La g\u00E9n\u00E9ration vid\u00E9o a \u00E9chou\u00E9 apr\u00E8s plusieurs tentatives. Veuillez r\u00E9essayer.'
                  : 'Video generation failed after multiple attempts. Please try again.');
              }
            }
          }
          throw new Error(t.generate.errorVideoTimeout);
        };

        setVideoProgress(`${t.generate.videoLongGenerating}...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        await pollLongVideo();
        return; // Exit early — long video path handled
      }

      // ====== VIDÉO COURTE (≤10s) — Single segment direct ======
      const res = await fetch('/api/seedream/t2v', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt,
          duration: videoDuration,
          resolution: '1080p',
          aspectRatio: platformRatio
        }),
      });

      const data = await res.json();
      console.log('[Video] Task creation response:', data);

      // Crédits insuffisants
      if (res.status === 402 && data.insufficientCredits) {
        setGeneratingVideo(false);
        setShowInsufficientCreditsModal(true);
        return;
      }
      // Requiert un compte
      if (res.status === 403 && data.blocked) {
        setGeneratingVideo(false);
        setShowRequiresAccountModal(true);
        return;
      }

      if (!data?.ok) {
        const errorMsg = data?.error || t.generate.creatingVideoTask;
        console.error('[Video] Task creation failed:', errorMsg);
        if (data?.debug) console.log('[Video] Debug info:', data.debug);
        throw new Error(errorMsg);
      }

      // Mettre à jour crédits après succès
      if (data.newBalance !== undefined) {
        credits.refresh();
      }

      setVideoTaskId(data.taskId);
      if (data._p) setLastVideoProvider(data._p);
      console.log('[Video] Task created:', data.taskId, 'Provider:', data._p);

      // Polling pour vérifier le statut avec gestion d'erreur améliorée
      const maxAttempts = 60; // 5 min max for short videos

      const pollWithRetry = async (attempt: number): Promise<void> => {
        if (attempt >= maxAttempts) {
          throw new Error(t.generate.errorVideoTimeout);
        }

        setVideoProgress(`${t.generate.generationInProgressTime} (${attempt * 5}s / 300s max)`);

        try {
          const statusRes = await fetch('/api/seedream/t2v', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: data.taskId }),
          });

          const statusData = await statusRes.json();
          console.log('[Video] Status check response:', statusData);
          if (statusData._p) setLastVideoProvider(statusData._p);

          if (statusData.status === 'completed') {
            if (statusData.videoUrl) {
              console.log('[Video] Video ready:', statusData.videoUrl);

              let finalVideoUrl = statusData.videoUrl;

              // Audio TTS + background music merge
              const resolvedMusicUrlShort = musicUrlPromise ? await musicUrlPromise : null;
              const needsShortMerge = addAudio || resolvedMusicUrlShort;

              if (needsShortMerge) {
                try {
                  let audioUrlForMerge = generatedAudioUrl;

                  if (addAudio && !audioUrlForMerge) {
                    setVideoProgress(t.generate.finalizingVideoProgress);
                    let textForAudio = '';
                    if (audioTextSource === 'ai') {
                      textForAudio = useNewsMode && selectedNews
                        ? `${selectedNews.title}. ${selectedNews.description?.substring(0, 100) || ''}`
                        : `${businessType}. ${businessDescription?.substring(0, 150) || ''}`;
                    } else {
                      textForAudio = audioText.trim();
                    }

                    if (textForAudio) {
                      const audioRes = await fetch('/api/generate-audio-tts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: textForAudio, targetDuration: videoDuration, voice: selectedVoice, speed: 1.0 })
                      });
                      const audioData = await audioRes.json();
                      if (audioData.ok && audioData.audioUrl) {
                        audioUrlForMerge = audioData.audioUrl;
                        setGeneratedAudioUrl(audioData.audioUrl);
                        console.log('[Video] Audio TTS generated:', audioData.audioUrl);
                      }
                    }
                  }

                  if (audioUrlForMerge || resolvedMusicUrlShort) {
                    setVideoProgress(t.generate.finalizingVideoProgress);
                    const mergePayload: any = { videoUrl: finalVideoUrl };
                    if (audioUrlForMerge) mergePayload.audioUrl = audioUrlForMerge;
                    if (resolvedMusicUrlShort) mergePayload.musicUrl = resolvedMusicUrlShort;

                    console.log('[Video] Merging audio:', { voice: !!audioUrlForMerge, music: !!resolvedMusicUrlShort });
                    const mergeRes = await fetch('/api/merge-audio-video', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(mergePayload)
                    });
                    const mergeData = await mergeRes.json();
                    if (mergeData.ok && mergeData.mergedUrl) {
                      finalVideoUrl = mergeData.mergedUrl;
                      console.log('[Video] Audio/music merged into video:', finalVideoUrl);
                    } else {
                      console.warn('[Video] Merge failed:', mergeData.error);
                    }
                  }
                } catch (audioErr) {
                  console.warn('[Video] Audio/music merge error (non-blocking):', audioErr);
                }
              }

              setGeneratedVideoUrl(finalVideoUrl);
              setVideoProgress('');
              setGeneratingVideo(false);

              // Auto-save vidéo en galerie
              try {
                const sbClient = supabaseBrowser();
                const { data: { user: vUser } } = await sbClient.auth.getUser();
                if (vUser) {
                  const { data: { session: vSession } } = await sbClient.auth.getSession();
                  const vHeaders: HeadersInit = { 'Content-Type': 'application/json' };
                  if (vSession?.access_token) vHeaders['Authorization'] = `Bearer ${vSession.access_token}`;
                  const vSaveRes = await fetch('/api/library/save-video', {
                    method: 'POST',
                    headers: vHeaders,
                    body: JSON.stringify({
                      videoUrl: finalVideoUrl,
                      title: selectedNews?.title ? selectedNews.title.substring(0, 50) : t.generate.generatedVideo,
                      sourceType: 'seedream_i2v',
                      duration: videoDuration,
                      subtitleText: generatedSubtitleText || null,
                      audioUrl: generatedAudioUrl || null,
                    })
                  });
                  const vSaveData = await vSaveRes.json();
                  if (vSaveData.ok && vSaveData.video?.id) {
                    setLastSavedVideoId(vSaveData.video.id);
                    setMonthlyStats(prev => prev ? { ...prev, videos: prev.videos + 1 } : { images: 0, videos: 1, assistant: 0 });
                    console.log('[Video] Auto-saved to library:', vSaveData.video.id);
                  }
                }
              } catch (autoSaveErr) {
                console.error('[Video] Auto-save error:', autoSaveErr);
              }

              return;
            } else {
              console.error('[Video] Completed but no URL. Full response:', JSON.stringify(statusData, null, 2));
              const debugInfo = statusData.debug ? JSON.stringify(statusData.debug, null, 2) : 'No debug data';
              throw new Error(`${t.generate.errorVideoUrlNotFound} Debug: ${debugInfo.substring(0, 500)}`);
            }
          }

          if (statusData.status === 'failed' || !statusData.ok) {
            throw new Error(statusData.error || t.generate.errorVideoGenerationFailed);
          }

          // Encore en cours - continuer le polling
          await new Promise(resolve => setTimeout(resolve, 5000));
          return pollWithRetry(attempt + 1);

        } catch (fetchError: any) {
          console.error('[Video] Polling error:', fetchError);
          throw fetchError;
        }
      };

      // Attendre 5s puis commencer le polling
      setVideoProgress(t.generate.startingGeneration);
      await new Promise(resolve => setTimeout(resolve, 5000));
      await pollWithRetry(1);

    } catch (e: any) {
      console.error('[Video] Generation error:', e);
      setGenerationError(e.message || t.generate.videoGenerationInProgress);
      setGeneratingVideo(false);
      setVideoProgress('');
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      {/* Badge Admin */}
      <AdminBadge />

      <div className="max-w-7xl mx-auto">
        <p className="text-sm text-neutral-400 mb-6 tracking-wide">
          {useNewsMode
            ? t.generate.subtitleWithNews
            : t.generate.subtitleWithoutNews}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ===== COLONNE GAUCHE : Tendances + Actualités ===== */}
          <div className="lg:col-span-8">
            {/* ─── Pays/Régions — filtre commun tendances + actualités ─── */}
            <div className={`mb-3 -mx-1 overflow-x-auto scrollbar-hide ${!useNewsMode ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="flex gap-1.5 px-1 pb-1">
                {NEWS_REGIONS.map((r) => {
                  const isActive = newsRegion === r.code;
                  return (
                    <button
                      key={r.code}
                      onClick={() => useNewsMode && setNewsRegion(r.code)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                      disabled={!useNewsMode}
                    >
                      {locale === 'fr' ? r.nameFr : r.nameEn}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── Tendances réseaux sociaux (style magazine) ─── */}
            <div className={`mb-4 relative ${!useNewsMode ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-base mr-0.5">🔥</span>
                <span className="text-xs font-bold text-neutral-800 mr-3">{locale === 'fr' ? 'Tendances' : 'Trending'}</span>
                {([
                  { key: 'google' as const, label: '🔍 Google', bg: 'bg-orange-500', bgHover: 'hover:bg-orange-600' },
                  { key: 'tiktok' as const, label: '🎵 TikTok', bg: 'bg-blue-500', bgHover: 'hover:bg-blue-600' },
                  { key: 'instagram' as const, label: '📸 Instagram', bg: 'bg-pink-500', bgHover: 'hover:bg-pink-600' },
                  { key: 'linkedin' as const, label: '💼 LinkedIn', bg: 'bg-sky-600', bgHover: 'hover:bg-sky-700' },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setTrendTab(tab.key)}
                    className={`px-2.5 py-1 text-[10px] font-semibold rounded-full transition-all ${
                      trendTab === tab.key
                        ? `${tab.bg} text-white shadow-sm`
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
                {trendingData && <span className="text-[9px] text-neutral-400 ml-auto">{t.generate.updatedToday}</span>}
              </div>

              {/* Magazine-style trend cards (same style as news) */}
              <div className="grid grid-cols-3 gap-2.5">
                {/* Google Trends */}
                {trendTab === 'google' && (<>
                  {(trendingData?.googleTrends || []).slice(0, 3).map((trend: any, i: number) => (
                    <article
                      key={`g-${i}`}
                      onClick={() => {
                        setUseNewsMode(true);
                        setSelectedNews({
                          id: `trend-google-${i}`,
                          title: trend.articleTitle || trend.title,
                          description: trend.articleTitle || trend.title,
                          url: trend.articleUrl || '',
                          image: trend.pictureUrl,
                          source: 'Google Trends',
                          category: 'Tendance',
                        });
                        const el = document.getElementById('business-description');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
                      style={{ height: '120px' }}
                    >
                      {trend.pictureUrl ? (
                        <img src={trend.pictureUrl} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-600 to-rose-700" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                      <span className="absolute top-2 left-2 text-[8px] bg-orange-500/90 text-white font-bold px-1.5 py-0.5 rounded-full z-10">#{i + 1} Google</span>
                      {trend.traffic && <span className="absolute top-2 right-2 text-[7px] bg-white/90 text-neutral-700 font-bold px-1.5 py-0.5 rounded-full z-10">{trend.traffic}</span>}
                      <div className="absolute bottom-0 left-0 right-0 p-2.5 z-10">
                        <h3 className="font-semibold text-[11px] leading-tight text-white line-clamp-2 drop-shadow-sm">
                          {trend.articleTitle || trend.title}
                        </h3>
                        {trend.articleTitle && trend.title !== trend.articleTitle && (
                          <p className="text-[9px] text-white/60 mt-0.5 line-clamp-1">{trend.title}</p>
                        )}
                      </div>
                    </article>
                  ))}
                  {(!trendingData?.googleTrends || trendingData.googleTrends.length === 0) && (
                    <span className="text-[10px] text-neutral-400 animate-pulse col-span-3">{t.generate.loadingTrends}</span>
                  )}
                </>)}

                {/* TikTok Trends */}
                {trendTab === 'tiktok' && (<>
                  {(trendingData?.tiktokTrends || []).slice(0, 3).map((trend: any, i: number) => (
                    <article
                      key={`t-${i}`}
                      onClick={() => {
                        setUseNewsMode(true);
                        setSelectedNews({
                          id: `trend-tiktok-${i}`,
                          title: trend.title,
                          description: trend.description || trend.title,
                          url: '',
                          image: trend.imageUrl,
                          source: 'TikTok Trends',
                          category: 'Tendance',
                        });
                        const el = document.getElementById('business-description');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
                      style={{ height: '120px' }}
                    >
                      {trend.imageUrl ? (
                        <img src={trend.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-cyan-700" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                      <span className="absolute top-2 left-2 text-[8px] bg-blue-500/90 text-white font-bold px-1.5 py-0.5 rounded-full z-10">🎵 TikTok</span>
                      {trend.engagement && <span className="absolute top-2 right-2 text-[7px] bg-white/90 text-neutral-700 font-bold px-1.5 py-0.5 rounded-full z-10">{trend.engagement}</span>}
                      <div className="absolute bottom-0 left-0 right-0 p-2.5 z-10">
                        <h3 className="font-semibold text-[11px] leading-tight text-white line-clamp-2 drop-shadow-sm">
                          {trend.title}
                        </h3>
                        {trend.keyword && trend.keyword !== trend.title && (
                          <p className="text-[9px] text-white/60 mt-0.5 line-clamp-1">{trend.keyword}</p>
                        )}
                      </div>
                    </article>
                  ))}
                  {(!trendingData?.tiktokTrends || trendingData.tiktokTrends.length === 0) && (
                    <span className="text-[10px] text-neutral-400 animate-pulse col-span-3">{t.generate.loadingTrends}</span>
                  )}
                  {/* Real TikTok Hashtags from Creative Center */}
                  {trendingData?.tiktokRealHashtags && trendingData.tiktokRealHashtags.length > 0 && (
                    <div className="col-span-3 flex flex-wrap gap-1 mt-1">
                      {trendingData.tiktokRealHashtags.slice(0, 6).map((h: any, i: number) => (
                        <span key={i} className="text-[9px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">
                          #{h.hashtag} {h.viewsFormatted && <span className="text-blue-400 ml-0.5">{h.viewsFormatted}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </>)}

                {/* Instagram Trends */}
                {trendTab === 'instagram' && (<>
                  {(trendingData?.instagramTrends || []).slice(0, 3).map((trend: any, i: number) => (
                    <article
                      key={`i-${i}`}
                      onClick={() => {
                        setUseNewsMode(true);
                        setSelectedNews({
                          id: `trend-insta-${i}`,
                          title: trend.title,
                          description: trend.description || trend.title,
                          url: '',
                          image: trend.imageUrl,
                          source: 'Instagram Trends',
                          category: 'Tendance',
                        });
                        const el = document.getElementById('business-description');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
                      style={{ height: '120px' }}
                    >
                      {trend.imageUrl ? (
                        <img src={trend.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-700" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                      <span className="absolute top-2 left-2 text-[8px] bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-1.5 py-0.5 rounded-full z-10">📸 Instagram</span>
                      {trend.engagement && <span className="absolute top-2 right-2 text-[7px] bg-white/90 text-neutral-700 font-bold px-1.5 py-0.5 rounded-full z-10">{trend.engagement}</span>}
                      <div className="absolute bottom-0 left-0 right-0 p-2.5 z-10">
                        <h3 className="font-semibold text-[11px] leading-tight text-white line-clamp-2 drop-shadow-sm">
                          {trend.title}
                        </h3>
                        {trend.keyword && trend.keyword !== trend.title && (
                          <p className="text-[9px] text-white/60 mt-0.5 line-clamp-1">{trend.keyword}</p>
                        )}
                      </div>
                    </article>
                  ))}
                  {(!trendingData?.instagramTrends || trendingData.instagramTrends.length === 0) && (
                    <span className="text-[10px] text-neutral-400 animate-pulse col-span-3">{t.generate.loadingTrends}</span>
                  )}
                  {/* Real Instagram Hashtags */}
                  {trendingData?.instagramHashtags && trendingData.instagramHashtags.length > 0 && (
                    <div className="col-span-3 flex flex-wrap gap-1 mt-1">
                      {trendingData.instagramHashtags.slice(0, 6).map((h: any, i: number) => (
                        <span key={i} className="text-[9px] px-2 py-0.5 bg-pink-50 text-pink-600 rounded-full font-medium">
                          #{h.hashtag} {h.engagement && <span className="text-pink-400 ml-0.5">{h.engagement}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </>)}

                {/* LinkedIn Trends */}
                {trendTab === 'linkedin' && (<>
                  {(trendingData?.linkedinTrends || []).slice(0, 3).map((trend: any, i: number) => (
                    <article
                      key={`li-${i}`}
                      onClick={() => {
                        setUseNewsMode(true);
                        setSelectedNews({
                          id: `trend-linkedin-${i}`,
                          title: trend.title,
                          description: trend.description || trend.title,
                          url: trend.url || '',
                          image: trend.imageUrl,
                          source: 'LinkedIn Trends',
                          category: 'Business',
                        });
                        const el = document.getElementById('business-description');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
                      style={{ height: '120px' }}
                    >
                      {trend.imageUrl ? (
                        <img src={trend.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-sky-700 to-blue-900" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                      <span className="absolute top-2 left-2 text-[8px] bg-sky-600 text-white font-bold px-1.5 py-0.5 rounded-full z-10">💼 LinkedIn</span>
                      {trend.engagement && <span className="absolute top-2 right-2 text-[7px] bg-white/90 text-neutral-700 font-bold px-1.5 py-0.5 rounded-full z-10">{trend.engagement}</span>}
                      <div className="absolute bottom-0 left-0 right-0 p-2.5 z-10">
                        <h3 className="font-semibold text-[11px] leading-tight text-white line-clamp-2 drop-shadow-sm">
                          {trend.title}
                        </h3>
                        {trend.keyword && trend.keyword !== trend.title && (
                          <p className="text-[9px] text-white/60 mt-0.5 line-clamp-1">{trend.keyword}</p>
                        )}
                      </div>
                    </article>
                  ))}
                  {(!trendingData?.linkedinTrends || trendingData.linkedinTrends.length === 0) && (
                    <span className="text-[10px] text-neutral-400 animate-pulse col-span-3">{t.generate.loadingTrends}</span>
                  )}
                </>)}
              </div>
            </div>

            {/* Section actualités — grisée en mode "Sans actualité" */}
            <div className="relative">
              {/* Overlay mode sans actualité */}
              {!useNewsMode && (
                <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-[2px] rounded-xl flex items-start justify-center pt-16">
                  <div className="text-center max-w-sm px-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <h4 className="font-bold text-neutral-900 text-sm mb-2">
                      {locale === 'fr' ? 'Boostez votre visibilité' : 'Boost your visibility'}
                    </h4>
                    <p className="text-xs text-neutral-600 mb-4 leading-relaxed">
                      {locale === 'fr'
                        ? 'Activez le mode actualité pour surfer sur les tendances du moment. Les algorithmes favorisent les contenus liés à l\'actualité — profitez-en pour être mis en avant !'
                        : 'Enable news mode to ride the latest trends. Algorithms favor content tied to current events — take advantage to get featured!'}
                    </p>
                    <button
                      onClick={() => setUseNewsMode(true)}
                      className="px-5 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs font-semibold rounded-lg hover:shadow-lg transition-all"
                    >
                      {locale === 'fr' ? 'Activer le mode actualité' : 'Enable news mode'}
                    </button>
                  </div>
                </div>
              )}

              {/* Filtres : Catégorie + Recherche */}
              <div className={`mb-3 flex gap-2 ${!useNewsMode ? 'opacity-30' : ''}`}>
                {/* Dropdown Catégories */}
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1.5 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
                  disabled={!useNewsMode}
                >
                  {availableCategories.map((cat) => {
                    const categoryLabels: Record<string, string> = {
                      'Les bonnes nouvelles': t.generate.catGoodNews,
                      'Dernières news': t.generate.catLatestNews,
                      'Tech & Gaming': t.generate.catTechGaming,
                      'Business & Finance': t.generate.catBusinessFinance,
                      'Santé & Bien-être': t.generate.catHealthWellness,
                      'Sport': t.generate.catSport,
                      'Cinéma & Séries': t.generate.catMoviesSeries,
                      'Musique & Festivals': t.generate.catMusicFestivals,
                      'Politique': t.generate.catPolitics,
                      'Science & Environnement': t.generate.catScienceEnvironment,
                      'Nature & Animaux': t.generate.catNatureAnimals,
                      'International': t.generate.catInternational,
                      'Moteurs & Adrénaline': t.generate.catMotorsAdrenaline,
                      'Food & Gastronomie': t.generate.catFoodGastronomy,
                      'Lifestyle & People': t.generate.catLifestylePeople,
                    };
                    return (
                      <option key={cat} value={cat}>
                        {categoryLabels[cat] || cat}
                      </option>
                    );
                  })}
                </select>

                {/* Barre de recherche */}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={t.generate.searchPlaceholder}
                  className="flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!useNewsMode}
                />
              </div>

              {/* Cartes d'actualités (3 colonnes) */}
              <div className={!useNewsMode ? 'opacity-30' : ''}>
                {loading && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="rounded-xl overflow-hidden bg-neutral-100 animate-pulse" style={{ height: '180px' }}>
                        <div className="h-full flex flex-col justify-end p-3">
                          <div className="h-3 bg-neutral-200 rounded w-3/4 mb-2" />
                          <div className="h-3 bg-neutral-200 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    {error}
                  </div>
                )}

                {!loading && !error && filteredNews.length === 0 && (
                  <div className="text-center py-8 text-neutral-500">
                    {t.generate.noNewsFound}
                  </div>
                )}

                {!loading && filteredNews.length > 0 && (<>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredNews.slice(0, visibleNewsCount).map((item) => (
                      <article
                        key={item.id}
                        onClick={() => {
                          if (!useNewsMode) return;
                          if (selectedNews?.id === item.id) {
                            setSelectedNews(null);
                          } else {
                            setSelectedNews(item);
                          }
                        }}
                        className={`group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 ${
                          selectedNews?.id === item.id
                            ? 'ring-2 ring-blue-500 ring-offset-1'
                            : ''
                        }`}
                        style={{ height: '180px' }}
                      >
                        {/* Image de fond */}
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.title}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-neutral-700 to-neutral-900" />
                        )}

                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                        {/* Badge sélectionné */}
                        {selectedNews?.id === item.id && (
                          <div className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-medium z-10">
                            {t.generate.selected}
                          </div>
                        )}

                        {/* Contenu en overlay */}
                        <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                          <h3 className="font-semibold text-[13px] leading-tight text-white line-clamp-2 drop-shadow-sm">
                            {item.title}
                          </h3>
                          <div className="flex items-center justify-between mt-1.5">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] text-white/70 hover:text-white transition-colors"
                            >
                              {item.source || 'Source'}
                            </a>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  {visibleNewsCount < filteredNews.length && visibleNewsCount < 9 && (
                    <button
                      onClick={() => setVisibleNewsCount(prev => Math.min(prev + 3, 9))}
                      className="mt-3 mx-auto flex items-center gap-1.5 text-xs text-neutral-400 hover:text-blue-500 transition-colors"
                    >
                      {t.generate.showMoreNews}
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  )}
                </>)}
              </div>
            </div>

            {/* ===== WIDGETS SECTION (toujours visible, ne dépend pas du chargement des news) ===== */}
            <div className="space-y-3 mt-6">
              {/* Widget Sprint Countdown */}
              {!credits.loading && credits.plan === 'sprint' && credits.resetAt && (() => {
                void sprintTick; // force re-render on tick
                const sprintEnd = new Date(credits.resetAt).getTime() + 3 * 24 * 60 * 60 * 1000;
                const now = Date.now();
                const remaining = Math.max(0, sprintEnd - now);
                const totalMs = 3 * 24 * 60 * 60 * 1000;
                const pct = Math.round((remaining / totalMs) * 100);
                const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
                const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
                return (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">⏱️</span>
                      <span className="text-xs font-bold text-amber-900">{t.generate.sprintFounder}</span>
                    </div>
                    <p className="text-sm font-bold text-amber-800 mb-2">
                      {remaining > 0 ? `${t.generate.sprintTimeRemaining} ${days}j ${hours}h ${mins}min` : t.generate.sprintFinished}
                    </p>
                    <div className="w-full bg-amber-200 rounded-full h-2 mb-3">
                      <div
                        className={`h-2 rounded-full transition-all ${pct > 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                    <button
                      onClick={() => startCheckout('fondateurs')}
                      className="block w-full py-2 text-center text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg hover:shadow-lg transition-all"
                    >
                      {t.generate.upgradeFounders}
                    </button>
                    <p className="text-[9px] text-amber-700 text-center mt-1.5">{t.generate.sprintDeducted}</p>
                  </div>
                );
              })()}

              {/* Widget 1 : Crédits */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                {!credits.loading && credits.plan ? (
                  (() => {
                    const bal = credits.balance;
                    const total = credits.monthlyAllowance;
                    const usedPct = total > 0 ? Math.round(((total - bal) / total) * 100) : 0;
                    const isCreditsOut = bal < 1;
                    const cantMakeImage = bal < 5;
                    const isFree = credits.plan === 'free';
                    const isSoloOrPromo = credits.plan === 'solo' || credits.plan === 'solo_promo';

                    // Niveaux d'usage par feature : combien on peut encore en faire
                    const features = [
                      { label: 'Images', icon: '🖼️', cost: 5, remaining: Math.floor(bal / 5) },
                      { label: t.generate.featureVideos, icon: '🎬', cost: 25, remaining: Math.floor(bal / 25) },
                      { label: t.generate.featureAudioText, icon: '✨', cost: 1, remaining: Math.floor(bal / 1) },
                    ];

                    const getIntensity = (remaining: number, cost: number) => {
                      const maxPossible = total > 0 ? Math.floor(total / cost) : 0;
                      if (maxPossible === 0) return { label: '—', color: 'text-neutral-400', bg: 'bg-neutral-100' };
                      const usedRatio = maxPossible > 0 ? 1 - (remaining / maxPossible) : 1;
                      if (remaining === 0) return { label: t.generate.exhausted, color: 'text-red-700', bg: 'bg-red-100' };
                      if (usedRatio < 0.4) return { label: t.generate.light, color: 'text-green-700', bg: 'bg-green-100' };
                      if (usedRatio < 0.75) return { label: t.generate.moderate, color: 'text-amber-700', bg: 'bg-amber-100' };
                      return { label: t.generate.intensive, color: 'text-red-700', bg: 'bg-red-100' };
                    };

                    return (
                      <div>
                        {/* Bannière crédits épuisés */}
                        {cantMakeImage && (
                          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                            <p className="text-xs font-bold text-red-700 mb-1">
                              {isCreditsOut ? t.generate.creditsExhausted : `${bal} ${t.generate.creditsRemaining}`}
                            </p>
                            <p className="text-[10px] text-red-600 mb-2">
                              {isSoloOrPromo
                                ? t.generate.promoQuotaReached
                                : isFree
                                ? t.generate.freePlanLimited
                                : t.generate.notEnoughCredits}
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => startCheckout('pro')}
                                className="flex-1 py-1.5 text-[11px] font-semibold text-blue-700 bg-blue-100 border border-blue-200 rounded-lg hover:bg-blue-200 transition-colors cursor-pointer"
                              >
                                {t.generate.proPrice}
                              </button>
                              <button
                                onClick={() => startCheckout('fondateurs')}
                                className="flex-1 py-1.5 text-[11px] font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors cursor-pointer"
                              >
                                {t.generate.foundersPrice}
                              </button>
                            </div>
                            <p className="text-[9px] text-purple-600 mt-1.5 font-medium">
                              {t.generate.foundersFeatures}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">{t.generate.yourUsage}</span>
                          <span className="text-[10px] text-neutral-400 capitalize">
                            {new Date().toLocaleDateString('fr-FR', { month: 'long' })}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {features.map((f) => {
                            const intensity = getIntensity(f.remaining, f.cost);
                            return (
                              <div key={f.label} className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">{f.icon}</span>
                                  <span className="text-xs text-neutral-700 font-medium">{f.label}</span>
                                </div>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${intensity.bg} ${intensity.color}`}>
                                  {f.remaining === 0 ? t.generate.exhausted : intensity.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Barre globale */}
                        <div className="flex items-center gap-2 mt-3">
                          <div className="flex-1 bg-neutral-200 rounded-full h-1">
                            <div
                              className={`h-1 rounded-full transition-all ${usedPct >= 75 ? 'bg-red-400' : usedPct >= 40 ? 'bg-amber-400' : 'bg-green-400'}`}
                              style={{ width: `${Math.min(100, Math.max(2, usedPct))}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-neutral-400">{usedPct}%</span>
                        </div>

                        {/* CTA upgrade pour plan gratuit (quand pas déjà en bannière épuisé) */}
                        {isFree && !cantMakeImage && (
                          <button
                            onClick={() => router.push('/pricing')}
                            className="w-full mt-3 py-1.5 text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors cursor-pointer"
                          >
                            {t.generate.freePlanLimitedCta}
                          </button>
                        )}

                        {/* CTA Solo / Solo Promo → Fondateurs (quand pas déjà en bannière épuisé) */}
                        {isSoloOrPromo && !cantMakeImage && (
                          <>
                            <button
                              onClick={() => startCheckout('fondateurs')}
                              className="block w-full mt-3 py-1.5 text-center text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
                            >
                              {t.generate.tiktokLinkedinMore}
                            </button>
                            {credits.expiresAt && (
                              <p className="text-[10px] text-red-500 mt-1 text-center font-medium">
                                {t.generate.promoExpiresOn} {new Date(credits.expiresAt).toLocaleDateString('fr-FR')} — <a href="/pricing" className="underline cursor-pointer">{t.generate.subscribe}</a>
                              </p>
                            )}
                          </>
                        )}
                        {/* CTA Fondateurs promo → S'abonner */}
                        {credits.plan === 'fondateurs' && credits.expiresAt && (
                          <div className="mt-3 p-2 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg text-center">
                            <p className="text-[11px] text-purple-800 font-semibold">{t.generate.foundersExpiresOn} {new Date(credits.expiresAt).toLocaleDateString('fr-FR')}</p>
                            <button
                              onClick={() => startCheckout('fondateurs')}
                              className="inline-block mt-1 px-4 py-1.5 text-[11px] font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors cursor-pointer"
                            >
                              {t.generate.keepFoundersAdvantages}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-xs text-neutral-500 text-center">{t.generate.loginToSeeUsage}</p>
                )}
              </div>

              {/* Astuce du jour — compact */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">{dailyTip.icon}</span>
                <div>
                  <h4 className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">{t.generate.dailyTip}</h4>
                  <p className="text-xs text-amber-800 leading-snug">{dailyTip.text}</p>
                </div>
              </div>

              {/* Widget 4 : CTA Assistant - lien vers la page assistant */}
              <div
                onClick={() => router.push('/assistant')}
                className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100 rounded-lg px-4 py-2 cursor-pointer hover:shadow-sm transition-all group flex items-center gap-2"
              >
                <span className="text-sm">💡</span>
                <p className="text-[11px] text-purple-700">
                  {t.generate.needIdeas}{' '}
                  <span className="font-semibold group-hover:text-purple-900">{t.generate.askAssistant}</span>
                </p>
              </div>
            </div>
          </div>

          {/* ===== COLONNE DROITE : Upload + Assistant ===== */}
          <div className="lg:col-span-4 space-y-4">
            {/* Zone Upload Logo/Photo (optionnel) */}
            <div ref={uploadSectionRef}>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`border border-dashed rounded-lg p-3 text-center transition ${
                  dragActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-neutral-300 hover:border-neutral-400'
                }`}
              >
                {logoUrl ? (
                  <div className="space-y-3">
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="w-40 h-40 object-contain rounded mx-auto border bg-white p-2"
                      crossOrigin="anonymous"
                      loading="eager"
                    />

                    {/* Options mode logo */}
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <p className="text-xs font-semibold text-blue-900 mb-2">{t.generate.howToUseImage}</p>
                      <div className="space-y-2">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="logoMode"
                            checked={logoMode === 'overlay'}
                            onChange={() => setLogoMode('overlay')}
                            className="mt-0.5"
                          />
                          <div>
                            <p className="text-xs font-semibold text-blue-900">🎨 {t.generate.addAsOverlay}</p>
                            <p className="text-[10px] text-blue-700">{t.generate.logoOverlayDesc}</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="logoMode"
                            checked={logoMode === 'modify'}
                            onChange={() => setLogoMode('modify')}
                            className="mt-0.5"
                          />
                          <div>
                            <p className="text-xs font-semibold text-blue-900">✏️ {t.generate.modifyImage}</p>
                            <p className="text-[10px] text-blue-700">{t.generate.modifyImageDesc}</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    <button
                      onClick={() => setLogoUrl(null)}
                      className="text-xs text-red-600 hover:underline font-medium"
                    >
                      🗑️ {t.generate.deleteImage}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-2xl mb-1">📸</div>
                    <p className="text-xs text-neutral-600 mb-2">
                      {t.generate.dropOrClickLogo}
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-3 py-1 text-xs bg-neutral-900 text-white rounded hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {uploading ? t.generate.uploading : t.generate.choose}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Panel Assistant Prompt */}
            <div ref={assistantPanelRef} className="bg-white rounded-xl border p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">{t.generate.assistantMarketing}</h3>
                {/* Switch Actualité / Sans actualité */}
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-medium ${useNewsMode ? 'text-neutral-400' : 'text-blue-600'}`}>{t.generate.withoutNews}</span>
                  <button
                    onClick={() => {
                      setUseNewsMode(!useNewsMode);
                      if (useNewsMode) {
                        // Passage en mode "sans actualité" - on ne force plus la sélection d'actu
                        setSelectedNews(null);
                      }
                    }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      useNewsMode ? 'bg-blue-600' : 'bg-neutral-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        useNewsMode ? 'translate-x-[18px]' : 'translate-x-[3px]'
                      }`}
                    />
                  </button>
                  <span className={`text-[10px] font-medium ${useNewsMode ? 'text-blue-600' : 'text-neutral-400'}`}>{t.generate.withNews}</span>
                  {/* Info tooltip */}
                  <div className="relative group">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-neutral-200 text-neutral-500 text-[9px] font-bold cursor-help hover:bg-blue-100 hover:text-blue-600 transition-colors">i</span>
                    <div className="absolute right-0 top-6 z-50 hidden group-hover:block w-56 p-2.5 bg-neutral-900 text-white text-[10px] rounded-lg shadow-xl leading-relaxed">
                      <p className="font-semibold mb-1">{t.generate.tooltipWithNews}</p>
                      <p className="mb-2">{t.generate.tooltipWithNewsDesc}</p>
                      <p className="font-semibold mb-1">{t.generate.tooltipWithoutNews}</p>
                      <p>{t.generate.tooltipWithoutNewsDesc}</p>
                      <div className="absolute -top-1 right-3 w-2 h-2 bg-neutral-900 rotate-45"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Afficher la carte sélectionnée (mode avec actualité ou sélection optionnelle) */}
              {selectedNews && (
                <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                  <p className="text-[10px] font-medium text-blue-900 mb-1">
                    {useNewsMode ? `✓ ${t.generate.selectedNews}` : `📰 ${t.generate.optionalSelectedNews}`}
                  </p>
                  <p className="text-xs font-semibold line-clamp-2 text-blue-800">
                    {selectedNews.title}
                  </p>
                  {!useNewsMode && (
                    <button
                      onClick={() => setSelectedNews(null)}
                      className="text-[10px] text-red-500 hover:underline mt-1"
                    >
                      {t.generate.remove}
                    </button>
                  )}
                </div>
              )}

              {/* Mode sans actualité : encouragement à décrire le business */}
              {!useNewsMode && !selectedNews && (
                <div className="mb-3 p-3 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <h4 className="text-xs font-bold text-purple-900 mb-2 flex items-center gap-1">
                    🎯 {t.generate.freeCreationTitle}
                  </h4>
                  <div className="text-[10px] text-purple-800 space-y-1.5">
                    <p className="font-medium">{t.generate.freeCreationForBestResult}</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>{t.generate.freeCreationActivity}</strong> {t.generate.freeCreationActivityDesc}</li>
                      <li><strong>{t.generate.freeCreationSpecialty}</strong> {t.generate.freeCreationSpecialtyDesc}</li>
                      <li><strong>{t.generate.freeCreationValues}</strong> {t.generate.freeCreationValuesDesc}</li>
                      <li><strong>{t.generate.freeCreationAudience}</strong> {t.generate.freeCreationAudienceDesc}</li>
                    </ul>
                    <p className="mt-2 text-purple-600 italic">
                      {t.generate.freeCreationDetailHint}
                    </p>
                  </div>
                </div>
              )}

              {/* Section d'aide pour créer le lien actualité/business (mode avec actualité) */}
              {selectedNews && useNewsMode && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <h4 className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-1">
                    💡 {t.generate.newsLinkingTitle}
                  </h4>
                  <div className="text-[10px] text-blue-800 space-y-1.5">
                    <p className="font-medium">{t.generate.newsLinkingQuestions}</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>{t.generate.newsLinkingImpact}</strong> {t.generate.newsLinkingImpactDesc}</li>
                      <li><strong>{t.generate.newsLinkingOpportunity}</strong> {t.generate.newsLinkingOpportunityDesc}</li>
                      <li><strong>{t.generate.newsLinkingSolution}</strong> {t.generate.newsLinkingSolutionDesc}</li>
                      <li><strong>{t.generate.newsLinkingExpertise}</strong> {t.generate.newsLinkingExpertiseDesc}</li>
                    </ul>
                    <div className="mt-2 pt-2 border-t border-blue-300">
                      <p className="font-medium mb-1">{t.generate.newsLinkingExample}</p>
                      <p className="italic text-blue-700">
                        {t.generate.newsLinkingExampleText}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sélecteur de Profil de Communication - Stratégies Marketing */}
              <div ref={promptSectionRef} className="mb-4">
                <label className="block text-sm font-semibold text-neutral-900 mb-3">
                  🎭 {t.generate.chooseStrategy}
                </label>

                {/* Sélection simple en ligne */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                  {Object.entries(tonePresets).map(([key, preset]) => {
                    const isSelected = communicationProfile === key;

                    return (
                      <button
                        key={key}
                        onClick={() => setCommunicationProfile(key as any)}
                        className={`p-3 rounded-lg border-2 text-center transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 shadow-md'
                            : 'border-neutral-200 hover:border-blue-300 bg-white'
                        }`}
                      >
                        <div className="text-2xl mb-1">{preset.icon}</div>
                        <div className="text-xs font-bold text-neutral-900">{preset.label}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Détails de la stratégie sélectionnée - Compact */}
                {communicationProfile && (
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-200 p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <div className="text-2xl flex-shrink-0">{tonePresets[communicationProfile].icon}</div>
                      <div className="flex-1">
                        <h4 className="font-bold text-neutral-900 text-xs mb-1">
                          {tonePresets[communicationProfile].marketingStrategy}
                        </h4>
                        <p className="text-[11px] text-neutral-700 leading-snug mb-2">
                          {tonePresets[communicationProfile].description}
                        </p>

                        {/* Points clés inline */}
                        <div className="space-y-1">
                          <p className="text-[10px] text-neutral-600">
                            <span className="text-blue-600 font-bold">▸</span> <strong>{t.generate.strategyLabel}</strong> {tonePresets[communicationProfile].details}
                          </p>
                          <p className="text-[10px] text-neutral-600">
                            <span className="text-blue-600 font-bold">▸</span> <strong>{t.generate.exampleLabel}</strong> {tonePresets[communicationProfile].example}
                          </p>
                          <p className="text-[10px] text-neutral-600">
                            <span className="text-blue-600 font-bold">▸</span> <strong>{t.generate.idealFor}</strong> {tonePresets[communicationProfile].whenToUse}
                          </p>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* === WIZARD STEP INDICATOR === */}
              <div className="flex items-center justify-between mb-3 px-1">
                {[
                  { step: 1, label: t.generate.stepBusiness },
                  { step: 2, label: t.generate.stepDirection },
                  { step: 3, label: t.generate.stepCreative },
                  { step: 4, label: t.generate.stepExpert },
                  { step: 5, label: t.generate.stepGenerate },
                ].map(({ step, label }, i) => (
                  <div key={step} className="flex items-center">
                    <button
                      onClick={() => setFormStep(step)}
                      className={`flex items-center gap-1 transition-all ${
                        formStep === step
                          ? 'text-blue-700'
                          : formStep > step
                          ? 'text-emerald-600'
                          : 'text-neutral-400'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                        formStep === step
                          ? 'bg-blue-600 text-white border-blue-600'
                          : formStep > step
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white text-neutral-400 border-neutral-300'
                      }`}>
                        {formStep > step ? '✓' : step}
                      </span>
                      <span className="text-[9px] font-semibold hidden sm:inline">{label}</span>
                    </button>
                    {i < 4 && <div className={`w-3 sm:w-4 h-0.5 mx-0.5 ${formStep > step ? 'bg-emerald-400' : 'bg-neutral-200'}`} />}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {/* ===== ÉTAPE 1 : VOTRE BUSINESS ===== */}
                {formStep === 1 && (<>
                {/* Type de business */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                    {t.generate.businessLabel} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    placeholder={t.generate.businessPlaceholder}
                    autoComplete="off"
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>

                {/* Description business */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                    {t.generate.descriptionLabel} {!useNewsMode && <span className="text-red-500">*</span>}
                    {!useNewsMode && <span className="text-purple-600 text-[10px] ml-1">{t.generate.descriptionRequired}</span>}
                  </label>
                  <textarea
                    id="business-description"
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    placeholder={useNewsMode
                      ? t.generate.descriptionPlaceholderNews
                      : t.generate.descriptionPlaceholderFree
                    }
                    rows={useNewsMode ? 2 : 4}
                    className={`w-full text-xs rounded-lg border-2 px-3 py-2 bg-white focus:outline-none focus:ring-2 transition-all resize-none ${
                      !useNewsMode
                        ? 'border-purple-300 focus:border-purple-500 focus:ring-purple-100'
                        : 'border-neutral-200 focus:border-blue-500 focus:ring-blue-100'
                    }`}
                  />
                </div>

                {/* Audience cible */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                    {t.generate.audienceLabel}
                  </label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder={t.generate.audiencePlaceholder}
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>

                {/* Bouton Suivant étape 1 */}
                <button
                  onClick={() => setFormStep(2)}
                  disabled={!businessType.trim() || (useNewsMode && !selectedNews) || (!useNewsMode && !businessDescription.trim())}
                  className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {t.generate.next} <span className="text-xs">{'\u2192'}</span>
                </button>
                {useNewsMode && !selectedNews && (
                  <p className="text-[10px] text-amber-600 text-center mt-1">
                    {locale === 'fr' ? '\u26A0\uFE0F S\u00E9lectionnez une actualit\u00E9 ci-dessus pour continuer' : '\u26A0\uFE0F Select a news article above to continue'}
                  </p>
                )}
                {!useNewsMode && !businessDescription.trim() && (
                  <p className="text-[10px] text-amber-600 text-center mt-1">
                    {locale === 'fr' ? '\u26A0\uFE0F D\u00E9crivez votre business pour continuer' : '\u26A0\uFE0F Describe your business to continue'}
                  </p>
                )}
                </>)}

                {/* ===== ÉTAPE 2 : DIRECTION CRÉATIVE ===== */}
                {formStep === 2 && (<>
                <div className="border-t pt-2 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-medium text-neutral-600">📝 {t.generate.contentDirection}</p>

                    {/* Bouton IA pour remplir la direction */}
                    <button
                      type="button"
                      onClick={() => handleAiAutoFill('direction')}
                      disabled={autoFillLoading || (useNewsMode && !selectedNews)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-[11px] font-semibold rounded-md transition-all disabled:opacity-50"
                    >
                      {autoFillLoading ? (
                        <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t.generate.analyzing}</>
                      ) : (
                        <><span>✨</span> {t.generate.autoFill}</>
                      )}
                    </button>
                  </div>

                  {/* Curseur orientation business/actualité */}
                  {useNewsMode && selectedNews && (
                  <div className="mb-3 p-3 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100">
                    <label className="block text-xs font-semibold mb-2 text-neutral-700">
                      {t.generate.visualOrientation}
                    </label>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-medium text-blue-600 whitespace-nowrap">🏢 {t.generate.businessFocus}</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={contentFocus}
                        onChange={(e) => setContentFocus(Number(e.target.value))}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        style={{
                          background: `linear-gradient(to right, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)`,
                        }}
                      />
                      <span className="text-[10px] font-medium text-pink-600 whitespace-nowrap">📰 {t.generate.newsFocus}</span>
                    </div>
                    <p className="text-[9px] text-neutral-500 mt-1.5 text-center">
                      {contentFocus <= 30
                        ? `🏢 ${t.generate.focusBusiness}`
                        : contentFocus >= 70
                        ? `📰 ${t.generate.focusNews}`
                        : `⚖️ ${t.generate.focusBalance}`}
                    </p>
                  </div>
                  )}

                  {/* Angle de l'image */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      {t.generate.imageAngleLabel}
                    </label>
                    <select
                      onChange={(e) => {
                        if (e.target.value !== 'custom') {
                          setImageAngle(e.target.value);
                        } else {
                          setImageAngle('');
                        }
                      }}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer mb-2"
                    >
                      <option value="">{t.generate.chooseSuggestion}</option>
                      {useNewsMode ? (<>
                        <option value="Intégrer harmonieusement l'actualité et le business dans une seule scène cohésive">{t.generate.harmonious}</option>
                        <option value="Focus sur la solution que nous apportons face à l'actualité, intégrée naturellement">{t.generate.focusSolution}</option>
                        <option value="Métaphore visuelle symbolique reliant l'actu et le business dans une composition unifiée">{t.generate.visualMetaphor}</option>
                        <option value="Composition dramatique avec actualité en arrière-plan et business au premier plan">{t.generate.depthComposition}</option>
                        <option value="Raconter l'histoire dans un environnement cohérent évoquant l'actualité">{t.generate.narrativeEnvironment}</option>
                      </>) : (<>
                        <option value="Gros plan sur un détail clé du métier : texture, outil, geste précis">{t.generate.freeAngleMacro}</option>
                        <option value="Montrer les coulisses de l'activité, le travail en cours, l'énergie du métier">{t.generate.freeAngleBehindScenes}</option>
                        <option value="Transformation spectaculaire : l'état avant et le résultat final du travail">{t.generate.freeAngleBeforeAfter}</option>
                        <option value="Capturer l'ambiance unique du lieu ou de l'activité, lumière et décor">{t.generate.freeAngleAmbiance}</option>
                        <option value="Mettre en valeur le produit ou la création phare dans une composition soignée">{t.generate.freeAngleProduct}</option>
                      </>)}
                      <option value="custom">✏️ {t.generate.customOption}</option>
                    </select>
                    <input
                      type="text"
                      value={imageAngle}
                      onChange={(e) => setImageAngle(e.target.value)}
                      placeholder={t.generate.customizeImageAngle}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                  {/* Angle marketing */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      {t.generate.marketingAngleLabel}
                    </label>
                    <select
                      onChange={(e) => {
                        if (e.target.value !== 'custom') {
                          setMarketingAngle(e.target.value);
                        } else {
                          setMarketingAngle('');
                        }
                      }}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer mb-2"
                    >
                      <option value="">{t.generate.chooseSuggestion}</option>
                      {useNewsMode ? (<>
                        <option value="Profiter de l'opportunité créée par l'actualité">{t.generate.opportunityFromNews}</option>
                        <option value="Résoudre le problème soulevé par l'actualité">{t.generate.solveProblem}</option>
                        <option value="Se positionner en expert face à l'actualité">{t.generate.expertFacingNews}</option>
                        <option value="Surfer sur la tendance de l'actualité">{t.generate.surfTrend}</option>
                        <option value="Anticiper les conséquences de l'actualité">{t.generate.anticipateConsequences}</option>
                      </>) : (<>
                        <option value="Démontrer le savoir-faire unique et la maîtrise du métier">{t.generate.freeMarketingExpertise}</option>
                        <option value="Toucher le public avec un moment authentique et sincère">{t.generate.freeMarketingEmotion}</option>
                        <option value="Mettre en avant ce que les autres ne font pas, la touche unique">{t.generate.freeMarketingDifference}</option>
                        <option value="Montrer l'expérience que vivent les clients, le résultat obtenu">{t.generate.freeMarketingClient}</option>
                        <option value="Partager les valeurs, la passion ou le parcours derrière l'activité">{t.generate.freeMarketingStory}</option>
                      </>)}
                      <option value="custom">✏️ {t.generate.customOption}</option>
                    </select>
                    <textarea
                      value={marketingAngle}
                      onChange={(e) => setMarketingAngle(e.target.value)}
                      placeholder={t.generate.customizeMarketingAngle}
                      rows={2}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                    />
                  </div>

                  {/* Angle du contenu (éditorial) */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      {t.generate.contentAngleLabel}
                    </label>
                    <select
                      onChange={(e) => {
                        if (e.target.value !== 'custom') {
                          setContentAngle(e.target.value);
                        } else {
                          setContentAngle('');
                        }
                      }}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer mb-2"
                    >
                      <option value="">{t.generate.chooseSuggestion}</option>
                      <option value="Témoignage client ou étude de cas concret">{t.generate.testimonialCase}</option>
                      <option value="Contenu éducatif qui apporte de la valeur au lecteur">{t.generate.educationalValue}</option>
                      <option value="Behind-the-scenes, coulisses du métier">{t.generate.behindTheScenes}</option>
                      <option value="Prise de position forte et opinion tranchée">{t.generate.opinionStance}</option>
                      <option value="Contenu inspirant et motivationnel">{t.generate.inspiringMotivational}</option>
                      <option value="custom">✏️ {t.generate.customOption}</option>
                    </select>
                    <input
                      type="text"
                      value={contentAngle}
                      onChange={(e) => setContentAngle(e.target.value)}
                      placeholder={t.generate.customizeContentAngle}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                </div>
                {/* Navigation étape 2 */}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setFormStep(1)} className="flex-1 py-2 border border-neutral-300 text-neutral-700 text-sm font-medium rounded-lg hover:bg-neutral-50 transition">
                    ← {t.generate.back}
                  </button>
                  <button onClick={() => setFormStep(3)} className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">
                    {t.generate.next} →
                  </button>
                </div>
                <button onClick={() => setFormStep(3)} className="w-full py-1.5 text-neutral-500 text-xs hover:text-neutral-700 transition">
                  {t.generate.skipStep}
                </button>
                </>)}

                {/* ===== ÉTAPE 3 : CRÉATIF ===== */}
                {formStep === 3 && (<>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-medium text-neutral-600">{t.generate.customizeContent}</p>
                    <button
                      type="button"
                      onClick={() => handleAiAutoFill('creatif')}
                      disabled={autoFillLoading || (useNewsMode && !selectedNews)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-[11px] font-semibold rounded-md transition-all disabled:opacity-50"
                    >
                      {autoFillLoading ? (
                        <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t.generate.analyzing}</>
                      ) : (
                        <><span>✨</span> {t.generate.autoFill}</>
                      )}
                    </button>
                  </div>

                  {/* Histoire à raconter */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      {t.generate.storyToTell}
                    </label>
                    <textarea
                      value={storyToTell}
                      onChange={(e) => setStoryToTell(e.target.value)}
                      placeholder={useNewsMode ? t.generate.storyPlaceholder : t.generate.storyPlaceholderFree}
                      rows={2}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                    />
                  </div>

                  {/* But de la publication */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      {t.generate.publicationGoal}
                    </label>
                    <input
                      type="text"
                      value={publicationGoal}
                      onChange={(e) => setPublicationGoal(e.target.value)}
                      placeholder={useNewsMode ? t.generate.goalPlaceholder : t.generate.goalPlaceholderFree}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                  {/* Émotion à transmettre */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      {t.generate.emotionToConvey}
                    </label>
                    <input
                      type="text"
                      value={emotionToConvey}
                      onChange={(e) => setEmotionToConvey(e.target.value)}
                      placeholder={useNewsMode ? t.generate.emotionPlaceholder : t.generate.emotionPlaceholderFree}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                  {/* Texte à ajouter (optionnel) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-neutral-700 flex items-center gap-1">
                        {t.generate.textToAdd} <span className="text-neutral-400 font-normal">{t.generate.optional}</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateTextSuggestions}
                        className="text-xs px-2 py-1 rounded bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:shadow-md transition-all flex items-center gap-1"
                      >
                        💡 {t.generate.suggestText}
                      </button>
                    </div>

                    <input
                      type="text"
                      value={optionalText}
                      onChange={(e) => setOptionalText(e.target.value)}
                      placeholder={t.generate.textPlaceholder}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />

                    {/* Suggestions intelligentes */}
                    {showTextSuggestions && textSuggestions.length > 0 && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs font-semibold text-blue-900 mb-2">{useNewsMode ? t.generate.suggestionsBasedOn : t.generate.suggestionsBasedOnBusiness}</p>
                        <div className="space-y-1.5">
                          {textSuggestions.map((suggestion, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => {
                                setOptionalText(suggestion);
                                setShowTextSuggestions(false);
                              }}
                              className="w-full text-left text-xs px-3 py-2 bg-white rounded-lg hover:bg-blue-100 hover:border-blue-300 border border-blue-100 transition-all flex items-center justify-between group"
                            >
                              <span className="text-neutral-700">{suggestion}</span>
                              <span className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">{t.generate.use}</span>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowTextSuggestions(false)}
                          className="mt-2 text-[10px] text-neutral-500 hover:text-neutral-700 transition-colors"
                        >
                          {t.generate.hideSuggestions}
                        </button>
                      </div>
                    )}

                  </div>

                </div>
                {/* Navigation étape 3 */}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setFormStep(2)} className="flex-1 py-2 border border-neutral-300 text-neutral-700 text-sm font-medium rounded-lg hover:bg-neutral-50 transition">
                    {t.generate.back}
                  </button>
                  <button onClick={() => setFormStep(4)} className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">
                    {t.generate.next}
                  </button>
                </div>
                <button onClick={() => setFormStep(5)} className="w-full py-1.5 text-neutral-500 text-xs hover:text-neutral-700 transition">
                  {t.generate.skipOptionalSteps}
                </button>
                </>)}

                {/* ===== ÉTAPE 4 : EXPERT ===== */}
                {formStep === 4 && (<>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-[10px] font-medium text-neutral-600">{t.generate.expertQuestions}</p>
                      <p className="text-[9px] text-neutral-400">{t.generate.multiplyImpact}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAiAutoFill('expert')}
                      disabled={autoFillLoading || (useNewsMode && !selectedNews)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-[11px] font-semibold rounded-md transition-all disabled:opacity-50"
                    >
                      {autoFillLoading ? (
                        <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t.generate.analyzing}</>
                      ) : (
                        <><span>✨</span> {t.generate.autoFill}</>
                      )}
                    </button>
                  </div>

                  {/* Question 1 : Problème résolu */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      {useNewsMode ? t.generate.problemSolved : t.generate.problemSolvedFree}
                    </label>
                    <input
                      type="text"
                      value={problemSolved}
                      onChange={(e) => setProblemSolved(e.target.value)}
                      placeholder={useNewsMode ? t.generate.problemPlaceholder : t.generate.problemPlaceholderFree}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                  {/* Question 2 : Avantage unique */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      {t.generate.uniqueAdvantage}
                    </label>
                    <input
                      type="text"
                      value={uniqueAdvantage}
                      onChange={(e) => setUniqueAdvantage(e.target.value)}
                      placeholder={t.generate.advantagePlaceholder}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                  {/* Question 3 : Idée visuelle */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      {t.generate.visualIdea}
                    </label>
                    <textarea
                      value={desiredVisualIdea}
                      onChange={(e) => setDesiredVisualIdea(e.target.value)}
                      placeholder={useNewsMode ? t.generate.visualIdeaPlaceholder : t.generate.visualIdeaPlaceholderFree}
                      rows={2}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                    />
                  </div>
                </div>
                {/* Navigation étape 4 */}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setFormStep(3)} className="flex-1 py-2 border border-neutral-300 text-neutral-700 text-sm font-medium rounded-lg hover:bg-neutral-50 transition">
                    {t.generate.back}
                  </button>
                  <button onClick={() => setFormStep(5)} className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">
                    {t.generate.next}
                  </button>
                </div>
                <button onClick={() => setFormStep(5)} className="w-full py-1.5 text-neutral-500 text-xs hover:text-neutral-700 transition">
                  {t.generate.skipThisStep}
                </button>
                </>)}

                {/* ===== ÉTAPE 5 : GÉNÉRER ===== */}
                {formStep === 5 && (<>
                {/* Plateforme */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">{t.generate.platformLabel}</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                  >
                    <option>Instagram</option>
                    <option>LinkedIn</option>
                    <option>Twitter/X</option>
                    <option>TikTok</option>
                  </select>
                </div>

                {/* Tonalité (auto-géré par profil) */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                    {t.generate.toneLabel} <span className="text-blue-600">{t.generate.fromProfile}</span>
                  </label>
                  <input
                    type="text"
                    value={tone}
                    readOnly
                    className="w-full text-xs rounded-lg border-2 border-blue-100 bg-blue-50 px-3 py-2 text-neutral-700 cursor-default"
                  />
                </div>

                {/* Style visuel */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                    {t.generate.styleLabel} <span className="text-blue-600">{t.generate.suggestedByProfile}</span>
                  </label>
                  <select
                    value={visualStyle}
                    onChange={(e) => setVisualStyle(e.target.value)}
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                  >
                    <optgroup label={t.generate.profileStyles}>
                      <option value="Lumineux et épuré">{t.generate.styleBrightClean}</option>
                      <option value="Moderne et structuré">{t.generate.styleModernStructured}</option>
                      <option value="Énergique et contrasté">{t.generate.styleEnergeticContrast}</option>
                      <option value="Naturel et chaleureux">{t.generate.styleWarmNatural}</option>
                    </optgroup>
                    <optgroup label={t.generate.otherStyles}>
                      <option value="Minimaliste et clean">{t.generate.styleMinimalist}</option>
                      <option value="Coloré et vibrant">{t.generate.styleColorful}</option>
                      <option value="Sombre et dramatique">{t.generate.styleDarkDramatic}</option>
                      <option value="Pastel et doux">{t.generate.stylePastel}</option>
                      <option value="Bold et audacieux">{t.generate.styleBold}</option>
                      <option value="Vintage et rétro">{t.generate.styleVintage}</option>
                      <option value="Futuriste et tech">{t.generate.styleFuturistic}</option>
                      <option value="Organique et naturel">{t.generate.styleOrganic}</option>
                      <option value="Luxe et premium">{t.generate.styleLuxury}</option>
                      <option value="Playful et fun">{t.generate.stylePlayful}</option>
                      <option value="Élégant et sophistiqué">{t.generate.styleElegant}</option>
                      <option value="Dynamique et sportif">{t.generate.styleDynamic}</option>
                    </optgroup>
                  </select>
                </div>

                {/* Style de rendu */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                    {t.generate.renderLabel}
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRenderStyle('photo')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                        renderStyle === 'photo'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      }`}
                    >
                      {t.generate.photoRealistic}
                    </button>
                    <button
                      onClick={() => setRenderStyle('illustration')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                        renderStyle === 'illustration'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      }`}
                    >
                      {t.generate.illustration3D}
                    </button>
                  </div>
                </div>

                {/* Style de personnages */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                    {t.generate.charactersLabel}
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCharacterStyle('real')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                        characterStyle === 'real'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      }`}
                    >
                      {t.generate.humans}
                    </button>
                    <button
                      onClick={() => setCharacterStyle('fiction')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                        characterStyle === 'fiction'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      }`}
                    >
                      {t.generate.fictionCharacters}
                    </button>
                  </div>
                </div>

                {/* Sélecteur mode de génération */}
                <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
                  <button
                    onClick={() => setGenerationMode('image')}
                    className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                      generationMode === 'image'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    🖼️ {t.generate.visualMode}
                  </button>
                  <button
                    onClick={() => setGenerationMode('video')}
                    className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                      generationMode === 'video'
                        ? 'bg-white text-purple-700 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    🎬 {t.generate.videoMode}
                  </button>
                </div>

                {/* Options vidéo uniquement */}
                {generationMode === 'video' && (
                  <>
                    {/* Résumé audio — indication claire du mode choisi */}
                    <div className={`rounded-lg p-2.5 border text-[10px] font-medium ${
                      addAudio && selectedMusic !== 'none'
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : addAudio
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : selectedMusic !== 'none'
                            ? 'bg-purple-50 border-purple-200 text-purple-700'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-500'
                    }`}>
                      {addAudio && selectedMusic !== 'none'
                        ? `🎙️🎵 ${locale === 'fr' ? 'Voix off + Musique de fond' : 'Voice + Background music'}`
                        : addAudio
                          ? `🎙️ ${locale === 'fr' ? 'Voix off uniquement' : 'Voice narration only'}`
                          : selectedMusic !== 'none'
                            ? `🎵 ${locale === 'fr' ? 'Musique de fond uniquement (pas de voix)' : 'Background music only (no voice)'}`
                            : `🔇 ${locale === 'fr' ? 'Aucun audio' : 'No audio'}`
                      }
                    </div>

                    {/* Section Voix / Narration */}
                    <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addAudio}
                          onChange={(e) => setAddAudio(e.target.checked)}
                          className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-xs font-semibold text-neutral-900">
                          🎙️ {locale === 'fr' ? 'Ajouter une voix off' : 'Add voice narration'}
                        </span>
                        <span className="text-[9px] text-neutral-400 ml-auto">{locale === 'fr' ? 'optionnel' : 'optional'}</span>
                      </label>

                      {addAudio && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setAudioTextSource('ai')}
                              className={`flex-1 py-1.5 px-3 text-xs font-medium rounded transition-all ${
                                audioTextSource === 'ai'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-neutral-700 hover:bg-neutral-50'
                              }`}
                            >
                              ✨ {t.generate.automatic}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAudioTextSource('manual')}
                              className={`flex-1 py-1.5 px-3 text-xs font-medium rounded transition-all ${
                                audioTextSource === 'manual'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-neutral-700 hover:bg-neutral-50'
                              }`}
                            >
                              ✍️ {t.generate.writeYourText}
                            </button>
                          </div>

                          {audioTextSource === 'manual' && (
                            <div>
                              <textarea
                                value={audioText}
                                onChange={(e) => setAudioText(e.target.value)}
                                placeholder={t.generate.audioTextPlaceholder}
                                rows={2}
                                maxLength={150}
                                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                              />
                              <p className="text-[10px] text-neutral-500 mt-1">
                                ~{audioText.trim().split(/\s+/).filter(w => w.length > 0).length} {t.generate.wordsCount} ({Math.ceil(audioText.trim().split(/\s+/).filter(w => w.length > 0).length / 2.5)}s)
                              </p>
                            </div>
                          )}

                          {audioTextSource === 'ai' && (
                            <p className="text-[10px] text-neutral-600 italic">
                              💡 {t.generate.audioAutoGenerated}
                            </p>
                          )}

                          {/* Voice Selector (ElevenLabs) */}
                          <div>
                            <label className="block text-[10px] font-medium text-neutral-700 mb-1">{t.generate.voiceLabel}</label>
                            <div className="grid grid-cols-2 gap-1">
                              {([
                                { value: 'pFZP5JQG7iQjIQuC4Bku', label: `♀ ${t.generate.femaleSoft}` },
                                { value: 'EXAVITQu4vr4xnSDxMaL', label: `♀ ${t.generate.femaleNatural}` },
                                { value: 'Xb7hH8MSUJpSbSDYk0k2', label: `♀ ${t.generate.femalePro}` },
                                { value: 'cgSgspJ2msm6clMCkdW9', label: `♀ ${t.generate.femaleEnergetic}` },
                                { value: 'JBFqnCBsd6RMkjVDRZzb', label: `♂ ${t.generate.maleNarrator}` },
                                { value: 'onwK4e9ZLuTAKqWW03F9', label: `♂ ${t.generate.maleDynamic}` },
                                { value: 'nPczCjzI2devNBz1zQrb', label: `♂ ${t.generate.maleDeep}` },
                                { value: 'cjVigY5qzO86Huf0OWal', label: `♂ ${t.generate.maleAuthoritative}` },
                              ]).map((v) => (
                                <button
                                  key={v.value}
                                  type="button"
                                  onClick={() => setSelectedVoice(v.value)}
                                  className={`px-2 py-1 text-[10px] rounded border transition-all text-left ${
                                    selectedVoice === v.value
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-white text-neutral-700 border-neutral-200 hover:border-blue-300'
                                  }`}
                                >
                                  {v.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Section Musique de fond (optionnelle, comme la voix) */}
                    <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addMusic}
                          onChange={(e) => {
                            setAddMusic(e.target.checked);
                            if (!e.target.checked) setSelectedMusic('none');
                            else if (selectedMusic === 'none') setSelectedMusic('energetic');
                          }}
                          className="w-4 h-4 text-purple-600 bg-white border-gray-300 rounded focus:ring-purple-500"
                        />
                        <span className="text-xs font-semibold text-neutral-900">
                          🎵 {t.generate.backgroundMusic}
                        </span>
                        <span className="text-[9px] text-neutral-400 ml-auto">{locale === 'fr' ? 'optionnel' : 'optional'}</span>
                      </label>

                      {addMusic && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {([
                              { value: 'corporate', label: t.generate.musicCorporate },
                              { value: 'energetic', label: t.generate.musicEnergetic },
                              { value: 'calm', label: t.generate.musicCalm },
                              { value: 'inspiring', label: t.generate.musicInspiring },
                              { value: 'trendy', label: t.generate.musicTrendy },
                            ]).map((m) => (
                              <button
                                key={m.value}
                                type="button"
                                onClick={() => setSelectedMusic(m.value)}
                                className={`px-2 py-1 text-[10px] rounded-full border transition-all ${
                                  selectedMusic === m.value
                                    ? 'bg-purple-600 text-white border-purple-600'
                                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-purple-300'
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>

                          {/* Trending Music */}
                          {trendingData?.trendingMusic && trendingData.trendingMusic.length > 0 && (
                            <div className="pt-2 border-t border-purple-200">
                              <p className="text-[9px] font-semibold text-purple-700 mb-1.5">🎵 {t.generate.backgroundMusicTrending}</p>
                              <div className="space-y-1 max-h-[140px] overflow-y-auto">
                                {trendingData.trendingMusic.slice(0, 8).map((song: any, i: number) => {
                                  const songKey = `trending:${song.title}`;
                                  const isSelected = selectedMusic === songKey;
                                  return (
                                    <div
                                      key={i}
                                      onClick={() => setSelectedMusic(isSelected ? 'energetic' : songKey)}
                                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[9px] cursor-pointer transition-all ${
                                        isSelected
                                          ? 'bg-purple-600 text-white border border-purple-600'
                                          : 'bg-purple-50/50 border border-purple-100 hover:border-purple-300'
                                      }`}
                                    >
                                      {song.coverUrl && (
                                        <img src={song.coverUrl} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className={`font-medium truncate ${isSelected ? 'text-white' : 'text-purple-900'}`}>{song.title}</p>
                                        <p className={`truncate ${isSelected ? 'text-purple-200' : 'text-purple-500'}`}>{song.artist}</p>
                                      </div>
                                      {isSelected ? (
                                        <span className="text-white text-[10px] font-bold">✓</span>
                                      ) : song.trend === 'up' ? (
                                        <span className="text-emerald-500 font-bold">↑</span>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="text-[8px] text-neutral-400 mt-1 italic">{t.generate.backgroundMusicTrendingDesc}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Option sous-titres / texte animé dans la vidéo */}
                    <div className="bg-purple-50 rounded-lg p-3 border-2 border-purple-300">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableAIText}
                          onChange={(e) => setEnableAIText(e.target.checked)}
                          className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                        />
                        <span className="text-xs font-semibold text-purple-900">
                          ✨ {t.generate.addSubtitles}
                        </span>
                        <span className="text-[9px] bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded ml-auto">{t.generate.recommended}</span>
                      </label>

                      {enableAIText && (
                        <div className="mt-2 space-y-2">
                          <p className="text-[10px] text-purple-700">{t.generate.textStyleLabel}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { key: 'wordflash', label: t.generate.subtitleWordByWord },
                              { key: 'wordstay', label: t.generate.subtitleKaraoke },
                              { key: 'neon', label: t.generate.subtitleNeon },
                              { key: 'cinema', label: t.generate.subtitleCinema },
                              { key: 'impact', label: t.generate.subtitleBold },
                              { key: 'minimal', label: t.generate.subtitleSubtle },
                            ].map((style) => (
                              <button
                                key={style.key}
                                onClick={() => setAITextStyle(style.key)}
                                className={`px-2 py-1.5 text-[10px] rounded border transition-all ${
                                  aiTextStyle === style.key
                                    ? 'bg-purple-600 text-white border-purple-600'
                                    : 'bg-white text-purple-700 border-purple-300 hover:border-purple-400'
                                }`}
                              >
                                {style.label}
                              </button>
                            ))}
                          </div>
                          {/* Taille du texte */}
                          <div className="mt-1.5">
                            <p className="text-[9px] text-purple-600 mb-1">{t.generate.sizeLabel}</p>
                            <div className="flex gap-1">
                              {([
                                { key: 'sm', label: t.generate.subtitleSizeSmall },
                                { key: 'md', label: t.generate.subtitleSizeMedium },
                                { key: 'lg', label: t.generate.subtitleSizeLarge },
                                { key: 'xl', label: t.generate.subtitleSizeXL },
                              ] as const).map((s) => (
                                <button
                                  key={s.key}
                                  onClick={() => setSubtitleFontSize(s.key)}
                                  className={`px-1.5 py-1 text-[9px] rounded border transition-all ${
                                    subtitleFontSize === s.key
                                      ? 'bg-purple-600 text-white border-purple-600'
                                      : 'bg-white text-purple-700 border-purple-300 hover:border-purple-400'
                                  }`}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Position du texte */}
                          <div className="mt-1.5">
                            <p className="text-[9px] text-purple-600 mb-1">{t.generate.positionLabel}</p>
                            <div className="flex gap-1">
                              {([
                                { key: 'top', label: t.generate.subtitlePositionTop },
                                { key: 'center', label: t.generate.subtitlePositionCenter },
                                { key: 'bottom', label: t.generate.subtitlePositionBottom },
                              ] as const).map((p) => (
                                <button
                                  key={p.key}
                                  onClick={() => setSubtitlePosition(p.key)}
                                  className={`px-1.5 py-1 text-[9px] rounded border transition-all ${
                                    subtitlePosition === p.key
                                      ? 'bg-purple-600 text-white border-purple-600'
                                      : 'bg-white text-purple-700 border-purple-300 hover:border-purple-400'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <p className="text-[9px] text-purple-600 italic mt-1.5">
                            {addAudio
                              ? `💡 ${t.generate.subtitleSyncAudio}`
                              : `💡 ${t.generate.subtitleAutoGenerated}`}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Durée de la vidéo — Chips */}
                    <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                      <label className="block text-xs font-semibold text-neutral-900 mb-2">
                        ⏱️ {t.generate.videoDuration}
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([10, 15, 30, 45, 60, 90] as const).map((dur) => (
                          <button
                            key={dur}
                            type="button"
                            onClick={() => setVideoDuration(dur)}
                            className={`relative py-2 px-1 rounded-lg text-center transition-all border ${
                              videoDuration === dur
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                                : 'bg-white text-neutral-700 border-neutral-200 hover:border-indigo-300 hover:bg-indigo-50'
                            }`}
                          >
                            <span className="block text-sm font-bold">{dur}s</span>
                            <span className={`block text-[9px] mt-0.5 ${videoDuration === dur ? 'text-indigo-200' : 'text-neutral-400'}`}>
                              {getVideoCreditCost(dur)} cr
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-indigo-500 mt-2 italic">
                        💡 {t.generate.socialMediaIdeal}
                      </p>

                      {/* Mode avancé toggle pour vidéos longues */}
                      {videoDuration > 10 && (
                        <div className="mt-3 pt-3 border-t border-indigo-200">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium text-neutral-700">
                              🎬 {t.generate.videoLongMode}
                            </span>
                            <div className="flex bg-white rounded-md border border-neutral-200 overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setVideoGenerationMode('simple')}
                                className={`px-2.5 py-1 text-[10px] font-medium transition ${
                                  videoGenerationMode === 'simple'
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-neutral-600 hover:bg-neutral-50'
                                }`}
                              >
                                {t.generate.videoSimpleMode}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                            setVideoGenerationMode('advanced');
                            if (advancedSegments.length === 0) initAdvancedSegments();
                          }}
                                className={`px-2.5 py-1 text-[10px] font-medium transition ${
                                  videoGenerationMode === 'advanced'
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-neutral-600 hover:bg-neutral-50'
                                }`}
                              >
                                {t.generate.videoAdvancedMode}
                              </button>
                            </div>
                          </div>
                          <p className="text-[9px] text-neutral-400 mt-1">
                            {videoGenerationMode === 'simple' ? t.generate.videoSimpleDesc : t.generate.videoAdvancedDesc}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Advanced segment editor */}
                    {videoDuration > 10 && videoGenerationMode === 'advanced' && (
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                {/* Header + Auto-fill button */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-neutral-900">
                    🎬 Séquences — {advancedSegments.length} segments ({advancedSegments.reduce((s, seg) => s + seg.duration, 0)}s)
                  </span>
                  <button
                    type="button"
                    onClick={autoFillSegments}
                    disabled={isDecomposing}
                    className="px-2.5 py-1 text-[10px] font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition"
                  >
                    {isDecomposing ? '⏳ Génération...' : '✨ Remplir auto'}
                  </button>
                </div>

                {/* Segments list */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {advancedSegments.map((seg, idx) => (
                    <div key={idx} className="bg-white rounded-lg border border-neutral-200 p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-purple-700">Segment {idx + 1}</span>
                        <div className="flex items-center gap-1.5">
                          {/* Duration toggle */}
                          <div className="flex bg-neutral-100 rounded overflow-hidden">
                            {([5, 10] as const).map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => updateSegment(idx, 'duration', d)}
                                className={`px-2 py-0.5 text-[9px] font-medium transition ${
                                  seg.duration === d
                                    ? 'bg-purple-600 text-white'
                                    : 'text-neutral-500 hover:bg-neutral-200'
                                }`}
                              >
                                {d}s
                              </button>
                            ))}
                          </div>
                          {advancedSegments.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeSegment(idx)}
                              className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Prompt textarea */}
                      <textarea
                        value={seg.prompt}
                        onChange={(e) => updateSegment(idx, 'prompt', e.target.value)}
                        placeholder={idx === 0 ? 'Plan d\'ouverture : description de la scène...' : `Segment ${idx + 1} : suite de la scène...`}
                        rows={2}
                        className="w-full text-[11px] rounded border border-neutral-200 px-2 py-1.5 mb-1.5 resize-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400 outline-none"
                      />

                      {/* Camera + Transition selects */}
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[9px] text-neutral-500 mb-0.5 block">Caméra</label>
                          <select
                            value={seg.cameraMovement}
                            onChange={(e) => updateSegment(idx, 'cameraMovement', e.target.value)}
                            className="w-full text-[10px] rounded border border-neutral-200 px-1.5 py-1 bg-white focus:ring-1 focus:ring-purple-400 outline-none"
                          >
                            <option value="dolly_in">Dolly in (rapprochement)</option>
                            <option value="pan_left">Pan gauche</option>
                            <option value="pan_right">Pan droite</option>
                            <option value="tracking">Tracking (suivi)</option>
                            <option value="crane">Grue (plongée)</option>
                            <option value="steadicam">Steadicam (fluide)</option>
                            <option value="tilt_up">Tilt haut</option>
                            <option value="tilt_down">Tilt bas</option>
                            <option value="static">Fixe</option>
                          </select>
                        </div>
                        {idx < advancedSegments.length - 1 && (
                          <div className="flex-1">
                            <label className="text-[9px] text-neutral-500 mb-0.5 block">Transition</label>
                            <select
                              value={seg.transition}
                              onChange={(e) => updateSegment(idx, 'transition', e.target.value)}
                              className="w-full text-[10px] rounded border border-neutral-200 px-1.5 py-1 bg-white focus:ring-1 focus:ring-purple-400 outline-none"
                            >
                              <option value="smooth">Fluide</option>
                              <option value="cut">Cut</option>
                              <option value="fade">Fondu</option>
                              <option value="zoom">Zoom</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add segment + total */}
                <div className="flex items-center justify-between mt-2">
                  <button
                    type="button"
                    onClick={addSegment}
                    className="text-[10px] text-purple-600 font-medium hover:text-purple-800 transition"
                  >
                    + Ajouter un segment
                  </button>
                  <span className="text-[10px] font-bold text-neutral-600">
                    Total : {advancedSegments.reduce((s, seg) => s + seg.duration, 0)}s
                  </span>
                </div>
              </div>
            )}

            {/* Read-only progress timeline (shows ONLY during video generation, advanced mode only) */}
            {videoDuration > 10 && generatingVideo && videoLongSegments.length > 0 && videoGenerationMode === 'advanced' && (
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-900">
                    🎞️ Progression — {videoLongSegments.length} segments
                  </span>
                  <span className="text-[10px] text-purple-600 font-medium">
                    {videoLongProgress}%
                  </span>
                </div>
                <div className="w-full bg-purple-200 rounded-full h-1.5 mb-3">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${videoLongProgress}%` }}
                  />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {videoLongSegments.map((seg: any, idx: number) => (
                    <div
                      key={idx}
                      className={`flex-shrink-0 w-20 rounded-lg border p-2 text-center transition-all ${
                        seg.status === 'completed'
                          ? 'bg-green-50 border-green-300'
                          : seg.status === 'generating'
                          ? 'bg-amber-50 border-amber-300 animate-pulse'
                          : seg.status === 'failed'
                          ? 'bg-red-50 border-red-300'
                          : 'bg-white border-neutral-200'
                      }`}
                    >
                      <span className="block text-[10px] font-medium text-neutral-600">
                        Seg. {idx + 1}
                      </span>
                      <span className="block text-[9px] mt-0.5">
                        {seg.status === 'completed' ? '✅' : seg.status === 'generating' ? '⏳' : seg.status === 'failed' ? '❌' : '⏸️'}
                      </span>
                      {seg.status === 'completed' && seg.videoUrl && (
                        <video src={seg.videoUrl} className="w-full h-10 object-cover rounded mt-1" muted />
                      )}
                    </div>
                  ))}
                </div>
                {videoLongStatus && (
                  <p className="text-[10px] text-purple-600 mt-2 text-center font-medium">
                    {videoLongStatus}
                  </p>
                )}
              </div>
            )}
                  </>
                )}

                {/* Bouton de génération */}
                <button
                  onClick={generationMode === 'video' ? handleGenerateVideo : handleGenerate}
                  disabled={generating || generatingVideo || (useNewsMode && !selectedNews) || (!useNewsMode && !businessDescription.trim()) || !businessType.trim()}
                  className={`w-full py-2.5 text-xs font-semibold rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    generationMode === 'video'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {generationMode === 'video'
                    ? (generatingVideo ? videoProgress || t.generate.generating : `🎬 ${t.generate.createVideo} (${videoDuration}s) — ${getVideoCreditCost(videoDuration)} cr`)
                    : (generating ? t.generate.generating : `🖼️ ${t.generate.generateVisual} — ${CREDIT_COSTS.image_t2i} cr`)
                  }
                </button>

                {useNewsMode && !selectedNews && (
                  <p className="text-[10px] text-amber-600 text-center">
                    ⚠️ {t.generate.selectNewsWarning}
                  </p>
                )}
                {!useNewsMode && !businessDescription.trim() && (
                  <p className="text-[10px] text-amber-600 text-center">
                    ⚠️ {t.generate.describeBusinessWarning}
                  </p>
                )}
                {/* Navigation étape 4 */}
                <button onClick={() => setFormStep(3)} className="w-full py-1.5 border border-neutral-300 text-neutral-600 text-xs font-medium rounded-lg hover:bg-neutral-50 transition mt-2">
                  ← {t.generate.modifyDetails}
                </button>
                </>)}
              </div>
            </div>

            {/* ═══ SIDEBAR: indicateur compact + lien vers résultat ═══ */}
            {(generating || generatingVideo) && !generatedImageUrl && !generatedVideoUrl && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      {generatingVideo ? t.generate.videoGenerationInProgress : t.generate.generatingInProgress}
                    </p>
                    <p className="text-xs text-blue-600">{generatingVideo ? videoProgress : t.generate.creatingVisual}</p>
                  </div>
                </div>
              </div>
            )}
            {(generatedImageUrl || generatedVideoUrl) && !showEditStudio && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-xl">
                    {generatedVideoUrl ? '🎬' : '🖼️'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-900">
                      {generatedVideoUrl ? t.generate.generatedVideo : t.generate.visual} ✓
                    </p>
                    <p className="text-xs text-green-600">{locale === 'fr' ? 'Résultat visible ci-dessous' : 'Result visible below'}</p>
                  </div>
                </div>
              </div>
            )}
            {generationError && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700 text-xs">
                {generationError}
              </div>
            )}

            {/* ═══ ANCIENS BLOCS RÉSULTAT (masqués — remplacés par le modal overlay) ═══ */}
            {false && (<>
            {/* Skeleton pendant la génération */}
            {generating && !generatedImageUrl && (
              <div className="bg-white rounded-xl border p-3 animate-pulse">
                <div className="h-4 bg-neutral-200 rounded w-20 mb-3"></div>
                <div className="aspect-square bg-gradient-to-br from-neutral-100 to-neutral-200 rounded border">
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                      <div className="space-y-2">
                        <div className="h-3 bg-neutral-300 rounded w-32 mx-auto"></div>
                        <div className="h-2 bg-neutral-200 rounded w-24 mx-auto"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Visuel généré */}
            {generatedImageUrl && !showEditStudio && (
              <div className="bg-white rounded-xl border p-3">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  {t.generate.visual}
                  {lastProvider && (
                    <span className={`w-3 h-3 rounded-full inline-block ${lastProvider === 'k' ? 'bg-emerald-500' : 'bg-orange-500'}`} />
                  )}
                </h3>
                <div className="relative w-full aspect-square bg-neutral-100 rounded border overflow-hidden">
                  <img
                    src={generatedImageUrl || undefined}
                    alt={t.generate.generatedVisualAlt}
                    className="w-full h-full object-contain relative z-10"
                    onLoad={(e) => {
                      (e.target as HTMLImageElement).style.opacity = '1';
                      setImageLoadingProgress(100);
                      setLoadingStep('ready');
                      // Nettoyer après 500ms
                      setTimeout(() => {
                        setImageLoadingProgress(0);
                        setLoadingStep('api');
                      }, 500);
                    }}
                    onError={() => {
                      console.error('[Image] Failed to load');
                      setImageLoadingProgress(100);
                    }}
                    style={{ opacity: 0, transition: 'opacity 0.5s ease-in-out' }}
                  />

                  {/* Loader avancé pendant le chargement */}
                  {imageLoadingProgress > 0 && imageLoadingProgress < 100 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100">

                      {/* Animation de génération */}
                      <div className="relative mb-6">
                        {/* Cercle extérieur pulsant */}
                        <div className="absolute inset-0 w-24 h-24 border-4 border-blue-200 rounded-full animate-ping opacity-20"></div>

                        {/* Cercle principal avec progression */}
                        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                          {/* Background circle */}
                          <circle
                            cx="50"
                            cy="50"
                            r="45"
                            fill="none"
                            stroke="#e5e7eb"
                            strokeWidth="8"
                          />
                          {/* Progress circle */}
                          <circle
                            cx="50"
                            cy="50"
                            r="45"
                            fill="none"
                            stroke="url(#gradient)"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${imageLoadingProgress * 2.827} 282.7`}
                            style={{ transition: 'stroke-dasharray 0.3s ease' }}
                          />
                          <defs>
                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#3b82f6" />
                              <stop offset="100%" stopColor="#06b6d4" />
                            </linearGradient>
                          </defs>
                        </svg>

                        {/* Icône centrale */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-3xl">
                            {loadingStep === 'api' && '🎨'}
                            {loadingStep === 'download' && '📥'}
                            {loadingStep === 'ready' && '✓'}
                          </div>
                        </div>
                      </div>

                      {/* Texte de statut */}
                      <div className="text-center space-y-2 px-4">
                        <p className="text-base font-semibold text-neutral-900">
                          {loadingStep === 'api' && t.generate.generatingInProgress}
                          {loadingStep === 'download' && t.generate.loadingImage}
                          {loadingStep === 'ready' && t.generate.ready}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {loadingStep === 'api' && t.generate.creatingVisual}
                          {loadingStep === 'download' && t.generate.optimizingDownload}
                          {loadingStep === 'ready' && t.generate.visualAvailable}
                        </p>

                        {/* Barre de progression */}
                        <div className="w-full max-w-xs mx-auto">
                          <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${imageLoadingProgress}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-neutral-400 mt-1">{imageLoadingProgress}%</p>
                        </div>
                      </div>

                      {/* Animation de points */}
                      <div className="flex gap-1.5 mt-4">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {/* Boutons d'action */}
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setShowEditStudio(true);
                        // Utiliser l'image PROPRE (sans texte overlay) comme base
                        const cleanBase = imageWithWatermarkOnly || originalImageUrl || generatedImageUrl;
                        if (!cleanBase) return;
                        setEditVersions([cleanBase]);
                        setSelectedEditVersion(cleanBase);
                        setBaseOriginalImageUrl(cleanBase);
                        // Pré-charger le texte overlay de la génération comme premier item modifiable
                        if (overlayText.trim()) {
                          const overlayId = `overlay-gen-${Date.now()}`;
                          const items: GenerateTextOverlay[] = [{
                            id: overlayId,
                            text: overlayText,
                            position: textPosition ?? 50,
                            fontSize: fontSize || 60,
                            fontFamily: fontFamily || 'inter',
                            textColor: textColor || '#ffffff',
                            backgroundColor: textBackgroundColor || 'rgba(0, 0, 0, 0.5)',
                            backgroundStyle: backgroundStyle || 'none',
                          }];
                          setTextOverlayItems(items);
                          // Auto-entrer en mode édition pour cet overlay
                          setEditingOverlayId(overlayId);
                          // Générer immédiatement la preview avec texte
                          try {
                            const preview = await renderOverlaysOnImage(cleanBase, items);
                            setTextPreviewUrl(preview);
                            setVersionPreviews({ [cleanBase]: preview });
                          } catch (e) { console.warn('[EditStudio] Initial preview failed:', e); }
                        } else {
                          setTextOverlayItems([]);
                          setVersionPreviews({});
                          setEditingOverlayId(null);
                        }
                      }}
                      className="flex-1 py-2 text-xs bg-blue-600 text-white text-center rounded hover:bg-blue-700 transition-colors"
                    >
                      {t.generate.edit}
                    </button>
                    <a
                      href={selectedEditVersion || generatedImageUrl || undefined}
                      download
                      className="flex-1 py-2 text-xs bg-neutral-900 text-white text-center rounded hover:bg-neutral-800 transition-colors"
                    >
                      {t.generate.download}
                    </a>
                  </div>
                  {/* Deuxième ligne de boutons */}
                  <div className="flex gap-2">
                    <button
                      onClick={saveToLibrary}
                      disabled={savingToLibrary || imageSavedToLibrary}
                      className={`flex-1 py-2 text-xs text-white text-center rounded transition-colors ${
                        imageSavedToLibrary
                          ? 'bg-green-600 cursor-not-allowed'
                          : savingToLibrary
                          ? 'bg-blue-400 cursor-wait'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {imageSavedToLibrary ? `✓ ${t.generate.saved}` : savingToLibrary ? t.generate.saving : `📁 ${t.generate.save}`}
                    </button>
                    <button
                      onClick={() => {
                        setGeneratedImageUrl(null);
                        setOriginalImageUrl(null);
                        setGeneratedPrompt(null);
                        setImageSavedToLibrary(false);
                        setGeneratedAudioUrl(null); // Reset audio aussi
                      }}
                      className="flex-1 py-2 text-xs border rounded hover:bg-neutral-50 transition-colors"
                    >
                      {t.generate.newGeneration}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Audio généré - masqué au client, stocké en interne pour fusion */}
            {/* L'audio est automatiquement fusionné dans la vidéo, le client ne voit que le résultat final */}

            {/* Vidéo générée */}
            {generatedVideoUrl && !showEditStudio && (
              <div className="bg-white rounded-xl border p-3">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  {t.generate.generatedVideo}
                  {lastVideoProvider && (
                    <span className={`w-3 h-3 rounded-full inline-block ${lastVideoProvider === 'k' ? 'bg-emerald-500' : 'bg-orange-500'}`} />
                  )}
                </h3>
                <div className={`relative w-full bg-neutral-900 rounded border overflow-hidden ${
                  videoAspectRatio === '9:16' ? 'aspect-[9/16] max-h-[500px] mx-auto'
                  : videoAspectRatio === '4:5' ? 'aspect-[4/5] max-h-[500px] mx-auto'
                  : 'aspect-video'
                }`}>
                  <video
                    ref={videoPreviewRef}
                    src={generatedVideoUrl || undefined}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-cover"
                    onTimeUpdate={() => {
                      if (!generatedSubtitleText || !['wordstay', 'wordflash', 'neon'].includes(aiTextStyle)) return;
                      const v = videoPreviewRef.current;
                      if (!v || !v.duration) return;
                      const words = generatedSubtitleText.trim().split(/\s+/);
                      const progress = v.currentTime / v.duration;
                      setCurrentWordIndex(Math.min(Math.floor(progress * words.length), words.length - 1));
                    }}
                  />
                  {generatedSubtitleText && (() => {
                    const words = generatedSubtitleText.trim().split(/\s+/);
                    const displayText = generatedSubtitleText.length > 80 ? generatedSubtitleText.substring(0, 80) + '...' : generatedSubtitleText;
                    const sizeMap: Record<string, Record<string, string>> = {
                      wordflash: { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl', xl: 'text-5xl' },
                      wordstay: { sm: 'text-xs', md: 'text-sm', lg: 'text-base', xl: 'text-lg' },
                      neon: { sm: 'text-base', md: 'text-xl', lg: 'text-3xl', xl: 'text-4xl' },
                      cinema: { sm: 'text-[10px]', md: 'text-xs', lg: 'text-sm', xl: 'text-base' },
                      impact: { sm: 'text-base', md: 'text-xl', lg: 'text-3xl', xl: 'text-4xl' },
                      minimal: { sm: 'text-[8px]', md: 'text-[10px]', lg: 'text-xs', xl: 'text-sm' },
                    };
                    const fontSize = sizeMap[aiTextStyle]?.[subtitleFontSize] || sizeMap.wordflash[subtitleFontSize];
                    const posClass = subtitlePosition === 'top' ? 'top-4'
                      : subtitlePosition === 'center' ? 'inset-0 flex items-center justify-center'
                      : 'bottom-4';
                    return (
                      <div className={`absolute left-2 right-2 text-center pointer-events-none ${posClass}`}>
                        {aiTextStyle === 'wordflash' ? (
                          <span className={`text-white ${fontSize} font-black uppercase tracking-wide [text-shadow:_0_0_20px_rgb(0_0_0),_0_0_40px_rgb(0_0_0)]`}>
                            {words[currentWordIndex] || ''}
                          </span>
                        ) : aiTextStyle === 'wordstay' ? (
                          <span className="inline-block max-w-[95%]">
                            {words.slice(0, currentWordIndex + 1).map((w, i) => (
                              <span key={i} className={`${i === currentWordIndex ? 'text-yellow-300' : 'text-white'} ${fontSize} font-extrabold [text-shadow:_2px_2px_4px_rgb(0_0_0_/_90%)]`}>
                                {w}{' '}
                              </span>
                            ))}
                          </span>
                        ) : aiTextStyle === 'neon' ? (
                          <span className={`text-fuchsia-400 ${fontSize} font-black [text-shadow:_0_0_10px_rgb(192_38_211),_0_0_20px_rgb(192_38_211),_0_0_40px_rgb(192_38_211)]`}>
                            {words[currentWordIndex] || ''}
                          </span>
                        ) : aiTextStyle === 'cinema' ? (
                          <span className={`inline-block max-w-[95%] text-white ${fontSize} font-medium bg-black/80 px-4 py-2 tracking-wider`}>
                            {displayText}
                          </span>
                        ) : aiTextStyle === 'impact' ? (
                          <span className={`text-white ${fontSize} font-black uppercase tracking-tight [text-shadow:_3px_3px_0_rgb(0_0_0),_-1px_-1px_0_rgb(0_0_0)]`}>
                            {displayText}
                          </span>
                        ) : (
                          <span className={`inline-block max-w-[95%] text-white/90 ${fontSize} font-medium bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm`}>
                            {displayText}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowVideoEditor(!showVideoEditor)}
                      className={`flex-1 py-2 text-xs text-white text-center rounded transition-colors ${
                        showVideoEditor ? 'bg-purple-700' : 'bg-purple-600 hover:bg-purple-700'
                      }`}
                    >
                      {showVideoEditor ? `✕ ${t.generate.closeEditor}` : t.generate.edit}
                    </button>
                    <a
                      href={generatedVideoUrl || undefined}
                      download="keiro-video.mp4"
                      className="flex-1 py-2 text-xs bg-neutral-900 text-white text-center rounded hover:bg-neutral-800 transition-colors"
                    >
                      {t.generate.download}
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveVideoToLibrary}
                      disabled={videoSavedToLibrary || savingToLibrary}
                      className={`flex-1 py-2 text-xs text-white text-center rounded transition-colors ${
                        videoSavedToLibrary
                          ? 'bg-green-600 cursor-default'
                          : 'bg-cyan-600 hover:bg-cyan-700'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {savingToLibrary ? t.generate.saving : videoSavedToLibrary ? `✓ ${t.generate.saved}` : `📁 ${t.generate.saveToGallery}`}
                    </button>
                    <button
                      onClick={() => { setGeneratedVideoUrl(null); setShowVideoEditor(false); }}
                      className="flex-1 py-2 text-xs border rounded hover:bg-neutral-50 transition-colors"
                    >
                      {t.generate.newGeneration}
                    </button>
                  </div>
                </div>

                {/* Panneau d'édition vidéo */}
                {showVideoEditor && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    {/* Texte / Sous-titres */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                      <label className="block text-xs font-semibold text-neutral-900">
                        📝 {t.generate.textSubtitles}
                      </label>
                      <textarea
                        value={generatedSubtitleText}
                        onChange={(e) => setGeneratedSubtitleText(e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                        placeholder={t.generate.textOnVideoPlaceholder}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { key: 'wordflash', label: t.generate.subtitleWordByWord },
                          { key: 'wordstay', label: t.generate.subtitleKaraoke },
                          { key: 'neon', label: t.generate.subtitleNeon },
                          { key: 'cinema', label: t.generate.subtitleCinema },
                          { key: 'impact', label: t.generate.subtitleBold },
                          { key: 'minimal', label: t.generate.subtitleSubtle },
                        ].map((style) => (
                          <button
                            key={style.key}
                            onClick={() => setAITextStyle(style.key)}
                            className={`px-2 py-1 text-[10px] rounded border transition-all ${
                              aiTextStyle === style.key
                                ? 'bg-green-600 text-white border-green-600'
                                : 'bg-white text-green-700 border-green-300 hover:border-green-400'
                            }`}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                      {/* Taille du texte */}
                      <div className="mt-2">
                        <p className="text-[10px] text-green-700 mb-1">{t.generate.textSize}</p>
                        <div className="flex gap-1.5">
                          {([
                            { key: 'sm', label: t.generate.subtitleSizeSmall },
                            { key: 'md', label: t.generate.subtitleSizeMedium },
                            { key: 'lg', label: t.generate.subtitleSizeLarge },
                            { key: 'xl', label: t.generate.subtitleSizeXL },
                          ] as const).map((s) => (
                            <button
                              key={s.key}
                              onClick={() => setSubtitleFontSize(s.key)}
                              className={`px-2 py-1 text-[10px] rounded border transition-all ${
                                subtitleFontSize === s.key
                                  ? 'bg-green-600 text-white border-green-600'
                                  : 'bg-white text-green-700 border-green-300 hover:border-green-400'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Position du texte */}
                      <div className="mt-2">
                        <p className="text-[10px] text-green-700 mb-1">{t.generate.positionLabel}</p>
                        <div className="flex gap-1.5">
                          {([
                            { key: 'top', label: t.generate.subtitlePositionTop },
                            { key: 'center', label: t.generate.subtitlePositionCenter },
                            { key: 'bottom', label: t.generate.subtitlePositionBottom },
                          ] as const).map((p) => (
                            <button
                              key={p.key}
                              onClick={() => setSubtitlePosition(p.key)}
                              className={`px-2 py-1 text-[10px] rounded border transition-all ${
                                subtitlePosition === p.key
                                  ? 'bg-green-600 text-white border-green-600'
                                  : 'bg-white text-green-700 border-green-300 hover:border-green-400'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Voix off */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                      <label className="block text-xs font-semibold text-neutral-900">
                        🎙️ {locale === 'fr' ? 'Voix off' : 'Voice narration'}
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { value: 'pFZP5JQG7iQjIQuC4Bku', label: `♀ ${t.generate.femaleSoft}` },
                          { value: 'EXAVITQu4vr4xnSDxMaL', label: `♀ ${t.generate.femaleNatural}` },
                          { value: 'Xb7hH8MSUJpSbSDYk0k2', label: `♀ ${t.generate.femalePro}` },
                          { value: 'cgSgspJ2msm6clMCkdW9', label: `♀ ${t.generate.femaleEnergetic}` },
                          { value: 'JBFqnCBsd6RMkjVDRZzb', label: `♂ ${t.generate.maleNarrator}` },
                          { value: 'onwK4e9ZLuTAKqWW03F9', label: `♂ ${t.generate.maleDynamic}` },
                          { value: 'nPczCjzI2devNBz1zQrb', label: `♂ ${t.generate.maleDeep}` },
                          { value: 'cjVigY5qzO86Huf0OWal', label: `♂ ${t.generate.maleAuthoritative}` },
                        ].map((voice) => (
                          <button
                            key={voice.value}
                            onClick={() => setSelectedVoice(voice.value)}
                            className={`px-2 py-1 text-[10px] rounded border transition-all text-left ${
                              selectedVoice === voice.value
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-neutral-700 border-neutral-200 hover:border-blue-300'
                            }`}
                          >
                            {voice.label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={async () => {
                          if (!generatedSubtitleText.trim() || !generatedVideoUrl) return;
                          setVideoEditorMerging(true);
                          try {
                            // 1. Générer audio voix
                            const audioRes = await fetch('/api/generate-audio-tts', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ text: generatedSubtitleText.trim(), targetDuration: videoDuration || 10, voice: selectedVoice, speed: 1.0 })
                            });
                            const audioData = await audioRes.json();
                            if (!audioData.ok) throw new Error(audioData.error);
                            setGeneratedSubtitleText(audioData.condensedText || generatedSubtitleText);

                            // 2. Fusionner avec la vidéo
                            const mergeRes = await fetch('/api/merge-audio-video', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ videoUrl: generatedVideoUrl, audioUrl: audioData.audioUrl })
                            });
                            const mergeData = await mergeRes.json();
                            if (mergeData.ok && mergeData.mergedUrl) {
                              setGeneratedVideoUrl(mergeData.mergedUrl);
                              if (lastSavedVideoId) {
                                fetch('/api/library/save-video', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: lastSavedVideoId, videoUrl: mergeData.mergedUrl })
                                }).catch(() => {});
                              }
                            } else {
                              alert(`${t.generate.alertError} ${mergeData.error}`);
                            }
                          } catch (err: any) {
                            alert(`${t.generate.alertError} ${err.message}`);
                          } finally { setVideoEditorMerging(false); }
                        }}
                        disabled={videoEditorMerging || !generatedSubtitleText.trim()}
                        className={`w-full px-3 py-2 rounded text-xs font-medium transition-colors ${
                          videoEditorMerging || !generatedSubtitleText.trim()
                            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {videoEditorMerging ? `⏳ ${t.generate.finalizingVideo}` : `🎙️ ${t.generate.generateModifyAudio}`}
                      </button>
                    </div>

                    {/* Musique de fond (éditeur) */}
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addMusic}
                          onChange={(e) => {
                            setAddMusic(e.target.checked);
                            if (!e.target.checked) setSelectedMusic('none');
                            else if (selectedMusic === 'none') setSelectedMusic('energetic');
                          }}
                          className="w-4 h-4 text-purple-600 bg-white border-gray-300 rounded focus:ring-purple-500"
                        />
                        <span className="text-xs font-semibold text-neutral-900">
                          🎵 {t.generate.backgroundMusic}
                        </span>
                        <span className="text-[9px] text-neutral-400 ml-auto">{locale === 'fr' ? 'optionnel' : 'optional'}</span>
                      </label>
                      {addMusic && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {([
                              { value: 'corporate', label: t.generate.musicCorporate },
                              { value: 'energetic', label: t.generate.musicEnergetic },
                              { value: 'calm', label: t.generate.musicCalm },
                              { value: 'inspiring', label: t.generate.musicInspiring },
                              { value: 'trendy', label: t.generate.musicTrendy },
                            ]).map((m) => (
                              <button
                                key={m.value}
                                type="button"
                                onClick={() => setSelectedMusic(m.value)}
                                className={`px-2 py-1 text-[10px] rounded-full border transition-all ${
                                  selectedMusic === m.value
                                    ? 'bg-purple-600 text-white border-purple-600'
                                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-purple-300'
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                          {(trendingData?.trendingMusic?.length ?? 0) > 0 && (
                            <div className="pt-1 border-t border-purple-200">
                              <p className="text-[9px] font-semibold text-purple-700 mb-1">🎵 {t.generate.backgroundMusicTrending}</p>
                              <div className="space-y-1 max-h-[100px] overflow-y-auto">
                                {trendingData!.trendingMusic.slice(0, 5).map((song: any, i: number) => {
                                  const songKey = `trending:${song.title}`;
                                  const isSelected = selectedMusic === songKey;
                                  return (
                                    <div
                                      key={i}
                                      onClick={() => setSelectedMusic(isSelected ? 'energetic' : songKey)}
                                      className={`flex items-center gap-2 px-2 py-1 rounded-md text-[9px] cursor-pointer transition-all ${
                                        isSelected
                                          ? 'bg-purple-600 text-white border border-purple-600'
                                          : 'bg-purple-50/50 border border-purple-100 hover:border-purple-300'
                                      }`}
                                    >
                                      {song.coverUrl && (
                                        <img src={song.coverUrl} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className={`font-medium truncate ${isSelected ? 'text-white' : 'text-purple-900'}`}>{song.title}</p>
                                        <p className={`truncate ${isSelected ? 'text-purple-200' : 'text-purple-500'}`}>{song.artist}</p>
                                      </div>
                                      {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={async () => {
                          if (selectedMusic === 'none' || !generatedVideoUrl) return;
                          setVideoEditorMerging(true);
                          try {
                            const musicRes = await fetch('/api/generate-music', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ style: selectedMusic, duration: videoDuration || 10 }),
                            });
                            const musicData = await musicRes.json();
                            if (!musicData.ok || !musicData.musicUrl) throw new Error(musicData.error || 'Music generation failed');

                            const mergeRes = await fetch('/api/merge-audio-video', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ videoUrl: generatedVideoUrl, musicUrl: musicData.musicUrl }),
                            });
                            const mergeData = await mergeRes.json();
                            if (mergeData.ok && mergeData.mergedUrl) {
                              setGeneratedVideoUrl(mergeData.mergedUrl);
                              if (lastSavedVideoId) {
                                fetch('/api/library/save-video', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: lastSavedVideoId, videoUrl: mergeData.mergedUrl })
                                }).catch(() => {});
                              }
                            } else {
                              alert(`${t.generate.alertError} ${mergeData.error}`);
                            }
                          } catch (err: any) {
                            alert(`${t.generate.alertError} ${err.message}`);
                          } finally { setVideoEditorMerging(false); }
                        }}
                        disabled={videoEditorMerging || !addMusic || selectedMusic === 'none'}
                        className={`w-full px-3 py-2 rounded text-xs font-medium transition-colors ${
                          videoEditorMerging || !addMusic || selectedMusic === 'none'
                            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                            : 'bg-purple-600 text-white hover:bg-purple-700'
                        }`}
                      >
                        {videoEditorMerging ? `⏳ ${t.generate.finalizingVideo}` : `🎵 ${locale === 'fr' ? 'Ajouter la musique' : 'Add music'}`}
                      </button>
                    </div>

                    {/* Segments editor (advanced mode, long videos only) */}
                    {videoDuration > 10 && videoGenerationMode === 'advanced' && videoLongSegments.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                        <label className="block text-xs font-semibold text-neutral-900">
                          {locale === 'fr' ? 'Segments de la vidéo' : 'Video segments'}
                        </label>
                        <div className="bg-amber-100/60 border border-amber-300 rounded-md p-2">
                          <p className="text-[10px] text-amber-800 leading-relaxed">
                            {locale === 'fr'
                              ? `Modifier un segment relancera sa génération et coûtera ${getVideoCreditCost(10)} crédits par segment régénéré. Si seule la fin vous déplaît, le coût de régénération peut ne pas en valoir la peine.`
                              : `Modifying a segment will regenerate it and cost ${getVideoCreditCost(10)} credits per segment. If only the ending bothers you, the regeneration cost may not be worth it.`}
                          </p>
                        </div>
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                          {videoLongSegments.map((seg: any, idx: number) => (
                            <div key={idx} className="bg-white rounded border border-neutral-200 p-2 flex items-start gap-2">
                              <div className="flex-shrink-0 w-16">
                                {seg.videoUrl ? (
                                  <video src={seg.videoUrl} className="w-full h-10 object-cover rounded" muted />
                                ) : (
                                  <div className="w-full h-10 bg-neutral-100 rounded flex items-center justify-center text-[9px] text-neutral-400">
                                    {seg.status === 'generating' ? '...' : '-'}
                                  </div>
                                )}
                                <span className="block text-[9px] text-neutral-500 text-center mt-0.5">
                                  Seg. {idx + 1}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-neutral-600 line-clamp-2">{seg.prompt?.substring(0, 80) || '-'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Indicateur de génération vidéo en cours */}
            {generatingVideo && !generatedVideoUrl && (
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border-2 border-orange-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                  <div>
                    <p className="text-sm font-semibold text-orange-900 flex items-center gap-2">
                      {t.generate.videoGenerationInProgress}
                      {lastVideoProvider && (
                        <span className={`w-3 h-3 rounded-full inline-block ${lastVideoProvider === 'k' ? 'bg-emerald-500' : 'bg-orange-500'}`} />
                      )}
                    </p>
                    <p className="text-xs text-orange-600">{videoProgress}</p>
                  </div>
                </div>
              </div>
            )}

            {generationError && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700 text-xs">
                {generationError}
              </div>
            )}
            </>)}
            {/* ═══ FIN ANCIENS BLOCS MASQUÉS ═══ */}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MODAL OVERLAY : Résultat de génération en grand, centré           */}
        {/* S'affiche quand une génération est en cours ou terminée           */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(generating || generatingVideo || (generatedImageUrl && !showEditStudio) || (generatedVideoUrl && !showEditStudio)) && (
          modalMinimized ? (
            /* ═══ MINI BAR : barre fixe en bas quand le popup est réduit ═══ */
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white rounded-2xl shadow-2xl border px-5 py-3 flex items-center gap-3 max-w-md w-[90%] cursor-pointer hover:shadow-3xl transition-shadow"
              onClick={() => setModalMinimized(false)}>
              {(generating || generatingVideo) && !generatedImageUrl && !generatedVideoUrl ? (
                <>
                  <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin flex-shrink-0"></div>
                  <span className="text-sm font-medium text-neutral-700 truncate flex-1">
                    {generatingVideo ? t.generate.videoGenerationInProgress : t.generate.generatingInProgress}
                  </span>
                  <span className="text-xs text-neutral-400">{generatingVideo ? videoProgress : `${imageLoadingProgress}%`}</span>
                </>
              ) : (
                <>
                  <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <span className="text-sm font-medium text-neutral-700 truncate flex-1">
                    {generatedVideoUrl ? (locale === 'fr' ? 'Vidéo prête' : 'Video ready') : (locale === 'fr' ? 'Visuel prêt' : 'Visual ready')}
                  </span>
                </>
              )}
              <button className="text-neutral-400 hover:text-neutral-600 p-1 flex-shrink-0" title={locale === 'fr' ? 'Agrandir' : 'Expand'}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
              </button>
            </div>
          ) : (
          /* ═══ MODAL PLEINE : popup centré ═══ */
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

              {/* ── Header ── */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  {(generating || generatingVideo) && !generatedImageUrl && !generatedVideoUrl
                    ? (locale === 'fr' ? 'Génération en cours...' : 'Generating...')
                    : generatedVideoUrl
                    ? t.generate.generatedVideo
                    : t.generate.visual
                  }
                  {(lastProvider || lastVideoProvider) && (
                    <span className={`w-3 h-3 rounded-full inline-block ${
                      (lastVideoProvider || lastProvider) === 'k' ? 'bg-emerald-500' : 'bg-orange-500'
                    }`} />
                  )}
                </h2>
                <div className="flex items-center gap-1">
                  {/* Bouton réduire */}
                  <button
                    onClick={() => setModalMinimized(true)}
                    className="text-neutral-400 hover:text-neutral-600 transition-colors p-1"
                    title={locale === 'fr' ? 'Réduire' : 'Minimize'}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14H5" /></svg>
                  </button>
                  {/* Bouton fermer (seulement si résultat prêt) */}
                  {(generatedImageUrl || generatedVideoUrl) && (
                    <button
                      onClick={() => {
                        if (generatedVideoUrl) { setGeneratedVideoUrl(null); setShowVideoEditor(false); }
                        if (generatedImageUrl) { setGeneratedImageUrl(null); setOriginalImageUrl(null); setGeneratedPrompt(null); setImageSavedToLibrary(false); setGeneratedAudioUrl(null); }
                      }}
                      className="text-neutral-400 hover:text-neutral-600 transition-colors p-1"
                      title={locale === 'fr' ? 'Fermer' : 'Close'}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              </div>

              {/* ── Contenu : Progress ou Résultat ── */}
              <div className="p-6">

                {/* === PROGRESS IMAGE === */}
                {generating && !generatedImageUrl && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 w-24 h-24 border-4 border-blue-200 rounded-full animate-ping opacity-20"></div>
                      <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                        <circle cx="50" cy="50" r="45" fill="none" stroke="url(#modalGradient)" strokeWidth="8" strokeLinecap="round"
                          strokeDasharray={`${imageLoadingProgress * 2.827} 282.7`} style={{ transition: 'stroke-dasharray 0.3s ease' }} />
                        <defs><linearGradient id="modalGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#06b6d4" /></linearGradient></defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-3xl">{loadingStep === 'api' ? '🎨' : loadingStep === 'download' ? '📥' : '✓'}</div>
                      </div>
                    </div>
                    <p className="text-base font-semibold text-neutral-900">
                      {loadingStep === 'api' ? t.generate.generatingInProgress : loadingStep === 'download' ? t.generate.loadingImage : t.generate.ready}
                    </p>
                    <p className="text-sm text-neutral-500 mt-1">
                      {loadingStep === 'api' ? t.generate.creatingVisual : loadingStep === 'download' ? t.generate.optimizingDownload : t.generate.visualAvailable}
                    </p>
                    <div className="w-full max-w-xs mt-4">
                      <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300 ease-out" style={{ width: `${imageLoadingProgress}%` }} />
                      </div>
                      <p className="text-xs text-neutral-400 mt-1 text-center">{imageLoadingProgress}%</p>
                    </div>
                  </div>
                )}

                {/* === PROGRESS VIDEO === */}
                {generatingVideo && !generatedVideoUrl && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="relative mb-6">
                      <div className="w-20 h-20 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin"></div>
                    </div>
                    <p className="text-base font-semibold text-neutral-900">{t.generate.videoGenerationInProgress}</p>
                    <p className="text-sm text-orange-600 mt-2">{videoProgress}</p>
                  </div>
                )}

                {/* === RÉSULTAT IMAGE === */}
                {generatedImageUrl && !showEditStudio && (
                  <div>
                    <div className="relative w-full bg-neutral-100 rounded-xl border overflow-hidden" style={{ maxHeight: '60vh' }}>
                      <img
                        src={generatedImageUrl}
                        alt={t.generate.generatedVisualAlt}
                        className="w-full h-full object-contain"
                        style={{ maxHeight: '60vh' }}
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={async () => {
                          setShowEditStudio(true);
                          const cleanBase = imageWithWatermarkOnly || originalImageUrl || generatedImageUrl;
                          if (!cleanBase) return;
                          setEditVersions([cleanBase]);
                          setSelectedEditVersion(cleanBase);
                          setBaseOriginalImageUrl(cleanBase);
                          if (overlayText.trim()) {
                            const overlayId = `overlay-gen-${Date.now()}`;
                            const items: GenerateTextOverlay[] = [{
                              id: overlayId, text: overlayText, position: textPosition ?? 50,
                              fontSize: fontSize || 60, fontFamily: fontFamily || 'inter',
                              textColor: textColor || '#ffffff', backgroundColor: textBackgroundColor || 'rgba(0, 0, 0, 0.5)',
                              backgroundStyle: backgroundStyle || 'none',
                            }];
                            setTextOverlayItems(items);
                            setEditingOverlayId(overlayId);
                            try { const preview = await renderOverlaysOnImage(cleanBase, items); setTextPreviewUrl(preview); setVersionPreviews({ [cleanBase]: preview }); } catch {}
                          } else { setTextOverlayItems([]); setVersionPreviews({}); setEditingOverlayId(null); }
                        }}
                        className="flex-1 min-w-[120px] py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        {t.generate.edit}
                      </button>
                      <a
                        href={selectedEditVersion || generatedImageUrl}
                        download
                        className="flex-1 min-w-[120px] py-2.5 text-sm bg-neutral-900 text-white text-center rounded-lg hover:bg-neutral-800 transition-colors font-medium"
                      >
                        {t.generate.download}
                      </a>
                      <button
                        onClick={saveToLibrary}
                        disabled={savingToLibrary || imageSavedToLibrary}
                        className={`flex-1 min-w-[120px] py-2.5 text-sm text-white rounded-lg transition-colors font-medium ${
                          imageSavedToLibrary ? 'bg-green-600 cursor-default' : savingToLibrary ? 'bg-blue-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {imageSavedToLibrary ? `✓ ${t.generate.saved}` : savingToLibrary ? t.generate.saving : t.generate.save}
                      </button>
                      <button
                        onClick={() => { setGeneratedImageUrl(null); setOriginalImageUrl(null); setGeneratedPrompt(null); setImageSavedToLibrary(false); setGeneratedAudioUrl(null); }}
                        className="flex-1 min-w-[120px] py-2.5 text-sm border rounded-lg hover:bg-neutral-50 transition-colors font-medium"
                      >
                        {t.generate.newGeneration}
                      </button>
                    </div>
                  </div>
                )}

                {/* === RÉSULTAT VIDÉO === */}
                {generatedVideoUrl && !showEditStudio && (
                  <div>
                    <div className={`relative w-full bg-neutral-900 rounded-xl overflow-hidden mx-auto ${
                      videoAspectRatio === '9:16' ? 'aspect-[9/16] max-h-[60vh]'
                      : videoAspectRatio === '4:5' ? 'aspect-[4/5] max-h-[60vh]'
                      : 'aspect-video'
                    }`} style={{ maxWidth: videoAspectRatio === '9:16' ? '340px' : videoAspectRatio === '4:5' ? '420px' : '100%' }}>
                      <video
                        ref={videoPreviewRef}
                        src={generatedVideoUrl}
                        controls
                        autoPlay
                        loop
                        className="w-full h-full object-cover"
                        onTimeUpdate={() => {
                          if (!generatedSubtitleText || !['wordstay', 'wordflash', 'neon'].includes(aiTextStyle)) return;
                          const v = videoPreviewRef.current;
                          if (!v || !v.duration) return;
                          const words = generatedSubtitleText.trim().split(/\s+/);
                          const progress = v.currentTime / v.duration;
                          setCurrentWordIndex(Math.min(Math.floor(progress * words.length), words.length - 1));
                        }}
                      />
                      {generatedSubtitleText && (() => {
                        const words = generatedSubtitleText.trim().split(/\s+/);
                        const displayText = generatedSubtitleText.length > 80 ? generatedSubtitleText.substring(0, 80) + '...' : generatedSubtitleText;
                        const sizeMap: Record<string, Record<string, string>> = {
                          wordflash: { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl', xl: 'text-5xl' },
                          wordstay: { sm: 'text-xs', md: 'text-sm', lg: 'text-base', xl: 'text-lg' },
                          neon: { sm: 'text-base', md: 'text-xl', lg: 'text-3xl', xl: 'text-4xl' },
                          cinema: { sm: 'text-[10px]', md: 'text-xs', lg: 'text-sm', xl: 'text-base' },
                          impact: { sm: 'text-base', md: 'text-xl', lg: 'text-3xl', xl: 'text-4xl' },
                          minimal: { sm: 'text-[8px]', md: 'text-[10px]', lg: 'text-xs', xl: 'text-sm' },
                        };
                        const fSize = sizeMap[aiTextStyle]?.[subtitleFontSize] || sizeMap.wordflash[subtitleFontSize];
                        const posClass = subtitlePosition === 'top' ? 'top-4' : subtitlePosition === 'center' ? 'inset-0 flex items-center justify-center' : 'bottom-4';
                        return (
                          <div className={`absolute left-2 right-2 text-center pointer-events-none ${posClass}`}>
                            {aiTextStyle === 'wordflash' ? (
                              <span className={`text-white ${fSize} font-black uppercase tracking-wide [text-shadow:_0_0_20px_rgb(0_0_0),_0_0_40px_rgb(0_0_0)]`}>{words[currentWordIndex] || ''}</span>
                            ) : aiTextStyle === 'wordstay' ? (
                              <span className="inline-block max-w-[95%]">{words.slice(0, currentWordIndex + 1).map((w, i) => (
                                <span key={i} className={`${i === currentWordIndex ? 'text-yellow-300' : 'text-white'} ${fSize} font-extrabold [text-shadow:_2px_2px_4px_rgb(0_0_0_/_90%)]`}>{w}{' '}</span>
                              ))}</span>
                            ) : aiTextStyle === 'neon' ? (
                              <span className={`text-fuchsia-400 ${fSize} font-black [text-shadow:_0_0_10px_rgb(192_38_211),_0_0_20px_rgb(192_38_211),_0_0_40px_rgb(192_38_211)]`}>{words[currentWordIndex] || ''}</span>
                            ) : aiTextStyle === 'cinema' ? (
                              <span className={`inline-block max-w-[95%] text-white ${fSize} font-medium bg-black/80 px-4 py-2 tracking-wider`}>{displayText}</span>
                            ) : aiTextStyle === 'impact' ? (
                              <span className={`text-white ${fSize} font-black uppercase tracking-tight [text-shadow:_3px_3px_0_rgb(0_0_0),_-1px_-1px_0_rgb(0_0_0)]`}>{displayText}</span>
                            ) : (
                              <span className={`inline-block max-w-[95%] text-white/90 ${fSize} font-medium bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm`}>{displayText}</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => setShowVideoEditor(!showVideoEditor)}
                        className={`flex-1 min-w-[120px] py-2.5 text-sm text-white rounded-lg transition-colors font-medium ${showVideoEditor ? 'bg-purple-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                      >
                        {showVideoEditor ? `✕ ${t.generate.closeEditor}` : t.generate.edit}
                      </button>
                      <a
                        href={generatedVideoUrl}
                        download="keiro-video.mp4"
                        className="flex-1 min-w-[120px] py-2.5 text-sm bg-neutral-900 text-white text-center rounded-lg hover:bg-neutral-800 transition-colors font-medium"
                      >
                        {t.generate.download}
                      </a>
                      <button
                        onClick={saveVideoToLibrary}
                        disabled={videoSavedToLibrary || savingToLibrary}
                        className={`flex-1 min-w-[120px] py-2.5 text-sm text-white rounded-lg transition-colors font-medium ${
                          videoSavedToLibrary ? 'bg-green-600 cursor-default' : 'bg-cyan-600 hover:bg-cyan-700'
                        } disabled:opacity-50`}
                      >
                        {savingToLibrary ? t.generate.saving : videoSavedToLibrary ? `✓ ${t.generate.saved}` : t.generate.saveToGallery}
                      </button>
                      <button
                        onClick={() => { setGeneratedVideoUrl(null); setShowVideoEditor(false); }}
                        className="flex-1 min-w-[120px] py-2.5 text-sm border rounded-lg hover:bg-neutral-50 transition-colors font-medium"
                      >
                        {t.generate.newGeneration}
                      </button>
                    </div>

                    {/* Panneau éditeur vidéo inline dans le modal */}
                    {showVideoEditor && (
                      <div className="mt-4 border-t pt-4 space-y-3">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                          <label className="block text-xs font-semibold text-neutral-900">📝 {t.generate.textSubtitles}</label>
                          <textarea
                            value={generatedSubtitleText}
                            onChange={(e) => setGeneratedSubtitleText(e.target.value)}
                            placeholder={locale === 'fr' ? 'Texte à afficher sur la vidéo...' : 'Text to display on video...'}
                            className="w-full text-xs rounded-lg border border-neutral-200 px-3 py-2 bg-white min-h-[60px] resize-none focus:outline-none focus:border-blue-500"
                          />
                          <div className="flex flex-wrap gap-1">
                            {['wordflash', 'wordstay', 'neon', 'cinema', 'impact', 'minimal'].map(style => (
                              <button key={style} onClick={() => setAITextStyle(style)}
                                className={`px-2 py-1 text-[10px] rounded-full font-medium transition ${aiTextStyle === style ? 'bg-blue-600 text-white' : 'bg-neutral-100 hover:bg-neutral-200'}`}>
                                {style}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            {(['sm', 'md', 'lg', 'xl'] as const).map(size => (
                              <button key={size} onClick={() => setSubtitleFontSize(size)}
                                className={`px-2 py-1 text-[10px] rounded font-medium transition ${subtitleFontSize === size ? 'bg-blue-600 text-white' : 'bg-neutral-100 hover:bg-neutral-200'}`}>
                                {size.toUpperCase()}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            {(['top', 'center', 'bottom'] as const).map(pos => (
                              <button key={pos} onClick={() => setSubtitlePosition(pos)}
                                className={`px-2 py-1 text-[10px] rounded font-medium transition ${subtitlePosition === pos ? 'bg-blue-600 text-white' : 'bg-neutral-100 hover:bg-neutral-200'}`}>
                                {pos === 'top' ? '⬆️' : pos === 'center' ? '⬅️' : '⬇️'} {pos}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Erreur */}
                {generationError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm mt-4">
                    {generationError}
                  </div>
                )}
              </div>
            </div>
          </div>
          )
        )}

        {/* ===== STUDIO D'ÉDITION - RESPONSIVE MOBILE-FIRST ===== */}
        {showEditStudio && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0">
            <div className="bg-white w-full h-full lg:rounded-xl lg:max-w-7xl lg:h-[90vh] lg:m-4 flex flex-col">
              {/* Header du studio */}
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {t.generate.editStudio}
                  {lastProvider && (
                    <span className={`w-3 h-3 rounded-full inline-block ${lastProvider === 'k' ? 'bg-emerald-500' : 'bg-orange-500'}`} />
                  )}
                </h2>
                <button
                  onClick={() => {
                    setShowEditStudio(false);
                    setActiveTab('image');
                  }}
                  className="text-2xl text-neutral-500 hover:text-neutral-900"
                >
                  ×
                </button>
              </div>

              {/* MOBILE : Onglets de navigation (< lg) */}
              <div className="lg:hidden border-b bg-white sticky top-0 z-10">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('image')}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'image'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-neutral-600'
                    }`}
                  >
                    {t.generate.mobileTabImage}
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('edit');
                      // Initialiser selectedEditVersion si ce n'est pas déjà fait
                      if (!selectedEditVersion && generatedImageUrl) {
                        setEditVersions([generatedImageUrl]);
                        setSelectedEditVersion(generatedImageUrl);
                      }
                    }}
                    className={`flex-1 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'edit'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-neutral-600'
                    }`}
                  >
                    {t.generate.mobileTabEdit}
                  </button>
                  <button
                    onClick={() => setActiveTab('text')}
                    className={`flex-1 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'text'
                        ? 'border-purple-500 text-purple-600'
                        : 'border-transparent text-neutral-600'
                    }`}
                  >
                    {t.generate.mobileTabText}
                  </button>
                  <button
                    onClick={() => setActiveTab('versions')}
                    className={`flex-1 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'versions'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-neutral-600'
                    }`}
                  >
                    {t.generate.mobileTabVersions} ({editVersions.length})
                  </button>
                </div>
              </div>

              {/* MOBILE : Contenu des onglets (< lg) */}
              <div className="flex-1 overflow-y-auto lg:hidden">
                {/* Onglet Image */}
                {activeTab === 'image' && (
                  <div className="h-full bg-neutral-50 flex items-center justify-center p-4">
                    {textPreviewUrl ? (
                      <img
                        src={textPreviewUrl}
                        alt={t.generate.altPreviewWithText}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                      />
                    ) : selectedEditVersion ? (
                      <img
                        src={(textOverlayItems.length > 0 && versionPreviews[selectedEditVersion]) || selectedEditVersion}
                        alt={t.generate.altSelectedImage}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                      />
                    ) : generatedImageUrl ? (
                      <img
                        src={generatedImageUrl}
                        alt={t.generate.altGeneratedImage}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                      />
                    ) : (
                      <p className="text-neutral-400 text-sm">{t.generate.noImage}</p>
                    )}
                  </div>
                )}

                {/* Onglet Éditer */}
                {activeTab === 'edit' && (
                  <div className="p-4 space-y-4">
                    <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
                      <h3 className="text-base font-semibold mb-3">{t.generate.editAssistant}</h3>

                      {/* Logo (optionnel) */}
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-neutral-800 mb-2">
                          🎨 {t.generate.logoOptional}
                        </label>
                        {!logoUrl ? (
                          <div className="border-2 border-dashed border-purple-300 rounded-lg p-4 text-center hover:border-purple-400 transition-colors">
                            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg transition-all font-medium text-sm">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                      setLogoUrl(ev.target?.result as string);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                className="hidden"
                              />
                              📤 {t.generate.addYourLogo}
                            </label>
                            <p className="text-xs text-neutral-600 mt-2">{t.generate.optionalBranding}</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-purple-200">
                            <img src={logoUrl} alt="Logo" className="w-12 h-12 object-contain rounded border" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-neutral-700">{t.generate.logoAdded}</p>
                              <p className="text-xs text-neutral-500">{t.generate.overlayOnImage}</p>
                            </div>
                            <button
                              onClick={() => setLogoUrl('')}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={t.generate.removeLogo}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {/* Position du logo (si logo uploadé) */}
                        {logoUrl && (
                          <div className="mt-3 p-3 bg-white rounded-lg border border-neutral-200">
                            <label className="block text-sm font-semibold text-neutral-800 mb-2">{t.generate.logoPosition}</label>
                            <div className="grid grid-cols-2 gap-2">
                              {([
                                { pos: 'top-left', label: `↖️ ${t.generate.topLeft}` },
                                { pos: 'top-right', label: `↗️ ${t.generate.topRight}` },
                                { pos: 'bottom-left', label: `↙️ ${t.generate.bottomLeft}` },
                                { pos: 'bottom-right', label: `↘️ ${t.generate.bottomRight}` }
                              ] as const).map(({ pos, label }) => (
                                <button
                                  key={pos}
                                  onClick={() => setLogoPosition(pos)}
                                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                    logoPosition === pos
                                      ? 'bg-purple-500 text-white ring-2 ring-purple-300'
                                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Slider force de modification */}
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-2">
                          {t.generate.editStrength} <span className="text-purple-600 font-bold">
                            {editStrength <= 5 ? t.generate.strengthSubtle : editStrength <= 7 ? t.generate.strengthModerate : t.generate.strengthStrong}
                          </span>
                        </p>
                        <input
                          type="range"
                          min={3}
                          max={10}
                          step={0.5}
                          value={editStrength}
                          onChange={(e) => setEditStrength(Number(e.target.value))}
                          className="w-full accent-purple-600"
                        />
                        <div className="flex justify-between text-[10px] text-neutral-400 mt-1">
                          <span>{t.generate.strengthSubtle}</span>
                          <span>{t.generate.strengthModerate}</span>
                          <span>{t.generate.strengthStrong}</span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-2">
                          {editStrength <= 5
                            ? t.generate.strengthSubtleDesc
                            : editStrength <= 7
                            ? t.generate.strengthModerateDesc
                            : t.generate.strengthStrongDesc}
                        </p>
                      </div>

                      {/* Textarea pour prompt */}
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-neutral-800 mb-2">
                          ✏️ {t.generate.describeModifications}
                        </label>
                        <textarea
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          rows={5}
                          className="w-full text-base rounded-lg border-2 border-purple-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                          placeholder={
                            editStrength <= 5
                              ? t.generate.editPlaceholderSubtle
                              : editStrength <= 7
                              ? t.generate.editPlaceholderModerate
                              : t.generate.editPlaceholderStrong
                          }
                        />
                        <div className="flex items-start gap-2 mt-2">
                          <svg className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs text-neutral-600 leading-relaxed">
                            <span className="font-semibold text-neutral-800">{t.generate.editTip}</span> {t.generate.editTipDesc}
                            {' '}<span className="font-semibold">{t.generate.editTipColors}</span>, <span className="font-semibold">{t.generate.editTipElements}</span>,
                            <span className="font-semibold">{t.generate.editTipStyle}</span>.
                          </p>
                        </div>
                      </div>

                      {/* Bouton d'édition */}
                      <button
                        onClick={async () => {
                          // Vérifier les limites d'édition freemium
                          if (editLimit.requiredAction === 'email') {
                            setShowEditEmailGate(true);
                            return;
                          }
                          if (editLimit.requiredAction === 'signup') {
                            setShowEditSignupGate(true);
                            return;
                          }
                          if (editLimit.requiredAction === 'premium') {
                            setShowSubscriptionModal(true);
                            return;
                          }

                          // Utiliser l'image propre (sans texte overlay) pour I2I
                          const cleanImageForEdit = baseOriginalImageUrl || selectedEditVersion;
                          if (!editPrompt.trim() || !cleanImageForEdit) {
                            return;
                          }
                          setEditingImage(true);
                          try {
                            console.log('[Edit Studio] Editing image with SeedEdit I2I');
                            console.log('[Edit Studio] Image URL:', cleanImageForEdit?.substring(0, 100));
                            console.log('[Edit Studio] Prompt:', editPrompt);

                            // Si l'image est un data URL (base64), compresser puis uploader
                            let imageForApi = cleanImageForEdit;
                            if (imageForApi.startsWith('data:')) {
                              console.log('[Edit Studio] Compressing & uploading base64 image...');
                              try {
                                // Compresser l'image avant upload (max 1536px, JPEG 85%)
                                const compressed = await new Promise<string>((resolve, reject) => {
                                  const img = new window.Image();
                                  img.onload = () => {
                                    const canvas = document.createElement('canvas');
                                    let w = img.width, h = img.height;
                                    const MAX = 1536;
                                    if (w > MAX || h > MAX) {
                                      const ratio = Math.min(MAX / w, MAX / h);
                                      w = Math.round(w * ratio);
                                      h = Math.round(h * ratio);
                                    }
                                    canvas.width = w;
                                    canvas.height = h;
                                    const ctx = canvas.getContext('2d');
                                    if (!ctx) { reject(new Error('Canvas context')); return; }
                                    ctx.drawImage(img, 0, 0, w, h);
                                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                                  };
                                  img.onerror = () => reject(new Error('Image load failed'));
                                  img.src = imageForApi;
                                });
                                imageForApi = compressed;
                                console.log('[Edit Studio] Image compressed to JPEG');

                                const sb = supabaseBrowser();
                                const { data: { user: currentUser } } = await sb.auth.getUser();
                                if (!currentUser) throw new Error(t.generate.errorNotAuthenticated);
                                const base64Data = imageForApi.split(',')[1];
                                const byteChars = atob(base64Data);
                                const byteArray = new Uint8Array(byteChars.length);
                                for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
                                const blob = new Blob([byteArray], { type: 'image/jpeg' });
                                const fname = `${currentUser.id}/edit_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                                const { error: upErr } = await sb.storage.from('generated-images').upload(fname, blob, { contentType: 'image/jpeg', upsert: false });
                                if (upErr) throw new Error(`${t.generate.errorUploadFailedPrefix} ${upErr.message}`);
                                const { data: { publicUrl } } = sb.storage.from('generated-images').getPublicUrl(fname);
                                imageForApi = publicUrl;
                                console.log('[Edit Studio] Uploaded, public URL:', publicUrl);
                              } catch (uploadErr: any) {
                                console.error('[Edit Studio] Upload error:', uploadErr);
                                throw new Error(t.generate.errorUploadFailed);
                              }
                            }

                            // Appeler l'API Seedream 4.5 i2i
                            const res = await fetch('/api/seedream/i2i', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                prompt: editPrompt,
                                imageUrl: imageForApi,
                                guidance_scale: editStrength,
                              }),
                            });

                            if (!res.ok) {
                              if (res.status === 413) throw new Error(t.generate.errorImageTooLarge);
                              if (res.status === 504) throw new Error('Le serveur a mis trop de temps. Veuillez réessayer.');
                              // Tenter de parser le JSON, sinon erreur générique
                              let errText;
                              try { errText = (await res.json())?.error; } catch { errText = `Erreur ${res.status}`; }
                              throw new Error(errText || t.generate.errorEditFailed);
                            }
                            const data = await res.json();
                            console.log('[Edit Studio] Response:', data);

                            if (!data?.ok) {
                              console.error('[Edit Studio] API Error:', data?.error);
                              throw new Error(data?.error || t.generate.errorEditFailed);
                            }

                            // Capturer le provider pour la pastille
                            if (data._p) setLastProvider(data._p);

                            let newVersion = data.imageUrl;

                            // Convertir en data URL pour compatibilité Canvas (overlays texte)
                            try {
                              const convertRes = await fetch('/api/convert-image', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ imageUrl: newVersion }),
                              });
                              const convertData = await convertRes.json();
                              if (convertData.ok && convertData.dataUrl) {
                                newVersion = convertData.dataUrl;
                                console.log('[EditStudio] ✅ Converted to data URL for Canvas');
                              }
                            } catch (e) {
                              console.warn('[EditStudio] Convert to data URL failed, using remote URL:', e);
                            }

                            // Mettre à jour la base propre (sans overlay)
                            setOriginalImageUrl(newVersion);
                            setBaseOriginalImageUrl(newVersion);
                            setEditVersions([...editVersions, newVersion]);
                            setSelectedEditVersion(newVersion);

                            // Générer immédiatement la preview avec overlays pour la nouvelle version
                            if (textOverlayItems.length > 0) {
                              try {
                                const previewWithText = await renderOverlaysOnImage(newVersion, textOverlayItems);
                                setTextPreviewUrl(previewWithText);
                                setVersionPreviews(prev => ({ ...prev, [newVersion]: previewWithText }));
                              } catch (e) { console.warn('[EditStudio] Preview overlay failed:', e); }
                            }

                            setEditPrompt('');
                            setActiveTab('image');

                            // Incrémenter le compteur d'éditions après succès
                            editLimit.incrementCount();

                            // Auto-sauvegarder dans la galerie
                            autoSaveEditedVersion(newVersion);
                          } catch (e: any) {
                            console.error('[Edit Studio] Error:', e);
                            alert(t.generate.alertEditFailed);
                          } finally {
                            setEditingImage(false);
                          }
                        }}
                        disabled={editingImage || !editPrompt.trim() || !selectedEditVersion}
                        className="w-full py-4 text-base bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] transition-colors"
                      >
                        {editingImage ? t.generate.editingInProgress : `✏️ ${t.generate.editImage}`}
                      </button>
                    </div>

                    {/* Exemples de modifications */}
                    <div className="bg-neutral-50 rounded-lg border p-4">
                      <p className="text-sm font-medium mb-3">💡 {t.generate.editExamples}</p>
                      <div className="space-y-2">
                        {[
                          t.generate.editExample1,
                          t.generate.editExample2,
                          t.generate.editExample3,
                          t.generate.editExample4,
                          t.generate.editExample5,
                          t.generate.editExample6
                        ].map((example) => (
                          <button
                            key={example}
                            onClick={() => setEditPrompt(example)}
                            className="w-full text-left text-sm px-4 py-3 bg-white rounded-lg hover:bg-purple-50 border min-h-[44px] transition-colors"
                          >
                            • {example}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Onglet Texte - Personnalisation du texte overlay */}
                {activeTab === 'text' && (
                  <div className="p-4 space-y-4">
                    {/* Preview en temps réel */}
                    <div className="bg-white rounded-lg border p-3">
                      <h3 className="text-xs font-semibold mb-2 text-neutral-700">👁️ {t.generate.realtimePreview}</h3>
                      <div className="relative aspect-square bg-neutral-100 rounded overflow-hidden">
                        {isGeneratingPreview && (
                          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                            <div className="text-xs text-neutral-600">{t.generate.generatingPreview}</div>
                          </div>
                        )}
                        <img
                          src={textPreviewUrl || selectedEditVersion || generatedImageUrl || ''}
                          alt="Preview"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>

                    <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
                      <h3 className="text-base font-semibold mb-3">✨ {t.generate.textCustomization}</h3>

                      {/* Texte */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">{t.generate.textLabel}</label>
                        <textarea
                          value={overlayText}
                          onChange={(e) => setOverlayText(e.target.value)}
                          placeholder={t.generate.writeCatchyText}
                          rows={3}
                          className="w-full px-4 py-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 resize-none"
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                          {overlayText.length} {t.generate.characters} • {t.generate.maxRecommended}
                        </p>
                      </div>

                      {/* Templates */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">{t.generate.templates}</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'headline', icon: '📰', name: t.generate.templateHeadline },
                            { id: 'cta', icon: '🎯', name: t.generate.templateCTA },
                            { id: 'minimal', icon: '✨', name: t.generate.templateMinimal },
                            { id: 'bold', icon: '💪', name: t.generate.templateBold },
                            { id: 'elegant', icon: '👔', name: t.generate.templateElegant },
                            { id: 'modern', icon: '🚀', name: t.generate.templateModern },
                          ].map((template) => (
                            <button
                              key={template.id}
                              onClick={() => {
                                setTextTemplate(template.id as any);
                                // Appliquer les couleurs du template
                                if (template.id === 'headline') {
                                  setTextColor('#ffffff');
                                  setTextBackgroundColor('rgba(0, 0, 0, 0.5)');
                                  setBackgroundStyle('transparent');
                                  setTextPosition(25);
                                } else if (template.id === 'cta') {
                                  setTextColor('#ffffff');
                                  setTextBackgroundColor('#3b82f6');
                                  setBackgroundStyle('solid');
                                  setTextPosition(80);
                                } else if (template.id === 'minimal') {
                                  setTextColor('#000000');
                                  setTextBackgroundColor('rgba(255, 255, 255, 0.9)');
                                  setBackgroundStyle('solid');
                                  setTextPosition(50);
                                } else if (template.id === 'bold') {
                                  setTextColor('#ffffff');
                                  setTextBackgroundColor('rgba(220, 38, 38, 0.9)');
                                  setBackgroundStyle('solid');
                                  setTextPosition(50);
                                } else if (template.id === 'elegant') {
                                  setTextColor('#1f2937');
                                  setTextBackgroundColor('rgba(255, 255, 255, 0.95)');
                                  setBackgroundStyle('blur');
                                  setTextPosition(50);
                                } else if (template.id === 'modern') {
                                  setTextColor('#ffffff');
                                  setTextBackgroundColor('linear-gradient(135deg, #3b82f6, #06b6d4)');
                                  setBackgroundStyle('gradient');
                                  setTextPosition(80);
                                }
                              }}
                              className={`p-3 rounded-lg border-2 text-center transition-all ${
                                textTemplate === template.id
                                  ? 'border-purple-500 bg-purple-50'
                                  : 'border-neutral-200 hover:border-neutral-300'
                              }`}
                            >
                              <div className="text-2xl mb-1">{template.icon}</div>
                              <div className="text-xs font-semibold text-neutral-900">{template.name}</div>
                              <div className="text-[10px] text-neutral-500 mt-0.5 leading-tight">
                                {template.id === 'headline' && t.generate.templateHeadlineDesc}
                                {template.id === 'cta' && t.generate.templateCTADesc}
                                {template.id === 'minimal' && t.generate.templateMinimalDesc}
                                {template.id === 'bold' && t.generate.templateBoldDesc}
                                {template.id === 'elegant' && t.generate.templateElegantDesc}
                                {template.id === 'modern' && t.generate.templateModernDesc}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Position */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">{t.generate.position} <span className="text-neutral-400 font-normal">({textPosition}%)</span></label>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setTextPosition(Math.max(8, textPosition - 10))}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all"
                          >
                            <span>⬆️</span> {t.generate.topPlus}
                          </button>
                          <div className="flex-1 flex items-center gap-2 justify-center">
                            <button
                              onClick={() => setTextPosition(25)}
                              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${textPosition <= 30 ? 'bg-purple-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                            >{t.generate.top}</button>
                            <button
                              onClick={() => setTextPosition(50)}
                              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${textPosition > 30 && textPosition < 70 ? 'bg-purple-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                            >{t.generate.center}</button>
                            <button
                              onClick={() => setTextPosition(75)}
                              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${textPosition >= 70 ? 'bg-purple-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                            >{t.generate.bottom}</button>
                          </div>
                          <button
                            onClick={() => setTextPosition(Math.min(92, textPosition + 10))}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all"
                          >
                            <span>⬇️</span> {t.generate.bottomPlus}
                          </button>
                        </div>
                      </div>

                      {/* Couleurs */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">{t.generate.textColor}</label>
                          <input
                            type="color"
                            value={textColor}
                            onChange={(e) => setTextColor(e.target.value)}
                            className="w-full h-10 rounded-lg border border-neutral-300 cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">{t.generate.backgroundColor}</label>
                          <input
                            type="color"
                            value={textBackgroundColor.startsWith('rgba') || textBackgroundColor.startsWith('linear') ? '#3b82f6' : textBackgroundColor}
                            onChange={(e) => setTextBackgroundColor(e.target.value)}
                            className="w-full h-10 rounded-lg border border-neutral-300 cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Taille police */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">
                          {t.generate.fontSizeLabel} ({fontSize}pt)
                        </label>
                        <input
                          type="range"
                          min="24"
                          max="120"
                          value={fontSize}
                          onChange={(e) => setFontSize(parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>

                      {/* Police */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">{t.generate.fontLabel}</label>
                        <select
                          value={fontFamily}
                          onChange={(e) => setFontFamily(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm"
                        >
                          <option value="inter">🔤 {t.generate.fontInter}</option>
                          <option value="montserrat">💪 {t.generate.fontMontserrat}</option>
                          <option value="bebas">📰 {t.generate.fontBebas}</option>
                          <option value="roboto">⚙️ {t.generate.fontRoboto}</option>
                          <option value="playfair">✨ {t.generate.fontPlayfair}</option>
                        </select>
                      </div>

                      {/* Style de fond */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">{t.generate.bgStyleLabel}</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: 'clean', emoji: '🔲', label: t.generate.bgNone },
                            { value: 'none', emoji: '🅰', label: t.generate.bgStrongOutline },
                            { value: 'minimal', emoji: '✦', label: t.generate.bgSubtle },
                            { value: 'transparent', emoji: '👻', label: t.generate.bgTransparent },
                            { value: 'solid', emoji: '⬛', label: t.generate.bgSolid },
                            { value: 'gradient', emoji: '🌈', label: t.generate.bgGradient },
                            { value: 'blur', emoji: '💨', label: t.generate.bgBlur },
                            { value: 'outline', emoji: '⭕', label: t.generate.bgOutline },
                            { value: 'glow', emoji: '💫', label: t.generate.bgGlow }
                          ].map((style) => (
                            <button
                              key={style.value}
                              onClick={() => setBackgroundStyle(style.value as any)}
                              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                                backgroundStyle === style.value
                                  ? 'bg-purple-500 text-white'
                                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                              }`}
                            >
                              <span className="text-base">{style.emoji}</span>
                              <span>{style.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Bouton Appliquer / Ajouter */}
                      <button
                        onClick={() => {
                          if (!overlayText.trim()) return;
                          const newItem: GenerateTextOverlay = {
                            id: editingOverlayId || `overlay-${Date.now()}`,
                            text: overlayText,
                            position: textPosition,
                            fontSize,
                            fontFamily,
                            textColor,
                            backgroundColor: textBackgroundColor,
                            backgroundStyle,
                          };
                          if (editingOverlayId) {
                            // Mettre à jour l'overlay existant — garder le formulaire actif pour modifications rapides
                            setTextOverlayItems(prev => prev.map(item => item.id === editingOverlayId ? newItem : item));
                          } else {
                            // Ajouter comme nouvel overlay et passer en mode édition
                            setTextOverlayItems(prev => [...prev, newItem]);
                            setEditingOverlayId(newItem.id);
                          }
                        }}
                        disabled={!overlayText.trim()}
                        className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {editingOverlayId ? `✓ ${t.generate.modifyText}` : textOverlayItems.length > 0 ? `+ ${t.generate.addText}` : `✓ ${t.generate.applyText}`}
                      </button>

                      {/* Bouton Nouveau texte — visible quand on est en mode édition */}
                      {editingOverlayId && (
                        <button
                          onClick={() => {
                            // D'abord auto-sauvegarder les modifications en cours
                            if (overlayText.trim()) {
                              const updated: GenerateTextOverlay = {
                                id: editingOverlayId,
                                text: overlayText.trim(),
                                position: textPosition,
                                fontSize,
                                fontFamily,
                                textColor,
                                backgroundColor: textBackgroundColor,
                                backgroundStyle,
                              };
                              setTextOverlayItems(prev => prev.map(item => item.id === editingOverlayId ? updated : item));
                            }
                            skipAutoEditRef.current = true;
                            setEditingOverlayId(null);
                            setOverlayText('');
                            setTextPosition(25);
                          }}
                          className="w-full py-2.5 mt-1 border border-purple-300 text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-50 transition"
                        >
                          {t.generate.newText}
                        </button>
                      )}

                      {/* Liste des textes appliqués */}
                      {textOverlayItems.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-semibold text-neutral-700">{t.generate.appliedTexts}</p>
                          {textOverlayItems.map((item) => (
                            <div key={item.id} className={`flex items-center gap-2 p-2 rounded-lg border ${editingOverlayId === item.id ? 'border-purple-400 bg-purple-50' : 'border-neutral-200 bg-white'}`}>
                              <span className="text-[10px] text-neutral-400">{item.position <= 30 ? '⬆️' : item.position >= 70 ? '⬇️' : '⏺️'}</span>
                              <span className="flex-1 text-xs text-neutral-700 truncate">{item.text}</span>
                              <button
                                onClick={() => {
                                  setOverlayText(item.text);
                                  setTextPosition(item.position);
                                  setFontSize(item.fontSize);
                                  setFontFamily(item.fontFamily as any);
                                  setTextColor(item.textColor);
                                  setTextBackgroundColor(item.backgroundColor);
                                  setBackgroundStyle(item.backgroundStyle as any);
                                  setEditingOverlayId(item.id);
                                }}
                                className="px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50 rounded"
                              >
                                {t.generate.modify}
                              </button>
                              <button
                                onClick={() => {
                                  setTextOverlayItems(prev => prev.filter(i => i.id !== item.id));
                                  if (editingOverlayId === item.id) {
                                    skipAutoEditRef.current = true;
                                    setEditingOverlayId(null);
                                    setOverlayText('');
                                  }
                                }}
                                className="px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50 rounded"
                              >
                                X
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => {
                              setTextOverlayItems([]);
                              skipAutoEditRef.current = true;
                              setEditingOverlayId(null);
                              setOverlayText('');
                            }}
                            className="w-full py-2 mt-1 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition"
                          >
                            {t.generate.deleteAllText}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Onglet Versions */}
                {activeTab === 'versions' && (
                  <div className="p-4">
                    <h3 className="text-base font-semibold mb-3">
                      {t.generate.versionsTab} ({editVersions.length})
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {editVersions.map((version, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg border-2 overflow-hidden ${
                            selectedEditVersion === version
                              ? 'border-purple-500 ring-2 ring-purple-200'
                              : 'border-neutral-200'
                          }`}
                        >
                          <img
                            src={versionPreviews[version] || version}
                            alt={`Version ${idx + 1}`}
                            onClick={() => {
                              setSelectedEditVersion(version);
                              setActiveTab('image');
                            }}
                            className="w-full aspect-square object-cover cursor-pointer hover:opacity-90"
                          />
                          <div className="p-3 bg-gradient-to-br from-neutral-50 to-neutral-100">
                            <div className="text-sm text-center mb-2 font-semibold text-neutral-700">
                              Version {idx + 1}
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const supabaseClient = supabaseBrowser();
                                    const { data: { user } } = await supabaseClient.auth.getUser();

                                    if (!user) {
                                      alert(t.generate.alertLoginRequired);
                                      return;
                                    }

                                    // Appliquer les overlays texte sur la version avant sauvegarde
                                    let imageWithOverlays = version;
                                    if (textOverlayItems.length > 0) {
                                      for (const item of textOverlayItems) {
                                        imageWithOverlays = await addTextOverlay(imageWithOverlays, {
                                          text: item.text, position: item.position, fontSize: item.fontSize,
                                          fontFamily: item.fontFamily, textColor: item.textColor,
                                          backgroundColor: item.backgroundColor, backgroundStyle: item.backgroundStyle,
                                        });
                                      }
                                    }

                                    // Upload vers Supabase Storage si data URL
                                    let finalImageUrl = imageWithOverlays;
                                    if (imageWithOverlays.startsWith('data:')) {
                                      console.log('[EditStudio/Mobile] Data URL detected, uploading to Storage...');
                                      const response = await fetch(imageWithOverlays);
                                      const blob = await response.blob();
                                      const fileName = `${user.id}/${Date.now()}_v${idx + 1}_${Math.random().toString(36).substring(7)}.png`;

                                      const { error: uploadError } = await supabaseClient.storage
                                        .from('generated-images')
                                        .upload(fileName, blob, {
                                          contentType: 'image/png',
                                          cacheControl: '3600',
                                          upsert: false
                                        });

                                      if (uploadError) {
                                        console.error('[EditStudio/Mobile] Upload error:', uploadError);
                                        alert(`${t.generate.alertUploadError} ${uploadError.message}`);
                                        return;
                                      }

                                      const { data: { publicUrl } } = supabaseClient.storage
                                        .from('generated-images')
                                        .getPublicUrl(fileName);

                                      finalImageUrl = publicUrl;
                                      console.log('[EditStudio/Mobile] Uploaded successfully:', publicUrl);
                                    }

                                    // Récupérer le token d'authentification
                                    const { data: { session } } = await supabaseClient.auth.getSession();
                                    const headers: HeadersInit = {
                                      'Content-Type': 'application/json'
                                    };
                                    if (session?.access_token) {
                                      headers['Authorization'] = `Bearer ${session.access_token}`;
                                    }

                                    // PAYLOAD avec URL courte
                                    const payload = {
                                      imageUrl: finalImageUrl,
                                      title: `Image V${idx + 1}`,
                                      newsTitle: selectedNews?.title ? selectedNews.title.substring(0, 50) : null,
                                      newsCategory: selectedNews?.category ? selectedNews.category.substring(0, 20) : null,
                                      newsDescription: null,
                                      newsSource: null,
                                      businessType: null,
                                      businessDescription: null,
                                      textOverlay: textOverlayItems.length > 0 ? JSON.stringify(textOverlayItems.filter(i => i.text.trim()).map(i => ({ text: i.text, position: i.position, fontSize: i.fontSize, fontFamily: i.fontFamily, textColor: i.textColor, bgColor: i.backgroundColor, bgStyle: i.backgroundStyle }))) : null,
                                      visualStyle: null,
                                      tone: null,
                                      generationPrompt: null,
                                      thumbnailUrl: null,
                                      folderId: null,
                                      aiModel: 'seedream',
                                      tags: []
                                    };

                                    const response = await fetch('/api/library/save', {
                                      method: 'POST',
                                      headers,
                                      body: JSON.stringify(payload)
                                    });

                                    const data = await response.json();
                                    if (data.ok) {
                                      const toast = document.createElement('div');
                                      toast.style.cssText = 'position:fixed;top:1rem;right:1rem;background:#16a34a;color:white;padding:0.75rem 1.5rem;border-radius:0.5rem;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);z-index:50;transition:opacity 0.5s ease;opacity:1;';
                                      toast.innerHTML = t.generate.alertSavedToGallery;
                                      document.body.appendChild(toast);
                                      setTimeout(() => { toast.style.opacity = '0'; }, 300);
                                      setTimeout(() => { toast.remove(); router.push('/library'); }, 500);
                                    } else {
                                      alert(`${t.generate.alertError} ${data.error || t.generate.alertCannotSave}`);
                                    }
                                  } catch (error: any) {
                                    console.error('Error saving to library:', error);
                                    alert(`${t.generate.alertError} ${error.message || t.generate.alertCheckConnection}`);
                                  }
                                }}
                                className="py-2 text-sm bg-cyan-600 text-white rounded-lg font-medium min-h-[44px] hover:bg-cyan-700 transition-colors"
                              >
                                💾 {t.generate.gallery}
                              </button>
                              <div className="flex gap-2">
                                <a
                                  href={version}
                                  download={`keiro-v${idx + 1}.png`}
                                  className="flex-1 py-2 text-sm bg-blue-600 text-white text-center rounded-lg font-medium min-h-[44px] hover:bg-blue-700 transition-colors flex items-center justify-center"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {t.generate.downloadLabel}
                                </a>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(t.generate.deleteVersion)) {
                                      const newVersions = editVersions.filter((_, i) => i !== idx);
                                      setEditVersions(newVersions);
                                      if (selectedEditVersion === version && newVersions.length > 0) {
                                        setSelectedEditVersion(newVersions[newVersions.length - 1]);
                                      } else if (newVersions.length === 0) {
                                        setSelectedEditVersion(null);
                                      }
                                    }
                                  }}
                                  className="flex-1 py-2 text-sm bg-neutral-200 text-neutral-700 rounded-lg font-medium min-h-[44px] hover:bg-neutral-300 transition-colors"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* DESKTOP : Layout 3 colonnes (≥ lg) */}
              <div className="hidden lg:flex flex-1 overflow-hidden p-6 gap-6">
                {/* Gauche : Sidebar Versions */}
                <div className="w-64 flex-shrink-0 overflow-y-auto space-y-3">
                  <h3 className="text-sm font-semibold mb-3">{t.generate.versionsTab} ({editVersions.length})</h3>
                  {editVersions.map((version, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg border-2 overflow-hidden transition-all cursor-pointer ${
                        selectedEditVersion === version
                          ? 'border-purple-500 ring-2 ring-purple-200'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                      onClick={() => setSelectedEditVersion(version)}
                    >
                      <img
                        src={versionPreviews[version] || version}
                        alt={`Version ${idx + 1}`}
                        className="w-full aspect-square object-cover"
                      />
                      <div className="p-2 bg-gradient-to-br from-neutral-50 to-neutral-100">
                        <div className="text-xs text-center mb-2 font-semibold text-neutral-700">
                          V{idx + 1}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const supabaseClient = supabaseBrowser();
                                const { data: { user } } = await supabaseClient.auth.getUser();

                                if (!user) {
                                  alert(t.generate.alertLoginRequired);
                                  return;
                                }

                                // Appliquer les overlays texte sur la version avant sauvegarde
                                let imageWithOverlays = version;
                                if (textOverlayItems.length > 0) {
                                  for (const item of textOverlayItems) {
                                    imageWithOverlays = await addTextOverlay(imageWithOverlays, {
                                      text: item.text, position: item.position, fontSize: item.fontSize,
                                      fontFamily: item.fontFamily, textColor: item.textColor,
                                      backgroundColor: item.backgroundColor, backgroundStyle: item.backgroundStyle,
                                    });
                                  }
                                }

                                // Upload vers Supabase Storage si data URL
                                let finalImageUrl = imageWithOverlays;
                                if (imageWithOverlays.startsWith('data:')) {
                                  console.log('[EditStudio/Desktop] Data URL detected, uploading to Storage...');
                                  const response = await fetch(imageWithOverlays);
                                  const blob = await response.blob();
                                  const fileName = `${user.id}/${Date.now()}_v${idx + 1}_${Math.random().toString(36).substring(7)}.png`;

                                  const { error: uploadError } = await supabaseClient.storage
                                    .from('generated-images')
                                    .upload(fileName, blob, {
                                      contentType: 'image/png',
                                      cacheControl: '3600',
                                      upsert: false
                                    });

                                  if (uploadError) {
                                    console.error('[EditStudio/Desktop] Upload error:', uploadError);
                                    alert(`${t.generate.alertUploadError} ${uploadError.message}`);
                                    return;
                                  }

                                  const { data: { publicUrl } } = supabaseClient.storage
                                    .from('generated-images')
                                    .getPublicUrl(fileName);

                                  finalImageUrl = publicUrl;
                                  console.log('[EditStudio/Desktop] Uploaded successfully:', publicUrl);
                                }

                                // Récupérer le token d'authentification
                                const { data: { session } } = await supabaseClient.auth.getSession();
                                const headers: HeadersInit = {
                                  'Content-Type': 'application/json'
                                };
                                if (session?.access_token) {
                                  headers['Authorization'] = `Bearer ${session.access_token}`;
                                }

                                // PAYLOAD avec URL courte
                                const payload = {
                                  imageUrl: finalImageUrl,
                                  title: `Image V${idx + 1}`,
                                  newsTitle: selectedNews?.title ? selectedNews.title.substring(0, 50) : null,
                                  newsCategory: selectedNews?.category ? selectedNews.category.substring(0, 20) : null,
                                  newsDescription: null,
                                  newsSource: null,
                                  businessType: null,
                                  businessDescription: null,
                                  textOverlay: null,
                                  visualStyle: null,
                                  tone: null,
                                  generationPrompt: null,
                                  thumbnailUrl: null,
                                  folderId: null,
                                  aiModel: 'seedream',
                                  tags: []
                                };

                                const response = await fetch('/api/library/save', {
                                  method: 'POST',
                                  headers,
                                  body: JSON.stringify(payload)
                                });

                                const data = await response.json();
                                if (data.ok) {
                                  const toast = document.createElement('div');
                                  toast.style.cssText = 'position:fixed;top:1rem;right:1rem;background:#16a34a;color:white;padding:0.75rem 1.5rem;border-radius:0.5rem;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);z-index:50;transition:opacity 0.5s ease;opacity:1;';
                                  toast.innerHTML = t.generate.alertSavedToGallery;
                                  document.body.appendChild(toast);
                                  setTimeout(() => { toast.style.opacity = '0'; }, 300);
                                  setTimeout(() => { toast.remove(); router.push('/library'); }, 500);
                                } else {
                                  alert(`${t.generate.alertError} ${data.error || t.generate.alertCannotSave}`);
                                }
                              } catch (error: any) {
                                console.error('Error saving to library:', error);
                                alert(`${t.generate.alertError} ${error.message || t.generate.alertCheckConnection}`);
                              }
                            }}
                            className="py-1 text-[10px] bg-cyan-600 text-white rounded hover:bg-cyan-700 font-medium transition-colors"
                          >
                            💾 {t.generate.gallery}
                          </button>
                          <div className="flex gap-1.5">
                            <a
                              href={version}
                              download={`keiro-v${idx + 1}.png`}
                              className="flex-1 py-1 text-[10px] bg-blue-600 text-white text-center rounded hover:bg-blue-700 font-medium transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              ⬇️
                            </a>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(t.generate.deleteVersion)) {
                                  const newVersions = editVersions.filter((_, i) => i !== idx);
                                  setEditVersions(newVersions);
                                  if (selectedEditVersion === version && newVersions.length > 0) {
                                    setSelectedEditVersion(newVersions[newVersions.length - 1]);
                                  } else if (newVersions.length === 0) {
                                    setSelectedEditVersion(null);
                                  }
                                }
                              }}
                              className="flex-1 py-1 text-[10px] bg-neutral-200 text-neutral-700 rounded hover:bg-neutral-300 font-medium transition-colors"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Centre : Image display */}
                <div className="flex-1 flex items-center justify-center bg-neutral-50 rounded-lg border overflow-hidden relative">
                  {isGeneratingPreview && (
                    <div className="absolute top-2 right-2 bg-white/90 px-3 py-1 rounded-lg text-xs font-medium text-neutral-700 shadow-md z-10">
                      {t.generate.generatingPreviewText}
                    </div>
                  )}
                  {textPreviewUrl ? (
                    <img
                      src={textPreviewUrl}
                      alt={t.generate.altPreviewWithText}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : selectedEditVersion ? (
                    <img
                      src={(textOverlayItems.length > 0 && versionPreviews[selectedEditVersion]) || selectedEditVersion}
                      alt={t.generate.altSelectedImage}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : generatedImageUrl ? (
                    <img
                      src={generatedImageUrl}
                      alt={t.generate.altGeneratedImage}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <p className="text-neutral-400 text-sm">{t.generate.noImage}</p>
                  )}
                </div>

                {/* Droite : Edit Panel */}
                <div className="w-96 flex-shrink-0 flex flex-col space-y-3 overflow-y-auto">
                  {/* Onglets desktop */}
                  <div className="flex gap-2 bg-white rounded-lg p-1 border">
                    <button
                      onClick={() => {
                        setActiveTab('edit');
                        // Initialiser selectedEditVersion si ce n'est pas déjà fait
                        if (!selectedEditVersion && generatedImageUrl) {
                          setEditVersions([generatedImageUrl]);
                          setSelectedEditVersion(generatedImageUrl);
                        }
                      }}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                        activeTab === 'edit'
                          ? 'bg-blue-500 text-white'
                          : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      {t.generate.desktopTabEdit}
                    </button>
                    <button
                      onClick={() => setActiveTab('text')}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                        activeTab === 'text'
                          ? 'bg-purple-500 text-white'
                          : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      {t.generate.desktopTabText}
                    </button>
                  </div>

                  {/* Contenu de l'onglet Éditer */}
                  {activeTab === 'edit' && (
                  <>
                  <div className="bg-purple-50 rounded-lg border border-purple-200 p-3">
                    <h3 className="text-base font-semibold mb-2">{t.generate.editAssistant}</h3>

                    {/* Logo (optionnel) */}
                    <div className="mb-3">
                      <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                        🎨 {t.generate.logoOptional}
                      </label>
                      {!logoUrl ? (
                        <div className="border-2 border-dashed border-purple-300 rounded-lg p-3 text-center">
                          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-[10px] font-medium">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    setLogoUrl(ev.target?.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="hidden"
                            />
                            📤 {t.generate.addLogo}
                          </label>
                          <p className="text-[9px] text-neutral-600 mt-1.5">{t.generate.optionalBrandingShort}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-purple-200">
                          <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded border" />
                          <div className="flex-1">
                            <p className="text-[10px] font-medium text-neutral-700">{t.generate.logoAdded}</p>
                            <p className="text-[9px] text-neutral-500">{t.generate.inOverlay}</p>
                          </div>
                          <button
                            onClick={() => setLogoUrl('')}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}

                      {/* Position du logo (si logo uploadé) */}
                      {logoUrl && (
                        <div className="mt-2 p-2 bg-white rounded-lg border border-neutral-200">
                          <label className="block text-[10px] font-semibold text-neutral-800 mb-1.5">{t.generate.logoPosition}</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {([
                              { pos: 'top-left', label: `↖️ ${t.generate.topLeft}` },
                              { pos: 'top-right', label: `↗️ ${t.generate.topRight}` },
                              { pos: 'bottom-left', label: `↙️ ${t.generate.bottomLeft}` },
                              { pos: 'bottom-right', label: `↘️ ${t.generate.bottomRight}` }
                            ] as const).map(({ pos, label }) => (
                              <button
                                key={pos}
                                onClick={() => setLogoPosition(pos)}
                                className={`px-2 py-1.5 rounded text-[9px] font-medium transition-all ${
                                  logoPosition === pos
                                    ? 'bg-purple-500 text-white ring-1 ring-purple-300'
                                    : 'bg-neutral-100 text-neutral-700'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Slider force de modification */}
                    <div className="mb-3">
                      <p className="text-xs font-medium mb-1.5">
                        {t.generate.editStrengthShort} <span className="text-purple-600 font-bold">
                          {editStrength <= 5 ? t.generate.strengthSubtle : editStrength <= 7 ? t.generate.strengthModerate : t.generate.strengthStrong}
                        </span>
                      </p>
                      <input
                        type="range"
                        min={3}
                        max={10}
                        step={0.5}
                        value={editStrength}
                        onChange={(e) => setEditStrength(Number(e.target.value))}
                        className="w-full accent-purple-600"
                      />
                      <div className="flex justify-between text-[9px] text-neutral-400 mt-0.5">
                        <span>{t.generate.strengthSubtle}</span>
                        <span>{t.generate.strengthModerate}</span>
                        <span>{t.generate.strengthStrong}</span>
                      </div>
                    </div>

                    {/* Prompt de modification */}
                    <div className="mb-3">
                      <label className="block text-xs font-semibold text-neutral-800 mb-1">
                        ✏️ {t.generate.describeModifications}
                      </label>
                      <textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder={
                          editStrength <= 5
                            ? t.generate.editPlaceholderSubtleShort
                            : editStrength <= 7
                            ? t.generate.editPlaceholderModerateShort
                            : t.generate.editPlaceholderStrongShort
                        }
                        rows={4}
                        className="w-full text-xs rounded border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <svg className="w-3 h-3 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-[9px] text-neutral-600 leading-relaxed">
                          <span className="font-semibold text-neutral-800">{t.generate.editTip}</span> {t.generate.editTipShort}
                        </p>
                      </div>
                    </div>

                    {/* Bouton d'édition */}
                    <button
                      onClick={async () => {
                        // Vérifier les limites d'édition freemium
                        if (editLimit.requiredAction === 'email') {
                          setShowEditEmailGate(true);
                          return;
                        }
                        if (editLimit.requiredAction === 'signup') {
                          setShowEditSignupGate(true);
                          return;
                        }
                        if (editLimit.requiredAction === 'premium') {
                          setShowSubscriptionModal(true);
                          return;
                        }

                        // Utiliser l'image propre (sans texte overlay) pour I2I
                        const cleanImageForEdit = baseOriginalImageUrl || selectedEditVersion;
                        if (!editPrompt.trim() || !cleanImageForEdit) {
                          return;
                        }
                        setEditingImage(true);
                        try {
                          console.log('[Edit Studio] Editing image with SeedEdit I2I');
                          console.log('[Edit Studio] Image URL:', cleanImageForEdit?.substring(0, 100));
                          console.log('[Edit Studio] Prompt:', editPrompt);

                          // Si l'image est un data URL (base64), compresser puis uploader
                          let imageForApi = cleanImageForEdit;
                          if (imageForApi.startsWith('data:')) {
                            console.log('[Edit Studio] Compressing & uploading base64 image...');
                            try {
                              // Compresser l'image avant upload (max 1536px, JPEG 85%)
                              const compressed = await new Promise<string>((resolve, reject) => {
                                const img = new window.Image();
                                img.onload = () => {
                                  const canvas = document.createElement('canvas');
                                  let w = img.width, h = img.height;
                                  const MAX = 1536;
                                  if (w > MAX || h > MAX) {
                                    const ratio = Math.min(MAX / w, MAX / h);
                                    w = Math.round(w * ratio);
                                    h = Math.round(h * ratio);
                                  }
                                  canvas.width = w;
                                  canvas.height = h;
                                  const ctx = canvas.getContext('2d');
                                  if (!ctx) { reject(new Error('Canvas context')); return; }
                                  ctx.drawImage(img, 0, 0, w, h);
                                  resolve(canvas.toDataURL('image/jpeg', 0.85));
                                };
                                img.onerror = () => reject(new Error('Image load failed'));
                                img.src = imageForApi;
                              });
                              imageForApi = compressed;
                              console.log('[Edit Studio] Image compressed to JPEG');

                              const sb = supabaseBrowser();
                              const { data: { user: currentUser } } = await sb.auth.getUser();
                              if (!currentUser) throw new Error(t.generate.errorNotAuthenticated);
                              const base64Data = imageForApi.split(',')[1];
                              const byteChars = atob(base64Data);
                              const byteArray = new Uint8Array(byteChars.length);
                              for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
                              const blob = new Blob([byteArray], { type: 'image/jpeg' });
                              const fname = `${currentUser.id}/edit_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                              const { error: upErr } = await sb.storage.from('generated-images').upload(fname, blob, { contentType: 'image/jpeg', upsert: false });
                              if (upErr) throw new Error(`${t.generate.errorUploadFailedPrefix} ${upErr.message}`);
                              const { data: { publicUrl } } = sb.storage.from('generated-images').getPublicUrl(fname);
                              imageForApi = publicUrl;
                              console.log('[Edit Studio] Uploaded, public URL:', publicUrl);
                            } catch (uploadErr: any) {
                              console.error('[Edit Studio] Upload error:', uploadErr);
                              throw new Error(t.generate.errorUploadFailed);
                            }
                          }

                          // Appeler l'API Seedream 4.5 i2i
                          const res = await fetch('/api/seedream/i2i', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              prompt: editPrompt,
                              imageUrl: imageForApi,
                              guidance_scale: editStrength,
                            }),
                          });

                          if (!res.ok) {
                            if (res.status === 413) throw new Error(t.generate.errorImageTooLarge);
                            if (res.status === 504) throw new Error('Le serveur a mis trop de temps. Veuillez réessayer.');
                            let errText;
                            try { errText = (await res.json())?.error; } catch { errText = `Erreur ${res.status}`; }
                            throw new Error(errText || t.generate.errorEditFailed);
                          }
                          const data = await res.json();
                          console.log('[Edit Studio] Response:', data);

                          if (!data?.ok) {
                            console.error('[Edit Studio] API Error:', data?.error);
                            throw new Error(data?.error || t.generate.errorEditFailed);
                          }

                          // Capturer le provider pour la pastille
                          if (data._p) setLastProvider(data._p);

                          let newVersion = data.imageUrl;

                          // Convertir en data URL pour compatibilité Canvas (overlays texte)
                          try {
                            const convertRes = await fetch('/api/convert-image', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ imageUrl: newVersion }),
                            });
                            const convertData = await convertRes.json();
                            if (convertData.ok && convertData.dataUrl) {
                              newVersion = convertData.dataUrl;
                              console.log('[EditStudio] ✅ Converted to data URL for Canvas');
                            }
                          } catch (e) {
                            console.warn('[EditStudio] Convert to data URL failed, using remote URL:', e);
                          }

                          // Mettre à jour la base propre
                          setOriginalImageUrl(newVersion);
                          setBaseOriginalImageUrl(newVersion);
                          setEditVersions([...editVersions, newVersion]);
                          setSelectedEditVersion(newVersion);

                          // Générer immédiatement la preview avec overlays pour la nouvelle version
                          if (textOverlayItems.length > 0) {
                            try {
                              const previewWithText = await renderOverlaysOnImage(newVersion, textOverlayItems);
                              setTextPreviewUrl(previewWithText);
                              setVersionPreviews(prev => ({ ...prev, [newVersion]: previewWithText }));
                            } catch (e) { console.warn('[EditStudio] Preview overlay failed:', e); }
                          }

                          setEditPrompt('');

                          // Incrémenter le compteur d'éditions après succès
                          editLimit.incrementCount();

                          // Auto-sauvegarder dans la galerie
                          autoSaveEditedVersion(newVersion);
                        } catch (e: any) {
                          console.error('[Edit Studio] Error:', e);
                          alert(t.generate.alertEditFailed);
                        } finally {
                          setEditingImage(false);
                        }
                      }}
                      disabled={editingImage || !editPrompt.trim() || !selectedEditVersion}
                      className="w-full py-2 text-xs bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {editingImage ? t.generate.editingInProgress : `✏️ ${t.generate.edit}`}
                    </button>

                    {/* Actions */}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setShowEditStudio(false)}
                        className="w-full py-1.5 text-xs border rounded hover:bg-neutral-50"
                      >
                        {t.generate.close}
                      </button>
                    </div>
                  </div>

                  {/* Exemples de modifications */}
                  <div className="bg-neutral-50 rounded-lg border p-2">
                    <p className="text-[10px] font-medium mb-1.5">💡 {t.generate.editExamplesShort}</p>
                    <div className="space-y-1">
                      <button
                        onClick={() => setEditPrompt(t.generate.warmFilterPrompt)}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • {t.generate.editExampleWarm}
                      </button>
                      <button
                        onClick={() => setEditPrompt(t.generate.blurBgPrompt)}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • {t.generate.editExampleBlur}
                      </button>
                      <button
                        onClick={() => setEditPrompt(t.generate.contrastPrompt)}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • {t.generate.editExampleContrast}
                      </button>
                      <button
                        onClick={() => setEditPrompt(t.generate.cinematicPrompt)}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • {t.generate.editExampleCinema}
                      </button>
                      <button
                        onClick={() => setEditPrompt(t.generate.vintagePrompt)}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • {t.generate.editExampleVintage}
                      </button>
                    </div>
                  </div>
                  </>
                  )}

                  {/* Contenu de l'onglet Texte */}
                  {activeTab === 'text' && (
                  <div className="bg-purple-50 rounded-lg border border-purple-200 p-3">
                    <h3 className="text-base font-semibold mb-2">✨ {t.generate.textCustomization}</h3>

                    {/* Texte */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1.5">{t.generate.textLabel}</label>
                      <textarea
                        value={overlayText}
                        onChange={(e) => setOverlayText(e.target.value)}
                        placeholder={t.generate.writeCatchyText}
                        rows={2}
                        className="w-full px-2 py-1.5 rounded border border-neutral-300 text-[10px] focus:outline-none focus:border-purple-500 resize-none"
                      />
                      <p className="text-[9px] text-neutral-500 mt-1">
                        {overlayText.length} {t.generate.characters}
                      </p>
                    </div>

                    {/* Templates */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1.5">{t.generate.templates}</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'headline', icon: '📰', label: t.generate.desktopTemplateHeadline },
                          { id: 'cta', icon: '🎯', label: t.generate.templateCTA },
                          { id: 'minimal', icon: '✨', label: t.generate.desktopTemplateSimple },
                          { id: 'bold', icon: '💪', label: t.generate.desktopTemplateBold },
                          { id: 'elegant', icon: '👔', label: t.generate.templateElegant },
                          { id: 'modern', icon: '🚀', label: t.generate.templateModern },
                        ].map((template) => (
                          <button
                            key={template.id}
                            onClick={() => {
                              setTextTemplate(template.id as any);
                              if (template.id === 'headline') {
                                setTextColor('#ffffff');
                                setTextBackgroundColor('rgba(0, 0, 0, 0.5)');
                                setBackgroundStyle('transparent');
                                setTextPosition(25);
                              } else if (template.id === 'cta') {
                                setTextColor('#ffffff');
                                setTextBackgroundColor('#3b82f6');
                                setBackgroundStyle('solid');
                                setTextPosition(80);
                              } else if (template.id === 'minimal') {
                                setTextColor('#000000');
                                setTextBackgroundColor('rgba(255, 255, 255, 0.9)');
                                setBackgroundStyle('solid');
                                setTextPosition(50);
                              } else if (template.id === 'bold') {
                                setTextColor('#ffffff');
                                setTextBackgroundColor('rgba(220, 38, 38, 0.9)');
                                setBackgroundStyle('solid');
                                setTextPosition(50);
                              } else if (template.id === 'elegant') {
                                setTextColor('#1f2937');
                                setTextBackgroundColor('rgba(255, 255, 255, 0.95)');
                                setBackgroundStyle('blur');
                                setTextPosition(50);
                              } else if (template.id === 'modern') {
                                setTextColor('#ffffff');
                                setTextBackgroundColor('linear-gradient(135deg, #3b82f6, #06b6d4)');
                                setBackgroundStyle('gradient');
                                setTextPosition(80);
                              }
                            }}
                            className={`p-1.5 rounded border transition-all flex flex-col items-center ${
                              textTemplate === template.id
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-neutral-200 hover:border-neutral-300'
                            }`}
                          >
                            <div className="text-lg">{template.icon}</div>
                            <div className="text-[8px] text-neutral-700">{template.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Position */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1.5">{t.generate.position} <span className="text-neutral-400 font-normal">({textPosition}%)</span></label>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setTextPosition(Math.max(8, textPosition - 10))}
                          className="px-2.5 py-2 rounded-lg text-xs font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all"
                        >⬆️ {t.generate.topPlus}</button>
                        <button
                          onClick={() => setTextPosition(25)}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${textPosition <= 30 ? 'bg-purple-500 text-white' : 'bg-neutral-100 text-neutral-500'}`}
                        >{t.generate.top}</button>
                        <button
                          onClick={() => setTextPosition(50)}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${textPosition > 30 && textPosition < 70 ? 'bg-purple-500 text-white' : 'bg-neutral-100 text-neutral-500'}`}
                        >{t.generate.center}</button>
                        <button
                          onClick={() => setTextPosition(75)}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${textPosition >= 70 ? 'bg-purple-500 text-white' : 'bg-neutral-100 text-neutral-500'}`}
                        >{t.generate.bottom}</button>
                        <button
                          onClick={() => setTextPosition(Math.min(92, textPosition + 10))}
                          className="px-2.5 py-2 rounded-lg text-xs font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all"
                        >⬇️ {t.generate.bottomPlus}</button>
                      </div>
                    </div>

                    {/* Couleurs */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <label className="block text-xs font-medium mb-1">{t.generate.textColor}</label>
                        <input
                          type="color"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className="w-full h-8 rounded border border-neutral-300 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">{t.generate.backgroundColor}</label>
                        <input
                          type="color"
                          value={textBackgroundColor.startsWith('rgba') || textBackgroundColor.startsWith('linear') ? '#3b82f6' : textBackgroundColor}
                          onChange={(e) => setTextBackgroundColor(e.target.value)}
                          className="w-full h-8 rounded border border-neutral-300 cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Taille police */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1">
                        {t.generate.fontSizeShort} ({fontSize}pt)
                      </label>
                      <input
                        type="range"
                        min="24"
                        max="120"
                        value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    {/* Police */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1">{t.generate.fontLabel}</label>
                      <select
                        value={fontFamily}
                        onChange={(e) => setFontFamily(e.target.value as any)}
                        className="w-full px-2 py-1 rounded border border-neutral-300 text-[10px]"
                      >
                        <option value="inter">🔤 {t.generate.fontInter}</option>
                        <option value="montserrat">💪 {t.generate.fontMontserrat}</option>
                        <option value="bebas">📰 {t.generate.fontBebas}</option>
                        <option value="roboto">⚙️ {t.generate.fontRoboto}</option>
                        <option value="playfair">✨ {t.generate.fontPlayfair}</option>
                      </select>
                    </div>

                    {/* Style de fond */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1">{t.generate.bgStyleLabel}</label>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { value: 'clean', emoji: '🔲', label: t.generate.bgNone },
                          { value: 'none', emoji: '🅰', label: t.generate.bgStrongOutline },
                          { value: 'minimal', emoji: '✦', label: t.generate.bgSubtle },
                          { value: 'transparent', emoji: '👻', label: t.generate.bgTransparent },
                          { value: 'solid', emoji: '⬛', label: t.generate.bgSolid },
                          { value: 'gradient', emoji: '🌈', label: t.generate.bgGradient },
                          { value: 'blur', emoji: '💨', label: t.generate.bgBlur },
                          { value: 'outline', emoji: '⭕', label: t.generate.bgOutline },
                          { value: 'glow', emoji: '💫', label: t.generate.bgGlow }
                        ].map((style) => (
                          <button
                            key={style.value}
                            onClick={() => setBackgroundStyle(style.value as any)}
                            className={`px-2 py-1 rounded text-[9px] font-medium transition-all ${
                              backgroundStyle === style.value
                                ? 'bg-purple-500 text-white'
                                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                            }`}
                          >
                            <span className="mr-0.5">{style.emoji}</span>
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Bouton Appliquer / Ajouter */}
                    <button
                      onClick={() => {
                        if (!overlayText.trim()) return;
                        const newItem: GenerateTextOverlay = {
                          id: editingOverlayId || `overlay-${Date.now()}`,
                          text: overlayText,
                          position: textPosition,
                          fontSize,
                          fontFamily,
                          textColor,
                          backgroundColor: textBackgroundColor,
                          backgroundStyle,
                        };
                        if (editingOverlayId) {
                          setTextOverlayItems(prev => prev.map(item => item.id === editingOverlayId ? newItem : item));
                        } else {
                          setTextOverlayItems(prev => [...prev, newItem]);
                          setEditingOverlayId(newItem.id);
                        }
                      }}
                      disabled={!overlayText.trim()}
                      className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-xs font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {editingOverlayId ? `✓ ${t.generate.modifyText}` : textOverlayItems.length > 0 ? `+ ${t.generate.addText}` : `✓ ${t.generate.applyText}`}
                    </button>

                    {editingOverlayId && (
                      <button
                        onClick={() => {
                          if (overlayText.trim()) {
                            const updated: GenerateTextOverlay = {
                              id: editingOverlayId,
                              text: overlayText.trim(),
                              position: textPosition,
                              fontSize,
                              fontFamily,
                              textColor,
                              backgroundColor: textBackgroundColor,
                              backgroundStyle,
                            };
                            setTextOverlayItems(prev => prev.map(item => item.id === editingOverlayId ? updated : item));
                          }
                          skipAutoEditRef.current = true;
                          setEditingOverlayId(null);
                          setOverlayText('');
                          setTextPosition(25);
                        }}
                        className="w-full py-1.5 mt-1 border border-purple-300 text-purple-600 rounded-lg text-[10px] font-medium hover:bg-purple-50 transition"
                      >
                        {t.generate.newText}
                      </button>
                    )}

                    {/* Liste des textes appliqués */}
                    {textOverlayItems.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] font-semibold text-neutral-700">{t.generate.appliedTexts}</p>
                        {textOverlayItems.map((item) => (
                          <div key={item.id} className={`flex items-center gap-1.5 p-1.5 rounded border ${editingOverlayId === item.id ? 'border-purple-400 bg-purple-50' : 'border-neutral-200 bg-white'}`}>
                            <span className="text-[9px] text-neutral-400">{item.position <= 30 ? '⬆️' : item.position >= 70 ? '⬇️' : '⏺️'}</span>
                            <span className="flex-1 text-[10px] text-neutral-700 truncate">{item.text}</span>
                            <button
                              onClick={() => {
                                setOverlayText(item.text);
                                setTextPosition(item.position);
                                setFontSize(item.fontSize);
                                setFontFamily(item.fontFamily as any);
                                setTextColor(item.textColor);
                                setTextBackgroundColor(item.backgroundColor);
                                setBackgroundStyle(item.backgroundStyle as any);
                                setEditingOverlayId(item.id);
                              }}
                              className="px-1 py-0.5 text-[9px] text-blue-600 hover:bg-blue-50 rounded"
                            >
                              {t.generate.modify}
                            </button>
                            <button
                              onClick={() => {
                                setTextOverlayItems(prev => prev.filter(i => i.id !== item.id));
                                if (editingOverlayId === item.id) {
                                  skipAutoEditRef.current = true;
                                  setEditingOverlayId(null);
                                  setOverlayText('');
                                }
                              }}
                              className="px-1 py-0.5 text-[9px] text-red-600 hover:bg-red-50 rounded"
                            >
                              X
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            setTextOverlayItems([]);
                            skipAutoEditRef.current = true;
                            setEditingOverlayId(null);
                            setOverlayText('');
                          }}
                          className="w-full py-1.5 mt-1 border border-red-300 text-red-600 rounded-lg text-[10px] font-medium hover:bg-red-50 transition"
                        >
                          {t.generate.deleteAllText}
                        </button>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de souscription */}
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={() => setShowSubscriptionModal(false)}
        />

        {/* Modal Email Gate (2ème génération) */}
        <EmailGateModal
          isOpen={showEmailGate}
          onClose={() => setShowEmailGate(false)}
          onSubmit={(email) => {
            generationLimit.setEmail(email);
            setShowEmailGate(false);
          }}
          type="generation"
        />

        {/* Modal Signup Gate (3ème+ génération) */}
        <SignupGateModal
          isOpen={showSignupGate}
          onClose={() => setShowSignupGate(false)}
        />

        {/* Modal Email Gate pour édition (2ème édition) */}
        <EmailGateModal
          isOpen={showEditEmailGate}
          onClose={() => setShowEditEmailGate(false)}
          onSubmit={(email) => {
            editLimit.setEmail(email);
            setShowEditEmailGate(false);
          }}
          type="edit"
        />

        {/* Modal Signup Gate pour édition (3ème édition) */}
        <SignupGateModal
          isOpen={showEditSignupGate}
          onClose={() => setShowEditSignupGate(false)}
        />

        {/* Modal enrichissement profil */}
        {showEnrichmentModal && (
          <ProfileEnrichmentModal
            profile={enrichmentProfile}
            userId={enrichmentUserId}
            onClose={() => setShowEnrichmentModal(false)}
          />
        )}

        {/* Modal crédits insuffisants */}
        {showInsufficientCreditsModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowInsufficientCreditsModal(false)}>
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowInsufficientCreditsModal(false)} className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-neutral-900 mb-2">{t.generate.insufficientCredits}</h3>
                <p className="text-sm text-neutral-600 mb-1">{t.generate.currentBalance} <span className="font-semibold text-red-600">{credits.balance} {t.generate.credits}</span></p>
                <p className="text-sm text-neutral-600 mb-6">{t.generate.rechargeOrUpgrade}</p>
                <div className="flex gap-3">
                  <a href="/mon-compte" className="flex-1 py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all text-center">
                    {t.generate.buyCredits}
                  </a>
                  <a href="/pricing" className="flex-1 py-2.5 text-sm font-semibold border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-all text-center">
                    {t.generate.seePlans}
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal requiert un compte */}
        {showRequiresAccountModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowRequiresAccountModal(false)}>
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowRequiresAccountModal(false)} className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-neutral-900 mb-2">{t.generate.createAccountToContinue}</h3>
                <p className="text-sm text-neutral-600 mb-2">{t.generate.featureRequiresAccount}</p>
                <p className="text-sm text-neutral-500 mb-1">{t.generate.freeCreditsOnSignup}</p>
                <p className="text-sm text-neutral-500 mb-6">{t.generate.promoCodeHint}</p>
                <div className="flex gap-3">
                  <a href="/login" className="flex-1 py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all text-center">
                    {t.generate.createAccount}
                  </a>
                  <a href="/pricing" className="flex-1 py-2.5 text-sm font-semibold border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-all text-center">
                    {t.generate.seePricing}
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        <FeedbackPopup show={feedback.showPopup} onAccept={feedback.handleAccept} onDismiss={feedback.handleDismiss} />
        <FeedbackModal isOpen={feedback.showModal} onClose={feedback.handleModalClose} />

        {/* Welcome popup after email confirmation - auto-dismiss 10s */}
        {showWelcome && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowWelcome(false)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center animate-in fade-in zoom-in duration-300 relative">
              <button
                onClick={() => setShowWelcome(false)}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-neutral-900 mb-2">{t.generate.welcomeTitle}</h2>
              <p className="text-neutral-600 mb-6">{t.generate.welcomeDesc}</p>
              <button
                onClick={() => setShowWelcome(false)}
                className="px-8 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-xl hover:shadow-lg transition-all text-lg"
              >
                {t.generate.start}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
