/**
 * Supra-Elite Intelligence Layer
 *
 * 5 levels:
 * 1. Real-time data (trends, weather, news)
 * 2. Temporal intelligence (when to act)
 * 3. Geo intelligence (where to act)
 * 4. Exponential learning (dynamic scoring)
 * 5. Predictive NOAH (anticipation)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { saveLearning } from './learning';
import { fetchAllTrends } from '../trends';
import { fetchNews as fetchNewsArticles } from '../newsProviders';

// ─── Types ──────────────────────────────────────────────────

export interface RealTimeIntelligence {
  trends: TrendData[];
  weather: WeatherData | null;
  news: NewsItem[];
  timing: TimingRecommendation;
  events: CalendarEvent[];
  predictions: Prediction[];
}

interface TrendData {
  keyword: string;
  region: string;
  interest: number; // 0-100
  rising: boolean;
}

interface WeatherData {
  city: string;
  temp: number;
  description: string;
  icon: string;
  forecast_3d: Array<{ date: string; temp_max: number; description: string }>;
}

interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  relevance: number; // 0-1
}

interface TimingRecommendation {
  bestPostHour: number;
  bestEmailHour: number;
  bestDmHour: number;
  dayType: 'weekday' | 'weekend' | 'holiday';
  reasoning: string;
}

interface CalendarEvent {
  name: string;
  date: string;
  type: 'holiday' | 'event' | 'seasonal' | 'commercial';
  relevance: number;
}

interface Prediction {
  type: string;
  description: string;
  confidence: number;
  action_suggested: string;
  agent: string;
  deadline: string;
}

// ─── Trends (uses existing lib/trends system) ──────────────

async function fetchTrendsData(): Promise<{ trends: TrendData[]; news: NewsItem[] }> {
  try {
    const data = await fetchAllTrends(false, 'fr');

    const trends: TrendData[] = [
      // Google Trends
      ...data.googleTrends.slice(0, 8).map(t => ({
        keyword: t.title,
        region: 'FR',
        interest: 80,
        rising: true,
      })),
      // Instagram hashtags
      ...data.instagramHashtags.slice(0, 5).map((h: any) => ({
        keyword: `#${h.tag || h.name || h}`,
        region: 'FR',
        interest: 70,
        rising: true,
      })),
      // TikTok hashtags
      ...data.tiktokRealHashtags.slice(0, 5).map((h: any) => ({
        keyword: `#${h.tag || h.hashtag_name || h}`,
        region: 'FR',
        interest: 75,
        rising: true,
      })),
    ];

    // Convert social trends to news items
    const news: NewsItem[] = [
      ...(data.instagramTrends || []).slice(0, 3).map((t: any) => ({
        title: t.title || t.description || '',
        source: 'Instagram Trends',
        url: t.link || '',
        publishedAt: t.pubDate || new Date().toISOString(),
        relevance: 0.8,
      })),
      ...(data.linkedinTrends || []).slice(0, 2).map((t: any) => ({
        title: t.title || t.description || '',
        source: 'LinkedIn Trends',
        url: t.link || '',
        publishedAt: t.pubDate || new Date().toISOString(),
        relevance: 0.7,
      })),
    ];

    return { trends, news };
  } catch {
    return { trends: [], news: [] };
  }
}

// ─── Weather API (OpenWeather) ──────────────────────────────

async function fetchWeather(city: string = 'Paris'): Promise<WeatherData | null> {
  const WEATHER_KEY = process.env.OPENWEATHER_API_KEY;
  if (!WEATHER_KEY) return null;

  try {
    // Current + 3 day forecast
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)},FR&units=metric&lang=fr&cnt=24&appid=${WEATHER_KEY}`
    );
    if (!res.ok) return null;

    const data = await res.json();
    const current = data.list?.[0];
    if (!current) return null;

    // Extract 3-day forecast (1 per day)
    const forecast: WeatherData['forecast_3d'] = [];
    const seen = new Set<string>();
    for (const item of data.list || []) {
      const date = item.dt_txt?.split(' ')[0];
      if (date && !seen.has(date) && forecast.length < 3) {
        seen.add(date);
        forecast.push({
          date,
          temp_max: Math.round(item.main?.temp_max || 0),
          description: item.weather?.[0]?.description || '',
        });
      }
    }

    return {
      city,
      temp: Math.round(current.main?.temp || 0),
      description: current.weather?.[0]?.description || '',
      icon: current.weather?.[0]?.icon || '',
      forecast_3d: forecast,
    };
  } catch { return null; }
}

// ─── News (uses existing lib/newsProviders) ────────────────

async function fetchExistingNews(): Promise<NewsItem[]> {
  try {
    const articles = await fetchNewsArticles('fr');
    return articles.slice(0, 8).map(a => ({
      title: a.title,
      source: a.source,
      url: a.url,
      publishedAt: a.date || new Date().toISOString(),
      relevance: 0.8,
    }));
  } catch { return []; }
}

// ─── Instagram Insights (P2: timing optimal reel) ───────────

async function fetchInstagramInsights(supabase: SupabaseClient): Promise<{ bestHour?: number; bestDay?: number } | null> {
  try {
    // Get admin profile with Instagram token
    const { data: profile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, facebook_page_access_token')
      .eq('is_admin', true)
      .not('instagram_business_account_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (!profile?.instagram_business_account_id || !profile?.facebook_page_access_token) return null;

    // Fetch recent media insights to determine best posting times
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${profile.instagram_business_account_id}/media?fields=timestamp,like_count,comments_count&limit=50&access_token=${profile.facebook_page_access_token}`
    );
    if (!res.ok) return null;

    const data = await res.json();
    const posts = data.data || [];
    if (posts.length < 5) return null;

    // Analyze which hours get the most engagement
    const hourEngagement: Record<number, { total: number; count: number }> = {};
    for (const post of posts) {
      if (!post.timestamp) continue;
      const hour = new Date(post.timestamp).getHours();
      const engagement = (post.like_count || 0) + (post.comments_count || 0) * 3;
      if (!hourEngagement[hour]) hourEngagement[hour] = { total: 0, count: 0 };
      hourEngagement[hour].total += engagement;
      hourEngagement[hour].count++;
    }

    // Find best hour by average engagement
    let bestHour = 12;
    let bestAvg = 0;
    for (const [hour, data] of Object.entries(hourEngagement)) {
      const avg = data.total / data.count;
      if (avg > bestAvg) { bestAvg = avg; bestHour = parseInt(hour); }
    }

    return { bestHour };
  } catch { return null; }
}

// ─── Timing Engine ──────────────────────────────────────────

function calculateTimingRecommendation(
  dayOfWeek: number,
  hourUtc: number,
  historicalData?: { bestPostHour?: number; bestEmailHour?: number }
): TimingRecommendation {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Default optimal times (Paris timezone = UTC+1/+2)
  const defaults = {
    bestPostHour: isWeekend ? 11 : 12, // 12h-13h Paris weekday, 11h weekend
    bestEmailHour: isWeekend ? 10 : 9,  // 9h-10h Paris B2B weekday
    bestDmHour: isWeekend ? 14 : 18,    // 18h-19h Paris weekday, 14h weekend
  };

  return {
    bestPostHour: historicalData?.bestPostHour ?? defaults.bestPostHour,
    bestEmailHour: historicalData?.bestEmailHour ?? defaults.bestEmailHour,
    bestDmHour: defaults.bestDmHour,
    dayType: isWeekend ? 'weekend' : 'weekday',
    reasoning: isWeekend
      ? 'Weekend: audience detendue, posts lifestyle/inspiration, emails B2C uniquement'
      : `${['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][dayOfWeek]}: jour ouvre, B2B actif, contenu pro/business`,
  };
}

// ─── Calendar Events ────────────────────────────────────────

function getUpcomingEvents(): CalendarEvent[] {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  const events: CalendarEvent[] = [];

  // ═══ WORLDWIDE COMMERCIAL + HOLIDAY CALENDAR ═══
  // Adapts to client region. Used for anticipation, campaigns, content, community building.
  type CalEntry = { name: string; month: number; day?: number; range?: [number, number]; type: CalendarEvent['type']; action?: string; regions?: string[] };
  const commercialCalendar: CalEntry[] = [
    // ═══ GLOBAL (all regions) ═══
    { name: 'Nouvel An', month: 1, day: 1, type: 'holiday', action: 'Post voeux + offre nouveau depart + recap annee', regions: ['ALL'] },
    { name: 'Saint-Valentin', month: 2, day: 14, type: 'commercial', action: 'Campagne duo/couple, emailing romantique, pubs ciblees, community challenge love', regions: ['ALL'] },
    { name: 'Journee de la femme', month: 3, day: 8, type: 'commercial', action: 'Offres speciales, contenu empowerment, community stories', regions: ['ALL'] },
    { name: 'Paques', month: 4, range: [10, 21], type: 'commercial', action: 'Offres chocolat/cadeaux, jeux concours, community egg hunt', regions: ['ALL'] },
    { name: 'Fete des meres', month: 5, range: [8, 31], type: 'commercial', action: 'Campagne cadeaux maman, emailing, pubs, community tribute', regions: ['ALL'] },
    { name: 'Fete des peres', month: 6, range: [15, 21], type: 'commercial', action: 'Campagne cadeaux papa, community fatherhood', regions: ['ALL'] },
    { name: 'Singles Day 11.11', month: 11, day: 11, type: 'commercial', action: 'MEGA promos solo, offres flash, community singles', regions: ['ALL'] },
    { name: 'Black Friday', month: 11, range: [22, 29], type: 'commercial', action: 'MEGA campagne: contenu J-21, emails teasing, pubs countdown, community deals sharing, offres flash', regions: ['ALL'] },
    { name: 'Cyber Monday', month: 11, day: 30, type: 'commercial', action: 'Prolongation Black Friday, offres e-commerce, community last chance', regions: ['ALL'] },
    { name: 'Noel', month: 12, day: 25, type: 'commercial', action: 'Campagne cadeaux J-21, emailing, pubs, contenu festif, community advent', regions: ['ALL'] },
    { name: 'Calendrier Avent', month: 12, range: [1, 24], type: 'commercial', action: 'Offre du jour, contenu quotidien, community daily reveal, engagement stories', regions: ['ALL'] },
    { name: 'Saint-Sylvestre', month: 12, day: 31, type: 'commercial', action: 'Retrospective annee, voeux, offres nouvel an, community best of', regions: ['ALL'] },
    { name: 'Halloween', month: 10, day: 31, type: 'commercial', action: 'Contenu fun/effrayant, offres speciales, community costume contest', regions: ['ALL'] },
    { name: 'Octobre rose (cancer sein)', month: 10, range: [1, 31], type: 'event', action: 'Contenu solidaire, engagement cause, community awareness', regions: ['ALL'] },
    // Earth Day, Environnement
    { name: 'Jour de la Terre', month: 4, day: 22, type: 'event', action: 'Contenu eco-responsable, community green challenge', regions: ['ALL'] },
    { name: 'Blue Monday (jour le plus triste)', month: 1, range: [15, 21], type: 'seasonal', action: 'Contenu motivation/positivite, community uplift', regions: ['ALL'] },

    // ═══ FRANCE ═══
    { name: 'Soldes hiver FR', month: 1, range: [10, 31], type: 'commercial', action: 'Campagne promo + emails soldes + pubs geolocalisees', regions: ['FR'] },
    { name: 'Chandeleur', month: 2, day: 2, type: 'seasonal', action: 'Contenu crepes/gourmandise, community recipe share', regions: ['FR'] },
    { name: 'Galette des rois', month: 1, range: [1, 15], type: 'seasonal', action: 'Contenu gourmand, community king/queen', regions: ['FR'] },
    { name: 'French Days printemps', month: 3, range: [25, 31], type: 'commercial', action: 'Promos flash 4 jours, emails urgence', regions: ['FR'] },
    { name: 'Poisson d\'avril', month: 4, day: 1, type: 'seasonal', action: 'Post humoristique, community prank', regions: ['FR'] },
    { name: 'Fete du travail FR', month: 5, day: 1, type: 'holiday', action: 'Post repos/muguet, community bien-etre', regions: ['FR'] },
    { name: 'Victoire 1945', month: 5, day: 8, type: 'holiday', regions: ['FR'] },
    { name: 'Fete de la musique', month: 6, day: 21, type: 'event', action: 'Contenu musical, stories live, community playlist', regions: ['FR'] },
    { name: 'Soldes ete FR', month: 6, range: [25, 30], type: 'commercial', action: 'Campagne soldes ete', regions: ['FR'] },
    { name: '14 Juillet', month: 7, day: 14, type: 'holiday', action: 'Post festif/tricolore, community celebrations', regions: ['FR'] },
    { name: 'Assomption', month: 8, day: 15, type: 'holiday', regions: ['FR'] },
    { name: 'Rentree FR', month: 9, range: [1, 10], type: 'seasonal', action: 'Campagne nouveau depart, relance clients inactifs, community back to work', regions: ['FR'] },
    { name: 'French Days automne', month: 9, range: [25, 30], type: 'commercial', action: 'Promos flash', regions: ['FR'] },
    { name: 'Journees patrimoine', month: 9, range: [16, 18], type: 'event', action: 'Contenu local/heritage', regions: ['FR'] },
    { name: 'Toussaint', month: 11, day: 1, type: 'holiday', regions: ['FR'] },
    { name: 'Armistice FR', month: 11, day: 11, type: 'holiday', regions: ['FR'] },

    // ═══ BELGIQUE ═══
    { name: 'Soldes hiver BE', month: 1, range: [3, 31], type: 'commercial', action: 'Campagne soldes + pubs geolocalisees Belgique', regions: ['BE'] },
    { name: 'Fete nationale BE', month: 7, day: 21, type: 'holiday', action: 'Post patriotique belge, community belgian pride', regions: ['BE'] },
    { name: 'Soldes ete BE', month: 7, range: [1, 31], type: 'commercial', action: 'Campagne soldes ete Belgique', regions: ['BE'] },
    { name: 'Saint-Nicolas BE', month: 12, day: 6, type: 'commercial', action: 'Campagne cadeaux enfants, contenu tradition belge', regions: ['BE'] },
    { name: 'Armistice BE', month: 11, day: 11, type: 'holiday', regions: ['BE'] },

    // ═══ UK ═══
    { name: 'January Sales UK', month: 1, range: [1, 15], type: 'commercial', action: 'Post-Christmas sales campaign, community new year deals', regions: ['UK'] },
    { name: 'Pancake Day UK', month: 2, range: [20, 28], type: 'seasonal', action: 'Food content, community recipe challenge', regions: ['UK'] },
    { name: 'Mother\'s Day UK', month: 3, range: [10, 20], type: 'commercial', action: 'Gift campaign, email sequences, community tributes', regions: ['UK'] },
    { name: 'Bank Holiday Easter UK', month: 4, range: [10, 21], type: 'holiday', action: 'Spring sales, family content', regions: ['UK'] },
    { name: 'King\'s Birthday UK', month: 6, range: [10, 15], type: 'holiday', action: 'Royal content, community celebration', regions: ['UK'] },
    { name: 'Summer Bank Holiday UK', month: 8, range: [25, 28], type: 'holiday', action: 'End of summer sales', regions: ['UK'] },
    { name: 'Bonfire Night UK', month: 11, day: 5, type: 'event', action: 'Fireworks content, community events', regions: ['UK'] },
    { name: 'Boxing Day UK', month: 12, day: 26, type: 'commercial', action: 'MEGA boxing day sales, community deals', regions: ['UK'] },

    // ═══ USA ═══
    { name: 'Super Bowl US', month: 2, range: [8, 14], type: 'event', action: 'Sports content, community watch party, themed promos', regions: ['US'] },
    { name: 'President\'s Day US', month: 2, range: [15, 21], type: 'commercial', action: 'President\'s Day sales', regions: ['US'] },
    { name: 'Memorial Day US', month: 5, range: [25, 31], type: 'commercial', action: 'Summer kickoff sales, community BBQ', regions: ['US'] },
    { name: 'Independence Day US', month: 7, day: 4, type: 'holiday', action: '4th July content, patriotic promos, community celebrations', regions: ['US'] },
    { name: 'Labor Day US', month: 9, range: [1, 7], type: 'commercial', action: 'Back to school/work sales, community transition', regions: ['US'] },
    { name: 'Thanksgiving US', month: 11, range: [22, 28], type: 'commercial', action: 'Gratitude content, pre-Black Friday teasing, community thankful', regions: ['US'] },
    { name: 'Prime Day US', month: 7, range: [10, 17], type: 'commercial', action: 'Counter-Prime Day deals, community comparisons', regions: ['US'] },

    // ═══ ESPAGNE ═══
    { name: 'Rebajas invierno ES', month: 1, range: [7, 31], type: 'commercial', action: 'Campana rebajas invierno', regions: ['ES'] },
    { name: 'Dia de Reyes ES', month: 1, day: 6, type: 'commercial', action: 'Offres Epiphanie, tradition espagnole, cadeaux', regions: ['ES'] },
    { name: 'San Fermin ES', month: 7, range: [6, 14], type: 'event', action: 'Contenu feria/corrida, community local culture', regions: ['ES'] },
    { name: 'Hispanidad ES', month: 10, day: 12, type: 'holiday', action: 'Contenu culture hispanique', regions: ['ES'] },
    { name: 'Rebajas verano ES', month: 7, range: [1, 31], type: 'commercial', action: 'Campana rebajas verano', regions: ['ES'] },
    { name: 'Navidad ES', month: 12, range: [1, 25], type: 'commercial', action: 'Campana Navidad completa', regions: ['ES'] },

    // ═══ PORTUGAL ═══
    { name: 'Dia de Portugal', month: 6, day: 10, type: 'holiday', action: 'Contenu patriotique portugais', regions: ['PT'] },
    { name: 'Saldos inverno PT', month: 1, range: [7, 28], type: 'commercial', action: 'Campanha saldos inverno', regions: ['PT'] },
    { name: 'Saldos verao PT', month: 8, range: [1, 31], type: 'commercial', action: 'Campanha saldos verao', regions: ['PT'] },
    { name: 'Santos Populares PT', month: 6, range: [13, 29], type: 'event', action: 'Contenu festas, sardines, community celebrations', regions: ['PT'] },

    // ═══ MOYEN-ORIENT ═══
    { name: 'Ramadan', month: 3, range: [1, 30], type: 'seasonal', action: 'Contenu respectueux ramadan, offres iftar, community spiritualite, horaires adaptes', regions: ['ME'] },
    { name: 'Eid al-Fitr', month: 4, range: [1, 5], type: 'commercial', action: 'Campagne cadeaux Eid, celebration, community eid mubarak', regions: ['ME'] },
    { name: 'Eid al-Adha', month: 6, range: [15, 19], type: 'commercial', action: 'Campagne cadeaux, contenu familial, community celebration', regions: ['ME'] },
    { name: 'White Friday ME', month: 11, range: [22, 29], type: 'commercial', action: 'Equivalent Black Friday, MEGA promos Moyen-Orient', regions: ['ME'] },
    { name: 'Dubai Shopping Festival', month: 12, range: [15, 31], type: 'commercial', action: 'Mega deals, luxury promos', regions: ['ME'] },

    // ═══ PAYS DU NORD (Scandinavie) ═══
    { name: 'Midsommar (Solstice)', month: 6, range: [20, 24], type: 'holiday', action: 'Contenu nature/lumiere, community midsummer celebration', regions: ['NORD'] },
    { name: 'Lucia SE', month: 12, day: 13, type: 'event', action: 'Tradition lumiere, contenu festif scandinave', regions: ['NORD'] },
    { name: 'Black Week NORD', month: 11, range: [20, 30], type: 'commercial', action: 'Semaine entiere de promos (pas juste vendredi)', regions: ['NORD'] },
    { name: 'Vappu FI (Fete travail)', month: 5, day: 1, type: 'holiday', action: 'Celebration printemps nordique', regions: ['NORD'] },
    { name: 'Kingsday NL', month: 4, day: 27, type: 'event', action: 'Fete du Roi Pays-Bas, contenu orange', regions: ['NORD'] },

    // ═══ PAYS DE L'EST ═══
    { name: 'Noel orthodoxe', month: 1, day: 7, type: 'holiday', action: 'Voeux Noel orthodoxe, contenu respectueux traditions', regions: ['EAST'] },
    { name: 'Maslenitsa (carnaval russe)', month: 2, range: [20, 28], type: 'seasonal', action: 'Contenu festif, blini, community carnival', regions: ['EAST'] },
    { name: 'Journee de la femme EST', month: 3, day: 8, type: 'commercial', action: 'Tres important en Europe de l Est — cadeaux, fleurs, offres premium', regions: ['EAST'] },
    { name: 'Paques orthodoxe', month: 4, range: [20, 30], type: 'holiday', action: 'Contenu Paques orthodoxe, traditions', regions: ['EAST'] },
    { name: 'Nouvel An orthodoxe', month: 1, day: 14, type: 'holiday', action: 'Second New Year celebration', regions: ['EAST'] },
    { name: 'Black Friday EST', month: 11, range: [22, 29], type: 'commercial', action: 'Promos, adapte marches locaux', regions: ['EAST'] },

    // ═══ RUSSIE ═══
    { name: 'Nouvel An RU (vacances longues)', month: 1, range: [1, 8], type: 'holiday', action: 'Semaine de vacances, contenu celebration, offres nouvel an russe', regions: ['RU'] },
    { name: 'Defender Day RU', month: 2, day: 23, type: 'holiday', action: 'Cadeaux hommes, equivalent fete peres', regions: ['RU'] },
    { name: 'Journee femme RU (8 mars)', month: 3, day: 8, type: 'commercial', action: 'MEGA event en Russie — fleurs, cadeaux, campagne massive', regions: ['RU'] },
    { name: 'Victory Day RU', month: 5, day: 9, type: 'holiday', action: 'Contenu memoriel, respectueux', regions: ['RU'] },
    { name: 'Russia Day', month: 6, day: 12, type: 'holiday', regions: ['RU'] },

    // ═══ AMERIQUE LATINE ═══
    { name: 'Carnaval LATAM', month: 2, range: [10, 20], type: 'event', action: 'Contenu festif carnaval, community dance/music, offres speciales', regions: ['LATAM'] },
    { name: 'Dia de los Muertos MX', month: 11, range: [1, 2], type: 'event', action: 'Contenu celebratory, tradition mexicaine, community altar', regions: ['LATAM'] },
    { name: 'Buen Fin MX', month: 11, range: [15, 20], type: 'commercial', action: 'Black Friday mexicain, MEGA promos', regions: ['LATAM'] },
    { name: 'Dia del Nino LATAM', month: 4, day: 30, type: 'commercial', action: 'Cadeaux enfants, contenu famille', regions: ['LATAM'] },
    { name: 'Fiestas Patrias (independances)', month: 9, range: [15, 18], type: 'holiday', action: 'Contenu patriotique adapte par pays', regions: ['LATAM'] },
    { name: 'Hot Sale LATAM', month: 5, range: [27, 31], type: 'commercial', action: 'MEGA online sale event, emails urgence', regions: ['LATAM'] },

    // ═══ COMMUNITY BUILDING (all regions) ═══
    { name: 'Community Week Challenge', month: 1, range: [15, 22], type: 'event', action: 'Lancer un challenge communautaire 7 jours, engagement x5, UGC, stories participatives', regions: ['ALL'] },
    { name: 'Community AMA Day', month: 3, range: [15, 15], type: 'event', action: 'Ask Me Anything live, stories Q&A, rapprocher la marque de sa communaute', regions: ['ALL'] },
    { name: 'Community Appreciation Day', month: 6, range: [1, 1], type: 'event', action: 'Remercier la communaute, offres exclusives membres, temoignages clients, community spotlight', regions: ['ALL'] },
    { name: 'Community Back to Biz', month: 9, range: [2, 8], type: 'event', action: 'Rentrée communautaire, objectifs partages, mastermind group, challenge rentree', regions: ['ALL'] },
    { name: 'Community Retrospective', month: 12, range: [20, 31], type: 'event', action: 'Best of annee, sondage communaute, wrap-up stories, plans 2027', regions: ['ALL'] },

    // ═══ SEASONAL (all regions) ═══
    { name: 'Printemps (equinoxe)', month: 3, day: 20, type: 'seasonal', action: 'Renouveau visuel, contenus frais/nature, community spring clean', regions: ['ALL'] },
    { name: 'Ete (solstice)', month: 6, day: 21, type: 'seasonal', action: 'Contenu ete/outdoor, horaires adaptes', regions: ['ALL'] },
    { name: 'Automne (equinoxe)', month: 9, day: 22, type: 'seasonal', action: 'Contenu cozy/automne, back to business', regions: ['ALL'] },
    { name: 'Hiver (solstice)', month: 12, day: 21, type: 'seasonal', action: 'Contenu hiver/cocooning, prep fetes', regions: ['ALL'] },
  ];

  for (const evt of commercialCalendar) {
    const daysUntil = calculateDaysUntil(month, day, evt.month, evt.day, evt.range);

    // Future events: up to 14 days ahead (pertinent, pas trop en avance)
    if (daysUntil >= 0 && daysUntil <= 14) {
      events.push({
        name: evt.name,
        date: daysUntil === 0 ? 'aujourd\'hui' : `dans ${daysUntil} jours`,
        type: evt.type,
        relevance: daysUntil <= 3 ? 0.98 : daysUntil <= 7 ? 0.95 : daysUntil <= 14 ? 0.7 : 0.5,
        ...(evt.action ? { action: evt.action } : {}),
      } as any);
    }

    // Recently passed events (< 3 days ago): still surfable with retrospective content
    if (daysUntil < 0 && daysUntil >= -3) {
      events.push({
        name: `${evt.name} (TERMINE)`,
        date: `termine il y a ${Math.abs(daysUntil)} jour${Math.abs(daysUntil) > 1 ? 's' : ''}`,
        type: evt.type,
        relevance: 0.3,
        ...(evt.action ? { action: `RETROSPECTIVE: bilan ${evt.name}, contenu recap, resultats` } : {}),
      } as any);
    }
  }

  // Seasonal context
  if (month >= 6 && month <= 8) events.push({ name: 'Saison estivale', date: 'maintenant', type: 'seasonal', relevance: 0.8 });
  if (month >= 11 || month <= 2) events.push({ name: 'Saison hivernale', date: 'maintenant', type: 'seasonal', relevance: 0.6 });
  if (month >= 3 && month <= 5) events.push({ name: 'Printemps', date: 'maintenant', type: 'seasonal', relevance: 0.6 });
  if (month >= 9 && month <= 10) events.push({ name: 'Rentree', date: 'maintenant', type: 'seasonal', relevance: 0.8 });

  return events;
}

function calculateDaysUntil(currentMonth: number, currentDay: number, targetMonth: number, targetDay?: number, targetRange?: [number, number]): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), targetMonth - 1, targetDay || targetRange?.[0] || 1);
  if (target < now) target.setFullYear(target.getFullYear() + 1);
  return Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Predictive Engine (NOAH Supra-Elite) ───────────────────

async function generatePredictions(
  supabase: SupabaseClient,
  events: CalendarEvent[],
  weather: WeatherData | null,
): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  // Event-based predictions with specific actions
  for (const evt of events) {
    if (evt.relevance >= 0.5) {
      const action = (evt as any).action || `Preparer campagne ${evt.name}`;
      predictions.push({
        type: evt.type === 'commercial' ? 'commercial_event' : evt.type === 'seasonal' ? 'seasonal' : 'calendar_event',
        description: `${evt.name} (${evt.date}) — ${action}`,
        confidence: evt.relevance,
        action_suggested: action,
        agent: 'ceo',
        deadline: evt.date,
      });
    }
  }

  // Weather-based predictions
  if (weather && weather.temp > 25) {
    predictions.push({
      type: 'weather_opportunity',
      description: `${weather.temp}°C a ${weather.city} — opportunite contenu terrasse/exterieur pour restaurants et commerces.`,
      confidence: 0.85,
      action_suggested: 'Lena: post terrasse/cocktails. Felix: pub geolocalisee 5km. Hugo: email reservation.',
      agent: 'ceo',
      deadline: 'aujourd\'hui',
    });
  }
  if (weather && weather.temp < 5) {
    predictions.push({
      type: 'weather_opportunity',
      description: `${weather.temp}°C a ${weather.city} — contenu cocooning/interieur pour les commerces.`,
      confidence: 0.80,
      action_suggested: 'Lena: post ambiance cosy. Hugo: email offre speciale hiver.',
      agent: 'ceo',
      deadline: 'aujourd\'hui',
    });
  }

  return predictions;
}

// ─── Meta Ads Library (P3: spy concurrents) ─────────────────

async function fetchCompetitorAds(competitors: string[]): Promise<string[]> {
  if (!competitors.length) return [];
  // Meta Ad Library is accessible via Graph API (public, no special key needed for search)
  // But requires a page access token. For now, return empty — will be enhanced with token
  // The competitive intelligence comes from the learnings + content analysis instead
  return [];
}

// ─── Dynamic Scoring Engine ─────────────────────────────────

/**
 * Score an agent action with temporal + contextual weighting.
 * This replaces simple static scoring with a dynamic model that learns.
 */
