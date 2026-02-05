import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

/**
 * GET /api/library/tiktok-drafts
 * Récupérer tous les brouillons TikTok de l'utilisateur
 */
export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from('tiktok_drafts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[TikTokDrafts] Error fetching drafts:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Normalize data: ensure media_url exists (fallback to image_url for backward compatibility)
    const normalizedData = data?.map((draft: any) => ({
      ...draft,
      media_url: draft.media_url || draft.image_url,
      media_type: draft.media_type || 'image',
      category: draft.category || 'draft'
    })) || [];

    console.log('[TikTokDrafts] ✅ Fetched', normalizedData.length, 'drafts');

    return NextResponse.json({
      ok: true,
      posts: normalizedData
    });

  } catch (error: any) {
    console.error('[TikTokDrafts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/library/tiktok-drafts
 * Créer un nouveau brouillon TikTok
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
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

    console.log('[TikTokDrafts] Fetched image:', {
      savedImageId,
      hasImage: !!image,
      imageUrl: image?.image_url,
      error: imageError
    });

    if (imageError || !image) {
      console.error('[TikTokDrafts] Error fetching image:', imageError);
      return NextResponse.json(
        { ok: false, error: 'Image non trouvée' },
        { status: 404 }
      );
    }

    if (!image.image_url) {
      console.error('[TikTokDrafts] Image URL is empty for savedImageId:', savedImageId);
      return NextResponse.json(
        { ok: false, error: 'URL de l\'image manquante' },
        { status: 400 }
      );
    }

    // Créer le brouillon
    console.log('[TikTokDrafts] Creating draft with media_url:', image.image_url);
    const { data: draft, error: insertError } = await supabase
      .from('tiktok_drafts')
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
      console.error('[TikTokDrafts] Error creating draft:', insertError);
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    console.log('[TikTokDrafts] ✅ Draft created:', draft.id);

    return NextResponse.json({
      ok: true,
      draft
    });

  } catch (error: any) {
    console.error('[TikTokDrafts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/library/tiktok-drafts?id=xxx
 * Mettre à jour un brouillon TikTok
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
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const updates = await req.json();

    const { data, error } = await supabase
      .from('tiktok_drafts')
      .update(updates)
      .eq('id', draftId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[TikTokDrafts] Error updating draft:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[TikTokDrafts] ✅ Draft updated:', draftId);

    return NextResponse.json({
      ok: true,
      draft: data
    });

  } catch (error: any) {
    console.error('[TikTokDrafts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/library/tiktok-drafts?id=xxx
 * Supprimer un brouillon TikTok
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
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const { error } = await supabase
      .from('tiktok_drafts')
      .delete()
      .eq('id', draftId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[TikTokDrafts] Error deleting draft:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[TikTokDrafts] ✅ Draft deleted:', draftId);

    return NextResponse.json({
      ok: true
    });

  } catch (error: any) {
    console.error('[TikTokDrafts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
