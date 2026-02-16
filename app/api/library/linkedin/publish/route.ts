import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';
import {
  publishLinkedInTextPost,
  uploadLinkedInImage,
  publishLinkedInImagePost,
  uploadLinkedInVideo,
  publishLinkedInVideoPost,
} from '@/lib/linkedin';

/**
 * POST /api/library/linkedin/publish
 * Publish a LinkedIn post (text, image, or video)
 */
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const { mediaUrl, mediaType, caption, hashtags, draftId } = body;

    // Build full text with hashtags
    const hashtagText = hashtags?.length > 0 ? '\n\n' + hashtags.join(' ') : '';
    const fullText = (caption || '') + hashtagText;

    if (!fullText.trim() && mediaType === 'text-only') {
      return NextResponse.json({ error: 'Le texte du post est requis' }, { status: 400 });
    }

    // Get LinkedIn credentials from profile
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('linkedin_access_token, linkedin_user_id, linkedin_token_expiry')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profil non trouvé' }, { status: 404 });
    }

    if (!profile.linkedin_access_token || !profile.linkedin_user_id) {
      return NextResponse.json({
        error: 'LinkedIn non connecté. Veuillez connecter votre compte LinkedIn.'
      }, { status: 400 });
    }

    // Check token expiry
    if (profile.linkedin_token_expiry) {
      const expiry = new Date(profile.linkedin_token_expiry);
      if (expiry < new Date()) {
        return NextResponse.json({
          error: 'Votre token LinkedIn a expiré. Veuillez reconnecter votre compte LinkedIn.'
        }, { status: 401 });
      }
    }

    const accessToken = profile.linkedin_access_token;
    const authorUrn = profile.linkedin_user_id;

    console.log('[LinkedInPublish] Publishing post, mediaType:', mediaType);

    let result;

    switch (mediaType) {
      case 'text-only': {
        result = await publishLinkedInTextPost(accessToken, authorUrn, fullText);
        break;
      }
      case 'image': {
        if (!mediaUrl) {
          return NextResponse.json({ error: 'URL de l\'image requise' }, { status: 400 });
        }
        const imageUrn = await uploadLinkedInImage(accessToken, authorUrn, mediaUrl);
        result = await publishLinkedInImagePost(accessToken, authorUrn, fullText, imageUrn);
        break;
      }
      case 'video': {
        if (!mediaUrl) {
          return NextResponse.json({ error: 'URL de la vidéo requise' }, { status: 400 });
        }
        const videoUrn = await uploadLinkedInVideo(accessToken, authorUrn, mediaUrl);
        result = await publishLinkedInVideoPost(accessToken, authorUrn, fullText, videoUrn);
        break;
      }
      default:
        return NextResponse.json({ error: `Type de média non supporté: ${mediaType}` }, { status: 400 });
    }

    // Update draft status to published if draftId provided
    if (draftId) {
      await supabase
        .from('linkedin_drafts')
        .update({ status: 'published', category: 'published' })
        .eq('id', draftId)
        .eq('user_id', user.id);
    }

    console.log('[LinkedInPublish] Post published successfully');

    return NextResponse.json({ ok: true, post: result });

  } catch (error: any) {
    console.error('[LinkedInPublish] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Erreur lors de la publication' },
      { status: 500 }
    );
  }
}
