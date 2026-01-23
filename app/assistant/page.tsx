'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function AssistantPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'formation'>('dashboard');

  // Analytics data
  const [stats, setStats] = useState({
    postsThisWeek: 0,
    avgEngagement: 0,
    topCategory: '',
    improvement: 0
  });

  useEffect(() => {
    checkAuth();
    loadStats();
  }, []);

  async function checkAuth() {
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    setLoading(false);
  }

  async function loadStats() {
    // TODO: Charger les vraies stats depuis l'API
    // Pour l'instant, données simulées
    setStats({
      postsThisWeek: 12,
      avgEngagement: 347,
      topCategory: 'Fitness & Sport',
      improvement: 40
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-neutral-600">Chargement de votre assistant...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header intelligent personnalisé */}
        <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                👋 Bonjour {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'} !
              </h1>
              <p className="text-neutral-600 mb-4">
                Voici votre tableau de bord marketing IA personnalisé
              </p>

              {/* Stats résumé */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                  <div className="text-xs text-blue-700 font-semibold mb-1">Cette semaine</div>
                  <div className="text-2xl font-bold text-blue-900">{stats.postsThisWeek}</div>
                  <div className="text-[10px] text-blue-600">visuels générés</div>
                  {stats.improvement > 0 && (
                    <div className="text-[10px] text-green-600 font-semibold mt-1">
                      +{stats.improvement}% vs semaine dernière
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-4">
                  <div className="text-xs text-cyan-700 font-semibold mb-1">Engagement moyen</div>
                  <div className="text-2xl font-bold text-cyan-900">{stats.avgEngagement}</div>
                  <div className="text-[10px] text-cyan-600">vues/post</div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                  <div className="text-xs text-purple-700 font-semibold mb-1">Top catégorie</div>
                  <div className="text-sm font-bold text-purple-900">{stats.topCategory}</div>
                  <div className="text-[10px] text-purple-600">meilleure performance</div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                  <div className="text-xs text-green-700 font-semibold mb-1">Prochain conseil</div>
                  <div className="text-sm font-bold text-green-900">Mardi 18h</div>
                  <div className="text-[10px] text-green-600">meilleur moment</div>
                </div>
              </div>
            </div>

            <a
              href="/generate"
              className="ml-4 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
            >
              Créer un visuel →
            </a>
          </div>
        </div>

        {/* Navigation onglets */}
        <div className="bg-white rounded-xl shadow border border-neutral-200 mb-6">
          <div className="flex border-b border-neutral-200">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                activeTab === 'dashboard'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              📊 Tableau de bord
            </button>
            <button
              onClick={() => setActiveTab('formation')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                activeTab === 'formation'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              📺 Masterclass
            </button>
          </div>
        </div>

        {/* Contenu selon onglet */}
        {activeTab === 'dashboard' ? (
          <DashboardTab />
        ) : (
          <FormationTab />
        )}
      </div>
    </div>
  );
}

// Onglet Dashboard
function DashboardTab() {
  return (
    <div className="space-y-6">
      {/* Section Analytics */}
      <div className="bg-white rounded-xl shadow border border-neutral-200 p-6">
        <h2 className="text-xl font-bold mb-4">📈 Vos performances</h2>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Placeholder pour graphiques */}
          <div className="bg-neutral-50 rounded-lg p-6 h-64 flex items-center justify-center">
            <div className="text-center text-neutral-400">
              <div className="text-4xl mb-2">📊</div>
              <div className="text-sm">Évolution engagement</div>
              <div className="text-xs">(en développement)</div>
            </div>
          </div>

          <div className="bg-neutral-50 rounded-lg p-6 h-64 flex items-center justify-center">
            <div className="text-center text-neutral-400">
              <div className="text-4xl mb-2">🕒</div>
              <div className="text-sm">Meilleurs moments</div>
              <div className="text-xs">(en développement)</div>
            </div>
          </div>

          <div className="bg-neutral-50 rounded-lg p-6 h-64 flex items-center justify-center">
            <div className="text-center text-neutral-400">
              <div className="text-4xl mb-2">📁</div>
              <div className="text-sm">Top catégories</div>
              <div className="text-xs">(en développement)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Insights IA (prochaine phase) */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl shadow border border-purple-200 p-6">
        <h2 className="text-xl font-bold mb-4">🤖 Insights IA personnalisés</h2>
        <p className="text-neutral-600 text-sm">
          Recommandations intelligentes basées sur vos données (Phase 2)
        </p>
      </div>
    </div>
  );
}

// Onglet Masterclass
function FormationTab() {
  const videos = [
    {
      id: 1,
      title: '🔥 Comment créer un visuel VIRAL en 2026',
      thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=800&auto=format&fit=crop',
      duration: '8:32',
      views: '12K vues',
      badge: 'POPULAIRE',
      youtubeUrl: '#', // À remplacer par vraie URL
      description: 'Les 5 techniques secrètes des top créateurs Instagram pour exploser l\'engagement',
      level: 'Débutant'
    },
    {
      id: 2,
      title: '📊 J\'ai analysé 10 000 posts Instagram - Voici ce qui marche',
      thumbnail: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop',
      duration: '12:47',
      views: '8.5K vues',
      badge: 'NOUVEAU',
      youtubeUrl: '#',
      description: 'Données exclusives : patterns, horaires, formats qui génèrent le plus d\'engagement',
      level: 'Avancé'
    },
    {
      id: 3,
      title: '💰 Newsjacking : Transformer l\'actu en clients',
      thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=800&auto=format&fit=crop',
      duration: '15:20',
      views: '15K vues',
      badge: 'ESSENTIEL',
      youtubeUrl: '#',
      description: 'Stratégie complète pour surfer sur les actualités et booster vos ventes',
      level: 'Intermédiaire'
    },
    {
      id: 4,
      title: '✍️ Copywriting Instagram : 10 formules qui convertissent',
      thumbnail: 'https://images.unsplash.com/photo-1542744094-3a31f272c490?q=80&w=800&auto=format&fit=crop',
      duration: '10:15',
      views: '9K vues',
      badge: '',
      youtubeUrl: '#',
      description: 'Templates de légendes prêts à copier pour maximiser clics et conversions',
      level: 'Débutant'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              📺 Masterclass Marketing
            </h2>
            <p className="text-neutral-700 text-sm">
              Stratégies exclusives pour dominer Instagram et multiplier vos ventes
            </p>
          </div>
          <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
            <div className="text-2xl font-bold text-purple-600">{videos.length}</div>
            <div className="text-xs text-neutral-600">vidéos</div>
          </div>
        </div>
      </div>

      {/* Vidéos grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {videos.map((video) => (
          <div
            key={video.id}
            className="bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden hover:shadow-xl transition-all cursor-pointer group"
          >
            {/* Thumbnail */}
            <div className="relative">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-full h-48 object-cover group-hover:scale-105 transition-transform"
              />

              {/* Play button overlay */}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                  <svg className="w-8 h-8 text-red-600 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>

              {/* Duration badge */}
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded font-semibold">
                {video.duration}
              </div>

              {/* Status badge */}
              {video.badge && (
                <div className={`absolute top-2 left-2 text-white text-xs px-3 py-1 rounded-full font-bold ${
                  video.badge === 'NOUVEAU' ? 'bg-green-500' :
                  video.badge === 'POPULAIRE' ? 'bg-red-500' :
                  'bg-purple-500'
                }`}>
                  {video.badge}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-4">
              <h3 className="font-bold text-neutral-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                {video.title}
              </h3>
              <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                {video.description}
              </p>

              {/* Meta info */}
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <div className="flex items-center gap-3">
                  <span>👁️ {video.views}</span>
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-medium">
                    {video.level}
                  </span>
                </div>
              </div>

              {/* CTA */}
              <button className="mt-4 w-full py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all">
                ▶️ Regarder maintenant
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* CTA final */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-200 p-6 text-center">
        <h3 className="text-xl font-bold mb-2">🚀 Prêt à passer à l'action ?</h3>
        <p className="text-neutral-700 mb-4">
          Mettez en pratique ces stratégies maintenant avec Keiro
        </p>
        <a
          href="/generate"
          className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
        >
          Créer mon premier visuel viral →
        </a>
      </div>
    </div>
  );
}
