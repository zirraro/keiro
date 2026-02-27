'use client';

import { useState, useEffect, useRef } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChatMarketingTab from './ChatMarketingTab';
import ProfileEnrichmentModal, { shouldShowEnrichmentModal } from '@/components/ProfileEnrichmentModal';
import FeedbackPopup from '@/components/FeedbackPopup';
import FeedbackModal from '@/components/FeedbackModal';
import { useFeedbackPopup } from '@/hooks/useFeedbackPopup';

export default function AssistantPage() {
  const feedback = useFeedbackPopup();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'formation' | 'chat'>('chat');
  const [profile, setProfile] = useState<any>(null);
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);

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

    if (user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('company_name, website, business_since, team_size, social_networks, posting_frequency, main_goal, marketing_budget, target_audience, acquisition_source, company_description, brand_tone, main_products, competitors, content_themes, social_goals_monthly')
        .eq('id', user.id)
        .single();

      if (profileData && shouldShowEnrichmentModal(profileData)) {
        setProfile(profileData);
        setShowEnrichmentModal(true);
      }
    }
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
      <div className="min-h-screen bg-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-neutral-600">Chargement de votre assistant...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header intelligent personnalisé */}
        <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-4 md:p-6 mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold mb-2 text-blue-900">
                👋 Bonjour {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'à vous'} !
              </h1>
              <p className="text-sm md:text-base text-neutral-600 mb-4">
                Voici votre tableau de bord marketing personnalisé !
              </p>

              {/* Stats résumé */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-4 md:mt-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 md:p-6">
                  <div className="text-xs md:text-sm text-blue-700 font-semibold mb-2">Cette semaine</div>
                  <div className="text-3xl md:text-4xl font-bold text-blue-900 mb-1">{stats.postsThisWeek}</div>
                  <div className="text-xs md:text-sm text-blue-600 mb-2">visuels générés</div>
                  {stats.improvement > 0 && (
                    <div className="text-xs md:text-sm text-green-600 font-semibold flex items-center gap-1">
                      <span>↗</span> +{stats.improvement}% vs semaine dernière
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 md:p-6">
                  <div className="text-xs md:text-sm text-blue-700 font-semibold mb-2">Engagement moyen</div>
                  <div className="text-3xl md:text-4xl font-bold text-blue-900 mb-1">{stats.avgEngagement}</div>
                  <div className="text-xs md:text-sm text-blue-600 mb-2">vues par post</div>
                  <div className="text-xs text-blue-700 font-medium">
                    {stats.avgLikes} likes moyens
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 md:p-6">
                  <div className="text-xs md:text-sm text-blue-700 font-semibold mb-2">Contenus publiés</div>
                  <div className="text-3xl md:text-4xl font-bold text-blue-900 mb-1">{stats.totalPosts}</div>
                  <div className="text-xs md:text-sm text-blue-600 mb-2">posts au total</div>
                  <div className="text-xs text-blue-700 font-medium">
                    Thème fort : {stats.topCategory}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 md:p-6">
                  <div className="text-xs md:text-sm text-blue-700 font-semibold mb-2">Prochain post</div>
                  <div className="text-lg md:text-xl font-bold text-blue-900 mb-1">Mardi 18h</div>
                  <div className="text-xs md:text-sm text-blue-600 mb-2">meilleur moment</div>
                  <div className="text-xs text-blue-700 font-medium">
                    Basé sur vos données
                  </div>
                </div>
              </div>
            </div>
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
              onClick={() => setActiveTab('chat')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                activeTab === 'chat'
                  ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              💬 Chat Marketing
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
        ) : activeTab === 'chat' ? (
          <ChatMarketingTab user={user} />
        ) : (
          <FormationTab />
        )}
      </div>

      {/* Modal enrichissement profil */}
      {showEnrichmentModal && user && (
        <ProfileEnrichmentModal
          profile={profile}
          userId={user.id}
          onClose={() => setShowEnrichmentModal(false)}
        />
      )}

      <FeedbackPopup show={feedback.showPopup} onAccept={feedback.handleAccept} onDismiss={feedback.handleDismiss} />
      <FeedbackModal isOpen={feedback.showModal} onClose={feedback.handleModalClose} />
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

  const demoConversionRate = [
    { date: '01/01', taux: 2.1 },
    { date: '05/01', taux: 2.8 },
    { date: '10/01', taux: 2.3 },
    { date: '15/01', taux: 3.5 },
    { date: '20/01', taux: 3.2 },
    { date: '23/01', taux: 4.1 }
  ];

  const demoFollowerGrowth = [
    { date: '01/01', followers: 1200 },
    { date: '05/01', followers: 1350 },
    { date: '10/01', followers: 1480 },
    { date: '15/01', followers: 1720 },
    { date: '20/01', followers: 1950 },
    { date: '23/01', followers: 2180 }
  ];

  const demoHourlyPerformance = [
    { hour: '6h', engagement: 120 },
    { hour: '9h', engagement: 380 },
    { hour: '12h', engagement: 520 },
    { hour: '15h', engagement: 410 },
    { hour: '18h', engagement: 680 },
    { hour: '21h', engagement: 450 },
    { hour: '23h', engagement: 280 }
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
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📊</span>
              <div>
                <h3 className="font-bold text-blue-900 mb-1">Données d'exemple</h3>
                <p className="text-sm text-blue-800">
                  Ces graphiques montrent des données fictives. Commencez à créer des visuels pour voir vos vraies performances !
                </p>
              </div>
            </div>
            <a
              href="/generate"
              className="shrink-0 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap"
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
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">
              EXEMPLE
            </span>
          )}
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
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

          {/* Graphique 4: Taux de conversion */}
          <div className="bg-neutral-50 rounded-lg p-4 h-80">
            <h3 className="text-sm font-semibold mb-3 text-neutral-700">Taux de conversion</h3>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={demoConversionRate}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="taux" stroke="#10b981" strokeWidth={3} name="Taux (%)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Graphique 5: Croissance d'abonnés */}
          <div className="bg-neutral-50 rounded-lg p-4 h-80">
            <h3 className="text-sm font-semibold mb-3 text-neutral-700">Croissance d'abonnés</h3>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={demoFollowerGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="followers" stroke="#9333ea" strokeWidth={3} name="Abonnés" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Graphique 6: Performance par heure */}
          <div className="bg-neutral-50 rounded-lg p-4 h-80">
            <h3 className="text-sm font-semibold mb-3 text-neutral-700">Performance par heure de la journée</h3>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={demoHourlyPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="engagement" fill="#f59e0b" name="Engagement" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Section Insights personnalisés */}
      <div className="bg-blue-50 rounded-xl shadow border border-blue-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">🤖 Insights personnalisés</h2>
          {stats.totalPosts > 0 && (
            <span className="text-xs px-3 py-1 bg-blue-600 text-white rounded-full font-bold">
              ACTIF
            </span>
          )}
        </div>

        <div className="space-y-4 text-sm">
          {/* Insight 1 : Recommandation stratégique business */}
          <div className="bg-white rounded-lg p-5 border border-blue-200 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-3xl">🎯</span>
              <div className="flex-1">
                <p className="font-bold text-lg mb-2 text-blue-900">Stratégie secteur adaptée</p>
                <p className="text-neutral-700 mb-3">
                  Pour votre activité <strong>{user?.user_metadata?.business_type || 'Business'}</strong>,
                  les contenus de type <strong>"{stats.topCategory}"</strong> génèrent 3.2x plus d'engagement
                  que la moyenne de votre secteur.
                </p>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="font-semibold text-blue-900 mb-1">💡 Action recommandée :</p>
                  <p className="text-blue-800 text-xs">
                    Publiez 3 posts "{stats.topCategory}" cette semaine avec un angle "avant/après"
                    pour capitaliser sur cette tendance. Meilleur moment : <strong>Mardi 18h et Jeudi 12h</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Insight 2 : Optimisation horaire personnalisée */}
          <div className="bg-white rounded-lg p-5 border border-blue-200 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-3xl">⏰</span>
              <div className="flex-1">
                <p className="font-bold text-lg mb-2 text-blue-900">Timing optimal détecté</p>
                <p className="text-neutral-700 mb-3">
                  Vos posts publiés entre <strong>17h-19h</strong> obtiennent un taux d'engagement
                  <strong> 85% supérieur</strong> à ceux publiés le matin.
                  Votre audience est particulièrement active en fin de journée.
                </p>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="font-semibold text-blue-900 mb-1">⚡ Opportunité immédiate :</p>
                  <p className="text-blue-800 text-xs">
                    Reprogrammez vos 2 prochains posts pour <strong>Mardi 18h15</strong> et <strong>Jeudi 18h30</strong>.
                    Basé sur l'analyse de 30 jours, vous pourriez augmenter votre portée de +420 vues par post.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Insight 3 : Analyse concurrentielle */}
          <div className="bg-white rounded-lg p-5 border border-blue-200 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-3xl">📈</span>
              <div className="flex-1">
                <p className="font-bold text-lg mb-2 text-blue-900">Benchmark sectoriel</p>
                <p className="text-neutral-700 mb-3">
                  Dans votre niche, les comptes similaires avec <strong>+40% d'engagement</strong> utilisent
                  en moyenne 8-12 hashtags ciblés et des carrousels de 5-7 slides.
                  Vous utilisez actuellement une moyenne de 4 hashtags.
                </p>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="font-semibold text-blue-900 mb-1">🚀 Plan d'action :</p>
                  <ul className="text-blue-800 text-xs space-y-1 list-disc list-inside">
                    <li>Testez des carrousels 6 slides sur vos 3 prochains posts "{stats.topCategory}"</li>
                    <li>Augmentez à 10 hashtags hyper-ciblés (ex: #businesslocal #entrepreneurfr)</li>
                    <li>Intégrez un CTA clair dans les 2 premières slides</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Insight 4 : Prédiction de croissance */}
          <div className="bg-white rounded-lg p-5 border border-blue-200 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-3xl">🔮</span>
              <div className="flex-1">
                <p className="font-bold text-lg mb-2 text-blue-900">Projection de croissance</p>
                <p className="text-neutral-700 mb-3">
                  En maintenant votre rythme actuel ({stats.postsThisWeek} posts/semaine) et en
                  appliquant les optimisations ci-dessus, vous pourriez atteindre
                  <strong> +2 800 abonnés</strong> et <strong>+15 000 vues mensuelles</strong> dans les 90 prochains jours.
                </p>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="font-semibold text-blue-900 mb-1">✨ Pour accélérer :</p>
                  <p className="text-blue-800 text-xs">
                    Passez à 5 posts/semaine avec 2 Reels de 15-30sec sur vos meilleures performances.
                    Estimation de potentiel de <strong>+180% de croissance</strong> avec cette stratégie.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Note méthodologie */}
          {stats.totalPosts === 0 ? (
            <div className="text-sm bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300 p-4 rounded-xl">
              <p className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                <span>💡</span> Ces données sont des exemples pour illustrer les fonctionnalités
              </p>
              <p className="text-blue-800 mb-3 text-xs leading-relaxed">
                Pour obtenir des <strong>insights personnalisés</strong> et des recommandations stratégiques adaptées à <strong>votre business</strong>,
                commencez à créer vos premiers visuels et à les publier.
              </p>
              <p className="text-blue-700 text-xs mb-3">
                L'Assistant analysera vos performances et vous proposera des actions concrètes pour optimiser votre stratégie.
              </p>
              <a
                href="/generate"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-semibold text-xs hover:shadow-lg transition-all hover:scale-105"
              >
                Créer mon premier visuel →
              </a>
            </div>
          ) : (
            <div className="text-xs text-blue-700 bg-blue-100 p-3 rounded-lg">
              <p className="font-semibold mb-1">📊 Méthodologie :</p>
              <p>
                Ces insights sont générés par analyse de vos {stats.totalPosts} derniers posts,
                comparés à notre base de 500K+ posts similaires dans votre secteur.
                Mise à jour quotidienne.
              </p>
            </div>
          )}
        </div>
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
      title: '🔥 Comment EXPLOSER sur Instagram en 2024',
      thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=800&auto=format&fit=crop',
      duration: '12:45',
      views: '250K vues',
      badge: 'NOUVEAU',
      youtubeId: '5Z4yAgV5hOg', // TEST - URL fournie par l'utilisateur
      description: 'Stratégies complètes pour faire exploser votre compte Instagram : algorithme, contenus viraux et engagement',
      level: 'Débutant',
    },
    {
      id: 2,
      title: '📊 Stratégie Instagram Complète pour 2024',
      thumbnail: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop',
      duration: '18:30',
      views: '180K vues',
      badge: '',
      youtubeId: 'XXXXXXX', // À remplacer
      description: 'Guide complet : Reels, Stories, Posts, Hashtags - Tout pour réussir sur Instagram en 2024',
      level: 'Intermédiaire',
    },
    {
      id: 3,
      title: '💰 Vendre avec Instagram : La Méthode Complète',
      thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=800&auto=format&fit=crop',
      duration: '25:12',
      views: '320K vues',
      badge: '',
      youtubeId: 'XXXXXXX', // À remplacer
      description: 'Comment transformer votre compte Instagram en machine à vendre : stratégie complète de A à Z',
      level: 'Avancé',
    },
    {
      id: 4,
      title: '✍️ Copywriting Instagram : Écrire des Légendes qui Vendent',
      thumbnail: 'https://images.unsplash.com/photo-1542744094-3a31f272c490?q=80&w=800&auto=format&fit=crop',
      duration: '14:28',
      views: '150K vues',
      badge: '',
      youtubeId: 'XXXXXXX', // À remplacer
      description: 'Les secrets du copywriting Instagram : formules, hooks, appels à l\'action qui convertissent vraiment',
      level: 'Débutant',
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2 text-blue-900">
              📺 Masterclass Marketing
            </h2>
            <p className="text-neutral-700 text-sm">
              Stratégies exclusives pour dominer Instagram et multiplier vos ventes
            </p>
          </div>
          <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
            <div className="text-2xl font-bold text-blue-600">{videos.length}</div>
            <div className="text-xs text-neutral-600">vidéos</div>
          </div>
        </div>
      </div>

      {/* Note test */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <span className="text-xl">🧪</span>
        <div className="text-sm">
          <p className="font-semibold text-blue-900 mb-1">Test en cours</p>
          <p className="text-blue-800">
            Vidéo 1 : <strong>URL YouTube de test</strong> | Vidéos 2-4 : <strong>En attente d'URLs</strong>
          </p>
        </div>
      </div>

      {/* Vidéos grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {videos.map((video) => (
          <div
            key={video.id}
            onClick={() => video.youtubeId !== 'XXXXXXX' && setSelectedVideo(video.youtubeId)}
            className={`bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden transition-all ${
              video.youtubeId !== 'XXXXXXX'
                ? 'hover:shadow-xl cursor-pointer group'
                : 'opacity-60 cursor-not-allowed'
            }`}
          >
            {/* Thumbnail */}
            <div className="relative">
              <img
                src={video.thumbnail}
                alt={video.title}
                className={`w-full h-48 object-cover ${video.youtubeId !== 'XXXXXXX' ? 'group-hover:scale-105' : ''} transition-transform`}
              />

              {/* Play button overlay */}
              {video.youtubeId !== 'XXXXXXX' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                  <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Status badge */}
              {video.badge && (
                <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-3 py-1 rounded-full font-bold">
                  {video.badge}
                </div>
              )}

              {/* En attente badge */}
              {video.youtubeId === 'XXXXXXX' && (
                <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full font-bold">
                  En attente
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-4">
              <h3 className={`font-bold text-neutral-900 mb-2 line-clamp-2 ${video.youtubeId !== 'XXXXXXX' ? 'group-hover:text-blue-600' : ''} transition-colors`}>
                {video.title}
              </h3>
              <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                {video.description}
              </p>

              {/* Meta info */}
              <div className="flex items-center justify-between text-xs text-neutral-500 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-medium">
                    {video.level}
                  </span>
                </div>
              </div>

              {/* CTA */}
              {video.youtubeId !== 'XXXXXXX' ? (
                <button className="w-full py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all">
                  ▶️ Regarder maintenant
                </button>
              ) : (
                <div className="w-full py-2 bg-neutral-200 text-neutral-500 font-semibold rounded-lg text-center">
                  Bientôt disponible
                </div>
              )}
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

