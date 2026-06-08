/**
 * Credit pack purchase — top-up Stripe checkout.
 *
 * Founder ask 2026-06-09 : "proposer des achat de credit pour
 * continuer les actions des agents type publication generation
 * email ect" — quand un client touche son ceiling budget ou son
 * quota plan, on lui propose 3 packs au lieu de juste bloquer.
 *
 * Body: { pack: 'starter' | 'pro' | 'expert' }
 *   starter → 50 crédits  · 14,99€  (ex: 12 visuels supp ou 50 emails)
 *   pro     → 150 crédits · 39,99€ (ex: 3 reels supp + 30 images)
 *   expert  → 300 crédits · 69,99€ (ex: 8 reels supp + heavy use)
 *
 * Returns: { ok: true, checkout_url: 'https://checkout.stripe.com/...' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { getStripe, getOrCreateStripeCustomer, getPackPrices, AMOUNT_TO_PACK } from '@/lib/stripe';

export const runtime = 'edge';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';

const PACK_INFO: Record<string, { label: string; credits: number; price_eur: string }> = {
  starter: { label: 'Pack Starter', credits: 50, price_eur: '14,99 €' },
  pro:     { label: 'Pack Pro',     credits: 150, price_eur: '39,99 €' },
  expert:  { label: 'Pack Expert',  credits: 300, price_eur: '69,99 €' },
};

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pack = (body.pack || '').toLowerCase();
  if (!PACK_INFO[pack]) {
    return NextResponse.json({ ok: false, error: 'Pack inconnu (starter / pro / expert)' }, { status: 400 });
  }

  const prices = getPackPrices();
  const priceId = prices[`pack_${pack}`];
  if (!priceId) {
    return NextResponse.json({ ok: false, error: `Stripe price ID manquant pour pack_${pack}` }, { status: 500 });
  }

  const customerId = await getOrCreateStripeCustomer(
    user.id,
    user.email!,
    user.user_metadata?.first_name
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
      : undefined,
  );

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', // one-time, NOT subscription
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${SITE_URL}/mon-compte?section=billing&credits_added=${PACK_INFO[pack].credits}`,
    cancel_url: `${SITE_URL}/assistant?credits_cancelled=1`,
    metadata: {
      userId: user.id,
      pack,
      credits: String(PACK_INFO[pack].credits),
      source: body.source || 'unknown', // ex: 'budget_red_lena' so we know where it triggered
    },
    // Allow promo codes (Stripe handles it)
    allow_promotion_codes: true,
  });

  return NextResponse.json({
    ok: true,
    checkout_url: session.url,
    pack: PACK_INFO[pack],
  });
}

/**
 * GET — return available packs + price + bonus messaging.
 * Used by the in-app modal to render the 3 cards.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    packs: [
      {
        id: 'starter',
        ...PACK_INFO.starter,
        bonus: '~12 visuels supp ou ~50 emails',
        recommended: false,
      },
      {
        id: 'pro',
        ...PACK_INFO.pro,
        bonus: '~3 reels supp + 30 images',
        recommended: true, // best value
      },
      {
        id: 'expert',
        ...PACK_INFO.expert,
        bonus: '~8 reels supp · usage intensif',
        recommended: false,
      },
    ],
  });
}
