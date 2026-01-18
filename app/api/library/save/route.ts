import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API Route: Sauvegarder une image dans la librairie
 * POST /api/library/save
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageUrl,
      thumbnailUrl,
      folderId,
      newsTitle,
      newsDescription,
      newsCategory,
      newsSource,
      businessType,
      businessDescription,
      textOverlay,
      visualStyle,
      tone,
      generationPrompt,
      aiModel,
      title,
      tags
    } = body;

    // Validation
    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: 'imageUrl est requis' },
        { status: 400 }
      );
    }

    // Créer le client Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer l'utilisateur authentifié
    const authHeader = req.headers.get('authorization');
    let userId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return NextResponse.json(
          { ok: false, error: 'Non authentifié' },
          { status: 401 }
        );
      }

      userId = user.id;
    } else {
      // Fallback: essayer de récupérer l'utilisateur depuis le cookie
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { ok: false, error: 'Non authentifié' },
          { status: 401 }
        );
      }

      userId = user.id;
    }

    console.log('[Library/Save] Saving image for user:', userId);

    // Insérer l'image dans la table saved_images
    const { data, error } = await supabase
      .from('saved_images')
      .insert({
        user_id: userId,
        folder_id: folderId || null,
        image_url: imageUrl,
        thumbnail_url: thumbnailUrl || null,
        news_title: newsTitle || null,
        news_description: newsDescription || null,
        news_category: newsCategory || null,
        news_source: newsSource || null,
        business_type: businessType || null,
        business_description: businessDescription || null,
        text_overlay: textOverlay || null,
        visual_style: visualStyle || null,
        tone: tone || null,
        generation_prompt: generationPrompt || null,
        ai_model: aiModel || 'seedream',
        title: title || null,
        tags: tags || [],
        is_favorite: false,
        download_count: 0,
        view_count: 0
      })
      .select()
      .single();

    if (error) {
      console.error('[Library/Save] Error saving image:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Save] ✅ Image saved successfully:', data.id);

    return NextResponse.json({
      ok: true,
      savedImage: data
    });

  } catch (error: any) {
    console.error('[Library/Save] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
