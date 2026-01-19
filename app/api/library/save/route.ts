import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Configuration pour augmenter la limite de taille du body
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * API Route: Sauvegarder une image dans la librairie
 * POST /api/library/save
 */
export async function POST(req: NextRequest) {
  try {
    let body;
    let bodyText;

    try {
      // Lire le body comme texte d'abord pour voir sa taille
      bodyText = await req.text();
      console.log('[Library/Save] Body size:', new Blob([bodyText]).size, 'bytes');

      // Parser le JSON
      body = JSON.parse(bodyText);
    } catch (jsonError: any) {
      console.error('[Library/Save] Error parsing JSON:', jsonError);
      console.error('[Library/Save] Body text preview:', bodyText?.substring(0, 200));
      return NextResponse.json(
        { ok: false, error: 'JSON invalide ou requête trop volumineuse' },
        { status: 400 }
      );
    }

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

    // Créer le client Supabase avec la service role key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer l'utilisateur depuis les cookies Next.js
    const cookieStore = await cookies();

    // Chercher le cookie Supabase avec pattern sb-{PROJECT_ID}-auth-token
    let accessToken: string | undefined;
    const allCookies = cookieStore.getAll();

    for (const cookie of allCookies) {
      if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
        // Extraire le token depuis le JSON stocké
        try {
          let cookieValue = cookie.value;

          // Décoder le base64 si nécessaire
          if (cookieValue.startsWith('base64-')) {
            const base64Content = cookieValue.substring(7);
            cookieValue = Buffer.from(base64Content, 'base64').toString('utf-8');
          }

          const parsed = JSON.parse(cookieValue);
          accessToken = parsed.access_token || (Array.isArray(parsed) ? parsed[0] : undefined);
          console.log('[Library/Save] Found Supabase auth cookie:', cookie.name);
          break;
        } catch (err) {
          console.error('[Library/Save] Error processing cookie:', err);
        }
      }
    }

    // Fallback aux anciens noms
    if (!accessToken) {
      accessToken = cookieStore.get('sb-access-token')?.value ||
                   cookieStore.get('supabase-auth-token')?.value;
    }

    console.log('[Library/Save] Access token present:', !!accessToken);

    let userId: string | null = null;

    if (accessToken) {
      // Utiliser le token pour obtenir l'utilisateur
      const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

      if (authError) {
        console.error('[Library/Save] Auth error:', authError);
      }

      if (user) {
        userId = user.id;
        console.log('[Library/Save] User authenticated:', userId);
      }
    }

    // Si pas de token dans les cookies, essayer depuis le header Authorization
    if (!userId) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (user) {
          userId = user.id;
          console.log('[Library/Save] User authenticated from Bearer token:', userId);
        }
      }
    }

    if (!userId) {
      console.log('[Library/Save] No authenticated user found');
      return NextResponse.json(
        { ok: false, error: 'Non authentifié. Veuillez vous connecter.' },
        { status: 401 }
      );
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
      console.error('[Library/Save] Supabase error:', error);
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
      { ok: false, error: error.message || 'Erreur serveur interne' },
      { status: 500 }
    );
  }
}
