/**
 * Pre-publish guards for the social network publish routes.
 *
 * Three protections, all required by the founder (16-17 mai 2026):
 *
 *  1. CROSS-FORMAT DEDUP — the same image must not be published twice
 *     on the same network in a short window, regardless of format
 *     (post vs story vs reel vs carrousel). Founder rule: "il ne faut
 *     pas publier en doublon le meme post ou la meme image sur le
 *     meme reseau social en post et story".
 *
 *  2. RETRY IDEMPOTENCE — when a cron/server/agent retries the same
 *     publish intent, the second call must NOT produce a duplicate
 *     publication. Founder rule: "n'y meme publier 2 fois d'affile
 *     par erreur de cron agent ou de serveur".
 *
 *  3. DATE RELEVANCE — don't publish posts referring to past dated
 *     events (Saint-Valentin in May, etc.). Founder rule: "attention
 *     au calendrier, il a recemment publier pour la st valentin c'est
 *     passé".
 *
 * All checks return early with a clear reason so the publish route
 * can refuse politely and log the diagnostic.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PublishGuardResult {
  ok: boolean;
  reason?: string;
  diagnosticTag?: string; // for /meta-audit
  retryDuplicate?: boolean; // true when caller should treat this as "already done, return success"
}

/**
 * Look back N days on the user's published media tables to see if the
 * given image URL was already published, regardless of format. Looks
 * at both instagram_posts (real publishes) and content_calendar
 * (status=published).
 */
export async function wasRecentlyPublished(
  supabase: SupabaseClient,
  userId: string,
  imageUrl: string,
  network: 'instagram' | 'tiktok' | 'linkedin' = 'instagram',
  daysBack: number = 7,
): Promise<PublishGuardResult> {
  if (!imageUrl) return { ok: true };

  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();

  // 1. Recent instagram_posts row that referenced this image
  if (network === 'instagram') {
    try {
      const { data: igMatch } = await supabase
        .from('instagram_posts')
        .select('id, posted_at, media_type, permalink')
        .eq('user_id', userId)
        .or(`cached_media_url.eq.${imageUrl},original_media_url.eq.${imageUrl}`)
        .gte('posted_at', since)
        .order('posted_at', { ascending: false })
        .limit(1);
      if (igMatch && igMatch.length > 0) {
        const m = igMatch[0];
        return {
          ok: false,
          reason: `Cette image a déjà été publiée sur Instagram (${m.media_type || 'post'}) le ${new Date(m.posted_at).toLocaleDateString()}.`,
          diagnosticTag: 'duplicate_image_instagram',
          retryDuplicate: true,
        };
      }
    } catch { /* table may not exist on fresh installs */ }
  }

  // 2. content_calendar row marked published with same visual_url —
  //    catches cross-network and any cached pipeline dupes.
  try {
    const { data: ccMatch } = await supabase
      .from('content_calendar')
      .select('id, published_at, platform, format')
      .eq('user_id', userId)
      .eq('platform', network)
      .eq('visual_url', imageUrl)
      .eq('status', 'published')
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(1);
    if (ccMatch && ccMatch.length > 0) {
      const m = ccMatch[0];
      return {
        ok: false,
        reason: `Cette image a déjà été publiée sur ${network} en ${m.format || 'post'} le ${new Date(m.published_at).toLocaleDateString()}.`,
        diagnosticTag: 'duplicate_image_calendar',
        retryDuplicate: true,
      };
    }
  } catch { /* non-fatal */ }

  return { ok: true };
}

/**
 * Detect a same-intent retry happening within the lockout window.
 * Uses agent_logs publish_diagnostic rows as the source of truth:
 * if the SAME image URL appears in a success log within the last
 * 5 minutes for this user, the second call is almost certainly a
 * retry and should refuse.
 */
export async function isRetryWithinLockout(
  supabase: SupabaseClient,
  userId: string,
  imageUrl: string,
  network: 'instagram' | 'tiktok' | 'linkedin' = 'instagram',
  lockoutSeconds: number = 300,
): Promise<PublishGuardResult> {
  if (!imageUrl) return { ok: true };
  const since = new Date(Date.now() - lockoutSeconds * 1000).toISOString();
  try {
    const { data } = await supabase
      .from('agent_logs')
      .select('id, created_at, data')
      .eq('user_id', userId)
      .eq('agent', 'content')
      .eq('action', 'publish_diagnostic')
      .eq('status', 'success')
      .gte('created_at', since)
      .limit(20);
    if (!data) return { ok: true };
    const match = data.find(row => {
      const d = row?.data as any;
      const sameUrl = d?.image_url === imageUrl
        || d?.cached_media_url === imageUrl
        || d?.media_url === imageUrl
        || d?.visual_url === imageUrl;
      const samePlatform = !d?.platform || d.platform === network;
      return sameUrl && samePlatform;
    });
    if (match) {
      return {
        ok: false,
        reason: `Un retry détecté — cette image vient d'être publiée il y a moins de ${lockoutSeconds}s sur ${network}.`,
        diagnosticTag: 'retry_within_lockout',
        retryDuplicate: true,
      };
    }
  } catch { /* non-fatal */ }
  return { ok: true };
}

