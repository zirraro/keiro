import { NextRequest, NextResponse } from 'next/server';
import { getStripe, AMOUNT_TO_PLAN } from '@/lib/stripe';
import { PLAN_CREDITS } from '@/lib/credits/constants';
import { createClient } from '@supabase/supabase-js';

// Lazy init pour éviter crash au build
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

  let event;
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email || session.customer_email;
    const amountTotal = session.amount_total; // en centimes

    if (!customerEmail || !amountTotal) {
      console.error('[Stripe Webhook] Missing email or amount:', { customerEmail, amountTotal });
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    console.log('[Stripe Webhook] Payment completed:', { customerEmail, amountTotal });

    // Identifier le plan acheté par le montant
    const planKey = AMOUNT_TO_PLAN[amountTotal];

    if (!planKey) {
      console.warn('[Stripe Webhook] Unknown amount, skipping:', amountTotal);
      return NextResponse.json({ received: true, action: 'unknown_amount' });
    }

    const credits = PLAN_CREDITS[planKey];

    // Trouver le user par email
    const { data: profile, error: findError } = await getSupabaseAdmin()
      .from('profiles')
      .select('id, credits_balance')
      .eq('email', customerEmail.toLowerCase())
      .single();

    if (findError || !profile) {
      console.error('[Stripe Webhook] User not found for email:', customerEmail, findError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Mettre à jour le plan et les crédits
    const { error: updateError } = await getSupabaseAdmin()
      .from('profiles')
      .update({
        subscription_plan: planKey,
        credits_balance: credits,
        credits_monthly_allowance: credits,
        credits_reset_at: new Date().toISOString(),
      })
      .eq('id', profile.id);

    if (updateError) {
      console.error('[Stripe Webhook] Update error:', updateError);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    // Enregistrer la transaction
    await getSupabaseAdmin()
      .from('credit_transactions')
      .insert({
        user_id: profile.id,
        amount: credits,
        balance_after: credits,
        type: 'subscription',
        feature: `plan_${planKey}`,
        description: `Abonnement ${planKey} activé via Stripe`,
      });

    console.log('[Stripe Webhook] Plan updated:', { userId: profile.id, plan: planKey, credits });
    return NextResponse.json({ received: true, plan: planKey, credits });
  }

  // Événements non gérés
  return NextResponse.json({ received: true });
}