export async function scoreDynamically(
  supabase: SupabaseClient,
  action: {
    agent: string;
    type: string;
    result: number; // 0-100 performance
    context: {
      dayOfWeek: number;
      hourOfDay: number;
      sector?: string;
      city?: string;
      contentType?: string;
    };
  }
): Promise<void> {
  const { agent, type, result, context } = action;

  // High performance → amplify pattern
  if (result >= 80) {
    await saveLearning(supabase, {
      agent,
      category: 'execution',
      learning: `AMPLIFY: ${agent}/${type} scored ${result}/100. Context: ${context.dayOfWeek === 0 ? 'dimanche' : ['lun','mar','mer','jeu','ven','sam','dim'][context.dayOfWeek]} ${context.hourOfDay}h, ${context.sector || 'all'}, ${context.contentType || 'general'}. Repliquer ce pattern.`,
      evidence: JSON.stringify(context),
      confidence: Math.min(95, result),
    });
  }

  // Low performance → avoid pattern
  if (result <= 30) {
    await saveLearning(supabase, {
      agent,
      category: 'execution',
      learning: `AVOID: ${agent}/${type} scored ${result}/100. Context: ${['lun','mar','mer','jeu','ven','sam','dim'][context.dayOfWeek]} ${context.hourOfDay}h, ${context.sector || 'all'}, ${context.contentType || 'general'}. Eviter ce pattern.`,
      evidence: JSON.stringify(context),
      confidence: 30,
    });
  }
}

