-- KeiroAI SEO Blog System: blog posts + editorial calendar
-- Agent: seo

-- ============================================================
-- 1. blog_posts: generated SEO articles
-- ============================================================
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  content_html TEXT NOT NULL,
  excerpt TEXT,
  keywords_primary TEXT NOT NULL,
  keywords_secondary JSONB DEFAULT '[]',
  schema_faq JSONB DEFAULT '[]',
  internal_links JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_keywords ON blog_posts(keywords_primary);

-- RLS: public read for published, admin + service_role full access
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published articles" ON blog_posts
  FOR SELECT USING (status = 'published');

CREATE POLICY "Admin full access on blog_posts" ON blog_posts
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

CREATE POLICY "Service role full access blog_posts" ON blog_posts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 2. blog_editorial_calendar: weekly content planning
-- ============================================================
CREATE TABLE IF NOT EXISTS blog_editorial_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  day TEXT,
  keyword_primary TEXT NOT NULL,
  angle TEXT,
  target_business TEXT,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'published', 'skipped')),
  article_id UUID REFERENCES blog_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_calendar_week ON blog_editorial_calendar(week_start);
CREATE INDEX IF NOT EXISTS idx_blog_calendar_status ON blog_editorial_calendar(status);

-- RLS: admin + service_role
ALTER TABLE blog_editorial_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on blog_editorial_calendar" ON blog_editorial_calendar
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

CREATE POLICY "Service role full access calendar" ON blog_editorial_calendar
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. Expand agent_logs CHECK to include 'seo' agent
-- ============================================================
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check;
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_agent_check
  CHECK (agent IN ('ceo', 'chatbot', 'email', 'commercial', 'gmaps', 'dm_instagram', 'tiktok_comments', 'seo'));

-- Expand agent_orders to accept seo as target
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check;
ALTER TABLE agent_orders ADD CONSTRAINT agent_orders_to_agent_check
  CHECK (to_agent IN ('chatbot', 'email', 'gmaps', 'dm_instagram', 'tiktok_comments', 'commercial', 'seo'));
