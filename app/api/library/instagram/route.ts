import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

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

    // Récupérer l'utilisateur authentifié depuis les cookies
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    // instagram_posts = VRAIS posts Instagram (pas de relation avec saved_images)
    let query = supabase
      .from('instagram_posts')
      .select('*')
      .eq('user_id', user.id);

    // Note: savedImageId n'existe plus dans instagram_posts (table pour vrais posts Instagram)
    // Cette fonctionnalité est pour un workspace/draft différent

    const { data, error } = await query.order('posted_at', { ascending: false });

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
 * NOTE: Cette fonctionnalité n'est plus disponible. instagram_posts est maintenant
 * pour les vrais posts Instagram synchronisés depuis Instagram uniquement.
 * Il faudrait une table séparée pour les drafts/workspace.
 */
export async function POST(req: NextRequest) {
  return NextResponse.json(
    { ok: false, error: 'Cette fonctionnalité n\'est plus disponible. instagram_posts est maintenant pour les vrais posts Instagram uniquement.' },
    { status: 400 }
  );
}

/**
 * PATCH /api/library/instagram - Mettre à jour un post Instagram
 * NOTE: Cette fonctionnalité n'est plus disponible. instagram_posts est maintenant
 * pour les posts réels synchronisés depuis Instagram (read-only).
 */
export async function PATCH(req: NextRequest) {
  return NextResponse.json(
    { ok: false, error: 'Cette fonctionnalité n\'est plus disponible. instagram_posts est maintenant pour les vrais posts Instagram uniquement.' },
    { status: 400 }
  );
}

/**
 * DELETE /api/library/instagram?id=xxx
 * Supprimer un post Instagram
 * NOTE: Cette fonctionnalité n'est plus disponible. instagram_posts est maintenant
 * pour les posts réels depuis Instagram (ne peuvent pas être supprimés ici).
 */
export async function DELETE(req: NextRequest) {
  return NextResponse.json(
    { ok: false, error: 'Cette fonctionnalité n\'est plus disponible. instagram_posts est maintenant pour les vrais posts Instagram uniquement.' },
    { status: 400 }
  );
}
