import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { getStripe, getPlanToPriceAnnual, getPriceToPlan } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * PASSAGE À L'ANNUEL — « 2 mois offerts » (Fable 5 §levier 3).
 * Doctrine : JAMAIS proposé à l'inscription. Ce endpoint est déclenché aux BONS
 * moments (fin d'essai convertie + mois 2 après un brief positif) via un bouton
 * dédié dans l'espace facturation. Le prix annuel (= 10× mensuel) intègre déjà
 * les 2 mois offerts.
 *
 * On bascule le prix de l'abonnement EXISTANT vers son équivalent annuel :
 *  - en essai (trialing) → proration_behavior 'none' : facturé annuel à la fin
 *    de l'essai, l'essai est préservé.
 *  - actif (mois 2) → 'create_prorations' : crédit du temps mensuel non consommé.
 * POST (auth). Idempotent : si déjà annuel, renvoie already=true.
 */
export async function POST() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, subscription_plan')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: 'Aucun abonnement actif trouvé' }, { status: 400 });
    }

    const stripe = getStripe();
    // Abonnement en cours (actif OU en essai) du client.
    const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: 'all', limit: 10 });
    const sub = subs.data.find(s => s.status === 'active' || s.status === 'trialing');
    if (!sub) return NextResponse.json({ error: 'Aucun abonnement actif ou en essai' }, { status: 400 });

    const item = sub.items.data[0];
    const currentPriceId = item?.price?.id;
    const priceToPlan = getPriceToPlan();
    const annualPrices = getPlanToPriceAnnual();

    // Plan courant : d'abord via le prix Stripe, sinon via le profil.
    const plan = (currentPriceId && priceToPlan[currentPriceId]) || (profile.subscription_plan || '').toLowerCase();
    const annualPriceId = annualPrices[plan];
    if (!annualPriceId) {
      return NextResponse.json({ error: `Tarif annuel indisponible pour le plan ${plan || '?'}` }, { status: 400 });
    }
    if (currentPriceId === annualPriceId) {
      return NextResponse.json({ ok: true, already: true, message: 'Déjà en facturation annuelle' });
    }

    const isTrialing = sub.status === 'trialing';
    const updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: annualPriceId }],
      proration_behavior: isTrialing ? 'none' : 'create_prorations',
      metadata: { ...(sub.metadata || {}), billing: 'annual', planKey: plan },
    });

    // Trace (best-effort) — sert la mesure conversion mensuel→annuel (§4 instrum.).
    await supabase.from('agent_logs').insert({
      agent: 'system', action: 'switch_to_annual', status: 'ok',
      data: { user_id: user.id, plan, was_trialing: isTrialing, sub: sub.id },
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true, plan, billing: 'annual', trialing: isTrialing, status: updated.status });
  } catch (error: any) {
    console.error('[Stripe SwitchAnnual] Error:', error?.message);
    return NextResponse.json({ error: error?.message || 'Erreur serveur' }, { status: 500 });
  }
}
