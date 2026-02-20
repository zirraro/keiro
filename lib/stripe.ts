import Stripe from 'stripe';

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

// Mapping montant en centimes → plan Keiro
// Permet d'identifier le plan acheté via payment links
export const AMOUNT_TO_PLAN: Record<number, string> = {
  499: 'sprint',       // 4,99€
  4900: 'solo',        // 49€
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
