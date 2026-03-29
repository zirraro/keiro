import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'edge';

/**
 * GET /api/auth/google-oauth
 * Initiate Google OAuth flow for Google Business Profile (reviews management).
 */
export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
      return NextResponse.redirect(`${baseUrl}/login?error=${encodeURIComponent('Connexion requise')}`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`}/api/auth/google-callback`;

    if (!clientId) {
      return NextResponse.json({ error: 'Google Client ID manquant' }, { status: 500 });
    }

    const state = Buffer.from(JSON.stringify({
      userId: user.id,
      origin: `${req.nextUrl.protocol}//${req.nextUrl.host}`,
      timestamp: Date.now(),
    })).toString('base64');

    const scopes = [
      'https://www.googleapis.com/auth/business.manage',
    ].join(' ');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    return NextResponse.redirect(authUrl.toString());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
