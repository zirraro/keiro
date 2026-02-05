import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';

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

    // Permissions Instagram Business pour publier sur Instagram
    const scopes = [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'instagram_manage_insights',
      'business_management',
    ].join(',');

    // Encode user_id in state parameter to maintain context during OAuth redirect
    const statePayload = {
      userId: user.id,
      timestamp: Date.now()
    };
    const stateEncoded = Buffer.from(JSON.stringify(statePayload)).toString('base64');

    // URL d'autorisation Meta/Facebook
    const authUrl = new URL('https://www.facebook.com/v20.0/dialog/oauth');
    authUrl.searchParams.set('client_id', metaAppId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', stateEncoded); // Pass user_id in state

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
