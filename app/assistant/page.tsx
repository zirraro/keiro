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
        <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-4 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                👋 Bonjour {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'à vous'} !
              </h1>
              <p className="text-sm md:text-base text-neutral-600 mb-4">
                Voici votre tableau de bord marketing IA personnalisé
              </p>

              {/* Stats résumé */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-4 md:mt-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 md:p-4">
                  <div className="text-[10px] md:text-xs text-blue-700 font-semibold mb-1">Cette semaine</div>
                  <div className="text-xl md:text-2xl font-bold text-blue-900">{stats.postsThisWeek}</div>
                  <div className="text-[9px] md:text-[10px] text-blue-600">visuels générés</div>
                  {stats.improvement > 0 && (
                    <div className="text-[9px] md:text-[10px] text-green-600 font-semibold mt-1">
                      +{stats.improvement}%
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-3 md:p-4">
                  <div className="text-[10px] md:text-xs text-cyan-700 font-semibold mb-1">Engagement</div>
                  <div className="text-xl md:text-2xl font-bold text-cyan-900">{stats.avgEngagement}</div>
                  <div className="text-[9px] md:text-[10px] text-cyan-600">vues/post</div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3 md:p-4">
                  <div className="text-[10px] md:text-xs text-purple-700 font-semibold mb-1">Top catégorie</div>
                  <div className="text-xs md:text-sm font-bold text-purple-900 truncate">{stats.topCategory}</div>
                  <div className="text-[9px] md:text-[10px] text-purple-600">performance</div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 md:p-4">
                  <div className="text-[10px] md:text-xs text-green-700 font-semibold mb-1">Prochain</div>
                  <div className="text-xs md:text-sm font-bold text-green-900">Mardi 18h</div>
                  <div className="text-[9px] md:text-[10px] text-green-600">meilleur moment</div>
                </div>
              </div>
            </div>

            <a
              href="/generate"
              className="w-full md:w-auto md:ml-4 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm md:text-base font-semibold rounded-xl hover:shadow-lg transition-all text-center shrink-0"
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
  // Données de démo pour afficher des graphiques d'exemple
  const demoEngagementTrend = [
    { date: '2026-01-01', views: 320, likes: 45, comments: 8 },
    { date: '2026-01-05', views: 450, likes: 62, comments: 12 },
    { date: '2026-01-10', views: 380, likes: 51, comments: 9 },
    { date: '2026-01-15', views: 620, likes: 89, comments: 18 },
    { date: '2026-01-20', views: 540, likes: 75, comments: 14 },
    { date: '2026-01-23', views: 710, likes: 102, comments: 22 }
  ];

  const demoBestTimes = [
    { label: 'Mardi 18h', engagement: 850 },
    { label: 'Jeudi 12h', engagement: 720 },
    { label: 'Lundi 9h', engagement: 680 },
    { label: 'Mercredi 20h', engagement: 650 },
    { label: 'Vendredi 17h', engagement: 580 }
  ];

  const demoTopCategories = [
    { category: 'Tech', count: 8, avgEngagement: 450 },
    { category: 'Business', count: 6, avgEngagement: 380 },
    { category: 'Marketing', count: 5, avgEngagement: 520 },
    { category: 'Santé', count: 4, avgEngagement: 310 }
  ];

  // Utiliser les vraies données si disponibles, sinon données de démo
  const hasRealData = stats.totalPosts > 0;
  const displayEngagementTrend = hasRealData && chartData.engagementTrend?.length > 0
    ? chartData.engagementTrend
    : demoEngagementTrend;
  const displayTopCategories = hasRealData && chartData.topCategories?.length > 0
    ? chartData.topCategories
    : demoTopCategories;

  // Préparer les données pour le graphique des meilleurs moments
  let displayBestTimes: Array<{ label: string; engagement: number }> = [];

  if (hasRealData && chartData.bestTimes && Object.keys(chartData.bestTimes).length > 0) {
    // Utiliser les vraies données
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
      displayBestTimes.push({
        label: `${slot.day} ${slot.hour}h`,
        engagement: slot.engagement
      });
    });
  } else {
    // Utiliser les données de démo
    displayBestTimes = demoBestTimes;
  }

  return (
    <div className="space-y-6">
      {/* Bannière démo si pas de vraies données */}
      {!hasRealData && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📊</span>
              <div>
                <h3 className="font-bold text-amber-900 mb-1">Données d'exemple</h3>
                <p className="text-sm text-amber-800">
                  Ces graphiques montrent des données fictives. Commencez à créer des visuels pour voir vos vraies performances !
                </p>
              </div>
            </div>
            <a
              href="/generate"
              className="shrink-0 px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap"
            >
              Créer un visuel →
            </a>
          </div>
        </div>
      )}

      {/* Section Analytics */}
      <div className="bg-white rounded-xl shadow border border-neutral-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">📈 Vos performances</h2>
          {!hasRealData && (
            <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
              EXEMPLE
            </span>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Graphique 1: Évolution engagement */}
          <div className="bg-neutral-50 rounded-lg p-4 h-80">
            <h3 className="text-sm font-semibold mb-3 text-neutral-700">Évolution de l'engagement</h3>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={displayEngagementTrend}>
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
          </div>

          {/* Graphique 2: Meilleurs moments */}
          <div className="bg-neutral-50 rounded-lg p-4 h-80">
            <h3 className="text-sm font-semibold mb-3 text-neutral-700">Meilleurs moments pour poster</h3>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={displayBestTimes} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 9 }} width={80} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="engagement" fill="#06b6d4" name="Engagement" />
                </BarChart>
              </ResponsiveContainer>
          </div>

          {/* Graphique 3: Top catégories */}
          <div className="bg-neutral-50 rounded-lg p-4 h-80">
            <h3 className="text-sm font-semibold mb-3 text-neutral-700">Top catégories</h3>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={displayTopCategories}>
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
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const videos = [
    {
      id: 1,
      title: '🔥 Comment créer du contenu VIRAL sur Instagram',
      thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=800&auto=format&fit=crop',
      duration: '15:42',
      views: '300K vues',
      badge: 'POPULAIRE',
      youtubeId: 'dGcsHMXbSOA', // Marketing Mania - Français
      description: 'Marketing Mania décrypte les stratégies pour créer du contenu viral sur Instagram et exploser votre engagement',
      level: 'Intermédiaire'
    },
    {
      id: 2,
      title: '📊 J\'ai analysé 10 000 posts Instagram - Voici ce qui marche',
      thumbnail: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop',
      duration: '18:23',
      views: '1.5M vues',
      badge: 'NOUVEAU',
      youtubeId: 'nCuN2fvTxSU', // Ali Abdaal - Anglais + sous-titres FR
      description: 'Analyse data-driven de 10 000 posts : patterns, horaires et formats qui génèrent le plus d\'engagement (sous-titres FR disponibles)',
      level: 'Avancé'
    },
    {
      id: 3,
      title: '💰 Marketing d\'actualité : Surfer sur les tendances',
      thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=800&auto=format&fit=crop',
      duration: '22:15',
      views: '180K vues',
      badge: 'ESSENTIEL',
      youtubeId: 'Kc3hYlBQlWs', // HugoDécrypte/LiveMentor - Français
      description: 'Stratégie newsjacking : comment utiliser l\'actualité pour créer du contenu pertinent et booster vos conversions',
      level: 'Intermédiaire'
    },
    {
      id: 4,
      title: '✍️ Copywriting Instagram : Techniques de conversion',
      thumbnail: 'https://images.unsplash.com/photo-1542744094-3a31f272c490?q=80&w=800&auto=format&fit=crop',
      duration: '16:47',
      views: '600K vues',
      badge: '',
      youtubeId: 'Ij5YDj7JEOc', // Vanessa Lau - Anglais + sous-titres FR
      description: 'Formules de copywriting Instagram qui convertissent : templates de légendes prêts à copier (sous-titres FR disponibles)',
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

      {/* Note langues */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <span className="text-xl">🌍</span>
        <div className="text-sm">
          <p className="font-semibold text-blue-900 mb-1">Vidéos en français et sous-titres disponibles</p>
          <p className="text-blue-800">
            Vidéos 1 & 3 : <strong>100% en français</strong> | Vidéos 2 & 4 : <strong>Anglais avec sous-titres français</strong> (activez les CC)
          </p>
        </div>
      </div>

      {/* Vidéos grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {videos.map((video) => (
          <div
            key={video.id}
            onClick={() => setSelectedVideo(video.youtubeId)}
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span>👁️ {video.views}</span>
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-medium">
                    {video.level}
                  </span>
                  <span className={`px-2 py-1 rounded font-bold ${
                    video.id === 1 || video.id === 3
                      ? 'bg-green-100 text-green-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {video.id === 1 || video.id === 3 ? '🇫🇷 FR' : '🇬🇧 EN+FR'}
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

      {/* Modal vidéo YouTube */}
      {selectedVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="relative w-full max-w-4xl bg-white rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Bouton fermer */}
            <button
              onClick={() => setSelectedVideo(null)}
              className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center transition-all shadow-lg"
            >
              <svg className="w-6 h-6 text-neutral-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Vidéo YouTube embed */}
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${selectedVideo}?autoplay=1`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
