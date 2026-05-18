/**
 * Per-account publish rate limiting.
 *
 * Caps daily publishes and enforces minimum spacing between consecutive
 * publishes to keep KeiroAI's Meta + TikTok permissions safe. Both
 * networks tolerate higher numbers in theory (Meta: 25/day, TikTok: 6/day)
 * but flag accounts that consistently sit at the ceiling — we keep one
 * publish of head-room and stay well under the official limits.
 *
 * Limits are intentionally identical across IG and TikTok to keep client
 * mental model simple: "4 posts max per network per day, at least 90
 * minutes between them".
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type PublishNetwork = 'instagram' | 'tiktok' | 'linkedin';

export interface RateLimitResult {
  ok: boolean;
  reason?: string;
  diagnosticTag?: string;
  nextAllowedAt?: string; // ISO timestamp when the caller may retry
}

/**
 * Per-network daily cap. Meta tolerates 25/day on IG, TikTok 6/day. We
 * cap at 4 to keep one publish of head-room AND stay well below the
 * "behavioural" flags both platforms run on accounts that sit at the
 * ceiling for weeks (which would risk app permission revocation).
 */
const DAILY_CAP: Record<PublishNetwork, number> = {
  instagram: 4,
  tiktok: 4,
  linkedin: 4,
};

/** Minimum spacing between two publishes on the same network for the same user. */
const MIN_SPACING_MS = 90 * 60 * 1000; // 90 minutes

const LOOKBACK_24H_MS = 24 * 60 * 60 * 1000;

/**
 * Returns ok=true if the user may publish RIGHT NOW on `network`.
 * Otherwise returns the reason + the earliest acceptable retry time.
 */
export async function canPublishNow(
  supabase: SupabaseClient,
  userId: string,
  network: PublishNetwork,
): Promise<RateLimitResult> {
  const now = Date.now();
  const since24h = new Date(now - LOOKBACK_24H_MS).toISOString();
  const cap = DAILY_CAP[network];

  try {
    const { data, error } = await supabase
      .from('agent_logs')
      .select('id, created_at, data')
      .eq('user_id', userId)
      .eq('agent', 'content')
      .eq('action', 'publish_diagnostic')
      .eq('status', 'success')
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      // Fail-open: don't block legitimate publishes on a transient DB error.
      console.warn('[rate-limit] lookup failed, allowing:', error.message);
      return { ok: true };
    }

    const onNetwork = (data || []).filter(row => {
      const d = row?.data as any;
      const platform = d?.platform || network;
      return platform === network;
    });

    // Daily cap.
    if (onNetwork.length >= cap) {
      // Next slot opens 24h after the oldest publish in the window.
      const oldest = onNetwork[onNetwork.length - 1];
      const nextAllowed = oldest?.created_at
        ? new Date(new Date(oldest.created_at).getTime() + LOOKBACK_24H_MS).toISOString()
        : new Date(now + LOOKBACK_24H_MS).toISOString();
      return {
        ok: false,
        reason: `Cap quotidien atteint — ${cap} publish/jour max sur ${network}. Prochain créneau disponible : ${new Date(nextAllowed).toLocaleString()}.`,
        diagnosticTag: 'rate_limit_daily_cap',
        nextAllowedAt: nextAllowed,
      };
    }

    // Minimum spacing.
    if (onNetwork.length > 0) {
      const latest = onNetwork[0];
      const latestMs = new Date(latest.created_at).getTime();
      if (now - latestMs < MIN_SPACING_MS) {
        const nextAllowed = new Date(latestMs + MIN_SPACING_MS).toISOString();
        const waitMin = Math.ceil((MIN_SPACING_MS - (now - latestMs)) / 60000);
        return {
          ok: false,
          reason: `Espacement minimum entre 2 publishes : 90 min. Réessaye dans ${waitMin} min.`,
          diagnosticTag: 'rate_limit_spacing',
          nextAllowedAt: nextAllowed,
        };
      }
    }

    return { ok: true };
  } catch (e: any) {
    console.warn('[rate-limit] unexpected error, allowing:', e?.message);
    return { ok: true };
  }
}

export function getDailyCap(network: PublishNetwork): number {
  return DAILY_CAP[network];
}

export function getMinSpacingMs(): number {
  return MIN_SPACING_MS;
}
