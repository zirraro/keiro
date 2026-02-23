import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import {
  getStripe,
  getOrCreateStripeCustomer,
  getPlanToPrice,
  getSprintPriceId,
  getPackPrices,
  SUBSCRIPTION_PLANS,
} from '@/lib/stripe';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiro.ai';

export async function POST(request: NextRequest) {
  try {
    // 1. Authentifier l'utilisateur
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { planKey } = await request.json();
    if (!planKey) {
      return NextResponse.json({ error: 'planKey requis' }, { status: 400 });
    }

    // 2. Créer ou réutiliser le Stripe Customer
    const customerId = await getOrCreateStripeCustomer(
      user.id,
      user.email!,
      user.user_metadata?.first_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
        : undefined
    );

    const stripe = getStripe();
    let sessionParams: any;

    if (SUBSCRIPTION_PLANS.includes(planKey)) {
      // ---- ABONNEMENT MENSUEL RÉCURRENT ----
      const planToPrice = getPlanToPrice();
      const priceId = planToPrice[planKey];
      if (!priceId) {
        return NextResponse.json({ error: 'Prix non configuré pour ce plan' }, { status: 400 });
      }

      sessionParams = {
        customer: customerId,
        mode: 'subscription' as const,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { userId: user.id, planKey },
        subscription_data: {
          metadata: { userId: user.id, planKey },
        },
        success_url: `${SITE_URL}/mon-compte?section=billing&success=1`,
        cancel_url: `${SITE_URL}/pricing?cancelled=1`,
        allow_promotion_codes: true,
      };

    } else if (planKey === 'sprint') {
      // ---- SPRINT: PAIEMENT UNIQUE (3 jours) ----
      const sprintPriceId = getSprintPriceId();
      if (!sprintPriceId) {
        return NextResponse.json({ error: 'Prix Sprint non configuré' }, { status: 400 });
      }

      sessionParams = {
        customer: customerId,
        mode: 'payment' as const,
        line_items: [{ price: sprintPriceId, quantity: 1 }],
        metadata: { userId: user.id, planKey: 'sprint' },
        success_url: `${SITE_URL}/generate?sprint=activated`,
        cancel_url: `${SITE_URL}/pricing?cancelled=1`,
      };

    } else if (planKey.startsWith('pack_')) {
      // ---- PACK CRÉDITS: PAIEMENT UNIQUE ----
      const packPrices = getPackPrices();
      const packPriceId = packPrices[planKey];
      if (!packPriceId) {
        return NextResponse.json({ error: 'Pack non configuré' }, { status: 400 });
      }

      sessionParams = {
        customer: customerId,
        mode: 'payment' as const,
        line_items: [{ price: packPriceId, quantity: 1 }],
        metadata: { userId: user.id, planKey },
        success_url: `${SITE_URL}/mon-compte?section=billing&pack=1`,
        cancel_url: `${SITE_URL}/mon-compte?section=billing`,
      };

    } else {
      return NextResponse.json({ error: 'Plan inconnu' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[Stripe Checkout] Session created:', {
      userId: user.id,
      planKey,
      sessionId: session.id,
      mode: sessionParams.mode,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('[Stripe Checkout] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
