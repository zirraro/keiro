import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Helper: Extraire le access_token depuis les cookies Supabase
 */
async function getAccessTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  // Chercher le cookie avec pattern sb-{PROJECT_ID}-auth-token
  for (const cookie of allCookies) {
    if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
      try {
        const parsed = JSON.parse(cookie.value);
        const token = parsed.access_token || parsed[0];
        if (token) {
          console.log('[Library/Images] Found auth cookie:', cookie.name);
          return token;
        }
      } catch {
        // Si c'est une string directe
        if (cookie.value) return cookie.value;
      }
    }
  }

  // Fallback aux anciens noms
  return cookieStore.get('sb-access-token')?.value ||
         cookieStore.get('supabase-auth-token')?.value ||
         null;
}

/**
 * API Route: Récupérer les images de la librairie
 * GET /api/library/images?folderId=xxx&search=xxx&limit=20&offset=0
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const favoritesOnly = searchParams.get('favoritesOnly') === 'true';

    // Créer le client Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer le token d'accès
    let accessToken = await getAccessTokenFromCookies();

    // Fallback au header Authorization
    if (!accessToken) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
        console.log('[Library/Images] Using Bearer token from header');
      }
    }

    let user = null;

    if (accessToken) {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(accessToken);
      if (authUser) {
        user = authUser;
        console.log('[Library/Images] User authenticated:', user.id);
      } else if (authError) {
        console.error('[Library/Images] Auth error:', authError);
      }
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    console.log('[Library/Images] Fetching images for user:', user.id, {
      folderId,
      search,
      limit,
      offset,
      favoritesOnly
    });

    // Construire la requête
    let query = supabase
      .from('saved_images')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    // Filtrer par dossier
    if (folderId === 'root' || folderId === null || folderId === 'null') {
      query = query.is('folder_id', null);
    } else if (folderId) {
      query = query.eq('folder_id', folderId);
    }

    // Filtrer par favoris
    if (favoritesOnly) {
      query = query.eq('is_favorite', true);
    }

    // Recherche texte
    if (search && search.trim()) {
      query = query.or(`title.ilike.%${search}%,news_title.ilike.%${search}%,text_overlay.ilike.%${search}%`);
    }

    // Pagination et tri
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Library/Images] Error fetching images:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Images] ✅ Fetched', data?.length || 0, 'images');

    return NextResponse.json({
      ok: true,
      images: data || [],
      total: count || 0,
      limit,
      offset
    });

  } catch (error: any) {
    console.error('[Library/Images] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/library/images?id=xxx
 * Supprimer une image
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageId = searchParams.get('id');

    if (!imageId) {
      return NextResponse.json(
        { ok: false, error: 'id est requis' },
        { status: 400 }
      );
    }

    // Créer le client Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer le token d'accès
    let accessToken = await getAccessTokenFromCookies();

    // Fallback au header Authorization
    if (!accessToken) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

    let user = null;
    if (accessToken) {
      const { data: { user: authUser } } = await supabase.auth.getUser(accessToken);
      if (authUser) user = authUser;
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    console.log('[Library/Images] Deleting image:', imageId);

    // Supprimer l'image (RLS vérifie que user_id = auth.uid())
    const { error } = await supabase
      .from('saved_images')
      .delete()
      .eq('id', imageId)
      .eq('user_id', user.id); // Double check pour sécurité

    if (error) {
      console.error('[Library/Images] Error deleting image:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Images] ✅ Image deleted');

    return NextResponse.json({
      ok: true
    });

  } catch (error: any) {
    console.error('[Library/Images] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/library/images
 * Mettre à jour une image (favoris, titre, tags, etc.)
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, title, tags, isFavorite, folderId } = body;

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

    // Récupérer le token d'accès
    let accessToken = await getAccessTokenFromCookies();

    // Fallback au header Authorization
    if (!accessToken) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

    let user = null;
    if (accessToken) {
      const { data: { user: authUser } } = await supabase.auth.getUser(accessToken);
      if (authUser) user = authUser;
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    console.log('[Library/Images] Updating image:', id);

    // Construire l'objet de mise à jour
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (tags !== undefined) updates.tags = tags;
    if (isFavorite !== undefined) updates.is_favorite = isFavorite;
    if (folderId !== undefined) updates.folder_id = folderId;

    // Mettre à jour l'image
    const { data, error } = await supabase
      .from('saved_images')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[Library/Images] Error updating image:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Images] ✅ Image updated');

    return NextResponse.json({
      ok: true,
      image: data
    });

  } catch (error: any) {
    console.error('[Library/Images] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
