import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { publishImageToInstagram } from '@/lib/meta';
import { mirrorToShowcaseAccount } from '@/lib/agents/showcase-mirror';
import { preflightPublish } from '@/lib/meta/publish-guard';
import { canPublishNow } from '@/lib/meta/publish-rate-limit';
import { getSchedulingState, recordPublishError } from '@/lib/meta/scheduling-state';
import { bumpInstagramInsights } from '@/lib/meta/insights-shared';

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

    // Clone request to read body (needed for both auth paths)
    const body = await req.json();
    const { imageUrl, caption, hashtags, _scheduledPublish, _userId } = body;

    // --- Auth: scheduled publish from cron OR normal user auth ---
    let userId: string | null = null;

    if (_scheduledPublish && _userId) {
      // Cron-triggered scheduled publish: verify CRON_SECRET
      const cronSecret = process.env.CRON_SECRET;
      const authHeader = req.headers.get('authorization');
      if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        userId = _userId;
        console.log('[PublishInstagram] Scheduled publish for user:', userId);
      }
    }

    if (!userId) {
      // Normal user auth via cookies or Bearer token
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
      userId = user.id;
    }

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: 'Image URL manquante' },
        { status: 400 }
      );
    }

    console.log('[PublishInstagram] Publishing to Instagram...', {
      userId,
      imageUrl: imageUrl.substring(0, 50)
    });

    // Récupérer les informations Instagram de l'utilisateur
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, instagram_username')
      .eq('id', userId)
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

    // SCHEDULING AUTO-PAUSE — if a recent 4xx tripped the per-user
    // auto-pause flag, refuse the publish until the owner reconnects
    // (or admin manually resumes). Protects KeiroAI from racking up
    // more 4xx errors on a token Meta already rejected once.
    {
      const state = await getSchedulingState(supabase, userId);
      if (state.paused) {
        return NextResponse.json(
          {
            ok: false,
            error: `Scheduling en pause pour ce compte — ${state.reason || 'reconnecte Instagram'}.`,
            guard: 'scheduling_paused',
          },
          { status: 423 },
        );
      }
    }

    // RATE LIMIT — max 4 publishes / 24h / network, min 90 min spacing.
    // Stays well under Meta's tolerance ceilings to keep the app
    // permission safe.
    {
      const rate = await canPublishNow(supabase, userId, 'instagram');
      if (!rate.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: rate.reason,
            guard: rate.diagnosticTag,
            nextAllowedAt: rate.nextAllowedAt,
          },
          { status: 429 },
        );
      }
    }

    // PRE-PUBLISH GUARDS — 3 protections (16-17 mai 2026):
    //   1. retry lockout (5 min) — block double-fire from cron/server
    //   2. cross-format dedup (7 days) — same image not republished
    //      as post + story on same network
    //   3. stale holiday reference — block "Saint-Valentin" in May
    {
      const guard = await preflightPublish(supabase, {
        userId,
        imageUrl,
        caption: finalCaption,
        network: 'instagram',
      });
      if (!guard.ok) {
        // Log the refusal so /meta-audit shows it as a guard hit
        try {
          await supabase.from('agent_logs').insert({
            agent: 'content',
            action: 'publish_diagnostic',
            user_id: userId,
            status: guard.retryDuplicate ? 'success' : 'error',
            data: {
              platform: 'instagram',
              image_url: imageUrl,
              caption_preview: finalCaption.substring(0, 120),
              guard: guard.diagnosticTag,
              reason: guard.reason,
              method: 'publish_guard_refusal',
            },
          });
        } catch { /* non-fatal */ }
        return NextResponse.json(
          { ok: guard.retryDuplicate || false, error: guard.reason, guard: guard.diagnosticTag },
          { status: guard.retryDuplicate ? 200 : 409 },
        );
      }
    }

    // Publier sur Instagram. On wrap dans un try/catch dédié pour
    // intercepter les 4xx du Graph API et tripper l'auto-pause — sans
    // ça, un token révoqué côté Meta nous ferait spam la Graph API et
    // augmenterait le risque de revocation de la permission.
    let result: { id: string; permalink?: string };
    try {
      result = await publishImageToInstagram(
        profile.instagram_business_account_id,
        profile.instagram_access_token,
        imageUrl,
        finalCaption
      );
    } catch (publishError: any) {
      const msg = String(publishError?.message || publishError || '');
      const httpMatch = msg.match(/(\d{3})/);
      const httpStatus = httpMatch ? parseInt(httpMatch[1], 10) : 0;
      await recordPublishError(supabase, {
        userId,
        network: 'instagram',
        httpStatus,
        error: msg,
        endpoint: '/media + /media_publish',
      });
      throw publishError; // let the outer catch format the response
    }

    console.log('[PublishInstagram] ✅ Published successfully:', result.id);

    // Sauvegarder le post dans la table instagram_posts (nouveau schema)
    const { error: insertError } = await supabase
      .from('instagram_posts')
      .insert({
        id: result.id, // ID du post Instagram (TEXT)
        user_id: userId,
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

    // Audit log — every successful publish leaves a trail visible in
    // /meta-audit under the instagram_business_content_publish tag.
    // The action name matches what actionMeta() in the audit page maps
    // to a WRITE on content_publish.
    try {
      await supabase.from('agent_logs').insert({
        agent: 'content',
        action: 'publish_diagnostic',
        user_id: userId,
        status: 'success',
        data: {
          ig_post_id: result.id,
          permalink: result.permalink,
          caption_preview: finalCaption.substring(0, 120),
          method: 'graph_api_media_publish',
        },
      });
    } catch { /* audit failure is non-fatal */ }

    // Refresh the cached IG stats (media_count, followers) immediately
    // so Léna + AMI dashboards reflect the new publish on the next load.
    // Fire-and-forget — the response shouldn't wait on the Graph fetch.
    bumpInstagramInsights(supabase, userId).catch(() => {});

    // Showcase mirror — if the showcase account just published, also
    // create a content_calendar row for the metareview account so the
    // reviewer's content workspace stays populated with real posts.
    // No-op for any other user. Silent on failure.
    await mirrorToShowcaseAccount(supabase, userId, {
      platform: 'instagram',
      format: 'post',
      caption: finalCaption,
      hashtags: hashtags || [],
      visual_url: imageUrl,
    }).catch(() => {});

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
