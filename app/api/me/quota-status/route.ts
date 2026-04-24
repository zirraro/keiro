import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { computeClientMargin } from '@/lib/credits/margin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/me/quota-status
 * Returns the caller's credit balance + live margin snapshot so the
 * upsell banner can decide whether to show + which CTA variant.
 */
export async function GET() {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: profile } = await sb
    .from('profiles')
    .select('subscription_plan, credits_balance, credits_monthly_allowance, is_admin')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 });

  // Margin snapshot is expensive to compute. For free/admin, skip it.
  let marginPct: number | null = null;
  if (!profile.is_admin && profile.subscription_plan && profile.subscription_plan !== 'free') {
    try {
      const snap = await computeClientMargin(user.id);
      marginPct = snap.margin_pct;
    } catch {
      // non-fatal — banner still works from credits alone
    }
  }

  return NextResponse.json({
    ok: true,
    status: {
      subscription_plan: profile.subscription_plan || 'free',
      credits_balance: profile.credits_balance ?? 0,
      credits_monthly_allowance: profile.credits_monthly_allowance ?? 0,
      margin_pct: marginPct,
    },
  });
}
