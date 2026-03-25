-- ═══ CLIENT NOTIFICATIONS — Notifications agent → client ═══

-- Table pour les notifications in-app des agents vers les clients
CREATE TABLE IF NOT EXISTS client_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent TEXT NOT NULL, -- 'ceo', 'email', 'commercial', etc.
  type TEXT NOT NULL DEFAULT 'info', -- 'info', 'alert', 'action', 'brief', 'question'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_client_notif_user ON client_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_client_notif_unread ON client_notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_client_notif_agent ON client_notifications(user_id, agent);

-- RLS pour que chaque client ne voie que ses notifications
ALTER TABLE client_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_notif_select_own') THEN
    CREATE POLICY client_notif_select_own ON client_notifications FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_notif_update_own') THEN
    CREATE POLICY client_notif_update_own ON client_notifications FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Table pour les préférences de brief CEO du client
CREATE TABLE IF NOT EXISTS client_brief_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  frequency TEXT DEFAULT 'daily', -- 'daily', 'twice_daily', 'weekly'
  preferred_hour INTEGER DEFAULT 9, -- heure locale (0-23)
  email_enabled BOOLEAN DEFAULT true,
  inapp_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brief_prefs_user ON client_brief_preferences(user_id);

ALTER TABLE client_brief_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brief_prefs_select_own') THEN
    CREATE POLICY brief_prefs_select_own ON client_brief_preferences FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brief_prefs_upsert_own') THEN
    CREATE POLICY brief_prefs_upsert_own ON client_brief_preferences FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
