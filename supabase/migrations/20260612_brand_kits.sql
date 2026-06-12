-- Brand kit structuré — brief v3 Section 2 (2026-06-12).
-- Socle des checks durs anti-invention (QA gate, prix/promo/horaires/sujets
-- interdits). org_id = identité client (profiles.id). business_dossiers reste
-- pour le narratif libre (RAG) ; les CONTRAINTES vivent ici.

CREATE TABLE IF NOT EXISTS brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE,
  business_name text NOT NULL,
  vertical text NOT NULL,                  -- 'beaute'|'restaurant'|'coach'|'immobilier'|'boutique'|'autre'
  tone text,
  address text,
  no_public_prices boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,                -- fin onboarding Clara = prérequis toggle auto
  completeness smallint NOT NULL DEFAULT 0,
  -- Champs profil Hugo/Léo B2C (profiling progressif, nullable)
  avg_ticket numeric(10,2),
  slow_days text,
  catchment text,
  collab_offer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brand_kit_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  amount_eur numeric(10,2) NOT NULL CHECK (amount_eur >= 0),
  unit text,
  no_discount boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bk_prices_active ON brand_kit_prices (brand_kit_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS brand_kit_hours (
  brand_kit_id uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time time,
  close_time time,
  closed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (brand_kit_id, weekday, open_time)
);

CREATE TABLE IF NOT EXISTS brand_kit_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  discount_type text CHECK (discount_type IN ('percent','amount','gift')),
  discount_value numeric(10,2),
  conditions text,
  valid_from date NOT NULL,
  valid_to date NOT NULL CHECK (valid_to >= valid_from),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bk_offers_validity ON brand_kit_offers (brand_kit_id, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS brand_kit_forbidden_topics (
  brand_kit_id uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  topic text NOT NULL,
  PRIMARY KEY (brand_kit_id, topic)
);

-- RLS : chaque client gère SON kit (service_role bypass pour les agents serveur).
ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit_forbidden_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bk_owner ON brand_kits;
CREATE POLICY bk_owner ON brand_kits FOR ALL USING (org_id = auth.uid()) WITH CHECK (org_id = auth.uid());

DROP POLICY IF EXISTS bkp_owner ON brand_kit_prices;
CREATE POLICY bkp_owner ON brand_kit_prices FOR ALL
  USING (brand_kit_id IN (SELECT id FROM brand_kits WHERE org_id = auth.uid()))
  WITH CHECK (brand_kit_id IN (SELECT id FROM brand_kits WHERE org_id = auth.uid()));

DROP POLICY IF EXISTS bkh_owner ON brand_kit_hours;
CREATE POLICY bkh_owner ON brand_kit_hours FOR ALL
  USING (brand_kit_id IN (SELECT id FROM brand_kits WHERE org_id = auth.uid()))
  WITH CHECK (brand_kit_id IN (SELECT id FROM brand_kits WHERE org_id = auth.uid()));

DROP POLICY IF EXISTS bko_owner ON brand_kit_offers;
CREATE POLICY bko_owner ON brand_kit_offers FOR ALL
  USING (brand_kit_id IN (SELECT id FROM brand_kits WHERE org_id = auth.uid()))
  WITH CHECK (brand_kit_id IN (SELECT id FROM brand_kits WHERE org_id = auth.uid()));

DROP POLICY IF EXISTS bkft_owner ON brand_kit_forbidden_topics;
CREATE POLICY bkft_owner ON brand_kit_forbidden_topics FOR ALL
  USING (brand_kit_id IN (SELECT id FROM brand_kits WHERE org_id = auth.uid()))
  WITH CHECK (brand_kit_id IN (SELECT id FROM brand_kits WHERE org_id = auth.uid()));
