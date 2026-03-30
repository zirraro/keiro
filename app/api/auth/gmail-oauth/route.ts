import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { getGmailOAuthUrl } from '@/lib/gmail-oauth';

export const runtime = 'nodejs';

/**
 * GET /api/auth/gmail-oauth
 * Redirects client to Google consent screen for Gmail send access.
 * After consent, Google redirects to /api/auth/gmail-callback.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Use request host to build redirect_uri — matches what Google sees
  const host = req.headers.get('host') || 'www.keiroai.com';
  const redirectUri = `https://${host}/api/auth/gmail-callback`;
  console.log('[Gmail OAuth] redirect_uri:', redirectUri);

  // State carries user_id + return URL
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/assistant/agent/email';
  const state = JSON.stringify({ userId: user.id, returnTo });
  const stateB64 = Buffer.from(state).toString('base64url');

  const oauthUrl = getGmailOAuthUrl(redirectUri, stateB64);
  return NextResponse.redirect(oauthUrl);
}
