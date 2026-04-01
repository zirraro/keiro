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

  // Use request host to match exactly what Google sees (www vs non-www)
  const host = req.headers.get('host') || new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com').host;
  const redirectUri = `https://${host}/api/auth/gmail-callback`;
  console.log('[Gmail OAuth] redirect_uri:', redirectUri, 'host:', host);

  // State carries user_id + return URL + redirect_uri (for callback to reuse exact same URI)
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/assistant/agent/email';
  const state = JSON.stringify({ userId: user.id, returnTo, redirectUri });
  const stateB64 = Buffer.from(state).toString('base64url');

  const oauthUrl = getGmailOAuthUrl(redirectUri, stateB64);
  return NextResponse.redirect(oauthUrl);
}