// ─── Main: Load Real-Time Intelligence ──────────────────────

/**
 * Load all real-time intelligence for agents.
 * Called by shared-context before each agent action.
 */
export async function loadRealTimeIntelligence(
  supabase: SupabaseClient,
  clientCity?: string,
): Promise<RealTimeIntelligence> {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hourUtc = now.getUTCHours();

  // Parallel fetch all intelligence sources (uses existing systems)
  const [trendsData, weather, existingNews] = await Promise.all([
    fetchTrendsData().catch(() => ({ trends: [] as TrendData[], news: [] as NewsItem[] })),
    fetchWeather(clientCity || 'Paris').catch(() => null),
    fetchExistingNews().catch(() => [] as NewsItem[]),
  ]);

  const trends = trendsData.trends;
  const news = [...existingNews, ...trendsData.news].slice(0, 10);

  // Instagram insights for real timing data
  const igInsights = await fetchInstagramInsights(supabase).catch(() => null);

  const timing = calculateTimingRecommendation(dayOfWeek, hourUtc, igInsights ? { bestPostHour: igInsights.bestHour } : undefined);
  const events = getUpcomingEvents();
  const predictions = await generatePredictions(supabase, events, weather);

  return { trends, weather, news, timing, events, predictions };
}

/**
 * Format intelligence for agent prompt injection.
 */
