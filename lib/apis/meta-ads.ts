/**
 * Meta Marketing API integration
 * Requires META_ACCESS_TOKEN and META_AD_ACCOUNT_ID env vars
 * Provides campaign management, analytics, and optimization
 */

const META_API_BASE = 'https://graph.facebook.com/v19.0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CampaignMetrics {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  roas: number;
  reach: number;
  frequency: number;
}

export interface AudienceInsight {
  age_range: string;
  gender: string;
  percentage: number;
  impressions: number;
}

export interface AdAccountOverview {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  averageCtr: number;
  averageCpc: number;
  totalConversions: number;
  averageRoas: number;
  activeCampaigns: number;
  topCampaigns: CampaignMetrics[];
}

export interface CampaignRecommendation {
  name: string;
  objective: string;
  targetAudience: string;
  estimatedBudgetPerDay: number;
  estimatedReach: string;
  creativeIdeas: string[];
  rationale: string;
}

interface BusinessSearchResult {
  name: string;
  id: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isMetaAdsConfigured(): boolean {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

function getAdAccountId(): string {
  const raw = process.env.META_AD_ACCOUNT_ID ?? '';
  return raw.startsWith('act_') ? raw : `act_${raw}`;
}

async function metaFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN is not configured');

  const url = new URL(`${META_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  } as RequestInit);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Meta API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

function parseActions(actions: Array<{ action_type: string; value: string }> | undefined): {
  conversions: number;
  revenue: number;
} {
  if (!actions) return { conversions: 0, revenue: 0 };
  let conversions = 0;
  let revenue = 0;
  for (const a of actions) {
    if (
      a.action_type === 'offsite_conversion' ||
      a.action_type === 'purchase' ||
      a.action_type === 'lead'
    ) {
      conversions += Number(a.value) || 0;
    }
    if (a.action_type === 'omni_purchase') {
      revenue += Number(a.value) || 0;
    }
  }
  return { conversions, revenue };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get performance metrics for all campaigns in the ad account.
 * Defaults to last 30 days if no dateRange is specified.
 */
export async function getCampaignMetrics(
  dateRange?: { since: string; until: string },
): Promise<CampaignMetrics[]> {
  if (!isMetaAdsConfigured()) return getMockCampaignMetrics();

  const cacheKey = `campaigns:${dateRange?.since ?? 'last_30d'}:${dateRange?.until ?? ''}`;
  const cached = getCached<CampaignMetrics[]>(cacheKey);
  if (cached) return cached;

  const accountId = getAdAccountId();
  const timeRange = dateRange
    ? `{"since":"${dateRange.since}","until":"${dateRange.until}"}`
    : undefined;

  const params: Record<string, string> = {
    fields:
      'name,status,insights{spend,impressions,clicks,ctr,cpc,actions,reach,frequency}',
    limit: '100',
  };
  if (timeRange) params.time_range = timeRange;
  if (!dateRange) params.date_preset = 'last_30d';

  try {
    const raw = await metaFetch<{
      data: Array<{
        id: string;
        name: string;
        status: string;
        insights?: {
          data: Array<{
            spend: string;
            impressions: string;
            clicks: string;
            ctr: string;
            cpc: string;
            actions?: Array<{ action_type: string; value: string }>;
            reach: string;
            frequency: string;
          }>;
        };
      }>;
    }>(`/${accountId}/campaigns`, params);

    const metrics: CampaignMetrics[] = raw.data.map((c) => {
      const i = c.insights?.data?.[0];
      const spend = Number(i?.spend) || 0;
      const { conversions, revenue } = parseActions(i?.actions);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        spend,
        impressions: Number(i?.impressions) || 0,
        clicks: Number(i?.clicks) || 0,
        ctr: Number(i?.ctr) || 0,
        cpc: Number(i?.cpc) || 0,
        conversions,
        roas: spend > 0 ? revenue / spend : 0,
        reach: Number(i?.reach) || 0,
        frequency: Number(i?.frequency) || 0,
      };
    });

    setCache(cacheKey, metrics);
    return metrics;
  } catch (err) {
    console.error('[meta-ads] getCampaignMetrics error:', err);
    return [];
  }
}

/**
 * Get audience breakdown (age / gender) for the ad account or a specific campaign.
 */
export async function getAudienceInsights(campaignId?: string): Promise<AudienceInsight[]> {
  if (!isMetaAdsConfigured()) return getMockAudienceInsights();

  const cacheKey = `audience:${campaignId ?? 'account'}`;
  const cached = getCached<AudienceInsight[]>(cacheKey);
  if (cached) return cached;

  const path = campaignId ? `/${campaignId}` : `/${getAdAccountId()}`;

  try {
    const raw = await metaFetch<{
      data: Array<{
        age: string;
        gender: string;
        impressions: string;
        reach: string;
      }>;
    }>(`${path}/insights`, {
      fields: 'age,gender,impressions,reach',
      breakdowns: 'age,gender',
      date_preset: 'last_30d',
      limit: '100',
    });

    const totalImpressions = raw.data.reduce((s, r) => s + Number(r.impressions), 0);

    const insights: AudienceInsight[] = raw.data.map((r) => ({
      age_range: r.age,
      gender: r.gender,
      percentage: totalImpressions > 0 ? (Number(r.impressions) / totalImpressions) * 100 : 0,
      impressions: Number(r.impressions) || 0,
    }));

    setCache(cacheKey, insights);
    return insights;
  } catch (err) {
    console.error('[meta-ads] getAudienceInsights error:', err);
    return [];
  }
}

/**
 * High-level overview of the ad account.
 */
export async function getAdAccountOverview(): Promise<AdAccountOverview> {
  if (!isMetaAdsConfigured()) return getMockAdAccountOverview();

  const cacheKey = 'account_overview';
  const cached = getCached<AdAccountOverview>(cacheKey);
  if (cached) return cached;

  try {
    const campaigns = await getCampaignMetrics();
    const active = campaigns.filter((c) => c.status === 'ACTIVE');

    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
    const totalRoas = campaigns.reduce((s, c) => s + c.roas * c.spend, 0);

    const overview: AdAccountOverview = {
      totalSpend,
      totalImpressions,
      totalClicks,
      averageCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      averageCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      totalConversions,
      averageRoas: totalSpend > 0 ? totalRoas / totalSpend : 0,
      activeCampaigns: active.length,
      topCampaigns: [...campaigns].sort((a, b) => b.roas - a.roas).slice(0, 5),
    };

    setCache(cacheKey, overview);
    return overview;
  } catch (err) {
    console.error('[meta-ads] getAdAccountOverview error:', err);
    return getMockAdAccountOverview();
  }
}

/**
 * Generate campaign recommendations for a given business type, budget and goal.
 * Works even without API access — returns strategic advice based on best practices.
 */
export async function generateCampaignRecommendations(
  businessType: string,
  budget: number,
  goal: string,
): Promise<CampaignRecommendation[]> {
  const dailyBudget = budget / 30;
  const type = businessType.toLowerCase();

  const baseRecommendations: CampaignRecommendation[] = [];

  // Awareness campaign
  if (goal === 'awareness' || goal === 'all') {
    baseRecommendations.push({
      name: `${businessType} - Notoriete locale`,
      objective: 'REACH',
      targetAudience: getTargetAudienceForBusiness(type),
      estimatedBudgetPerDay: Math.max(5, dailyBudget * 0.3),
      estimatedReach: estimateReach(dailyBudget * 0.3, 'reach'),
      creativeIdeas: getCreativeIdeas(type, 'awareness'),
      rationale:
        'Campagne de notoriete pour toucher un maximum de personnes dans votre zone de chalandise. Ideal pour les nouveaux commerces ou le lancement de nouvelles offres.',
    });
  }

  // Traffic / engagement campaign
  if (goal === 'traffic' || goal === 'engagement' || goal === 'all') {
    baseRecommendations.push({
      name: `${businessType} - Trafic site web`,
      objective: 'LINK_CLICKS',
      targetAudience: getTargetAudienceForBusiness(type),
      estimatedBudgetPerDay: Math.max(5, dailyBudget * 0.3),
      estimatedReach: estimateReach(dailyBudget * 0.3, 'traffic'),
      creativeIdeas: getCreativeIdeas(type, 'traffic'),
      rationale:
        'Campagne de trafic pour amener des visiteurs qualifies sur votre site ou page de reservation. Optimise pour le cout par clic le plus bas.',
    });
  }

  // Conversion campaign
  if (goal === 'conversions' || goal === 'sales' || goal === 'all') {
    baseRecommendations.push({
      name: `${businessType} - Conversions`,
      objective: 'CONVERSIONS',
      targetAudience: getTargetAudienceForBusiness(type),
      estimatedBudgetPerDay: Math.max(10, dailyBudget * 0.4),
      estimatedReach: estimateReach(dailyBudget * 0.4, 'conversions'),
      creativeIdeas: getCreativeIdeas(type, 'conversions'),
      rationale:
        'Campagne de conversion optimisee pour les actions a forte valeur (reservations, achats, demandes de devis). Necessite le pixel Meta installe sur votre site.',
    });
  }

  // Retargeting
  baseRecommendations.push({
    name: `${businessType} - Retargeting`,
    objective: 'CONVERSIONS',
    targetAudience: 'Visiteurs du site web (30 derniers jours) + Interactions Instagram/Facebook',
    estimatedBudgetPerDay: Math.max(3, dailyBudget * 0.2),
    estimatedReach: estimateReach(dailyBudget * 0.2, 'retargeting'),
    creativeIdeas: [
      'Carousel des produits/services consultes',
      'Offre speciale "Vous nous avez manque" avec code promo',
      'Temoignages clients en format video courte',
    ],
    rationale:
      'Le retargeting convertit 3 a 5x mieux que le ciblage froid. Ciblez les personnes qui connaissent deja votre marque.',
  });

  return baseRecommendations;
}

/**
 * Format Meta Ads data into a string suitable for injection into an agent prompt.
 */
export function formatMetaAdsForPrompt(data: {
  overview?: AdAccountOverview;
  campaigns?: CampaignMetrics[];
  audience?: AudienceInsight[];
  recommendations?: CampaignRecommendation[];
}): string {
  const lines: string[] = ['## Donnees Meta Ads'];

  if (data.overview) {
    const o = data.overview;
    lines.push('');
    lines.push('### Vue d\'ensemble du compte');
    lines.push(`- Depense totale (30j): ${o.totalSpend.toFixed(2)} EUR`);
    lines.push(`- Impressions: ${o.totalImpressions.toLocaleString('fr-FR')}`);
    lines.push(`- Clics: ${o.totalClicks.toLocaleString('fr-FR')}`);
    lines.push(`- CTR moyen: ${o.averageCtr.toFixed(2)}%`);
    lines.push(`- CPC moyen: ${o.averageCpc.toFixed(2)} EUR`);
    lines.push(`- Conversions: ${o.totalConversions}`);
    lines.push(`- ROAS moyen: ${o.averageRoas.toFixed(2)}x`);
    lines.push(`- Campagnes actives: ${o.activeCampaigns}`);
  }

  if (data.campaigns?.length) {
    lines.push('');
    lines.push('### Campagnes');
    for (const c of data.campaigns.slice(0, 10)) {
      lines.push(
        `- **${c.name}** [${c.status}]: ${c.spend.toFixed(2)} EUR depenses, ${c.impressions} impr, CTR ${c.ctr.toFixed(2)}%, ROAS ${c.roas.toFixed(2)}x`,
      );
    }
  }

  if (data.audience?.length) {
    lines.push('');
    lines.push('### Audience (top segments)');
    const top = [...data.audience].sort((a, b) => b.percentage - a.percentage).slice(0, 8);
    for (const a of top) {
      lines.push(`- ${a.gender} ${a.age_range}: ${a.percentage.toFixed(1)}% (${a.impressions} impr)`);
    }
  }

  if (data.recommendations?.length) {
    lines.push('');
    lines.push('### Recommandations de campagnes');
    for (const r of data.recommendations) {
      lines.push(`- **${r.name}** (${r.objective}): ${r.estimatedBudgetPerDay.toFixed(0)} EUR/jour, portee estimee ${r.estimatedReach}`);
      lines.push(`  Raison: ${r.rationale}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Mock data (used when Meta Ads is not configured)
// ---------------------------------------------------------------------------

function getMockCampaignMetrics(): CampaignMetrics[] {
  return [
    {
      id: 'mock_1',
      name: 'Campagne Notoriete Locale',
      status: 'ACTIVE',
      spend: 150,
      impressions: 25000,
      clicks: 750,
      ctr: 3.0,
      cpc: 0.2,
      conversions: 15,
      roas: 2.5,
      reach: 18000,
      frequency: 1.4,
    },
    {
      id: 'mock_2',
      name: 'Campagne Trafic Site',
      status: 'ACTIVE',
      spend: 200,
      impressions: 15000,
      clicks: 600,
      ctr: 4.0,
      cpc: 0.33,
      conversions: 25,
      roas: 3.2,
      reach: 12000,
      frequency: 1.25,
    },
  ];
}

function getMockAudienceInsights(): AudienceInsight[] {
  return [
    { age_range: '25-34', gender: 'female', percentage: 28, impressions: 7000 },
    { age_range: '25-34', gender: 'male', percentage: 22, impressions: 5500 },
    { age_range: '35-44', gender: 'female', percentage: 20, impressions: 5000 },
    { age_range: '35-44', gender: 'male', percentage: 15, impressions: 3750 },
    { age_range: '18-24', gender: 'female', percentage: 8, impressions: 2000 },
    { age_range: '18-24', gender: 'male', percentage: 7, impressions: 1750 },
  ];
}

function getMockAdAccountOverview(): AdAccountOverview {
  return {
    totalSpend: 350,
    totalImpressions: 40000,
    totalClicks: 1350,
    averageCtr: 3.38,
    averageCpc: 0.26,
    totalConversions: 40,
    averageRoas: 2.9,
    activeCampaigns: 2,
    topCampaigns: getMockCampaignMetrics(),
  };
}

// ---------------------------------------------------------------------------
// Recommendation helpers
// ---------------------------------------------------------------------------

function getTargetAudienceForBusiness(type: string): string {
  const audiences: Record<string, string> = {
    restaurant:
      'Hommes et femmes 25-55 ans, dans un rayon de 10 km, interets: gastronomie, restaurants, sorties',
    boutique:
      'Femmes 20-50 ans, dans un rayon de 15 km, interets: mode, shopping, tendances',
    coach:
      'Hommes et femmes 25-45 ans, interets: developpement personnel, bien-etre, sport, entrepreneuriat',
    coiffeur:
      'Femmes 18-55 ans, dans un rayon de 8 km, interets: beaute, coiffure, soins',
    caviste:
      'Hommes et femmes 30-60 ans, dans un rayon de 15 km, interets: vin, gastronomie, oenologie',
    fleuriste:
      'Hommes et femmes 25-60 ans, dans un rayon de 10 km, interets: decoration, evenements, jardinage',
  };
  return (
    audiences[type] ??
    'Hommes et femmes 25-55 ans, dans un rayon de 15 km, interets lies a votre secteur d\'activite'
  );
}

function estimateReach(dailyBudget: number, type: string): string {
  // Rough CPM-based estimates for France local businesses
  const cpmEstimates: Record<string, number> = {
    reach: 5,
    traffic: 8,
    conversions: 12,
    retargeting: 15,
  };
  const cpm = cpmEstimates[type] ?? 8;
  const dailyImpressions = (dailyBudget / cpm) * 1000;
  const monthlyImpressions = dailyImpressions * 30;
  const reachRatio = type === 'retargeting' ? 0.4 : 0.65;
  const monthlyReach = Math.round(monthlyImpressions * reachRatio);

  if (monthlyReach >= 1000) {
    return `${(monthlyReach / 1000).toFixed(0)}k personnes/mois`;
  }
  return `${monthlyReach} personnes/mois`;
}

function getCreativeIdeas(type: string, goal: string): string[] {
  const ideas: Record<string, Record<string, string[]>> = {
    restaurant: {
      awareness: [
        'Video 15s du plat signature avec musique tendance',
        'Carousel des 5 meilleurs plats avec prix',
        'Reel behind-the-scenes en cuisine',
      ],
      traffic: [
        'Image appetissante avec CTA "Reservez maintenant"',
        'Story du menu du jour avec lien de reservation',
        'Carousel avant/apres de la salle avec ambiance',
      ],
      conversions: [
        'Offre -20% premiere visite avec code promo',
        'Menu decouverte a prix special (limite dans le temps)',
        'Brunch du weekend avec reservation en ligne',
      ],
    },
    boutique: {
      awareness: [
        'Lookbook saisonnier en carousel',
        'Video try-on des nouveautes',
        'Reel tendances de la saison',
      ],
      traffic: [
        'Nouvelle collection avec lien boutique en ligne',
        'Soldes flash 48h avec compte a rebours',
        'Style du jour avec produits tagges',
      ],
      conversions: [
        'Code promo -15% premiere commande',
        'Livraison gratuite ce weekend',
        'Ventes privees exclusives abonnes',
      ],
    },
  };

  const defaultIdeas: Record<string, string[]> = {
    awareness: [
      'Video courte presentant votre activite et vos valeurs',
      'Carousel de vos realisations / produits phares',
      'Temoignage client en format Story',
    ],
    traffic: [
      'Image attractive avec CTA vers votre site',
      'Carousel services/produits avec prix',
      'Offre decouverte avec lien de contact',
    ],
    conversions: [
      'Offre de bienvenue avec code promo exclusif',
      'Promotion limitee dans le temps avec urgence',
      'Pack decouverte a tarif special',
    ],
  };

  return ideas[type]?.[goal] ?? defaultIdeas[goal] ?? defaultIdeas['awareness'];
}
