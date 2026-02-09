'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import SubscriptionModal from '@/components/SubscriptionModal';
import EmailGateModal from '@/components/EmailGateModal';
import SignupGateModal from '@/components/SignupGateModal';
import AdminBadge from '@/components/AdminBadge';
import ProfileEnrichmentModal, { shouldShowEnrichmentModal } from '@/components/ProfileEnrichmentModal';
import { useGenerationLimit } from '@/hooks/useGenerationLimit';
import { useEditLimit } from '@/hooks/useEditLimit';
import { supabase } from '@/lib/supabase';
import { supabaseBrowser } from '@/lib/supabase/client';
import { generateTextSuggestions } from '@/lib/text-suggestion';
import { addTextOverlay } from '@/lib/canvas-text-overlay';
import { addWatermark, isFreemiumUser } from '@/lib/add-watermark';
import { computeSocialScore } from '@/lib/news/socialRanker';

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
];

// Mots à exclure pour les bonnes nouvelles (négatifs)
const NEGATIVE_KEYWORDS = [
  'mort', 'décès', 'deces', 'tué', 'tue', 'meurtre', 'assassinat', 'attentat', 'guerre', 'conflit',
  'crise', 'crash', 'effondrement', 'faillite', 'licenciement', 'fermeture', 'catastrophe', 'tragédie',
  'tragedie', 'scandale', 'corruption', 'fraude', 'arnaque', 'escroquerie', 'agression', 'violence',
  'accident mortel', 'incendie', 'inondation', 'séisme', 'ouragan', 'tempête', 'alerte', 'danger',
  'pénurie', 'penurie', 'inflation', 'récession', 'recession', 'dette', 'déficit', 'deficit',
  'condamné', 'condamne', 'prison', 'garde à vue', 'mise en examen', 'procès', 'proces',
];

const CATEGORIES = [
  'Les bonnes nouvelles',
  'Dernières news',
  'À la une',
  'Tech',
  'Business',
  'Finance',
  'Santé',
  'Sport',
  'Culture',
  'Politique',
  'Climat',
  'Automobile',
  'Lifestyle',
  'People',
  'Gaming',
  'Restauration',
  'Science',
  'International',
  'Musique',
  'Tendances'
];

