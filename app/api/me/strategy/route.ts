import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { PLAN_CREDITS } from '@/lib/credits/constants';

export const runtime = 'nodejs';

/**
 * GET /api/me/strategy
 *   Returns { focuses: string[] | null, appliedAt, plan, planCredits, creditsBalance }.
 *   focuses === null → popup should still be shown.
 *   focuses === []   → user skipped explicitly (don't show again).
 *
 * POST /api/me/strategy
 *   Body: { focuses: string[] }  — persists to profiles.strategy_focuses + strategy_applied_at.
 *   Passing an empty array marks it as skipped.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const ALLOWED = new Set(['instagram', 'tiktok', 'linkedin', 'prospection', 'reputation', 'seo', 'chatbot']);

export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = sb();
  const { data: profile } = await supabase
    .from('profiles')
    .select('strategy_focuses, strategy_applied_at, subscription_plan, credits_balance')
    .eq('id', user.id)
    .maybeSingle();

  const plan = profile?.subscription_plan || 'free';
  return NextResponse.json({
    ok: true,
    focuses: profile?.strategy_focuses ?? null,
    appliedAt: profile?.strategy_applied_at ?? null,
    plan,
    planCredits: PLAN_CREDITS[plan] ?? PLAN_CREDITS.free,
    creditsBalance: profile?.credits_balance ?? 0,
  });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const raw: unknown = body?.focuses;
  if (!Array.isArray(raw)) return NextResponse.json({ error: 'focuses must be array' }, { status: 400 });

  const focuses = Array.from(new Set(
    raw.map(x => String(x)).filter(x => ALLOWED.has(x))
  ));

  const supabase = sb();
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      strategy_focuses: focuses,
      strategy_applied_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, focuses });
}
