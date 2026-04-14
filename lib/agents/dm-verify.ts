/**
 * Instagram handle verification via business_discovery.
 *
 * Why this exists: Leo's commercial agent scrapes IG handles from Google
 * search results without checking whether they're real accounts, let alone
 * whether they're Instagram business/creator accounts (the only profile
 * types the Graph API can discover). The DM pipeline therefore piled up
 * unreachable handles — we saw 1000+ DMs stuck in `dm_queue.status='pending'`
 * because the send attempt always failed at the very first step.
 *
 * business_discovery only resolves public business/creator accounts. A
 * personal account will return nothing even if the handle is correct,
 * but that's OK for our use case — we can't message personal accounts
 * via Graph API either, so "not discoverable" is equivalent to
 * "un-reachable for automation".
 */

export interface IgVerificationResult {
  exists: boolean;
  igId?: string;
  mediaIds?: string[];
  username?: string;
  rawError?: string;
}

/**
 * Resolve an Instagram handle via business_discovery against the admin's
 * IG business account.
 *
 * @param handle        Raw handle — with or without @, slashes etc. Cleaned internally.
 * @param adminIgId     The IG business account ID making the lookup.
 * @param adminToken    IMPORTANT: must be the FACEBOOK PAGE access token, not
 *                      the instagram_access_token — business_discovery is
 *                      only exposed on graph.facebook.com, not graph.instagram.com.
 * @returns { exists: false } when the handle can't be resolved, or
 *          { exists: true, igId, mediaIds, username } when it can.
 *
 * This call is cheap (1 HTTP request) but rate-limited by Meta, so callers
 * should dedup via the `verified_at` / `verification_attempts` columns on
 * dm_queue before calling it.
 */
export async function verifyInstagramHandle(
  handle: string,
  adminIgId: string,
  adminPageToken: string,
): Promise<IgVerificationResult> {
  const cleanHandle = (handle || '')
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/\s/g, '')
    .trim()
    .toLowerCase();

  if (!cleanHandle || cleanHandle.length < 2 || cleanHandle === 'a_verifier') {
    return { exists: false, rawError: 'empty_or_placeholder_handle' };
  }

  // business_discovery is exposed on graph.facebook.com with a Page token.
  // The graph.instagram.com host does NOT support this field (throws
  // "Tried accessing nonexisting field (business_discovery)").
  const url = `https://graph.facebook.com/v21.0/${adminIgId}` +
    `?fields=business_discovery.username(${encodeURIComponent(cleanHandle)}){id,username,media.limit(3){id}}` +
    `&access_token=${encodeURIComponent(adminPageToken)}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));

    // The typical "not found" response is: { error: { code: 24, ... } } or
    // data without business_discovery at all (personal account).
    const bd = data?.business_discovery;
    if (!bd?.id) {
      const err = data?.error?.message || 'no_business_discovery';
      return { exists: false, rawError: String(err).substring(0, 200) };
    }

    const mediaIds: string[] = (bd.media?.data || [])
      .map((m: any) => m?.id)
      .filter(Boolean);

    return {
      exists: true,
      igId: bd.id,
      username: bd.username || cleanHandle,
      mediaIds,
    };
  } catch (e: any) {
    return { exists: false, rawError: (e?.message || 'fetch_error').substring(0, 200) };
  }
}
