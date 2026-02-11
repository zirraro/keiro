import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

/**
 * GET /api/library/videos
 * Get user's videos from my_videos table
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

    // Get query params
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId');
    const search = searchParams.get('search');
    const favoritesOnly = searchParams.get('favoritesOnly') === 'true';

    // Build query
    let query = supabase
      .from('my_videos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (folderId) {
      query = query.eq('folder_id', folderId);
    }

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    if (favoritesOnly) {
      query = query.eq('is_favorite', true);
    }

    const { data: videos, error: videosError } = await query;

    if (videosError) {
      console.error('[LibraryVideos] Error fetching videos:', videosError);
      return NextResponse.json(
        { ok: false, error: videosError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      videos: videos || [],
      total: videos?.length || 0
    });

  } catch (error: any) {
    console.error('[LibraryVideos] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
