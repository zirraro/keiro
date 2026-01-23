'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AssistantPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'formation'>('dashboard');

  // Analytics data
  const [stats, setStats] = useState({
    postsThisWeek: 0,
    avgEngagement: 0,
    avgViews: 0,
    avgLikes: 0,
    topCategory: '',
    improvement: 0,
    totalPosts: 0,
    tableExists: false
  });

  const [chartData, setChartData] = useState<any>({
    engagementTrend: [],
    bestTimes: {},
    topCategories: []
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

  async function checkAuth() {
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    setLoading(false);
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/assistant/stats');
      const data = await res.json();

      if (data.ok) {
        setStats(data.stats);
        setChartData(data.chartData);
      } else {
        console.error('Error loading stats:', data.error);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
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
          <DashboardTab stats={stats} chartData={chartData} user={user} />
        ) : (
          <FormationTab />
        )}
      </div>
    </div>
  );
}

// Onglet Dashboard
function DashboardTab({ stats, chartData, user }: any) {
  // Si pas de données, afficher un message d'invitation
  if (!user || stats.totalPosts === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow border border-neutral-200 p-12 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h2 className="text-2xl font-bold mb-2">Commencez à tracker vos performances</h2>
          <p className="text-neutral-600 mb-6">
            Créez vos premiers visuels et suivez leurs performances en temps réel
          </p>
          <a
            href="/generate"
            className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
          >
            Créer mon premier visuel →
          </a>
        </div>

        {/* Instructions pour ajouter des analytics */}
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-200 p-6">
          <h3 className="text-lg font-bold mb-3">💡 Comment ça marche ?</h3>
          <div className="space-y-3 text-sm text-neutral-700">
            <div className="flex gap-3">
              <span className="text-blue-600 font-bold">1.</span>
              <p>Créez des visuels avec Keiro et sauvegardez-les dans votre galerie</p>
            </div>
            <div className="flex gap-3">
              <span className="text-blue-600 font-bold">2.</span>
              <p>Publiez-les sur Instagram (manuellement pour l'instant)</p>
            </div>
            <div className="flex gap-3">
              <span className="text-blue-600 font-bold">3.</span>
              <p>Vos performances s'afficheront automatiquement ici (à venir)</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Préparer les données pour le graphique des meilleurs moments
  const bestTimesData: Array<{ label: string; engagement: number }> = [];
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  if (chartData.bestTimes && Object.keys(chartData.bestTimes).length > 0) {
    // Trouver les 5 meilleurs créneaux horaires
    const allSlots: Array<{ day: string; hour: number; engagement: number }> = [];

    Object.entries(chartData.bestTimes).forEach(([day, hours]: [string, any]) => {
      Object.entries(hours).forEach(([hour, engagement]: [string, any]) => {
        if (engagement > 0) {
          allSlots.push({
            day,
            hour: parseInt(hour),
            engagement: engagement as number
          });
        }
      });
    });

    allSlots.sort((a, b) => b.engagement - a.engagement);

    allSlots.slice(0, 7).forEach(slot => {
      bestTimesData.push({
        label: `${slot.day} ${slot.hour}h`,
        engagement: slot.engagement
      });
    });
  }

  return (
    <div className="space-y-6">
      {/* Section Analytics */}
      <div className="bg-white rounded-xl shadow border border-neutral-200 p-6">
        <h2 className="text-xl font-bold mb-6">📈 Vos performances</h2>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Graphique 1: Évolution engagement */}
          <div className="bg-neutral-50 rounded-lg p-4 h-80">
            <h3 className="text-sm font-semibold mb-3 text-neutral-700">Évolution de l'engagement</h3>
            {chartData.engagementTrend && chartData.engagementTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={chartData.engagementTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getDate()}/${date.getMonth() + 1}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} name="Vues" />
                  <Line type="monotone" dataKey="likes" stroke="#ec4899" strokeWidth={2} name="Likes" />
                  <Line type="monotone" dataKey="comments" stroke="#8b5cf6" strokeWidth={2} name="Commentaires" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
                Pas encore de données
              </div>
            )}
          </div>

          {/* Graphique 2: Meilleurs moments */}
          <div className="bg-neutral-50 rounded-lg p-4 h-80">
            <h3 className="text-sm font-semibold mb-3 text-neutral-700">Meilleurs moments pour poster</h3>
            {bestTimesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={bestTimesData} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 9 }} width={80} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="engagement" fill="#06b6d4" name="Engagement" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
                Pas encore de données
              </div>
            )}
          </div>

          {/* Graphique 3: Top catégories */}
          <div className="bg-neutral-50 rounded-lg p-4 h-80">
            <h3 className="text-sm font-semibold mb-3 text-neutral-700">Top catégories</h3>
            {chartData.topCategories && chartData.topCategories.length > 0 ? (
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={chartData.topCategories}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 9 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="count" fill="#3b82f6" name="Nombre de posts" />
                  <Bar dataKey="avgEngagement" fill="#10b981" name="Engagement moyen" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
                Pas encore de données
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section Insights IA (prochaine phase) */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl shadow border border-purple-200 p-6">
        <h2 className="text-xl font-bold mb-4">🤖 Insights IA personnalisés</h2>
        {stats.totalPosts >= 10 ? (
          <div className="space-y-3 text-sm">
            <div className="bg-white rounded-lg p-4 border border-purple-200">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <div>
                  <p className="font-semibold mb-1">Recommandation stratégique</p>
                  <p className="text-neutral-700">
                    Votre catégorie <strong>{stats.topCategory}</strong> performe exceptionnellement bien.
                    Continuez à créer du contenu dans ce domaine pour maximiser votre engagement.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-purple-200">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <p className="font-semibold mb-1">Analyse de tendance</p>
                  <p className="text-neutral-700">
                    {stats.improvement > 0 ? (
                      <>Votre activité est en hausse de <strong>{stats.improvement}%</strong> cette semaine. Excellente dynamique !</>
                    ) : (
                      <>Maintenez votre rythme de publication pour optimiser votre visibilité.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-neutral-600 text-sm">
            Créez au moins 10 posts avec analytics pour débloquer les insights IA personnalisés.
            (Actuellement : {stats.totalPosts} posts)
          </p>
        )}
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
