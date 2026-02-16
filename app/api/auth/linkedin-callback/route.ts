import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeLinkedInCode, getLinkedInUserInfo } from '@/lib/linkedin';

/**
 * GET /api/auth/linkedin-callback
 * Handle LinkedIn OAuth callback
 */
export async function GET(req: NextRequest) {
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Extract origin from state early
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        if (decoded.origin) {
          baseUrl = decoded.origin;
        }
      } catch {}
    }

    console.log('[LinkedInCallback] Starting callback', {
      baseUrl,
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
    });

    if (error) {
      console.error('[LinkedInCallback] OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        `${baseUrl}/linkedin-callback?error=${encodeURIComponent(errorDescription || error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${baseUrl}/linkedin-callback?error=${encodeURIComponent('No authorization code received')}`
      );
    }

    // Extract user_id from state
    let userId: string;
    try {
      if (!state) throw new Error('Missing state parameter');
      const stateDecoded = Buffer.from(state, 'base64').toString('utf-8');
      const statePayload = JSON.parse(stateDecoded);
      userId = statePayload.userId;

      if (statePayload.origin) {
        baseUrl = statePayload.origin;
      }

      if (!userId) throw new Error('User ID not found in state');

      console.log('[LinkedInCallback] Extracted userId:', userId);
    } catch (stateError: any) {
      console.error('[LinkedInCallback] Failed to extract user ID from state:', stateError.message);
      return NextResponse.redirect(
        `${baseUrl}/linkedin-callback?error=${encodeURIComponent('Invalid session state - please try reconnecting')}`
      );
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = process.env.NEXT_PUBLIC_LINKEDIN_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('[LinkedInCallback] Missing LinkedIn credentials');
      return NextResponse.redirect(
        `${baseUrl}/linkedin-callback?error=${encodeURIComponent('LinkedIn credentials not configured')}`
      );
    }

    // Exchange code for access_token
    console.log('[LinkedInCallback] Exchanging code for tokens...');
    const tokenData = await exchangeLinkedInCode(code, clientId, clientSecret, redirectUri);

    console.log('[LinkedInCallback] Tokens received, expires_in:', tokenData.expires_in);

    // Get user info
    console.log('[LinkedInCallback] Fetching user info...');
    const userInfo = await getLinkedInUserInfo(tokenData.access_token);

    console.log('[LinkedInCallback] User info:', { sub: userInfo.sub, name: userInfo.name });

    // Save to database
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.redirect(
        `${baseUrl}/linkedin-callback?error=${encodeURIComponent('Database configuration error')}`
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const tokenExpiry = new Date();
    tokenExpiry.setSeconds(tokenExpiry.getSeconds() + tokenData.expires_in);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        linkedin_user_id: userInfo.sub,
        linkedin_username: userInfo.name,
        linkedin_access_token: tokenData.access_token,
        linkedin_token_expiry: tokenExpiry.toISOString(),
        linkedin_connected_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[LinkedInCallback] Database error:', updateError);
      return NextResponse.redirect(
        `${baseUrl}/linkedin-callback?error=${encodeURIComponent(`Database error: ${updateError.message}`)}`
      );
    }

    console.log('[LinkedInCallback] Profile updated successfully');

    return NextResponse.redirect(
      `${baseUrl}/linkedin-callback?success=true&username=${encodeURIComponent(userInfo.name)}`
    );

  } catch (error: any) {
    console.error('[LinkedInCallback] FATAL ERROR:', error);

    const errorMsg = error.message
      ? `Error: ${error.message}`
      : 'Connection failed - check logs for details';

    return NextResponse.redirect(
      `${baseUrl || 'https://keiroai.com'}/linkedin-callback?error=${encodeURIComponent(errorMsg)}`
    );
  }
}
