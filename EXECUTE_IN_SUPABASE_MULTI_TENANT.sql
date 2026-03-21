-- KeiroAI Multi-Tenant Architecture: Phase B1
-- Run this in Supabase SQL Editor
-- Organizations, members, per-tenant agent configs, org_id on existing tables

-- ============================================================
-- 1. organizations table
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  business_type TEXT,
  industry TEXT,
  locale TEXT DEFAULT 'fr',
  tone_preferences JSONB DEFAULT '{}',
  custom_context TEXT,
  logo_url TEXT,
  plan TEXT DEFAULT 'free',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. organization_members table
-- ============================================================
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- ============================================================
-- 3. org_agent_configs table (per-tenant agent overrides)
-- ============================================================
CREATE TABLE IF NOT EXISTS org_agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  display_name TEXT,
  personality_overrides JSONB,
  custom_instructions TEXT,
  is_enabled BOOLEAN DEFAULT true,
  avatar_url TEXT,
  avatar_3d_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, agent_id)
);

-- ============================================================
-- 4. Add org_id (NULLABLE) to existing tables
-- ============================================================
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE agent_logs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE dm_queue ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE chatbot_sessions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- ============================================================
-- 5. Indexes on org_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_crm_prospects_org_id ON crm_prospects(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_org_id ON crm_activities(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_org_id ON agent_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_orders_org_id ON agent_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_dm_queue_org_id ON dm_queue(org_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_org_id ON chatbot_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_content_calendar_org_id ON content_calendar(org_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_org_id ON blog_posts(org_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_agent_configs_org_id ON org_agent_configs(org_id);

-- ============================================================
-- 6. Create founder organization + backfill placeholder
-- ============================================================
INSERT INTO organizations (id, name, slug, business_type, plan, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'KeiroAI (Fondateur)', 'keiroai-founder', 'saas', 'admin', true)
ON CONFLICT (id) DO NOTHING;
