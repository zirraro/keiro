/**
 * POST /api/auth/tiktok-revoke
 *
 * Revokes the TikTok access token both server-side (via TikTok's
 * /oauth/revoke/ endpoint) and locally (clears tiktok_access_token +
 * tiktok_refresh_token on the user's profile). Then optionally
 * redirects the user straight into a fresh OAuth flow so the next
 * connection re-displays the full consent screen with all scopes.
 *
 * Used by:
 *   - The TikTok app review screencast workflow — TikTok caches
 *     consent for re-authorising users and skips the consent dialog
 *     if the same user already authorized once. Hitting this endpoint
 *     first guarantees the next /auth/authorize call shows the full
 *     scope grant screen the TikTok reviewer expects to see.
 *   - The /meta-review page (and the TikTok panel) — a one-click
 *     "Force fresh OAuth" button calls this then redirects to
 *     /api/auth/tiktok-oauth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('tiktok_access_token, tiktok_refresh_token')
    .eq('id', user.id)
    .maybeSingle();

  const accessToken = profile?.tiktok_access_token;

  // 1. Server-side revoke at TikTok if we have a token.
  // /v2/oauth/revoke/ accepts the access token in a form-encoded body.
  let revokedAtTikTok = false;
  if (accessToken) {
    try {
      const r = await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY || '',
          client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
          token: accessToken,
        }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      revokedAtTikTok = r.ok;
    } catch (e: any) {
      console.warn('[TikTokRevoke] revoke endpoint failed:', e?.message);
    }
  }

  // 2. Clear our local copy regardless of TikTok's response — the user
  //    can still re-authorise on the next click, and we don't want a
  //    stale token to leak through any subsequent request.
  await supabase
    .from('profiles')
    .update({
      tiktok_access_token: null,
      tiktok_refresh_token: null,
      tiktok_token_expiry: null,
      tiktok_username: null,
      tiktok_open_id: null,
      tiktok_avatar_url: null,
      tiktok_display_name: null,
    })
    .eq('id', user.id);

  // Audit log so /meta-audit (and the TikTok reviewer) can see we revoked.
  try {
    await supabase.from('agent_logs').insert({
      agent: 'tiktok',
      action: 'oauth_revoke',
      user_id: user.id,
      status: 'success',
      data: { revoked_at_tiktok: revokedAtTikTok },
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    revoked_at_tiktok: revokedAtTikTok,
    local_cleared: true,
    next: '/api/auth/tiktok-oauth',
  });
}
