import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API Route: Gérer les dossiers de la librairie
 * GET /api/library/folders - Liste tous les dossiers
 */
export async function GET(req: NextRequest) {
  try {
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

    console.log('[Library/Folders] Fetching folders for user:', user.id);

    // Récupérer tous les dossiers de l'utilisateur
    const { data, error } = await supabase
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

    console.log('[Library/Folders] ✅ Fetched', data?.length || 0, 'folders');

    return NextResponse.json({
      ok: true,
      folders: data || []
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
