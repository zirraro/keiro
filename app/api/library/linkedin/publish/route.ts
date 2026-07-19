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
import { mirrorToShowcaseAccount } from '@/lib/agents/showcase-mirror';

export const runtime = 'edge';

/**
 * POST /api/library/linkedin/publish
 * Publish a LinkedIn post (text, image, or video)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mediaUrl, mediaType, caption, hashtags, draftId, _scheduledPublish, _userId } = body;

    // --- Auth: scheduled publish from cron OR normal user auth ---
    let userId: string | null = null;

    if (_scheduledPublish && _userId) {
      const cronSecret = process.env.CRON_SECRET;
      const authHeader = req.headers.get('authorization');
      if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        userId = _userId;
        console.log('[LinkedInPublish] Scheduled publish for user:', userId);
      }
    }

    if (!userId) {
      const { user, error: authError } = await getAuthUser();
      if (authError || !user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
      }
      userId = user.id;
    }

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
      .eq('id', userId)
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

    let result: any;
    try {
      switch (mediaType) {
        case 'text-only': {
          result = await publishLinkedInTextPost(accessToken, authorUrn, fullText);
          break;
        }
        case 'image': {
          if (!mediaUrl) {
            return NextResponse.json({ ok: false, error: 'URL de l\'image requise' }, { status: 400 });
          }
          const imageUrn = await uploadLinkedInImage(accessToken, authorUrn, mediaUrl);
          result = await publishLinkedInImagePost(accessToken, authorUrn, fullText, imageUrn);
          break;
        }
        case 'video': {
          if (!mediaUrl) {
            return NextResponse.json({ ok: false, error: 'URL de la vidéo requise' }, { status: 400 });
          }
          const videoUrn = await uploadLinkedInVideo(accessToken, authorUrn, mediaUrl);
          result = await publishLinkedInVideoPost(accessToken, authorUrn, fullText, videoUrn);
          break;
        }
        default:
          return NextResponse.json({ ok: false, error: `Type de média non supporté: ${mediaType}` }, { status: 400 });
      }
    } catch (publishErr: any) {
      const rawErr = String(publishErr?.message || '');
      let friendly: string | null = null;
      if (/401|unauthor|invalid[_ ]?token|access[_ ]?token/i.test(rawErr)) {
        friendly = 'Le token LinkedIn a expiré ou a été révoqué. Reconnecte ton compte LinkedIn depuis Léna → LinkedIn → Reconnecter.';
      } else if (/403|forbidden|insufficient[_ ]?scope/i.test(rawErr)) {
        friendly = 'Permission LinkedIn manquante (w_member_social). Reconnecte en acceptant toutes les permissions.';
      } else if (/429|rate[_ ]?limit|too[_ ]?many/i.test(rawErr)) {
        friendly = 'LinkedIn a rate-limité ton compte. Attends ~15 min avant de réessayer.';
      } else if (/text[_ ]?too[_ ]?long|exceed|max[_ ]?length/i.test(rawErr)) {
        friendly = 'Texte trop long. LinkedIn limite à 3000 caractères pour un post.';
      } else if (/image[_ ]?(size|format)|invalid[_ ]?image/i.test(rawErr)) {
        friendly = 'Image refusée par LinkedIn. Formats acceptés : JPG/PNG/GIF, max 7 MB, 552×276 minimum.';
      } else if (/video[_ ]?(size|format|duration)|invalid[_ ]?video/i.test(rawErr)) {
        friendly = 'Vidéo refusée par LinkedIn. Formats acceptés : MP4/MOV, max 5 GB, 3 sec à 10 min.';
      }
      const userMessage = friendly
        ? `${friendly}\n\nMessage technique LinkedIn : ${rawErr.substring(0, 200)}`
        : `Erreur LinkedIn : ${rawErr}`;

      try {
        await supabase.from('agent_logs').insert({
          agent: 'content',
          action: 'publish_diagnostic',
          user_id: userId,
          status: 'error',
          data: {
            platform: 'linkedin',
            media_type: mediaType,
            error_preview: rawErr.substring(0, 200),
            mapped_error: friendly || null,
            method: 'linkedin_ugc_post',
          },
        });
      } catch { /* non-fatal */ }

      throw new Error(userMessage);
    }

    // Update draft status to published if draftId provided
    if (draftId) {
      await supabase
        .from('linkedin_drafts')
        .update({ status: 'published', category: 'published' })
        .eq('id', draftId)
        .eq('user_id', userId);
    }

    // LinkedIn returns the URN of the activity (e.g. urn:li:share:123…
    // or urn:li:ugcPost:123…). Convert to the public share URL so
    // downstream UI / audit log can deep-link the post.
    const activityUrn = result?.id || result?.postId || result?.activity || result?.urn || null;
    const shareUrl = activityUrn
      ? `https://www.linkedin.com/feed/update/${encodeURIComponent(activityUrn)}/`
      : null;

    try {
      await supabase.from('agent_logs').insert({
        agent: 'content',
        action: 'publish_diagnostic',
        user_id: userId,
        status: 'success',
        data: {
          platform: 'linkedin',
          activity_urn: activityUrn,
          share_url: shareUrl,
          media_type: mediaType,
          caption_preview: fullText.substring(0, 120),
          method: 'linkedin_ugc_post',
        },
      });
    } catch { /* audit failure is non-fatal */ }

    // Showcase mirror — replicate to metareview's content_calendar
    // when mrzirraro publishes (no-op otherwise).
    await mirrorToShowcaseAccount(supabase, userId, {
      platform: 'linkedin',
      format: mediaType === 'video' ? 'video' : mediaType === 'image' ? 'post' : 'text',
      caption: fullText,
      hashtags: hashtags || [],
      visual_url: mediaUrl || '',
    }).catch(() => {});

    console.log('[LinkedInPublish] Post published successfully');

    return NextResponse.json({ ok: true, post: result, share_url: shareUrl });

  } catch (error: any) {
    console.error('[LinkedInPublish] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la publication' },
      { status: 500 }
    );
  }
}
