import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getTikTokVideos, refreshTikTokToken } from '@/lib/tiktok';

/**
 * POST /api/tiktok/sync-media
 * Sync published TikTok videos to database
 */
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's TikTok credentials
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.tiktok_access_token) {
      return NextResponse.json(
        { ok: false, error: 'Compte TikTok non connecté' },
        { status: 400 }
      );
    }

    // Check if token needs refresh
    let accessToken = profile.tiktok_access_token;
    const tokenExpiry = new Date(profile.tiktok_token_expiry);
    const now = new Date();

    if (tokenExpiry <= now) {
      console.log('[TikTokSync] Token expired, refreshing...');

      const clientKey = process.env.TIKTOK_CLIENT_KEY!;
      const refreshedTokens = await refreshTikTokToken(
        profile.tiktok_refresh_token,
        clientKey
      );

      // Update tokens in database
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + refreshedTokens.expires_in);

      await supabase
        .from('profiles')
        .update({
          tiktok_access_token: refreshedTokens.access_token,
          tiktok_refresh_token: refreshedTokens.refresh_token,
          tiktok_token_expiry: newExpiry.toISOString(),
        })
        .eq('id', user.id);

      accessToken = refreshedTokens.access_token;
      console.log('[TikTokSync] Token refreshed');
    }

    console.log('[TikTokSync] Fetching TikTok videos...');

    // Fetch videos from TikTok API (last 20)
    const videos = await getTikTokVideos(accessToken, 20);

    console.log('[TikTokSync] Fetched', videos.length, 'videos');

    // Upsert videos to database
    for (const video of videos) {
      const { error: upsertError } = await supabase
        .from('tiktok_posts')
        .upsert({
          id: video.id,
          user_id: user.id,
          video_description: video.video_description || video.title,
          duration: video.duration,
          cover_image_url: video.cover_image_url,
          permalink: video.share_url,
          posted_at: new Date(video.create_time * 1000).toISOString(),
          cached_video_url: video.cover_image_url, // Use cover as cached URL
          synced_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });

      if (upsertError) {
        console.error('[TikTokSync] Error upserting video:', video.id, upsertError);
      }
    }

    console.log('[TikTokSync] Synced', videos.length, 'videos to database');

    return NextResponse.json({
      ok: true,
      synced: videos.length
    });

  } catch (error: any) {
    console.error('[TikTokSync] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la synchronisation' },
      { status: 500 }
    );
  }
}
