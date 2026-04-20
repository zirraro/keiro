import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'edge';

/**
 * GET /api/library/instagram-drafts
 * Récupérer tous les brouillons Instagram de l'utilisateur
 */
export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    // Two sources feed the Instagram drafts tab:
    //  1. instagram_drafts — manual drafts created from /generate
    //  2. content_calendar — drafts produced by Léna's campaign wizard
    //     when the client picks "Prepare draft" instead of "Publish now".
    // We merge them here so the library tab shows everything.
    const [manualRes, calendarRes] = await Promise.all([
      supabase.from('instagram_drafts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('content_calendar')
        .select('id, platform, format, pillar, hook, caption, hashtags, visual_url, video_url, status, scheduled_date, created_at, user_id')
        .eq('user_id', user.id)
        .eq('platform', 'instagram')
        .eq('status', 'draft')
        .order('created_at', { ascending: false }),
    ]);

    if (manualRes.error) {
      console.error('[InstagramDrafts] Error fetching manual drafts:', manualRes.error);
    }
    if (calendarRes.error) {
      console.error('[InstagramDrafts] Error fetching calendar drafts:', calendarRes.error);
    }

    const manual = manualRes.data || [];
    const calendar = (calendarRes.data || []).map((p: any) => ({
      // Map to the library draft shape so the UI can render both uniformly
      id: `cc-${p.id}`, // prefix to avoid clashing with manual draft UUIDs
      source: 'campaign',
      content_calendar_id: p.id,
      user_id: p.user_id,
      media_url: p.visual_url || null,
      video_url: p.video_url || null,
      media_type: p.format === 'reel' || p.format === 'video' ? 'video' : 'image',
      category: 'draft',
      caption: p.caption || '',
      hashtags: p.hashtags || [],
      hook: p.hook || null,
      status: 'draft',
      scheduled_date: p.scheduled_date,
      created_at: p.created_at,
    }));

    const merged = [...manual.map((m: any) => ({ ...m, source: m.source || 'manual' })), ...calendar]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    console.log(`[InstagramDrafts] ✅ Fetched ${merged.length} drafts (${manual.length} manual + ${calendar.length} campaign)`);

    return NextResponse.json({
      ok: true,
      posts: merged,
    });

  } catch (error: any) {
    console.error('[InstagramDrafts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/library/instagram-drafts
 * Créer un nouveau brouillon Instagram
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { savedImageId, caption, hashtags, status } = await req.json();

    if (!savedImageId) {
      return NextResponse.json(
        { ok: false, error: 'ID de l\'image manquant' },
        { status: 400 }
      );
    }

    // Récupérer l'URL de l'image depuis saved_images
    const { data: image, error: imageError } = await supabase
      .from('saved_images')
      .select('image_url')
      .eq('id', savedImageId)
      .eq('user_id', user.id)
      .single();

    if (imageError || !image) {
      console.error('[InstagramDrafts] Error fetching image:', imageError);
      return NextResponse.json(
        { ok: false, error: 'Image non trouvée' },
        { status: 404 }
      );
    }

    // Créer le brouillon
    const { data: draft, error: insertError } = await supabase
      .from('instagram_drafts')
      .insert({
        user_id: user.id,
        saved_image_id: savedImageId,
        media_url: image.image_url, // Renamed from image_url
        media_type: 'image',
        category: 'draft',
        caption: caption || '',
        hashtags: hashtags || [],
        status: status || 'draft'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[InstagramDrafts] Error creating draft:', insertError);
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    console.log('[InstagramDrafts] ✅ Draft created:', draft.id);

    return NextResponse.json({
      ok: true,
      draft
    });

  } catch (error: any) {
    console.error('[InstagramDrafts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/library/instagram-drafts?id=xxx
 * Mettre à jour un brouillon Instagram
 */
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const draftId = searchParams.get('id');

    if (!draftId) {
      return NextResponse.json(
        { ok: false, error: 'ID du brouillon manquant' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const updates = await req.json();

    const { data, error } = await supabase
      .from('instagram_drafts')
      .update(updates)
      .eq('id', draftId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[InstagramDrafts] Error updating draft:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[InstagramDrafts] ✅ Draft updated:', draftId);

    return NextResponse.json({
      ok: true,
      draft: data
    });

  } catch (error: any) {
    console.error('[InstagramDrafts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/library/instagram-drafts?id=xxx
 * Supprimer un brouillon Instagram
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const draftId = searchParams.get('id');

    if (!draftId) {
      return NextResponse.json(
        { ok: false, error: 'ID du brouillon manquant' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { error } = await supabase
      .from('instagram_drafts')
      .delete()
      .eq('id', draftId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[InstagramDrafts] Error deleting draft:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[InstagramDrafts] ✅ Draft deleted:', draftId);

    return NextResponse.json({
      ok: true
    });

  } catch (error: any) {
    console.error('[InstagramDrafts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
