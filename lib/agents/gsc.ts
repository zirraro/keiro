/**
 * Google Search Console API integration for KeiroAI SEO agent.
 * Uses OAuth2 refresh token for authentication.
 * No SDK dependency — pure fetch.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GscKeywordData {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscPageData {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscReport {
  topKeywords: GscKeywordData[];
  opportunities: GscKeywordData[];
  topPages: GscPageData[];
  summary: {
    totalClicks: number;
    totalImpressions: number;
    avgCtr: number;
    avgPosition: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SITE_URL = "https://keiroai.com";
const ENCODED_SITE_URL = encodeURIComponent(SITE_URL);
const GSC_API = `https://www.googleapis.com/webmasters/v3/sites/${ENCODED_SITE_URL}/searchAnalytics/query`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ---------------------------------------------------------------------------
// OAuth2 Refresh Token Auth
// ---------------------------------------------------------------------------

let cachedToken: { token: string; expiresAt: number } | null = null;

function getOAuthCredentials(): { clientId: string; clientSecret: string; refreshToken: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.log("[GSC] OAuth credentials not set (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN) — returning empty results");
    return null;
  }

  return { clientId, clientSecret, refreshToken };
}

async function getAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 60s margin)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const creds = getOAuthCredentials();
  if (!creds) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.log("[GSC] Token refresh failed:", res.status, text);
      return null;
    }

    const data = await res.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    console.log("[GSC] Access token refreshed successfully");
    return cachedToken.token;
  } catch (err) {
    console.log("[GSC] Error refreshing access token:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  end.setDate(end.getDate() - 1); // yesterday (GSC data has ~2 day delay)
  const start = new Date(end);
  start.setDate(start.getDate() - 27); // 28 days total
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

// ---------------------------------------------------------------------------
// GSC API query
// ---------------------------------------------------------------------------

interface GscQueryOptions {
  dimensions: string[];
  rowLimit?: number;
  dimensionFilterGroups?: Array<{
    filters: Array<{
      dimension: string;
      operator: string;
      expression: string;
    }>;
  }>;
}

async function queryGsc(options: GscQueryOptions): Promise<any[] | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const { startDate, endDate } = getDateRange();

  const body: Record<string, any> = {
    startDate,
    endDate,
    dimensions: options.dimensions,
    rowLimit: options.rowLimit ?? 100,
  };

  if (options.dimensionFilterGroups) {
    body.dimensionFilterGroups = options.dimensionFilterGroups;
  }

  try {
    const res = await fetch(GSC_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.log("[GSC] API query failed:", res.status, text);
      return null;
    }

    const data = await res.json();
    return data.rows ?? [];
  } catch (err) {
    console.log("[GSC] API query error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function toKeywordData(row: any): GscKeywordData {
  return {
    query: row.keys[0],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

function toPageData(row: any): GscPageData {
  return {
    page: row.keys[0],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch top performing pages (last 28 days), sorted by clicks descending.
 */
export async function getTopPages(limit = 25): Promise<GscPageData[]> {
  const rows = await queryGsc({ dimensions: ["page"], rowLimit: limit });
  if (!rows) return [];
  console.log(`[GSC] getTopPages: ${rows.length} rows`);
  return rows.map(toPageData);
}

/**
 * Fetch top keywords with impressions, clicks, CTR, position.
 */
export async function getTopKeywords(limit = 50): Promise<GscKeywordData[]> {
  const rows = await queryGsc({ dimensions: ["query"], rowLimit: limit });
  if (!rows) return [];
  console.log(`[GSC] getTopKeywords: ${rows.length} rows`);
  return rows.map(toKeywordData);
}

/**
 * Fetch keyword opportunities: high impressions but low CTR, position 5-20.
 */
export async function getKeywordOpportunities(limit = 30): Promise<GscKeywordData[]> {
  const rows = await queryGsc({ dimensions: ["query"], rowLimit: 500 });
  if (!rows) return [];

  const opportunities = rows
    .map(toKeywordData)
    .filter((kw) => kw.position >= 5 && kw.position <= 20 && kw.impressions >= 10)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);

  console.log(`[GSC] getKeywordOpportunities: ${opportunities.length} found`);
  return opportunities;
}

/**
 * Fetch performance for a specific keyword.
 */
export async function getKeywordPerformance(keyword: string): Promise<GscKeywordData | null> {
  const rows = await queryGsc({
    dimensions: ["query"],
    rowLimit: 1,
    dimensionFilterGroups: [
      {
        filters: [
          {
            dimension: "query",
            operator: "equals",
            expression: keyword,
          },
        ],
      },
    ],
  });

  if (!rows || rows.length === 0) {
    console.log(`[GSC] getKeywordPerformance: no data for "${keyword}"`);
    return null;
  }

  return toKeywordData(rows[0]);
}

/**
 * Get a full SEO report combining all data.
 */
export async function getGscReport(): Promise<GscReport> {
  const empty: GscReport = {
    topKeywords: [],
    opportunities: [],
    topPages: [],
    summary: { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0 },
  };

  const creds = getOAuthCredentials();
  if (!creds) return empty;

  // Run all queries in parallel
  const [topKeywords, opportunities, topPages] = await Promise.all([
    getTopKeywords(30),
    getKeywordOpportunities(20),
    getTopPages(20),
  ]);

  // Compute summary from broader dataset
  const allKeywords = await queryGsc({ dimensions: ["query"], rowLimit: 1000 });
  let totalClicks = 0;
  let totalImpressions = 0;
  let positionSum = 0;
  const count = allKeywords?.length ?? 0;

  if (allKeywords) {
    for (const row of allKeywords) {
      totalClicks += row.clicks ?? 0;
      totalImpressions += row.impressions ?? 0;
      positionSum += row.position ?? 0;
    }
  }

  const summary = {
    totalClicks,
    totalImpressions,
    avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
    avgPosition: count > 0 ? positionSum / count : 0,
  };

  console.log(
    `[GSC] Report: ${totalClicks} clicks, ${totalImpressions} impressions, avg pos ${summary.avgPosition.toFixed(1)}`
  );

  return { topKeywords, opportunities, topPages, summary };
}
