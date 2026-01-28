import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import {
  initTikTokVideoUpload,
  uploadTikTokVideoBytes,
  publishTikTokVideo,
  refreshTikTokToken
} from '@/lib/tiktok';
import { convertImageToVideo, checkFfmpegAvailable } from '@/lib/video-converter';

/**
 * POST /api/library/tiktok/publish
 * Publish image/video to TikTok
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

    const { imageUrl, caption, hashtags } = await req.json();

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: 'URL de l\'image manquante' },
        { status: 400 }
      );
    }

    // Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's TikTok credentials
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, tiktok_username')
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
      console.log('[TikTokPublish] Token expired, refreshing...');

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
      console.log('[TikTokPublish] Token refreshed');
    }

    // Check FFmpeg availability
    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      return NextResponse.json(
        { ok: false, error: 'FFmpeg non disponible sur le serveur. Impossible de convertir les images en vidéos.' },
        { status: 500 }
      );
    }

    console.log('[TikTokPublish] Downloading image...');

    // Download image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download image');
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    console.log('[TikTokPublish] Converting image to video...');

    // Convert image to TikTok video (9:16, 5 seconds)
    const videoBuffer = await convertImageToVideo(imageBuffer, {
      width: 1080,
      height: 1920,
      duration: 5,
      fps: 30
    });

    console.log('[TikTokPublish] Video converted:', {
      size: (videoBuffer.length / 1024 / 1024).toFixed(2) + ' MB'
    });

    // Step 1: Initialize TikTok video upload
    console.log('[TikTokPublish] Initializing TikTok upload...');

    const uploadInit = await initTikTokVideoUpload(
      accessToken,
      videoBuffer.length,
      videoBuffer.length, // chunk_size = total size (single chunk)
      1 // total_chunk_count = 1
    );

    console.log('[TikTokPublish] Upload initialized:', {
      publish_id: uploadInit.publish_id
    });

    // Step 2: Upload video bytes
    console.log('[TikTokPublish] Uploading video bytes...');

    await uploadTikTokVideoBytes(uploadInit.upload_url, videoBuffer);

    console.log('[TikTokPublish] Video uploaded');

    // Step 3: Publish video
    console.log('[TikTokPublish] Publishing video...');

    const publishResult = await publishTikTokVideo(
      accessToken,
      uploadInit.publish_id
    );

    console.log('[TikTokPublish] Video published:', {
      publish_id: publishResult.publish_id
    });

    // Format caption with hashtags
    const finalCaption = caption
      ? caption + '\n\n' + (hashtags || []).map((tag: string) => '#' + tag).join(' ')
      : (hashtags || []).map((tag: string) => '#' + tag).join(' ');

    // Save to tiktok_posts table
    const { error: insertError } = await supabase
      .from('tiktok_posts')
      .insert({
        id: publishResult.publish_id,
        user_id: user.id,
        video_description: finalCaption,
        posted_at: new Date().toISOString(),
        cached_video_url: imageUrl, // Store original image URL
        synced_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('[TikTokPublish] Warning: Failed to save to database:', insertError);
      // Don't fail the request, post was still published
    }

    console.log('[TikTokPublish] Post published successfully');

    return NextResponse.json({
      ok: true,
      post: {
        id: publishResult.publish_id,
        caption: finalCaption,
        posted_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('[TikTokPublish] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la publication' },
      { status: 500 }
    );
  }
}
