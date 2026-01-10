'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import SubscriptionModal from '@/components/SubscriptionModal';
import EmailGateModal from '@/components/EmailGateModal';
import SignupGateModal from '@/components/SignupGateModal';
import { useGenerationLimit } from '@/hooks/useGenerationLimit';
import { useEditLimit } from '@/hooks/useEditLimit';
import { supabase } from '@/lib/supabase';
import { generateTextSuggestions } from '@/lib/text-suggestion';
import { addTextOverlay } from '@/lib/canvas-text-overlay';
import { addWatermark, isFreemiumUser } from '@/lib/add-watermark';

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

const CATEGORIES = [
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
  'International'
];

/* ---------------- Page principale ---------------- */
export default function GeneratePage() {
  /* --- États pour les actualités --- */
  const [category, setCategory] = useState<string>('Dernières news');
  const [searchQuery, setSearchQuery] = useState('');
  const [allNewsItems, setAllNewsItems] = useState<NewsCard[]>([]); // Toutes les news en cache
  const [loading, setLoading] = useState(true); // TRUE au départ pour afficher "Chargement..."
  const [error, setError] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsCard | null>(null);

  /* --- Calculer les catégories qui ont au moins une news --- */
  const availableCategories = useMemo(() => {
    const categoriesWithNews = new Set<string>();
    allNewsItems.forEach((item) => {
      if (item.category) {
        categoriesWithNews.add(item.category);
      }
    });
    // "Dernières news" est toujours disponible, puis filtrer les autres
    const filtered = CATEGORIES.filter((cat) =>
      cat === 'Dernières news' || categoriesWithNews.has(cat)
    );
    return filtered;
  }, [allNewsItems]);

  /* --- Filtrer les news selon catégorie et recherche --- */
  const filteredNews = useMemo(() => {
    let items = allNewsItems;

    // Filtre spécial pour "Dernières news" : toutes les news triées par date
    if (category === 'Dernières news') {
      items = [...allNewsItems].sort((a, b) => {
        // Trier par date décroissante (les plus récentes en premier)
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

  /* --- États pour l'upload logo/photo --- */
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
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
  const [tone, setTone] = useState('Professionnel');
  const [visualStyle, setVisualStyle] = useState('Moderne et épuré');
  const [specialist, setSpecialist] = useState<string>('');

  // NOUVELLES questions EXPERTES pour personnalisation ultra-précise
  const [problemSolved, setProblemSolved] = useState(''); // Quel problème vous résolvez face à cette actu
  const [uniqueAdvantage, setUniqueAdvantage] = useState(''); // Votre avantage unique vs concurrence
  const [desiredVisualIdea, setDesiredVisualIdea] = useState(''); // Idée vague du visuel souhaité

  /* --- États pour le sélecteur de profil de communication --- */
  const [communicationProfile, setCommunicationProfile] = useState<'inspirant' | 'expert' | 'urgent' | 'conversationnel'>('inspirant');

  // Presets de tons par profil
  const tonePresets = {
    inspirant: {
      tone: 'Inspirant et chaleureux',
      emotion: 'Inspiration et espoir',
      goal: 'Inspirer et créer une connexion émotionnelle',
      story: 'Transformation et réussite humaine',
      visualStyle: 'Lumineux et épuré',
      icon: '✨',
      label: 'Inspirant'
    },
    expert: {
      tone: 'Professionnel et pédagogique',
      emotion: 'Confiance et crédibilité',
      goal: 'Éduquer et établir une autorité',
      story: 'Expertise et valeur apportée',
      visualStyle: 'Moderne et structuré',
      icon: '🎯',
      label: 'Expert'
    },
    urgent: {
      tone: 'Dynamique et percutant',
      emotion: 'Urgence et excitation',
      goal: 'Pousser à l\'action immédiate',
      story: 'Opportunité limitée et bénéfices concrets',
      visualStyle: 'Énergique et contrasté',
      icon: '⚡',
      label: 'Urgent'
    },
    conversationnel: {
      tone: 'Amical et accessible',
      emotion: 'Proximité et authenticité',
      goal: 'Créer du dialogue et de l\'engagement',
      story: 'Expériences partagées et humanité',
      visualStyle: 'Naturel et chaleureux',
      icon: '💬',
      label: 'Dialogue'
    }
  };

  /* --- États pour la génération --- */
  const [generating, setGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  /* --- États pour l'éditeur de texte overlay intégré --- */
  const [overlayText, setOverlayText] = useState('');
  const [textPosition, setTextPosition] = useState<'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'>('center');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textBackgroundColor, setTextBackgroundColor] = useState('rgba(0, 0, 0, 0.5)');
  const [fontSize, setFontSize] = useState(60);
  const [fontFamily, setFontFamily] = useState<'inter' | 'montserrat' | 'bebas' | 'roboto' | 'playfair'>('inter');
  const [backgroundStyle, setBackgroundStyle] = useState<'transparent' | 'solid' | 'gradient' | 'blur'>('transparent');
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

  /* --- Fetch actualités (1 seul appel au chargement, cache 24h) --- */
  useEffect(() => {
    fetchAllNews();
  }, []);

  /* --- Vérifier si l'utilisateur est connecté pour débloquer les limites --- */
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        generationLimit.setHasAccount(true);
        editLimit.setHasAccount(true);
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

  /* --- Appliquer automatiquement le preset au changement de profil de communication --- */
  useEffect(() => {
    const preset = tonePresets[communicationProfile];
    setTone(preset.tone);
    setEmotionToConvey(preset.emotion);
    setPublicationGoal(preset.goal);
    setStoryToTell(preset.story);
    setVisualStyle(preset.visualStyle);
  }, [communicationProfile]);

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

  // Sauvegarder l'état à chaque changement (avec debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const state = {
        selectedNews,
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

  async function fetchAllNews() {
    try {
      setLoading(true);
      setError(null);
      // Récupérer TOUTES les news en 1 appel (l'API doit gérer le cache 24h)
      const res = await fetch('/api/news?all=true', { cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Erreur de chargement');
      setAllNewsItems(data.items || []);
    } catch (e: any) {
      console.error('fetchAllNews error', e);
      setError('Impossible de récupérer les actualités.');
      setAllNewsItems([]);
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
  function handleGenerateTextSuggestions() {
    if (!selectedNews) {
      alert('Veuillez d\'abord sélectionner une actualité');
      return;
    }

    if (!businessType.trim()) {
      alert('Veuillez d\'abord renseigner votre type de business');
      return;
    }

    // NOUVEAU : Auto-remplir "problème résolu" si vide
    // Cela crée une PROPOSITION cohérente avec les suggestions de texte
    if (!problemSolved || !problemSolved.trim()) {
      const { generateProblemSolvedSuggestion } = require('@/lib/text-suggestion');

      const problemSuggestion = generateProblemSolvedSuggestion({
        newsTitle: selectedNews.title,
        newsDescription: selectedNews.description,
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

    // Générer les suggestions de texte
    const suggestions = generateTextSuggestions({
      newsTitle: selectedNews.title,
      newsDescription: selectedNews.description,
      businessType,
      businessDescription,
      targetAudience,
      specialist: specialist as any,
      communicationProfile,
      marketingAngle,
      problemSolved: problemSolved || '',     // Lien ultra-cohérent avec la question "problème résolu"
      uniqueAdvantage,                         // Met en avant l'avantage unique
    });

    setTextSuggestions(suggestions);
    setShowTextSuggestions(true);
  }

  /* --- Preview en temps réel du texte overlay --- */
  useEffect(() => {
    // Ne générer la preview que si on est dans l'onglet texte et qu'il y a du texte
    if (activeTab !== 'text' || !overlayText.trim() || !showEditStudio) {
      setTextPreviewUrl(null);
      return;
    }

    const imageToPreview = selectedEditVersion || generatedImageUrl;
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
          textColor: textColor,
          backgroundColor: textBackgroundColor,
        });

        setTextPreviewUrl(result);
      } catch (error) {
        console.error('Preview error:', error);
        setTextPreviewUrl(null);
      } finally {
        setIsGeneratingPreview(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [overlayText, textPosition, textColor, textBackgroundColor, fontSize, fontFamily, backgroundStyle, selectedEditVersion, generatedImageUrl, activeTab, showEditStudio]);

  /* --- Génération de l'image IA avec Seedream 4.0 --- */
  async function handleGenerate() {
    if (!selectedNews) {
      alert('Veuillez sélectionner une actualité');
      return;
    }
    if (!businessType.trim()) {
      alert('Veuillez renseigner votre type de business');
      return;
    }

    // Vérifier les limites de génération (freemium)
    if (generationLimit.requiredAction === 'email') {
      setShowEmailGate(true);
      return;
    }
    if (generationLimit.requiredAction === 'signup') {
      setShowSignupGate(true);
      return;
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
      promptParts.push(
        `\n\nYou are an expert social media content creator and community manager. ` +
        `Create a professional visual for a French-speaking audience that connects current news with a specific business.`
      );

      // 2. ACTUALITÉ (Amélioré)
      promptParts.push(
        `\n\nNEWS STORY:\n` +
        `Headline: "${selectedNews.title}"\n` +
        (selectedNews.description ? `Context: ${selectedNews.description.substring(0, 200)}\n` : '') +
        `Source: ${selectedNews.source || 'Web'}\n\n` +
        `Make this news story visually engaging and relevant to the target business.`
      );

      // 3. BUSINESS & BRAND (Amélioré)
      promptParts.push(
        `BUSINESS PROFILE:\n` +
        `Type: ${businessType}\n` +
        (businessDescription ? `Details: ${businessDescription}\n` : '') +
        `\nThe visual must clearly show how this business BENEFITS from or RELATES to this news. ` +
        `Show a specific, tangible connection that makes immediate sense to viewers.`
      );

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

      const fullPrompt = promptParts.join(' ');

      console.log('[Generate] Full prompt:', fullPrompt);

      // Choisir entre i2i (si logo présent) ou t2i
      const endpoint = logoUrl ? '/api/seedream/i2i' : '/api/seedream/t2i';
      const requestBody = logoUrl
        ? { prompt: fullPrompt, image: logoUrl }
        : { prompt: fullPrompt };

      console.log(`[Generate] Using ${logoUrl ? 'i2i' : 't2i'} endpoint`);

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

      let finalImageUrl = data.imageUrl;

      console.log('[Generate] Image generated, applying overlays...', {
        hasOptionalText: !!optionalText?.trim(),
        imageUrl: data.imageUrl.substring(0, 50)
      });

      // ÉTAPE 1 : Convertir l'URL en data URL pour éviter les problèmes CORS
      console.log('[Generate] Converting image URL to data URL...');
      try {
        const { convertUrlToDataUrl } = await import('@/lib/image-utils');
        finalImageUrl = await convertUrlToDataUrl(data.imageUrl);
        console.log('[Generate] ✅ Image converted to data URL successfully');
      } catch (conversionError) {
        console.error('[Generate] ⚠️ Failed to convert to data URL, using original URL:', conversionError);
        // Continuer avec l'URL originale même si la conversion échoue
      }

      // ÉTAPE 2 : Appliquer le text overlay avec Canvas si un texte est fourni
      if (optionalText && optionalText.trim()) {
        console.log('[Generate] Applying text overlay:', optionalText.trim());
        try {
          // Déterminer le style selon le type de texte
          const isCTA = /\b(offre|promo|réduction|%|€|gratuit|limité|maintenant|découvr|inscri)/i.test(optionalText);
          const position = isCTA ? 'bottom' : 'center';
          const style = isCTA ? 'cta' : 'headline';

          console.log('[Generate] Text overlay config:', { position, style, textLength: optionalText.trim().length });

          // Appliquer l'overlay sur l'image (déjà en data URL)
          const imageWithText = await addTextOverlay(finalImageUrl, {
            text: optionalText.trim(),
            position,
            style,
          });

          console.log('[Generate] ✅ Text overlay applied successfully');
          // L'image avec texte est en data URL
          finalImageUrl = imageWithText;
        } catch (overlayError) {
          // Log l'erreur silencieusement - l'utilisateur pourra ajouter le texte via l'éditeur
          console.error('[Generate] ❌ Text overlay FAILED:', overlayError);
          console.warn('[Generate] Text will be editable in the editor instead');
        }
      }

      // ÉTAPE 3 : Appliquer le watermark KeiroAI pour les utilisateurs freemium
      console.log('[Generate] Checking watermark requirement...');
      try {
        // Vérifier le statut premium
        const { data: { user } } = await supabase.auth.getUser();
        const hasPremiumPlan = user?.user_metadata?.subscription_status === 'active' || false;

        // Déterminer si l'utilisateur est freemium
        const hasProvidedEmail = !!generationLimit.email;
        const hasCreatedAccount = generationLimit.hasAccount;
        const isUserFreemium = isFreemiumUser(hasProvidedEmail, hasCreatedAccount, hasPremiumPlan);

        console.log('[Generate] Freemium check:', {
          hasProvidedEmail,
          hasCreatedAccount,
          hasPremiumPlan,
          isUserFreemium,
          userEmail: user?.email
        });

        // Appliquer le watermark si freemium (ou en mode debug)
        // DEBUG: Pour tester, on applique TOUJOURS le watermark
        const shouldApplyWatermark = isUserFreemium || true; // TOUJOURS pour debug

        if (shouldApplyWatermark) {
          console.log('[Generate] 💧 Applying watermark...', {
            reason: isUserFreemium ? 'freemium user' : 'debug mode'
          });
          const imageWithWatermark = await addWatermark(finalImageUrl, {
            position: 'bottom-right',
            opacity: 0.9, // Augmenté à 0.9 pour MAXIMUM visibilité
            fontSize: 24  // Augmenté à 24 pour être bien visible
          });
          finalImageUrl = imageWithWatermark;
          console.log('[Generate] ✅ Watermark "keiro.ai" applied successfully');
        } else {
          console.log('[Generate] ℹ️ No watermark - user is premium');
        }
      } catch (watermarkError) {
        // Log l'erreur avec détails
        console.error('[Generate] ❌ Watermark FAILED:', watermarkError);
      }

      console.log('[Generate] Final image ready:', {
        isDataURL: finalImageUrl.startsWith('data:'),
        length: finalImageUrl.length
      });

      setGeneratedImageUrl(finalImageUrl);
      setGeneratedPrompt(fullPrompt);

      // Incrémenter le compteur de génération pour le freemium
      generationLimit.incrementCount();

      // Auto-save vers la librairie si l'utilisateur est connecté
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log('[Generate] User logged in, auto-saving to library...');
          const saveResponse = await fetch('/api/storage/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: finalImageUrl, // Utiliser l'URL finale (avec texte si appliqué)
              type: 'image',
              prompt: fullPrompt
            })
          });
          const saveData = await saveResponse.json();
          if (saveData.ok) {
            console.log('[Generate] Auto-saved to library successfully');
          }
        }
      } catch (saveError) {
        // Silently fail auto-save, don't interrupt user flow
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

  // Génération de vidéo avec Seedream/SeedDance
  async function handleGenerateVideo() {
    if (!selectedNews || !businessType.trim()) return;

    setGeneratingVideo(true);
    setGeneratedVideoUrl(null);
    setVideoTaskId(null);
    setVideoProgress('Création de la tâche vidéo...');
    setGenerationError(null);

    try {
      // Construire le prompt vidéo
      const videoPrompt = `${selectedNews.title}. Business: ${businessType}. ${businessDescription ? `Description: ${businessDescription}.` : ''} Style: ${visualStyle}, ${tone}. Create an engaging social media video.`;

      console.log('[Video] Starting generation with prompt:', videoPrompt);

      // Créer la tâche de génération
      const res = await fetch('/api/seedream/t2v', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt,
          duration: 5,
          resolution: '1080p'
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
      const maxAttempts = 60; // 5 minutes max (5s * 60)

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
              setGeneratedVideoUrl(statusData.videoUrl);
              setVideoProgress('');
              setGeneratingVideo(false);
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
      <div className="max-w-7xl mx-auto">
        <p className="text-neutral-600 mb-6">
          Associez une actualité à votre business pour créer un visuel engageant et augmenter votre visibilité
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ===== COLONNE GAUCHE : Actualités ===== */}
          <div className="lg:col-span-8">
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
                      onClick={() => setSelectedNews(item)}
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
          </div>

          {/* ===== COLONNE DROITE : Upload + Assistant ===== */}
          <div className="lg:col-span-4 space-y-4">
            {/* Zone Upload Logo/Photo (optionnel) */}
            <div>
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
                  <div className="space-y-2">
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="w-40 h-40 object-contain rounded mx-auto border bg-white p-2"
                      crossOrigin="anonymous"
                      loading="eager"
                    />
                    <button
                      onClick={() => setLogoUrl(null)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Supprimer
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
            <div className="bg-white rounded-xl border p-3">
              <h3 className="text-sm font-semibold mb-2">Assistant Marketing IA</h3>

              {/* Afficher la carte sélectionnée */}
              {selectedNews && (
                <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                  <p className="text-[10px] font-medium text-blue-900 mb-1">✓ Actualité sélectionnée :</p>
                  <p className="text-xs font-semibold line-clamp-2 text-blue-800">
                    {selectedNews.title}
                  </p>
                </div>
              )}

              {/* Accompagnement spécialisé */}
              <div className="mb-3 p-2 bg-amber-50 rounded border border-amber-200">
                <p className="text-xs font-medium text-amber-900 mb-2">💡 Besoin d'aide pour optimiser votre contenu ?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setSpecialist('seo')}
                    className={`text-[10px] px-2 py-1.5 rounded transition ${
                      specialist === 'seo'
                        ? 'bg-amber-600 text-white font-medium'
                        : 'bg-white text-amber-800 hover:bg-amber-100 border border-amber-300'
                    }`}
                  >
                    📊 SEO
                  </button>
                  <button
                    onClick={() => setSpecialist('marketing')}
                    className={`text-[10px] px-2 py-1.5 rounded transition ${
                      specialist === 'marketing'
                        ? 'bg-amber-600 text-white font-medium'
                        : 'bg-white text-amber-800 hover:bg-amber-100 border border-amber-300'
                    }`}
                  >
                    📈 Marketing
                  </button>
                  <button
                    onClick={() => setSpecialist('content')}
                    className={`text-[10px] px-2 py-1.5 rounded transition ${
                      specialist === 'content'
                        ? 'bg-amber-600 text-white font-medium'
                        : 'bg-white text-amber-800 hover:bg-amber-100 border border-amber-300'
                    }`}
                  >
                    ✍️ Contenu
                  </button>
                  <button
                    onClick={() => setSpecialist('copywriter')}
                    className={`text-[10px] px-2 py-1.5 rounded transition ${
                      specialist === 'copywriter'
                        ? 'bg-amber-600 text-white font-medium'
                        : 'bg-white text-amber-800 hover:bg-amber-100 border border-amber-300'
                    }`}
                  >
                    ✨ Copywriting
                  </button>
                </div>
                {specialist && (
                  <div className="mt-2 p-2 bg-white rounded text-[10px] text-amber-900 border border-amber-200">
                    {specialist === 'seo' && (
                      <>
                        <p className="font-medium mb-1">Conseils SEO :</p>
                        <ul className="list-disc pl-3 space-y-0.5 mb-2">
                          <li>Utilisez des mots-clés pertinents liés à l'actualité</li>
                          <li>Décrivez précisément votre secteur d'activité</li>
                          <li>Mentionnez votre zone géographique si pertinent</li>
                        </ul>
                        <button
                          onClick={() => applySpecialistSuggestion('seo')}
                          className="w-full py-1 text-[10px] bg-amber-600 text-white rounded hover:bg-amber-700"
                        >
                          🚀 Remplir automatiquement
                        </button>
                      </>
                    )}
                    {specialist === 'marketing' && (
                      <>
                        <p className="font-medium mb-1">Stratégie Marketing :</p>
                        <ul className="list-disc pl-3 space-y-0.5 mb-2">
                          <li>Identifiez clairement votre audience cible</li>
                          <li>Soulignez votre proposition de valeur unique</li>
                          <li>Définissez un objectif clair (notoriété, conversion...)</li>
                        </ul>
                        <button
                          onClick={() => applySpecialistSuggestion('marketing')}
                          className="w-full py-1 text-[10px] bg-amber-600 text-white rounded hover:bg-amber-700"
                        >
                          🚀 Remplir automatiquement
                        </button>
                      </>
                    )}
                    {specialist === 'content' && (
                      <>
                        <p className="font-medium mb-1">Création de Contenu :</p>
                        <ul className="list-disc pl-3 space-y-0.5 mb-2">
                          <li>Racontez une histoire authentique de votre marque</li>
                          <li>Adaptez le ton à votre communauté</li>
                          <li>Apportez de la valeur ajoutée, pas seulement de la promo</li>
                        </ul>
                        <button
                          onClick={() => applySpecialistSuggestion('content')}
                          className="w-full py-1 text-[10px] bg-amber-600 text-white rounded hover:bg-amber-700"
                        >
                          🚀 Remplir automatiquement
                        </button>
                      </>
                    )}
                    {specialist === 'copywriter' && (
                      <>
                        <p className="font-medium mb-1">Copywriting Efficace :</p>
                        <ul className="list-disc pl-3 space-y-0.5 mb-2">
                          <li>Créez un lien émotionnel avec l'actualité</li>
                          <li>Utilisez des verbes d'action et appels à l'action clairs</li>
                          <li>Gardez des phrases courtes et impactantes</li>
                        </ul>
                        <button
                          onClick={() => applySpecialistSuggestion('copywriter')}
                          className="w-full py-1 text-[10px] bg-amber-600 text-white rounded hover:bg-amber-700"
                        >
                          🚀 Remplir automatiquement
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Section d'aide pour créer le lien actualité/business */}
              {selectedNews && (
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

              {/* Sélecteur de Profil de Communication */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-neutral-900 mb-2">
                  🎭 Profil de communication
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {Object.entries(tonePresets).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => setCommunicationProfile(key as any)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        communicationProfile === key
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">{preset.icon}</div>
                      <div className="text-xs font-semibold">{preset.label}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-2">
                  Sélectionnez un profil pour pré-remplir les champs selon votre stratégie de communication
                </p>
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
                    Description
                  </label>
                  <textarea
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    placeholder="Spécialité, valeur ajoutée... Ex: Restaurant spécialisé dans les produits locaux et de saison, livraison éco-responsable"
                    rows={2}
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
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

                {/* Angle marketing */}
                <div>
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

                {/* Nouveaux champs pour guidance détaillée */}
                <div className="border-t pt-2 mt-2">
                  <p className="text-[10px] font-medium text-neutral-600 mb-2">📝 Direction du contenu</p>

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

                {/* Boutons de génération */}
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={generating || generatingVideo || !selectedNews || !businessType.trim()}
                    className="flex-1 py-2 text-xs bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {generating ? 'Génération...' : 'Générer un visuel'}
                  </button>
                  <button
                    onClick={handleGenerateVideo}
                    disabled={generating || generatingVideo || !selectedNews || !businessType.trim()}
                    className="flex-1 py-2 text-xs bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {generatingVideo ? videoProgress || 'Génération...' : 'Créer une vidéo'}
                  </button>
                </div>

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
                      onClick={() => setShowSubscriptionModal(true)}
                      className="flex-1 py-2 text-xs bg-cyan-600 text-white text-center rounded hover:bg-cyan-700 transition-colors"
                    >
                      Enregistrer dans ma librairie (pro)
                    </button>
                    <button
                      onClick={() => {
                        setGeneratedImageUrl(null);
                        setGeneratedPrompt(null);
                      }}
                      className="flex-1 py-2 text-xs border rounded hover:bg-neutral-50 transition-colors"
                    >
                      Nouveau
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                <div className="mt-3 flex gap-2">
                  <a
                    href={generatedVideoUrl}
                    download="keiro-video.mp4"
                    className="flex-1 py-2 text-xs bg-neutral-900 text-white text-center rounded hover:bg-neutral-800 transition-colors"
                  >
                    Télécharger
                  </a>
                  <button
                    onClick={() => setShowSubscriptionModal(true)}
                    className="flex-1 py-2 text-xs bg-cyan-600 text-white text-center rounded hover:bg-cyan-700 transition-colors"
                  >
                    Enregistrer dans ma librairie (pro)
                  </button>
                  <button
                    onClick={() => setGeneratedVideoUrl(null)}
                    className="px-3 py-2 text-xs border rounded hover:bg-neutral-50 transition-colors"
                  >
                    Nouveau
                  </button>
                </div>
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
                    onClick={() => setActiveTab('edit')}
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

                      {/* Aide spécialisée */}
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-2">💡 Aide spécialisée :</p>
                        <div className="grid grid-cols-2 gap-2">
                          {['seo', 'marketing', 'content', 'copywriter'].map((spec) => (
                            <button
                              key={spec}
                              onClick={() => setSpecialist(specialist === spec ? '' : spec)}
                              className={`text-sm px-3 py-2 rounded-lg font-medium min-h-[44px] transition-colors ${
                                specialist === spec
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-white text-purple-800 border border-purple-300 hover:bg-purple-100'
                              }`}
                            >
                              {spec === 'seo' && '📊 SEO'}
                              {spec === 'marketing' && '📈 Marketing'}
                              {spec === 'content' && '✍️ Contenu'}
                              {spec === 'copywriter' && '✨ Copy'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Conseils contextuels */}
                      {specialist && (
                        <div className="mb-4 p-3 bg-white rounded-lg text-xs text-purple-900 border border-purple-200">
                          {specialist === 'seo' && (
                            <>
                              <p className="font-medium mb-1">💡 Suggestions SEO :</p>
                              <ul className="list-disc pl-4 space-y-0.5">
                                <li>Ajoutez des éléments visuels liés aux mots-clés</li>
                                <li>Améliorez la lisibilité du texte sur l'image</li>
                                <li>Intégrez des symboles reconnaissables de votre secteur</li>
                              </ul>
                            </>
                          )}
                          {specialist === 'marketing' && (
                            <>
                              <p className="font-medium mb-1">💡 Optimisation Marketing :</p>
                              <ul className="list-disc pl-4 space-y-0.5">
                                <li>Renforcez votre identité visuelle (couleurs, logo)</li>
                                <li>Ajoutez des éléments qui attirent l'œil</li>
                                <li>Créez de l'urgence ou de l'exclusivité visuellement</li>
                              </ul>
                            </>
                          )}
                          {specialist === 'content' && (
                            <>
                              <p className="font-medium mb-1">💡 Amélioration Contenu :</p>
                              <ul className="list-disc pl-4 space-y-0.5">
                                <li>Ajustez l'ambiance pour refléter votre message</li>
                                <li>Équilibrez texte et visuel pour la clarté</li>
                                <li>Renforcez l'émotion de votre histoire</li>
                              </ul>
                            </>
                          )}
                          {specialist === 'copywriter' && (
                            <>
                              <p className="font-medium mb-1">💡 Impact Copywriting :</p>
                              <ul className="list-disc pl-4 space-y-0.5">
                                <li>Mettez en valeur votre appel à l'action</li>
                                <li>Utilisez des contrastes pour le texte clé</li>
                                <li>Créez une hiérarchie visuelle claire</li>
                              </ul>
                            </>
                          )}
                        </div>
                      )}

                      {/* Textarea pour prompt */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">
                          Décrivez vos modifications :
                        </label>
                        <textarea
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          rows={5}
                          className="w-full text-base rounded-lg border-2 border-purple-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                          placeholder={
                            editMode === 'precise'
                              ? 'Ex: Rendre le ciel plus bleu, ajouter un logo en haut à droite...'
                              : 'Ex: Transformer en style cyberpunk, ajouter des néons...'
                          }
                        />
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
                      <p className="text-sm font-medium mb-3">💡 Exemples de modifications :</p>
                      <div className="space-y-2">
                        {[
                          'Ajouter un filtre chaleureux et lumineux',
                          'Rendre l\'arrière-plan flou pour mettre en valeur le sujet',
                          'Améliorer les contrastes et la saturation des couleurs',
                          'Ajouter mon logo de marque discrètement en bas à droite'
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
                            { pos: 'top-left', label: '↖️' },
                            { pos: 'top-center', label: '⬆️' },
                            { pos: 'top-right', label: '↗️' },
                            { pos: 'center-left', label: '⬅️' },
                            { pos: 'center', label: '⏺️' },
                            { pos: 'center-right', label: '➡️' },
                            { pos: 'bottom-left', label: '↙️' },
                            { pos: 'bottom-center', label: '⬇️' },
                            { pos: 'bottom-right', label: '↘️' },
                          ].map((item) => (
                            <button
                              key={item.pos}
                              onClick={() => setTextPosition(item.pos as any)}
                              className={`px-3 py-2 rounded-lg text-xl font-medium transition-all ${
                                textPosition === item.pos
                                  ? 'bg-purple-500 text-white'
                                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                              }`}
                            >
                              {item.label}
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
                          <option value="inter">Inter</option>
                          <option value="montserrat">Montserrat</option>
                          <option value="bebas">Bebas Neue</option>
                          <option value="roboto">Roboto</option>
                          <option value="playfair">Playfair</option>
                        </select>
                      </div>

                      {/* Style de fond */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Style de fond</label>
                        <div className="grid grid-cols-2 gap-2">
                          {['transparent', 'solid', 'gradient', 'blur'].map((style) => (
                            <button
                              key={style}
                              onClick={() => setBackgroundStyle(style as any)}
                              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                                backgroundStyle === style
                                  ? 'bg-purple-500 text-white'
                                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                              }`}
                            >
                              {style}
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

                          const imageToEdit = selectedEditVersion || generatedImageUrl;
                          if (!imageToEdit) return;

                          try {
                            // Convertir position en format simple pour addTextOverlay
                            let simplePosition: 'top' | 'center' | 'bottom' = 'center';
                            if (textPosition.startsWith('top')) simplePosition = 'top';
                            else if (textPosition.startsWith('bottom')) simplePosition = 'bottom';

                            const result = await addTextOverlay(imageToEdit, {
                              text: overlayText,
                              position: simplePosition,
                              textColor: textColor,
                              backgroundColor: textBackgroundColor,
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
                                    const response = await fetch('/api/storage/upload', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        url: version,
                                        type: 'image',
                                        prompt: `Version ${idx + 1} - ${generatedPrompt || 'Image éditée'}`
                                      })
                                    });
                                    const data = await response.json();
                                    if (data.ok) {
                                      alert('✅ Sauvegardé dans votre librairie');
                                    } else {
                                      alert('❌ Impossible de sauvegarder. Veuillez réessayer.');
                                    }
                                  } catch (error: any) {
                                    alert('❌ Erreur de connexion. Vérifiez votre internet.');
                                  }
                                }}
                                className="py-2 text-sm bg-cyan-600 text-white rounded-lg font-medium min-h-[44px] hover:bg-cyan-700 transition-colors"
                              >
                                💾 Librairie
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
                                const response = await fetch('/api/storage/upload', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    url: version,
                                    type: 'image',
                                    prompt: `Version ${idx + 1} - ${generatedPrompt || 'Image éditée'}`
                                  })
                                });
                                const data = await response.json();
                                if (data.ok) {
                                  alert('✅ Sauvegardé dans votre librairie');
                                } else {
                                  alert('❌ Impossible de sauvegarder. Veuillez réessayer.');
                                }
                              } catch (error: any) {
                                alert('❌ Erreur de connexion. Vérifiez votre internet.');
                              }
                            }}
                            className="py-1 text-[10px] bg-cyan-600 text-white rounded hover:bg-cyan-700 font-medium transition-colors"
                          >
                            💾 Librairie
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
                      onClick={() => setActiveTab('edit')}
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

                    {/* Accompagnement spécialisé dans l'édition */}
                    <div className="mb-3">
                      <p className="text-xs font-medium mb-1.5">💡 Aide spécialisée :</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => setSpecialist('seo')}
                          className={`text-[9px] px-1.5 py-1 rounded transition ${
                            specialist === 'seo'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-purple-800 hover:bg-purple-100 border border-purple-300'
                          }`}
                        >
                          📊 SEO
                        </button>
                        <button
                          onClick={() => setSpecialist('marketing')}
                          className={`text-[9px] px-1.5 py-1 rounded transition ${
                            specialist === 'marketing'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-purple-800 hover:bg-purple-100 border border-purple-300'
                          }`}
                        >
                          📈 Marketing
                        </button>
                        <button
                          onClick={() => setSpecialist('content')}
                          className={`text-[9px] px-1.5 py-1 rounded transition ${
                            specialist === 'content'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-purple-800 hover:bg-purple-100 border border-purple-300'
                          }`}
                        >
                          ✍️ Contenu
                        </button>
                        <button
                          onClick={() => setSpecialist('copywriter')}
                          className={`text-[9px] px-1.5 py-1 rounded transition ${
                            specialist === 'copywriter'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-purple-800 hover:bg-purple-100 border border-purple-300'
                          }`}
                        >
                          ✨ Copy
                        </button>
                      </div>
                    </div>

                    {/* Conseils contextuels */}
                    {specialist && (
                      <div className="mb-3 p-2 bg-white rounded text-[8px] text-purple-900 border border-purple-200">
                        {specialist === 'seo' && (
                          <>
                            <p className="font-medium mb-1">💡 Suggestions SEO :</p>
                            <ul className="list-disc pl-3 space-y-0.5">
                              <li>Ajoutez des éléments visuels liés aux mots-clés</li>
                              <li>Améliorez la lisibilité du texte sur l'image</li>
                              <li>Intégrez des symboles reconnaissables de votre secteur</li>
                            </ul>
                          </>
                        )}
                        {specialist === 'marketing' && (
                          <>
                            <p className="font-medium mb-1">💡 Optimisation Marketing :</p>
                            <ul className="list-disc pl-3 space-y-0.5">
                              <li>Renforcez votre identité visuelle (couleurs, logo)</li>
                              <li>Ajoutez des éléments qui attirent l'œil</li>
                              <li>Créez de l'urgence ou de l'exclusivité visuellement</li>
                            </ul>
                          </>
                        )}
                        {specialist === 'content' && (
                          <>
                            <p className="font-medium mb-1">💡 Amélioration Contenu :</p>
                            <ul className="list-disc pl-3 space-y-0.5">
                              <li>Ajustez l'ambiance pour refléter votre message</li>
                              <li>Équilibrez texte et visuel pour la clarté</li>
                              <li>Renforcez l'émotion de votre histoire</li>
                            </ul>
                          </>
                        )}
                        {specialist === 'copywriter' && (
                          <>
                            <p className="font-medium mb-1">💡 Impact Copywriting :</p>
                            <ul className="list-disc pl-3 space-y-0.5">
                              <li>Mettez en valeur votre appel à l'action</li>
                              <li>Utilisez des contrastes pour le texte clé</li>
                              <li>Créez une hiérarchie visuelle claire</li>
                            </ul>
                          </>
                        )}
                      </div>
                    )}

                    {/* Prompt de modification */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1">
                        Décrivez vos modifications :
                      </label>
                      <textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder={
                          editMode === 'precise'
                            ? 'Ex: Rendre le ciel plus bleu, ajouter un logo en haut à droite...'
                            : 'Ex: Transformer en style cyberpunk, ajouter des néons...'
                        }
                        rows={4}
                        className="w-full text-xs rounded border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
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
                        onClick={() => setEditPrompt('Améliorer les contrastes et la saturation des couleurs')}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • Contraste et saturation
                      </button>
                      <button
                        onClick={() => setEditPrompt('Ajouter mon logo de marque discrètement en bas à droite')}
                        className="w-full text-left text-[9px] px-2 py-1 bg-white rounded hover:bg-purple-50 border"
                      >
                        • Ajouter logo
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
                          { id: 'headline', icon: '📰' },
                          { id: 'cta', icon: '🎯' },
                          { id: 'minimal', icon: '✨' },
                          { id: 'bold', icon: '💪' },
                          { id: 'elegant', icon: '👔' },
                          { id: 'modern', icon: '🚀' },
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
                            className={`p-1.5 rounded border transition-all ${
                              textTemplate === template.id
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-neutral-200 hover:border-neutral-300'
                            }`}
                          >
                            <div className="text-lg">{template.icon}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Position */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1.5">Position</label>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { pos: 'top-left', label: '↖️' },
                          { pos: 'top-center', label: '⬆️' },
                          { pos: 'top-right', label: '↗️' },
                          { pos: 'center-left', label: '⬅️' },
                          { pos: 'center', label: '⏺️' },
                          { pos: 'center-right', label: '➡️' },
                          { pos: 'bottom-left', label: '↙️' },
                          { pos: 'bottom-center', label: '⬇️' },
                          { pos: 'bottom-right', label: '↘️' },
                        ].map((item) => (
                          <button
                            key={item.pos}
                            onClick={() => setTextPosition(item.pos as any)}
                            className={`px-2 py-1 rounded text-sm transition-all ${
                              textPosition === item.pos
                                ? 'bg-purple-500 text-white'
                                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                            }`}
                          >
                            {item.label}
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
                        <option value="inter">Inter</option>
                        <option value="montserrat">Montserrat</option>
                        <option value="bebas">Bebas Neue</option>
                        <option value="roboto">Roboto</option>
                        <option value="playfair">Playfair</option>
                      </select>
                    </div>

                    {/* Style de fond */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1">Style de fond</label>
                      <div className="grid grid-cols-2 gap-1">
                        {['transparent', 'solid', 'gradient', 'blur'].map((style) => (
                          <button
                            key={style}
                            onClick={() => setBackgroundStyle(style as any)}
                            className={`px-2 py-1 rounded text-[9px] font-medium capitalize transition-all ${
                              backgroundStyle === style
                                ? 'bg-purple-500 text-white'
                                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                            }`}
                          >
                            {style}
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
                            textColor: textColor,
                            backgroundColor: textBackgroundColor,
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

      </div>
    </div>
  );
}
