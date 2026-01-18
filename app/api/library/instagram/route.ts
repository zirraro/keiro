import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API Route: Workspace Instagram - Préparer les posts
 * GET /api/library/instagram?savedImageId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const savedImageId = searchParams.get('savedImageId');

    // Créer le client Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer l'utilisateur authentifié
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    let query = supabase
      .from('instagram_posts')
      .select('*, saved_images(*)')
      .eq('user_id', user.id);

    // Filtrer par image si spécifié
    if (savedImageId) {
      query = query.eq('saved_image_id', savedImageId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[Library/Instagram] Error fetching posts:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Instagram] ✅ Fetched', data?.length || 0, 'posts');

    return NextResponse.json({
      ok: true,
      posts: data || []
    });

  } catch (error: any) {
    console.error('[Library/Instagram] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/library/instagram - Créer un brouillon de post Instagram
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { savedImageId, caption, hashtags } = body;

    if (!savedImageId) {
      return NextResponse.json(
        { ok: false, error: 'savedImageId est requis' },
        { status: 400 }
      );
    }

    // Créer le client Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer l'utilisateur authentifié
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    console.log('[Library/Instagram] Creating draft post for image:', savedImageId);

    // Créer le post Instagram en mode draft
    const { data, error } = await supabase
      .from('instagram_posts')
      .insert({
        user_id: user.id,
        saved_image_id: savedImageId,
        caption: caption || '',
        hashtags: hashtags || [],
        status: 'draft'
      })
      .select()
      .single();

    if (error) {
      console.error('[Library/Instagram] Error creating post:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Instagram] ✅ Draft post created:', data.id);

    return NextResponse.json({
      ok: true,
      post: data
    });

  } catch (error: any) {
    console.error('[Library/Instagram] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/library/instagram - Mettre à jour un post Instagram
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, caption, hashtags, status, scheduledFor } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'id est requis' },
        { status: 400 }
      );
    }

    // Créer le client Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer l'utilisateur authentifié
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    console.log('[Library/Instagram] Updating post:', id);

    // Construire l'objet de mise à jour
    const updates: any = {};
    if (caption !== undefined) updates.caption = caption;
    if (hashtags !== undefined) updates.hashtags = hashtags;
    if (status !== undefined) updates.status = status;
    if (scheduledFor !== undefined) updates.scheduled_for = scheduledFor;

    // Mettre à jour le post
    const { data, error } = await supabase
      .from('instagram_posts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[Library/Instagram] Error updating post:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Instagram] ✅ Post updated');

    return NextResponse.json({
      ok: true,
      post: data
    });

  } catch (error: any) {
    console.error('[Library/Instagram] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/library/instagram?id=xxx
 * Supprimer un post Instagram
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get('id');

    if (!postId) {
      return NextResponse.json(
        { ok: false, error: 'id est requis' },
        { status: 400 }
      );
    }

    // Créer le client Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer l'utilisateur authentifié
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    console.log('[Library/Instagram] Deleting post:', postId);

    // Supprimer le post
    const { error } = await supabase
      .from('instagram_posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Library/Instagram] Error deleting post:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Instagram] ✅ Post deleted');

    return NextResponse.json({
      ok: true
    });

  } catch (error: any) {
    console.error('[Library/Instagram] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
