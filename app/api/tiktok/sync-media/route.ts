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
    let videos;
    try {
      videos = await getTikTokVideos(accessToken, 20);
      console.log('[TikTokSync] Fetched', videos.length, 'videos');
    } catch (videoError: any) {
      console.error('[TikTokSync] TikTok API error:', videoError.message);

      // Enhanced scope/permission error detection
      const errorMsg = videoError.message.toLowerCase();
      const isScopeError =
        errorMsg.includes('scope_error') || // Our custom prefix
        errorMsg.includes('scope') ||
        errorMsg.includes('permission') ||
        errorMsg.includes('not authorized') ||
        errorMsg.includes('access_token_invalid') ||
        errorMsg.includes('insufficient') ||
        errorMsg.includes('video.list') || // Specific scope missing
        errorMsg.includes('forbidden') ||
        errorMsg.includes('unauthorized') ||
        errorMsg.includes('access denied');

      if (isScopeError) {
        console.error('[TikTokSync] Scope/permission error detected - user needs to reconnect');
        return NextResponse.json({
          ok: false,
          error: '⚠️ Permissions TikTok insuffisantes\n\nLe scope video.list n\'a pas été accordé ou a expiré.\n\nVeuillez RECONNECTER votre compte TikTok pour accorder toutes les autorisations nécessaires:\n• user.info.basic ✓\n• video.list ⚠️ (requis pour sync)\n• video.publish ✓\n• video.upload ✓',
          needsReconnect: true,
          requiredScopes: ['user.info.basic', 'video.list', 'video.publish', 'video.upload']
        }, { status: 403 });
      }

      // Other errors - provide more helpful message
      return NextResponse.json({
        ok: false,
        error: `❌ Erreur TikTok API: ${videoError.message}\n\nSi le problème persiste, essayez de reconnecter votre compte.`,
        originalError: videoError.message
      }, { status: 500 });
    }

    if (!videos || videos.length === 0) {
      console.log('[TikTokSync] No videos to sync');
      return NextResponse.json({
        ok: true,
        synced: 0,
        message: 'Aucune vidéo TikTok trouvée sur votre compte'
      });
    }

    // Upsert videos to database
    let successCount = 0;
    let errorCount = 0;
    const errors: any[] = [];

    for (const video of videos) {
      console.log('[TikTokSync] Processing video:', {
        id: video.id,
        title: video.video_description || video.title,
        create_time: video.create_time
      });

      const videoData = {
        id: video.id,
        user_id: user.id,
        video_description: video.video_description || video.title || '',
        duration: video.duration || 0,
        cover_image_url: video.cover_image_url || null,
        cached_thumbnail_url: video.cover_image_url || null,
        share_url: video.share_url || null,
        // Note: permalink column doesn't exist in production schema, using share_url instead
        view_count: video.view_count || 0,
        like_count: video.like_count || 0,
        comment_count: video.comment_count || 0,
        share_count: video.share_count || 0,
        cached_video_url: video.cover_image_url || null,
        posted_at: video.create_time ? new Date(video.create_time * 1000).toISOString() : new Date().toISOString(),
        synced_at: new Date().toISOString()
      };

      console.log('[TikTokSync] Upserting video data:', JSON.stringify(videoData, null, 2));

      const { error: upsertError } = await supabase
        .from('tiktok_posts')
        .upsert(videoData, {
          onConflict: 'id'
        });

      if (upsertError) {
        console.error('[TikTokSync] ❌ Error upserting video:', video.id);
        console.error('[TikTokSync] Error details:', JSON.stringify(upsertError, null, 2));
        errorCount++;
        errors.push({
          videoId: video.id,
          error: upsertError.message,
          details: upsertError
        });
      } else {
        console.log('[TikTokSync] ✅ Successfully upserted video:', video.id);
        successCount++;
      }
    }

    console.log('[TikTokSync] Sync summary:', {
      total: videos.length,
      success: successCount,
      errors: errorCount
    });

    if (errorCount > 0) {
      console.error('[TikTokSync] Errors occurred during sync:', errors);
    }

    console.log('[TikTokSync] Synced', successCount, 'out of', videos.length, 'videos to database');

    if (errorCount > 0) {
      return NextResponse.json({
        ok: false,
        error: `❌ Erreur lors de la synchronisation\n\n${successCount} vidéo(s) synchronisée(s)\n${errorCount} erreur(s)\n\nDétails: ${errors.map(e => e.error).join(', ')}`,
        synced: successCount,
        errors: errorCount,
        errorDetails: errors
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      synced: successCount
    });

  } catch (error: any) {
    console.error('[TikTokSync] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la synchronisation' },
      { status: 500 }
    );
  }
}
