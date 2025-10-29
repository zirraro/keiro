'use client';

import { useEffect, useRef, useState } from 'react';

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
  'À la une',
  'Tech',
  'Business',
  'Santé',
  'Sport',
  'Culture',
  'Politique',
  'Climat',
  'Automobile',
  'Lifestyle',
  'People',
  'Gaming',
  'Restauration'
];

/* ---------------- Page principale ---------------- */
export default function GeneratePage() {
  /* --- États pour les actualités --- */
  const [category, setCategory] = useState<string>('À la une');
  const [searchQuery, setSearchQuery] = useState('');
  const [allNewsItems, setAllNewsItems] = useState<NewsCard[]>([]); // Toutes les news en cache
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsCard | null>(null);

  /* --- Filtrer les news selon catégorie et recherche --- */
  const filteredNews = allNewsItems
    .filter((item) => {
      // Filtre par catégorie
      if (item.category !== category) return false;
      // Filtre par recherche
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .slice(0, 12); // Limiter à 12 résultats

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
  const [platform, setPlatform] = useState('Instagram');
  const [tone, setTone] = useState('Professionnel');
  const [visualStyle, setVisualStyle] = useState('Moderne et épuré');
  const [specialist, setSpecialist] = useState<string>('');

  /* --- États pour la génération --- */
  const [generating, setGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  /* --- États pour le studio d'édition --- */
  const [showEditStudio, setShowEditStudio] = useState(false);
  const [editVersions, setEditVersions] = useState<string[]>([]);
  const [selectedEditVersion, setSelectedEditVersion] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editMode, setEditMode] = useState<'precise' | 'creative'>('precise');
  const [editingImage, setEditingImage] = useState(false);

  /* --- Fetch actualités (1 seul appel au chargement, cache 24h) --- */
  useEffect(() => {
    fetchAllNews();
  }, []);

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

    setGenerating(true);
    setGenerationError(null);
    setGeneratedImageUrl(null);

    try {
      // Construire un prompt détaillé incluant TOUS les éléments
      let promptParts: string[] = [];

      // Contexte de l'actualité
      promptParts.push(`Context: News article about "${selectedNews.title}".`);
      if (selectedNews.description) {
        promptParts.push(`News summary: ${selectedNews.description.substring(0, 200)}.`);
      }

      // Business et audience
      promptParts.push(`Business type: ${businessType}.`);
      if (businessDescription) {
        promptParts.push(`Business description: ${businessDescription}.`);
      }
      if (targetAudience) {
        promptParts.push(`Target audience: ${targetAudience}.`);
      }

      // Angle et storytelling
      if (imageAngle) {
        promptParts.push(`Visual angle: ${imageAngle}.`);
      }
      if (storyToTell) {
        promptParts.push(`Story to convey: ${storyToTell}.`);
      }
      if (publicationGoal) {
        promptParts.push(`Publication goal: ${publicationGoal}.`);
      }
      if (emotionToConvey) {
        promptParts.push(`Emotion to convey: ${emotionToConvey}.`);
      }
      if (marketingAngle) {
        promptParts.push(`Marketing angle: ${marketingAngle}.`);
      }

      // Style et paramètres visuels
      promptParts.push(`Visual style: ${visualStyle}.`);
      promptParts.push(`Tone: ${tone}.`);
      promptParts.push(`Platform: ${platform}.`);

      // Instructions finales
      promptParts.push(
        'Create a high-quality, professional marketing visual that connects the news with the business. ' +
        'The image should be visually striking, with clear composition, professional lighting, ' +
        'and colors that match the brand identity. Ensure text is readable if included. ' +
        'The visual should be optimized for social media engagement.'
      );

      const fullPrompt = promptParts.join(' ');

      console.log('[Generate] Full prompt:', fullPrompt);

      // Appeler Seedream 4.0 t2i
      const res = await fetch('/api/seedream/t2i', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          size: '2K'
        }),
      });

      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Génération échouée');
      setGeneratedImageUrl(data.imageUrl);
    } catch (e: any) {
      console.error('Generation error:', e);
      setGenerationError(e.message || 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Générateur de contenu visuel</h1>
        <p className="text-neutral-600 mb-6">
          Associez une actualité à votre business pour créer un visuel engageant et augmenter votre visibilité
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ===== COLONNE GAUCHE : Actualités ===== */}
          <div className="lg:col-span-8">
            {/* Filtres : Catégories + Recherche */}
            <div className="mb-4">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Dropdown Catégories */}
                <div className="sm:w-1/3">
                  <label className="block text-sm font-medium mb-1">Catégorie</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Barre de recherche */}
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Rechercher</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Rechercher dans les actualités..."
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
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
                      className={`rounded-xl border cursor-pointer transition hover:shadow-lg ${
                        selectedNews?.id === item.id
                          ? 'ring-2 ring-blue-500 bg-blue-50'
                          : 'bg-white hover:bg-neutral-50'
                      }`}
                    >
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-32 object-cover rounded-t-xl"
                        />
                      )}
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2 text-xs mb-2">
                          <div className="flex items-center gap-2">
                            {item.category && (
                              <span className="bg-neutral-100 px-2 py-0.5 rounded text-neutral-600">
                                {item.category}
                              </span>
                            )}
                          </div>
                        </div>
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
              <h3 className="text-sm font-semibold mb-2">Logo (optionnel)</h3>
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
                      className="w-16 h-16 object-cover rounded mx-auto border"
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
                      Glissez ou cliquez
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
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                <p className="text-[10px] text-neutral-600">IA : <span className="font-medium">Replicate SDXL</span></p>
              </div>

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
                <p className="text-[10px] font-medium text-amber-900 mb-2">💡 Besoin d'aide pour optimiser votre contenu ?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setSpecialist('seo')}
                    className={`text-[9px] px-2 py-1.5 rounded transition ${
                      specialist === 'seo'
                        ? 'bg-amber-600 text-white font-medium'
                        : 'bg-white text-amber-800 hover:bg-amber-100 border border-amber-300'
                    }`}
                  >
                    📊 SEO
                  </button>
                  <button
                    onClick={() => setSpecialist('marketing')}
                    className={`text-[9px] px-2 py-1.5 rounded transition ${
                      specialist === 'marketing'
                        ? 'bg-amber-600 text-white font-medium'
                        : 'bg-white text-amber-800 hover:bg-amber-100 border border-amber-300'
                    }`}
                  >
                    📈 Marketing
                  </button>
                  <button
                    onClick={() => setSpecialist('content')}
                    className={`text-[9px] px-2 py-1.5 rounded transition ${
                      specialist === 'content'
                        ? 'bg-amber-600 text-white font-medium'
                        : 'bg-white text-amber-800 hover:bg-amber-100 border border-amber-300'
                    }`}
                  >
                    ✍️ Contenu
                  </button>
                  <button
                    onClick={() => setSpecialist('copywriter')}
                    className={`text-[9px] px-2 py-1.5 rounded transition ${
                      specialist === 'copywriter'
                        ? 'bg-amber-600 text-white font-medium'
                        : 'bg-white text-amber-800 hover:bg-amber-100 border border-amber-300'
                    }`}
                  >
                    ✨ Copywriting
                  </button>
                </div>
                {specialist && (
                  <div className="mt-2 p-2 bg-white rounded text-[9px] text-amber-900 border border-amber-200">
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
                          className="w-full py-1 text-[9px] bg-amber-600 text-white rounded hover:bg-amber-700"
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
                          className="w-full py-1 text-[9px] bg-amber-600 text-white rounded hover:bg-amber-700"
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
                          className="w-full py-1 text-[9px] bg-amber-600 text-white rounded hover:bg-amber-700"
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
                          className="w-full py-1 text-[9px] bg-amber-600 text-white rounded hover:bg-amber-700"
                        >
                          🚀 Remplir automatiquement
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {/* Type de business */}
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Business <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    placeholder="Restaurant, SaaS..."
                    className="w-full text-xs rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Description business */}
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Description
                  </label>
                  <textarea
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    placeholder="Décrivez votre activité..."
                    rows={2}
                    className="w-full text-xs rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Audience cible */}
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Audience
                  </label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Entrepreneurs, Familles..."
                    className="w-full text-xs rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Angle marketing */}
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Angle marketing
                  </label>
                  <textarea
                    value={marketingAngle}
                    onChange={(e) => setMarketingAngle(e.target.value)}
                    placeholder="Votre approche..."
                    rows={2}
                    className="w-full text-xs rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Nouveaux champs pour guidance détaillée */}
                <div className="border-t pt-2 mt-2">
                  <p className="text-[10px] font-medium text-neutral-600 mb-2">📝 Direction du contenu</p>

                  {/* Angle de l'image */}
                  <div className="mb-2">
                    <label className="block text-xs font-medium mb-1">
                      Angle de l'image
                    </label>
                    <input
                      type="text"
                      value={imageAngle}
                      onChange={(e) => setImageAngle(e.target.value)}
                      placeholder="Ex: Visuel moderne avec focus produit..."
                      className="w-full text-xs rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Histoire à raconter */}
                  <div className="mb-2">
                    <label className="block text-xs font-medium mb-1">
                      Histoire à raconter
                    </label>
                    <textarea
                      value={storyToTell}
                      onChange={(e) => setStoryToTell(e.target.value)}
                      placeholder="Ex: Innovation et qualité au service du client..."
                      rows={2}
                      className="w-full text-xs rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* But de la publication */}
                  <div className="mb-2">
                    <label className="block text-xs font-medium mb-1">
                      But de la publication
                    </label>
                    <input
                      type="text"
                      value={publicationGoal}
                      onChange={(e) => setPublicationGoal(e.target.value)}
                      placeholder="Ex: Augmenter l'engagement, générer des leads..."
                      className="w-full text-xs rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Émotion à transmettre */}
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Émotion à transmettre
                    </label>
                    <input
                      type="text"
                      value={emotionToConvey}
                      onChange={(e) => setEmotionToConvey(e.target.value)}
                      placeholder="Ex: Confiance, excitation, inspiration..."
                      className="w-full text-xs rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Plateforme */}
                <div>
                  <label className="block text-xs font-medium mb-1">Plateforme</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full text-xs rounded border px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option>LinkedIn</option>
                    <option>Instagram</option>
                    <option>Facebook</option>
                    <option>Twitter/X</option>
                    <option>TikTok</option>
                  </select>
                </div>

                {/* Tonalité */}
                <div>
                  <label className="block text-xs font-medium mb-1">Tonalité</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full text-xs rounded border px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                  <label className="block text-xs font-medium mb-1">Style</label>
                  <select
                    value={visualStyle}
                    onChange={(e) => setVisualStyle(e.target.value)}
                    className="w-full text-xs rounded border px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option>Moderne</option>
                    <option>Réaliste</option>
                    <option>Illustration</option>
                    <option>Minimaliste</option>
                    <option>Coloré</option>
                  </select>
                </div>

                {/* Bouton Créer un visuel */}
                <button
                  onClick={handleGenerate}
                  disabled={generating || !selectedNews || !businessType.trim()}
                  className="w-full py-2 text-xs bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {generating ? 'Création en cours...' : 'Créer un visuel'}
                </button>

                {!selectedNews && (
                  <p className="text-[10px] text-amber-600 text-center">
                    ⚠️ Sélectionnez une actualité
                  </p>
                )}
              </div>
            </div>

            {/* Résultat de la génération */}
            {generatedImageUrl && !showEditStudio && (
              <div className="bg-white rounded-xl border p-3">
                <h3 className="text-sm font-semibold mb-2">Résultat</h3>
                <img
                  src={generatedImageUrl}
                  alt="Visuel généré"
                  className="w-full rounded border"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      setShowEditStudio(true);
                      setEditVersions([generatedImageUrl]);
                      setSelectedEditVersion(generatedImageUrl);
                    }}
                    className="flex-1 py-1 text-xs bg-purple-600 text-white text-center rounded hover:bg-purple-700"
                  >
                    ✏️ Éditer
                  </button>
                  <a
                    href={generatedImageUrl}
                    download
                    className="flex-1 py-1 text-xs bg-neutral-900 text-white text-center rounded hover:bg-neutral-800"
                  >
                    Télécharger
                  </a>
                  <button
                    onClick={() => setGeneratedImageUrl(null)}
                    className="px-2 py-1 text-xs border rounded hover:bg-neutral-50"
                  >
                    Nouveau
                  </button>
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

        {/* ===== STUDIO D'ÉDITION (Seedream 3.0 i2i) ===== */}
        {showEditStudio && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-7xl w-full h-[90vh] flex flex-col">
              {/* Header du studio */}
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h2 className="text-lg font-semibold">Studio d'Édition</h2>
                  <p className="text-xs text-neutral-500">Seedream 3.0 - Image to Image</p>
                </div>
                <button
                  onClick={() => setShowEditStudio(false)}
                  className="text-2xl text-neutral-500 hover:text-neutral-900"
                >
                  ×
                </button>
              </div>

              {/* Contenu du studio */}
              <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
                {/* GAUCHE : Versions éditées */}
                <div className="col-span-2 overflow-y-auto space-y-2">
                  <h3 className="text-xs font-semibold mb-2">Versions ({editVersions.length})</h3>
                  {editVersions.map((version, idx) => (
                    <div
                      key={idx}
                      className={`rounded border-2 overflow-hidden transition ${
                        selectedEditVersion === version
                          ? 'border-purple-500 ring-2 ring-purple-200'
                          : 'border-neutral-200'
                      }`}
                    >
                      <img
                        src={version}
                        alt={`Version ${idx + 1}`}
                        onClick={() => setSelectedEditVersion(version)}
                        className="w-full aspect-square object-cover cursor-pointer hover:opacity-90"
                      />
                      <div className="p-1 bg-neutral-50">
                        <div className="text-[9px] text-center mb-1 font-medium">V{idx + 1}</div>
                        <div className="flex gap-1">
                          <a
                            href={version}
                            download={`keiro-edit-v${idx + 1}.png`}
                            className="flex-1 py-0.5 text-[8px] bg-emerald-600 text-white text-center rounded hover:bg-emerald-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            💾
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
                            className="flex-1 py-0.5 text-[8px] bg-red-600 text-white text-center rounded hover:bg-red-700"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* MILIEU : Image sélectionnée */}
                <div className="col-span-7 flex items-center justify-center bg-neutral-50 rounded-lg border overflow-hidden">
                  {selectedEditVersion ? (
                    <img
                      src={selectedEditVersion}
                      alt="Image sélectionnée"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <p className="text-neutral-400">Sélectionnez une version</p>
                  )}
                </div>

                {/* DROITE : Panel Assistant d'édition */}
                <div className="col-span-3 flex flex-col space-y-3 overflow-y-auto">
                  <div className="bg-purple-50 rounded-lg border border-purple-200 p-3">
                    <h3 className="text-sm font-semibold mb-2">Assistant d'Édition</h3>

                    {/* Mode d'édition */}
                    <div className="mb-3">
                      <p className="text-[10px] font-medium mb-1.5">Mode de modification :</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditMode('precise')}
                          className={`flex-1 text-[9px] px-2 py-1.5 rounded transition ${
                            editMode === 'precise'
                              ? 'bg-purple-600 text-white font-medium'
                              : 'bg-white text-purple-800 border border-purple-300 hover:bg-purple-100'
                          }`}
                        >
                          🎯 Précise
                        </button>
                        <button
                          onClick={() => setEditMode('creative')}
                          className={`flex-1 text-[9px] px-2 py-1.5 rounded transition ${
                            editMode === 'creative'
                              ? 'bg-purple-600 text-white font-medium'
                              : 'bg-white text-purple-800 border border-purple-300 hover:bg-purple-100'
                          }`}
                        >
                          ✨ Créative
                        </button>
                      </div>
                      <p className="text-[8px] text-purple-700 mt-1">
                        {editMode === 'precise'
                          ? '🎯 Modifie des détails spécifiques en gardant l\'image proche de l\'original'
                          : '✨ Permet des transformations plus importantes et créatives'}
                      </p>
                    </div>

                    {/* Accompagnement spécialisé dans l'édition */}
                    <div className="mb-3">
                      <p className="text-[10px] font-medium mb-1.5">💡 Aide spécialisée :</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => setSpecialist('seo')}
                          className={`text-[8px] px-1.5 py-1 rounded transition ${
                            specialist === 'seo'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-purple-800 hover:bg-purple-100 border border-purple-300'
                          }`}
                        >
                          📊 SEO
                        </button>
                        <button
                          onClick={() => setSpecialist('marketing')}
                          className={`text-[8px] px-1.5 py-1 rounded transition ${
                            specialist === 'marketing'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-purple-800 hover:bg-purple-100 border border-purple-300'
                          }`}
                        >
                          📈 Marketing
                        </button>
                        <button
                          onClick={() => setSpecialist('content')}
                          className={`text-[8px] px-1.5 py-1 rounded transition ${
                            specialist === 'content'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-purple-800 hover:bg-purple-100 border border-purple-300'
                          }`}
                        >
                          ✍️ Contenu
                        </button>
                        <button
                          onClick={() => setSpecialist('copywriter')}
                          className={`text-[8px] px-1.5 py-1 rounded transition ${
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
                        if (!editPrompt.trim() || !selectedEditVersion) {
                          alert('Veuillez décrire vos modifications');
                          return;
                        }
                        setEditingImage(true);
                        try {
                          console.log('[Edit Studio] Editing image with Seedream 3.0 i2i');

                          // Appeler l'API Seedream 3.0 i2i
                          const res = await fetch('/api/seedream/i2i', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              prompt: editPrompt,
                              image: selectedEditVersion,
                              size: 'adaptive',
                              guidance_scale: editMode === 'precise' ? 5.5 : 7.5,
                            }),
                          });

                          const data = await res.json();
                          if (!data?.ok) throw new Error(data?.error || 'Édition échouée');

                          const newVersion = data.imageUrl;
                          setEditVersions([...editVersions, newVersion]);
                          setSelectedEditVersion(newVersion);
                          setEditPrompt('');
                          alert('Image éditée avec succès!');
                        } catch (e: any) {
                          console.error('[Edit Studio] Error:', e);
                          alert('Erreur: ' + e.message);
                        } finally {
                          setEditingImage(false);
                        }
                      }}
                      disabled={editingImage || !editPrompt.trim() || !selectedEditVersion}
                      className="w-full py-2 text-xs bg-purple-600 text-white font-semibold rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {editingImage ? 'Édition en cours...' : '🎨 Appliquer les modifications'}
                    </button>

                    {/* Actions */}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          if (selectedEditVersion) {
                            setGeneratedImageUrl(selectedEditVersion);
                          }
                          setShowEditStudio(false);
                        }}
                        className="flex-1 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                      >
                        ✓ Valider
                      </button>
                      <button
                        onClick={() => setShowEditStudio(false)}
                        className="flex-1 py-1.5 text-xs border rounded hover:bg-neutral-50"
                      >
                        Annuler
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
      </div>
    </div>
  );
}
