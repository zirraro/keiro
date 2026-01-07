'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import SubscriptionModal from '@/components/SubscriptionModal';
import EmailGateModal from '@/components/EmailGateModal';
import SignupGateModal from '@/components/SignupGateModal';
import { useGenerationLimit } from '@/hooks/useGenerationLimit';
import { useEditLimit } from '@/hooks/useEditLimit';
import { supabase } from '@/lib/supabase';

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
  const [platform, setPlatform] = useState('Instagram');
  const [tone, setTone] = useState('Professionnel');
  const [visualStyle, setVisualStyle] = useState('Moderne et épuré');
  const [specialist, setSpecialist] = useState<string>('');

  /* --- États pour la génération --- */
  const [generating, setGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

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
  const [activeTab, setActiveTab] = useState<'image' | 'edit' | 'versions'>('image');

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
      alert(`Erreur upload: ${e.message}`);
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

  /* --- Remplissage automatique selon spécialité --- */
  function applySpecialistSuggestion(specialistType: string) {
    if (specialistType === 'seo') {
      setPublicationGoal('Augmenter la visibilité et le référencement naturel');
      setImageAngle('Visuel clair avec mots-clés visuels du secteur');
      setStoryToTell('Expertise et autorité dans le domaine');
      setEmotionToConvey('Confiance et professionnalisme');
    } else if (specialistType === 'marketing') {
      setPublicationGoal('Générer de l\'engagement et des conversions');
      setImageAngle('Visuel accrocheur avec call-to-action visuel');
      setStoryToTell('Bénéfices concrets pour le client');
      setEmotionToConvey('Désir et urgence');
    } else if (specialistType === 'content') {
      setPublicationGoal('Éduquer et créer du lien avec l\'audience');
      setImageAngle('Storytelling visuel authentique');
      setStoryToTell('Valeurs de la marque et authenticité');
      setEmotionToConvey('Inspiration et connexion');
    } else if (specialistType === 'copywriter') {
      setPublicationGoal('Convaincre et pousser à l\'action');
      setImageAngle('Impact visuel maximal avec hiérarchie claire');
      setStoryToTell('Transformation et résultats');
      setEmotionToConvey('Excitation et motivation');
    }
  }

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

    try {
      // Construire un prompt détaillé avec lien profond actualité/business
      let promptParts: string[] = [];

      // CONTEXTE PRINCIPAL : Lien actualité + business
      promptParts.push(
        `Create a professional social media visual that establishes a meaningful connection between ` +
        `the following news event and this specific business.`
      );

      // Actualité détaillée
      promptParts.push(`\n\nNEWS CONTEXT: "${selectedNews.title}"`);
      if (selectedNews.description) {
        promptParts.push(`News details: ${selectedNews.description.substring(0, 200)}.`);
      }

      // Business détaillé
      promptParts.push(`\n\nBUSINESS: ${businessType}`);
      if (businessDescription) {
        promptParts.push(`Business details: ${businessDescription}.`);
      }

      // LIEN EXPLICITE entre l'actualité et le business
      promptParts.push(
        `\n\nCONNECTION REQUIREMENT: The visual MUST clearly show how this news relates to and benefits ` +
        `the business. Show a specific, tangible connection - not just generic imagery. ` +
        `The viewer should immediately understand WHY this business is talking about this news.`
      );

      // Audience ciblée
      if (targetAudience) {
        promptParts.push(`\nTarget audience: ${targetAudience}. Speak directly to their interests and needs.`);
      }

      // Direction créative complète
      if (imageAngle || storyToTell || publicationGoal || emotionToConvey) {
        promptParts.push(`\n\nCREATIVE DIRECTION:`);
        if (imageAngle) promptParts.push(`Visual angle: ${imageAngle}.`);
        if (storyToTell) promptParts.push(`Story narrative: ${storyToTell}.`);
        if (publicationGoal) promptParts.push(`Goal: ${publicationGoal}.`);
        if (emotionToConvey) promptParts.push(`Emotion: ${emotionToConvey}.`);
        if (marketingAngle) promptParts.push(`Marketing approach: ${marketingAngle}.`);
      }

      // Style visuel et tonalité (SANS mentionner le nom de la plateforme)
      promptParts.push(
        `\n\nVISUAL SPECIFICATIONS: ${visualStyle} style with ${tone.toLowerCase()} tone. ` +
        `Professional quality, optimized for social media format. ` +
        `High contrast, clear composition, eye-catching design. ` +
        `DO NOT include any social media platform names, logos, or interface elements in the image.`
      );

      // Texte optionnel (seulement si fourni par l'utilisateur)
      if (optionalText && optionalText.trim()) {
        promptParts.push(
          `\n\nTEXT OVERLAY: Include the following text in the image in a clear, readable font: "${optionalText.trim()}". ` +
          `The text should be well-integrated into the design and easily readable.`
        );
      }

      // Instructions de qualité finale
      promptParts.push(
        `\n\nQUALITY REQUIREMENTS: ` +
        `The final image must be publication-ready with professional photography/illustration standards. ` +
        `Colors should be vibrant but harmonious. ` +
        (optionalText && optionalText.trim() ?
          `Text must be clearly readable and well-integrated into the design. ` :
          `DO NOT include any text overlay or captions in the image unless specified. `) +
        `The composition should guide the viewer's eye naturally through the visual story. ` +
        `Most importantly: make the news-to-business connection obvious and compelling.`
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
      if (!data?.ok) throw new Error(data?.error || 'Génération échouée');
      setGeneratedImageUrl(data.imageUrl);
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
              url: data.imageUrl,
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
                  <textarea
                    value={marketingAngle}
                    onChange={(e) => setMarketingAngle(e.target.value)}
                    placeholder="Comment relier l'actu à votre offre ? Ex: Face à l'inflation alimentaire, nos prix restent accessibles grâce aux circuits courts"
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
                    <input
                      type="text"
                      value={imageAngle}
                      onChange={(e) => setImageAngle(e.target.value)}
                      placeholder="Ex: Montrer l'actu à travers le prisme de notre solution, visuel split-screen avant/après..."
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
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-700 flex items-center gap-1">
                      Texte à ajouter <span className="text-neutral-400 font-normal">(optionnel)</span>
                    </label>
                    <input
                      type="text"
                      value={optionalText}
                      onChange={(e) => setOptionalText(e.target.value)}
                      placeholder="Ex: Offre limitée, -20% ce week-end, Nouvelle collection..."
                      className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
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

                {/* Tonalité */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">Tonalité</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                  >
                    <option>Professionnel</option>
                    <option>Amical</option>
                    <option>Inspirant</option>
                    <option>Humoristique</option>
                    <option>Éducatif</option>
                  </select>
                </div>

                {/* Style visuel */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-neutral-700">Style</label>
                  <select
                    value={visualStyle}
                    onChange={(e) => setVisualStyle(e.target.value)}
                    className="w-full text-xs rounded-lg border-2 border-neutral-200 px-3 py-2 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                  >
                    <option>Moderne et épuré</option>
                    <option>Réaliste</option>
                    <option>Illustration</option>
                    <option>Minimaliste</option>
                    <option>Coloré</option>
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

            {/* Visuel généré */}
            {generatedImageUrl && !showEditStudio && (
              <div className="bg-white rounded-xl border p-3">
                <h3 className="text-sm font-semibold mb-2">Visuel</h3>
                <div className="relative w-full aspect-square bg-neutral-100 rounded border overflow-hidden">
                  <img
                    src={generatedImageUrl}
                    alt="Visuel généré"
                    className="w-full h-full object-contain"
                    onLoad={(e) => {
                      (e.target as HTMLImageElement).style.opacity = '1';
                    }}
                    style={{ opacity: 0, transition: 'opacity 0.3s' }}
                  />
                  {/* Loader pendant le chargement */}
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-50">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                      <p className="text-xs text-neutral-500">Chargement...</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {/* Première ligne de boutons */}
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
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'edit'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-neutral-600'
                    }`}
                  >
                    ✏️ Éditer
                  </button>
                  <button
                    onClick={() => setActiveTab('versions')}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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
                            alert('Veuillez décrire vos modifications');
                            return;
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

                            alert('Image éditée avec succès!');
                          } catch (e: any) {
                            console.error('[Edit Studio] Error:', e);
                            alert('Erreur: ' + e.message);
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
                                      alert('✅ Version sauvegardée!');
                                    } else {
                                      alert('❌ Erreur: ' + (data.error || 'Impossible de sauvegarder'));
                                    }
                                  } catch (error: any) {
                                    alert('❌ Erreur: ' + error.message);
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
                                  alert('✅ Version sauvegardée!');
                                } else {
                                  alert('❌ Erreur: ' + (data.error || 'Impossible de sauvegarder'));
                                }
                              } catch (error: any) {
                                alert('❌ Erreur: ' + error.message);
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
                <div className="flex-1 flex items-center justify-center bg-neutral-50 rounded-lg border overflow-hidden">
                  {selectedEditVersion ? (
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
                          alert('Veuillez décrire vos modifications');
                          return;
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

                          alert('Image éditée avec succès!');
                        } catch (e: any) {
                          console.error('[Edit Studio] Error:', e);
                          alert('Erreur: ' + e.message);
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
