import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { getCreditsProfile } from '@/lib/credits/server';

export async function GET() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const profile = await getCreditsProfile(user.id);

    return NextResponse.json({
      balance: profile?.credits_balance ?? 0,
      monthlyAllowance: profile?.credits_monthly_allowance ?? 0,
      plan: profile?.subscription_plan || 'free',
      resetAt: profile?.credits_reset_at || null,
    });
  } catch (error: any) {
    console.error('[Credits Balance] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
