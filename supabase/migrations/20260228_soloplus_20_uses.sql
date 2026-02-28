-- Augmenter SOLOPLUS à 20 utilisations max
UPDATE public.promo_codes SET max_uses = 20 WHERE code = 'SOLOPLUS';
