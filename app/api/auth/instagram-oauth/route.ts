import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'edge';

/**
 * GET /api/auth/instagram-oauth
 * Initie le flux OAuth Instagram/Meta en redirigeant vers Meta
 * Version: 1.1 - With user authentication check
 */
export async function GET(req: NextRequest) {
  try {
    // Get authenticated user BEFORE redirecting to Meta
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      // Redirect to login page if user not authenticated
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent('Vous devez être connecté pour lier votre compte Instagram')}`
      );
    }

    const metaAppId = process.env.META_APP_ID;
    const redirectUri = process.env.NEXT_PUBLIC_META_REDIRECT_URI;

    if (!metaAppId || !redirectUri) {
      console.error('[InstagramOAuth] Missing META_APP_ID or NEXT_PUBLIC_META_REDIRECT_URI');
      return NextResponse.json(
        { ok: false, error: 'Configuration Meta manquante' },
        { status: 500 }
      );
    }

    console.log('[InstagramOAuth] Authenticated user:', user.id);

    // Permissions Instagram Business
    // instagram_manage_messages + pages_messaging: needed for DM conversations
    // These work in dev mode for app admins/testers even before Meta approval
    // pages_messaging is NOT a valid scope for Instagram — removed
    // instagram_manage_messages works for IG DMs with IGAA tokens
    const scopes = [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_messages',
      'pages_show_list',
      'pages_read_engagement',
      'instagram_manage_insights',
      'instagram_manage_comments',
      'business_management',
    ].join(',');

    // Capture the origin domain so the callback redirects to the correct domain
    const origin = `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    // Capture return path from referer header
    const referer = req.headers.get('referer') || '';
    const returnTo = referer.includes('/assistant/agent/') ? new URL(referer).pathname : '/assistant';

    // Encode user_id + origin + returnTo in state parameter
    const statePayload = {
      userId: user.id,
      origin,
      returnTo,
      timestamp: Date.now()
    };
    const stateEncoded = Buffer.from(JSON.stringify(statePayload)).toString('base64');

    const reauth = req.nextUrl.searchParams.get('reauth');
    // ?login=facebook forces the legacy Facebook Login for Business path
    // (used only for debugging / accounts that still rely on a Page token).
    const forceFacebook = req.nextUrl.searchParams.get('login') === 'facebook';

    // === Instagram API with Instagram Login (Business Login for Instagram) ===
    // This is the product our App Review targets (instagram_business_*).
    // The client signs in with their INSTAGRAM professional account directly
    // on instagram.com — NO Facebook account or Facebook Page required. This
    // is what the reviewer expects to see for the instagram_business_*
    // permissions; the old facebook.com flow caused the "screencast fails to
    // demonstrate the end-to-end experience of the use case" rejections.
    const igAppId = process.env.INSTAGRAM_APP_ID;
    const igRedirectUri = process.env.INSTAGRAM_REDIRECT_URI || redirectUri;

    let authUrl: URL;

    if (igAppId && !forceFacebook) {
      authUrl = new URL('https://www.instagram.com/oauth/authorize');
      authUrl.searchParams.set('client_id', igAppId);
      authUrl.searchParams.set('redirect_uri', igRedirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', [
        'instagram_business_basic',
        'instagram_business_content_publish',
        'instagram_business_manage_comments',
        'instagram_business_manage_messages',
        'instagram_business_manage_insights',
      ].join(','));
      authUrl.searchParams.set('state', stateEncoded);
      // force_reauth=true makes Instagram re-ask for credentials AND re-show
      // the full permission screen on every connect — so an App Review
      // reviewer (or any fresh/private session) always sees the complete
      // login + grant flow, every step. Opt out with ?reauth=never.
      if (reauth !== 'never') {
        authUrl.searchParams.set('force_reauth', 'true');
      }
      console.log('[InstagramOAuth] Using Instagram Login (instagram.com) flow');
    } else {
      // === Legacy: Instagram API with Facebook Login for Business ===
      // Requires the client's IG account to be linked to a Facebook Page.
      // Kept as fallback until INSTAGRAM_APP_ID is configured in the env.
      authUrl = new URL('https://www.facebook.com/v20.0/dialog/oauth');
      authUrl.searchParams.set('client_id', metaAppId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', scopes);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', stateEncoded);
      // ?reauth=1 → rerequest (declined perms only); ?reauth=full →
      // reauthenticate (forces FB password + full permissions screen).
      if (reauth === 'full') {
        authUrl.searchParams.set('auth_type', 'reauthenticate');
        authUrl.searchParams.set('auth_nonce', Date.now().toString(36));
      } else if (reauth === '1') {
        authUrl.searchParams.set('auth_type', 'rerequest');
      }
      console.log('[InstagramOAuth] Using legacy Facebook Login flow (INSTAGRAM_APP_ID not set)');
    }

    console.log('[InstagramOAuth] Redirecting to Meta OAuth:', authUrl.toString().substring(0, 100));

    // Rediriger vers Meta OAuth
    return NextResponse.redirect(authUrl.toString());

  } catch (error: any) {
    console.error('[InstagramOAuth] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de l\'initialisation OAuth' },
      { status: 500 }
    );
  }
}

/**
 * Génère un state aléatoire pour la sécurité CSRF
 */
function generateRandomState(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}
