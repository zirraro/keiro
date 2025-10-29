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
  'Toutes',
  'À la une',
  'Politique',
  'Économie',
  'Business',
  'Sport',
  'People',
  'Santé',
  'Restauration',
  'Tech',
  'Culture',
  'Monde',
  'Auto',
  'Climat',
  'Immo',
  'Lifestyle',
  'Gaming'
];

/* ---------------- Page principale ---------------- */
export default function GeneratePage() {
  /* --- États pour les actualités --- */
  const [category, setCategory] = useState<string>('Toutes');
  const [searchQuery, setSearchQuery] = useState('');
  const [allNewsItems, setAllNewsItems] = useState<NewsCard[]>([]); // Toutes les news en cache
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsCard | null>(null);

  /* --- Filtrer les news selon catégorie et recherche --- */
  const filteredNews = allNewsItems
    .filter((item) => {
      // Filtre par catégorie
      if (category !== 'Toutes' && item.category !== category) return false;
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
  const [platform, setPlatform] = useState('LinkedIn');
  const [tone, setTone] = useState('Professionnel');
  const [visualStyle, setVisualStyle] = useState('Moderne et épuré');

  /* --- États pour la génération --- */
  const [generating, setGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

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

  /* --- Génération de l'image IA --- */
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
      const payload = {
        news: {
          title: selectedNews.title,
          description: selectedNews.description,
          url: selectedNews.url,
          source: selectedNews.source,
        },
        business: {
          type: businessType,
          description: businessDescription,
          targetAudience,
          marketingAngle,
        },
        settings: {
          platform,
          tone,
          visualStyle,
          logoUrl: logoUrl || undefined,
        },
      };

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
          <div className="lg:col-span-9">
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
                          {item.source && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] text-blue-600 hover:underline"
                            >
                              {item.source}
                            </a>
                          )}
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
          <div className="lg:col-span-3 space-y-4">
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
              <h3 className="text-sm font-semibold mb-2">Assistant</h3>

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

                {/* Bouton Générer */}
                <button
                  onClick={handleGenerate}
                  disabled={generating || !selectedNews || !businessType.trim()}
                  className="w-full py-2 text-xs bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {generating ? 'Génération...' : 'Générer'}
                </button>

                {!selectedNews && (
                  <p className="text-[10px] text-amber-600 text-center">
                    ⚠️ Sélectionnez une actualité
                  </p>
                )}
              </div>
            </div>

            {/* Résultat de la génération */}
            {generatedImageUrl && (
              <div className="bg-white rounded-xl border p-3">
                <h3 className="text-sm font-semibold mb-2">Résultat</h3>
                <img
                  src={generatedImageUrl}
                  alt="Visuel généré"
                  className="w-full rounded border"
                />
                <div className="mt-2 flex gap-2">
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
      </div>
    </div>
  );
}
