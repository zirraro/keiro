import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * POST /api/tiktok/disconnect
 *
 * Full TikTok disconnect: revokes the stored access token at TikTok
 * (POST /v2/oauth/revoke/) THEN clears the local profile columns.
 *
 * The revoke step is what makes the next "Connect TikTok" show the
 * full OAuth consent screen with every requested scope visible —
 * exactly what TikTok App Review wants in the screencast. Previously
 * we only nulled the local tokens, which left TikTok thinking the
 * user was still authorised and skipped the consent dialog on the
 * next /auth/authorize call.
 */
export async function POST() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ ok: false, error: 'Configuration base de données manquante' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read the access token first so we can revoke it at TikTok before
    // clearing it locally.
    const { data: profile } = await supabase
      .from('profiles')
      .select('tiktok_access_token')
      .eq('id', user.id)
      .maybeSingle();
    const accessToken = profile?.tiktok_access_token;

    // Server-side revoke at TikTok. Best-effort: if it fails (token already
    // expired, network blip, etc.) we still clear the local copy below.
    let revokedAtTikTok = false;
    if (accessToken) {
      try {
        const r = await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: process.env.TIKTOK_CLIENT_KEY || '',
            client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
            token: accessToken,
          }).toString(),
          signal: AbortSignal.timeout(8000),
        });
        revokedAtTikTok = r.ok;
      } catch (e: any) {
        console.warn('[TikTokDisconnect] revoke endpoint failed:', e?.message);
      }
    }

    // Clear local copy regardless of revoke success.
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        tiktok_user_id: null,
        tiktok_open_id: null,
        tiktok_username: null,
        tiktok_display_name: null,
        tiktok_avatar_url: null,
        tiktok_access_token: null,
        tiktok_refresh_token: null,
        tiktok_token_expiry: null,
        tiktok_connected_at: null,
      })
      .eq('id', user.id);
    if (updateError) {
      console.error('[TikTokDisconnect] Error:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // Audit log so /meta-audit shows the revoke + the next reconnect.
    try {
      await supabase.from('agent_logs').insert({
        agent: 'tiktok',
        action: 'oauth_revoke',
        user_id: user.id,
        status: 'success',
        data: { revoked_at_tiktok: revokedAtTikTok, method: 'disconnect_button' },
      });
    } catch { /* non-fatal */ }

    console.log('[TikTokDisconnect] TikTok disconnected + revoked for user:', user.id, 'revoked:', revokedAtTikTok);
    return NextResponse.json({ ok: true, revoked_at_tiktok: revokedAtTikTok });
  } catch (error: any) {
    console.error('[TikTokDisconnect] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
