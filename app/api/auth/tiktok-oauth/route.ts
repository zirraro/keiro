import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/tiktok-oauth
 * Initiate TikTok OAuth flow
 */
export async function GET(req: NextRequest) {
  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI;

    if (!clientKey || !redirectUri) {
      return NextResponse.json(
        { error: 'TikTok credentials not configured' },
        { status: 500 }
      );
    }

    // Required scopes for TikTok integration
    const scopes = [
      'user.info.basic',      // Get user info (username, avatar)
      'video.list',           // List published videos
      'video.publish',        // Publish videos
      'video.upload',         // Upload video files
    ].join(',');

    // Build TikTok authorization URL
    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.set('client_key', clientKey);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', 'tiktok_oauth'); // CSRF protection

    console.log('[TikTokOAuth] Redirecting to TikTok authorization...');

    return NextResponse.redirect(authUrl.toString());

  } catch (error: any) {
    console.error('[TikTokOAuth] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate TikTok OAuth' },
      { status: 500 }
    );
  }
}
