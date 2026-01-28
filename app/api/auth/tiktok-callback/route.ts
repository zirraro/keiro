import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { exchangeTikTokCode, getTikTokUserInfo } from '@/lib/tiktok';

/**
 * GET /api/auth/tiktok-callback
 * Handle TikTok OAuth callback
 */
export async function GET(req: NextRequest) {
  // Get base URL from request or env (declare at top level for catch block access)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    console.log('[TikTokCallback] Starting callback with base URL:', baseUrl);

    // Check for OAuth errors
    if (error) {
      console.error('[TikTokCallback] OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent(errorDescription || error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent('No authorization code received')}`
      );
    }

    // Get environment variables
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI;

    if (!clientKey || !clientSecret || !redirectUri) {
      console.error('[TikTokCallback] Missing TikTok credentials');
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent('TikTok credentials not configured')}`
      );
    }

    console.log('[TikTokCallback] Exchanging code for tokens...');

    // Exchange code for tokens
    const tokenData = await exchangeTikTokCode(code, clientKey, clientSecret, redirectUri);

    console.log('[TikTokCallback] ✅ Tokens received:', {
      open_id: tokenData.open_id,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope
    });

    // Get user info
    console.log('[TikTokCallback] Fetching user info...');
    const userInfo = await getTikTokUserInfo(tokenData.access_token);

    console.log('[TikTokCallback] ✅ User info:', {
      open_id: userInfo.open_id,
      display_name: userInfo.display_name
    });

    // Get authenticated user
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      console.error('[TikTokCallback] User not authenticated:', authError);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_SITE_URL}/tiktok-callback?error=${encodeURIComponent('User not authenticated')}`
      );
    }

    // Save to Supabase profiles
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[TikTokCallback] Missing Supabase credentials');
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent('Database configuration error')}`
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate token expiry
    const tokenExpiry = new Date();
    tokenExpiry.setSeconds(tokenExpiry.getSeconds() + tokenData.expires_in);

    console.log('[TikTokCallback] Saving tokens to database...');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        tiktok_user_id: tokenData.open_id,
        tiktok_username: userInfo.display_name,
        tiktok_access_token: tokenData.access_token,
        tiktok_refresh_token: tokenData.refresh_token,
        tiktok_token_expiry: tokenExpiry.toISOString(),
        tiktok_connected_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[TikTokCallback] Database error:', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint
      });
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent(`Database error: ${updateError.message}`)}`
      );
    }

    console.log('[TikTokCallback] ✅ TikTok account connected successfully');

    // Redirect to success page
    return NextResponse.redirect(
      `${baseUrl}/tiktok-callback?success=true&username=${encodeURIComponent(userInfo.display_name)}`
    );

  } catch (error: any) {
    console.error('[TikTokCallback] Unexpected error:', error);
    return NextResponse.redirect(
      `${baseUrl || 'https://keiroai.com'}/tiktok-callback?error=${encodeURIComponent(error.message || 'Connection failed')}`
    );
  }
}
