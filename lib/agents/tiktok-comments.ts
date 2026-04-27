/**
 * Axel — TikTok comment auto-reply helper.
 *
 * Mirrors Jade (instagram-comments) but uses TikTok's API endpoints:
 *   - GET  /v2/research/user/info/  — profile snapshot of commenter
 *     (Research API — only available to apps approved for it; we
 *     fall back to bare commenter username when not).
 *   - GET  /v2/video/comment/list/  — fetch comments on user's videos
 *   - POST /v2/video/comment/reply/ — post reply
 *
 * Required scopes: comment.list + comment.list.manage. We added
 * those to the OAuth flow (tiktok-oauth) — clients have to re-auth
 * to grant them. Until granted, this module only QUEUES comments
 * for manual reply via the dashboard rather than posting.
 *
 * Profile snapshot: TikTok Display API doesn't expose other users'
 * bios at the precision Instagram does. We do best-effort: pull
 * username + display_name + bio_description from the comment payload
 * (TikTok includes some user fields inline). Vision read on a
 * thumbnail is possible if media_url exposed but generally NOT.
 */

export interface TtCommenter {
  username: string;
  display_name?: string;
  bio_description?: string;
  avatar_url?: string;
  follower_count?: number;
  is_verified?: boolean;
}

export interface TtComment {
  id: string;
  text: string;
  create_time?: number;          // unix seconds
  reply_count?: number;
  like_count?: number;
  // Author block
  author: TtCommenter;
}

/**
 * Fetch comments on a single TikTok video. Caller passes the access
 * token + the video id (TikTok's, not ours).
 *
 * Note: TikTok docs limit `max_count` to 50. The paging cursor works
 * via the `cursor` field returned in the response — we don't follow
 * pages here on purpose, comment auto-reply only handles the most
 * recent batch per cron tick.
 */
export async function fetchTtVideoComments(
  videoId: string,
  accessToken: string,
  maxCount = 30,
): Promise<{ comments: TtComment[]; cursor?: number; hasMore?: boolean }> {
  const url = `https://open.tiktokapis.com/v2/video/comment/list/?max_count=${Math.min(50, Math.max(1, maxCount))}&video_id=${encodeURIComponent(videoId)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn('[Axel] comment.list failed:', res.status, errBody.slice(0, 200));
      return { comments: [] };
    }
    const data = await res.json();
    const list = (data?.data?.comments || data?.data || []) as any[];
    const comments: TtComment[] = list.map(c => ({
      id: c.id || c.comment_id,
      text: String(c.text || c.content || '').trim(),
      create_time: c.create_time,
      reply_count: c.reply_count,
      like_count: c.like_count,
      author: {
        username: c.username || c.user_username || c.author?.username || '',
        display_name: c.display_name || c.author?.display_name,
        bio_description: c.bio_description || c.author?.bio_description,
        avatar_url: c.avatar_url || c.author?.avatar_url,
        follower_count: c.follower_count || c.author?.follower_count,
        is_verified: !!(c.is_verified || c.author?.is_verified),
      },
    })).filter(c => c.id && c.text && c.author.username);
    return {
      comments,
      cursor: data?.data?.cursor,
      hasMore: !!data?.data?.has_more,
    };
  } catch (e: any) {
    console.warn('[Axel] comment.list error:', e?.message);
    return { comments: [] };
  }
}

/**
 * Post a reply to a TikTok comment. Returns the new comment id on
 * success, or null on failure (caller falls back to manual queue).
 *
 * Requires comment.list.manage scope. If the user hasn't granted it,
 * the request returns 403 — we surface this to the queue so the
 * dashboard can show a 'reauth' nudge.
 */
export async function replyTtComment(
  videoId: string,
  parentCommentId: string,
  text: string,
  accessToken: string,
): Promise<{ ok: true; comment_id: string } | { ok: false; reason: string }> {
  if (!text || text.trim().length === 0) return { ok: false, reason: 'empty_text' };
  if (text.length > 150) text = text.slice(0, 150);    // TT comment cap

  try {
    const res = await fetch('https://open.tiktokapis.com/v2/video/comment/reply/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_id: videoId,
        parent_comment_id: parentCommentId,
        text,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const reason = res.status === 401 || res.status === 403
        ? 'scope_missing'
        : `http_${res.status}`;
      console.warn('[Axel] comment.reply failed:', reason, errBody.slice(0, 200));
      return { ok: false, reason };
    }
    const data = await res.json();
    const id = data?.data?.comment?.id || data?.data?.id;
    if (!id) return { ok: false, reason: 'no_id_in_response' };
    return { ok: true, comment_id: id };
  } catch (e: any) {
    return { ok: false, reason: `error:${e?.message?.slice(0, 80) || 'unknown'}` };
  }
}

/**
 * Format the commenter's bio + counts as a short prompt block so
 * Axel's reply can be personalised. Mirrors the Jade DM
 * snapshotToPromptContext function but with the limited data
 * TikTok exposes via the comment payload.
 */
export function ttCommenterToPromptContext(c: TtCommenter): string {
  const lines: string[] = [];
  lines.push(`Profil TikTok @${c.username}${c.is_verified ? ' (vérifié)' : ''} :`);
  if (c.display_name) lines.push(`- Nom affiché : ${c.display_name}`);
  if (c.bio_description) lines.push(`- Bio : "${c.bio_description.slice(0, 240)}"`);
  if (typeof c.follower_count === 'number') lines.push(`- Abonnés : ${c.follower_count}`);
  return lines.join('\n');
}
