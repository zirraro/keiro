import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'edge';

/**
 * Helper: Extract access token from Supabase cookies
 */
async function getAccessTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  for (const cookie of allCookies) {
    if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
      try {
        let cookieValue = cookie.value;

        if (cookieValue.startsWith('base64-')) {
          const base64Content = cookieValue.substring(7);
          cookieValue = Buffer.from(base64Content, 'base64').toString('utf-8');
        }

        const parsed = JSON.parse(cookieValue);
        return parsed.access_token || (Array.isArray(parsed) ? parsed[0] : null);
      } catch (err) {
        console.error('[ScheduledPosts] Error processing cookie:', err);
      }
    }
  }

  return cookieStore.get('sb-access-token')?.value ||
         cookieStore.get('supabase-auth-token')?.value ||
         null;
}

/**
 * GET /api/library/scheduled-posts
 * Récupérer toutes les publications planifiées de l'utilisateur
 */
export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let accessToken = await getAccessTokenFromCookies();

    if (!accessToken) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    // ── Pourquoi une fenêtre et pas seulement une limite ──
    //
    // Fondateur, 20 août : « la galerie est super lente et n'affiche pas les
    // onglets et leur contenu en entier ».
    //
    // Cette requête tirait TOUT l'historique du client, `select('*')` plus une
    // jointure sur saved_images, sans aucune borne. Chaque ouverture de la
    // galerie rapatriait des centaines de lignes dont la page n'affiche que les
    // plus récentes.
    //
    // Le piège : poser une simple `.limit()` sur un tri ASCENDANT aurait rendu
    // les posts les PLUS ANCIENS et vidé la galerie de son contenu utile. On
    // borne donc par une FENÊTRE DE DATES — les 120 derniers jours par défaut,
    // réglable — ce qui préserve l'ordre chronologique dont le calendrier a
    // besoin tout en bornant réellement le volume.
    //
    // Les colonnes sont nommées plutôt que `*` : la jointure ramenait aussi des
    // champs que personne n'affiche.
    const jours = Math.min(Number(req.nextUrl.searchParams.get('jours') || 120), 400);
    const depuis = new Date(Date.now() - jours * 86400_000).toISOString();

    const { data: scheduledPosts, error } = await supabase
      .from('scheduled_posts')
      .select(`
        id, user_id, platform, status, caption, hashtags, scheduled_for,
        published_at, saved_image_id, post_url, error_message, created_at,
        saved_images (
          id,
          image_url,
          thumbnail_url,
          title,
          news_title
        )
      `)
      .eq('user_id', user.id)
      .gte('scheduled_for', depuis)
      .order('scheduled_for', { ascending: true })
      .limit(500);

    if (error) {
      console.error('[ScheduledPosts] Error fetching posts:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Formater la réponse
    const formattedPosts = (scheduledPosts || []).map((post: any) => ({
      id: post.id,
      saved_image_id: post.saved_image_id,
      image_url: post.saved_images?.image_url || '',
      thumbnail_url: post.saved_images?.thumbnail_url,
      title: post.saved_images?.title || post.saved_images?.news_title,
      platform: post.platform,
      scheduled_for: post.scheduled_for,
      caption: post.caption,
      hashtags: post.hashtags || [],
      status: post.status,
      approval_status: post.approval_status,
      created_at: post.created_at
    }));

    return NextResponse.json({
      ok: true,
      posts: formattedPosts
    });

  } catch (error: any) {
    console.error('[ScheduledPosts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/library/scheduled-posts
 * Créer une nouvelle publication planifiée
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let accessToken = await getAccessTokenFromCookies();

    if (!accessToken) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { saved_image_id, platform, scheduled_for, caption, hashtags } = body;

    if (!saved_image_id || !platform || !scheduled_for) {
      return NextResponse.json(
        { ok: false, error: 'Champs manquants: saved_image_id, platform, scheduled_for requis' },
        { status: 400 }
      );
    }

    // Créer le post planifié
    const { data: newPost, error: insertError } = await supabase
      .from('scheduled_posts')
      .insert({
        user_id: user.id,
        saved_image_id,
        platform,
        scheduled_for,
        caption: caption || '',
        hashtags: hashtags || [],
        status: 'scheduled',
        created_by: user.id,
        approval_status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[ScheduledPosts] Error creating post:', insertError);
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    console.log('[ScheduledPosts] ✅ Post scheduled:', newPost.id);

    return NextResponse.json({
      ok: true,
      post: newPost
    });

  } catch (error: any) {
    console.error('[ScheduledPosts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/library/scheduled-posts
 * Modifier une publication planifiée
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let accessToken = await getAccessTokenFromCookies();

    if (!accessToken) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'ID manquant' },
        { status: 400 }
      );
    }

    /**
     * ── Deux tables, un seul calendrier : il faut viser la bonne ──
     *
     * Depuis que le calendrier de la Galerie affiche AUSSI le travail des
     * agents, il peut demander de déplacer un post qui vit dans
     * `content_calendar` et non dans `scheduled_posts`.
     *
     * Sans ce routage, l'écriture ne trouverait aucune ligne : PostgREST rend
     * un succès avec zéro ligne modifiée, l'interface afficherait l'heure
     * changée, et rien n'aurait bougé. Le client verrait son post partir à
     * l'ancienne heure sans comprendre — un échec qui se présente comme une
     * réussite, le mode de panne le plus coûteux de ce produit.
     *
     * On regarde donc d'abord si l'identifiant appartient au calendrier des
     * agents, et on écrit là où le post existe vraiment.
     */
    const { data: postAgent } = await supabase
      .from('content_calendar')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (postAgent) {
      // `scheduled_for` est un instant ; le calendrier des agents sépare la
      // date et l'heure. On traduit ici plutôt que de faire porter cette
      // connaissance à l'interface.
      const quand = String((updates as any).scheduled_for || '');
      const maj: Record<string, any> = { updated_at: new Date().toISOString() };
      if (quand) {
        maj.scheduled_date = quand.slice(0, 10);
        maj.scheduled_time = `${quand.slice(11, 16) || '09:15'}:00`;
      }
      if ((updates as any).caption !== undefined) maj.caption = (updates as any).caption;

      const { error: errAgent } = await supabase
        .from('content_calendar').update(maj).eq('id', id).eq('user_id', user.id);
      if (errAgent) {
        return NextResponse.json({ ok: false, error: errAgent.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, post: { id, ...maj } });
    }

    // Mettre à jour le post
    const { data: updatedPost, error: updateError } = await supabase
      .from('scheduled_posts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('[ScheduledPosts] Error updating post:', updateError);
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    console.log('[ScheduledPosts] ✅ Post updated:', updatedPost.id);

    return NextResponse.json({
      ok: true,
      post: updatedPost
    });

  } catch (error: any) {
    console.error('[ScheduledPosts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/library/scheduled-posts
 * Supprimer une publication planifiée
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let accessToken = await getAccessTokenFromCookies();

    if (!accessToken) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Créez un compte pour accéder à cette fonctionnalité' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'ID manquant' },
        { status: 400 }
      );
    }

    // Supprimer le post
    const { error: deleteError } = await supabase
      .from('scheduled_posts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('[ScheduledPosts] Error deleting post:', deleteError);
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    console.log('[ScheduledPosts] ✅ Post deleted:', id);

    return NextResponse.json({
      ok: true
    });

  } catch (error: any) {
    console.error('[ScheduledPosts] ❌ Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
