import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

/**
 * PATCH /api/library/videos/[id]
 * Update video properties (title, is_favorite, etc.)
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const videoId = params.id;
    const body = await req.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build update object
    const updates: any = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.is_favorite !== undefined) updates.is_favorite = body.is_favorite;
    if (body.folder_id !== undefined) updates.folder_id = body.folder_id;

    const { error: updateError } = await supabase
      .from('my_videos')
      .update(updates)
      .eq('id', videoId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[VideoPatch] Error:', updateError);
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error('[VideoPatch] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/library/videos/[id]
 * Delete a video and its file from storage
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const videoId = params.id;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get video to extract storage path
    const { data: video, error: fetchError } = await supabase
      .from('my_videos')
      .select('video_url')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      console.error('[VideoDelete] Error fetching video:', fetchError);
      return NextResponse.json(
        { ok: false, error: fetchError.message },
        { status: 500 }
      );
    }

    if (!video) {
      return NextResponse.json(
        { ok: false, error: 'Vidéo non trouvée' },
        { status: 404 }
      );
    }

    // Delete from database first
    const { error: deleteError } = await supabase
      .from('my_videos')
      .delete()
      .eq('id', videoId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('[VideoDelete] Error deleting from DB:', deleteError);
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    // Try to delete from storage (optional - don't fail if it doesn't work)
    try {
      const videoUrl = video.video_url;
      const match = videoUrl.match(/\/object\/public\/([^\/]+)\/(.+)/);

      if (match) {
        const bucket = match[1];
        const filePath = match[2];

        await supabase.storage
          .from(bucket)
          .remove([filePath]);

        console.log('[VideoDelete] Storage file deleted:', filePath);
      }
    } catch (storageError) {
      console.warn('[VideoDelete] Could not delete storage file:', storageError);
      // Don't fail the request if storage deletion fails
    }

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error('[VideoDelete] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
