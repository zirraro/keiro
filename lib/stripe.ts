import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Lazy initialization pour éviter crash au build (env vars pas encore dispo)
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-01-28.clover',
    });
  }
  return _stripe;
}

// ====== LEGACY: Mapping montant → plan (fallback pour anciens payment links) ======
export const AMOUNT_TO_PLAN: Record<number, string> = {
  499: 'sprint',       // 4,99€
  8900: 'pro',         // 89€
  14900: 'fondateurs', // 149€
  19900: 'standard',   // 199€
  34900: 'business',   // 349€
  99900: 'elite',      // 999€
};

// Mapping montant en centimes → pack crédits
export const AMOUNT_TO_PACK: Record<number, number> = {
  1499: 50,   // 14,99€ → 50 crédits
  3999: 150,  // 39,99€ → 150 crédits
  6999: 300,  // 69,99€ → 300 crédits
};

// ====== NOUVEAU: Mapping Price ID → plan (abonnements récurrents) ======

// Plans qui sont des abonnements récurrents (mensuel ou annuel)
export const SUBSCRIPTION_PLANS = ['createur', 'pro', 'fondateurs', 'standard', 'business', 'elite'];
// Les variantes annuelles utilisent le même plan mais un Price ID annuel
export const ANNUAL_PLAN_SUFFIX = '_annual';

// Mapping planKey → Stripe Price ID mensuel
// CHAQUE plan a son propre Price ID — pas de fallback pour eviter les erreurs de tarif
export function getPlanToPrice(): Record<string, string | undefined> {
  return {
    createur: process.env.STRIPE_PRICE_CREATEUR,   // 49€/mois — price_1T3yBKBHEPG6p3au7pMCUeAL
    pro: process.env.STRIPE_PRICE_PRO,              // 99€/mois — price_1TEasVBHEPG6p3auZVsNdo9t
    fondateurs: process.env.STRIPE_PRICE_FONDATEURS, // 149€/mois — price_1T3y7QBHEPG6p3au0ODGBtvg
    standard: process.env.STRIPE_PRICE_STANDARD,
    business: process.env.STRIPE_PRICE_BUSINESS,    // 349€/mois — price_1T3yDuBHEPG6p3auEqX61jg8
    elite: process.env.STRIPE_PRICE_ELITE,          // 999€/mois — price_1T3y9OBHEPG6p3audGOfSvEA
  };
}

// Mapping planKey → Stripe Price ID annuel
export function getPlanToPriceAnnual(): Record<string, string | undefined> {
  return {
    createur: process.env.STRIPE_PRICE_CREATEUR_ANNUAL,
    pro: process.env.STRIPE_PRICE_PRO_ANNUAL,
    fondateurs: process.env.STRIPE_PRICE_FONDATEURS_ANNUAL,
    standard: process.env.STRIPE_PRICE_STANDARD_ANNUAL,
    business: process.env.STRIPE_PRICE_BUSINESS_ANNUAL,
    elite: process.env.STRIPE_PRICE_ELITE_ANNUAL,
  };
}

// Mapping Stripe Price ID → planKey (mensuel + annuel)
export function getPriceToPlan(): Record<string, string> {
  const map: Record<string, string> = {};
  // Mensuel
  if (process.env.STRIPE_PRICE_CREATEUR) map[process.env.STRIPE_PRICE_CREATEUR] = 'createur';
  if (process.env.STRIPE_PRICE_PRO) map[process.env.STRIPE_PRICE_PRO] = 'pro';
  if (process.env.STRIPE_PRICE_FONDATEURS) map[process.env.STRIPE_PRICE_FONDATEURS] = 'fondateurs';
  if (process.env.STRIPE_PRICE_STANDARD) map[process.env.STRIPE_PRICE_STANDARD] = 'standard';
  if (process.env.STRIPE_PRICE_BUSINESS) map[process.env.STRIPE_PRICE_BUSINESS] = 'business';
  if (process.env.STRIPE_PRICE_ELITE) map[process.env.STRIPE_PRICE_ELITE] = 'elite';
  // Annuel (même plan, facturation différente)
  if (process.env.STRIPE_PRICE_PRO_ANNUAL) map[process.env.STRIPE_PRICE_PRO_ANNUAL] = 'pro';
  if (process.env.STRIPE_PRICE_FONDATEURS_ANNUAL) map[process.env.STRIPE_PRICE_FONDATEURS_ANNUAL] = 'fondateurs';
  if (process.env.STRIPE_PRICE_STANDARD_ANNUAL) map[process.env.STRIPE_PRICE_STANDARD_ANNUAL] = 'standard';
  if (process.env.STRIPE_PRICE_BUSINESS_ANNUAL) map[process.env.STRIPE_PRICE_BUSINESS_ANNUAL] = 'business';
  if (process.env.STRIPE_PRICE_ELITE_ANNUAL) map[process.env.STRIPE_PRICE_ELITE_ANNUAL] = 'elite';
  return map;
}

// Sprint = one-time payment
export function getSprintPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_SPRINT;
}

// Pack crédits Price IDs
export function getPackPrices(): Record<string, string | undefined> {
  return {
    pack_starter: process.env.STRIPE_PRICE_PACK_STARTER,
    pack_pro: process.env.STRIPE_PRICE_PACK_PRO,
    pack_expert: process.env.STRIPE_PRICE_PACK_EXPERT,
  };
}

/**
 * Créer ou réutiliser un Stripe Customer pour un utilisateur.
 * Stocke le customer ID dans profiles.stripe_customer_id.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  name?: string
): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Vérifier si l'user a déjà un stripe_customer_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  // 2. Créer un nouveau Stripe Customer
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: { supabase_user_id: userId },
  });

  // 3. Sauvegarder le customer ID
  await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);

  return customer.id;
}
