import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeTikTokCode, getTikTokUserInfo } from '@/lib/tiktok';

/**
 * GET /api/auth/tiktok-callback
 * Handle TikTok OAuth callback
 */
export async function GET(req: NextRequest) {
  // Fallback base URL (will be overridden by state.origin when available)
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  try {
    const startTime = Date.now();
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Try to extract origin from state early (for error redirects too)
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        if (decoded.origin) {
          baseUrl = decoded.origin;
        }
      } catch {}
    }

    console.log('[TikTokCallback] Starting callback', {
      baseUrl,
      hasCode: !!code,
      hasState: !!state,
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

    // Extract user_id and origin from state parameter (passed during OAuth initiation)
    let userId: string;
    try {
      if (!state) {
        throw new Error('Missing state parameter');
      }
      const stateDecoded = Buffer.from(state, 'base64').toString('utf-8');
      const statePayload = JSON.parse(stateDecoded);
      userId = statePayload.userId;

      // Use origin from state to redirect back to the correct domain
      if (statePayload.origin) {
        baseUrl = statePayload.origin;
      }

      if (!userId) {
        throw new Error('User ID not found in state');
      }

      console.log('[TikTokCallback] Extracted from state - userId:', userId, 'origin:', baseUrl);
    } catch (stateError: any) {
      console.error('[TikTokCallback] Failed to extract user ID from state:', stateError.message);
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent('Invalid session state - please try reconnecting')}`
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

    console.log('[TikTokCallback] ✅ Step 2/5 complete: User ID available from state', {
      userId: userId,
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
      userId: userId,
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
      .eq('id', userId);

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
    let username = null;

    try {
      const userInfo = await getTikTokUserInfo(tokenData.access_token);
      displayName = userInfo.display_name || 'TikTok User';
      username = displayName; // TikTok API doesn't provide @handle, only display_name

      console.log('[TikTokCallback] ✅ Step 4/5 complete: User info received', {
        open_id: userInfo.open_id,
        display_name: userInfo.display_name,
        elapsedMs: Date.now() - startTime
      });

      // Update display name and username in database
      const { error: updateUsernameError } = await supabase
        .from('profiles')
        .update({
          tiktok_username: username,
          tiktok_display_name: displayName
        })
        .eq('id', userId);

      if (updateUsernameError) {
        console.error('[TikTokCallback] Error updating username:', updateUsernameError);
      } else {
        console.log('[TikTokCallback] ✅ Username saved:', username);
      }

    } catch (userInfoError: any) {
      console.error('[TikTokCallback] ⚠️ Step 4/5 warning: Could not fetch user info (but tokens are saved)', {
        error: userInfoError.message,
        errorString: String(userInfoError),
        stack: userInfoError.stack,
        hasScope: tokenData.scope?.includes('user.info.basic'),
        scopes: tokenData.scope,
        elapsedMs: Date.now() - startTime
      });

      // Use open_id as temporary username (always available from token exchange)
      const tempUsername = `TikTok User (${tokenData.open_id.substring(0, 8)}...)`;
      console.log('[TikTokCallback] Using open_id as temporary username:', tempUsername);

      displayName = tempUsername;
      username = tempUsername;

      // Save temporary username so user can see they're connected
      await supabase
        .from('profiles')
        .update({
          tiktok_username: tempUsername,
          tiktok_display_name: tempUsername
        })
        .eq('id', userId);
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
