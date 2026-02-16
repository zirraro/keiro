import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';

/**
 * GET /api/auth/linkedin-oauth
 * Initiate LinkedIn OAuth flow
 */
export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent('Vous devez être connecté pour lier votre compte LinkedIn')}`
      );
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_LINKEDIN_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: 'LinkedIn credentials not configured' },
        { status: 500 }
      );
    }

    const scopes = 'openid profile email w_member_social';

    const origin = `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    const statePayload = {
      userId: user.id,
      origin,
      timestamp: Date.now()
    };
    const stateEncoded = Buffer.from(JSON.stringify(statePayload)).toString('base64');

    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', stateEncoded);
    authUrl.searchParams.set('scope', scopes);

    console.log('[LinkedInOAuth] Redirecting to LinkedIn authorization for user:', user.id);

    return NextResponse.redirect(authUrl.toString());

  } catch (error: any) {
    console.error('[LinkedInOAuth] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate LinkedIn OAuth' },
      { status: 500 }
    );
  }
}
