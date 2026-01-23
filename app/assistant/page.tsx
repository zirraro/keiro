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
              📚 Formation & Ressources
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

// Onglet Formation
function FormationTab() {
  return (
    <div className="space-y-6">
      {/* Vidéo démo Keiro */}
      <div className="bg-white rounded-xl shadow border border-neutral-200 p-6">
        <h2 className="text-xl font-bold mb-4">🎬 Nouveau sur Keiro ? Regardez le workflow</h2>
        <div className="bg-neutral-100 rounded-lg aspect-video flex items-center justify-center">
          <div className="text-center text-neutral-400">
            <div className="text-4xl mb-2">▶️</div>
            <div className="text-sm">Vidéo démo : De l'actu au post Instagram</div>
            <div className="text-xs">(à intégrer)</div>
          </div>
        </div>
      </div>

      {/* Articles blog (prochaine phase) */}
      <div className="bg-white rounded-xl shadow border border-neutral-200 p-6">
        <h2 className="text-xl font-bold mb-4">📚 Articles & Formations</h2>
        <p className="text-neutral-600 text-sm mb-4">
          Ressources pour améliorer votre marketing (Phase 1.5)
        </p>

        {/* Placeholder articles */}
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { title: '🎯 Comment créer un visuel viral', time: '5 min', level: 'Débutant' },
            { title: '📊 Analyse : 10 000 posts Instagram', time: '12 min', level: 'Avancé' },
          ].map((article, idx) => (
            <div key={idx} className="border border-neutral-200 rounded-lg p-4 hover:border-blue-300 transition-colors cursor-pointer">
              <h3 className="font-semibold mb-2">{article.title}</h3>
              <div className="flex items-center gap-3 text-xs text-neutral-600">
                <span>⏱️ {article.time}</span>
                <span>🏷️ {article.level}</span>
              </div>
              <div className="mt-2 text-xs text-blue-600 font-semibold">
                Lire l'article →
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
