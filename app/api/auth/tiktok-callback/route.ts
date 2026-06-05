import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeTikTokCode, getTikTokUserInfo } from '@/lib/tiktok';

export const runtime = 'edge';

/**
 * GET /api/auth/tiktok-callback
 * Handle TikTok OAuth callback
 */
export async function GET(req: NextRequest) {
  // Fallback base URL (will be overridden by state.origin when available)
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  try {
    const startTime = Date.now();
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Try to extract origin from state early (for error redirects too)
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        if (decoded.origin) {
          baseUrl = decoded.origin;
        }
      } catch {}
    }

    console.log('[TikTokCallback] Starting callback', {
      baseUrl,
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      timestamp: new Date().toISOString()
    });

    // Check for OAuth errors
    if (error) {
      console.error('[TikTokCallback] OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent(errorDescription || error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent('No authorization code received')}`
      );
    }

    // Extract user_id and origin from state parameter (passed during OAuth initiation)
    let userId: string;
    try {
      if (!state) {
        throw new Error('Missing state parameter');
      }
      const stateDecoded = Buffer.from(state, 'base64').toString('utf-8');
      const statePayload = JSON.parse(stateDecoded);
      userId = statePayload.userId;

      // Use origin from state to redirect back to the correct domain
      if (statePayload.origin) {
        baseUrl = statePayload.origin;
      }

      if (!userId) {
        throw new Error('User ID not found in state');
      }

      console.log('[TikTokCallback] Extracted from state - userId:', userId, 'origin:', baseUrl);
    } catch (stateError: any) {
      console.error('[TikTokCallback] Failed to extract user ID from state:', stateError.message);
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent('Invalid session state - please try reconnecting')}`
      );
    }

    // Get environment variables
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI;

    if (!clientKey || !clientSecret || !redirectUri) {
      console.error('[TikTokCallback] Missing TikTok credentials');
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent('TikTok credentials not configured')}`
      );
    }

    console.log('[TikTokCallback] ⏳ Step 1/5: Exchanging code for tokens...', {
      elapsedMs: Date.now() - startTime
    });

    // Exchange code for tokens
    const tokenData = await exchangeTikTokCode(code, clientKey, clientSecret, redirectUri);

    console.log('[TikTokCallback] ✅ Step 1/5 complete: Tokens received', {
      open_id: tokenData.open_id,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      elapsedMs: Date.now() - startTime
    });

    console.log('[TikTokCallback] ✅ Step 2/5 complete: User ID available from state', {
      userId: userId,
      elapsedMs: Date.now() - startTime
    });

    // Save tokens to database IMMEDIATELY (before fetching user info)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[TikTokCallback] Missing Supabase credentials');
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent('Database configuration error')}`
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate token expiry
    const tokenExpiry = new Date();
    tokenExpiry.setSeconds(tokenExpiry.getSeconds() + tokenData.expires_in);

    console.log('[TikTokCallback] ⏳ Step 3/5: Saving tokens to database (without username yet)...', {
      userId: userId,
      tiktokUserId: tokenData.open_id,
      elapsedMs: Date.now() - startTime
    });

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        tiktok_user_id: tokenData.open_id,
        tiktok_access_token: tokenData.access_token,
        tiktok_refresh_token: tokenData.refresh_token,
        tiktok_token_expiry: tokenExpiry.toISOString(),
        tiktok_connected_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[TikTokCallback] ❌ Step 3/5 failed: Database error', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        elapsedMs: Date.now() - startTime
      });
      return NextResponse.redirect(
        `${baseUrl}/tiktok-callback?error=${encodeURIComponent(`Database error: ${updateError.message}`)}`
      );
    }

    console.log('[TikTokCallback] ✅ Step 3/5 complete: Tokens saved to database', {
      elapsedMs: Date.now() - startTime
    });

    // Now try to get user info (this might fail, but tokens are already saved)
    console.log('[TikTokCallback] ⏳ Step 4/5: Fetching user info...', {
      elapsedMs: Date.now() - startTime
    });

    let displayName = 'TikTok User';
    let username = null;

    try {
      const userInfo = await getTikTokUserInfo(tokenData.access_token);
      displayName = userInfo.display_name || 'TikTok User';
      username = displayName; // TikTok API doesn't provide @handle, only display_name

      console.log('[TikTokCallback] ✅ Step 4/5 complete: User info received', {
        open_id: userInfo.open_id,
        display_name: userInfo.display_name,
        elapsedMs: Date.now() - startTime
      });

      // Update display name and username in database
      const { error: updateUsernameError } = await supabase
        .from('profiles')
        .update({
          tiktok_username: username,
          tiktok_display_name: displayName
        })
        .eq('id', userId);

      if (updateUsernameError) {
        console.error('[TikTokCallback] Error updating username:', updateUsernameError);
      } else {
        console.log('[TikTokCallback] ✅ Username saved:', username);
      }

    } catch (userInfoError: any) {
      console.error('[TikTokCallback] ⚠️ Step 4/5 warning: Could not fetch user info (but tokens are saved)', {
        error: userInfoError.message,
        errorString: String(userInfoError),
        stack: userInfoError.stack,
        hasScope: tokenData.scope?.includes('user.info.basic'),
        scopes: tokenData.scope,
        elapsedMs: Date.now() - startTime
      });

      // Use clean display name (don't show garbled hash to user)
      const cleanName = 'Compte TikTok';
      console.log('[TikTokCallback] Using clean fallback name (user info unavailable)');

      displayName = cleanName;
      username = cleanName;

      // Save clean username so user can see they're connected
      await supabase
        .from('profiles')
        .update({
          tiktok_username: cleanName,
          tiktok_display_name: cleanName
        })
        .eq('id', userId);
    }

    // 2026-06-05 — Founder ask: "une fois connecte a tiktok peu importe
    // ou sur keiroai tout les autres endroits le detecte comme AMI et
    // lena et partout on s'est necessaire alors ca voit la connexion
    // et actionnent leur taches en consequences".
    // Concrètement: les tokens sont déjà persistés (profile.tiktok_*).
    // Chaque agent qui lit profile voit donc la connexion. Mais le
    // toggle tt_enabled dans org_agent_configs.config peut être OFF
    // depuis une déco précédente — on le flip ON ici pour que Lena/
    // Ami/Jade actionnent tout de suite leurs tâches TikTok sans
    // que le client ait à re-cocher dans le panel.
    try {
      const { data: existingCfg } = await supabase
        .from('org_agent_configs')
        .select('id, config')
        .eq('user_id', userId)
        .eq('agent_id', 'content')
        .maybeSingle();
      if (existingCfg) {
        const cfg = existingCfg.config || {};
        cfg.tt_enabled = true;
        cfg.auto_mode_tiktok = true;
        if (!cfg.posts_per_day_tt) cfg.posts_per_day_tt = 1;
        await supabase
          .from('org_agent_configs')
          .update({ config: cfg, updated_at: new Date().toISOString() })
          .eq('id', existingCfg.id);
        console.log(`[TikTokCallback] ✅ Auto-activated Lena TikTok for ${userId}`);
      }
      // Notify Jade DM agent too (auto-mode on TikTok if dm_instagram config exists)
      const { data: dmCfg } = await supabase
        .from('org_agent_configs')
        .select('id, config')
        .eq('user_id', userId)
        .eq('agent_id', 'dm_instagram')
        .maybeSingle();
      if (dmCfg) {
        const dc = dmCfg.config || {};
        dc.tiktok_connected = true;
        await supabase
          .from('org_agent_configs')
          .update({ config: dc, updated_at: new Date().toISOString() })
          .eq('id', dmCfg.id);
      }
      // Log a global event so any subscribed agent (Ami strategy,
      // CEO brief, etc.) can react on next run.
      await supabase.from('agent_logs').insert({
        agent: 'ops',
        action: 'tiktok_connected_event',
        status: 'success',
        user_id: userId,
        data: { broadcast: true, agents_notified: ['content', 'dm_instagram', 'ami'] },
        created_at: new Date().toISOString(),
      });
    } catch (cfgErr: any) {
      console.warn('[TikTokCallback] auto-activation failed (non-fatal):', cfgErr?.message);
    }

    // 2026-06-05 — Founder ask: "les publication qui ne sont pas passees
    // a l'heure des connexion on les lancent par contre". Quand l'user
    // reconnecte, relance les posts TikTok qui avaient été flaggés
    // 'tiktok_post_pending_reauth' dans les 7 derniers jours.
    let relaunched = 0;
    try {
      const { relaunchPendingPostsAfterReauth } = await import('@/lib/agents/tiktok-reauth-mailer');
      const r = await relaunchPendingPostsAfterReauth(supabase, userId);
      relaunched = r.relaunched;
      if (relaunched > 0) {
        console.log(`[TikTokCallback] ✅ Relaunched ${relaunched} pending TikTok posts after reauth`);
      }
    } catch (e: any) {
      console.warn('[TikTokCallback] relaunch failed (non-fatal):', e?.message);
    }

    console.log('[TikTokCallback] ⏳ Step 5/5: Redirecting to success page...', {
      username: displayName,
      relaunched,
      elapsedMs: Date.now() - startTime
    });

    // 2026-06-05 — Honor returnTo encoded in state param (founder
    // started OAuth from Lena's TikTok tab → comes back there).
    // Falls back to the generic /tiktok-callback success page if no
    // returnTo (e.g. legacy old-style state payloads).
    const relaunchedQs = relaunched > 0 ? `&tt_relaunched=${relaunched}` : '';
    let returnTo: string = '';
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      returnTo = decoded?.returnTo || '';
    } catch { returnTo = ''; }
    // Whitelist again on this side too (state could theoretically be tampered)
    if (returnTo && !returnTo.startsWith('/') && !returnTo.startsWith(baseUrl)) {
      returnTo = '';
    }
    const target = returnTo
      ? (returnTo.startsWith('http') ? returnTo : `${baseUrl}${returnTo}`)
      : `${baseUrl}/tiktok-callback`;
    const sep = target.includes('?') ? '&' : '?';
    const redirectUrl = `${target}${sep}tt_connected=1&username=${encodeURIComponent(displayName)}${relaunchedQs}`;
    console.log('[TikTokCallback] ✅ Step 5/5 complete: Success!', {
      redirectUrl,
      totalElapsedMs: Date.now() - startTime
    });

    return NextResponse.redirect(redirectUrl);

  } catch (error: any) {
    console.error('[TikTokCallback] ❌ FATAL ERROR:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause
    });

    // More detailed error message for debugging
    const errorMsg = error.message
      ? `Error: ${error.message}`
      : 'Connection failed - check Vercel logs for details';

    return NextResponse.redirect(
      `${baseUrl || 'https://keiroai.com'}/tiktok-callback?error=${encodeURIComponent(errorMsg)}`
    );
  }
}
