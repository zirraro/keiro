/**
 * Agent Context Enrichment
 * Fetches live data from external APIs and sector knowledge
 * to inject into agent prompts for ultra-intelligent responses.
 *
 * Each agent gets only the data relevant to their expertise.
 */

// Lazy imports to avoid breaking if API libs have issues
async function loadGoogleTrends() {
  try { return await import('@/lib/apis/google-trends'); } catch { return null; }
}
async function loadSerp() {
  try { return await import('@/lib/apis/serp'); } catch { return null; }
}
async function loadMetaAds() {
  try { return await import('@/lib/apis/meta-ads'); } catch { return null; }
}
async function loadGoogleBusiness() {
  try { return await import('@/lib/apis/google-business'); } catch { return null; }
}
async function loadEmailAnalytics() {
  try { return await import('@/lib/apis/email-analytics'); } catch { return null; }
}
async function loadSectorKnowledge() {
  try { return await import('@/lib/agents/sector-knowledge'); } catch { return null; }
}

// Agent → which APIs to fetch
const AGENT_API_MAP: Record<string, string[]> = {
  marketing: ['sector', 'trends', 'meta_overview'],
  content: ['sector', 'trends'],
  seo: ['sector', 'serp', 'trends'],
  gmaps: ['sector', 'google_business'],
  dm_instagram: ['sector', 'trends'],
  tiktok_comments: ['sector', 'trends'],
  chatbot: ['sector'],
  commercial: ['sector'],
  email: ['sector', 'email_analytics'],
  ads: ['sector', 'meta_ads'],
  comptable: ['sector'],
  rh: ['sector'],
  onboarding: ['sector'],
};

interface EnrichmentResult {
  sectorContext: string;
  liveDataContext: string;
}

/**
 * Enrich agent context with sector knowledge + live API data.
 * Non-blocking: if any API fails, we just skip it.
 * Returns additional context to append to the system prompt.
 */
export async function enrichAgentContext(
  agentId: string,
  businessType: string | null,
  googleMapsUrl?: string | null,
): Promise<EnrichmentResult> {
  const apis = AGENT_API_MAP[agentId] || ['sector'];
  const parts: string[] = [];
  let sectorContext = '';

  // Sector knowledge (always fast, no API call)
  if (apis.includes('sector') && businessType) {
    try {
      const sectorLib = await loadSectorKnowledge();
      if (sectorLib) {
        const sector = sectorLib.matchSector(businessType);
        if (sector) {
          sectorContext = sectorLib.formatSectorForAgent(sector, agentId);
        }
      }
    } catch (e: any) {
      console.warn('[Enrich] Sector knowledge error:', e?.message);
    }
  }

  // Live data fetching (parallel, with timeout)
  const fetches: Promise<void>[] = [];

  // Google Trends
  if (apis.includes('trends')) {
    fetches.push((async () => {
      try {
        const trendsLib = await loadGoogleTrends();
        if (!trendsLib) return;
        const trends = await Promise.race([
          trendsLib.getTrendsForBusinessType(businessType || 'commerce'),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
        if (trends) {
          parts.push(trendsLib.formatTrendsForPrompt(trends));
        }
      } catch (e: any) {
        console.warn('[Enrich] Trends error:', e?.message);
      }
    })());
  }

  // SerpAPI
  if (apis.includes('serp')) {
    fetches.push((async () => {
      try {
        const serpLib = await loadSerp();
        if (!serpLib || !businessType) return;
        const suggestions = await Promise.race([
          serpLib.getKeywordSuggestions(businessType, 'fr'),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
        if (suggestions && Array.isArray(suggestions)) {
          parts.push(serpLib.formatSerpForPrompt(suggestions as any));
        }
      } catch (e: any) {
        console.warn('[Enrich] SERP error:', e?.message);
      }
    })());
  }

  // Meta Ads
  if (apis.includes('meta_ads') || apis.includes('meta_overview')) {
    fetches.push((async () => {
      try {
        const metaLib = await loadMetaAds();
        if (!metaLib) return;
        if (metaLib.isMetaAdsConfigured()) {
          const overview = await Promise.race([
            metaLib.getAdAccountOverview(),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
          ]);
          if (overview) {
            parts.push(metaLib.formatMetaAdsForPrompt({ overview } as any));
          }
        }
      } catch (e: any) {
        console.warn('[Enrich] Meta Ads error:', e?.message);
      }
    })());
  }

  // Google Business Profile
  if (apis.includes('google_business') && googleMapsUrl) {
    fetches.push((async () => {
      try {
        const gbLib = await loadGoogleBusiness();
        if (!gbLib) return;
        const parsed = await gbLib.analyzeGoogleMapsUrl(googleMapsUrl);
        if (parsed?.placeId) {
          const [profile, reviews] = await Promise.all([
            gbLib.getBusinessProfile(parsed.placeId),
            gbLib.getBusinessReviews(parsed.placeId),
          ]);
          if (profile) {
            parts.push(gbLib.formatBusinessProfileForPrompt(profile, reviews || []));
          }
        }
      } catch (e: any) {
        console.warn('[Enrich] Google Business error:', e?.message);
      }
    })());
  }

  // Email Analytics
  if (apis.includes('email_analytics')) {
    fetches.push((async () => {
      try {
        const emailLib = await loadEmailAnalytics();
        if (!emailLib || !emailLib.isEmailAnalyticsConfigured()) return;
        const overview = await Promise.race([
          emailLib.getEmailOverview(),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
        if (overview) {
          parts.push(emailLib.formatEmailAnalyticsForPrompt(overview));
        }
      } catch (e: any) {
        console.warn('[Enrich] Email analytics error:', e?.message);
      }
    })());
  }

  // Wait for all fetches (with global timeout)
  try {
    await Promise.race([
      Promise.allSettled(fetches),
      new Promise<void>((resolve) => setTimeout(resolve, 8000)), // Max 8s total
    ]);
  } catch {
    // Global timeout — continue with what we have
  }

  return {
    sectorContext,
    liveDataContext: parts.filter(Boolean).join('\n\n'),
  };
}
