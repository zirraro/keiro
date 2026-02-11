import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Helper: Extraire le access_token depuis les cookies Supabase
 */
async function getAccessTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  // Chercher le cookie avec pattern sb-{PROJECT_ID}-auth-token
  for (const cookie of allCookies) {
    if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
      try {
        let cookieValue = cookie.value;

        // Décoder le base64 si nécessaire
        if (cookieValue.startsWith('base64-')) {
          const base64Content = cookieValue.substring(7);
          cookieValue = Buffer.from(base64Content, 'base64').toString('utf-8');
        }

        const parsed = JSON.parse(cookieValue);
        return parsed.access_token || (Array.isArray(parsed) ? parsed[0] : null);
      } catch (err) {
        console.error('[Assistant/Stats] Error processing cookie:', err);
      }
    }
  }

  return cookieStore.get('sb-access-token')?.value ||
         cookieStore.get('supabase-auth-token')?.value ||
         null;
}

/**
 * GET /api/assistant/stats
 * Récupérer les statistiques de performance de l'utilisateur
 */
export async function GET(req: NextRequest) {
  try {
    // Créer le client Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer le token d'accès
    let accessToken = await getAccessTokenFromCookies();

    // Fallback au header Authorization
    if (!accessToken) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

    let user = null;
    if (accessToken) {
      const { data: { user: authUser } } = await supabase.auth.getUser(accessToken);
      if (authUser) user = authUser;
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    console.log('[Assistant/Stats] Fetching stats for user:', user.id);

    // Dates pour les calculs
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Récupérer les analytics des 30 derniers jours
    const { data: analytics, error: analyticsError } = await supabase
      .from('image_analytics')
      .select('*')
      .eq('user_id', user.id)
      .gte('posted_at', thirtyDaysAgo.toISOString())
      .order('posted_at', { ascending: false });

    if (analyticsError) {
      console.error('[Assistant/Stats] Error fetching analytics:', analyticsError);
      // Si la table n'existe pas encore, retourner des données par défaut
      if (analyticsError.code === '42P01') {
        return NextResponse.json({
          ok: true,
          stats: {
            postsThisWeek: 0,
            avgEngagement: 0,
            avgViews: 0,
            avgLikes: 0,
            topCategory: 'N/A',
            improvement: 0,
            totalPosts: 0,
            tableExists: false
          },
          chartData: {
            engagementTrend: [],
            bestTimes: {},
            topCategories: []
          }
        });
      }

      return NextResponse.json(
        { ok: false, error: analyticsError.message },
        { status: 500 }
      );
    }

    // Si pas de données, retourner des valeurs par défaut
    if (!analytics || analytics.length === 0) {
      return NextResponse.json({
        ok: true,
        stats: {
          postsThisWeek: 0,
          avgEngagement: 0,
          avgViews: 0,
          avgLikes: 0,
          topCategory: 'Aucune donnée',
          improvement: 0,
          totalPosts: 0,
          tableExists: true
        },
        chartData: {
          engagementTrend: [],
          bestTimes: {},
          topCategories: []
        }
      });
    }

    // 2. Calculer les stats cette semaine
    const postsThisWeek = analytics.filter(
      (a: any) => new Date(a.posted_at) >= oneWeekAgo
    ).length;

    // 3. Calculer l'engagement moyen (vues par post)
    const totalViews = analytics.reduce((sum: number, a: any) => sum + (a.views || 0), 0);
    const totalLikes = analytics.reduce((sum: number, a: any) => sum + (a.likes || 0), 0);
    const avgViews = analytics.length > 0 ? Math.round(totalViews / analytics.length) : 0;
    const avgLikes = analytics.length > 0 ? Math.round(totalLikes / analytics.length) : 0;
    const avgEngagement = avgViews; // Pour l'instant, utiliser les vues comme métrique principale

    // 4. Trouver la catégorie la plus performante
    const categoryStats: { [key: string]: { count: number; totalEngagement: number } } = {};

    analytics.forEach((a: any) => {
      if (a.category) {
        if (!categoryStats[a.category]) {
          categoryStats[a.category] = { count: 0, totalEngagement: 0 };
        }
        categoryStats[a.category].count++;
        categoryStats[a.category].totalEngagement += (a.views || 0) + (a.likes || 0) * 5;
      }
    });

    let topCategory = 'N/A';
    let maxEngagement = 0;

    Object.entries(categoryStats).forEach(([category, stats]) => {
      if (stats.totalEngagement > maxEngagement) {
        maxEngagement = stats.totalEngagement;
        topCategory = category;
      }
    });

    // 5. Calculer l'amélioration (cette semaine vs semaine dernière)
    const postsLastWeek = analytics.filter(
      (a: any) => {
        const postedAt = new Date(a.posted_at);
        return postedAt >= twoWeeksAgo && postedAt < oneWeekAgo;
      }
    ).length;

    let improvement = 0;
    if (postsLastWeek > 0) {
      improvement = Math.round(((postsThisWeek - postsLastWeek) / postsLastWeek) * 100);
    } else if (postsThisWeek > 0) {
      improvement = 100; // 100% d'amélioration si on passe de 0 à quelque chose
    }

    // 6. Préparer les données pour les graphiques

    // Graphique 1: Tendance d'engagement sur 30 jours
    const engagementTrend = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];

      const dayAnalytics = analytics.filter((a: any) => {
        return a.posted_at && a.posted_at.startsWith(dateStr);
      });

      const dayViews = dayAnalytics.reduce((sum: number, a: any) => sum + (a.views || 0), 0);
      const dayLikes = dayAnalytics.reduce((sum: number, a: any) => sum + (a.likes || 0), 0);
      const dayComments = dayAnalytics.reduce((sum: number, a: any) => sum + (a.comments || 0), 0);

      engagementTrend.push({
        date: dateStr,
        views: dayViews,
        likes: dayLikes,
        comments: dayComments,
        engagement: dayViews + dayLikes * 5 + dayComments * 10
      });
    }

    // Graphique 2: Meilleurs horaires (heatmap jour/heure)
    const bestTimes: { [key: string]: { [key: string]: number } } = {};
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    days.forEach(day => {
      bestTimes[day] = {};
      for (let hour = 0; hour < 24; hour++) {
        bestTimes[day][hour] = 0;
      }
    });

    analytics.forEach((a: any) => {
      if (a.posted_at) {
        const date = new Date(a.posted_at);
        const day = days[date.getDay()];
        const hour = date.getHours();
        const engagement = (a.views || 0) + (a.likes || 0) * 5;

        bestTimes[day][hour] += engagement;
      }
    });

    // Graphique 3: Top catégories
    const topCategories = Object.entries(categoryStats)
      .map(([category, stats]) => ({
        category,
        count: stats.count,
        avgEngagement: Math.round(stats.totalEngagement / stats.count)
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 10);

    // Retourner les stats
    return NextResponse.json({
      ok: true,
      stats: {
        postsThisWeek,
        avgEngagement,
        avgViews,
        avgLikes,
        topCategory,
        improvement,
        totalPosts: analytics.length,
        tableExists: true
      },
      chartData: {
        engagementTrend,
        bestTimes,
        topCategories
      }
    });

  } catch (error: any) {
    console.error('[Assistant/Stats] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
