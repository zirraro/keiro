import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { publishStoryToInstagram } from '@/lib/meta';

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
        console.error('[PublishInstagramStory] Error processing cookie:', err);
      }
    }
  }

  return cookieStore.get('sb-access-token')?.value ||
         cookieStore.get('supabase-auth-token')?.value ||
         null;
}

/**
 * POST /api/library/instagram/publish-story
 * Publie une story sur Instagram immédiatement
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer l'utilisateur connecté
    let accessToken = await getAccessTokenFromCookies();

    if (!accessToken) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

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

    // Récupérer les données du body
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: 'Image URL manquante' },
        { status: 400 }
      );
    }

    console.log('[PublishInstagramStory] Publishing story to Instagram...', {
      userId: user.id,
      imageUrl: imageUrl.substring(0, 50)
    });

    // Récupérer les informations Instagram de l'utilisateur
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, instagram_username')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('[PublishInstagramStory] Error fetching profile:', profileError);
      return NextResponse.json(
        { ok: false, error: 'Profil non trouvé' },
        { status: 404 }
      );
    }

    if (!profile.instagram_business_account_id || !profile.instagram_access_token) {
      return NextResponse.json(
        { ok: false, error: 'Instagram non connecté. Connectez votre compte Instagram Business.' },
        { status: 400 }
      );
    }

    // Publier la story sur Instagram
    const result = await publishStoryToInstagram(
      profile.instagram_business_account_id,
      profile.instagram_access_token,
      imageUrl
    );

    console.log('[PublishInstagramStory] ✅ Story published successfully:', result.id);

    return NextResponse.json({
      ok: true,
      message: 'Story publiée avec succès sur Instagram !',
      storyId: result.id,
      username: profile.instagram_username
    });

  } catch (error: any) {
    console.error('[PublishInstagramStory] ❌ Error:', error);

    // Parser les erreurs Meta Graph API
    let errorMessage = error.message || 'Erreur lors de la publication';

    try {
      const errorData = JSON.parse(error.message);
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {
      // L'erreur n'est pas un JSON, utiliser le message tel quel
    }

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
