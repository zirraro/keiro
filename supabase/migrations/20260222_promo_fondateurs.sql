-- 1. Code promo FONDATEURSTEST (330 crédits = moitié Fondateurs, max 10 uses)
INSERT INTO public.promo_codes (code, credits_amount, max_uses, is_active, description, plan_override)
VALUES ('FONDATEURSTEST', 330, 10, true, 'Fondateurs test (330 crédits, accès complet, expire 14j)', 'fondateurs')
ON CONFLICT (code) DO NOTHING;

-- 2. Limiter SOLOPLUS à 10 utilisations
UPDATE public.promo_codes SET max_uses = 10 WHERE code = 'SOLOPLUS';

-- 3. Ajouter colonne credits_expires_at dans profiles (expiration des crédits promo)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits_expires_at TIMESTAMPTZ;
