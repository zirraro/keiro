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

// ─── News API ───────────────────────────────────────────────

async function fetchNews(query: string = 'marketing digital PME'): Promise<NewsItem[]> {
  const NEWS_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_KEY) return [];

  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=fr&sortBy=publishedAt&pageSize=5&apiKey=${NEWS_KEY}`
    );
    if (!res.ok) return [];

    const data = await res.json();
    return (data.articles || []).map((a: any) => ({
      title: a.title,
      source: a.source?.name || '',
      url: a.url,
      publishedAt: a.publishedAt,
      relevance: 0.7,
    }));
  } catch { return []; }
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

  // Complete commercial + holiday calendar (France)
  const commercialCalendar: Array<{ name: string; month: number; day?: number; range?: [number, number]; type: CalendarEvent['type']; action?: string }> = [
    // Janvier
    { name: 'Nouvel An', month: 1, day: 1, type: 'holiday', action: 'Post voeux + offre nouveau depart' },
    { name: 'Soldes d\'hiver', month: 1, range: [10, 31], type: 'commercial', action: 'Campagne promo + emails soldes + pubs geolocalisees' },
    { name: 'Galette des rois', month: 1, range: [1, 15], type: 'seasonal', action: 'Contenu gourmand pour restaurants/boulangers' },
    // Fevrier
    { name: 'Chandeleur', month: 2, day: 2, type: 'seasonal', action: 'Contenu crepes/gourmandise' },
    { name: 'Saint-Valentin', month: 2, day: 14, type: 'commercial', action: 'Campagne offres duo/couple, emailing romantique, pubs ciblees' },
    { name: 'Vacances fevrier', month: 2, range: [15, 28], type: 'holiday', action: 'Contenu detente/loisirs' },
    // Mars
    { name: 'Journee de la femme', month: 3, day: 8, type: 'commercial', action: 'Offres speciales femmes, contenu empowerment' },
    { name: 'Printemps (equinoxe)', month: 3, day: 20, type: 'seasonal', action: 'Renouveau visuel, contenus frais/nature' },
    { name: 'French Days printemps', month: 3, range: [25, 31], type: 'commercial', action: 'Promos flash 4 jours, emails urgence' },
    // Avril
    { name: 'Poisson d\'avril', month: 4, day: 1, type: 'seasonal', action: 'Post humoristique/engagement' },
    { name: 'Paques', month: 4, range: [10, 21], type: 'commercial', action: 'Offres chocolat/cadeaux, jeux concours' },
    { name: 'Vacances Paques', month: 4, range: [12, 28], type: 'holiday', action: 'Contenu famille/loisirs' },
    // Mai
    { name: 'Fete du travail', month: 5, day: 1, type: 'holiday', action: 'Post repos/bien-etre' },
    { name: 'Victoire 1945', month: 5, day: 8, type: 'holiday' },
    { name: 'Ascension', month: 5, range: [28, 30], type: 'holiday', action: 'Pont = weekend long, contenu voyage/sortie' },
    { name: 'Fete des meres', month: 5, range: [25, 31], type: 'commercial', action: 'Campagne cadeaux maman, emailing, pubs Instagram' },
    // Juin
    { name: 'Fete des peres', month: 6, range: [15, 21], type: 'commercial', action: 'Campagne cadeaux papa' },
    { name: 'Fete de la musique', month: 6, day: 21, type: 'event', action: 'Contenu musical, stories live, engagement' },
    { name: 'Soldes d\'ete', month: 6, range: [25, 30], type: 'commercial', action: 'Campagne soldes ete, promos, emails' },
    // Juillet
    { name: 'Fete nationale', month: 7, day: 14, type: 'holiday', action: 'Post patriotique/festif, offres tricolores' },
    { name: 'Vacances ete', month: 7, range: [1, 31], type: 'seasonal', action: 'Contenu ete/terrasse/vacances, horaires adaptes' },
    // Aout
    { name: 'Assomption', month: 8, day: 15, type: 'holiday' },
    { name: 'Pre-rentree', month: 8, range: [20, 31], type: 'seasonal', action: 'Teasing rentree, preparation campagnes septembre' },
    // Septembre
    { name: 'Rentree', month: 9, range: [1, 10], type: 'seasonal', action: 'Campagne nouveau depart, offres rentree, relance clients inactifs' },
    { name: 'Journees du patrimoine', month: 9, range: [16, 18], type: 'event', action: 'Contenu local/heritage' },
    { name: 'French Days automne', month: 9, range: [25, 30], type: 'commercial', action: 'Promos flash, emails urgence' },
    // Octobre
    { name: 'Octobre rose', month: 10, range: [1, 31], type: 'event', action: 'Contenu solidaire, engagement cause' },
    { name: 'Vacances Toussaint', month: 10, range: [19, 31], type: 'holiday' },
    { name: 'Halloween', month: 10, day: 31, type: 'commercial', action: 'Contenu fun/effrayant, offres speciales, jeux' },
    // Novembre
    { name: 'Toussaint', month: 11, day: 1, type: 'holiday' },
    { name: 'Armistice', month: 11, day: 11, type: 'holiday' },
    { name: 'Singles Day', month: 11, day: 11, type: 'commercial', action: 'Promos solo, offres e-commerce' },
    { name: 'Black Friday', month: 11, range: [22, 29], type: 'commercial', action: 'MEGA campagne: contenu J-14, emails teasing, pubs, countdown, offres flash' },
    { name: 'Cyber Monday', month: 11, day: 30, type: 'commercial', action: 'Prolongation Black Friday en ligne' },
    // Decembre
    { name: 'Calendrier Avent', month: 12, range: [1, 24], type: 'commercial', action: 'Offre du jour, contenu quotidien, engagement stories' },
    { name: 'Noel', month: 12, day: 25, type: 'commercial', action: 'Campagne cadeaux J-21, emailing, pubs ciblees, contenu festif' },
    { name: 'Saint-Sylvestre', month: 12, day: 31, type: 'commercial', action: 'Retrospective annee, voeux, offres nouvel an' },
  ];

  for (const evt of commercialCalendar) {
    const daysUntil = calculateDaysUntil(month, day, evt.month, evt.day, evt.range);
    if (daysUntil >= 0 && daysUntil <= 21) { // 3 weeks ahead
      events.push({
        name: evt.name,
        date: daysUntil === 0 ? 'aujourd\'hui' : `dans ${daysUntil} jours`,
        type: evt.type,
        relevance: daysUntil <= 3 ? 0.98 : daysUntil <= 7 ? 0.95 : daysUntil <= 14 ? 0.7 : 0.5,
        ...(evt.action ? { action: evt.action } : {}),
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

  // Parallel fetch all intelligence sources (uses existing trends system + APIs)
  const [trendsData, weather, externalNews] = await Promise.all([
    fetchTrendsData().catch(() => ({ trends: [] as TrendData[], news: [] as NewsItem[] })),
    fetchWeather(clientCity || 'Paris').catch(() => null),
    fetchNews('marketing digital entrepreneur').catch(() => [] as NewsItem[]),
  ]);

  const trends = trendsData.trends;
  const news = [...trendsData.news, ...externalNews].slice(0, 8);

  const timing = calculateTimingRecommendation(dayOfWeek, hourUtc);
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

  text += '\n━━━ FIN INTELLIGENCE ━━━';
  return text;
}
