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
    const startTime = Date.now();
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    console.log('[TikTokCallback] 🚀 Starting callback', {
      baseUrl,
      hasCode: !!code,
      hasError: !!error,
      timestamp: new Date().toISOString()
    });

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

    console.log('[TikTokCallback] ⏳ Step 1/5: Exchanging code for tokens...', {
      elapsedMs: Date.now() - startTime
    });

    // Exchange code for tokens
    const tokenData = await exchangeTikTokCode(code, clientKey, clientSecret, redirectUri);

    console.log('[TikTokCallback] ✅ Step 1/5 complete: Tokens received', {
      open_id: tokenData.open_id,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      elapsedMs: Date.now() - startTime
    });

    // Get authenticated user EARLY so we can save tokens immediately
    console.log('[TikTokCallback] ⏳ Step 2/5: Verifying authenticated user...', {
      elapsedMs: Date.now() - startTime
    });
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      console.error('[TikTokCallback] ❌ Step 2/5 failed: User not authenticated', {
        error: authError,
        elapsedMs: Date.now() - startTime
      });
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent('User not authenticated')}`
      );
    }

    console.log('[TikTokCallback] ✅ Step 2/5 complete: User authenticated', {
      userId: user.id,
      elapsedMs: Date.now() - startTime
    });

    // Save tokens to database IMMEDIATELY (before fetching user info)
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

    console.log('[TikTokCallback] ⏳ Step 3/5: Saving tokens to database (without username yet)...', {
      userId: user.id,
      tiktokUserId: tokenData.open_id,
      elapsedMs: Date.now() - startTime
    });

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        tiktok_user_id: tokenData.open_id,
        tiktok_access_token: tokenData.access_token,
        tiktok_refresh_token: tokenData.refresh_token,
        tiktok_token_expiry: tokenExpiry.toISOString(),
        tiktok_connected_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[TikTokCallback] ❌ Step 3/5 failed: Database error', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        elapsedMs: Date.now() - startTime
      });
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent(`Database error: ${updateError.message}`)}`
      );
    }

    console.log('[TikTokCallback] ✅ Step 3/5 complete: Tokens saved to database', {
      elapsedMs: Date.now() - startTime
    });

    // Now try to get user info (this might fail, but tokens are already saved)
    console.log('[TikTokCallback] ⏳ Step 4/5: Fetching user info...', {
      elapsedMs: Date.now() - startTime
    });

    let displayName = 'TikTok User';
    try {
      const userInfo = await getTikTokUserInfo(tokenData.access_token);
      displayName = userInfo.display_name;

      console.log('[TikTokCallback] ✅ Step 4/5 complete: User info received', {
        open_id: userInfo.open_id,
        display_name: userInfo.display_name,
        elapsedMs: Date.now() - startTime
      });

      // Update display name and username in database
      await supabase
        .from('profiles')
        .update({
          tiktok_username: displayName,
          tiktok_display_name: displayName
        })
        .eq('id', user.id);

    } catch (userInfoError: any) {
      console.error('[TikTokCallback] ⚠️ Step 4/5 warning: Could not fetch user info (but tokens are saved)', {
        error: userInfoError.message,
        elapsedMs: Date.now() - startTime
      });
      // Don't fail - tokens are already saved, user info is optional
    }

    console.log('[TikTokCallback] ⏳ Step 5/5: Redirecting to success page...', {
      username: displayName,
      elapsedMs: Date.now() - startTime
    });

    // Redirect to success page
    const redirectUrl = `${baseUrl}/tiktok-callback?success=true&username=${encodeURIComponent(displayName)}`;
    console.log('[TikTokCallback] ✅ Step 5/5 complete: Success!', {
      redirectUrl,
      totalElapsedMs: Date.now() - startTime
    });

    return NextResponse.redirect(redirectUrl);

  } catch (error: any) {
    console.error('[TikTokCallback] ❌ FATAL ERROR:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause
    });

    // More detailed error message for debugging
    const errorMsg = error.message
      ? `Error: ${error.message}`
      : 'Connection failed - check Vercel logs for details';

    return NextResponse.redirect(
      `${baseUrl || 'https://keiroai.com'}/tiktok-callback?error=${encodeURIComponent(errorMsg)}`
    );
  }
}
