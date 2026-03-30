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
  try {
    const state = JSON.parse(Buffer.from(stateB64 || '', 'base64url').toString());
    userId = state.userId;
    returnTo = state.returnTo || returnTo;
  } catch {
    return NextResponse.redirect(new URL('/assistant/agent/email?error=invalid_state', req.url));
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`}/api/auth/gmail-callback`;
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
    await supabase.from('profiles').update({
      gmail_refresh_token: tokens.refresh_token || null,
      gmail_access_token: tokens.access_token,
      gmail_email: profile.email,
      gmail_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    }).eq('id', userId);

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
