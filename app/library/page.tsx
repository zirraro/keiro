'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type LibraryItem = {
  id: string;
  type: 'generation' | 'upload';
  title: string;
  image_url: string;
  news_title?: string;
  business_type?: string;
  created_at: string;
};

// Données d'exemple pour les visiteurs
const SAMPLE_ITEMS: LibraryItem[] = [
  {
    id: 'sample-1',
    type: 'generation',
    title: 'Inflation alimentaire - Restaurant bio',
    image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
    news_title: 'L\'inflation alimentaire atteint des records',
    business_type: 'Restaurant bio',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'sample-2',
    type: 'generation',
    title: 'Tech IA - Agence marketing digital',
    image_url: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=500',
    news_title: 'L\'IA révolutionne le marketing digital',
    business_type: 'Agence marketing',
    created_at: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 'sample-3',
    type: 'upload',
    title: 'Logo édité avec IA',
    image_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500',
    created_at: new Date(Date.now() - 259200000).toISOString(),
  },
  {
    id: 'sample-4',
    type: 'generation',
    title: 'Économie d\'énergie - Coach bien-être',
    image_url: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=500',
    news_title: 'Comment économiser l\'énergie cet hiver',
    business_type: 'Coach bien-être',
    created_at: new Date(Date.now() - 345600000).toISOString(),
  },
  {
    id: 'sample-5',
    type: 'generation',
    title: 'Sport JO 2024 - Salle de sport',
    image_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500',
    news_title: 'Les JO 2024 approchent',
    business_type: 'Salle de sport',
    created_at: new Date(Date.now() - 432000000).toISOString(),
  },
  {
    id: 'sample-6',
    type: 'generation',
    title: 'Climat - Entreprise écologique',
    image_url: 'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=500',
    news_title: 'La transition écologique s\'accélère',
    business_type: 'Entreprise écologique',
    created_at: new Date(Date.now() - 518400000).toISOString(),
  },
];

export default function LibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'generation' | 'upload'>('all');

  useEffect(() => {
    if (authLoading) return;

    if (user) {
      // Utilisateur connecté : charger ses vrais items
      fetchUserItems();
    } else {
      // Visiteur : afficher les exemples
      setItems(SAMPLE_ITEMS);
      setLoading(false);
    }
  }, [user, authLoading]);

  async function fetchUserItems() {
    try {
      setLoading(true);
      const res = await fetch('/api/library/list?limit=50');
      const data = await res.json();

      if (data.ok) {
        setItems(data.items || []);
      } else {
        console.error('Error fetching items:', data.error);
        setItems([]);
      }
    } catch (e) {
      console.error('Fetch error:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // Filtrer les items
  const filteredItems = items.filter((item) => {
    // Filtre par recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        item.title.toLowerCase().includes(query) ||
        item.news_title?.toLowerCase().includes(query) ||
        item.business_type?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Filtre par type
    if (typeFilter !== 'all' && item.type !== typeFilter) {
      return false;
    }

    return true;
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-neutral-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">
              {user ? 'Ma Librairie' : 'Librairie - Mode Visiteur'}
            </h1>
            {!user && (
              <span className="px-3 py-1 text-xs bg-amber-100 text-amber-800 rounded-full font-medium">
                👁️ Exemple
              </span>
            )}
          </div>
          <p className="text-neutral-600">
            {user
              ? 'Retrouvez tous vos visuels sauvegardés'
              : 'Aperçu de votre future librairie personnalisée. Connectez-vous pour sauvegarder vos créations!'}
          </p>
        </div>

        {/* Barre de recherche et filtres */}
        <div className="bg-white rounded-xl border p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Recherche */}
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par titre, actualité, business..."
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filtre par type */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tous les types</option>
              <option value="generation">Générations IA</option>
              <option value="upload">Images uploadées</option>
            </select>
          </div>

          {/* Stats */}
          <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm text-neutral-600">
            <span>
              {filteredItems.length} {filteredItems.length > 1 ? 'visuels' : 'visuel'}
              {searchQuery || typeFilter !== 'all' ? ' trouvé(s)' : ''}
            </span>
            {user && items.length > 0 && (
              <span>Total: {items.length} visuels sauvegardés</span>
            )}
          </div>
        </div>

        {/* Grille de visuels */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-neutral-200 rounded-lg animate-pulse"
              ></div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-xl font-semibold text-neutral-900 mb-2">
              {user ? 'Aucun visuel sauvegardé' : 'Mode visiteur'}
            </h3>
            <p className="text-neutral-600 mb-6">
              {user
                ? 'Commencez à créer des visuels pour les voir apparaître ici'
                : 'Connectez-vous pour sauvegarder vos créations et y accéder à tout moment'}
            </p>
            <a
              href="/generate"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Générer un visuel
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="group bg-white rounded-lg border overflow-hidden hover:shadow-lg transition-all"
              >
                <div className="aspect-square overflow-hidden bg-neutral-100">
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        item.type === 'generation'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {item.type === 'generation' ? '✨ Généré' : '📤 Uploadé'}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold line-clamp-2 mb-1">
                    {item.title}
                  </h3>
                  {item.business_type && (
                    <p className="text-xs text-neutral-600 line-clamp-1 mb-2">
                      {item.business_type}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    <a
                      href={item.image_url}
                      download
                      className="text-blue-600 hover:text-blue-700 font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ↓
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Message pour les visiteurs */}
        {!user && items.length > 0 && (
          <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 text-center">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              💡 Créez votre librairie personnalisée
            </h3>
            <p className="text-blue-700 mb-4">
              Connectez-vous pour sauvegarder automatiquement vos créations et y accéder depuis n'importe quel appareil.
            </p>
            <button
              onClick={() => {
                // Le header gère le modal d'auth
                const authButton = document.querySelector('header button') as HTMLButtonElement;
                authButton?.click();
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Se connecter
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
