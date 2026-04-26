import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getOwnInstagramMedia } from '@/lib/meta';
import { getTikTokVideos } from '@/lib/tiktok';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/agents/content/network-preview?network=instagram|tiktok|linkedin
 * Returns the latest published posts for the requested network so Lena's
 * "Aperçu réseaux" tab can show them with metrics + native deep links.
 *
 * Strategy per network:
 *  - instagram: live fetch from graph via getOwnInstagramMedia (IGAA-aware)
 *  - tiktok: live fetch via TikTok /v2/video/list with the stored token
 *  - linkedin: fall back to content_calendar.linkedin_permalink rows (no
 *    lightweight list endpoint on LinkedIn for our current scopes)
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Non autorise' }, { status: 401 });

  const network = (req.nextUrl.searchParams.get('network') || 'instagram').toLowerCase();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, instagram_business_account_id, instagram_igaa_token, facebook_page_access_token, tiktok_access_token, tiktok_user_id, linkedin_access_token, linkedin_user_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[NetworkPreview] Profile lookup failed:', profileError.message);
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }
  if (!profile) return NextResponse.json({ ok: false, error: 'Profil introuvable' }, { status: 404 });

  try {
    if (network === 'instagram') {
      const igUserId = profile.instagram_business_account_id;
      const token = profile.instagram_igaa_token || profile.facebook_page_access_token;
      // We only report connected:false when we have no usable credentials.
      // If credentials exist but Meta rate-limits us, we still say connected
      // (so the UI shows "Instagram connected, 0 posts loaded" instead of
      // "Instagram not connected").
      if (!igUserId || !token) return NextResponse.json({ ok: true, network, connected: false, posts: [] });
      let media: any[] = [];
      try {
        media = await getOwnInstagramMedia(igUserId, token, 12);
      } catch (e: any) {
        console.warn('[NetworkPreview] IG media fetch failed:', e.message?.slice(0, 200));
        return NextResponse.json({
          ok: true,
          network,
          connected: true,
          posts: [],
          error: e.message?.includes('request limit') ? 'rate_limited' : 'api_error',
        });
      }
      const posts = media.map(m => ({
        id: m.id,
        caption: m.caption?.slice(0, 240) || '',
        media_url: m.media_url,
        media_type: m.media_type,
        permalink: m.permalink,
        timestamp: m.timestamp,
        metrics: {
          likes: m.like_count ?? null,
          comments: m.comments_count ?? null,
          reach: m.reach ?? null,
          impressions: m.impressions ?? null,
          saved: m.saved ?? null,
        },
      }));

      // ── DELETION DETECTION ──
      // Posts we marked 'published' but IG doesn't return = deleted on
      // the platform side (via the IG app). We mark them as
      // 'deleted_on_ig' so subject rotation / asset reuse / dissatisfaction
      // queries exclude them from strategy. Archive only on our side —
      // not a hard delete.
      try {
        const livePermalinks = new Set(media.map(m => m.permalink).filter(Boolean));
        const liveIds = new Set(media.map(m => m.id).filter(Boolean));
        // Pull recent (last 60 days) published rows for this user
        const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString();
        const { data: ourPublished } = await supabase
          .from('content_calendar')
          .select('id, instagram_permalink, scheduled_date')
          .eq('user_id', user.id)
          .eq('platform', 'instagram')
          .eq('status', 'published')
          .gte('scheduled_date', sixtyDaysAgo)
          .not('instagram_permalink', 'is', null)
          .limit(200);
        if (ourPublished && ourPublished.length > 0) {
          // We only act when IG returned a non-empty list — otherwise we'd
          // false-positive on rate-limits. Also require IG returned ≥3 to
          // be confident the list is healthy.
          if (media.length >= 3) {
            const goneOnIG = ourPublished.filter((row: any) => {
              const pl = row.instagram_permalink;
              if (!pl) return false;
              return !livePermalinks.has(pl);
            });
            if (goneOnIG.length > 0) {
              const ids = goneOnIG.map((r: any) => r.id);
              await supabase
                .from('content_calendar')
                .update({
                  status: 'deleted_on_ig',
                  publish_diagnostic: 'detected_deleted_on_platform_via_network_preview',
                  updated_at: new Date().toISOString(),
                })
                .in('id', ids);
              console.log(`[NetworkPreview] Detected ${goneOnIG.length} IG-side deletions for user ${user.id.slice(0, 8)}`);
            }
          }
        }
      } catch (delErr: any) {
        console.warn('[NetworkPreview] deletion detection failed:', delErr?.message);
      }

      return NextResponse.json({ ok: true, network, connected: true, posts });
    }

    if (network === 'tiktok') {
      const token = profile.tiktok_access_token;
      if (!token) return NextResponse.json({ ok: true, network, connected: false, posts: [] });
      const videos = await getTikTokVideos(token, 12).catch(e => {
        console.warn('[NetworkPreview] TikTok fetch error:', e.message?.slice(0, 200));
        return [];
      });
      const posts = videos.map(v => ({
        id: v.id,
        caption: v.title || v.video_description || '',
        media_url: v.cover_image_url,
        media_type: 'VIDEO',
        permalink: v.share_url,
        timestamp: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
        metrics: {
          views: v.view_count ?? null,
          likes: v.like_count ?? null,
          comments: v.comment_count ?? null,
          shares: v.share_count ?? null,
        },
      }));
      return NextResponse.json({ ok: true, network, connected: true, posts });
    }

    if (network === 'linkedin') {
      if (!profile.linkedin_access_token) return NextResponse.json({ ok: true, network, connected: false, posts: [] });
      // LinkedIn's scoped v2 API doesn't expose a generic list for our scopes —
      // read back from content_calendar where we persisted linkedin permalinks.
      const { data: rows } = await supabase
        .from('content_calendar')
        .select('id, hook, caption, visual_url, published_at, scheduled_date, linkedin_user_id, instagram_permalink, tiktok_permalink')
        .eq('user_id', user.id)
        .eq('platform', 'linkedin')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(12);
      const posts = (rows || []).map(r => ({
        id: r.id,
        caption: (r.caption || r.hook || '').slice(0, 240),
        media_url: r.visual_url,
        media_type: 'POST',
        permalink: r.linkedin_user_id
          ? `https://www.linkedin.com/feed/update/urn:li:activity:${r.linkedin_user_id}/`
          : null,
        timestamp: r.published_at || r.scheduled_date,
        metrics: {},
      }));
      return NextResponse.json({ ok: true, network, connected: true, posts });
    }

    return NextResponse.json({ ok: false, error: `Unknown network: ${network}` }, { status: 400 });
  } catch (e: any) {
    console.error('[NetworkPreview] Error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
