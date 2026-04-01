import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeGmailCode, getGmailProfile } from '@/lib/gmail-oauth';

export const runtime = 'nodejs';

/**
 * GET /api/auth/gmail-callback
 * Handles Google OAuth callback after Gmail consent.
 * Stores refresh_token + email in profiles, redirects back to agent page.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const stateB64 = req.nextUrl.searchParams.get('state');
  const errorParam = req.nextUrl.searchParams.get('error');

  if (errorParam || !code) {
    console.error('[Gmail Callback] Error:', errorParam);
    return NextResponse.redirect(new URL('/assistant/agent/email?error=gmail_denied', req.url));
  }

  // Decode state
  let userId = '';
  let returnTo = '/assistant/agent/email';
  let redirectUri = '';
  try {
    const state = JSON.parse(Buffer.from(stateB64 || '', 'base64url').toString());
    userId = state.userId;
    returnTo = state.returnTo || returnTo;
    redirectUri = state.redirectUri || ''; // Exact URI used during authorization
  } catch {
    return NextResponse.redirect(new URL('/assistant/agent/email?error=invalid_state', req.url));
  }

  // Use redirectUri from state (matches exactly what was sent to Google)
  // Fallback to request host if state doesn't have it
  if (!redirectUri) {
    const host = req.headers.get('host') || new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com').host;
    redirectUri = `https://${host}/api/auth/gmail-callback`;
  }
  console.log('[Gmail Callback] redirect_uri:', redirectUri, 'userId:', userId);

  try {
    // Exchange code for tokens
    const tokens = await exchangeGmailCode(code, redirectUri);

    if (!tokens.refresh_token) {
      console.error('[Gmail Callback] No refresh_token received — user may need to re-consent');
    }

    // Get user's email from Gmail profile
    const profile = await getGmailProfile(tokens.access_token);

    // Store in profiles table
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // If no userId from state, try to get from current session
    if (!userId) {
      try {
        const { getAuthUser: getAuth } = await import('@/lib/auth-server');
        const { user } = await getAuth();
        if (user) userId = user.id;
      } catch {}
    }

    if (!userId) {
      console.error('[Gmail Callback] No userId — cannot save tokens');
      return NextResponse.redirect(new URL('/assistant/agent/email?error=no_user', req.url));
    }

    console.log(`[Gmail Callback] Saving Gmail tokens for userId=${userId}, email=${profile.email}`);
    const { error: updateError } = await supabase.from('profiles').update({
      gmail_refresh_token: tokens.refresh_token || null,
      gmail_access_token: tokens.access_token,
      gmail_email: profile.email,
      gmail_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    }).eq('id', userId);

    if (updateError) {
      console.error('[Gmail Callback] Update error:', updateError);
    }

    console.log(`[Gmail Callback] Connected ${profile.email} for user ${userId}`);

    // Redirect back to agent page with success flag
    const returnUrl = new URL(returnTo, req.url);
    returnUrl.searchParams.set('just_connected', 'gmail');
    return NextResponse.redirect(returnUrl);
  } catch (e: any) {
    console.error('[Gmail Callback] Error:', e.message);
    return NextResponse.redirect(new URL(`/assistant/agent/email?error=gmail_failed&msg=${encodeURIComponent(e.message)}`, req.url));
  }
}
