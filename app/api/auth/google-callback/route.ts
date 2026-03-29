import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeGoogleCode, listAccounts, listLocations } from '@/lib/google-business-oauth';

export const runtime = 'nodejs';

/**
 * GET /api/auth/google-callback
 * Handle Google OAuth callback — exchange code, save tokens, fetch accounts/locations.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const stateParam = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  // Decode state
  let userId = '';
  let origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.keiroai.com';

  if (stateParam) {
    try {
      const state = JSON.parse(Buffer.from(stateParam, 'base64').toString());
      userId = state.userId || '';
      origin = state.origin || origin;
    } catch {}
  }

  if (error || !code) {
    return NextResponse.redirect(`${origin}/assistant?error=${encodeURIComponent(error || 'Google auth annulee')}`);
  }

  if (!userId) {
    return NextResponse.redirect(`${origin}/assistant?error=${encodeURIComponent('Session expiree')}`);
  }

  const redirectUri = `${origin}/api/auth/google-callback`;

  try {
    // 1. Exchange code for tokens
    const tokens = await exchangeGoogleCode(code, redirectUri);
    console.log(`[GoogleCallback] Token exchange OK for user ${userId}`);

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 2. Save tokens immediately
    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await supabase.from('profiles').update({
      google_business_access_token: tokens.access_token,
      google_business_refresh_token: tokens.refresh_token || null,
      google_business_token_expiry: tokenExpiry,
      google_business_connected_at: new Date().toISOString(),
    }).eq('id', userId);

    // 3. Fetch accounts and first location
    let accountName = '';
    let locationName = '';
    let locationTitle = '';

    try {
      const accounts = await listAccounts(tokens.access_token);
      console.log(`[GoogleCallback] Found ${accounts.length} Google Business accounts`);

      if (accounts.length > 0) {
        accountName = accounts[0].name; // accounts/{id}

        const locations = await listLocations(tokens.access_token, accountName);
        console.log(`[GoogleCallback] Found ${locations.length} locations for ${accountName}`);

        if (locations.length > 0) {
          locationName = locations[0].name; // accounts/{id}/locations/{id}
          locationTitle = locations[0].title || locations[0].storefrontAddress?.locality || '';
        }

        await supabase.from('profiles').update({
          google_business_account_id: accountName,
          google_business_location_id: locationName,
          google_business_location_name: locationTitle,
        }).eq('id', userId);
      }
    } catch (e: any) {
      console.warn(`[GoogleCallback] Account/location fetch failed (non-fatal):`, e.message);
    }

    console.log(`[GoogleCallback] Google Business connected for user ${userId}: account=${accountName}, location=${locationName}`);

    return NextResponse.redirect(`${origin}/assistant?agent=gmaps&google_connected=true`);
  } catch (e: any) {
    console.error('[GoogleCallback] Error:', e.message);
    return NextResponse.redirect(`${origin}/assistant?error=${encodeURIComponent(`Google erreur: ${e.message}`)}`);
  }
}
