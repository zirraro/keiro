import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { getStripe, getPriceToPlan } from '@/lib/stripe';
import { PLAN_CREDITS } from '@/lib/credits/constants';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/stripe/claim-payment
 *
 * Appelé après login/signup quand un paiement Stripe a été effectué AVANT
 * la création du compte. Récupère la session Stripe et active le plan.
 *
 * Body: { sessionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentification requise
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId requis' }, { status: 400 });
    }

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    // 2. Récupérer la session Stripe
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      });
    } catch {
      return NextResponse.json({ error: 'Session Stripe introuvable' }, { status: 404 });
    }

    // 3. Vérifier que le paiement est complété
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json({ error: 'Paiement non finalisé' }, { status: 400 });
    }

    // 4. Vérifier si le plan n'est pas déjà activé pour cet user
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_plan, credits_balance, stripe_customer_id')
      .eq('id', user.id)
      .single();

    const planKey = session.metadata?.planKey;
    if (!planKey) {
      return NextResponse.json({ error: 'Plan non identifié dans la session' }, { status: 400 });
    }

    // Si déjà activé par le webhook (race condition), retourner ok
    if (profile?.subscription_plan === planKey && profile?.subscription_plan !== 'free') {
      console.log('[ClaimPayment] Plan already active:', planKey);
      return NextResponse.json({ ok: true, alreadyActive: true, plan: planKey });
    }

    const customerId = (session.customer as string) || profile?.stripe_customer_id;

    // 5. Activer selon le type de plan
    if (session.mode === 'subscription') {
      // ---- ABONNEMENT RÉCURRENT ----
      const subscription = session.subscription as Stripe.Subscription;
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : subscription?.id;

      const credits = PLAN_CREDITS[planKey] || 0;

      let periodEnd: string | null = null;
      if (subscription && (subscription as any).current_period_end) {
        periodEnd = new Date((subscription as any).current_period_end * 1000).toISOString();
      }

      await supabase
        .from('profiles')
        .update({
          subscription_plan: planKey,
          credits_balance: credits,
          credits_monthly_allowance: credits,
          credits_reset_at: new Date().toISOString(),
          credits_expires_at: null,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_current_period_end: periodEnd,
        })
        .eq('id', user.id);

      await supabase.from('credit_transactions').insert({
        user_id: user.id,
        amount: credits,
        balance_after: credits,
        type: 'subscription',
        feature: `plan_${planKey}`,
        description: `Abonnement ${planKey} activé (lié après paiement)`,
      });

      console.log('[ClaimPayment] Subscription activated:', { userId: user.id, planKey, credits });

    } else if (session.mode === 'payment') {
      if (planKey === 'sprint') {
        // ---- SPRINT ----
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
            stripe_customer_id: customerId,
          })
          .eq('id', user.id);

        await supabase.from('credit_transactions').insert({
          user_id: user.id,
          amount: credits,
          balance_after: credits,
          type: 'subscription',
          feature: 'plan_sprint',
          description: 'Sprint activé (lié après paiement)',
        });

        // Créditer 4,99€ sur le solde Stripe du client
        if (customerId) {
          try {
            await stripe.customers.createBalanceTransaction(customerId, {
              amount: -499,
              currency: 'eur',
              description: 'Crédit Sprint déduit du prochain abonnement',
            });
          } catch (e) {
            console.error('[ClaimPayment] Failed to apply Sprint credit:', e);
          }
        }

        console.log('[ClaimPayment] Sprint activated:', { userId: user.id });

      } else if (planKey.startsWith('pack_')) {
        // ---- PACK CRÉDITS ----
        const packCredits: Record<string, number> = {
          pack_starter: 50,
          pack_pro: 150,
          pack_expert: 300,
        };
        const credits = packCredits[planKey] || 0;
        const currentBalance = profile?.credits_balance ?? 0;
        const newBalance = currentBalance + credits;

        await supabase
          .from('profiles')
          .update({
            credits_balance: newBalance,
            stripe_customer_id: customerId,
          })
          .eq('id', user.id);

        await supabase.from('credit_transactions').insert({
          user_id: user.id,
          amount: credits,
          balance_after: newBalance,
          type: 'credit_pack',
          feature: 'credit_pack',
          description: `Pack ${planKey.replace('pack_', '')} : +${credits} crédits (lié après paiement)`,
        });

        console.log('[ClaimPayment] Pack activated:', { userId: user.id, credits });
      }
    }

    return NextResponse.json({ ok: true, plan: planKey });
  } catch (error: any) {
    console.error('[ClaimPayment] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
