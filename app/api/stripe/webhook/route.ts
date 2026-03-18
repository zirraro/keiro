import { NextRequest, NextResponse } from 'next/server';
import { getStripe, AMOUNT_TO_PLAN, AMOUNT_TO_PACK, getPriceToPlan } from '@/lib/stripe';
import { PLAN_CREDITS } from '@/lib/credits/constants';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const runtime = 'edge';

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
      case 'subscription_schedule.canceled':
        await handleScheduleCanceled(event.data.object as any);
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
    // User pas encore inscrit → sera activé via /api/stripe/claim-payment après création de compte
    console.log('[Webhook] User not found for checkout (will be claimed after signup):', session.id, 'plan:', planKey);
    return;
  }

  if (session.mode === 'subscription') {
    // ---- ABONNEMENT RÉCURRENT ----
    const subscriptionId = session.subscription as string;
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;

    const resolvedPlanKey = planKey || 'pro';
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

    // Notify founder
    const customerEmail = session.customer_details?.email || session.customer_email || '';
    await notifyFounderPayment({
      email: customerEmail,
      plan: resolvedPlanKey,
      amount: session.amount_total || undefined,
      type: 'new',
      userId: profileId,
    });

    // Trigger onboarding sequence for new subscribers
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiro.ai';
      await fetch(`${siteUrl}/api/agents/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({ action: 'schedule', userId: profileId, plan: resolvedPlanKey }),
      });
      console.log('[Webhook] Onboarding scheduled for', resolvedPlanKey);
    } catch (e) {
      console.warn('[Webhook] Failed to schedule onboarding:', e);
    }

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

      // Auto-transition Sprint → Solo après 3 jours
      // 1. Créditer 4,99€ sur le solde client (sera déduit du 1er mois Solo)
      // 2. Programmer l'abonnement Solo avec coupon -40€ (89€ - 40€ - 4,99€ crédit = 44,01€)
      const customerId = session.customer as string;
      if (customerId) {
        const stripe = getStripe();

        // Crédit de 4,99€ sur le solde client
        try {
          await stripe.customers.createBalanceTransaction(customerId, {
            amount: -499, // négatif = crédit client (4,99€)
            currency: 'eur',
            description: 'Crédit Sprint déduit du 1er mois Solo',
          });
          console.log('[Webhook] Sprint credit applied to customer balance:', customerId);
        } catch (e) {
          console.error('[Webhook] Failed to apply Sprint credit:', e);
        }

        // Programmer l'abonnement Pro dans 3 jours avec coupon 1er mois
        const proPriceId = process.env.STRIPE_PRICE_PRO;
        const firstMonthCoupon = process.env.STRIPE_COUPON_FIRST_MONTH; // coupon -40€
        if (proPriceId) {
          try {
            const startDate = Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60); // +3 jours
            const scheduleParams: any = {
              customer: customerId,
              start_date: startDate,
              end_behavior: 'release', // continue l'abonnement normalement
              phases: [
                {
                  items: [{ price: proPriceId, quantity: 1 }],
                  coupon: firstMonthCoupon || undefined, // -40€ → 49€ - 4,99€ crédit = 44,01€
                  iterations: 1, // 1 mois avec coupon
                  metadata: { planKey: 'pro', userId: profileId, upgrade_from: 'sprint' },
                },
                {
                  items: [{ price: proPriceId, quantity: 1 }],
                  // Pas de coupon → 89€/mois plein tarif
                  metadata: { planKey: 'pro', userId: profileId },
                },
              ],
            };

            const schedule = await stripe.subscriptionSchedules.create(scheduleParams);
            console.log('[Webhook] Solo subscription scheduled after Sprint:', {
              scheduleId: schedule.id,
              customerId,
              startsAt: new Date(startDate * 1000).toISOString(),
              firstMonthWithCoupon: !!firstMonthCoupon,
            });

            // Sauvegarder l'ID du schedule pour pouvoir annuler si besoin
            await supabase
              .from('profiles')
              .update({ stripe_schedule_id: schedule.id })
              .eq('id', profileId);

          } catch (e: any) {
            console.error('[Webhook] Failed to schedule Solo subscription:', e.message);
          }
        } else {
          console.warn('[Webhook] STRIPE_PRICE_SOLO not configured — Sprint stays standalone');
        }
      }

      console.log('[Webhook] Sprint activated with auto-upgrade:', { userId: profileId });

      // Notify founder
      const sprintEmail = session.customer_details?.email || session.customer_email || '';
      await notifyFounderPayment({
        email: sprintEmail,
        plan: 'sprint',
        amount: session.amount_total || undefined,
        type: 'sprint',
        userId: profileId,
      });

      // Trigger onboarding sequence for Sprint
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiro.ai';
        await fetch(`${siteUrl}/api/agents/onboarding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
          body: JSON.stringify({ action: 'schedule', userId: profileId, plan: 'sprint' }),
        });
        console.log('[Webhook] Sprint onboarding scheduled');
      } catch (e) {
        console.warn('[Webhook] Failed to schedule Sprint onboarding:', e);
      }

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

        // Notify founder
        const packEmail = session.customer_details?.email || session.customer_email || '';
        await notifyFounderPayment({
          email: packEmail,
          plan: planKey,
          amount: session.amount_total || undefined,
          type: 'pack',
          userId: profileId,
        });
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
// NOTIFICATION FONDATEUR — Alerte paiement reçu
// ====================================================================
async function notifyFounderPayment(info: {
  email: string;
  plan: string;
  amount?: number;
  type: 'new' | 'renewal' | 'pack' | 'sprint';
  userId?: string;
}) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const FOUNDER_EMAILS = (process.env.FOUNDER_EMAIL || 'mrzirraro@gmail.com,contact@keiroai.com').split(',').map(e => e.trim());

  const planLabels: Record<string, string> = {
    sprint: 'Sprint (4,99€/3j)',
    pro: 'Pro (89€/mois)',
    fondateurs: 'Fondateurs (149€/mois)',
    standard: 'Standard (199€/mois)',
    business: 'Business (349€/mois)',
    elite: 'Elite (999€/mois)',
    pack_starter: 'Pack Starter (14,99€)',
    pack_pro: 'Pack Pro (39,99€)',
    pack_expert: 'Pack Expert (69,99€)',
  };

  const typeLabels: Record<string, string> = {
    new: 'NOUVEAU CLIENT',
    renewal: 'RENOUVELLEMENT',
    pack: 'ACHAT PACK',
    sprint: 'SPRINT',
  };

  const label = planLabels[info.plan] || info.plan;
  const typeLabel = typeLabels[info.type] || info.type.toUpperCase();
  const amountStr = info.amount ? `${(info.amount / 100).toFixed(2)}€` : '';

  const subject = `💰 ${typeLabel} — ${info.email} → ${label}`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;color:#333;padding:20px;">
