/**
 * Per-plan monthly quota enforcement for COGS-heavy generation.
 *
 * Why quotas on top of credits: credits alone cap the *count* of operations
 * but not the *cost mix*. A Créateur (400 credits) could burn 3.6× video_90s
 * on Seedance at ~€2.70 each = €9.72 of API cost, which collapses the 80%
 * target margin on a €49 plan. These quotas bound the worst case so every
 * plan holds its GM target:
 *   Créateur  → ≥78% GM
 *   Pro       → ≥75% GM
 *   Business  → ≥80% GM
 *   Elite     → ≥90% GM
 *
 * The counter is a naive month-to-date query on `agent_logs` filtered by
 * user_id + action. If perf becomes an issue at scale we promote it to a
 * materialized usage table keyed by (user_id, month, feature).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getPlanQuotas } from './constants';

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getPlan(userId: string): Promise<string> {
  const sb = admin();
  const { data } = await sb
    .from('profiles')
    .select('subscription_plan, is_admin')
    .eq('id', userId)
    .single();
  if (data?.is_admin) return 'admin';
  return data?.subscription_plan || 'free';
}

function monthStartISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function dayStartISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

async function countUsage(
  userId: string,
  action: string,
  since: string,
): Promise<number> {
  const sb = admin();
  const { count } = await sb
    .from('agent_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', action)
    .contains('data', { user_id: userId })
    .gte('created_at', since);
  return count ?? 0;
}

/** Log a usage event so it counts against the monthly/daily quota. */
export async function logQuotaUsage(
  userId: string,
  action: 'image_generated' | 'video_generated' | 'tts_generated' | 'dm_sent' | 'chatbot_session',
  extra: Record<string, any> = {},
): Promise<void> {
  const sb = admin();
  await sb.from('agent_logs').insert({
    agent: 'quota',
    action,
    data: { user_id: userId, ...extra },
    created_at: new Date().toISOString(),
  });
}

export type QuotaCheck =
  | { allowed: true; plan: string; remaining: number; limit: number }
  | { allowed: false; plan: string; remaining: number; limit: number; reason: string; message: string };

/** Check image-generation quota. Call BEFORE starting the Seedream request. */
export async function checkImageQuota(userId: string): Promise<QuotaCheck> {
  const plan = await getPlan(userId);
  const q = getPlanQuotas(plan);
  const used = await countUsage(userId, 'image_generated', monthStartISO());
  if (used >= q.images_per_month) {
    return {
      allowed: false,
      plan,
      remaining: 0,
      limit: q.images_per_month,
      reason: 'image_quota_exceeded',
      message: `Quota mensuel d'images atteint (${q.images_per_month}/mois sur le plan ${plan}). Passe au plan supérieur ou attends le renouvellement.`,
    };
  }
  return { allowed: true, plan, remaining: q.images_per_month - used, limit: q.images_per_month };
}

/** Check video quota AND duration cap. Call BEFORE starting Seedance. */
export async function checkVideoQuota(
  userId: string,
  requestedDurationSec: number,
): Promise<QuotaCheck> {
  const plan = await getPlan(userId);
  const q = getPlanQuotas(plan);

  if (requestedDurationSec > q.video_max_seconds) {
    return {
      allowed: false,
      plan,
      remaining: 0,
      limit: q.video_max_seconds,
      reason: 'video_duration_exceeded',
      message: `Le plan ${plan} limite la durée vidéo à ${q.video_max_seconds}s (demandé ${requestedDurationSec}s). Passe à un plan supérieur pour des vidéos plus longues.`,
    };
  }

  const used = await countUsage(userId, 'video_generated', monthStartISO());
  if (used >= q.videos_per_month) {
    return {
      allowed: false,
      plan,
      remaining: 0,
      limit: q.videos_per_month,
      reason: 'video_quota_exceeded',
      message: `Quota mensuel de vidéos atteint (${q.videos_per_month}/mois sur le plan ${plan}).`,
    };
  }
  return { allowed: true, plan, remaining: q.videos_per_month - used, limit: q.videos_per_month };
}

/** Check audio narration quota (in seconds, rounded up to minutes). */
export async function checkTtsQuota(
  userId: string,
  requestedSeconds: number,
): Promise<QuotaCheck> {
  const plan = await getPlan(userId);
  const q = getPlanQuotas(plan);

  const sb = admin();
  const { data } = await sb
    .from('agent_logs')
    .select('data')
    .eq('action', 'tts_generated')
    .contains('data', { user_id: userId })
    .gte('created_at', monthStartISO());

  const secondsUsed = (data ?? []).reduce((s: number, r: any) => s + (r.data?.seconds || 0), 0);
  const limitSeconds = q.tts_minutes_per_month * 60;

  if (secondsUsed + requestedSeconds > limitSeconds) {
    return {
      allowed: false,
      plan,
      remaining: Math.max(0, limitSeconds - secondsUsed),
      limit: limitSeconds,
      reason: 'tts_quota_exceeded',
      message: `Quota narration audio atteint (${q.tts_minutes_per_month} min/mois sur ${plan}).`,
    };
  }
  return { allowed: true, plan, remaining: limitSeconds - secondsUsed - requestedSeconds, limit: limitSeconds };
}

/** Check Jade DM daily quota. */
export async function checkDmQuota(userId: string): Promise<QuotaCheck> {
  const plan = await getPlan(userId);
  const q = getPlanQuotas(plan);
  const used = await countUsage(userId, 'dm_sent', dayStartISO());
  if (used >= q.dms_per_day) {
    return {
      allowed: false,
      plan,
      remaining: 0,
      limit: q.dms_per_day,
      reason: 'dm_quota_exceeded',
      message: `Quota DM journalier atteint (${q.dms_per_day}/jour sur ${plan}).`,
    };
  }
  return { allowed: true, plan, remaining: q.dms_per_day - used, limit: q.dms_per_day };
}

/** Check Max chatbot daily session quota. */
export async function checkChatbotQuota(userId: string): Promise<QuotaCheck> {
  const plan = await getPlan(userId);
  const q = getPlanQuotas(plan);
  const used = await countUsage(userId, 'chatbot_session', dayStartISO());
  if (used >= q.chatbot_sessions_per_day) {
    return {
      allowed: false,
      plan,
      remaining: 0,
      limit: q.chatbot_sessions_per_day,
      reason: 'chatbot_quota_exceeded',
      message: `Quota chatbot journalier atteint (${q.chatbot_sessions_per_day}/jour sur ${plan}).`,
    };
  }
  return { allowed: true, plan, remaining: q.chatbot_sessions_per_day - used, limit: q.chatbot_sessions_per_day };
}
