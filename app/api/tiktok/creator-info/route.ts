import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getCreatorInfo, refreshTikTokToken } from '@/lib/tiktok';

export const runtime = 'edge';

/**
 * GET /api/tiktok/creator-info
 * Fetch TikTok creator info (privacy options, interaction settings, posting limits)
 * Required by TikTok Content Sharing Guidelines before every publish
 */
export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: profile } = await supabase
      .from('profiles')
      .select('tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, tiktok_username, tiktok_display_name')
      .eq('id', user.id)
      .single();

    if (!profile?.tiktok_access_token) {
      return NextResponse.json({ ok: false, error: 'TikTok not connected' }, { status: 400 });
    }

    // Refresh token if needed
    let accessToken = profile.tiktok_access_token;
    const tokenExpiry = new Date(profile.tiktok_token_expiry);
    if (tokenExpiry <= new Date()) {
      const refreshed = await refreshTikTokToken(
        profile.tiktok_refresh_token,
        process.env.TIKTOK_CLIENT_KEY!
      );
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + refreshed.expires_in);
      await supabase.from('profiles').update({
        tiktok_access_token: refreshed.access_token,
        tiktok_refresh_token: refreshed.refresh_token,
        tiktok_token_expiry: newExpiry.toISOString(),
      }).eq('id', user.id);
      accessToken = refreshed.access_token;
    }

    const creatorInfo = await getCreatorInfo(accessToken);

    return NextResponse.json({
      ok: true,
      creator: {
        username: profile.tiktok_username,
        display_name: profile.tiktok_display_name,
        can_post: creatorInfo.can_post,
        max_video_post_duration_sec: creatorInfo.max_video_post_duration_sec,
        privacy_level_options: creatorInfo.privacy_level_options,
        comment_disabled: creatorInfo.comment_disabled,
        duet_disabled: creatorInfo.duet_disabled,
        stitch_disabled: creatorInfo.stitch_disabled,
      }
    });
  } catch (error: any) {
    console.error('[CreatorInfo] Error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
