import { NextRequest, NextResponse } from 'next/server';
import { getStripe, AMOUNT_TO_PLAN, AMOUNT_TO_PACK, getPriceToPlan } from '@/lib/stripe';
import { PLAN_CREDITS } from '@/lib/credits/constants';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stripe Webhook] Signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('[Stripe Webhook] Event received:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type);
    }
  } catch (err: any) {
    console.error('[Stripe Webhook] Handler error:', err);
    // Return 200 pour éviter que Stripe ne retente
  }

  return NextResponse.json({ received: true });
}

// ====================================================================
// CHECKOUT COMPLETED — Activation initiale
// ====================================================================
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = getSupabaseAdmin();
  const userId = session.metadata?.userId;
  const planKey = session.metadata?.planKey;

  // Trouver l'user: par metadata.userId ou fallback par email
  let profileId = userId;
  if (!profileId) {
    const customerEmail = session.customer_details?.email || session.customer_email;
    if (customerEmail) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', customerEmail.toLowerCase())
        .single();
      profileId = profile?.id;
    }
  }

  if (!profileId) {
    // Dernier fallback: identifier par montant (ancien système payment links)
    const amountTotal = session.amount_total;
    if (amountTotal) {
      const legacyPlan = AMOUNT_TO_PLAN[amountTotal];
      const legacyPack = AMOUNT_TO_PACK[amountTotal];
      if (legacyPlan || legacyPack) {
        const customerEmail = session.customer_details?.email || session.customer_email;
        if (customerEmail) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, credits_balance')
            .eq('email', customerEmail.toLowerCase())
            .single();
          if (profile) {
            if (legacyPlan) {
              await handleLegacyPlanActivation(profile.id, legacyPlan, session.customer as string);
            } else if (legacyPack) {
              await handleLegacyPackPurchase(profile.id, profile.credits_balance || 0, legacyPack, session.customer as string);
            }
          }
        }
      }
    }
    console.error('[Webhook] Could not identify user for checkout:', session.id);
    return;
  }

  if (session.mode === 'subscription') {
    // ---- ABONNEMENT RÉCURRENT ----
    const subscriptionId = session.subscription as string;
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;

    const resolvedPlanKey = planKey || 'solo';
    const credits = PLAN_CREDITS[resolvedPlanKey] || 0;
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

    await supabase
      .from('profiles')
      .update({
        subscription_plan: resolvedPlanKey,
        credits_balance: credits,
        credits_monthly_allowance: credits,
        credits_reset_at: new Date().toISOString(),
        credits_expires_at: null, // Clear expiration promo
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscriptionId,
        stripe_current_period_end: periodEnd,
      })
      .eq('id', profileId);

    await supabase.from('credit_transactions').insert({
      user_id: profileId,
      amount: credits,
      balance_after: credits,
      type: 'subscription',
      feature: `plan_${resolvedPlanKey}`,
      description: `Abonnement ${resolvedPlanKey} activé via Stripe`,
    });

    console.log('[Webhook] Subscription activated:', { userId: profileId, plan: resolvedPlanKey, credits });

  } else if (session.mode === 'payment') {
    // ---- PAIEMENT UNIQUE ----
    if (planKey === 'sprint') {
      // Sprint: accès 3 jours
      const credits = PLAN_CREDITS.sprint || 110;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3);

      await supabase
        .from('profiles')
        .update({
          subscription_plan: 'sprint',
          credits_balance: credits,
          credits_monthly_allowance: credits,
          credits_reset_at: new Date().toISOString(),
          credits_expires_at: expiresAt.toISOString(),
          stripe_customer_id: session.customer as string,
        })
        .eq('id', profileId);

      await supabase.from('credit_transactions').insert({
        user_id: profileId,
        amount: credits,
        balance_after: credits,
        type: 'subscription',
        feature: 'plan_sprint',
        description: 'Sprint Fondateur activé (3 jours)',
      });

      // Créditer 4,99€ sur le solde Stripe du client
      // → sera déduit automatiquement de son prochain abonnement
      const customerId = session.customer as string;
      if (customerId) {
        try {
          const stripe = getStripe();
          await stripe.customers.createBalanceTransaction(customerId, {
            amount: -499, // négatif = crédit client (4,99€)
            currency: 'eur',
            description: 'Crédit Sprint déduit du prochain abonnement',
          });
          console.log('[Webhook] Sprint credit applied to customer balance:', customerId);
        } catch (e) {
          console.error('[Webhook] Failed to apply Sprint credit:', e);
        }
      }

      console.log('[Webhook] Sprint activated:', { userId: profileId });

    } else if (planKey?.startsWith('pack_')) {
      // Pack crédits
      const packCredits: Record<string, number> = {
        pack_starter: 50,
        pack_pro: 150,
        pack_expert: 300,
      };
      const credits = packCredits[planKey] || 0;
      if (credits > 0) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('credits_balance')
          .eq('id', profileId)
          .single();

        const currentBalance = profile?.credits_balance ?? 0;
        const newBalance = currentBalance + credits;

        await supabase
          .from('profiles')
          .update({
            credits_balance: newBalance,
            stripe_customer_id: session.customer as string,
          })
          .eq('id', profileId);

        await supabase.from('credit_transactions').insert({
          user_id: profileId,
          amount: credits,
          balance_after: newBalance,
          type: 'credit_pack',
          feature: 'credit_pack',
          description: `Pack ${planKey.replace('pack_', '')} : +${credits} crédits`,
        });

        console.log('[Webhook] Credit pack added:', { userId: profileId, credits });
      }
    } else {
      // Fallback: identifier par montant (ancien payment link)
      const amountTotal = session.amount_total;
      if (amountTotal) {
        const legacyPlan = AMOUNT_TO_PLAN[amountTotal];
        if (legacyPlan) {
          await handleLegacyPlanActivation(profileId, legacyPlan, session.customer as string);
        }
      }
    }
  }
}

