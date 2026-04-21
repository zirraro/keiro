/**
 * Rich Instagram profile snapshot via business_discovery.
 *
 * Where verifyInstagramHandle just answers "does this account exist?",
 * this helper returns everything Jade needs to write a DM that proves
 * she actually looked at the profile — biography, website, recent post
 * captions, engagement counts.
 *
 * Usage pattern: call right before generating/sending a DM or reply.
 * The response is designed to be fed directly into an AI system prompt.
 *
 * Important: business_discovery is only exposed on graph.facebook.com
 * with a Page access token. IGAA tokens on graph.instagram.com reject
 * this field with "Tried accessing nonexisting field (business_discovery)".
 */

export interface IgProfileSnapshotPost {
  id: string;
  caption: string;       // trimmed to ~200 chars
  like_count: number;
  comments_count: number;
  timestamp?: string;
  media_type?: string;
  permalink?: string;
}

export interface IgProfileSnapshot {
  exists: boolean;
  username?: string;
  biography?: string;
  website?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  profile_picture_url?: string;
  recent_posts: IgProfileSnapshotPost[];
  canLikelyReceiveDm: boolean;
  rawError?: string;
}

/**
 * Fetch a deep snapshot of a public IG business/creator account.
 *
 * @param handle   Raw handle — @ and urls stripped automatically.
 * @param ourIgId  The client's (or admin's) IG business account ID used
 *                 as the looker-upper in business_discovery.
 * @param ourToken Facebook Page access token paired with ourIgId.
 */
export async function getInstagramProfileSnapshot(
  handle: string,
  ourIgId: string,
  ourToken: string,
): Promise<IgProfileSnapshot> {
  const clean = (handle || '')
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/\s/g, '')
    .trim()
    .toLowerCase();

  if (!clean || clean.length < 2 || clean === 'a_verifier') {
    return { exists: false, recent_posts: [], canLikelyReceiveDm: false, rawError: 'empty_handle' };
  }

  // Deep field set: profile meta + last 5 posts. business_discovery returns
  // these in a single request, so this is one HTTP round-trip per prospect.
  const mediaFields = 'id,caption,like_count,comments_count,timestamp,media_type,permalink';
  const bdFields = [
    'id',
    'username',
    'biography',
    'website',
    'followers_count',
    'follows_count',
    'media_count',
    'profile_picture_url',
    `media.limit(5){${mediaFields}}`,
  ].join(',');

  const url = `https://graph.facebook.com/v21.0/${ourIgId}` +
    `?fields=business_discovery.username(${encodeURIComponent(clean)}){${bdFields}}` +
    `&access_token=${encodeURIComponent(ourToken)}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    const bd = data?.business_discovery;

    if (!bd?.id) {
      const err = data?.error?.message || 'no_business_discovery';
      return {
        exists: false,
        recent_posts: [],
        canLikelyReceiveDm: false,
        rawError: String(err).substring(0, 200),
      };
    }

    const rawPosts = (bd.media?.data || []) as any[];
    const posts: IgProfileSnapshotPost[] = rawPosts.map(p => ({
      id: p.id,
      caption: String(p.caption || '').substring(0, 200).trim(),
      like_count: typeof p.like_count === 'number' ? p.like_count : 0,
      comments_count: typeof p.comments_count === 'number' ? p.comments_count : 0,
      timestamp: p.timestamp,
      media_type: p.media_type,
      permalink: p.permalink,
    }));

    const followers = typeof bd.followers_count === 'number' ? bd.followers_count : undefined;
    const media = typeof bd.media_count === 'number' ? bd.media_count : undefined;

    return {
      exists: true,
      username: bd.username || clean,
      biography: bd.biography || undefined,
      website: bd.website || undefined,
      followers_count: followers,
      follows_count: typeof bd.follows_count === 'number' ? bd.follows_count : undefined,
      media_count: media,
      profile_picture_url: bd.profile_picture_url || undefined,
      recent_posts: posts,
      canLikelyReceiveDm: (followers ?? 0) > 5 && (media ?? 0) > 2,
    };
  } catch (e: any) {
    return {
      exists: false,
      recent_posts: [],
      canLikelyReceiveDm: false,
      rawError: (e?.message || 'fetch_error').substring(0, 200),
    };
  }
}

/**
 * Format the snapshot as a tight text block for the AI system prompt.
 * Intentionally terse so it doesn't dominate the prompt and fits under
 * the token budget even when we add other context.
 */
export function snapshotToPromptContext(snap: IgProfileSnapshot): string {
  if (!snap.exists) {
    return `PROFIL INSTAGRAM @${snap.username || '?'} : introuvable via business_discovery (peut être un compte perso ou privé).`;
  }

  const lines: string[] = [];
  lines.push(`PROFIL INSTAGRAM @${snap.username} (analysé à l'instant via business_discovery) :`);
  if (snap.biography) lines.push(`- Bio : "${snap.biography.substring(0, 300)}"`);
  if (snap.website) lines.push(`- Site : ${snap.website}`);
  const stats = [
    typeof snap.followers_count === 'number' ? `${snap.followers_count} abonnés` : null,
    typeof snap.media_count === 'number' ? `${snap.media_count} posts` : null,
  ].filter(Boolean).join(' · ');
  if (stats) lines.push(`- Activité : ${stats}`);

  if (snap.recent_posts.length > 0) {
    lines.push(`- 5 derniers posts (plus récents en premier) :`);
    for (const p of snap.recent_posts) {
      const caption = p.caption ? `"${p.caption}"` : '(sans légende)';
      const engagement = `${p.like_count} likes, ${p.comments_count} commentaires`;
      lines.push(`  • ${caption} [${engagement}]`);
    }
  } else {
    lines.push(`- Aucun post récent disponible.`);
  }

  if (!snap.canLikelyReceiveDm) {
    lines.push(`- ⚠️ Compte peu actif (peu de followers ou peu de posts) — DM pourrait rester sans réponse.`);
  }

  return lines.join('\n');
}
