-- Global prospect pool — cross-client cache of Places API enrichment.
--
-- Why: every Google Places API call costs €€. Without a pool, if Client A
-- and Client B both target "florists in Lyon 7e", we call the API twice
-- for the same shops. The pool dedups by place_id so the second client
-- pulls from cache (free) instead of hitting Places again.
--
-- ToS compliance: Google Places ToS allows caching the Atmosphere +
-- Contact data for up to 30 days. After 30 days the entry must be
-- refreshed via a new Places call. The cron at
-- /api/cron/prospect-pool-refresh handles this nightly for entries
-- approaching 25+ days old.
--
-- Privacy: this table stores PUBLIC business directory data only
-- (name, address, phone, website, hours, rating). No personal data.

CREATE TABLE IF NOT EXISTS prospect_pool (
  place_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business_type TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  instagram TEXT,
  zone TEXT,
  google_maps_url TEXT,
  google_rating REAL,
  google_reviews INTEGER,
  business_status TEXT,
  types JSONB,
  raw_data JSONB,
  -- TTL tracking — entries older than 30 days must be refreshed per
  -- Google Places ToS. The cron picks anything > 25 days.
  enriched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refresh_due_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '25 days'),
  -- How many times has this entry been served from the pool? Helps
  -- prioritise which entries to keep refreshed.
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_served_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prospect_pool_type_zone
  ON prospect_pool(business_type, zone);

CREATE INDEX IF NOT EXISTS idx_prospect_pool_refresh_due
  ON prospect_pool(refresh_due_at)
  WHERE business_status IS DISTINCT FROM 'CLOSED_PERMANENTLY';

-- Daily Places API spend tracker — one row per day, aggregated.
-- Powers the /admin/places-spend dashboard and the daily cap.
CREATE TABLE IF NOT EXISTS places_spend_daily (
  day DATE PRIMARY KEY,
  text_search_calls INTEGER NOT NULL DEFAULT 0,
  details_calls INTEGER NOT NULL DEFAULT 0,
  pool_hits INTEGER NOT NULL DEFAULT 0,
  estimated_cost_eur NUMERIC(10, 4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
