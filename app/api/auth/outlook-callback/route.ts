import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeOutlookCode, getOutlookProfile } from '@/lib/outlook-oauth';

export const runtime = 'nodejs';

/**
 * GET /api/auth/outlook-callback
 * Microsoft identity platform redirects here after consent with a code.
 * We swap the code for tokens, fetch the user's primary email, and
 * store everything on profiles.* — mirrors the Gmail callback.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const stateRaw = req.nextUrl.searchParams.get('state');
  const errorParam = req.nextUrl.searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(new URL(`/assistant/agent/email?outlook_error=${encodeURIComponent(errorParam)}`, req.url));
  }
  if (!code || !stateRaw) {
    return NextResponse.redirect(new URL('/assistant/agent/email?outlook_error=missing_code', req.url));
  }

  let state: { userId: string; returnTo?: string; redirectUri: string };
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
  } catch {
    return NextResponse.redirect(new URL('/assistant/agent/email?outlook_error=bad_state', req.url));
  }

  try {
    const tokens = await exchangeOutlookCode(code, state.redirectUri);
    const profile = await getOutlookProfile(tokens.access_token);

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3500) * 1000).toISOString();

    await supabase.from('profiles').update({
      outlook_refresh_token: tokens.refresh_token,
      outlook_access_token: tokens.access_token,
      outlook_token_expires_at: expiresAt,
      outlook_email: profile.email,
    }).eq('id', state.userId);

    return NextResponse.redirect(new URL(`${state.returnTo || '/assistant/agent/email'}?outlook_connected=1`, req.url));
  } catch (e: any) {
    const msg = encodeURIComponent(String(e?.message || 'unknown').substring(0, 120));
    return NextResponse.redirect(new URL(`/assistant/agent/email?outlook_error=${msg}`, req.url));
  }
}
