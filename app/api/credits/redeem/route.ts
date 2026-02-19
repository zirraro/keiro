import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { redeemPromoCode } from '@/lib/credits/server';

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { code } = await req.json();

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Code promo requis' },
        { status: 400 }
      );
    }

    const result = await redeemPromoCode(user.id, code);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      credits: result.credits,
      message: `+${result.credits} crédits ajoutés !`,
    });
  } catch (error: any) {
    console.error('[Credits Redeem] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
