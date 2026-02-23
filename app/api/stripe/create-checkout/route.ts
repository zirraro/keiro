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
    // 1. Auth optionnelle — fonctionne avec ou sans connexion
    const { user } = await getAuthUser();

    const { planKey } = await request.json();
    if (!planKey) {
      return NextResponse.json({ error: 'planKey requis' }, { status: 400 });
    }

    const stripe = getStripe();
    let sessionParams: any;

    // Params communs selon que l'user est connecté ou non
    const isAuthenticated = !!user;
    const metadata: Record<string, string> = { planKey };
    if (isAuthenticated) {
      metadata.userId = user.id;
    }

    // Success URL : si connecté → mon-compte, sinon → login avec session_id pour lier le paiement
    const successUrlAuth = `${SITE_URL}/mon-compte?section=billing&success=1`;
    const successUrlGuest = `${SITE_URL}/login?stripe_session_id={CHECKOUT_SESSION_ID}&plan=${planKey}&payment_success=1`;
    const successUrl = isAuthenticated ? successUrlAuth : successUrlGuest;
    const cancelUrl = `${SITE_URL}/pricing?cancelled=1`;

    // Créer un Stripe Customer si connecté (sinon Stripe en crée un automatiquement)
    let customerId: string | undefined;
    if (isAuthenticated) {
      customerId = await getOrCreateStripeCustomer(
        user.id,
        user.email!,
        user.user_metadata?.first_name
          ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
          : undefined
      );
    }

    if (SUBSCRIPTION_PLANS.includes(planKey)) {
      // ---- ABONNEMENT MENSUEL RÉCURRENT ----
      const planToPrice = getPlanToPrice();
      const priceId = planToPrice[planKey];
      if (!priceId) {
        return NextResponse.json({ error: 'Prix non configuré pour ce plan' }, { status: 400 });
      }

      sessionParams = {
        mode: 'subscription' as const,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
      };
      if (customerId) sessionParams.customer = customerId;

    } else if (planKey === 'sprint') {
      // ---- SPRINT: PAIEMENT UNIQUE (3 jours) ----
      const sprintPriceId = getSprintPriceId();
      if (!sprintPriceId) {
        return NextResponse.json({ error: 'Prix Sprint non configuré' }, { status: 400 });
      }

      sessionParams = {
        mode: 'payment' as const,
        line_items: [{ price: sprintPriceId, quantity: 1 }],
        metadata,
        success_url: isAuthenticated ? `${SITE_URL}/generate?sprint=activated` : successUrlGuest,
        cancel_url: cancelUrl,
      };
      if (customerId) sessionParams.customer = customerId;

    } else if (planKey.startsWith('pack_')) {
      // ---- PACK CRÉDITS: PAIEMENT UNIQUE ----
      const packPrices = getPackPrices();
      const packPriceId = packPrices[planKey];
      if (!packPriceId) {
        return NextResponse.json({ error: 'Pack non configuré' }, { status: 400 });
      }

      sessionParams = {
        mode: 'payment' as const,
        line_items: [{ price: packPriceId, quantity: 1 }],
        metadata,
        success_url: isAuthenticated ? `${SITE_URL}/mon-compte?section=billing&pack=1` : successUrlGuest,
        cancel_url: cancelUrl,
      };
      if (customerId) sessionParams.customer = customerId;

    } else {
      return NextResponse.json({ error: 'Plan inconnu' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[Stripe Checkout] Session created:', {
      userId: user?.id || 'guest',
      planKey,
      sessionId: session.id,
      mode: sessionParams.mode,
      authenticated: isAuthenticated,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('[Stripe Checkout] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
