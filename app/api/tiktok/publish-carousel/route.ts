import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { initTikTokPhotoUpload, refreshTikTokToken } from '@/lib/tiktok';

/**
 * POST /api/tiktok/publish-carousel
 * Publish multiple images as carousel (photo post) to TikTok
 * Max 35 images
 */
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { imageUrls, caption, hashtags } = await req.json();

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Au moins une image est requise' },
        { status: 400 }
      );
    }

    if (imageUrls.length > 35) {
      return NextResponse.json(
        { ok: false, error: 'Maximum 35 images pour un carrousel TikTok' },
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
      console.log('[TikTokCarousel] Token expired, refreshing...');

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
      console.log('[TikTokCarousel] Token refreshed');
    }

    console.log('[TikTokCarousel] Publishing carousel with', imageUrls.length, 'images');

    // Format caption with hashtags
    const title = caption || 'Nouveau carrousel';
    const finalCaption = caption
      ? caption + '\n\n' + (hashtags || []).map((tag: string) => (tag.startsWith('#') ? tag : '#' + tag)).join(' ')
      : (hashtags || []).map((tag: string) => (tag.startsWith('#') ? tag : '#' + tag)).join(' ');

    // Initialize TikTok photo post (carousel)
    const uploadResult = await initTikTokPhotoUpload(
      accessToken,
      imageUrls,
      title,
      finalCaption
    );

    console.log('[TikTokCarousel] Carousel published:', {
      publish_id: uploadResult.publish_id
    });

    // Save to tiktok_posts table
    const { error: insertError } = await supabase
      .from('tiktok_posts')
      .insert({
        id: uploadResult.publish_id,
        user_id: user.id,
        video_description: finalCaption,
        posted_at: new Date().toISOString(),
        cached_thumbnail_url: imageUrls[0], // First image as thumbnail
        synced_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('[TikTokCarousel] Warning: Failed to save to database:', insertError);
      // Don't fail the request, post was still published
    }

    console.log('[TikTokCarousel] Carousel published successfully');

    return NextResponse.json({
      ok: true,
      post: {
        id: uploadResult.publish_id,
        caption: finalCaption,
        imageCount: imageUrls.length,
        posted_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('[TikTokCarousel] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la publication du carrousel' },
      { status: 500 }
    );
  }
}
