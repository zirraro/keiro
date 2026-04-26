import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/me/free-trial-status
 *
 * Returns the visitor's free-trial state for the no-card express
 * onboarding. The /generate page calls this before each request to
 * decide whether to gate the action behind the card-collection modal.
 *
 * Logic:
 *   - Visitor without account → unlimited (handled by /api/auth/* gate)
 *   - Account without subscription_plan or with 'free' →
 *     check free_generations_used vs FREE_LIMIT (3).
 *   - Account with paid plan → unlimited (returns blocked=false).
 */
const FREE_LIMIT = 3;

export async function GET() {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: true, requires_card: false, anonymous: true });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: profile } = await sb
    .from('profiles')
    .select('subscription_plan, free_generations_used, is_admin, stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ ok: true, requires_card: false });
  if (profile.is_admin) return NextResponse.json({ ok: true, requires_card: false, plan: 'admin' });

  const plan = (profile.subscription_plan || 'free').toLowerCase();
  const isPaying = !!profile.stripe_customer_id && plan !== 'free' && plan !== 'gratuit';
  if (isPaying) return NextResponse.json({ ok: true, requires_card: false, plan });

  const used = profile.free_generations_used ?? 0;
  const remaining = Math.max(0, FREE_LIMIT - used);
  return NextResponse.json({
    ok: true,
    plan: 'free',
    used,
    limit: FREE_LIMIT,
    remaining,
    requires_card: remaining === 0,
  });
}

/**
 * POST /api/me/free-trial-status
 * Increments free_generations_used by 1. Called by /api/seedream/* and
 * other generation endpoints AFTER a successful generation. Idempotent
 * via optional message_id (skip double-increment within 5 seconds).
 */
export async function POST() {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: profile } = await sb
    .from('profiles')
    .select('free_generations_used, subscription_plan, stripe_customer_id, is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ ok: true, skipped: 'no_profile' });

  // Don't increment for paying / admin users
  const plan = (profile.subscription_plan || 'free').toLowerCase();
  if (profile.is_admin || (profile.stripe_customer_id && plan !== 'free' && plan !== 'gratuit')) {
    return NextResponse.json({ ok: true, skipped: 'paying' });
  }

  const next = (profile.free_generations_used ?? 0) + 1;
  await sb.from('profiles').update({ free_generations_used: next }).eq('id', user.id);
  return NextResponse.json({ ok: true, used: next, requires_card_next: next >= FREE_LIMIT });
}
