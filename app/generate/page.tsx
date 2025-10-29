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
  const [newsItems, setNewsItems] = useState<NewsCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsCard | null>(null);

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

  /* --- Fetch actualités --- */
  useEffect(() => {
    fetchNews();
  }, [category]);

  async function fetchNews() {
    try {
      setLoading(true);
      setError(null);
      const cat = category === 'Toutes' ? '' : category;
      const url = `/api/news?cat=${encodeURIComponent(cat)}&q=${encodeURIComponent(searchQuery || '')}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Erreur de chargement');
      setNewsItems(data.items || []);
    } catch (e: any) {
      console.error('fetchNews error', e);
      setError('Impossible de récupérer les actualités.');
      setNewsItems([]);
    } finally {
      setLoading(false);
    }
  }

  /* --- Gestion recherche avec debounce --- */
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  function handleSearchChange(value: string) {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchNews();
    }, 400);
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
          <div className="lg:col-span-7">
            {/* Filtres : Catégories + Recherche */}
            <div className="bg-white rounded-xl border p-4 mb-4">
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
            <div className="bg-white rounded-xl border p-4">
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

              {!loading && !error && newsItems.length === 0 && (
                <div className="text-center py-8 text-neutral-500">
                  Aucune actualité trouvée
                </div>
              )}

              {!loading && newsItems.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {newsItems.map((item) => (
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
                        <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                          {item.source && <span>{item.source}</span>}
                          {item.category && (
                            <span className="bg-neutral-100 px-2 py-0.5 rounded">
                              {item.category}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-sm line-clamp-2 mb-2">
                          {item.title}
                        </h3>
                        <p className="text-xs text-neutral-600 line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ===== COLONNE DROITE : Upload + Assistant ===== */}
          <div className="lg:col-span-5 space-y-4">
            {/* Zone Upload Logo/Photo (optionnel) */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-semibold mb-3">Logo / Photo (optionnel)</h3>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition ${
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
                      className="w-24 h-24 object-cover rounded-lg mx-auto border"
                    />
                    <button
                      onClick={() => setLogoUrl(null)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Supprimer
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-2">📸</div>
                    <p className="text-sm text-neutral-600 mb-3">
                      Glissez-déposez votre logo ou photo ici
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
                      className="px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {uploading ? 'Upload...' : 'Choisir un fichier'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Panel Assistant Prompt */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-semibold mb-3">Assistant Marketing</h3>
              <p className="text-sm text-neutral-600 mb-4">
                Renseignez votre business pour générer un visuel adapté à votre activité et l'actualité sélectionnée
              </p>

              <div className="space-y-3">
                {/* Type de business */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Type de business <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    placeholder="Ex: Restaurant, SaaS B2B, E-commerce..."
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Description business */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Description de votre activité
                  </label>
                  <textarea
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    placeholder="Décrivez votre activité en quelques mots..."
                    rows={3}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Audience cible */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Audience cible
                  </label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Ex: Entrepreneurs, Familles, Jeunes actifs..."
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Angle marketing */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Angle / Approche marketing
                  </label>
                  <textarea
                    value={marketingAngle}
                    onChange={(e) => setMarketingAngle(e.target.value)}
                    placeholder="Comment voulez-vous positionner votre message par rapport à l'actualité ?"
                    rows={2}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Plateforme */}
                <div>
                  <label className="block text-sm font-medium mb-1">Plateforme</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-sm font-medium mb-1">Tonalité</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-sm font-medium mb-1">Style visuel</label>
                  <select
                    value={visualStyle}
                    onChange={(e) => setVisualStyle(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>Moderne et épuré</option>
                    <option>Photographique réaliste</option>
                    <option>Illustration</option>
                    <option>Minimaliste</option>
                    <option>Coloré et dynamique</option>
                  </select>
                </div>

                {/* Bouton Générer */}
                <button
                  onClick={handleGenerate}
                  disabled={generating || !selectedNews || !businessType.trim()}
                  className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {generating ? 'Génération en cours...' : 'Générer le visuel'}
                </button>

                {!selectedNews && (
                  <p className="text-xs text-amber-600 text-center">
                    ⚠️ Sélectionnez une actualité à gauche
                  </p>
                )}
              </div>
            </div>

            {/* Résultat de la génération */}
            {generatedImageUrl && (
              <div className="bg-white rounded-xl border p-4">
                <h3 className="font-semibold mb-3">Visuel généré</h3>
                <img
                  src={generatedImageUrl}
                  alt="Visuel généré"
                  className="w-full rounded-lg border"
                />
                <div className="mt-3 flex gap-2">
                  <a
                    href={generatedImageUrl}
                    download
                    className="flex-1 py-2 bg-neutral-900 text-white text-center rounded-lg hover:bg-neutral-800"
                  >
                    Télécharger
                  </a>
                  <button
                    onClick={() => setGeneratedImageUrl(null)}
                    className="px-4 py-2 border rounded-lg hover:bg-neutral-50"
                  >
                    Nouvelle génération
                  </button>
                </div>
              </div>
            )}

            {generationError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                {generationError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
