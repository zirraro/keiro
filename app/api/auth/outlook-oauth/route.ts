import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { getOutlookOAuthUrl } from '@/lib/outlook-oauth';

export const runtime = 'nodejs';

/**
 * GET /api/auth/outlook-oauth
 * Initiates the Outlook / Microsoft 365 OAuth flow. Redirects the user
 * to the Microsoft consent screen; Microsoft will bounce back to
 * /api/auth/outlook-callback with an auth code.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.redirect(new URL('/login', req.url));

  const redirectUri = 'https://keiroai.com/api/auth/outlook-callback';
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/assistant/agent/email';
  const state = Buffer.from(JSON.stringify({ userId: user.id, returnTo, redirectUri })).toString('base64url');

  return NextResponse.redirect(getOutlookOAuthUrl(redirectUri, state));
}
