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

// ─── Google Trends ──────────────────────────────────────────

async function fetchTrends(country: string = 'FR'): Promise<TrendData[]> {
  // Google Trends doesn't have an official API
  // Use SerpAPI or fallback to curated trending topics
  try {
    const SERP_KEY = process.env.SERPAPI_KEY;
    if (SERP_KEY) {
      const res = await fetch(`https://serpapi.com/search.json?engine=google_trends_trending_now&geo=${country}&api_key=${SERP_KEY}`);
      if (res.ok) {
        const data = await res.json();
        return (data.trending_searches || []).slice(0, 10).map((t: any) => ({
          keyword: t.query || t.title,
          region: country,
          interest: t.traffic ? parseInt(t.traffic.replace(/[^0-9]/g, '')) : 50,
          rising: true,
        }));
      }
    }
  } catch { /* silent */ }

  // Fallback: return empty (agents will use their existing knowledge)
  return [];
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

  // Commercial events (France)
  const commercialCalendar: Array<{ name: string; month: number; day?: number; range?: [number, number]; type: CalendarEvent['type'] }> = [
    { name: 'Soldes d\'hiver', month: 1, range: [10, 31], type: 'commercial' },
    { name: 'Saint-Valentin', month: 2, day: 14, type: 'commercial' },
    { name: 'Journee de la femme', month: 3, day: 8, type: 'commercial' },
    { name: 'Paques', month: 4, range: [1, 20], type: 'holiday' },
    { name: 'Fete des meres', month: 5, range: [25, 31], type: 'commercial' },
    { name: 'Fete des peres', month: 6, range: [15, 21], type: 'commercial' },
    { name: 'Soldes d\'ete', month: 6, range: [25, 30], type: 'commercial' },
    { name: 'French Days', month: 9, range: [25, 30], type: 'commercial' },
    { name: 'Halloween', month: 10, day: 31, type: 'commercial' },
    { name: 'Black Friday', month: 11, range: [20, 30], type: 'commercial' },
    { name: 'Cyber Monday', month: 12, day: 2, type: 'commercial' },
    { name: 'Noel', month: 12, range: [1, 25], type: 'commercial' },
    { name: 'Nouvel An', month: 12, range: [26, 31], type: 'commercial' },
  ];

  for (const evt of commercialCalendar) {
    const daysUntil = calculateDaysUntil(month, day, evt.month, evt.day, evt.range);
    if (daysUntil >= 0 && daysUntil <= 21) { // 3 weeks ahead
      events.push({
        name: evt.name,
        date: `dans ${daysUntil} jours`,
        type: evt.type,
        relevance: daysUntil <= 7 ? 0.95 : daysUntil <= 14 ? 0.7 : 0.5,
      });
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

  // Event-based predictions
  for (const evt of events) {
    if (evt.relevance >= 0.7 && evt.type === 'commercial') {
      predictions.push({
        type: 'commercial_event',
        description: `${evt.name} approche (${evt.date}). Preparer campagne: contenu thematique + email sequence + budget pub.`,
        confidence: evt.relevance,
        action_suggested: `Lena: calendrier contenu ${evt.name}. Hugo: sequence email. Felix: budget pub.`,
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

  // Parallel fetch all intelligence sources
  const [trends, weather, news] = await Promise.all([
    fetchTrends('FR').catch(() => [] as TrendData[]),
    fetchWeather(clientCity || 'Paris').catch(() => null),
    fetchNews('marketing digital entrepreneur').catch(() => [] as NewsItem[]),
  ]);

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

  // Events
  if (intel.events.length > 0) {
    text += `\nEVENEMENTS: ${intel.events.map(e => `${e.name} (${e.date}, pertinence ${Math.round(e.relevance * 100)}%)`).join(' | ')}`;
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
