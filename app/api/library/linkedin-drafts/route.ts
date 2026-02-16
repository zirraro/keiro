import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' }, { status: 401 });
    }
    const { data, error } = await supabase
      .from('linkedin_drafts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[LinkedInDrafts] Error fetching drafts:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, posts: data || [] });
  } catch (error: any) {
    console.error('[LinkedInDrafts] Unexpected error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' }, { status: 401 });
    }
    const { savedImageId, videoId, mediaUrl, mediaType, caption, hashtags, status } = await req.json();

    let finalMediaUrl = mediaUrl || '';
    let finalMediaType = mediaType || 'text-only';
    let finalSavedImageId = savedImageId || null;
    let finalVideoId = videoId || null;

    // Si on a un savedImageId, récupérer l'URL de l'image
    if (savedImageId) {
      const { data: image, error: imageError } = await supabase
        .from('saved_images')
        .select('image_url')
        .eq('id', savedImageId)
        .eq('user_id', user.id)
        .single();
      if (imageError || !image) {
        return NextResponse.json({ ok: false, error: 'Image non trouvée' }, { status: 404 });
      }
      finalMediaUrl = image.image_url;
      finalMediaType = 'image';
    }

    // Texte seul : pas besoin de média
    if (!savedImageId && !videoId && !mediaUrl) {
      if (!caption?.trim()) {
        return NextResponse.json({ ok: false, error: 'Texte requis pour un post texte seul' }, { status: 400 });
      }
      finalMediaType = 'text-only';
      finalMediaUrl = '';
    }

    const { data: draft, error: insertError } = await supabase
      .from('linkedin_drafts')
      .insert({
        user_id: user.id,
        saved_image_id: finalSavedImageId,
        video_id: finalVideoId,
        media_url: finalMediaUrl,
        media_type: finalMediaType,
        category: 'draft',
        caption: caption || '',
        hashtags: hashtags || [],
        status: status || 'draft'
      })
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }
    console.log('[LinkedInDrafts] Draft created:', draft.id);
    return NextResponse.json({ ok: true, draft });
  } catch (error: any) {
    console.error('[LinkedInDrafts] Unexpected error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const draftId = searchParams.get('id');
    if (!draftId) {
      return NextResponse.json({ ok: false, error: 'ID du brouillon manquant' }, { status: 400 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' }, { status: 401 });
    }
    const updates = await req.json();
    const { data, error } = await supabase
      .from('linkedin_drafts')
      .update(updates)
      .eq('id', draftId)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, draft: data });
  } catch (error: any) {
    console.error('[LinkedInDrafts] Unexpected error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const draftId = searchParams.get('id');
    if (!draftId) {
      return NextResponse.json({ ok: false, error: 'ID du brouillon manquant' }, { status: 400 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' }, { status: 401 });
    }
    const { error } = await supabase
      .from('linkedin_drafts')
      .delete()
      .eq('id', draftId)
      .eq('user_id', user.id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[LinkedInDrafts] Unexpected error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
