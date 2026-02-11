import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { publishCarouselToInstagram } from '@/lib/meta';

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
        console.error('[PublishInstagramCarousel] Error processing cookie:', err);
      }
    }
  }

  return cookieStore.get('sb-access-token')?.value ||
         cookieStore.get('supabase-auth-token')?.value ||
         null;
}

/**
 * POST /api/library/instagram/publish-carousel
 * Publie un carrousel (2-10 images) sur Instagram
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

    // Récupérer les données du body
    const { imageUrls, caption, hashtags } = await req.json();

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'Au moins 2 images sont requises pour un carrousel' },
        { status: 400 }
      );
    }

    if (imageUrls.length > 10) {
      return NextResponse.json(
        { ok: false, error: 'Maximum 10 images pour un carrousel Instagram' },
        { status: 400 }
      );
    }

    console.log('[PublishInstagramCarousel] Publishing carousel to Instagram...', {
      userId: user.id,
      imageCount: imageUrls.length
    });

    // Récupérer les informations Instagram de l'utilisateur
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, instagram_username')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('[PublishInstagramCarousel] Error fetching profile:', profileError);
      return NextResponse.json(
        { ok: false, error: 'Profil non trouvé' },
        { status: 404 }
      );
    }

    if (!profile.instagram_business_account_id || !profile.instagram_access_token) {
      return NextResponse.json(
        { ok: false, error: 'Compte Instagram non connecté' },
        { status: 400 }
      );
    }

    // Format caption with hashtags
    const finalCaption = caption
      ? caption + '\n\n' + (hashtags || []).map((tag: string) => (tag.startsWith('#') ? tag : '#' + tag)).join(' ')
      : (hashtags || []).map((tag: string) => (tag.startsWith('#') ? tag : '#' + tag)).join(' ');

    console.log('[PublishInstagramCarousel] Calling Instagram API...', {
      accountId: profile.instagram_business_account_id,
      imageCount: imageUrls.length
    });

    // Publier le carrousel sur Instagram
    const result = await publishCarouselToInstagram(
      profile.instagram_business_account_id,
      profile.instagram_access_token,
      imageUrls,
      finalCaption
    );

    console.log('[PublishInstagramCarousel] Carousel published successfully:', {
      postId: result.id,
      permalink: result.permalink
    });

    // Sauvegarder dans la BDD
    const { error: insertError } = await supabase
      .from('instagram_posts')
      .insert({
        id: result.id,
        user_id: user.id,
        caption: finalCaption,
        permalink: result.permalink || null,
        cached_image_url: imageUrls[0], // Première image comme thumbnail
        media_type: 'CAROUSEL_ALBUM',
        posted_at: new Date().toISOString(),
        synced_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('[PublishInstagramCarousel] Error saving to DB:', insertError);
      // Ne pas échouer la requête, le post est déjà publié
    }

    return NextResponse.json({
      ok: true,
      post: {
        id: result.id,
        permalink: result.permalink,
        caption: finalCaption,
        imageCount: imageUrls.length,
        posted_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('[PublishInstagramCarousel] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la publication du carrousel' },
      { status: 500 }
    );
  }
}