/**
 * Quick keyword check that blocks publishing posts referring to a
 * dated holiday/event that's already passed. Sonnet is supposed to
 * avoid this at generation time (content-prompt.ts TEMPORALITÉ rule)
 * but it drifts — this is the safety net at publish time.
 *
 * Recognises French + English holiday keywords. False positives are
 * extremely cheap (founder can disable by removing the keyword from
 * the caption), false negatives are expensive (a Saint-Valentin post
 * in May embarrasses the client).
 */
export function isDateRelevant(caption: string, now: Date = new Date()): PublishGuardResult {
  if (!caption || caption.length < 4) return { ok: true };
  const lower = caption.toLowerCase();
  const month = now.getUTCMonth(); // 0-11
  const day = now.getUTCDate();

  type HolidayCheck = { keywords: string[]; window: { from: { m: number; d: number }; to: { m: number; d: number } } };
  const HOLIDAYS: HolidayCheck[] = [
    // Saint-Valentin: 14 Feb — relevant Jan 15 → Feb 16
    { keywords: ['saint-valentin', 'saint valentin', 'st-valentin', 'valentine', 'valentine\'s'], window: { from: { m: 0, d: 15 }, to: { m: 1, d: 16 } } },
    // Fête des Mères (FR last Sunday of May, approx Jun 1)
    { keywords: ['fête des mères', 'fete des meres', 'mother\'s day'], window: { from: { m: 4, d: 10 }, to: { m: 5, d: 5 } } },
    // Fête des Pères (3rd Sunday of June, approx Jun 25)
    { keywords: ['fête des pères', 'fete des peres', 'father\'s day'], window: { from: { m: 5, d: 5 }, to: { m: 5, d: 25 } } },
    // Pâques (variable Mar 22 → Apr 25 — accept Mar/Apr)
    { keywords: ['pâques', 'paques', 'easter'], window: { from: { m: 2, d: 1 }, to: { m: 3, d: 30 } } },
    // Noël 25 Dec — relevant Nov 25 → Dec 26
    { keywords: ['noël', 'noel', 'christmas', 'sapin de noël'], window: { from: { m: 10, d: 25 }, to: { m: 11, d: 26 } } },
    // Halloween 31 Oct
    { keywords: ['halloween'], window: { from: { m: 9, d: 15 }, to: { m: 10, d: 1 } } },
    // Rentrée scolaire — Aug 15 → Sep 15
    { keywords: ['rentrée scolaire', 'rentree scolaire', 'back to school', 'back-to-school'], window: { from: { m: 7, d: 15 }, to: { m: 8, d: 15 } } },
    // Black Friday — last Friday of Nov
    { keywords: ['black friday'], window: { from: { m: 10, d: 20 }, to: { m: 10, d: 30 } } },
    // Soldes d'été (June-July) / d'hiver (Jan)
    { keywords: ['soldes d\'été', 'soldes d ete', 'summer sales'], window: { from: { m: 5, d: 15 }, to: { m: 6, d: 31 } } },
    { keywords: ['soldes d\'hiver', 'soldes d hiver', 'winter sales'], window: { from: { m: 0, d: 1 }, to: { m: 1, d: 10 } } },
    // Saint-Patrick 17 Mar
    { keywords: ['saint-patrick', 'st-patrick', 'patrick\'s day'], window: { from: { m: 2, d: 5 }, to: { m: 2, d: 19 } } },
  ];

  const inWindow = (h: HolidayCheck) => {
    const fromDays = h.window.from.m * 31 + h.window.from.d;
    const toDays = h.window.to.m * 31 + h.window.to.d;
    const nowDays = month * 31 + day;
    return nowDays >= fromDays && nowDays <= toDays;
  };

  for (const h of HOLIDAYS) {
    const mentioned = h.keywords.some(k => lower.includes(k));
    if (mentioned && !inWindow(h)) {
      return {
        ok: false,
        reason: `Le post mentionne « ${h.keywords[0]} » mais nous sommes hors de la fenêtre de pertinence (${h.window.from.m + 1}/${h.window.from.d} → ${h.window.to.m + 1}/${h.window.to.d}). Reformule ou planifie pour l'année prochaine.`,
        diagnosticTag: 'stale_holiday_reference',
      };
    }
  }

  return { ok: true };
}

/**
 * Run all 3 guards in order. Returns the FIRST failure (or ok=true).
 * Network defaults to instagram; pass tiktok/linkedin from the caller.
 */
export async function preflightPublish(
  supabase: SupabaseClient,
  args: {
    userId: string;
    imageUrl: string;
    caption: string;
    network: 'instagram' | 'tiktok' | 'linkedin';
  },
): Promise<PublishGuardResult> {
  // 1. retry lockout (cheapest, runs first)
  const retry = await isRetryWithinLockout(supabase, args.userId, args.imageUrl, args.network);
  if (!retry.ok) return retry;

  // 2. cross-format dedup over 7 days
  const dedup = await wasRecentlyPublished(supabase, args.userId, args.imageUrl, args.network);
  if (!dedup.ok) return dedup;

  // 3. stale holiday reference (caption-based)
  const date = isDateRelevant(args.caption);
  if (!date.ok) return date;

  return { ok: true };
}
