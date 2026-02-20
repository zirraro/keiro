import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

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
  1900: 100,  // 19€ → 100 crédits
  4900: 300,  // 49€ → 300 crédits (attention: même montant que Solo)
  6900: 500,  // 69€ → 500 crédits
};