export function formatIntelligenceForPrompt(intel: RealTimeIntelligence): string {
  let text = '\n\n━━━ INTELLIGENCE TEMPS REEL ━━━';

  // Timing
  text += `\nTIMING: ${intel.timing.dayType} — ${intel.timing.reasoning}`;
  text += `\nMeilleur moment: Post ${intel.timing.bestPostHour}h, Email ${intel.timing.bestEmailHour}h, DM ${intel.timing.bestDmHour}h`;

  // Weather
  if (intel.weather) {
    text += `\nMETEO: ${intel.weather.city} ${intel.weather.temp}°C, ${intel.weather.description}`;
    if (intel.weather.forecast_3d.length > 0) {
      text += ` | Previsions: ${intel.weather.forecast_3d.map(f => `${f.date}: ${f.temp_max}°C ${f.description}`).join(', ')}`;
    }
  }

  // Events with actions
  if (intel.events.length > 0) {
    text += '\nCALENDRIER:';
    for (const e of intel.events.slice(0, 6)) {
      text += `\n- ${e.name} (${e.date}, ${Math.round(e.relevance * 100)}%)${(e as any).action ? ` → ${(e as any).action}` : ''}`;
    }
  }

  // Trends
  if (intel.trends.length > 0) {
    text += `\nTENDANCES: ${intel.trends.slice(0, 5).map(t => t.keyword).join(', ')}`;
  }

  // News
  if (intel.news.length > 0) {
    text += `\nACTUALITES: ${intel.news.slice(0, 3).map(n => n.title).join(' | ')}`;
  }

  // Predictions
  if (intel.predictions.length > 0) {
    text += `\n\nPREDICTIONS NOAH:`;
    for (const p of intel.predictions) {
      text += `\n- [${Math.round(p.confidence * 100)}%] ${p.description} → ${p.action_suggested} (deadline: ${p.deadline})`;
    }
  }

  // Flywheel status
  text += `\n\nFLYWHEEL: L'intelligence collective grandit a chaque action. Plus de clients = plus de data = agents meilleurs = plus de clients.`;

  text += '\n━━━ FIN INTELLIGENCE ━━━';
  return text;
}