// ====================================================================
// INVOICE PAID — Renouvellement mensuel
// ====================================================================
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const supabase = getSupabaseAdmin();

  // Skip la première facture (déjà gérée par checkout.session.completed)
  if (invoice.billing_reason === 'subscription_create') {
    console.log('[Webhook] Skipping initial invoice (handled by checkout)');
    return;
  }

  const subscriptionId = (invoice as any).subscription as string;
  if (!subscriptionId) return;

  // Trouver l'user par stripe_subscription_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, credits_balance, credits_monthly_allowance, subscription_plan')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!profile) {
    console.error('[Webhook] No profile found for subscription:', subscriptionId);
    return;
  }

  const planKey = profile.subscription_plan;
  const allowance = PLAN_CREDITS[planKey] || 0;

  // Rollover: crédits restants reportés (max = 1x allowance)
  const currentBalance = profile.credits_balance || 0;
  const carryOver = Math.min(currentBalance, allowance);
  const newBalance = allowance + carryOver;

  // Récupérer la date de fin de période
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  await supabase
    .from('profiles')
    .update({
      credits_balance: newBalance,
      credits_reset_at: new Date().toISOString(),
      stripe_current_period_end: periodEnd,
    })
    .eq('id', profile.id);

  // Log transaction
  const desc = carryOver > 0
    ? `Renouvellement mensuel: ${allowance} crédits + ${carryOver} reportés`
    : `Renouvellement mensuel: ${allowance} crédits`;

  await supabase.from('credit_transactions').insert({
    user_id: profile.id,
    amount: newBalance,
    balance_after: newBalance,
    type: 'monthly_reset',
    feature: 'monthly_reset',
    description: desc,
  });

  console.log('[Webhook] Monthly renewal:', { userId: profile.id, planKey, newBalance, carryOver });
}

