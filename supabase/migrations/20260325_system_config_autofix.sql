-- ═══ SYSTEM CONFIG — CEO can auto-fix parameters ═══
-- The CEO agent can modify these configs to fix issues
-- WITHOUT touching code structure. Safe guardrails built-in.

CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  -- Guardrails
  min_value JSONB, -- Minimum allowed value (for numbers)
  max_value JSONB, -- Maximum allowed value (for numbers)
  allowed_values JSONB, -- List of allowed values (for enums)
  category TEXT NOT NULL DEFAULT 'general', -- agent, cron, email, content, system
  -- Audit
  updated_by TEXT DEFAULT 'system', -- 'ceo', 'admin', 'system'
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role on system_config" ON system_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin read system_config" ON system_config FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
);

-- Seed initial configs that CEO can modify
INSERT INTO system_config (key, value, description, min_value, max_value, category) VALUES
-- Email
('email_max_per_day', '300', 'Max emails par jour (Brevo limit)', '10', '500', 'email'),
('email_warmup_week', '1', 'Semaine de warmup actuelle', '1', '10', 'email'),
('email_min_delay_days', '3', 'Delai minimum entre relances (jours)', '1', '14', 'email'),
-- Content
('content_posts_per_day', '3', 'Posts par jour par plateforme', '1', '5', 'content'),
('content_auto_publish', 'true', 'Publication automatique sans validation', NULL, NULL, 'content'),
-- Cron
('cron_dm_batch_size', '50', 'Nombre de DMs prepares par batch', '10', '200', 'cron'),
('cron_email_batch_size', '20', 'Nombre d emails par batch cron', '5', '100', 'cron'),
-- System
('system_max_agent_timeout', '300', 'Timeout max agents (secondes)', '30', '300', 'system'),
('system_learning_min_confidence', '30', 'Confiance minimum pour sauvegarder un learning', '10', '80', 'system'),
('system_event_process_interval', '2', 'Nombre de fois par jour que le CEO traite les events', '1', '4', 'system')
ON CONFLICT (key) DO NOTHING;
