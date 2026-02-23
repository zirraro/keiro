-- ============================================
-- MIGRATION: Stripe Subscription Tracking
-- Date: 2026-02-23
-- ============================================

-- Colonnes pour tracker le client et l'abonnement Stripe
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMPTZ;

-- Index pour lookup rapide par stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Index pour lookup rapide par stripe_subscription_id
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription
  ON public.profiles(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
