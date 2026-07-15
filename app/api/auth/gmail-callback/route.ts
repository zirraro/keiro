import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeGmailCode } from '@/lib/gmail-oauth';

export const runtime = 'nodejs';

// Base des redirections : JAMAIS req.url (derrière nginx il vaut localhost:3000
// → ERR_CONNECTION_REFUSED). On force le domaine de prod.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.keiroai.com';

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
    return NextResponse.redirect(new URL('/assistant/agent/email?error=gmail_denied', SITE_URL));
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
    return NextResponse.redirect(new URL('/assistant/agent/email?error=invalid_state', SITE_URL));
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

    // Email via l'endpoint USERINFO (scope userinfo.email) — PAS via l'API Gmail
    // getProfile qui exige un scope de LECTURE (gmail.readonly), qu'on n'a plus
    // en option A (gmail.send seul). getProfile échouait → "Failed to get Gmail
    // profile" + connexion impossible.
    let email = '';
    try {
      const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (uiRes.ok) { const ui = await uiRes.json(); email = ui.email || ''; }
    } catch { /* best-effort */ }
    const profile = { email };

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
      return NextResponse.redirect(new URL('/assistant/agent/email?error=no_user', SITE_URL));
    }

    console.log(`[Gmail Callback] Saving Gmail tokens for userId=${userId}, email=${profile.email}, hasRefresh=${!!tokens.refresh_token}`);

    // Tokens chiffrés au repos (CASA).
    const { encryptToken } = await import('@/lib/token-crypto');
    // Build update — NEVER overwrite existing refresh_token with null
    const updateData: Record<string, any> = {
      gmail_access_token: encryptToken(tokens.access_token),
      gmail_email: profile.email,
      gmail_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    };
    // Only set refresh_token if Google actually returned one
    if (tokens.refresh_token) {
      updateData.gmail_refresh_token = encryptToken(tokens.refresh_token);
    } else {
      // If no refresh_token returned, check if user already has one stored
      const { data: existing } = await supabase.from('profiles').select('gmail_refresh_token').eq('id', userId).single();
      if (!existing?.gmail_refresh_token) {
        console.warn('[Gmail Callback] No refresh_token from Google and none in DB — user may need to revoke and re-authorize');
      }
    }

    const { error: updateError } = await supabase.from('profiles').update(updateData).eq('id', userId);

    if (updateError) {
      console.error('[Gmail Callback] Update error:', updateError);
    }

    console.log(`[Gmail Callback] Connected ${profile.email} for user ${userId}`);

    // Redirect back to agent page with success flag
    const returnUrl = new URL(returnTo, SITE_URL);
    returnUrl.searchParams.set('just_connected', 'gmail');
    return NextResponse.redirect(returnUrl);
  } catch (e: any) {
    console.error('[Gmail Callback] Error:', e.message);
    return NextResponse.redirect(new URL(`/assistant/agent/email?error=gmail_failed&msg=${encodeURIComponent(e.message)}`, SITE_URL));
  }
}