/* ---------------- Page principale ---------------- */
export default function GeneratePage() {
  const router = useRouter();

  /* --- États pour les actualités --- */
  const [category, setCategory] = useState<string>('Les bonnes nouvelles');
  const [searchQuery, setSearchQuery] = useState('');
  const [allNewsItems, setAllNewsItems] = useState<NewsCard[]>([]); // Toutes les news en cache
  const [loading, setLoading] = useState(true); // TRUE au départ pour afficher "Chargement..."
  const [error, setError] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsCard | null>(null);
  const [useNewsMode, setUseNewsMode] = useState<boolean>(true); // true = avec actualité, false = sans actualité
  const [monthlyStats, setMonthlyStats] = useState<{ images: number; videos: number } | null>(null);
  const [trendingData, setTrendingData] = useState<{ googleTrends: any[]; tiktokHashtags: any[]; keywords: string[] } | null>(null);

  /* --- Ref pour le scroll auto sur mobile --- */
  const promptSectionRef = useRef<HTMLDivElement>(null);
  const uploadSectionRef = useRef<HTMLDivElement>(null);
  const assistantPanelRef = useRef<HTMLDivElement>(null);

  /* --- Calculer les catégories qui ont au moins une news --- */
  const availableCategories = useMemo(() => {
    const categoriesWithNews = new Set<string>();
    allNewsItems.forEach((item) => {
      if (item.category) {
        categoriesWithNews.add(item.category);
      }
    });
    // "Les bonnes nouvelles" et "Dernières news" sont toujours disponibles
    const filtered = CATEGORIES.filter((cat) =>
      cat === 'Les bonnes nouvelles' || cat === 'Dernières news' || categoriesWithNews.has(cat)
    );
    return filtered;
  }, [allNewsItems]);

  /* --- Filtrer les news selon catégorie et recherche --- */
  const filteredNews = useMemo(() => {
    let items = allNewsItems;

    // Filtre spécial pour "Les bonnes nouvelles" : scoring positif
    if (category === 'Les bonnes nouvelles') {
      items = allNewsItems.filter((item) => {
        const text = (item.title + ' ' + item.description).toLowerCase();
        // Exclure les news négatives
        const hasNegative = NEGATIVE_KEYWORDS.some(kw => text.includes(kw));
        if (hasNegative) return false;
        // Garder les news positives
        const hasPositive = POSITIVE_KEYWORDS.some(kw => text.includes(kw));
        return hasPositive;
      }).sort((a, b) => {
        // Scorer par nombre de mots positifs trouvés
        const scoreA = POSITIVE_KEYWORDS.filter(kw => (a.title + ' ' + a.description).toLowerCase().includes(kw)).length;
        const scoreB = POSITIVE_KEYWORDS.filter(kw => (b.title + ' ' + b.description).toLowerCase().includes(kw)).length;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
    } else if (category === 'Dernières news') {
      // Filtre spécial pour "Dernières news" : toutes les news triées par date
      items = [...allNewsItems].sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
    } else {
      // Filtre par catégorie normale
      items = items.filter((item) => item.category === category);
    }

    // Filtre par recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter((item) =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );
    }

    return items.slice(0, 12); // Limiter à 12 résultats
  }, [allNewsItems, category, searchQuery]);

  /* --- Astuce du jour (rotation quotidienne) --- */
  const MARKETING_TIPS = [
    { icon: '📊', text: 'Les posts avec des visages obtiennent 38% plus d\'engagement que ceux sans.' },
    { icon: '⏰', text: 'Le meilleur moment pour poster sur TikTok est entre 19h et 21h.' },
    { icon: '🎨', text: 'Les visuels avec 2-3 couleurs maximum sont plus mémorables.' },
    { icon: '📱', text: 'Les vidéos de moins de 15 secondes ont 2x plus de chances d\'être vues en entier.' },
    { icon: '💬', text: 'Poser une question dans votre post augmente les commentaires de 50%.' },
    { icon: '🔥', text: 'Les carrousels Instagram génèrent en moyenne 3x plus d\'engagement.' },
    { icon: '✨', text: 'Ajouter un CTA clair augmente les conversions de 80%.' },
    { icon: '🎯', text: 'Les posts publiés entre 11h-13h et 19h-21h performent le mieux.' },
    { icon: '💡', text: 'Utiliser 3-5 hashtags ciblés est plus efficace que 30 hashtags génériques.' },
    { icon: '📈', text: 'Les stories avec des stickers de sondage augmentent l\'engagement de 40%.' },
    { icon: '🌟', text: 'Le premier mot de votre description est crucial pour capter l\'attention.' },
    { icon: '🎬', text: 'Les vidéos avec sous-titres ont 80% de vues complètes en plus.' },
    { icon: '👥', text: 'Mentionner d\'autres comptes peut doubler votre portée organique.' },
    { icon: '🔔', text: 'Publier à la même heure chaque jour améliore votre visibilité algorithmique.' },
    { icon: '💎', text: 'Les posts authentiques surperforment les visuels trop retouchés.' },
    { icon: '🚀', text: 'Les 3 premières secondes d\'une vidéo déterminent 70% de son succès.' },
    { icon: '🎨', text: 'Utiliser votre palette de couleurs de marque augmente la reconnaissance de 60%.' },
    { icon: '📝', text: 'Les descriptions de 100-150 caractères obtiennent le plus d\'engagement.' },
    { icon: '🔄', text: 'Republier votre meilleur contenu peut toucher 90% de nouvelle audience.' },
    { icon: '👀', text: 'Les posts avec du mouvement captent l\'attention 5x plus vite.' },
    { icon: '💪', text: 'La cohérence de publication est plus importante que la fréquence.' },
    { icon: '🎁', text: 'Les concours augmentent le nombre d\'abonnés de 70% en moyenne.' },
    { icon: '📱', text: 'Les formats verticaux (9:16) ont 40% de taux de complétion en plus.' },
    { icon: '🌈', text: 'Alterner contenu éducatif et divertissant optimise votre feed.' },
    { icon: '⚡', text: 'Les Reels de 7-9 secondes ont le meilleur taux de partage.' },
    { icon: '🎯', text: 'Analysez vos stats chaque semaine pour identifier vos meilleurs contenus.' },
    { icon: '💫', text: 'Les transitions rapides dans les vidéos retiennent l\'attention 3x plus.' },
    { icon: '📢', text: 'Les appels à l\'action dans les 3 premières lignes fonctionnent mieux.' },
    { icon: '🏆', text: 'Montrer les coulisses de votre business booste l\'authenticité perçue.' },
    { icon: '🎪', text: 'Les émojis dans les descriptions augmentent l\'engagement de 25%.' },
  ];

  const dailyTip = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return MARKETING_TIPS[dayOfYear % MARKETING_TIPS.length];
  }, []);

  /* --- Trending news (3 plus tendance, enrichi par Google Trends + TikTok) --- */
  const trendingNews: Array<{ id: string; title: string; description: string; url: string; image?: string; source: string; date?: string; _score: number; _matchedTrends?: string[] }> = useMemo(() => {
    const TRENDING_CACHE_KEY = 'keiro_trending_cache';
    const TRENDING_TTL = 24 * 60 * 60 * 1000; // 24h

    // Vérifier cache trending
    try {
      const cached = localStorage.getItem(TRENDING_CACHE_KEY);
      if (cached) {
        const { items, ts } = JSON.parse(cached);
        if (items?.length > 0 && Date.now() - ts < TRENDING_TTL) {
          return items;
        }
      }
    } catch { /* */ }

    if (allNewsItems.length === 0) return [];

    const trendKeywords = trendingData?.keywords || [];
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

      // Bonus si l'article matche des tendances réelles Google/TikTok
      const text = (item.title + ' ' + item.description).toLowerCase();
      const matched = trendKeywords.filter((kw: string) => text.includes(kw));
      const trendBonus = Math.min(0.3, matched.length * 0.08);

      return {
        ...item,
        _score: Math.min(1, baseScore + trendBonus),
        _matchedTrends: matched.slice(0, 3),
      };
    });
    scored.sort((a: any, b: any) => b._score - a._score);
    const top3 = scored.slice(0, 3);

    // Sauvegarder en cache
    try {
      localStorage.setItem(TRENDING_CACHE_KEY, JSON.stringify({ items: top3, ts: Date.now() }));
    } catch { /* */ }

    return top3;
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
  const [imageAngle, setImageAngle] = useState(''); // Nouvel état : angle de l'image
  const [storyToTell, setStoryToTell] = useState(''); // Nouvel état : histoire à raconter
  const [publicationGoal, setPublicationGoal] = useState(''); // Nouvel état : but de la publication
  const [emotionToConvey, setEmotionToConvey] = useState(''); // Nouvel état : émotion à transmettre
  const [optionalText, setOptionalText] = useState(''); // Nouvel état : texte à ajouter (optionnel)
  const [textSuggestions, setTextSuggestions] = useState<string[]>([]); // Suggestions de texte intelligentes
  const [showTextSuggestions, setShowTextSuggestions] = useState(false); // Afficher les suggestions
  const [platform, setPlatform] = useState('Instagram');
  const [tone, setTone] = useState('');
  const [visualStyle, setVisualStyle] = useState('');
  const [specialist, setSpecialist] = useState<string>('');

  // NOUVELLES questions EXPERTES pour personnalisation ultra-précise
  const [problemSolved, setProblemSolved] = useState(''); // Quel problème vous résolvez face à cette actu
  const [uniqueAdvantage, setUniqueAdvantage] = useState(''); // Votre avantage unique vs concurrence
  const [desiredVisualIdea, setDesiredVisualIdea] = useState(''); // Idée vague du visuel souhaité

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
      marketingAngle: 'Inspirer l\'audience via l\'actualité pour créer une connexion émotionnelle',
      icon: '✨',
      label: 'Inspirant',
      description: 'Créez une connexion émotionnelle avec votre audience',
      details: 'Storytelling, transformation personnelle, valeurs humaines. Parfait pour : coachs, thérapeutes, formations personnelles.',
      example: 'Ex: "Leur vie a changé en 30 jours..."',
      marketingStrategy: 'Marketing émotionnel',
      whenToUse: 'Produits/services à forte valeur émotionnelle ou transformationnelle'
    },
    expert: {
      tone: 'Professionnel et pédagogique',
      emotion: 'Confiance et crédibilité',
      goal: 'Éduquer et établir une autorité',
      story: 'Expertise et valeur apportée',
      visualStyle: 'Moderne et structuré',
      imageAngle: 'Visuel clair avec mots-clés et données visuelles professionnelles',
      marketingAngle: 'Se positionner en expert face à l\'actualité pour établir son autorité',
      icon: '🎯',
      label: 'Expert',
      description: 'Positionnez-vous comme référence dans votre domaine',
      details: 'Pédagogie, données, preuves sociales. Parfait pour : consultants, B2B, services techniques, formateurs.',
      example: 'Ex: "3 erreurs à éviter selon les experts..."',
      marketingStrategy: 'Content marketing & Thought leadership',
      whenToUse: 'Vendre de l\'expertise, du conseil, de la formation avancée'
    },
    urgent: {
      tone: 'Dynamique et percutant',
      emotion: 'Urgence et excitation',
      goal: 'Pousser à l\'action immédiate',
      story: 'Opportunité limitée et bénéfices concrets',
      visualStyle: 'Énergique et contrasté',
      imageAngle: 'Impact visuel maximal avec call-to-action fort et urgence visible',
      marketingAngle: 'Profiter de l\'opportunité créée par l\'actualité pour pousser à l\'action',
      icon: '⚡',
      label: 'Urgent',
      description: 'Créez un sentiment d\'urgence pour déclencher l\'action',
      details: 'Scarcité, offres limitées, FOMO. Parfait pour : e-commerce, événements, lancements, promotions.',
      example: 'Ex: "Plus que 48h ! Stock limité..."',
      marketingStrategy: 'Marketing de l\'urgence & Conversion directe',
      whenToUse: 'Promotions, soldes, lancements, places limitées'
    },
    conversationnel: {
      tone: 'Amical et accessible',
      emotion: 'Proximité et authenticité',
      goal: 'Créer du dialogue et de l\'engagement',
      story: 'Expériences partagées et humanité',
      visualStyle: 'Naturel et chaleureux',
      imageAngle: 'Visuel naturel et authentique qui invite au dialogue',
      marketingAngle: 'Surfer sur la tendance de l\'actualité de manière conversationnelle',
      icon: '💬',
      label: 'Dialogue',
      description: 'Parlez naturellement comme à un ami',
      details: 'Authenticité, questions, partage. Parfait pour : personal branding, influenceurs, communautés, lifestyle.',
      example: 'Ex: "J\'ai testé pour vous et franchement..."',
      marketingStrategy: 'Marketing conversationnel & Community building',
      whenToUse: 'Construire une communauté engagée et fidèle'
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

  /* --- États pour l'éditeur de texte overlay intégré --- */
  const [overlayText, setOverlayText] = useState('');
  const [textPosition, setTextPosition] = useState<'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'>('center');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textBackgroundColor, setTextBackgroundColor] = useState('rgba(0, 0, 0, 0.5)');
  const [fontSize, setFontSize] = useState(60);
  const [fontFamily, setFontFamily] = useState<'inter' | 'montserrat' | 'bebas' | 'roboto' | 'playfair'>('inter');
  const [backgroundStyle, setBackgroundStyle] = useState<'clean' | 'none' | 'transparent' | 'solid' | 'gradient' | 'blur' | 'outline' | 'minimal' | 'glow'>('transparent');
  const [textTemplate, setTextTemplate] = useState<'headline' | 'cta' | 'minimal' | 'bold' | 'elegant' | 'modern'>('headline');
  const [textPreviewUrl, setTextPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

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
  const [aiTextStyle, setAITextStyle] = useState('classic'); // classic, minimal, impact, clean, wordstay, wordflash
  const [videoDuration, setVideoDuration] = useState(5);
  const [generationMode, setGenerationMode] = useState<'image' | 'video'>('image');

  /* --- États pour la génération audio TTS --- */
  const [addAudio, setAddAudio] = useState(false);
  const [audioTextSource, setAudioTextSource] = useState<'ai' | 'manual'>('ai');
  const [audioText, setAudioText] = useState('');
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'>('nova');
  const [generatedSubtitleText, setGeneratedSubtitleText] = useState('');
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const [videoEditorMerging, setVideoEditorMerging] = useState(false);

  /* --- États pour le studio d'édition --- */
  const [showEditStudio, setShowEditStudio] = useState(false);
  const [editVersions, setEditVersions] = useState<string[]>([]);
  const [selectedEditVersion, setSelectedEditVersion] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editMode, setEditMode] = useState<'precise' | 'creative'>('precise');
  const [editingImage, setEditingImage] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'image' | 'edit' | 'text' | 'versions'>('image');

  /* --- États pour le système freemium --- */
  const generationLimit = useGenerationLimit();
  const editLimit = useEditLimit();
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [showSignupGate, setShowSignupGate] = useState(false);
  const [showEditEmailGate, setShowEditEmailGate] = useState(false);
  const [showEditSignupGate, setShowEditSignupGate] = useState(false);
  const [enrichmentProfile, setEnrichmentProfile] = useState<any>(null);
  const [enrichmentUserId, setEnrichmentUserId] = useState<string>('');
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);

  /* --- Fetch actualités + tendances (1 seul appel au chargement, cache 24h) --- */
  useEffect(() => {
    fetchAllNews();
    fetchTrends();
  }, []);

  /* --- Fetch tendances réelles (Google Trends + TikTok, cache localStorage 24h) --- */
  async function fetchTrends() {
    const TRENDS_CACHE_KEY = 'keiro_trends_data';
    const TRENDS_TTL = 24 * 60 * 60 * 1000;
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
      const res = await fetch('/api/trends');
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

  /* --- Vérifier si l'utilisateur est connecté pour débloquer les limites --- */
  useEffect(() => {
    const checkAuth = async () => {
      const supabaseClient = supabaseBrowser();
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (user) {
        generationLimit.setHasAccount(true);
        editLimit.setHasAccount(true);
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
  useEffect(() => {
    if (!loading && allNewsItems.length > 0 && filteredNews.length === 0) {
      // Si la catégorie actuelle n'a pas de news, passer à la première qui en a
      const firstCategoryWithNews = availableCategories[0];
      if (firstCategoryWithNews && firstCategoryWithNews !== category) {
        console.log(`[Generate] Switching from empty category "${category}" to "${firstCategoryWithNews}"`);
        setCategory(firstCategoryWithNews);
      }
    }
  }, [loading, allNewsItems, filteredNews, availableCategories, category]);

  /* --- Sauvegarder et restaurer l'état du formulaire --- */
  // Charger l'état sauvegardé au montage
  useEffect(() => {
    const savedState = localStorage.getItem('keiro_generate_form_state');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        console.log('[Generate] Restoring saved form state:', state);

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

        // Nettoyer après restauration
        localStorage.removeItem('keiro_generate_form_state');
      } catch (error) {
        console.error('[Generate] Error loading saved state:', error);
      }
    }
  }, []);

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
        setMonthlyStats({ images: imageCount || 0, videos: videoCount || 0 });
      } catch (error) {
        console.error('[Generate] Error fetching monthly stats:', error);
      }
    };
    fetchMonthlyStats();
  }, []);

  // Sauvegarder l'état à chaque changement (avec debounce)
  useEffect(() => {
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
        savedAt: new Date().toISOString()
      };

      localStorage.setItem('keiro_generate_form_state', JSON.stringify(state));
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
    desiredVisualIdea
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
    try {
      setError(null);

      // 1. Charger depuis le cache localStorage immédiatement
      const CACHE_KEY = 'keiro_news_cache';
      const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { items, ts } = JSON.parse(cached);
          if (items?.length > 0) {
            setAllNewsItems(items);
            // Si cache < 24h, pas besoin de refetch
            if (Date.now() - ts < CACHE_TTL) {
              setLoading(false);
              return;
            }
          }
        }
      } catch { /* localStorage indisponible */ }

      // 2. Fetch en arrière-plan (si pas de cache ou cache expiré)
      setLoading(true);
      const res = await fetch('/api/news?all=true');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Erreur de chargement');
      const items = data.items || [];
      setAllNewsItems(items);

      // 3. Mettre à jour le cache localStorage
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ items, ts: Date.now() }));
      } catch { /* quota exceeded */ }
    } catch (e: any) {
      console.error('fetchAllNews error', e);
      setError('Impossible de récupérer les actualités.');
      if (!allNewsItems.length) setAllNewsItems([]);
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
      if (!data?.ok) throw new Error(data?.error || 'Upload échoué');
      setLogoUrl(data.url);
    } catch (e: any) {
      alert('Impossible d\'uploader le logo. Vérifiez le format (PNG, JPG).');
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
        marketingAngle: 'Se positionner en expert face à l\'actualité',
      },
      marketing: {
        goal: 'Générer de l\'engagement et des conversions',
        imageAngle: 'Visuel accrocheur avec call-to-action visuel',
        story: 'Bénéfices concrets pour le client',
        marketingAngle: 'Profiter de l\'opportunité créée par l\'actualité',
      },
      content: {
        goal: 'Éduquer et créer du lien avec l\'audience',
        imageAngle: 'Storytelling visuel authentique',
        story: 'Valeurs de la marque et authenticité',
        marketingAngle: 'Surfer sur la tendance de l\'actualité',
      },
      copywriter: {
        goal: 'Convaincre et pousser à l\'action',
        imageAngle: 'Impact visuel maximal avec hiérarchie claire',
        story: 'Transformation et résultats',
        marketingAngle: 'Résoudre le problème soulevé par l\'actualité',
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

  /* --- Génération de suggestions de texte intelligentes --- */
  async function handleGenerateTextSuggestions() {
    if (useNewsMode && !selectedNews) {
      alert('Veuillez d\'abord sélectionner une actualité (ou passez en mode "Sans actualité")');
      return;
    }

    if (!businessType.trim()) {
      alert('Veuillez d\'abord renseigner votre type de business');
      return;
    }

    if (!useNewsMode && !businessDescription.trim()) {
      alert('En mode sans actualité, décrivez votre business en détail pour de meilleures suggestions');
      return;
    }

    // NOUVEAU : Auto-remplir "problème résolu" si vide
    // Cela crée une PROPOSITION cohérente avec les suggestions de texte
    if (!problemSolved || !problemSolved.trim()) {
      const { generateProblemSolvedSuggestion } = require('@/lib/text-suggestion');

      const problemSuggestion = generateProblemSolvedSuggestion({
        newsTitle: selectedNews?.title || businessType,
        newsDescription: selectedNews?.description || businessDescription,
        businessType,
        businessDescription,
        targetAudience,
        specialist: specialist as any,
        communicationProfile,
        marketingAngle,
      });

      setProblemSolved(problemSuggestion);
      console.log('[TextSuggestion] 🎯 Auto-filled problem solved:', problemSuggestion);
    }

    // Générer les suggestions de texte avec IA
    setShowTextSuggestions(true);
    setTextSuggestions(['⏳ Génération en cours...']);

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
        throw new Error(data.error || 'Échec génération suggestions');
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

  /* --- Preview en temps réel du texte overlay --- */
  useEffect(() => {
    // Ne générer la preview que si on est dans l'onglet texte et qu'il y a du texte
    if (activeTab !== 'text' || !overlayText.trim() || !showEditStudio) {
      setTextPreviewUrl(null);
      return;
    }

    // Utiliser l'image AVEC WATERMARK UNIQUEMENT pour garder le watermark visible
    const imageToPreview = imageWithWatermarkOnly || originalImageUrl || selectedEditVersion || generatedImageUrl;
    if (!imageToPreview) {
      setTextPreviewUrl(null);
      return;
    }

    // Debounce pour éviter trop de régénérations
    const timeoutId = setTimeout(async () => {
      setIsGeneratingPreview(true);
      try {
        // Convertir position en format simple
        let simplePosition: 'top' | 'center' | 'bottom' = 'center';
        if (textPosition.startsWith('top')) simplePosition = 'top';
        else if (textPosition.startsWith('bottom')) simplePosition = 'bottom';

        const result = await addTextOverlay(imageToPreview, {
          text: overlayText,
          position: simplePosition,
          fontSize: fontSize,
          fontFamily: fontFamily,
          textColor: textColor,
          backgroundColor: textBackgroundColor,
          backgroundStyle: backgroundStyle,
        });

        setTextPreviewUrl(result);
      } catch (error) {
        console.error('Preview error:', error);
        setTextPreviewUrl(null);
      } finally {
        setIsGeneratingPreview(false);
      }
    }, 50); // Debounce 50ms pour preview INSTANTANÉE

    return () => clearTimeout(timeoutId);
  }, [overlayText, textPosition, textColor, textBackgroundColor, fontSize, fontFamily, backgroundStyle, selectedEditVersion, generatedImageUrl, activeTab, showEditStudio]);

  /* --- Génération de l'image IA avec Seedream 4.0 --- */
  async function handleGenerate() {
    if (useNewsMode && !selectedNews) {
      alert('Veuillez sélectionner une actualité (ou passez en mode "Sans actualité")');
      return;
    }
    if (!businessType.trim()) {
      alert('Veuillez renseigner votre type de business');
      return;
    }
    if (!useNewsMode && !businessDescription.trim()) {
      alert('En mode sans actualité, veuillez décrire votre business en détail pour enrichir la génération');
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

      // ⛔⛔⛔ PRIORITÉ ABSOLUE : INTERDICTION DE TEXTE ⛔⛔⛔
      // DOIT être EN PREMIER pour que l'IA le voie immédiatement
      promptParts.push(
        `🚫🚫🚫 CRITICAL INSTRUCTION - READ THIS FIRST 🚫🚫🚫\n` +
        `ABSOLUTELY NO TEXT, WORDS, LETTERS, OR WRITING IN THE IMAGE.\n` +
        `This is the #1 rule. If you include ANY text, the image will be rejected.\n` +
        `NO exceptions. NO text overlay. NO captions. NO labels. NO signs.\n` +
        `Create ONLY the visual composition. Text will be added later separately.\n` +
        `REPEAT: ZERO TEXT IN THE IMAGE. PURE VISUALS ONLY.\n`
      );

      // 1. CONTEXTE & LANGUE
      if (useNewsMode && selectedNews) {
        promptParts.push(
          `\n\nYou are an expert social media content creator and community manager. ` +
          `Create a professional visual for a French-speaking audience that connects current news with a specific business.`
        );

        // 2. ACTUALITÉ
        promptParts.push(
          `\n\nNEWS STORY:\n` +
          `Headline: "${selectedNews.title}"\n` +
          (selectedNews.description ? `Context: ${selectedNews.description.substring(0, 200)}\n` : '') +
          `Source: ${selectedNews.source || 'Web'}\n\n` +
          `Make this news story visually engaging and relevant to the target business.`
        );

        // 3. BUSINESS & BRAND
        promptParts.push(
          `BUSINESS PROFILE:\n` +
          `Type: ${businessType}\n` +
          (businessDescription ? `Details: ${businessDescription}\n` : '') +
          `\nThe visual must clearly show how this business BENEFITS from or RELATES to this news. ` +
          `Show a specific, tangible connection that makes immediate sense to viewers.`
        );
      } else {
        // MODE SANS ACTUALITÉ - Focus sur le business
        promptParts.push(
          `\n\nYou are an expert social media content creator and community manager. ` +
          `Create a professional, eye-catching visual for a French-speaking audience that showcases a specific business and its unique value proposition.`
        );

        promptParts.push(
          `\n\nBUSINESS PROFILE (DETAILED):\n` +
          `Type: ${businessType}\n` +
          `Description: ${businessDescription}\n` +
          (targetAudience ? `Target Audience: ${targetAudience}\n` : '') +
          `\nCreate a compelling visual that captures the ESSENCE of this business. ` +
          `Highlight what makes it unique, its atmosphere, values, and the experience it offers. ` +
          `The visual should make people want to discover and engage with this business immediately.`
        );
      }

      // 3.5 QUESTIONS EXPERTES - Lien ULTRA-FORT actualité/business (NOUVEAU)
      if (problemSolved || uniqueAdvantage || desiredVisualIdea) {
        promptParts.push(
          `\n\n🎯 EXPERT INSIGHTS - NEWS-TO-BUSINESS SUPER CONNECTION:\n`
        );

        if (problemSolved) {
          promptParts.push(
            `Problem Solved: ${problemSolved}\n` +
            `→ CRITICAL: Show visually HOW this business solves the problem created by the news. ` +
            `Make this connection OBVIOUS and COMPELLING. The viewer must immediately see: "News Problem → Business Solution".\n`
          );
        }

        if (uniqueAdvantage) {
          promptParts.push(
            `Unique Advantage: ${uniqueAdvantage}\n` +
            `→ Highlight this unique selling point visually. Show what makes this business DIFFERENT and BETTER. ` +
            `This should be a central visual element that stands out.\n`
          );
        }

        if (desiredVisualIdea) {
          promptParts.push(
            `Visual Direction: ${desiredVisualIdea}\n` +
            `→ Use this as creative inspiration for the composition. Interpret artistically while maintaining professional quality. ` +
            `This is the client's vision - honor it while enhancing it with your artistic expertise.\n`
          );
        }

        promptParts.push(
          `\n💡 These expert insights are KEY to creating a viral-worthy visual. ` +
          `Use them to create a POWERFUL, OBVIOUS connection that makes people think: "WOW, that makes perfect sense!"`
        );
      }

      // 4. AUDIENCE CIBLÉE (Amélioré)
      if (targetAudience) {
        promptParts.push(
          `\n\nTARGET AUDIENCE: ${targetAudience}\n` +
          `Speak directly to their interests, pain points, and aspirations. ` +
          `The visual should resonate emotionally with this specific demographic.`
        );
      }

      // 5. DIRECTION CRÉATIVE COMMUNITY MANAGER (NOUVEAU)
      promptParts.push(
        `\n\nCOMMUNITY MANAGER APPROACH:\n` +
        `Tone: ${tone} with an ${emotionToConvey || 'inspiring and emotional'} vibe\n` +
        `Visual Style: ${visualStyle}\n` +
        `Engagement Hook: The image should make people STOP scrolling and feel compelled to comment or share\n` +
        `Storytelling: ${storyToTell || 'Connect the news to real human impact and business transformation'}\n` +
        (publicationGoal ? `Goal: ${publicationGoal}\n` : '') +
        (marketingAngle ? `Marketing Strategy: ${marketingAngle}\n` : '')
      );

      // 6. INTERDICTION ABSOLUE DE TEXTE (RÉPÉTITION RENFORCÉE)
      // L'IA NE DOIT JAMAIS générer de texte - on l'ajoute avec Canvas pour qualité parfaite
      promptParts.push(
        `\n\n⛔⛔⛔ TEXT PROHIBITION - SECOND REMINDER ⛔⛔⛔\n` +
        `DO NOT WRITE ANY TEXT IN THE IMAGE. This includes:\n` +
        `❌ NO letters, words, numbers, or characters of ANY alphabet\n` +
        `❌ NO brand names, product names, company names, logos with text\n` +
        `❌ NO slogans, taglines, catchphrases, mottos\n` +
        `❌ NO prices, percentages, dates, times\n` +
        `❌ NO UI elements with text (buttons, badges, labels, ribbons)\n` +
        `❌ NO newspaper headlines, article titles, book covers with text\n` +
        `❌ NO signs, billboards, storefronts with text\n` +
        `❌ NO social media posts, screenshots with text\n` +
        `❌ NO handwritten text, calligraphy, graffiti with letters\n` +
        `❌ NO typography, fonts, text overlays of ANY kind\n\n` +
        `✅ WHAT TO DO: Create a beautiful VISUAL-ONLY composition with objects, people, scenes, colors, lighting.\n` +
        `✅ Text will be added separately with professional tools after generation.\n` +
        `✅ Focus on creating STUNNING VISUALS that tell the story WITHOUT words.`
      );

      if (optionalText && optionalText.trim()) {
        const isCTA = /\b(offre|promo|réduction|%|€|gratuit|limité|maintenant|découvr|inscri)/i.test(optionalText);

        promptParts.push(
          `\n\n📐 COMPOSITION READY FOR TEXT OVERLAY:\n` +
          `Create visual breathing room for text overlay:\n` +
          `- ${isCTA ? 'Lower third (bottom 1/3) OR center area' : 'Upper third (top 1/3) OR center area'} should have clean space\n` +
          `- ${isCTA ? 'Darker or gradient area at bottom/center' : 'Clean visual area at top/center'} for text placement\n` +
          `- Avoid busy patterns in text zones\n` +
          `- Good contrast potential (not too busy)\n\n` +
          `🚫 REMEMBER: ZERO TEXT IN THE IMAGE. CREATE VISUAL-ONLY COMPOSITION.`
        );
      }

      // 7. STANDARDS VISUELS PROFESSIONNELS (Amélioré)
      promptParts.push(
        `\n\n📸 PROFESSIONAL VISUAL STANDARDS:\n` +
        `Quality Level: Publication-ready for professional social media (Instagram, LinkedIn, Facebook)\n` +
        `Composition:\n` +
        `- Rule of thirds with clear focal point\n` +
        `- Leading lines that guide viewer's eye naturally\n` +
        `- Balanced negative space for visual breathing room\n` +
        `Color Palette:\n` +
        `- Vibrant but harmonious colors\n` +
        `- High contrast for attention-grabbing impact\n` +
        `- Cohesive color story that matches the emotion and tone\n` +
        `Lighting & Atmosphere:\n` +
        `- Professional lighting setup\n` +
        `- ${emotionToConvey === 'Inspiration' || tone === 'Inspirant' ? 'Warm, uplifting lighting with golden hour feel' :
             emotionToConvey === 'Urgence' ? 'Dynamic, energetic lighting with bold shadows' :
             'Balanced lighting that enhances the emotional tone'}\n` +
        `Forbidden Elements:\n` +
        `- No social media platform names or logos (no "Instagram", "TikTok", etc.)\n` +
        `- No UI elements (likes, comments, share buttons)\n` +
        `- No watermarks or "AI Generated" text\n` +
        `- No stock photo clichés (generic handshakes, forced smiles)`
      );

      // 8. LIEN ACTUALITÉ-BUSINESS (NOUVEAU - Section renforcée)
      promptParts.push(
        `\n\n🔗 NEWS-TO-BUSINESS CONNECTION (CRITICAL):\n` +
        `The viewer should IMMEDIATELY understand:\n` +
        `1. What the news is about (visual representation of the event)\n` +
        `2. What the business does (clear brand/service indication)\n` +
        `3. WHY they're connected (obvious benefit, opportunity, or relevance)\n\n` +
        `VISUAL INTEGRATION - Show this connection through UNIFIED, cohesive compositions:\n` +
        `- Blended imagery: Seamlessly integrate news elements WITH business elements in ONE harmonious scene\n` +
        `- Layered storytelling: Use depth and layers to show news context supporting/surrounding the business\n` +
        `- Symbolic fusion: Create visual metaphors where news and business naturally coexist in the same visual space\n` +
        `- Environmental context: Place the business/product within an environment that evokes the news story\n\n` +
        `AVOID:\n` +
        `- Split-screen or divided compositions (left/right, top/bottom splits)\n` +
        `- Obvious before/after side-by-side layouts\n` +
        `- Jarring visual cuts or harsh separations\n\n` +
        `The connection must be SPECIFIC and TANGIBLE, not generic or abstract. ` +
        `Create ONE beautiful, unified image where news and business flow together naturally. ` +
        `Think like a storyteller: "This news creates THIS opportunity/problem for THIS business/audience."`
      );

      // 9. CALL TO ENGAGEMENT (NOUVEAU - Community Manager focus)
      promptParts.push(
        `\n\n💬 ENGAGEMENT DESIGN:\n` +
        `Design the visual to spark conversation and interaction:\n` +
        `- Include thought-provoking visual elements that invite questions\n` +
        `- Create curiosity gaps that make people want to learn more\n` +
        `- ${tone === 'Inspirant' || emotionToConvey === 'Inspiration' ?
             'Show aspirational outcomes that inspire viewers to imagine themselves in that scenario' :
             'Show relatable situations that prompt viewers to share their own experiences'}\n` +
        `- Visual should work WITH the caption (not repeat it) to create a complete story`
      );

      // 10. RENFORCER L'INTERDICTION DE TEXTE (CRITIQUE - répété à la fin)
      promptParts.push(
        `\n\n🚫🚫🚫 FINAL CRITICAL REMINDER - NO TEXT ALLOWED 🚫🚫🚫\n` +
        `IMPORTANT: This image must contain ZERO text, words, letters, numbers, or written characters.\n` +
        `❌ NO text at the top of the image\n` +
        `❌ NO text at the bottom of the image\n` +
        `❌ NO text in the center of the image\n` +
        `❌ NO text anywhere in the image\n` +
        `❌ NO signs, banners, labels, captions, or typography of any kind\n` +
        `❌ NO newspapers with visible text\n` +
        `❌ NO computer screens with text\n` +
        `❌ NO billboards with text\n` +
        `❌ NO books with visible text\n` +
        `❌ NO handwritten notes or letters\n\n` +
        `NEGATIVE PROMPT (what to AVOID): text, words, letters, writing, typography, captions, ` +
        `labels, signs, banners, headlines, taglines, slogans, watermarks, logos with text, ` +
        `newspapers with readable text, books with readable text, computer screens with text, ` +
        `phone screens with text, billboards with text, street signs, shop signs, any written language, ` +
        `any alphabetic characters, any numeric characters, any symbols that look like text.\n\n` +
        `CREATE PURE VISUAL IMAGERY ONLY. The text will be added separately as a professional overlay.`
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
        throw new Error(errorData.error || `Erreur serveur: ${res.status}`);
      }

      const data = await res.json();
      clearInterval(progressInterval);
      setImageLoadingProgress(90);
      setLoadingStep('download');

      if (!data?.ok) throw new Error(data?.error || 'Génération échouée');

      console.log('[Generate] Image generated, applying overlays CLIENT-SIDE...', {
        hasOptionalText: !!optionalText?.trim(),
        imageUrl: data.imageUrl.substring(0, 50)
      });

      // APPROCHE ROBUSTE : Conversion serveur + Canvas client
      // 1. Serveur convertit en data URL (évite CORS)
      // 2. Client applique overlays avec Canvas natif (garanti de fonctionner)

      let finalImageUrl = data.imageUrl;

      try {
        // Vérifier statut premium pour watermark
        const { data: { user } } = await supabaseClient.auth.getUser();
        const hasPremiumPlan = user?.user_metadata?.subscription_status === 'active' || false;
        const hasProvidedEmail = !!generationLimit.email;
        const hasCreatedAccount = generationLimit.hasAccount;
        const userEmail = user?.email || generationLimit.email || null;
        const isUserFreemium = isFreemiumUser(hasProvidedEmail, hasCreatedAccount, hasPremiumPlan, userEmail);

        // Préparer le texte overlay
        const fallbackTitle = selectedNews?.title || businessType || 'Votre business';
        let textToApply = optionalText && optionalText.trim()
          ? optionalText.trim()
          : fallbackTitle.length > 60
            ? fallbackTitle.substring(0, 60) + '...'
            : fallbackTitle;

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

              // TEXTE OVERLAY centré (taille réduite pour Instagram 1080x1080)
              if (textToApply) {
                const fontSize = Math.max(60, Math.floor(img.width * 0.06)); // Réduit à 6%

                ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const x = img.width / 2;
                const y = img.height / 2;

                // Ombre portée forte
                ctx.shadowColor = 'rgba(0, 0, 0, 1)';
                ctx.shadowBlur = 12;
                ctx.shadowOffsetX = 6;
                ctx.shadowOffsetY = 6;

                // Contour noir épais
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
                ctx.lineWidth = Math.max(6, Math.floor(fontSize * 0.10));
                ctx.strokeText(textToApply, x, y);

                // Texte blanc
                ctx.fillStyle = 'white';
                ctx.fillText(textToApply, x, y);

                console.log('[Generate] ✅ Text overlay applied');
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

      } catch (overlayError: any) {
        console.error('[Generate] ❌ Overlays FAILED:', overlayError);
        alert('⚠️ ERREUR OVERLAYS:\n' + overlayError.message + '\n\nAffichage de l\'image sans overlay.');
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

          const saveResponse = await fetch('/api/library/save', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              imageUrl: finalImageUrl,
              title: selectedNews?.title ? selectedNews.title.substring(0, 50) : (businessType ? businessType.substring(0, 50) : 'Image'),
              newsTitle: selectedNews?.title ? selectedNews.title.substring(0, 50) : null,
              newsCategory: selectedNews?.category || null,
              aiModel: 'seedream',
              tags: []
            })
          });
          const saveData = await saveResponse.json();
          if (saveData.ok && saveData.savedImage?.id) {
            setLastSavedImageId(saveData.savedImage.id);
            setMonthlyStats(prev => prev ? { ...prev, images: prev.images + 1 } : { images: 1, videos: 0 });
            console.log('[Generate] Auto-saved to library:', saveData.savedImage.id);
          }
        }
      } catch (saveError) {
        console.error('[Generate] Auto-save error:', saveError);
      }
    } catch (e: any) {
      clearInterval(progressInterval);
      console.error('Generation error:', e);
      const errorMessage = e.message || 'Erreur lors de la génération';
      setGenerationError(
        errorMessage.includes('fetch')
          ? 'Impossible de contacter le serveur. Vérifiez votre connexion internet.'
          : errorMessage
      );
    } finally {
      setGenerating(false);
    }
  }

  // Sauvegarder l'image dans la galerie
  async function saveToLibrary() {
    if (!generatedImageUrl) {
      console.error('[SaveToLibrary] Missing image data');
      return;
    }

    setSavingToLibrary(true);

    try {
      // Utiliser supabaseBrowser pour avoir accès à la session
      const supabaseClient = supabaseBrowser();
      const { data: { user } } = await supabaseClient.auth.getUser();

      if (!user) {
        alert('Vous devez être connecté pour sauvegarder dans votre galerie');
        setSavingToLibrary(false);
        return;
      }

      console.log('[SaveToLibrary] Saving image to library...');

      // ÉTAPE 1: Vérifier si l'URL est une data URL base64 (trop volumineuse)
      let finalImageUrl = generatedImageUrl;

      if (generatedImageUrl.startsWith('data:')) {
        console.log('[SaveToLibrary] Data URL detected, uploading to Supabase Storage...');

        // Convertir data URL en Blob
        const response = await fetch(generatedImageUrl);
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
          throw new Error('Impossible d\'uploader l\'image. Veuillez réessayer.');
        }

        // Obtenir l'URL publique
        const { data: { publicUrl } } = supabaseClient.storage
          .from('generated-images')
          .getPublicUrl(fileName);

        finalImageUrl = publicUrl;
        console.log('[SaveToLibrary] Image uploaded, public URL:', publicUrl);
      }

      // ÉTAPE 2: PAYLOAD ULTRA-MINIMAL avec URL courte
      const payload = {
        imageUrl: finalImageUrl,
        title: selectedNews?.title ? selectedNews.title.substring(0, 50) : (businessType ? businessType.substring(0, 50) : 'Image'),
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
          throw new Error(`Erreur serveur (${response.status}): ${errorText.substring(0, 100)}`);
        }

        data = await response.json();
      } catch (jsonError: any) {
        console.error('[SaveToLibrary] Error:', jsonError);
        throw new Error(jsonError.message || 'Erreur lors de la sauvegarde');
      }

      if (data.ok) {
        setImageSavedToLibrary(true);
        if (data.savedImage?.id) setLastSavedImageId(data.savedImage.id);
        console.log('[SaveToLibrary] ✅ Image saved:', data.savedImage?.id);

        // Toast succès
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-in';
        toast.innerHTML = `
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>${isUpdate ? 'Galerie mise à jour !' : 'Sauvegardé dans votre galerie !'}</span>
          </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      } else {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error: any) {
      console.error('[SaveToLibrary] ❌ Error:', error);
      alert(error.message || 'Erreur lors de la sauvegarde dans la galerie');
    } finally {
      setSavingToLibrary(false);
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
        alert('Vous devez être connecté pour sauvegarder dans votre galerie');
        setSavingToLibrary(false);
        return;
      }

      console.log('[SaveVideoToLibrary] Saving video to library...');

      // Payload pour la vidéo (déjà uploadée par Seedream)
      const payload = {
        videoUrl: generatedVideoUrl,
        title: selectedNews?.title ? selectedNews.title.substring(0, 50) : 'Vidéo générée',
        sourceType: 'seedream_i2v',
        duration: 5,
        thumbnailUrl: null, // Ne pas envoyer base64 data URL (payload trop large)
        originalImageId: null,
        folderId: null
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
          throw new Error(`Erreur serveur (${response.status}): ${errorText.substring(0, 100)}`);
        }

        data = await response.json();
      } catch (jsonError: any) {
        console.error('[SaveVideoToLibrary] Error:', jsonError);
        throw new Error(jsonError.message || 'Erreur lors de la sauvegarde');
      }

      if (data.ok) {
        setVideoSavedToLibrary(true);
        if (data.video?.id) setLastSavedVideoId(data.video.id);
        console.log('[SaveVideoToLibrary] ✅ Video saved:', data.video?.id);

        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-in';
        toast.innerHTML = `
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>${isUpdate ? 'Vidéo mise à jour dans la galerie !' : 'Vidéo sauvegardée !'}</span>
          </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      } else {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error: any) {
      console.error('[SaveVideoToLibrary] ❌ Error:', error);
      alert(error.message || 'Erreur lors de la sauvegarde de la vidéo dans la galerie');
    } finally {
      setSavingToLibrary(false);
    }
  }

  // Génération de vidéo avec Seedream/SeedDance
  async function handleGenerateVideo() {
    if (useNewsMode && !selectedNews) {
      alert('Veuillez sélectionner une actualité (ou passez en mode "Sans actualité")');
      return;
    }
    if (!businessType.trim()) {
      alert('Veuillez renseigner votre type de business');
      return;
    }
    if (!useNewsMode && !businessDescription.trim()) {
      alert('En mode sans actualité, décrivez votre business en détail');
      return;
    }

    setGeneratingVideo(true);
    setGeneratedVideoUrl(null);
    setVideoTaskId(null);
    setVideoProgress('Création de la tâche vidéo...');
    setGenerationError(null);
    setVideoSavedToLibrary(false);
    setLastSavedVideoId(null);

    try {
      // Construire le prompt vidéo
      let videoPrompt = '';
      if (useNewsMode && selectedNews) {
        videoPrompt = `${selectedNews.title}. Business: ${businessType}. ${businessDescription ? `Description: ${businessDescription}.` : ''} Style: ${visualStyle}, ${tone}. Create an engaging social media video.`;
      } else {
        videoPrompt = `Business: ${businessType}. Description: ${businessDescription}. ${targetAudience ? `Audience: ${targetAudience}.` : ''} Style: ${visualStyle}, ${tone}. Create an engaging social media video showcasing this business identity and value proposition.`;
      }

      // Générer le texte des sous-titres si activé (overlay CSS, PAS envoyé à Seedream)
      if (enableAIText) {
        let subtitleText = '';

        if (addAudio && audioText.trim()) {
          subtitleText = audioText.trim();
        } else if (addAudio && audioTextSource === 'ai') {
          subtitleText = useNewsMode && selectedNews ? selectedNews.title : businessDescription;
        } else {
          try {
            setVideoProgress('Préparation de la vidéo...');
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
                classic: 'catchy', minimal: 'informative', impact: 'catchy',
                clean: 'informative', wordstay: 'catchy', wordflash: 'catchy'
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
        : undefined; // défaut 16:9

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

      if (!data?.ok) {
        const errorMsg = data?.error || 'Échec de création de la tâche vidéo';
        console.error('[Video] Task creation failed:', errorMsg);
        if (data?.debug) console.log('[Video] Debug info:', data.debug);
        throw new Error(errorMsg);
      }

      setVideoTaskId(data.taskId);
      console.log('[Video] Task created:', data.taskId);

      // Polling pour vérifier le statut avec gestion d'erreur améliorée
      // Longer videos need more polling time
      const maxAttempts = videoDuration <= 10 ? 60 : 120; // 5-10 min max

      const pollWithRetry = async (attempt: number): Promise<void> => {
        if (attempt >= maxAttempts) {
          throw new Error('Timeout: La génération prend trop de temps (5 min max)');
        }

        setVideoProgress(`Génération en cours... (${attempt * 5}s / 300s max)`);

        try {
          const statusRes = await fetch('/api/seedream/t2v', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: data.taskId }),
          });

          const statusData = await statusRes.json();
          console.log('[Video] Status check response:', statusData);

          if (statusData.status === 'completed') {
            if (statusData.videoUrl) {
              console.log('[Video] Video ready:', statusData.videoUrl);
              console.log('[Video] Note: La conversion TikTok se fera automatiquement lors de la publication');

              let finalVideoUrl = statusData.videoUrl;

              // Si audio TTS demandé, générer l'audio puis fusionner dans la vidéo
              if (addAudio) {
                try {
                  // Générer l'audio TTS
                  let audioUrlForMerge = generatedAudioUrl;

                  if (!audioUrlForMerge) {
                    setVideoProgress('Finalisation de la vidéo...');
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
                        console.log('[Video] ✅ Audio TTS généré:', audioData.audioUrl);
                      }
                    }
                  }

                  // Fusionner audio dans la vidéo côté serveur
                  if (audioUrlForMerge) {
                    setVideoProgress('Finalisation de la vidéo...');
                    const mergeRes = await fetch('/api/merge-audio-video', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ videoUrl: finalVideoUrl, audioUrl: audioUrlForMerge })
                    });
                    const mergeData = await mergeRes.json();
                    if (mergeData.ok && mergeData.mergedUrl) {
                      finalVideoUrl = mergeData.mergedUrl;
                      console.log('[Video] ✅ Audio intégré dans la vidéo:', finalVideoUrl);
                    } else {
                      console.warn('[Video] Fusion échouée, vidéo sans audio:', mergeData.error);
                    }
                  }
                } catch (audioErr) {
                  console.warn('[Video] Audio/merge error (non bloquant):', audioErr);
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
                      title: selectedNews?.title ? selectedNews.title.substring(0, 50) : 'Vidéo générée',
                      sourceType: 'seedream_i2v',
                      duration: 5
                    })
                  });
                  const vSaveData = await vSaveRes.json();
                  if (vSaveData.ok && vSaveData.video?.id) {
                    setLastSavedVideoId(vSaveData.video.id);
                    setMonthlyStats(prev => prev ? { ...prev, videos: prev.videos + 1 } : { images: 0, videos: 1 });
                    console.log('[Video] Auto-saved to library:', vSaveData.video.id);
                  }
                }
              } catch (autoSaveErr) {
                console.error('[Video] Auto-save error:', autoSaveErr);
              }

              return;
            } else {
              // Statut completed mais pas d'URL - afficher debug
              console.error('[Video] Completed but no URL. Full response:', JSON.stringify(statusData, null, 2));
              // Afficher les données debug dans l'erreur
              const debugInfo = statusData.debug ? JSON.stringify(statusData.debug, null, 2) : 'No debug data';
              throw new Error(`Vidéo générée mais URL non trouvée. Debug: ${debugInfo.substring(0, 500)}`);
            }
          }

          if (statusData.status === 'failed' || !statusData.ok) {
            throw new Error(statusData.error || 'La génération vidéo a échoué');
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
      setVideoProgress('Démarrage de la génération...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      await pollWithRetry(1);

    } catch (e: any) {
      console.error('[Video] Generation error:', e);
      setGenerationError(e.message || 'Erreur lors de la génération vidéo');
      setGeneratingVideo(false);
      setVideoProgress('');
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      {/* Badge Admin */}
      <AdminBadge />

      <div className="max-w-7xl mx-auto">
        <p className="text-neutral-600 mb-6">
          {useNewsMode
            ? 'Associez une actualité à votre business pour créer un visuel engageant et augmenter votre visibilité'
            : 'Décrivez votre business en détail pour créer un visuel percutant basé sur votre identité'}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ===== COLONNE GAUCHE : Actualités ===== */}
          <div className="lg:col-span-8">
            {/* Banner mode sans actualité */}
            {!useNewsMode && (
              <div className="mb-4 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">🎨</div>
                  <div>
                    <h4 className="font-bold text-purple-900 text-sm mb-1">Mode Création Libre</h4>
                    <p className="text-xs text-purple-700 mb-2">
                      Vous générez sans actualité. Décrivez votre business en détail dans le panneau de droite pour obtenir un visuel percutant.
                    </p>
                    <p className="text-[10px] text-purple-600">
                      Vous pouvez toujours parcourir et sélectionner une actualité ci-dessous si vous le souhaitez (optionnel).
                    </p>
                  </div>
                </div>
              </div>
            )}
            {/* Filtres : Catégories + Recherche (sans labels) */}
            <div className="mb-4 flex flex-col sm:flex-row gap-3">
              {/* Dropdown Catégories */}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {/* Barre de recherche */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Rechercher dans les actualités..."
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Cartes d'actualités (3 colonnes) */}
            <div>
              {loading && (
                <div className="text-center py-8 text-neutral-500">
                  Chargement des actualités...
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  {error}
                </div>
              )}

              {!loading && !error && filteredNews.length === 0 && (
                <div className="text-center py-8 text-neutral-500">
                  Aucune actualité trouvée
                </div>
              )}

              {!loading && filteredNews.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredNews.map((item) => (
                    <article
                      key={item.id}
                      onClick={() => {
                        if (!useNewsMode && selectedNews?.id === item.id) {
                          setSelectedNews(null);
                        } else {
                          setSelectedNews(item);
                        }
                      }}
                      className={`rounded-xl border cursor-pointer transition-all hover:shadow-lg ${
                        selectedNews?.id === item.id
                          ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-500'
                          : 'bg-white hover:bg-neutral-50 border-neutral-200 hover:border-blue-300'
                      }`}
                    >
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-44 object-cover rounded-t-xl"
                        />
                      )}
                      <div className="p-3">
                        <h3 className="font-semibold text-sm line-clamp-2 mb-2">
                          {item.title}
                        </h3>
                        <p className="text-xs text-neutral-600 line-clamp-2 mb-3">
                          {item.description}
                        </p>

                        {/* Footer avec source et badge sélectionné */}
                        <div className="flex items-center justify-between mt-auto">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            Source
                          </a>
                          {selectedNews?.id === item.id && (
                            <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-medium">
                              Sélectionné
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* ===== WIDGETS SECTION (toujours visible, ne dépend pas du chargement des news) ===== */}
            <div className="space-y-3 mt-6">
              {/* Widget 1 : Quick Stats (pleine largeur + barres de progression avec quotas) */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">📊</span>
                  <h4 className="text-sm font-bold text-blue-900">Votre activité ce mois</h4>
                  <span className="text-xs text-blue-600 ml-auto capitalize">
                    {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
                {monthlyStats ? (
                  <div className="space-y-3">
                    {(() => {
                      const imgPct = Math.min(100, (monthlyStats.images / 30) * 100);
                      const imgColor = imgPct >= 80 ? 'bg-gradient-to-r from-red-400 to-red-500' : imgPct >= 65 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-green-400 to-emerald-500';
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-blue-800">Visuels créés</span>
                            <span className="text-sm font-bold text-blue-900">{monthlyStats.images} <span className="text-[10px] font-normal text-blue-500">/ 30</span></span>
                          </div>
                          <div className="w-full bg-neutral-200 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full transition-all ${imgColor}`}
                              style={{ width: `${Math.max(4, imgPct)}%` }}
                            />
                          </div>
                          {imgPct >= 100 ? (
                            <p className="text-[10px] text-red-600 mt-0.5 font-semibold">Quota atteint</p>
                          ) : imgPct >= 80 ? (
                            <p className="text-[10px] text-red-600 mt-0.5">Quota bientôt atteint</p>
                          ) : null}
                        </div>
                      );
                    })()}
                    {(() => {
                      const vidPct = Math.min(100, (monthlyStats.videos / 8) * 100);
                      const vidColor = vidPct >= 80 ? 'bg-gradient-to-r from-red-400 to-red-500' : vidPct >= 65 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-green-400 to-emerald-500';
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-blue-800">Vidéos créées</span>
                            <span className="text-sm font-bold text-blue-900">{monthlyStats.videos} <span className="text-[10px] font-normal text-blue-500">/ 8</span></span>
                          </div>
                          <div className="w-full bg-neutral-200 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full transition-all ${vidColor}`}
                              style={{ width: `${Math.max(4, vidPct)}%` }}
                            />
                          </div>
                          {vidPct >= 100 ? (
                            <p className="text-[10px] text-red-600 mt-0.5 font-semibold">Quota atteint</p>
                          ) : vidPct >= 80 ? (
                            <p className="text-[10px] text-red-600 mt-0.5">Quota bientôt atteint</p>
                          ) : null}
                        </div>
                      );
                    })()}
                    {/* Upsell si un quota est atteint */}
                    {(monthlyStats.images >= 30 || monthlyStats.videos >= 8) && (
                      <div className="mt-2 p-3 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
                        <p className="text-xs text-purple-900 font-semibold mb-1">Continuez à créer sans interruption</p>
                        <p className="text-[11px] text-purple-700 mb-2">Ajoutez un pack extra pour ce mois :</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => router.push('/mon-compte')}
                            className="flex-1 text-[10px] px-2 py-1.5 bg-white border border-purple-200 rounded-lg text-purple-700 hover:bg-purple-50 transition-colors text-center"
                          >
                            +10 visuels — 19€
                          </button>
                          <button
                            onClick={() => router.push('/mon-compte')}
                            className="flex-1 text-[10px] px-2 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors text-center font-semibold"
                          >
                            +5 vidéos — 29€
                          </button>
                        </div>
                        <p className="text-[9px] text-purple-500 mt-1.5 text-center">
                          Ou <button onClick={() => router.push('/pricing')} className="underline hover:text-purple-700">changez de plan</button> pour des quotas plus élevés
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-blue-600">Connectez-vous pour voir vos stats</p>
                )}
              </div>

              {/* Ligne 2 : Astuce du jour + Trending (grille 2 colonnes) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Widget 2 : Astuce du jour */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 flex flex-col items-center justify-center text-center">
                  <div className="text-4xl mb-3">{dailyTip.icon}</div>
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">Astuce du jour</h4>
                  <p className="text-sm text-amber-800 leading-relaxed max-w-[280px]">{dailyTip.text}</p>
                </div>

                {/* Widget 3 : Trending réseaux sociaux (données réelles Google Trends + TikTok) */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">🔥</span>
                    <h4 className="text-sm font-bold text-green-900">Tendances réseaux sociaux</h4>
                    {trendingData && <span className="text-[9px] text-green-500 ml-auto">Google Trends + TikTok</span>}
                  </div>
                  {trendingNews.length > 0 ? (
                    <div className="space-y-2">
                      {trendingNews.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedNews(item)}
                          className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-all border ${
                            selectedNews?.id === item.id
                              ? 'bg-green-100 border-green-400 ring-1 ring-green-400'
                              : 'bg-white/60 border-green-100 hover:bg-white'
                          }`}
                        >
                          {item.image && (
                            <img src={item.image} alt="" className="w-12 h-12 object-cover rounded flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs line-clamp-2 font-medium leading-snug ${selectedNews?.id === item.id ? 'text-green-900' : 'text-green-800'}`}>{item.title}</p>
                            <p className="text-[9px] text-green-500 mt-0.5">{item.source}</p>
                            {(item as any)._matchedTrends?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(item as any)._matchedTrends.map((kw: string) => (
                                  <span key={kw} className="text-[8px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">📈 {kw}</span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-1 mt-1">
                              <div className="h-1 rounded-full bg-gradient-to-r from-green-400 to-emerald-500" style={{ width: `${Math.round((item as any)._score * 100)}%`, minWidth: '20%' }} />
                              <span className="text-[9px] text-green-600">{Math.round((item as any)._score * 100)}%</span>
                              {selectedNews?.id === item.id && (
                                <span className="text-[9px] bg-green-600 text-white px-1.5 py-0.5 rounded ml-auto">Sélectionné</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-green-600">Chargement des tendances...</p>
                  )}
                  {/* Hashtags TikTok tendance */}
                  {trendingData?.tiktokHashtags && trendingData.tiktokHashtags.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-green-200">
                      <p className="text-[10px] text-green-700 font-semibold mb-1.5">Hashtags TikTok tendance</p>
                      <div className="flex flex-wrap gap-1">
                        {trendingData.tiktokHashtags.slice(0, 8).map((tag: any) => (
                          <span key={tag.hashtag} className="text-[9px] px-2 py-0.5 bg-white/80 border border-green-200 text-green-800 rounded-full">
                            #{tag.hashtag} {tag.trend === 'up' ? '↑' : tag.trend === 'down' ? '↓' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Google Trends du jour */}
                  {trendingData?.googleTrends && trendingData.googleTrends.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-green-200">
                      <p className="text-[10px] text-green-700 font-semibold mb-1.5">Recherches populaires France</p>
                      <div className="flex flex-wrap gap-1">
                        {trendingData.googleTrends.slice(0, 6).map((t: any, i: number) => (
                          <span key={i} className="text-[9px] px-2 py-0.5 bg-white/80 border border-green-200 text-green-800 rounded-full">
                            🔍 {t.title} {t.traffic && <span className="text-green-500">({t.traffic})</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Widget 4 : CTA Assistant - lien vers la page assistant */}
              <div
                onClick={() => router.push('/assistant')}
                className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100 rounded-lg px-4 py-2 cursor-pointer hover:shadow-sm transition-all group flex items-center gap-2"
              >
                <span className="text-sm">💡</span>
                <p className="text-[11px] text-purple-700">
                  Besoin d&apos;idées ?{' '}
                  <span className="font-semibold group-hover:text-purple-900">Demandez à votre assistant marketing →</span>
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
                      <p className="text-xs font-semibold text-blue-900 mb-2">Comment utiliser cette image ?</p>
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
                            <p className="text-xs font-semibold text-blue-900">🎨 Ajouter comme logo en overlay</p>
                            <p className="text-[10px] text-blue-700">Votre logo sera ajouté par-dessus l'image générée</p>
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
                            <p className="text-xs font-semibold text-blue-900">✏️ Modifier cette image avec l'IA</p>
                            <p className="text-[10px] text-blue-700">L'IA va transformer votre image selon l'actualité</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    <button
                      onClick={() => setLogoUrl(null)}
                      className="text-xs text-red-600 hover:underline font-medium"
                    >
                      🗑️ Supprimer
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-2xl mb-1">📸</div>
                    <p className="text-xs text-neutral-600 mb-2">
                      Glissez ou cliquez un logo/une photo (optionnel)
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
                      {uploading ? 'Upload...' : 'Choisir'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Panel Assistant Prompt */}
            <div ref={assistantPanelRef} className="bg-white rounded-xl border p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Assistant Marketing IA</h3>
                {/* Switch Actualité / Sans actualité */}
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-medium ${useNewsMode ? 'text-neutral-400' : 'text-blue-600'}`}>Sans actualité</span>
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
                  <span className={`text-[10px] font-medium ${useNewsMode ? 'text-blue-600' : 'text-neutral-400'}`}>Avec actualité</span>
                  {/* Info tooltip */}
                  <div className="relative group">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-neutral-200 text-neutral-500 text-[9px] font-bold cursor-help hover:bg-blue-100 hover:text-blue-600 transition-colors">i</span>
                    <div className="absolute right-0 top-6 z-50 hidden group-hover:block w-56 p-2.5 bg-neutral-900 text-white text-[10px] rounded-lg shadow-xl leading-relaxed">
                      <p className="font-semibold mb-1">Avec actualité</p>
                      <p className="mb-2">Génère du contenu en liant une actualité tendance à votre business. Idéal pour surfer sur le buzz et capter l'attention.</p>
                      <p className="font-semibold mb-1">Sans actualité</p>
                      <p>Génère du contenu basé uniquement sur votre business. Parfait pour des posts intemporels (offres, présentation, valeurs...).</p>
                      <div className="absolute -top-1 right-3 w-2 h-2 bg-neutral-900 rotate-45"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Afficher la carte sélectionnée (mode avec actualité ou sélection optionnelle) */}
              {selectedNews && (
                <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                  <p className="text-[10px] font-medium text-blue-900 mb-1">
                    {useNewsMode ? '✓ Actualité sélectionnée :' : '📰 Actualité optionnelle sélectionnée :'}
                  </p>
                  <p className="text-xs font-semibold line-clamp-2 text-blue-800">
                    {selectedNews.title}
                  </p>
                  {!useNewsMode && (
                    <button
                      onClick={() => setSelectedNews(null)}
                      className="text-[10px] text-red-500 hover:underline mt-1"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              )}

              {/* Mode sans actualité : encouragement à décrire le business */}
              {!useNewsMode && !selectedNews && (
                <div className="mb-3 p-3 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <h4 className="text-xs font-bold text-purple-900 mb-2 flex items-center gap-1">
                    🎯 Création libre - Décrivez votre business
                  </h4>
                  <div className="text-[10px] text-purple-800 space-y-1.5">
                    <p className="font-medium">Pour un visuel percutant, renseignez :</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Votre activité :</strong> Que faites-vous exactement ?</li>
                      <li><strong>Votre spécialité :</strong> Qu'est-ce qui vous rend unique ?</li>
                      <li><strong>Vos valeurs :</strong> Quelle image voulez-vous transmettre ?</li>
                      <li><strong>Votre audience :</strong> À qui parlez-vous ?</li>
                    </ul>
                    <p className="mt-2 text-purple-600 italic">
                      Plus votre description est détaillée, meilleur sera le résultat !
                    </p>
                  </div>
                </div>
              )}

              {/* Section d'aide pour créer le lien actualité/business (mode avec actualité) */}
              {selectedNews && useNewsMode && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <h4 className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-1">
                    💡 Comment relier cette actu à votre business ?
                  </h4>
                  <div className="text-[10px] text-blue-800 space-y-1.5">
                    <p className="font-medium">Questions à vous poser :</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Impact direct :</strong> Comment cette actualité affecte-t-elle vos clients ?</li>
                      <li><strong>Opportunité :</strong> Quel problème de vos clients cette actu révèle-t-elle ?</li>
                      <li><strong>Solution :</strong> Comment votre produit/service répond-il à ce contexte ?</li>
                      <li><strong>Valeur ajoutée :</strong> Quelle expertise unique apportez-vous sur ce sujet ?</li>
                    </ul>
                    <div className="mt-2 pt-2 border-t border-blue-300">
                      <p className="font-medium mb-1">Exemple concret :</p>
                      <p className="italic text-blue-700">
                        Actu : "Hausse du prix de l'essence" → Restaurant local :
                        "Alors que se déplacer coûte cher, découvrez notre nouveau service de livraison gratuite dans votre quartier"
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sélecteur de Profil de Communication - Stratégies Marketing */}
              <div ref={promptSectionRef} className="mb-4">
                <label className="block text-sm font-semibold text-neutral-900 mb-3">
                  🎭 Choisissez votre stratégie marketing
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
                            <span className="text-blue-600 font-bold">▸</span> <strong>Stratégie :</strong> {tonePresets[communicationProfile].details}
                          </p>
                          <p className="text-[10px] text-neutral-600">
                            <span className="text-blue-600 font-bold">▸</span> <strong>Exemple :</strong> {tonePresets[communicationProfile].example}
                          </p>
                          <p className="text-[10px] text-neutral-600">
                            <span className="text-blue-600 font-bold">▸</span> <strong>Idéal pour :</strong> {tonePresets[communicationProfile].whenToUse}
                          </p>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              <div className="space-y-2">
                {/* Type de business */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                    Business <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    placeholder="Ex: Restaurant bio, Agence marketing digital, Coach sportif..."
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>

                {/* Description business */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                    Description {!useNewsMode && <span className="text-red-500">*</span>}
                    {!useNewsMode && <span className="text-purple-600 text-[10px] ml-1">(détaillez au max !)</span>}
                  </label>
                  <textarea
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    placeholder={useNewsMode
                      ? "Spécialité, valeur ajoutée... Ex: Restaurant spécialisé dans les produits locaux et de saison, livraison éco-responsable"
                      : "Décrivez en détail votre activité, spécialité, ambiance, valeurs, ce qui vous différencie... Ex: Boulangerie artisanale familiale depuis 1985, pain au levain naturel, farines bio locales, ambiance chaleureuse et authentique, livraison vélo dans le quartier"
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
                    Audience
                  </label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Qui sera intéressé ? Ex: Familles soucieuses de bien manger, professionnels pressés..."
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>

                {/* Nouveaux champs pour guidance détaillée */}
                <div className="border-t pt-2 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-medium text-neutral-600">📝 Direction du contenu</p>

                    {/* Bouton remplissage automatique */}
                    {communicationProfile && (
                      <button
                        onClick={() => {
                          // Auto-fill selon la stratégie
                          const preset = tonePresets[communicationProfile];
                          setTone(preset.tone);
                          setVisualStyle(preset.visualStyle);
                          setEmotionToConvey(preset.emotion);
                          setPublicationGoal(preset.goal);
                          setStoryToTell(preset.story);
                          setImageAngle(preset.imageAngle);
                          setMarketingAngle(preset.marketingAngle);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-md transition-all"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Remplir automatiquement
                      </button>
                    )}
                  </div>

                  {/* Angle de l'image */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      Angle de l'image
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
                      <option value="">-- Choisir une suggestion --</option>
                      <option value="Intégrer harmonieusement l'actualité et le business dans une seule scène cohésive">Intégration harmonieuse</option>
                      <option value="Focus sur la solution que nous apportons face à l'actualité, intégrée naturellement">Focus sur la solution</option>
                      <option value="Métaphore visuelle symbolique reliant l'actu et le business dans une composition unifiée">Métaphore visuelle</option>
                      <option value="Composition dramatique avec actualité en arrière-plan et business au premier plan">Composition en profondeur</option>
                      <option value="Raconter l'histoire dans un environnement cohérent évoquant l'actualité">Environnement narratif</option>
                      <option value="custom">✏️ Personnalisé</option>
                    </select>
                    <input
                      type="text"
                      value={imageAngle}
                      onChange={(e) => setImageAngle(e.target.value)}
                      placeholder="Personnalisez votre angle ou utilisez une suggestion ci-dessus"
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                  {/* Angle marketing */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      Angle marketing
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
                      <option value="">-- Choisir une suggestion --</option>
                      <option value="Profiter de l'opportunité créée par l'actualité">Opportunité créée par l'actu</option>
                      <option value="Résoudre le problème soulevé par l'actualité">Résoudre le problème de l'actu</option>
                      <option value="Se positionner en expert face à l'actualité">Expert face à l'actu</option>
                      <option value="Surfer sur la tendance de l'actualité">Surfer sur la tendance</option>
                      <option value="Anticiper les conséquences de l'actualité">Anticiper les conséquences</option>
                      <option value="custom">✏️ Personnalisé</option>
                    </select>
                    <textarea
                      value={marketingAngle}
                      onChange={(e) => setMarketingAngle(e.target.value)}
                      placeholder="Personnalisez votre angle ou utilisez une suggestion ci-dessus"
                      rows={2}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                    />
                  </div>

                  {/* Histoire à raconter */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      Histoire à raconter
                    </label>
                    <textarea
                      value={storyToTell}
                      onChange={(e) => setStoryToTell(e.target.value)}
                      placeholder="Ex: Dans un contexte où X (actu), nous proposons Y (solution) pour Z (bénéfice client)"
                      rows={2}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                    />
                  </div>

                  {/* But de la publication */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      But de la publication
                    </label>
                    <input
                      type="text"
                      value={publicationGoal}
                      onChange={(e) => setPublicationGoal(e.target.value)}
                      placeholder="Ex: Montrer notre expertise sur cette actu, attirer clients concernés par ce sujet..."
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                  {/* Émotion à transmettre */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      Émotion à transmettre
                    </label>
                    <input
                      type="text"
                      value={emotionToConvey}
                      onChange={(e) => setEmotionToConvey(e.target.value)}
                      placeholder="Ex: Rassurance face à l'actu, optimisme, sentiment d'opportunité, empathie..."
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                  {/* Texte à ajouter (optionnel) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-neutral-700 flex items-center gap-1">
                        Texte à ajouter <span className="text-neutral-400 font-normal">(optionnel)</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateTextSuggestions}
                        className="text-xs px-2 py-1 rounded bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:shadow-md transition-all flex items-center gap-1"
                      >
                        💡 Suggérer un texte
                      </button>
                    </div>

                    <input
                      type="text"
                      value={optionalText}
                      onChange={(e) => setOptionalText(e.target.value)}
                      placeholder="Ex: Offre limitée, -20% ce week-end, Nouvelle collection..."
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />

                    {/* Suggestions intelligentes */}
                    {showTextSuggestions && textSuggestions.length > 0 && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs font-semibold text-blue-900 mb-2">✨ Suggestions basées sur votre actu + business :</p>
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
                              <span className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✓ Utiliser</span>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowTextSuggestions(false)}
                          className="mt-2 text-[10px] text-neutral-500 hover:text-neutral-700 transition-colors"
                        >
                          Masquer les suggestions
                        </button>
                      </div>
                    )}

                  </div>
                </div>

                {/* NOUVELLES QUESTIONS EXPERTES - Section premium */}
                <div className="border-t pt-3 mt-3">
                  <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-3 mb-3">
                    <h3 className="text-xs font-bold text-blue-900 mb-1 flex items-center gap-1">
                      🎯 Questions EXPERTES (optionnel mais recommandé)
                    </h3>
                    <p className="text-[10px] text-blue-700">Ces questions vont multiplier l'impact de votre visuel en créant un lien ultra-fort actualité/business</p>
                  </div>

                  {/* Question 1 : Problème résolu */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      💡 Quel problème résolvez-vous face à cette actualité ?
                    </label>
                    <input
                      type="text"
                      value={problemSolved}
                      onChange={(e) => setProblemSolved(e.target.value)}
                      placeholder="Ex: L'essence coûte cher → Nos légumes viennent à vélo, pas de transport longue distance"
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                  {/* Question 2 : Avantage unique */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      ⭐ Quel est votre avantage unique face à vos concurrents ?
                    </label>
                    <input
                      type="text"
                      value={uniqueAdvantage}
                      onChange={(e) => setUniqueAdvantage(e.target.value)}
                      placeholder="Ex: Seul restaurant 100% circuits courts dans la région, légumes récoltés le matin même"
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>

                  {/* Question 3 : Idée visuelle */}
                  <div className="mb-2">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                      🎨 Avez-vous une idée de visuel en tête ?
                    </label>
                    <textarea
                      value={desiredVisualIdea}
                      onChange={(e) => setDesiredVisualIdea(e.target.value)}
                      placeholder="Ex: Un vélo livrant des légumes frais avec en fond subtil une station-service aux prix élevés"
                      rows={2}
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                    />
                  </div>
                </div>

                {/* Plateforme */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">Plateforme</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                  >
                    <option>Instagram</option>
                    <option>LinkedIn</option>
                    <option>Facebook</option>
                    <option>Twitter/X</option>
                    <option>TikTok</option>
                  </select>
                </div>

                {/* Tonalité (auto-géré par profil) */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">
                    Tonalité <span className="text-blue-600">(du profil)</span>
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
                    Style <span className="text-blue-600">(suggéré par profil)</span>
                  </label>
                  <select
                    value={visualStyle}
                    onChange={(e) => setVisualStyle(e.target.value)}
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                  >
                    <optgroup label="Styles de profil">
                      <option value="Lumineux et épuré">Lumineux et épuré</option>
                      <option value="Moderne et structuré">Moderne et structuré</option>
                      <option value="Énergique et contrasté">Énergique et contrasté</option>
                      <option value="Naturel et chaleureux">Naturel et chaleureux</option>
                    </optgroup>
                    <optgroup label="Autres styles">
                      <option value="Minimaliste et clean">Minimaliste et clean</option>
                      <option value="Coloré et vibrant">Coloré et vibrant</option>
                      <option value="Sombre et dramatique">Sombre et dramatique</option>
                      <option value="Pastel et doux">Pastel et doux</option>
                      <option value="Bold et audacieux">Bold et audacieux</option>
                      <option value="Vintage et rétro">Vintage et rétro</option>
                      <option value="Futuriste et tech">Futuriste et tech</option>
                      <option value="Organique et naturel">Organique et naturel</option>
                      <option value="Luxe et premium">Luxe et premium</option>
                      <option value="Playful et fun">Playful et fun</option>
                      <option value="Élégant et sophistiqué">Élégant et sophistiqué</option>
                      <option value="Dynamique et sportif">Dynamique et sportif</option>
                    </optgroup>
                  </select>
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
                    🖼️ Visuel
                  </button>
                  <button
                    onClick={() => setGenerationMode('video')}
                    className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                      generationMode === 'video'
                        ? 'bg-white text-purple-700 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    🎬 Vidéo
                  </button>
                </div>

                {/* Options vidéo uniquement */}
                {generationMode === 'video' && (
                  <>
                    {/* Section Audio */}
                    <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addAudio}
                          onChange={(e) => setAddAudio(e.target.checked)}
                          className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-xs font-semibold text-neutral-900">
                          🎵 Ajouter de l'audio sur votre vidéo
                        </span>
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
                              ✨ Par IA
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
                              ✍️ Écrire votre texte
                            </button>
                          </div>

                          {audioTextSource === 'manual' && (
                            <div>
                              <textarea
                                value={audioText}
                                onChange={(e) => setAudioText(e.target.value)}
                                placeholder={`Entrez le texte à narrer (max ~${Math.ceil(videoDuration * 2.5)} mots pour ${videoDuration}s)...`}
                                rows={2}
                                maxLength={150}
                                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                              />
                              <p className="text-[10px] text-neutral-500 mt-1">
                                ~{audioText.trim().split(/\s+/).filter(w => w.length > 0).length} mots ({Math.ceil(audioText.trim().split(/\s+/).filter(w => w.length > 0).length / 2.5)}s)
                              </p>
                            </div>
                          )}

                          {audioTextSource === 'ai' && (
                            <p className="text-[10px] text-neutral-600 italic">
                              💡 Le texte audio sera généré automatiquement par l'IA à partir de l'actualité
                            </p>
                          )}

                          {/* Voice Selector */}
                          <div>
                            <label className="block text-[10px] font-medium text-neutral-700 mb-1">Voix</label>
                            <div className="flex flex-wrap gap-1">
                              {([
                                { value: 'nova' as const, label: 'Femme dynamique' },
                                { value: 'shimmer' as const, label: 'Femme douce' },
                                { value: 'alloy' as const, label: 'Mixte neutre' },
                                { value: 'echo' as const, label: 'Homme posé' },
                                { value: 'onyx' as const, label: 'Homme grave' },
                                { value: 'fable' as const, label: 'Conteur' },
                              ]).map((v) => (
                                <button
                                  key={v.value}
                                  type="button"
                                  onClick={() => setSelectedVoice(v.value)}
                                  className={`px-2 py-1 text-[10px] rounded border transition-all ${
                                    selectedVoice === v.value
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-white text-blue-700 border-blue-300 hover:border-blue-400'
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
                          ✨ Ajouter des sous-titres / texte animé
                        </span>
                        <span className="text-[9px] bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded ml-auto">Recommandé</span>
                      </label>

                      {enableAIText && (
                        <div className="mt-2 space-y-2">
                          <p className="text-[10px] text-purple-700">Style du texte:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { key: 'classic', label: 'Classique' },
                              { key: 'minimal', label: 'Discret' },
                              { key: 'impact', label: 'Impact' },
                              { key: 'clean', label: 'Sans fond' },
                              { key: 'wordstay', label: 'Mots progressifs' },
                              { key: 'wordflash', label: 'Mot par mot' },
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
                          <p className="text-[9px] text-purple-600 italic">
                            {addAudio
                              ? '💡 Le texte affiché sera synchronisé avec la narration audio (sous-titres)'
                              : '💡 L\'IA génèrera automatiquement du texte adapté à la vidéo'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Durée de la vidéo */}
                    <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                      <label className="block text-xs font-semibold text-neutral-900 mb-2">
                        ⏱️ Durée de la vidéo: <span className="text-indigo-600">{videoDuration}s</span>
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={30}
                        step={5}
                        value={videoDuration}
                        onChange={(e) => setVideoDuration(Number(e.target.value))}
                        className="w-full h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <div className="flex justify-between text-[9px] text-neutral-500 mt-1">
                        <span>5s</span>
                        <span>10s</span>
                        <span>15s</span>
                        <span>20s</span>
                        <span>25s</span>
                        <span>30s</span>
                      </div>
                      <p className="text-[9px] text-indigo-600 mt-1 italic">
                        💡 15-30s = idéal pour capter l'attention sur les réseaux sociaux
                      </p>
                    </div>
                  </>
                )}

                {/* Bouton de génération */}
                <button
                  onClick={generationMode === 'video' ? handleGenerateVideo : handleGenerate}
                  disabled={generating || generatingVideo || !selectedNews || !businessType.trim()}
                  className={`w-full py-2.5 text-xs font-semibold rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    generationMode === 'video'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {generationMode === 'video'
                    ? (generatingVideo ? videoProgress || 'Génération...' : `🎬 Créer une vidéo (${videoDuration}s)`)
                    : (generating ? 'Génération...' : '🖼️ Générer un visuel')
                  }
                </button>

                {!selectedNews && (
                  <p className="text-[10px] text-amber-600 text-center">
                    ⚠️ Sélectionnez une actualité
                  </p>
                )}
              </div>
            </div>

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
                <h3 className="text-sm font-semibold mb-2">Visuel</h3>
                <div className="relative w-full aspect-square bg-neutral-100 rounded border overflow-hidden">
                  <img
                    src={generatedImageUrl}
                    alt="Visuel généré"
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
                          {loadingStep === 'api' && 'Génération en cours...'}
                          {loadingStep === 'download' && 'Chargement de l\'image...'}
                          {loadingStep === 'ready' && 'Prêt !'}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {loadingStep === 'api' && 'L\'IA crée votre visuel personnalisé'}
                          {loadingStep === 'download' && 'Optimisation et téléchargement'}
                          {loadingStep === 'ready' && 'Votre visuel est disponible'}
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
                      onClick={() => {
                        setShowEditStudio(true);
                        // Utiliser l'image AVEC overlays pour les garder visibles dans le studio
                        setEditVersions([generatedImageUrl]);
                        setSelectedEditVersion(generatedImageUrl);
                      }}
                      className="flex-1 py-2 text-xs bg-blue-600 text-white text-center rounded hover:bg-blue-700 transition-colors"
                    >
                      Éditer
                    </button>
                    <a
                      href={generatedImageUrl}
                      download
                      className="flex-1 py-2 text-xs bg-neutral-900 text-white text-center rounded hover:bg-neutral-800 transition-colors"
                    >
                      Télécharger
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
                      {imageSavedToLibrary ? '✓ Sauvegardé' : savingToLibrary ? 'Sauvegarde...' : '📁 Sauvegarder'}
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
                      Nouveau
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
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                  Vidéo générée
                </h3>
                <div className="relative w-full aspect-video bg-neutral-900 rounded border overflow-hidden">
                  <video
                    src={generatedVideoUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowVideoEditor(!showVideoEditor)}
                      className={`flex-1 py-2 text-xs text-white text-center rounded transition-colors ${
                        showVideoEditor ? 'bg-purple-700' : 'bg-purple-600 hover:bg-purple-700'
                      }`}
                    >
                      {showVideoEditor ? '✕ Fermer l\'éditeur' : 'Éditer'}
                    </button>
                    <a
                      href={generatedVideoUrl}
                      download="keiro-video.mp4"
                      className="flex-1 py-2 text-xs bg-neutral-900 text-white text-center rounded hover:bg-neutral-800 transition-colors"
                    >
                      Télécharger
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
                      {savingToLibrary ? 'Sauvegarde...' : videoSavedToLibrary ? '✓ Sauvegardé' : '📁 Enregistrer dans ma galerie'}
                    </button>
                    <button
                      onClick={() => { setGeneratedVideoUrl(null); setShowVideoEditor(false); }}
                      className="flex-1 py-2 text-xs border rounded hover:bg-neutral-50 transition-colors"
                    >
                      Nouveau
                    </button>
                  </div>
                </div>

                {/* Panneau d'édition vidéo */}
                {showVideoEditor && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    {/* Texte / Sous-titres */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                      <label className="block text-xs font-semibold text-neutral-900">
                        📝 Texte / Sous-titres
                      </label>
                      <textarea
                        value={generatedSubtitleText}
                        onChange={(e) => setGeneratedSubtitleText(e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                        placeholder="Texte à afficher sur la vidéo..."
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { key: 'classic', label: 'Classique' },
                          { key: 'minimal', label: 'Discret' },
                          { key: 'impact', label: 'Impact' },
                          { key: 'clean', label: 'Sans fond' },
                          { key: 'wordstay', label: 'Mots progressifs' },
                          { key: 'wordflash', label: 'Mot par mot' },
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
                    </div>

                    {/* Audio */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                      <label className="block text-xs font-semibold text-neutral-900">
                        🎙️ Audio
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { value: 'nova' as const, label: 'Femme dynamique' },
                          { value: 'shimmer' as const, label: 'Femme douce' },
                          { value: 'alloy' as const, label: 'Mixte neutre' },
                          { value: 'echo' as const, label: 'Homme posé' },
                          { value: 'onyx' as const, label: 'Homme grave' },
                          { value: 'fable' as const, label: 'Conteur' },
                        ].map((voice) => (
                          <button
                            key={voice.value}
                            onClick={() => setSelectedVoice(voice.value)}
                            className={`px-2 py-1 text-[10px] rounded border transition-all ${
                              selectedVoice === voice.value
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-blue-700 border-blue-300 hover:border-blue-400'
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
                            // 1. Générer audio
                            const audioRes = await fetch('/api/generate-audio-tts', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ text: generatedSubtitleText.trim(), targetDuration: 5, voice: selectedVoice, speed: 1.0 })
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
                              // Mettre à jour la vidéo auto-sauvée
                              if (lastSavedVideoId) {
                                fetch('/api/library/save-video', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: lastSavedVideoId, videoUrl: mergeData.mergedUrl })
                                }).catch(() => {});
                              }
                            } else {
                              alert(`Erreur: ${mergeData.error}`);
                            }
                          } catch (err: any) {
                            alert(`Erreur: ${err.message}`);
                          } finally { setVideoEditorMerging(false); }
                        }}
                        disabled={videoEditorMerging || !generatedSubtitleText.trim()}
                        className={`w-full px-3 py-2 rounded text-xs font-medium transition-colors ${
                          videoEditorMerging || !generatedSubtitleText.trim()
                            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {videoEditorMerging ? '⏳ Finalisation en cours...' : '🎙️ Générer/Modifier l\'audio'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Indicateur de génération vidéo en cours */}
            {generatingVideo && !generatedVideoUrl && (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <div>
                    <p className="text-sm font-semibold text-purple-900">Génération vidéo en cours</p>
                    <p className="text-xs text-purple-600">{videoProgress}</p>
                  </div>
                </div>
              </div>
            )}

            {generationError && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700 text-xs">
                {generationError}
              </div>
            )}
          </div>
        </div>

        {/* ===== STUDIO D'ÉDITION - RESPONSIVE MOBILE-FIRST ===== */}
        {showEditStudio && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0">
            <div className="bg-white w-full h-full lg:rounded-xl lg:max-w-7xl lg:h-[90vh] lg:m-4 flex flex-col">
              {/* Header du studio */}
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-lg font-semibold">Studio d'Édition</h2>
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
                    🖼️ Image
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
                    ✏️ Éditer
                  </button>
                  <button
                    onClick={() => setActiveTab('text')}
                    className={`flex-1 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'text'
                        ? 'border-purple-500 text-purple-600'
                        : 'border-transparent text-neutral-600'
                    }`}
                  >
                    ✨ Texte
                  </button>
                  <button
                    onClick={() => setActiveTab('versions')}
                    className={`flex-1 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'versions'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-neutral-600'
                    }`}
                  >
                    📋 Versions ({editVersions.length})
                  </button>
                </div>
              </div>

              {/* MOBILE : Contenu des onglets (< lg) */}
              <div className="flex-1 overflow-y-auto lg:hidden">
                {/* Onglet Image */}
                {activeTab === 'image' && (
                  <div className="h-full bg-neutral-50 flex items-center justify-center p-4">
                    {selectedEditVersion ? (
                      <img
                        src={selectedEditVersion}
                        alt="Image sélectionnée"
                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                      />
                    ) : generatedImageUrl ? (
                      <img
                        src={generatedImageUrl}
                        alt="Image générée"
                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                      />
                    ) : (
                      <p className="text-neutral-400 text-sm">Aucune image</p>
                    )}
                  </div>
                )}

                {/* Onglet Éditer */}
                {activeTab === 'edit' && (
                  <div className="p-4 space-y-4">
                    <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
                      <h3 className="text-base font-semibold mb-3">Assistant d'Édition</h3>

                      {/* Logo (optionnel) */}
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-neutral-800 mb-2">
                          🎨 Logo (optionnel)
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
                              📤 Ajouter votre logo
                            </label>
                            <p className="text-xs text-neutral-600 mt-2">Optionnel - Pour renforcer votre branding</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-purple-200">
                            <img src={logoUrl} alt="Logo" className="w-12 h-12 object-contain rounded border" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-neutral-700">Logo ajouté</p>
                              <p className="text-xs text-neutral-500">Sera en overlay sur l'image</p>
                            </div>
                            <button
                              onClick={() => setLogoUrl('')}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Retirer le logo"
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
                            <label className="block text-sm font-semibold text-neutral-800 mb-2">Position du logo</label>
                            <div className="grid grid-cols-2 gap-2">
                              {([
                                { pos: 'top-left', label: '↖️ Haut gauche' },
                                { pos: 'top-right', label: '↗️ Haut droite' },
                                { pos: 'bottom-left', label: '↙️ Bas gauche' },
                                { pos: 'bottom-right', label: '↘️ Bas droite' }
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

                      {/* Mode sélection */}
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-2">Mode de modification :</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditMode('precise')}
                            className={`flex-1 text-sm px-4 py-3 rounded-lg font-medium min-h-[44px] transition-colors ${
                              editMode === 'precise'
                                ? 'bg-purple-600 text-white'
                                : 'bg-white text-purple-800 border border-purple-300 hover:bg-purple-100'
                            }`}
                          >
                            🎯 Précise
                          </button>
                          <button
                            onClick={() => setEditMode('creative')}
                            className={`flex-1 text-sm px-4 py-3 rounded-lg font-medium min-h-[44px] transition-colors ${
                              editMode === 'creative'
                                ? 'bg-purple-600 text-white'
                                : 'bg-white text-purple-800 border border-purple-300 hover:bg-purple-100'
                            }`}
                          >
                            ✨ Créative
                          </button>
                        </div>
                        <p className="text-xs text-purple-700 mt-2">
                          {editMode === 'precise'
                            ? '🎯 Modifie des détails spécifiques en gardant l\'image proche de l\'original'
                            : '✨ Permet des transformations plus importantes et créatives'}
                        </p>
                      </div>

                      {/* Textarea pour prompt */}
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-neutral-800 mb-2">
                          ✏️ Décrivez vos modifications :
                        </label>
                        <textarea
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          rows={5}
                          className="w-full text-base rounded-lg border-2 border-purple-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                          placeholder={
                            editMode === 'precise'
                              ? 'Ex: Améliorer la lumière naturelle, saturer les couleurs chaudes, ajouter du contraste, flouter légèrement l\'arrière-plan...'
                              : 'Ex: Style vintage années 80, ambiance golden hour, effet peinture impressionniste, look magazine luxe...'
                          }
                        />
                        <div className="flex items-start gap-2 mt-2">
                          <svg className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs text-neutral-600 leading-relaxed">
                            <span className="font-semibold text-neutral-800">Astuce :</span> Soyez précis pour de meilleurs résultats.
                            Décrivez les <span className="font-semibold">couleurs</span>, les <span className="font-semibold">éléments</span> à modifier,
                            ou le <span className="font-semibold">style</span> souhaité.
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

                          if (!editPrompt.trim() || !selectedEditVersion) {
                            return; // Le bouton est déjà disabled, pas besoin d'alert
                          }
                          setEditingImage(true);
                          try {
                            console.log('[Edit Studio] Editing image with Seedream 3.0 i2i');
                            console.log('[Edit Studio] Image URL:', selectedEditVersion?.substring(0, 100));
                            console.log('[Edit Studio] Prompt:', editPrompt);

                            // Appeler l'API Seedream 3.0 i2i
                            const res = await fetch('/api/seedream/i2i', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                prompt: editPrompt,
                                image: selectedEditVersion,
                                guidance_scale: editMode === 'precise' ? 5.5 : 7.5,
                              }),
                            });

                            const data = await res.json();
                            console.log('[Edit Studio] Response:', data);

                            if (!data?.ok) {
                              console.error('[Edit Studio] API Error:', data?.error);
                              throw new Error(data?.error || 'Édition échouée');
                            }

                            const newVersion = data.imageUrl;
                            setEditVersions([...editVersions, newVersion]);
                            setSelectedEditVersion(newVersion);
                            setEditPrompt('');
                            setActiveTab('image');

                            // Incrémenter le compteur d'éditions après succès
                            editLimit.incrementCount();

                            // Succès silencieux - l'utilisateur voit déjà la nouvelle image
                          } catch (e: any) {
                            console.error('[Edit Studio] Error:', e);
                            const userMessage = 'Impossible d\'éditer l\'image. Veuillez réessayer.';
                            alert(userMessage);
                          } finally {
                            setEditingImage(false);
                          }
                        }}
                        disabled={editingImage || !editPrompt.trim() || !selectedEditVersion}
                        className="w-full py-4 text-base bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] transition-colors"
                      >
                        {editingImage ? 'Édition en cours...' : '✏️ Éditer l\'image'}
                      </button>
                    </div>

                    {/* Exemples de modifications */}
                    <div className="bg-neutral-50 rounded-lg border p-4">
                      <p className="text-sm font-medium mb-3">💡 Exemples concrets :</p>
                      <div className="space-y-2">
                        {[
                          'Rendre l\'arrière-plan flou style bokeh professionnel',
                          'Ajouter un effet cinématique avec vignette sombre',
                          'Augmenter la luminosité et le contraste de +30%',
                          'Style Instagram : filtre chaud avec saturation élevée',
                          'Faire ressortir le sujet principal avec netteté accrue',
                          'Appliquer un grain film argentique vintage'
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
                      <h3 className="text-xs font-semibold mb-2 text-neutral-700">👁️ Aperçu en temps réel</h3>
                      <div className="relative aspect-square bg-neutral-100 rounded overflow-hidden">
                        {isGeneratingPreview && (
                          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                            <div className="text-xs text-neutral-600">Génération...</div>
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
                      <h3 className="text-base font-semibold mb-3">✨ Personnalisation du Texte</h3>

                      {/* Texte */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Texte</label>
                        <textarea
                          value={overlayText}
                          onChange={(e) => setOverlayText(e.target.value)}
                          placeholder="Écrivez votre texte accrocheur..."
                          rows={3}
                          className="w-full px-4 py-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 resize-none"
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                          {overlayText.length} caractères • Max 100 recommandé
                        </p>
                      </div>

                      {/* Templates */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Templates</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'headline', icon: '📰', name: 'Headline' },
                            { id: 'cta', icon: '🎯', name: 'CTA' },
                            { id: 'minimal', icon: '✨', name: 'Minimal' },
                            { id: 'bold', icon: '💪', name: 'Bold' },
                            { id: 'elegant', icon: '👔', name: 'Élégant' },
                            { id: 'modern', icon: '🚀', name: 'Moderne' },
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
                                  setTextPosition('top-center');
                                } else if (template.id === 'cta') {
                                  setTextColor('#ffffff');
                                  setTextBackgroundColor('#3b82f6');
                                  setBackgroundStyle('solid');
                                  setTextPosition('bottom-center');
                                } else if (template.id === 'minimal') {
                                  setTextColor('#000000');
                                  setTextBackgroundColor('rgba(255, 255, 255, 0.9)');
                                  setBackgroundStyle('solid');
                                  setTextPosition('center');
                                } else if (template.id === 'bold') {
                                  setTextColor('#ffffff');
                                  setTextBackgroundColor('rgba(220, 38, 38, 0.9)');
                                  setBackgroundStyle('solid');
                                  setTextPosition('center');
                                } else if (template.id === 'elegant') {
                                  setTextColor('#1f2937');
                                  setTextBackgroundColor('rgba(255, 255, 255, 0.95)');
                                  setBackgroundStyle('blur');
                                  setTextPosition('center');
                                } else if (template.id === 'modern') {
                                  setTextColor('#ffffff');
                                  setTextBackgroundColor('linear-gradient(135deg, #3b82f6, #06b6d4)');
                                  setBackgroundStyle('gradient');
                                  setTextPosition('bottom-center');
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
                                {template.id === 'headline' && 'Titre impactant'}
                                {template.id === 'cta' && 'Bouton d\'action'}
                                {template.id === 'minimal' && 'Simple & élégant'}
                                {template.id === 'bold' && 'Gras & audacieux'}
                                {template.id === 'elegant' && 'Sophistiqué'}
                                {template.id === 'modern' && 'Gradient dynamique'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Position */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Position</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { pos: 'top-left', emoji: '↖️', label: 'Haut gauche' },
                            { pos: 'top-center', emoji: '⬆️', label: 'Haut centre' },
                            { pos: 'top-right', emoji: '↗️', label: 'Haut droite' },
                            { pos: 'center-left', emoji: '⬅️', label: 'Centre gauche' },
                            { pos: 'center', emoji: '⏺️', label: 'Centre' },
                            { pos: 'center-right', emoji: '➡️', label: 'Centre droite' },
                            { pos: 'bottom-left', emoji: '↙️', label: 'Bas gauche' },
                            { pos: 'bottom-center', emoji: '⬇️', label: 'Bas centre' },
                            { pos: 'bottom-right', emoji: '↘️', label: 'Bas droite' },
                          ].map((item) => (
                            <button
                              key={item.pos}
                              onClick={() => setTextPosition(item.pos as any)}
                              className={`px-2 py-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-1 ${
                                textPosition === item.pos
                                  ? 'bg-purple-500 text-white'
                                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                              }`}
                            >
                              <span className="text-lg">{item.emoji}</span>
                              <span className="text-[10px] leading-tight">{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Couleurs */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Couleur texte</label>
                          <input
                            type="color"
                            value={textColor}
                            onChange={(e) => setTextColor(e.target.value)}
                            className="w-full h-10 rounded-lg border border-neutral-300 cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Couleur fond</label>
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
                          Taille police ({fontSize}pt)
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
                        <label className="block text-sm font-medium mb-2">Police</label>
                        <select
                          value={fontFamily}
                          onChange={(e) => setFontFamily(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm"
                        >
                          <option value="inter">🔤 Inter - Moderne</option>
                          <option value="montserrat">💪 Montserrat - Gras</option>
                          <option value="bebas">📰 Bebas Neue - Impact</option>
                          <option value="roboto">⚙️ Roboto - Classique</option>
                          <option value="playfair">✨ Playfair - Élégant</option>
                        </select>
                      </div>

                      {/* Style de fond */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Style de fond</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 'clean', emoji: '🔲', label: 'Sans fond' },
                            { value: 'transparent', emoji: '👻', label: 'Transparent' },
                            { value: 'solid', emoji: '⬛', label: 'Solide' },
                            { value: 'gradient', emoji: '🌈', label: 'Dégradé' },
                            { value: 'blur', emoji: '💨', label: 'Flou' },
                            { value: 'outline', emoji: '⭕', label: 'Contour' }
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

                      {/* Bouton Appliquer */}
                      <button
                        onClick={async () => {
                          if (!overlayText.trim()) {
                            return; // Pas de texte à ajouter
                          }

                          // IMPORTANT : Toujours utiliser l'image ORIGINALE générée (sans texte)
                          // pour éviter d'avoir du texte superposé
                          const imageToEdit = originalImageUrl || generatedImageUrl;
                          if (!imageToEdit) return;

                          try {
                            // Convertir position en format simple pour addTextOverlay
                            let simplePosition: 'top' | 'center' | 'bottom' = 'center';
                            if (textPosition.startsWith('top')) simplePosition = 'top';
                            else if (textPosition.startsWith('bottom')) simplePosition = 'bottom';

                            const result = await addTextOverlay(imageToEdit, {
                              text: overlayText,
                              position: simplePosition,
                              fontSize: fontSize,
                              fontFamily: fontFamily,
                              textColor: textColor,
                              backgroundColor: textBackgroundColor,
                              backgroundStyle: backgroundStyle,
                            });

                            // Ajouter cette nouvelle version
                            setEditVersions([...editVersions, result]);
                            setSelectedEditVersion(result);
                          } catch (error) {
                            console.error('Error applying text overlay:', error);
                            alert('Impossible d\'appliquer le texte. Vérifiez votre image.');
                          }
                        }}
                        disabled={!overlayText.trim()}
                        className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ✓ Appliquer le texte
                      </button>
                    </div>
                  </div>
                )}

                {/* Onglet Versions */}
                {activeTab === 'versions' && (
                  <div className="p-4">
                    <h3 className="text-base font-semibold mb-3">
                      Versions ({editVersions.length})
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
                            src={version}
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
                                      alert('Vous devez être connecté pour sauvegarder dans votre galerie');
                                      return;
                                    }

                                    // Upload vers Supabase Storage si data URL
                                    let finalImageUrl = version;
                                    if (version.startsWith('data:')) {
                                      console.log('[EditStudio/Mobile] Data URL detected, uploading to Storage...');
                                      const response = await fetch(version);
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
                                        alert(`❌ Erreur d'upload : ${uploadError.message}`);
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
                                      // Toast de succès
                                      const toast = document.createElement('div');
                                      toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
                                      toast.innerHTML = '✅ Sauvegardé dans votre galerie ! Redirection...';
                                      document.body.appendChild(toast);

                                      // Rediriger vers la galerie après 1.5s
                                      setTimeout(() => {
                                        router.push('/library');
                                      }, 1500);
                                    } else {
                                      alert(`❌ Erreur : ${data.error || 'Impossible de sauvegarder'}`);
                                    }
                                  } catch (error: any) {
                                    console.error('Error saving to library:', error);
                                    alert(`❌ Erreur : ${error.message || 'Vérifiez votre connexion'}`);
                                  }
                                }}
                                className="py-2 text-sm bg-cyan-600 text-white rounded-lg font-medium min-h-[44px] hover:bg-cyan-700 transition-colors"
                              >
                                💾 Galerie
                              </button>
                              <div className="flex gap-2">
                                <a
                                  href={version}
                                  download={`keiro-v${idx + 1}.png`}
                                  className="flex-1 py-2 text-sm bg-blue-600 text-white text-center rounded-lg font-medium min-h-[44px] hover:bg-blue-700 transition-colors flex items-center justify-center"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  ⬇️ Télécharger
                                </a>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('Supprimer cette version ?')) {
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
                  <h3 className="text-sm font-semibold mb-3">Versions ({editVersions.length})</h3>
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
                        src={version}
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
                                  alert('Vous devez être connecté pour sauvegarder dans votre galerie');
                                  return;
                                }

                                // Upload vers Supabase Storage si data URL
                                let finalImageUrl = version;
                                if (version.startsWith('data:')) {
                                  console.log('[EditStudio/Desktop] Data URL detected, uploading to Storage...');
                                  const response = await fetch(version);
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
                                    alert(`❌ Erreur d'upload : ${uploadError.message}`);
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
                                  // Toast de succès
                                  const toast = document.createElement('div');
                                  toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
                                  toast.innerHTML = '✅ Sauvegardé dans votre galerie ! Redirection...';
                                  document.body.appendChild(toast);

                                  // Rediriger vers la galerie après 1.5s
                                  setTimeout(() => {
                                    router.push('/library');
                                  }, 1500);
                                } else {
                                  alert(`❌ Erreur : ${data.error || 'Impossible de sauvegarder'}`);
                                }
                              } catch (error: any) {
                                console.error('Error saving to library:', error);
                                alert(`❌ Erreur : ${error.message || 'Vérifiez votre connexion'}`);
                              }
                            }}
                            className="py-1 text-[10px] bg-cyan-600 text-white rounded hover:bg-cyan-700 font-medium transition-colors"
                          >
                            💾 Galerie
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
                                if (confirm('Supprimer cette version ?')) {
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
                  {isGeneratingPreview && activeTab === 'text' && (
                    <div className="absolute top-2 right-2 bg-white/90 px-3 py-1 rounded-lg text-xs font-medium text-neutral-700 shadow-md z-10">
                      Génération preview...
                    </div>
                  )}
                  {(textPreviewUrl && activeTab === 'text' && overlayText.trim()) ? (
                    <img
                      src={textPreviewUrl}
                      alt="Preview avec texte"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : selectedEditVersion ? (
                    <img
                      src={selectedEditVersion}
                      alt="Image sélectionnée"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : generatedImageUrl ? (
                    <img
                      src={generatedImageUrl}
                      alt="Image générée"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <p className="text-neutral-400 text-sm">Aucune image</p>
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
                      ✏️ Éditer
                    </button>
                    <button
                      onClick={() => setActiveTab('text')}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                        activeTab === 'text'
                          ? 'bg-purple-500 text-white'
                          : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      ✨ Texte
                    </button>
                  </div>

                  {/* Contenu de l'onglet Éditer */}
                  {activeTab === 'edit' && (
                  <>
                  <div className="bg-purple-50 rounded-lg border border-purple-200 p-3">
                    <h3 className="text-base font-semibold mb-2">Assistant d'Édition</h3>

                    {/* Logo (optionnel) */}
                    <div className="mb-3">
                      <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                        🎨 Logo (optionnel)
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
                            📤 Ajouter logo
                          </label>
                          <p className="text-[9px] text-neutral-600 mt-1.5">Optionnel - Branding</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-purple-200">
                          <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded border" />
                          <div className="flex-1">
                            <p className="text-[10px] font-medium text-neutral-700">Logo ajouté</p>
                            <p className="text-[9px] text-neutral-500">En overlay</p>
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
                          <label className="block text-[10px] font-semibold text-neutral-800 mb-1.5">Position du logo</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {([
                              { pos: 'top-left', label: '↖️ Haut gauche' },
                              { pos: 'top-right', label: '↗️ Haut droite' },
                              { pos: 'bottom-left', label: '↙️ Bas gauche' },
                              { pos: 'bottom-right', label: '↘️ Bas droite' }
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

                    {/* Mode d'édition */}
                    <div className="mb-3">
                      <p className="text-xs font-medium mb-1.5">Mode de modification :</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditMode('precise')}
                          className={`flex-1 text-[10px] px-2 py-1.5 rounded transition ${
                            editMode === 'precise'
                              ? 'bg-purple-600 text-white font-medium'
                              : 'bg-white text-purple-800 border border-purple-300 hover:bg-purple-100'
                          }`}
                        >
                          🎯 Précise
                        </button>
                        <button
                          onClick={() => setEditMode('creative')}
                          className={`flex-1 text-[10px] px-2 py-1.5 rounded transition ${
                            editMode === 'creative'
                              ? 'bg-purple-600 text-white font-medium'
                              : 'bg-white text-purple-800 border border-purple-300 hover:bg-purple-100'
                          }`}
                        >
                          ✨ Créative
                        </button>
                      </div>
                      <p className="text-[9px] text-purple-700 mt-1">
                        {editMode === 'precise'
                          ? '🎯 Modifie des détails spécifiques en gardant l\'image proche de l\'original'
                          : '✨ Permet des transformations plus importantes et créatives'}
                      </p>
                    </div>

                    {/* Prompt de modification */}
                    <div className="mb-3">
                      <label className="block text-xs font-semibold text-neutral-800 mb-1">
                        ✏️ Décrivez vos modifications :
                      </label>
                      <textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder={
                          editMode === 'precise'
                            ? 'Ex: Améliorer lumière, saturer couleurs, ajouter contraste, flouter arrière-plan...'
                            : 'Ex: Style vintage 80s, ambiance golden hour, effet peinture, look magazine luxe...'
                        }
                        rows={4}
                        className="w-full text-xs rounded border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <svg className="w-3 h-3 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-[9px] text-neutral-600 leading-relaxed">
                          <span className="font-semibold text-neutral-800">Astuce :</span> Soyez précis (couleurs, éléments, style) pour de meilleurs résultats.
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

                        if (!editPrompt.trim() || !selectedEditVersion) {
                          return; // Le bouton est déjà disabled, pas besoin d'alert
                        }
                        setEditingImage(true);
                        try {
                          console.log('[Edit Studio] Editing image with Seedream 3.0 i2i');
                          console.log('[Edit Studio] Image URL:', selectedEditVersion?.substring(0, 100));
                          console.log('[Edit Studio] Prompt:', editPrompt);

                          // Appeler l'API Seedream 3.0 i2i
                          const res = await fetch('/api/seedream/i2i', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              prompt: editPrompt,
                              image: selectedEditVersion,
                              guidance_scale: editMode === 'precise' ? 5.5 : 7.5,
                            }),
                          });

                          const data = await res.json();
                          console.log('[Edit Studio] Response:', data);

                          if (!data?.ok) {
                            console.error('[Edit Studio] API Error:', data?.error);
                            throw new Error(data?.error || 'Édition échouée');
                          }

                          const newVersion = data.imageUrl;
                          setEditVersions([...editVersions, newVersion]);
                          setSelectedEditVersion(newVersion);
                          setEditPrompt('');

                          // Incrémenter le compteur d'éditions après succès
                          editLimit.incrementCount();

                          // Succès silencieux - l'utilisateur voit déjà la nouvelle version
                        } catch (e: any) {
                          console.error('[Edit Studio] Error:', e);
                          const userMessage = 'Impossible d\'éditer l\'image. Veuillez réessayer.';
                          alert(userMessage);
                        } finally {
                          setEditingImage(false);
                        }
                      }}
                      disabled={editingImage || !editPrompt.trim() || !selectedEditVersion}
                      className="w-full py-2 text-xs bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {editingImage ? 'Édition en cours...' : '✏️ Éditer'}
                    </button>

                    {/* Actions */}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setShowEditStudio(false)}
                        className="w-full py-1.5 text-xs border rounded hover:bg-neutral-50"
                      >
                        Fermer
                      </button>
                    </div>
                  </div>

                  {/* Exemples de modifications */}
                  <div className="bg-neutral-50 rounded-lg border p-2">
                    <p className="text-[10px] font-medium mb-1.5">💡 Exemples de modifications :</p>
                    <div className="space-y-1">
                      <button
                        onClick={() => setEditPrompt('Ajouter un filtre chaleureux et lumineux')}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • Filtre chaleureux
                      </button>
                      <button
                        onClick={() => setEditPrompt('Rendre l\'arrière-plan flou pour mettre en valeur le sujet')}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • Flou d'arrière-plan
                      </button>
                      <button
                        onClick={() => setEditPrompt('Augmenter la luminosité et le contraste de +30%')}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • Contraste luminosité
                      </button>
                      <button
                        onClick={() => setEditPrompt('Effet cinématique avec vignette sombre')}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • Style cinéma
                      </button>
                      <button
                        onClick={() => setEditPrompt('Grain film argentique vintage')}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • Grain vintage
                      </button>
                    </div>
                  </div>
                  </>
                  )}

                  {/* Contenu de l'onglet Texte */}
                  {activeTab === 'text' && (
                  <div className="bg-purple-50 rounded-lg border border-purple-200 p-3">
                    <h3 className="text-base font-semibold mb-2">✨ Personnalisation du Texte</h3>

                    {/* Texte */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1.5">Texte</label>
                      <textarea
                        value={overlayText}
                        onChange={(e) => setOverlayText(e.target.value)}
                        placeholder="Écrivez votre texte accrocheur..."
                        rows={2}
                        className="w-full px-2 py-1.5 rounded border border-neutral-300 text-[10px] focus:outline-none focus:border-purple-500 resize-none"
                      />
                      <p className="text-[9px] text-neutral-500 mt-1">
                        {overlayText.length} caractères
                      </p>
                    </div>

                    {/* Templates */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1.5">Templates</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'headline', icon: '📰', label: 'Titre' },
                          { id: 'cta', icon: '🎯', label: 'CTA' },
                          { id: 'minimal', icon: '✨', label: 'Simple' },
                          { id: 'bold', icon: '💪', label: 'Gras' },
                          { id: 'elegant', icon: '👔', label: 'Élégant' },
                          { id: 'modern', icon: '🚀', label: 'Moderne' },
                        ].map((template) => (
                          <button
                            key={template.id}
                            onClick={() => {
                              setTextTemplate(template.id as any);
                              if (template.id === 'headline') {
                                setTextColor('#ffffff');
                                setTextBackgroundColor('rgba(0, 0, 0, 0.5)');
                                setBackgroundStyle('transparent');
                                setTextPosition('top-center');
                              } else if (template.id === 'cta') {
                                setTextColor('#ffffff');
                                setTextBackgroundColor('#3b82f6');
                                setBackgroundStyle('solid');
                                setTextPosition('bottom-center');
                              } else if (template.id === 'minimal') {
                                setTextColor('#000000');
                                setTextBackgroundColor('rgba(255, 255, 255, 0.9)');
                                setBackgroundStyle('solid');
                                setTextPosition('center');
                              } else if (template.id === 'bold') {
                                setTextColor('#ffffff');
                                setTextBackgroundColor('rgba(220, 38, 38, 0.9)');
                                setBackgroundStyle('solid');
                                setTextPosition('center');
                              } else if (template.id === 'elegant') {
                                setTextColor('#1f2937');
                                setTextBackgroundColor('rgba(255, 255, 255, 0.95)');
                                setBackgroundStyle('blur');
                                setTextPosition('center');
                              } else if (template.id === 'modern') {
                                setTextColor('#ffffff');
                                setTextBackgroundColor('linear-gradient(135deg, #3b82f6, #06b6d4)');
                                setBackgroundStyle('gradient');
                                setTextPosition('bottom-center');
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
                      <label className="block text-xs font-medium mb-1.5">Position</label>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { pos: 'top-left', emoji: '↖️', label: 'Haut G' },
                          { pos: 'top-center', emoji: '⬆️', label: 'Haut C' },
                          { pos: 'top-right', emoji: '↗️', label: 'Haut D' },
                          { pos: 'center-left', emoji: '⬅️', label: 'Centre G' },
                          { pos: 'center', emoji: '⏺️', label: 'Centre' },
                          { pos: 'center-right', emoji: '➡️', label: 'Centre D' },
                          { pos: 'bottom-left', emoji: '↙️', label: 'Bas G' },
                          { pos: 'bottom-center', emoji: '⬇️', label: 'Bas C' },
                          { pos: 'bottom-right', emoji: '↘️', label: 'Bas D' },
                        ].map((item) => (
                          <button
                            key={item.pos}
                            onClick={() => setTextPosition(item.pos as any)}
                            className={`px-1 py-1 rounded text-[9px] transition-all flex flex-col items-center ${
                              textPosition === item.pos
                                ? 'bg-purple-500 text-white'
                                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                            }`}
                          >
                            <span className="text-xs">{item.emoji}</span>
                            <span className="leading-none">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Couleurs */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <label className="block text-xs font-medium mb-1">Couleur texte</label>
                        <input
                          type="color"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className="w-full h-8 rounded border border-neutral-300 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Couleur fond</label>
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
                        Taille ({fontSize}pt)
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
                      <label className="block text-xs font-medium mb-1">Police</label>
                      <select
                        value={fontFamily}
                        onChange={(e) => setFontFamily(e.target.value as any)}
                        className="w-full px-2 py-1 rounded border border-neutral-300 text-[10px]"
                      >
                        <option value="inter">🔤 Inter - Moderne</option>
                        <option value="montserrat">💪 Montserrat - Gras</option>
                        <option value="bebas">📰 Bebas Neue - Impact</option>
                        <option value="roboto">⚙️ Roboto - Classique</option>
                        <option value="playfair">✨ Playfair - Élégant</option>
                      </select>
                    </div>

                    {/* Style de fond */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1">Style de fond</label>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          { value: 'transparent', emoji: '👻', label: 'Transparent' },
                          { value: 'solid', emoji: '⬛', label: 'Solide' },
                          { value: 'gradient', emoji: '🌈', label: 'Dégradé' },
                          { value: 'blur', emoji: '💨', label: 'Flou' }
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

                    {/* Bouton Appliquer */}
                    <button
                      onClick={async () => {
                        if (!overlayText.trim()) return;
                        const imageToEdit = selectedEditVersion || generatedImageUrl;
                        if (!imageToEdit) return;

                        try {
                          let simplePosition: 'top' | 'center' | 'bottom' = 'center';
                          if (textPosition.startsWith('top')) simplePosition = 'top';
                          else if (textPosition.startsWith('bottom')) simplePosition = 'bottom';

                          const result = await addTextOverlay(imageToEdit, {
                            text: overlayText,
                            position: simplePosition,
                            fontSize: fontSize,
                            fontFamily: fontFamily,
                            textColor: textColor,
                            backgroundColor: textBackgroundColor,
                            backgroundStyle: backgroundStyle,
                          });

                          setEditVersions([...editVersions, result]);
                          setSelectedEditVersion(result);
                        } catch (error) {
                          console.error('Error applying text overlay:', error);
                          alert('Impossible d\'appliquer le texte. Vérifiez votre image.');
                        }
                      }}
                      disabled={!overlayText.trim()}
                      className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-xs font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ✓ Appliquer le texte
                    </button>
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

      </div>
    </div>
  );
}