// ====================================================================
// SUBSCRIPTION UPDATED — Changement de plan (upgrade/downgrade)
// ====================================================================
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const supabase = getSupabaseAdmin();

  // Trouver l'user
  let profileId = subscription.metadata?.userId;
  if (!profileId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .single();
    if (!profile) {
      console.error('[Webhook] No profile for subscription update:', subscription.id);
      return;
    }
    profileId = profile.id;
  }

  // Déterminer le nouveau plan via le Price ID
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return;

  const priceToPlan = getPriceToPlan();
  const newPlanKey = priceToPlan[priceId];
  if (!newPlanKey) {
    console.warn('[Webhook] Unknown price ID in subscription update:', priceId);
    return;
  }

  // Vérifier le plan actuel
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_plan, credits_balance, credits_monthly_allowance')
    .eq('id', profileId)
    .single();

  if (!profile) return;

  const oldPlanKey = profile.subscription_plan;
  if (oldPlanKey === newPlanKey) return; // Pas de changement

  const newCredits = PLAN_CREDITS[newPlanKey] || 0;
  const oldCredits = PLAN_CREDITS[oldPlanKey] || 0;

  // Upgrade: ajouter la différence immédiatement
  // Downgrade: garder le solde, changer l'allowance
  let newBalance = profile.credits_balance;
  if (newCredits > oldCredits) {
    const diff = newCredits - oldCredits;
    newBalance = profile.credits_balance + diff;
  }

  await supabase
    .from('profiles')
    .update({
      subscription_plan: newPlanKey,
      credits_monthly_allowance: newCredits,
      credits_balance: newBalance,
      stripe_current_period_end: (subscription as any).current_period_end
        ? new Date((subscription as any).current_period_end * 1000).toISOString()
        : null,
    })
    .eq('id', profileId);

  await supabase.from('credit_transactions').insert({
    user_id: profileId,
    amount: newBalance - profile.credits_balance,
    balance_after: newBalance,
    type: 'plan_change',
    feature: `plan_${newPlanKey}`,
    description: `Changement de plan: ${oldPlanKey} → ${newPlanKey}`,
  });

  console.log('[Webhook] Plan changed:', { userId: profileId, oldPlanKey, newPlanKey, newBalance });
}

// ====================================================================
// SUBSCRIPTION DELETED — Annulation
// ====================================================================
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = getSupabaseAdmin();

  let profileId = subscription.metadata?.userId;
  if (!profileId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .single();
    if (!profile) {
      console.error('[Webhook] No profile for deleted subscription:', subscription.id);
      return;
    }
    profileId = profile.id;
  }

  const freeCredits = PLAN_CREDITS.free || 15;

  await supabase
    .from('profiles')
    .update({
      subscription_plan: 'free',
      credits_balance: freeCredits,
      credits_monthly_allowance: freeCredits,
      credits_reset_at: new Date().toISOString(),
      stripe_subscription_id: null,
      stripe_current_period_end: null,
    })
    .eq('id', profileId);

  await supabase.from('credit_transactions').insert({
    user_id: profileId,
    amount: freeCredits,
    balance_after: freeCredits,
    type: 'cancellation',
    feature: 'plan_free',
    description: 'Abonnement annulé — retour au plan Gratuit',
  });

  console.log('[Webhook] Subscription cancelled:', { userId: profileId });
}

// ====================================================================
// LEGACY HELPERS — Pour anciens payment links (transition)
// ====================================================================
async function handleLegacyPlanActivation(userId: string, planKey: string, customerId: string) {
  const supabase = getSupabaseAdmin();
  const credits = PLAN_CREDITS[planKey] || 0;

  await supabase
    .from('profiles')
    .update({
      subscription_plan: planKey,
      credits_balance: credits,
      credits_monthly_allowance: credits,
      credits_reset_at: new Date().toISOString(),
      stripe_customer_id: customerId,
    })
    .eq('id', userId);

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: credits,
    balance_after: credits,
    type: 'subscription',
    feature: `plan_${planKey}`,
    description: `Abonnement ${planKey} activé via Stripe (legacy)`,
  });

  console.log('[Webhook] Legacy plan activated:', { userId, planKey, credits });
}

async function handleLegacyPackPurchase(userId: string, currentBalance: number, credits: number, customerId: string) {
  const supabase = getSupabaseAdmin();
  const newBalance = currentBalance + credits;

  await supabase
    .from('profiles')
    .update({
      credits_balance: newBalance,
      stripe_customer_id: customerId,
    })
    .eq('id', userId);

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: credits,
    balance_after: newBalance,
    type: 'credit_pack',
    feature: 'credit_pack',
    description: `Pack crédits : +${credits} crédits (legacy)`,
  });

  console.log('[Webhook] Legacy pack purchased:', { userId, credits });
}
