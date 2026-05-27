-- 2026-05-27 — Scrape-first enrichment (Léo)
-- Add crm_prospects.business_notes (JSONB) populated by the cheap
-- scrape-enrich pipeline (website + Instagram). Hugo reads this when
-- building personalised visual briefs. last_enriched_at lets us
-- re-scrape every 14 days without redoing fresh fiches.
-- Applied via Supabase Management API; this file documents the change.

ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS business_notes jsonb;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_crm_prospects_last_enriched ON crm_prospects (last_enriched_at);
