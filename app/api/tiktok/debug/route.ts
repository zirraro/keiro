import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getTikTokVideos } from '@/lib/tiktok';

/**
 * GET /api/tiktok/debug
 * Debug endpoint to show TikTok connection status
 */
export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's TikTok credentials
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, tiktok_username, tiktok_display_name, tiktok_user_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({
        ok: false,
        error: 'Profil non trouvé',
        details: profileError
      });
    }

    // Test creator info to get scopes and permissions
    let creatorInfo: any = null;
    if (profile.tiktok_access_token) {
      try {
        const creatorResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${profile.tiktok_access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({})
        });

        const creatorData = await creatorResponse.json();
        creatorInfo = {
          status: creatorResponse.status,
          response: creatorData
        };
      } catch (err: any) {
        creatorInfo = {
          error: err.message
        };
      }
    }

    const debugInfo: any = {
      connected: !!profile.tiktok_access_token,
      username: profile.tiktok_username,
      displayName: profile.tiktok_display_name,
      open_id: profile.tiktok_user_id,
      tokenExpiry: profile.tiktok_token_expiry,
      tokenExpired: profile.tiktok_token_expiry ? new Date(profile.tiktok_token_expiry) <= new Date() : null,
      creatorInfo: creatorInfo
    };

    // Test video list API if connected
    if (profile.tiktok_access_token) {
      try {
        const videos = await getTikTokVideos(profile.tiktok_access_token, 5);
        debugInfo.videoListTest = {
          success: true,
          videoCount: videos.length,
          videos: videos.map(v => ({
            id: v.id,
            title: v.title || v.video_description,
            create_time: v.create_time
          }))
        };
      } catch (videoError: any) {
        debugInfo.videoListTest = {
          success: false,
          error: videoError.message
        };
      }
    }

    // Check tiktok_posts in database
    const { data: posts, error: postsError } = await supabase
      .from('tiktok_posts')
      .select('id, posted_at, video_description')
      .eq('user_id', user.id)
      .order('posted_at', { ascending: false })
      .limit(5);

    debugInfo.databasePosts = {
      count: posts?.length || 0,
      error: postsError?.message,
      posts: posts || []
    };

    return NextResponse.json({
      ok: true,
      debug: debugInfo,
      instructions: {
        targetUsers: {
          step1: "Go to TikTok Developer Dashboard: https://developers.tiktok.com",
          step2: "Navigate to: Your App → Sandbox → Sandbox settings (left menu)",
          step3: "In 'Target Users' section, verify your username is listed",
          step4: `Add this username if not present: ${profile.tiktok_username || 'mushu1330'}`,
          step5: "After adding, wait 5-30 minutes for propagation",
          step6: "Then disconnect and reconnect your TikTok account on KeiroAI",
          note: `Your open_id is: ${profile.tiktok_user_id} - This is what TikTok uses internally to match your account`
        },
        sandbox: {
          reminder: "Sandbox apps can only publish with privacy_level: SELF_ONLY",
          limit: "Maximum 5 posts per 24 hours in Sandbox mode",
          requirement: "Your account MUST be in Target Users list to publish"
        }
      }
    });

  } catch (error: any) {
    console.error('[TikTokDebug] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
