import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { publishImageToInstagram } from '@/lib/meta';

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
        console.error('[PublishInstagram] Error processing cookie:', err);
      }
    }
  }

  return cookieStore.get('sb-access-token')?.value ||
         cookieStore.get('supabase-auth-token')?.value ||
         null;
}

/**
 * POST /api/library/instagram/publish
 * Publie une image sur Instagram immédiatement
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
    const { imageUrl, caption, hashtags } = await req.json();

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: 'Image URL manquante' },
        { status: 400 }
      );
    }

    console.log('[PublishInstagram] Publishing to Instagram...', {
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
      console.error('[PublishInstagram] Error fetching profile:', profileError);
      return NextResponse.json(
        { ok: false, error: 'Profil non trouvé' },
        { status: 404 }
      );
    }

    if (!profile.instagram_business_account_id || !profile.instagram_access_token) {
      return NextResponse.json(
        { ok: false, error: 'Compte Instagram non connecté. Veuillez d\'abord connecter votre compte Instagram Business.' },
        { status: 400 }
      );
    }

    // Construire la caption finale (caption + hashtags)
    let finalCaption = caption || '';
    if (hashtags && hashtags.length > 0) {
      const hashtagString = hashtags.join(' ');
      finalCaption = finalCaption ? `${finalCaption}\n\n${hashtagString}` : hashtagString;
    }

    console.log('[PublishInstagram] Caption length:', finalCaption.length);

    // Validation de la caption (Instagram limite à 2200 caractères)
    if (finalCaption.length > 2200) {
      return NextResponse.json(
        { ok: false, error: 'Description trop longue. Instagram limite les descriptions à 2200 caractères maximum.' },
        { status: 400 }
      );
    }

    // Validation de l'URL de l'image
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      return NextResponse.json(
        { ok: false, error: 'URL de l\'image invalide. L\'image doit être accessible via HTTP/HTTPS.' },
        { status: 400 }
      );
    }

    // Publier sur Instagram
    const result = await publishImageToInstagram(
      profile.instagram_business_account_id,
      profile.instagram_access_token,
      imageUrl,
      finalCaption
    );

    console.log('[PublishInstagram] ✅ Published successfully:', result.id);

    // Sauvegarder le post dans la table instagram_posts (nouveau schema)
    const { error: insertError } = await supabase
      .from('instagram_posts')
      .insert({
        id: result.id, // ID du post Instagram (TEXT)
        user_id: user.id,
        caption: finalCaption,
        permalink: result.permalink || `https://www.instagram.com/p/${result.id}/`,
        media_type: 'IMAGE',
        posted_at: new Date().toISOString(),
        original_media_url: imageUrl,
        cached_media_url: imageUrl, // URL de l'image publiée
        synced_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('[PublishInstagram] Error saving post to database:', insertError);
      console.error('[PublishInstagram] Insert error details:', JSON.stringify(insertError, null, 2));
      // Ne pas retourner d'erreur car la publication a réussi
    } else {
      console.log('[PublishInstagram] ✅ Post saved to database');
    }

    return NextResponse.json({
      ok: true,
      post: {
        id: result.id,
        permalink: result.permalink
      }
    });

  } catch (error: any) {
    console.error('[PublishInstagram] ❌ Unexpected error:', error);

    // Parser les erreurs Meta Graph API
    let errorMessage = error.message || 'Erreur lors de la publication';

    try {
      const errorData = JSON.parse(error.message);
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;

        // Messages d'erreur plus clairs pour l'utilisateur
        if (errorMessage.includes('Invalid image')) {
          errorMessage = 'Image invalide. Assurez-vous que l\'image est accessible publiquement et au format JPG/PNG.';
        } else if (errorMessage.includes('expired')) {
          errorMessage = 'Token Instagram expiré. Reconnectez votre compte Instagram.';
        } else if (errorMessage.includes('permission')) {
          errorMessage = 'Permissions insuffisantes. Reconnectez votre compte Instagram avec toutes les permissions nécessaires.';
        } else if (errorMessage.includes('too many')) {
          errorMessage = 'Trop de publications en peu de temps. Instagram limite le nombre de posts. Réessayez dans quelques minutes.';
        }
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
