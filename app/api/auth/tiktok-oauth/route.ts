import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';

/**
 * GET /api/auth/tiktok-oauth
 * Initiate TikTok OAuth flow
 */
export async function GET(req: NextRequest) {
  try {
    // Get authenticated user BEFORE redirecting to TikTok
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      // Redirect to login page if user not authenticated
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent('Vous devez être connecté pour lier votre compte TikTok')}`
      );
    }

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI;

    if (!clientKey || !redirectUri) {
      return NextResponse.json(
        { error: 'TikTok credentials not configured' },
        { status: 500 }
      );
    }

    // Required scopes for TikTok integration
    // Note: video.* scopes require Content Posting API to be enabled
    const scopes = [
      'user.info.basic',      // Get user info (username, avatar)
      'video.list',           // List published videos
      'video.publish',        // Publish videos
      'video.upload',         // Upload video files
    ].join(',');

    // TEMPORARY: If Content Posting API not yet approved, use only:
    // const scopes = 'user.info.basic';

    // Capture the origin domain so the callback redirects to the correct domain
    const origin = `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    // Encode user_id + origin in state parameter to maintain context during OAuth redirect
    const statePayload = {
      userId: user.id,
      origin,
      timestamp: Date.now()
    };
    const stateEncoded = Buffer.from(JSON.stringify(statePayload)).toString('base64');

    // Build TikTok authorization URL
    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.set('client_key', clientKey);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', stateEncoded); // Pass user_id in state

    console.log('[TikTokOAuth] Redirecting to TikTok authorization for user:', user.id);

    return NextResponse.redirect(authUrl.toString());

  } catch (error: any) {
    console.error('[TikTokOAuth] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate TikTok OAuth' },
      { status: 500 }
    );
  }
}
