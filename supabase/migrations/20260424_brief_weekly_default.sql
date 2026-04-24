-- CEO brief default moves from daily → weekly (included in every plan).
-- Daily is a paid upgrade (consumes credits), managed per-client via the
-- frequency column. Also: add preferred_day so Noah's weekly analysis
-- can point each client's brief at their best engagement day of the week.

-- 1. New column: preferred_day (0=Sun..6=Sat). Nullable = fall back to
--    the global Sunday default until the best-day analysis has enough
--    Brevo open signals to pick a real winner.
ALTER TABLE client_brief_preferences
  ADD COLUMN IF NOT EXISTS preferred_day SMALLINT CHECK (preferred_day IS NULL OR (preferred_day >= 0 AND preferred_day <= 6));

-- 2. Default frequency flips from 'daily' to 'weekly' for NEW rows. We
--    do NOT migrate existing rows — clients who explicitly opted into
--    daily keep it. A frontend toast on next login will notify others
--    that weekly is the new default and that daily is available as an
--    upgrade.
ALTER TABLE client_brief_preferences
  ALTER COLUMN frequency SET DEFAULT 'weekly';

-- 3. Widen the doc comment on frequency so future migrations can see
--    the full set of allowed values.
COMMENT ON COLUMN client_brief_preferences.frequency IS
  'Brief cadence. Included in plan: weekly (default), every_2_days, biweekly, monthly. Paid upgrade: daily (consumes credits per extra send).';
COMMENT ON COLUMN client_brief_preferences.preferred_day IS
  'Day of week (0=Sunday..6=Saturday) Noah targets for weekly/biweekly briefs. Null = Sunday default. Updated by the weekly best-day analysis based on Brevo open signals.';
