-- KeiroAI Agents: Onboarding, Retention, Content
-- Migration: 20260309_onboarding_retention_content.sql

-- ============================================================
-- 1. ONBOARDING QUEUE — Messages séquentiels pour nouveaux clients
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,           -- h0, h2, h6, h12, d1_morning, d2_morning, d3_transition
  plan TEXT NOT NULL,               -- sprint, pro, fondateurs
  trigger_type TEXT DEFAULT 'time_based',
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  message_text TEXT,                -- Generated message content
  channel TEXT DEFAULT 'email',     -- email, whatsapp (future)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'alert_sent', 'failed')),
  skip_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_queue_status ON onboarding_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_queue_user ON onboarding_queue(user_id);

ALTER TABLE onboarding_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access onboarding_queue" ON onboarding_queue
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Service role full access onboarding_queue" ON onboarding_queue
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 2. RETENTION SCORES — Health tracking par client
-- ============================================================
CREATE TABLE IF NOT EXISTS retention_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  health_score INTEGER NOT NULL DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
  health_level TEXT DEFAULT 'green' CHECK (health_level IN ('green', 'yellow', 'orange', 'red')),
  days_since_login INTEGER DEFAULT 0,
  weekly_generations INTEGER DEFAULT 0,
  weekly_posts INTEGER DEFAULT 0,
  prev_week_generations INTEGER DEFAULT 0,
  days_to_renewal INTEGER,
  plan TEXT,
  monthly_revenue DECIMAL(10,2),
  last_message_sent_at TIMESTAMPTZ,
  last_message_type TEXT,           -- celebration, nudge, reactivation, red_alert
  consecutive_inactive_weeks INTEGER DEFAULT 0,
  cancel_attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_scores_user ON retention_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_retention_scores_level ON retention_scores(health_level);

ALTER TABLE retention_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access retention_scores" ON retention_scores
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Service role full access retention_scores" ON retention_scores
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. CONTENT CALENDAR — Posts planifiés pour les comptes KeiroAI
-- ============================================================
CREATE TABLE IF NOT EXISTS content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'linkedin')),
  format TEXT NOT NULL CHECK (format IN ('carrousel', 'reel', 'story', 'post', 'video', 'text')),
  pillar TEXT CHECK (pillar IN ('tips', 'demo', 'social_proof', 'trends')),
  hook TEXT,                        -- Premier mots qui arrêtent le scroll
  caption TEXT,
  hashtags JSONB DEFAULT '[]',
  visual_description TEXT,
  visual_url TEXT,
  slides JSONB,                     -- Pour carrousels: [{text, style}]
  script TEXT,                      -- Pour vidéos/reels
  scheduled_date DATE,
  scheduled_time TIME,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'skipped')),
  published_at TIMESTAMPTZ,
  engagement_data JSONB,            -- {likes, comments, shares, saves, views}
  ai_generated BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_calendar_date ON content_calendar(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_content_calendar_status ON content_calendar(status);
CREATE INDEX IF NOT EXISTS idx_content_calendar_platform ON content_calendar(platform);

ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access content_calendar" ON content_calendar
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Service role full access content_calendar" ON content_calendar
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4. EXTEND PROFILES — Onboarding + retention tracking
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_score INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 100;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS health_level TEXT DEFAULT 'green';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_generation_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_generations INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sprint_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_renewal_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS quartier TEXT;

-- ============================================================
-- 5. EXPAND agent_logs + agent_orders CHECK constraints
-- ============================================================
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check;
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_agent_check
  CHECK (agent IN ('ceo', 'chatbot', 'email', 'commercial', 'gmaps', 'dm_instagram', 'tiktok_comments', 'seo', 'onboarding', 'retention', 'content'));

ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check;
ALTER TABLE agent_orders ADD CONSTRAINT agent_orders_to_agent_check
  CHECK (to_agent IN ('chatbot', 'email', 'gmaps', 'dm_instagram', 'tiktok_comments', 'commercial', 'seo', 'onboarding', 'retention', 'content'));

-- ============================================================
-- 6. HELPER FUNCTION: Count user generations in N days
-- ============================================================
CREATE OR REPLACE FUNCTION count_user_generations(p_user_id UUID, p_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
  SELECT COALESCE(COUNT(*)::INTEGER, 0)
  FROM saved_images
  WHERE user_id = p_user_id
  AND created_at >= NOW() - (p_days || ' days')::INTERVAL;
$$ LANGUAGE SQL STABLE;

-- Helper: Count user videos in N days
CREATE OR REPLACE FUNCTION count_user_videos(p_user_id UUID, p_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
  SELECT COALESCE(COUNT(*)::INTEGER, 0)
  FROM my_videos
  WHERE user_id = p_user_id
  AND created_at >= NOW() - (p_days || ' days')::INTERVAL;
$$ LANGUAGE SQL STABLE;
