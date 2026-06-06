import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { initTikTokPhotoUpload, refreshTikTokToken } from '@/lib/tiktok';

export const runtime = 'edge';

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

    const { imageUrls, caption, hashtags, privacy_level, disable_comment } = await req.json();

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
      const clientSecret = process.env.TIKTOK_CLIENT_SECRET!;
      const refreshedTokens = await refreshTikTokToken(
        profile.tiktok_refresh_token,
        clientKey,
        clientSecret,
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

    // Initialize TikTok photo post (carousel) — forward per-post
    // settings from the Review modal (privacy + disable_comment).
    const uploadResult = await initTikTokPhotoUpload(
      accessToken,
      imageUrls,
      title,
      finalCaption,
      { privacyLevel: privacy_level, disableComment: !!disable_comment },
    );

    console.log('[TikTokCarousel] Carousel published:', {
      publish_id: uploadResult.publish_id,
      is_draft: uploadResult.is_draft,
    });

    // 2026-06-03 — Only mark posted_at when the post is actually LIVE.
    // If it landed in the user's TikTok inbox as a draft (MEDIA_UPLOAD
    // fallback), posted_at stays null so the analytics widget knows it
    // isn't published yet. Founder reported "ca arrive jamais sur tiktok"
    // because we were claiming success on draft submissions.
    const { error: insertError } = await supabase
      .from('tiktok_posts')
      .insert({
        id: uploadResult.publish_id,
        user_id: user.id,
        video_description: finalCaption,
        posted_at: uploadResult.is_draft ? null : new Date().toISOString(),
        cached_thumbnail_url: imageUrls[0],
        synced_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[TikTokCarousel] Warning: Failed to save to database:', insertError);
    }

    console.log('[TikTokCarousel] Carousel submitted', uploadResult.is_draft ? '(DRAFT — manual finalize required)' : '(LIVE)');

    return NextResponse.json({
      ok: true,
      is_draft: uploadResult.is_draft,
      message: uploadResult.is_draft
        ? 'Carrousel envoyé en boîte de réception TikTok — ouvre l\'app TikTok pour finaliser la publication.'
        : 'Carrousel publié en ligne sur TikTok.',
      post: {
        id: uploadResult.publish_id,
        caption: finalCaption,
        imageCount: imageUrls.length,
        posted_at: uploadResult.is_draft ? null : new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error('[TikTokCarousel] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la publication du carrousel' },
      { status: 500 }
    );
  }
}
