import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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
        console.error('[InstagramPosts] Error processing cookie:', err);
      }
    }
  }

  return cookieStore.get('sb-access-token')?.value ||
         cookieStore.get('supabase-auth-token')?.value ||
         null;
}

/**
 * GET /api/instagram/posts
 * Récupère les derniers posts Instagram de l'utilisateur
 */
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer l'utilisateur connecté
    const accessToken = await getAccessTokenFromCookies();

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // Récupérer le profil avec les tokens Instagram
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.instagram_business_account_id || !profile?.instagram_access_token) {
      return NextResponse.json(
        { ok: false, error: 'Instagram non connecté' },
        { status: 400 }
      );
    }

    // Récupérer les posts via l'API Instagram Graph
    const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
    const instagramApiUrl = `https://graph.facebook.com/v20.0/${profile.instagram_business_account_id}/media?fields=${fields}&limit=24&access_token=${profile.instagram_access_token}`;

    const response = await fetch(instagramApiUrl);
    const data = await response.json();

    if (data.error) {
      console.error('[InstagramPosts] API error:', data.error);
      return NextResponse.json(
        { ok: false, error: data.error.message || 'Erreur lors de la récupération des posts' },
        { status: 400 }
      );
    }

    // Appeler sync-media et ATTENDRE les URLs cachées
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    try {
      // Recréer les cookies Supabase pour l'appel interne
      const cookieStore = await cookies();
      const allCookies = cookieStore.getAll();
      const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ');

      const syncResponse = await fetch(`${baseUrl}/api/instagram/sync-media`, {
        method: 'POST',
        headers: {
          'Cookie': cookieString,
          'Content-Type': 'application/json'
        }
      });

      const syncData = await syncResponse.json();

      if (syncData.ok && syncData.posts) {
        console.log(`[InstagramPosts] Sync completed: ${syncData.cached}/${syncData.total} images cached`);

        // Merger les URLs cachées avec les posts originaux
        const postsWithCache = data.data.map((post: any) => {
          const cachedPost = syncData.posts.find((cp: any) => cp.id === post.id);
          return {
            ...post,
            cachedUrl: cachedPost?.cachedUrl || null
          };
        });

        return NextResponse.json({
          ok: true,
          posts: postsWithCache,
          cached: syncData.cached
        });
      } else {
        console.error('[InstagramPosts] Sync failed:', syncData.error);
        // Fallback : retourner les posts sans cache
        return NextResponse.json({
          ok: true,
          posts: data.data || [],
          cached: 0
        });
      }
    } catch (syncError) {
      console.error('[InstagramPosts] Sync error:', syncError);
      // Fallback : retourner les posts sans cache
      return NextResponse.json({
        ok: true,
        posts: data.data || [],
        cached: 0
      });
    }

  } catch (error: any) {
    console.error('[InstagramPosts] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
