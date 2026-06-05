import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'edge';

/**
 * GET /api/auth/tiktok-oauth
 * Initiate TikTok OAuth flow
 */
export async function GET(req: NextRequest) {
  try {
    // Get authenticated user BEFORE redirecting to TikTok
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      // Redirect to login page if user not authenticated
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent('Vous devez être connecté pour lier votre compte TikTok')}`
      );
    }

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI;

    if (!clientKey || !redirectUri) {
      return NextResponse.json(
        { error: 'TikTok credentials not configured' },
        { status: 500 }
      );
    }

    // Required scopes for TikTok integration
    // Note: video.* scopes require Content Posting API to be enabled
    // ⚠️ TikTok auto-rejects /oauth/authorize with `scope` error if any
    // requested scope isn't granted to this app. video.publish + video.upload
    // require Content Posting API approval — which is exactly what we're
    // currently waiting for. Until granted, request only the truly basic
    // scopes that every dev app gets by default.
    //
    // After Content Posting API review passes, re-enable the publish scopes
    // here and have users re-authorize.
    // 2026-06-05 — user.info.basic gives only open_id+display_name. To
    // read real follower_count / video_count / likes_count we MUST also
    // request user.info.profile + user.info.stats. Without them the
    // /v2/user/info/?fields=follower_count... call returns nulls and
    // Lena/Ami show 0 everywhere — which is what the founder caught
    // ("data tiktok pas bonnes").
    const TIKTOK_PUBLISH_APPROVED = process.env.TIKTOK_PUBLISH_APPROVED === '1';
    const baseScopes = ['user.info.basic', 'user.info.profile', 'user.info.stats'];
    const scopes = TIKTOK_PUBLISH_APPROVED
      ? [...baseScopes, 'video.list', 'video.publish', 'video.upload'].join(',')
      : baseScopes.join(',');

    // TEMPORARY: If Content Posting API not yet approved, use only:
    // const scopes = 'user.info.basic';

    // Capture the origin domain so the callback redirects to the correct domain.
    // Behind nginx, req.nextUrl.host is 'localhost:3000' (the upstream port),
    // not the public host. Prefer NEXT_PUBLIC_SITE_URL → X-Forwarded-Host
    // header → finally fall back to req.nextUrl.host as a last resort.
    const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const fwdProto = req.headers.get('x-forwarded-proto') || 'https';
    const origin = process.env.NEXT_PUBLIC_SITE_URL
      || (fwdHost ? `${fwdProto}://${fwdHost}` : `${req.nextUrl.protocol}//${req.nextUrl.host}`);

    // 2026-06-05 — Founder ask: "j'ai connecte tiktok via lena je dois
    // revenir sur lena dans tiktok apres la connexion". On capture
    // l'URL referer (ou un ?return_to= explicite) pour rediriger
    // l'user là où il a cliqué le bouton "Connect TikTok" plutôt que
    // vers la page tiktok-callback générique.
    const refererHdr = req.headers.get('referer') || '';
    const explicitReturn = req.nextUrl.searchParams.get('return_to') || '';
    let returnTo = explicitReturn || refererHdr;
    // Whitelist: only accept paths from our own domain to avoid open redirect.
    if (returnTo && !returnTo.startsWith(origin) && !returnTo.startsWith('/')) {
      returnTo = '';
    }
    // Default fallback: agent Lena TikTok tab
    if (!returnTo) returnTo = '/assistant/agent/content?network=tiktok';

    // Encode user_id + origin + returnTo in state parameter
    const statePayload = {
      userId: user.id,
      origin,
      returnTo,
      timestamp: Date.now()
    };
    const stateEncoded = Buffer.from(JSON.stringify(statePayload)).toString('base64');

    // Build TikTok authorization URL
    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.set('client_key', clientKey);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', stateEncoded); // Pass user_id in state

    console.log('[TikTokOAuth] Redirecting to TikTok authorization for user:', user.id);

    return NextResponse.redirect(authUrl.toString());

  } catch (error: any) {
    console.error('[TikTokOAuth] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate TikTok OAuth' },
      { status: 500 }
    );
  }
}
