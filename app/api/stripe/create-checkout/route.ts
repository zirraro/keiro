import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import {
  getStripe,
  getOrCreateStripeCustomer,
  getPlanToPrice,
  getPlanToPriceAnnual,
  getSprintPriceId,
  getPackPrices,
  SUBSCRIPTION_PLANS,
  ANNUAL_PLAN_SUFFIX,
} from '@/lib/stripe';

export const runtime = 'edge';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiro.ai';

export async function POST(request: NextRequest) {
  try {
    // 1. Auth optionnelle — fonctionne avec ou sans connexion
    const { user } = await getAuthUser();

    const { planKey, upsellFrom } = await request.json();
    if (!planKey) {
      return NextResponse.json({ error: 'planKey requis' }, { status: 400 });
    }

    // Upsell: si le client vient du plan Créateur et upgrade vers Pro → coupon -40% 1er mois
    const isUpsellProFromCreateur = planKey === 'pro' && upsellFrom === 'createur';
    const PRO_UPSELL_COUPON = process.env.STRIPE_COUPON_PRO_UPSELL || 'FIRST_MONTH_40'; // Coupon Stripe -40% 1er mois

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

    // Détecter si c'est un plan annuel (ex: pro_annual → basePlan=pro, annual=true)
    const isAnnual = planKey.endsWith(ANNUAL_PLAN_SUFFIX);
    const basePlan = isAnnual ? planKey.replace(ANNUAL_PLAN_SUFFIX, '') : planKey;

    if (SUBSCRIPTION_PLANS.includes(basePlan) && (planKey === basePlan || isAnnual)) {
      // ---- ABONNEMENT RÉCURRENT (MENSUEL OU ANNUEL) ----
      let priceId: string | undefined;
      if (isAnnual) {
        const annualPrices = getPlanToPriceAnnual();
        priceId = annualPrices[basePlan];
      } else {
        const monthlyPrices = getPlanToPrice();
        priceId = monthlyPrices[basePlan];
      }

      if (!priceId) {
        return NextResponse.json({ error: `Prix ${isAnnual ? 'annuel' : 'mensuel'} non configuré pour ce plan` }, { status: 400 });
      }

      // Le planKey stocké dans metadata est toujours le basePlan (ex: pro, pas pro_annual)
      const subMetadata = { ...metadata, planKey: basePlan, billing: isAnnual ? 'annual' : 'monthly' };

      sessionParams = {
        mode: 'subscription' as const,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: subMetadata,
        subscription_data: {
          metadata: subMetadata,
          trial_period_days: 14, // 14 jours gratuits — carte capturee mais pas chargee
        },
        payment_method_collection: 'always' as const, // Toujours demander la carte
        allow_promotion_codes: true, // Le client peut entrer un code promo manuellement
        custom_text: {
          submit: {
            message: 'Annulation en 1 clic à tout moment. Aucun engagement, résiliez quand vous voulez.',
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      };

      // Upsell Créateur → Pro : appliquer le coupon -40% sur le 1er mois
      if (isUpsellProFromCreateur && PRO_UPSELL_COUPON) {
        sessionParams.discounts = [{ coupon: PRO_UPSELL_COUPON }];
        // Quand on utilise discounts, on ne peut pas utiliser allow_promotion_codes en même temps
        delete sessionParams.allow_promotion_codes;
      }
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
        custom_text: {
          submit: {
            message: 'Paiement unique sécurisé. Accès immédiat après paiement.',
          },
        },
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
