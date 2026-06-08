/**
 * Detect posts the client deleted on Instagram / TikTok and feed the
 * negative signal back to Léna.
 *
 * Founder ask 2026-06-08: "il faudrait aussi si possible detecter sur
 * insta ou tiktok si le client keiro a supprimer le posts c'est qu il
 * ne lui plait pas et donc essayé de comprendre ce qu ne vas pas et
 * ameliorer pour les prochaines generations/post".
 *
 * Logic:
 *   1. For every content_calendar row with status='published' and a
 *      platform-side id (instagram_permalink / tiktok_publish_id), ask
 *      the platform if the post still exists.
 *   2. If gone → status='deleted_on_platform' + log a dissatisfaction
 *      signal into agent_knowledge with category='client_deleted_post'
 *      so Léna's next generation prompt warns her about it.
 *
 * Schedule: 4× per day. Cheap (count of published posts × 1 fetch each).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function authOk(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const tok = auth.replace(/^Bearer\s+/i, '');
  return !!tok && tok === (process.env.CRON_SECRET || '');
}

async function isInstagramPostDeleted(permalink: string, igAccessToken: string | null): Promise<boolean | null> {
  // Without a token we can't reliably probe; just do a HEAD on the
  // permalink to see if it 404s.
  try {
    const res = await fetch(permalink, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    if (res.status === 404 || res.status === 410) return true;
    return false;
  } catch {
    return null;
  }
}

async function isTikTokVideoDeleted(publishId: string, ttToken: string | null): Promise<boolean | null> {
  if (!ttToken) return null;
  try {
    // Query the publish status — if the upstream returns FAILED or
    // VIDEO_DELETED, mark as deleted.
    const res = await fetch(`https://open.tiktokapis.com/v2/post/publish/status/fetch/?publish_id=${encodeURIComponent(publishId)}`, {
      headers: { 'Authorization': `Bearer ${ttToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const status = data?.data?.status;
    if (status && (status === 'VIDEO_DELETED' || status === 'PUBLISH_FAILED' || status === 'FAILED')) return true;
    return false;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const supabase = sb();

  // Pull recent published posts that we haven't already flagged
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: published } = await supabase
    .from('content_calendar')
    .select('id, user_id, platform, hook, caption, pillar, format, instagram_permalink, tiktok_publish_id, status, published_at')
    .eq('status', 'published')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(500);

  if (!published || published.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, deleted: 0 });
  }

  let checked = 0;
  let deletedCount = 0;
  const deletedPosts: any[] = [];

  // We don't have TT token in a single fetch per user — group by user
  // so we only pull tokens once per user.
  const userIds = [...new Set(published.map((p: any) => p.user_id).filter(Boolean))] as string[];
  const tokensByUser = new Map<string, { ig: string | null; tt: string | null }>();

  for (const uid of userIds) {
    let igTok: string | null = null;
    let ttTok: string | null = null;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('instagram_access_token, tiktok_access_token')
        .eq('id', uid)
        .maybeSingle();
      igTok = profile?.instagram_access_token || null;
      ttTok = profile?.tiktok_access_token || null;
    } catch { /* swallow */ }
    tokensByUser.set(uid, { ig: igTok, tt: ttTok });
  }

  for (const post of published as any[]) {
    checked++;
    const toks = tokensByUser.get(post.user_id) || { ig: null, tt: null };
    let deleted: boolean | null = null;

    if (post.platform === 'instagram' && post.instagram_permalink) {
      deleted = await isInstagramPostDeleted(post.instagram_permalink, toks.ig);
    } else if (post.platform === 'tiktok' && post.tiktok_publish_id) {
      deleted = await isTikTokVideoDeleted(post.tiktok_publish_id, toks.tt);
    }

    if (deleted === true) {
      deletedCount++;
      deletedPosts.push(post);
      // Flip status so Léna's dissatisfaction signal layer picks it up.
      await supabase
        .from('content_calendar')
        .update({ status: 'deleted_on_platform', deleted_detected_at: new Date().toISOString() })
        .eq('id', post.id);

      // Feed the negative pattern to Léna's knowledge layer.
      const summary = `Post supprimé par le client (${post.platform}, ${post.format || 'post'}, pillar=${post.pillar || '?'}). Hook : "${(post.hook || '').substring(0, 140)}". Léna : tire les leçons — évite cette combinaison hook+pillar+format dans les 14 prochains jours pour ce client.`;
      try {
        await supabase.from('agent_knowledge').insert({
          agent: 'content',
          category: 'client_deleted_post',
          content: summary,
          summary: `[${post.platform}] Deleted post — pillar=${post.pillar || '?'}, format=${post.format || '?'}`,
          confidence: 0.85,
          source: 'detect-deleted-posts',
          created_by: 'cron',
        });
      } catch { /* table may not exist or RLS */ }
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    deleted: deletedCount,
    posts: deletedPosts.map((p) => ({ id: p.id, platform: p.platform, hook: p.hook?.substring(0, 80) })),
  });
}
