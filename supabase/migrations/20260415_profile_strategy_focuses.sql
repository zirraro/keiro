-- Persist strategy popup selections on the profile
-- Replaces localStorage-only 'keiro_strategy_done' so onboarding survives cache clears.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS strategy_focuses TEXT[],
  ADD COLUMN IF NOT EXISTS strategy_applied_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.strategy_focuses IS 'Strategy focuses picked in the post-login popup (instagram, tiktok, linkedin, prospection, reputation, seo, chatbot). NULL = never shown, empty array = skipped.';
COMMENT ON COLUMN profiles.strategy_applied_at IS 'When the strategy popup was last applied. NULL = never shown.';
