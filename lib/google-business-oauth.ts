/**
 * Google Business Profile API helpers.
 * Handles OAuth token exchange, refresh, and review management.
 *
 * API: Google Business Profile API (v1)
 * Scope: https://www.googleapis.com/auth/business.manage
 * Docs: https://developers.google.com/my-business/reference/rest
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GBP_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const GBP_REVIEWS_BASE = 'https://mybusinessreviews.googleapis.com/v1'; // Reviews API is separate

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface GoogleReview {
  name: string; // accounts/{id}/locations/{id}/reviews/{id}
  reviewId: string;
  reviewer: { displayName: string; profilePhotoUrl?: string };
  starRating: string; // ONE, TWO, THREE, FOUR, FIVE
  comment: string;
  createTime: string;
  updateTime: string;
  reviewReply?: { comment: string; updateTime: string };
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }
  return res.json();
}

/**
 * Refresh access token using refresh_token.
 */
export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token refresh failed: ${err}`);
  }
  return res.json();
}

/**
 * Get a valid access token — refreshes if expired.
 */
export async function getValidToken(supabase: any, userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('google_business_access_token, google_business_refresh_token, google_business_token_expiry')
    .eq('id', userId)
    .single();

  if (!profile?.google_business_refresh_token) return null;

  const expiry = profile.google_business_token_expiry ? new Date(profile.google_business_token_expiry) : null;
  const isExpired = !expiry || expiry.getTime() < Date.now() + 60000; // Refresh 1 min before expiry

  if (!isExpired && profile.google_business_access_token) {
    return profile.google_business_access_token;
  }

  // Refresh
  try {
    const tokens = await refreshGoogleToken(profile.google_business_refresh_token);
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await supabase.from('profiles').update({
      google_business_access_token: tokens.access_token,
      google_business_token_expiry: newExpiry,
    }).eq('id', userId);
    return tokens.access_token;
  } catch (e: any) {
    console.error('[GoogleBusiness] Token refresh failed:', e.message);
    return null;
  }
}

/**
 * List Google Business accounts for the authenticated user.
 */
export async function listAccounts(accessToken: string): Promise<any[]> {
  const res = await fetch(`${GBP_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`List accounts failed: ${err}`);
  }
  const data = await res.json();
  return data.accounts || [];
}

/**
 * List locations for a Google Business account.
 */
export async function listLocations(accessToken: string, accountName: string): Promise<any[]> {
  const res = await fetch(`${GBP_BASE}/${accountName}/locations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`List locations failed: ${err}`);
  }
  const data = await res.json();
  return data.locations || [];
}

/**
 * Fetch reviews for a location.
 */
export async function getReviews(accessToken: string, locationName: string, pageSize = 20): Promise<GoogleReview[]> {
  const res = await fetch(`${GBP_REVIEWS_BASE}/${locationName}/reviews?pageSize=${pageSize}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Get reviews failed: ${err}`);
  }
  const data = await res.json();
  return (data.reviews || []).map((r: any) => ({
    name: r.name,
    reviewId: r.name?.split('/').pop() || '',
    reviewer: r.reviewer || { displayName: 'Anonyme' },
    starRating: r.starRating || 'FIVE',
    comment: r.comment || '',
    createTime: r.createTime,
    updateTime: r.updateTime,
    reviewReply: r.reviewReply,
  }));
}

/**
 * Reply to a review.
 */
export async function replyToReview(accessToken: string, reviewName: string, replyText: string): Promise<boolean> {
  const res = await fetch(`${GBP_REVIEWS_BASE}/${reviewName}/reply`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment: replyText }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[GoogleBusiness] Reply failed: ${err}`);
    return false;
  }
  return true;
}

/** Convert star rating enum to number */
export function starRatingToNumber(rating: string): number {
  const map: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return map[rating] || 5;
}
