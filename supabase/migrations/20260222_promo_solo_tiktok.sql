-- Ajouter la colonne plan_override à promo_codes
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS plan_override TEXT;

-- Code promo Solo avec accès TikTok (solo_promo = 220 credits + TikTok débloqué)
INSERT INTO public.promo_codes (code, credits_amount, max_uses, is_active, description, plan_override)
VALUES ('SOLOPLUS', 220, NULL, true, 'Solo + accès TikTok exceptionnel (220 crédits)', 'solo_promo')
ON CONFLICT (code) DO NOTHING;