<div style="max-width:500px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
    <h2 style="margin:0;">💰 ${typeLabel}</h2>
  </div>
  <div style="background:#f9fafb;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <table style="width:100%;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;">Client</td><td style="padding:8px 0;font-weight:bold;">${info.email}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Plan</td><td style="padding:8px 0;font-weight:bold;">${label}</td></tr>
      ${amountStr ? `<tr><td style="padding:8px 0;color:#6b7280;">Montant</td><td style="padding:8px 0;font-weight:bold;color:#16a34a;">${amountStr}</td></tr>` : ''}
      ${info.userId ? `<tr><td style="padding:8px 0;color:#6b7280;">User ID</td><td style="padding:8px 0;font-size:11px;color:#9ca3af;">${info.userId}</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#6b7280;">Date</td><td style="padding:8px 0;">${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</td></tr>
    </table>
  </div>
</div>
</body></html>`;

  // Try Resend first (more reliable for transactional)
  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'KeiroAI <contact@keiroai.com>',
          to: FOUNDER_EMAILS,
          subject,
          html,
        }),
      });
      if (res.ok) {
        console.log('[Webhook] Payment notification sent via Resend');
        return;
      }
    } catch (e: any) {
      console.error('[Webhook] Resend notification error:', e.message);
    }
  }

  // Fallback Brevo
  if (BREVO_API_KEY) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'KeiroAI', email: 'contact@keiroai.com' },
          to: FOUNDER_EMAILS.map(email => ({ email })),
          subject,
          htmlContent: html,
        }),
      });
      if (res.ok) {
        console.log('[Webhook] Payment notification sent via Brevo');
        return;
      }
    } catch (e: any) {
      console.error('[Webhook] Brevo notification error:', e.message);
    }
  }

  console.warn('[Webhook] No email provider for payment notification');
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

  // Notify founder of renewal
  const { data: renewProfile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', profile.id)
    .single();

  if (renewProfile?.email) {
    await notifyFounderPayment({
      email: renewProfile.email,
      plan: planKey,
      amount: invoice.amount_paid || undefined,
      type: 'renewal',
      userId: profile.id,
    });
  }
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

  // Récupérer email et infos avant la mise à jour
  const { data: userProfile } = await supabase
    .from('profiles')
    .select('email, subscription_plan, stripe_schedule_id, stripe_customer_id')
    .eq('id', profileId)
    .single();

  const oldPlan = userProfile?.subscription_plan || 'unknown';
  const freeCredits = PLAN_CREDITS.free || 15;

  // Annuler aussi le schedule Sprint→Solo si existant
  if (userProfile?.stripe_schedule_id) {
    try {
      const stripe = getStripe();
      await stripe.subscriptionSchedules.cancel(userProfile.stripe_schedule_id);
      console.log('[Webhook] Sprint schedule cancelled:', userProfile.stripe_schedule_id);
    } catch (e: any) {
      console.error('[Webhook] Failed to cancel schedule:', e.message);
    }
  }

  await supabase
    .from('profiles')
    .update({
      subscription_plan: 'free',
      credits_balance: freeCredits,
      credits_monthly_allowance: freeCredits,
      credits_reset_at: new Date().toISOString(),
      stripe_subscription_id: null,
      stripe_current_period_end: null,
      stripe_schedule_id: null,
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

  // Envoyer email de confirmation d'annulation
  if (userProfile?.email) {
    await sendCancellationEmail(userProfile.email, oldPlan);
  }

  console.log('[Webhook] Subscription cancelled:', { userId: profileId, oldPlan });
}

/**
 * Envoyer un email de confirmation d'annulation
 */
async function sendCancellationEmail(email: string, planName: string) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  const planLabels: Record<string, string> = {
    sprint: 'Sprint Fondateur',
    pro: 'Pro',
    fondateurs: 'Fondateurs',
    standard: 'Standard',
    business: 'Business',
    elite: 'Elite',
  };

  const planLabel = planLabels[planName] || planName;

  const html = `
<!DOCTYPE html>
<html>
<head><style>body{font-family:Arial,sans-serif;color:#333;line-height:1.6;}.container{max-width:540px;margin:0 auto;padding:30px 20px;}h2{color:#0c1a3a;}</style></head>
<body>
<div class="container">
  <h2>Votre abonnement a bien été annulé</h2>
  <p>Bonjour,</p>
  <p>Nous confirmons l'annulation de votre abonnement <strong>${planLabel}</strong> sur KeiroAI.</p>
  <p>Votre compte reste actif avec le plan Gratuit (15 crédits/mois). Vous pouvez vous réabonner à tout moment depuis votre espace <a href="https://keiroai.com/mon-compte?section=billing" style="color:#0c1a3a;">Mon compte</a>.</p>
  <p>Si cette annulation est une erreur ou si vous avez des questions, répondez simplement à cet email.</p>
  <p style="margin-top:24px;">L'équipe KeiroAI</p>
  <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;"/>
  <p style="color:#9ca3af;font-size:11px;">Cet email est envoyé automatiquement suite à votre demande d'annulation.</p>
</div>
</body>
</html>`;

  // Try Brevo first
  if (BREVO_API_KEY) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'KeiroAI', email: 'contact@keiroai.com' },
          to: [{ email }],
          subject: 'Confirmation d\'annulation de votre abonnement KeiroAI',
          htmlContent: html,
          replyTo: { email: 'contact@keiroai.com' },
        }),
      });
      if (res.ok) {
        console.log('[Webhook] Cancellation email sent via Brevo to', email);
        return;
      }
    } catch (e: any) {
      console.error('[Webhook] Brevo cancellation email error:', e.message);
    }
  }

  // Fallback Resend
  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'KeiroAI <contact@keiroai.com>',
          to: [email],
          subject: 'Confirmation d\'annulation de votre abonnement KeiroAI',
          html,
        }),
      });
      if (res.ok) {
        console.log('[Webhook] Cancellation email sent via Resend to', email);
        return;
      }
    } catch (e: any) {
      console.error('[Webhook] Resend cancellation email error:', e.message);
    }
  }

  console.warn('[Webhook] No email provider available for cancellation email');
}

// ====================================================================
// SCHEDULE CANCELED — Sprint annulé avant transition Solo
// ====================================================================
async function handleScheduleCanceled(schedule: any) {
  const supabase = getSupabaseAdmin();
  const customerId = schedule.customer as string;
  if (!customerId) return;

  // Trouver l'user par stripe_schedule_id ou stripe_customer_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, subscription_plan, stripe_schedule_id')
    .or(`stripe_schedule_id.eq.${schedule.id},stripe_customer_id.eq.${customerId}`)
    .single();

  if (!profile) {
    console.log('[Webhook] No profile for cancelled schedule:', schedule.id);
    return;
  }

  // Nettoyer le schedule_id
  await supabase
    .from('profiles')
    .update({ stripe_schedule_id: null })
    .eq('id', profile.id);

  // Si encore en Sprint, le Sprint expire naturellement dans 3 jours via credits_expires_at
  console.log('[Webhook] Schedule cancelled (Sprint→Solo transition stopped):', { userId: profile.id, scheduleId: schedule.id });

  // Envoyer email de confirmation
  if (profile.email) {
    await sendCancellationEmail(profile.email, profile.subscription_plan || 'sprint');
  }
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
