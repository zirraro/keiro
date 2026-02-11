import { getAuthUser } from '@/lib/auth-server';
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
        let cookieValue = cookie.value;

        // Décoder le base64 si nécessaire
        if (cookieValue.startsWith('base64-')) {
          const base64Content = cookieValue.substring(7);
          cookieValue = Buffer.from(base64Content, 'base64').toString('utf-8');
        }

        const parsed = JSON.parse(cookieValue);
        const token = parsed.access_token || (Array.isArray(parsed) ? parsed[0] : null);
        if (token) {
          console.log('[Library/Folders] Found auth cookie:', cookie.name);
          return token;
        }
      } catch (err) {
        console.error('[Library/Folders] Error processing cookie:', err);
      }
    }
  }

  // Fallback aux anciens noms
  return cookieStore.get('sb-access-token')?.value ||
         cookieStore.get('supabase-auth-token')?.value ||
         null;
}

/**
 * Helper: Récupérer l'utilisateur authentifié depuis les cookies
 */
async function getAuthenticatedUser(req: NextRequest) {
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

  return { user, supabase };
}

/**
 * API Route: Gérer les dossiers de la galerie
 * GET /api/library/folders - Liste tous les dossiers
 */
export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    console.log('[Library/Folders] Fetching folders for user:', user.id);

    // Récupérer tous les dossiers de l'utilisateur
    const { data: folders, error } = await supabase
      .from('library_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true });

    if (error) {
      console.error('[Library/Folders] Error fetching folders:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Ajouter le compteur d'images pour chaque dossier
    const foldersWithCounts = await Promise.all(
      (folders || []).map(async (folder) => {
        const { count } = await supabase
          .from('saved_images')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('folder_id', folder.id);

        return {
          ...folder,
          image_count: count || 0
        };
      })
    );

    console.log('[Library/Folders] ✅ Fetched', foldersWithCounts.length, 'folders');

    return NextResponse.json({
      ok: true,
      folders: foldersWithCounts
    });

  } catch (error: any) {
    console.error('[Library/Folders] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/library/folders - Créer un nouveau dossier
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, color, icon, parentFolderId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Le nom du dossier est requis' },
        { status: 400 }
      );
    }

    const { user, supabase } = await getAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    console.log('[Library/Folders] Creating folder:', name);

    // Créer le dossier
    const { data, error } = await supabase
      .from('library_folders')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        color: color || '#3b82f6',
        icon: icon || '📁',
        parent_folder_id: parentFolderId || null,
        position: 0
      })
      .select()
      .single();

    if (error) {
      console.error('[Library/Folders] Error creating folder:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Folders] ✅ Folder created:', data.id);

    return NextResponse.json({
      ok: true,
      folder: data
    });

  } catch (error: any) {
    console.error('[Library/Folders] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/library/folders - Mettre à jour un dossier
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, description, color, icon, position } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'id est requis' },
        { status: 400 }
      );
    }

    const { user, supabase } = await getAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    console.log('[Library/Folders] Updating folder:', id);

    // Construire l'objet de mise à jour
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (color !== undefined) updates.color = color;
    if (icon !== undefined) updates.icon = icon;
    if (position !== undefined) updates.position = position;

    // Mettre à jour le dossier
    const { data, error } = await supabase
      .from('library_folders')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[Library/Folders] Error updating folder:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Folders] ✅ Folder updated');

    return NextResponse.json({
      ok: true,
      folder: data
    });

  } catch (error: any) {
    console.error('[Library/Folders] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/library/folders?id=xxx
 * Supprimer un dossier
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('id');

    if (!folderId) {
      return NextResponse.json(
        { ok: false, error: 'id est requis' },
        { status: 400 }
      );
    }

    const { user, supabase } = await getAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    console.log('[Library/Folders] Deleting folder:', folderId);

    // Supprimer le dossier
    // Note: Les images dans ce dossier auront leur folder_id mis à NULL (ON DELETE SET NULL)
    const { error } = await supabase
      .from('library_folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Library/Folders] Error deleting folder:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[Library/Folders] ✅ Folder deleted');

    return NextResponse.json({
      ok: true
    });

  } catch (error: any) {
    console.error('[Library/Folders] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
