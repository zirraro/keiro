-- Live cost tracking table — chaque appel API externe loggue son coût
-- en EUR + métadonnées pour pilotage admin en temps réel.
--
-- Founder ask 2026-06-09 : "centraliser dans admin un pilotage des
-- couts en live avec les data des generations et des api google et
-- anthropic et eleven labs ect... pilotage fin pour maitriser les
-- marges au plus pret du reel".

CREATE TABLE IF NOT EXISTS api_cost_events (
  id            BIGSERIAL PRIMARY KEY,
  provider      TEXT NOT NULL,            -- 'anthropic', 'gemini', 'seedream', 'seedance', 'kling', 'places', 'elevenlabs', 'brevo'
  kind          TEXT NOT NULL,            -- 'sonnet_input', 'sonnet_output', 'haiku_input', 'image_gen', 'video_5s', 'place_details', 'place_search', etc.
  units         NUMERIC(12,4) NOT NULL,   -- # tokens, # calls, # seconds, etc.
  cost_eur      NUMERIC(10,6) NOT NULL,   -- coût en EUR (peut être tiny)
  user_id       UUID NULL,                -- attribué client si applicable
  agent         TEXT NULL,                -- 'content', 'dm_instagram', 'gmaps', etc.
  metadata      JSONB NULL,               -- détail libre (model, duration, etc.)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_cost_events_provider_created
  ON api_cost_events (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_cost_events_user_created
  ON api_cost_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_cost_events_agent_created
  ON api_cost_events (agent, created_at DESC)
  WHERE agent IS NOT NULL;

-- Index pour les queries d'agrégation par jour
CREATE INDEX IF NOT EXISTS idx_api_cost_events_created_at
  ON api_cost_events (created_at DESC);

-- RLS : admin only
ALTER TABLE api_cost_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_only_api_cost_events" ON api_cost_events;
CREATE POLICY "admin_only_api_cost_events" ON api_cost_events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
