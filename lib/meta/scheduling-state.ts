/**
 * Per-user "scheduling paused" state — the auto-pause layer that protects
 * KeiroAI's Meta + TikTok permissions from being revoked when a specific
 * account starts throwing 4xx errors on the Graph API.
 *
 * Triggered by:
 *   - any 4xx response from a Meta / TikTok publish endpoint (recordPublishError)
 *   - the daily health check cron when an account's 24h error rate > 10 %
 *
 * Effect:
 *   - profiles.scheduling_paused_at is set to NOW().
 *   - The scheduled-publish worker (cron) refuses to publish any row owned
 *     by that user until the flag is cleared.
 *   - The user can clear it by reconnecting the affected network OR by an
 *     admin manually unpausing them from /admin.
 *
 * Naming: "scheduling" everywhere, never "auto-publication" — both Meta
 * and TikTok approve scheduled-publish flows (same model as Business
 * Suite / Buffer) but the term "auto-publication" reads as bot-mode
 * and increases review-risk on resubmissions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SchedulingState {
  paused: boolean;
  pausedAt?: string;
  reason?: string;
}

export async function getSchedulingState(
  supabase: SupabaseClient,
  userId: string,
): Promise<SchedulingState> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('scheduling_paused_at, scheduling_paused_reason')
      .eq('id', userId)
      .maybeSingle();
    if (!data?.scheduling_paused_at) return { paused: false };
    return {
      paused: true,
      pausedAt: data.scheduling_paused_at,
      reason: data.scheduling_paused_reason || 'Scheduling temporarily disabled',
    };
  } catch {
    return { paused: false };
  }
}

/**
 * Trip the auto-pause flag for a user.
 * Idempotent: if already paused, returns the existing state without overwriting.
 */
export async function pauseScheduling(
  supabase: SupabaseClient,
  userId: string,
  reason: string,
): Promise<void> {
  try {
    const current = await getSchedulingState(supabase, userId);
    if (current.paused) return; // don't overwrite an earlier reason
    await supabase
      .from('profiles')
      .update({
        scheduling_paused_at: new Date().toISOString(),
        scheduling_paused_reason: reason.slice(0, 240),
      })
      .eq('id', userId);

    // Audit log so /meta-audit + admin alerts can find it.
    await supabase.from('agent_logs').insert({
      agent: 'content',
      action: 'scheduling_paused',
      user_id: userId,
      status: 'error',
      data: { reason },
    });
  } catch (e: any) {
    console.warn('[scheduling-state] pause failed:', e?.message);
  }
}

export async function resumeScheduling(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    await supabase
      .from('profiles')
      .update({
        scheduling_paused_at: null,
        scheduling_paused_reason: null,
      })
      .eq('id', userId);

    await supabase.from('agent_logs').insert({
      agent: 'content',
      action: 'scheduling_resumed',
      user_id: userId,
      status: 'success',
      data: {},
    });
  } catch (e: any) {
    console.warn('[scheduling-state] resume failed:', e?.message);
  }
}

/**
 * Inspect a publish response and, if it's a 4xx from Graph/TikTok, trip
 * the auto-pause + audit the failure. Returns true iff scheduling was
 * paused as a result of this error.
 *
 * 5xx errors are transient (Meta/TikTok side) — we DON'T pause for those,
 * the next scheduler tick will simply retry.
 */
export async function recordPublishError(
  supabase: SupabaseClient,
  args: {
    userId: string;
    network: 'instagram' | 'tiktok' | 'linkedin';
    httpStatus: number;
    error: string;
    endpoint: string;
  },
): Promise<boolean> {
  const { userId, network, httpStatus, error, endpoint } = args;

  // Audit every error regardless of severity.
  try {
    await supabase.from('agent_logs').insert({
      agent: 'content',
      action: 'publish_diagnostic',
      user_id: userId,
      status: 'error',
      data: {
        platform: network,
        endpoint,
        http_status: httpStatus,
        error: String(error).slice(0, 400),
        method: 'publish_error',
      },
    });
  } catch { /* non-fatal */ }

  // Pause only on 4xx (client-side fault: revoked token, expired
  // permissions, account disabled, etc.). 5xx is server-side noise.
  if (httpStatus >= 400 && httpStatus < 500) {
    const reason = `${network} returned ${httpStatus} on ${endpoint}: ${String(error).slice(0, 120)}`;
    await pauseScheduling(supabase, userId, reason);
    return true;
  }
  return false;
}
