-- 🚨 CRITICAL SECURITY FIX — 2026-06-09
-- Enable Row Level Security on 18 public tables that had no RLS.
-- Alert Supabase: "Table publicly accessible — anyone with project
-- URL can read, edit, delete all data".
--
-- Strategy:
--   1. Enable RLS on every table (default = block all except service_role)
--   2. Add SELECT/INSERT/UPDATE/DELETE policies scoped to user_id when present
--   3. Admin override via profiles.is_admin = true
--   4. Service-role (backend) bypasses RLS automatically
--
-- Notes:
--   - The KeiroAI backend uses SUPABASE_SERVICE_ROLE_KEY → bypasses RLS,
--     so no app-code changes needed.
--   - Frontend queries via NEXT_PUBLIC_SUPABASE_ANON_KEY → will respect
--     these policies (user can only see/edit their own rows).

-- ────────────────────────────────────────────────────────────
-- USER-SCOPED TABLES (user_id column)
-- ────────────────────────────────────────────────────────────

ALTER TABLE agent_learnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_agent_learnings" ON agent_learnings;
CREATE POLICY "user_owns_agent_learnings" ON agent_learnings
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE anomaly_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_only_anomaly_alerts" ON anomaly_alerts;
CREATE POLICY "admin_only_anomaly_alerts" ON anomaly_alerts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE directive_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_directive_failures" ON directive_failures;
CREATE POLICY "user_owns_directive_failures" ON directive_failures
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE gmaps_scan_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_gmaps_scan_history" ON gmaps_scan_history;
CREATE POLICY "user_owns_gmaps_scan_history" ON gmaps_scan_history
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE tracked_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_tracked_links" ON tracked_links;
CREATE POLICY "user_owns_tracked_links" ON tracked_links
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE feature_interests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_feature_interests" ON feature_interests;
CREATE POLICY "user_owns_feature_interests" ON feature_interests
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE org_agent_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_org_agent_configs" ON org_agent_configs;
CREATE POLICY "user_owns_org_agent_configs" ON org_agent_configs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_owns_organization_members" ON organization_members;
CREATE POLICY "user_owns_organization_members" ON organization_members
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- design_templates = read for everyone (templates partagés), write owner only
ALTER TABLE design_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_design_templates" ON design_templates;
CREATE POLICY "public_read_design_templates" ON design_templates
  FOR SELECT TO authenticated, anon
  USING (true);
DROP POLICY IF EXISTS "user_writes_design_templates" ON design_templates;
CREATE POLICY "user_writes_design_templates" ON design_templates
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- ────────────────────────────────────────────────────────────
-- ADMIN-ONLY TABLES (no per-user scope, service_role + admin only)
-- ────────────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_only_organizations" ON organizations;
CREATE POLICY "admin_only_organizations" ON organizations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = organizations.id AND om.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE prospect_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_only_prospect_pool" ON prospect_pool;
CREATE POLICY "admin_only_prospect_pool" ON prospect_pool
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE dm_visual_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_only_dm_visual_cache" ON dm_visual_cache;
CREATE POLICY "admin_only_dm_visual_cache" ON dm_visual_cache
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE external_cost_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_only_external_cost_uploads" ON external_cost_uploads;
CREATE POLICY "admin_only_external_cost_uploads" ON external_cost_uploads
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE places_spend_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_only_places_spend_daily" ON places_spend_daily;
CREATE POLICY "admin_only_places_spend_daily" ON places_spend_daily
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE global_agent_directives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_only_global_agent_directives" ON global_agent_directives;
CREATE POLICY "admin_only_global_agent_directives" ON global_agent_directives
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- ────────────────────────────────────────────────────────────
-- SYSTEM TABLES (read-only for authenticated, write admin only)
-- ────────────────────────────────────────────────────────────

ALTER TABLE agent_avatars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_agent_avatars" ON agent_avatars;
CREATE POLICY "authenticated_read_agent_avatars" ON agent_avatars
  FOR SELECT TO authenticated, anon
  USING (true);
DROP POLICY IF EXISTS "admin_write_agent_avatars" ON agent_avatars;
CREATE POLICY "admin_write_agent_avatars" ON agent_avatars
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE content_trend_winners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_content_trend_winners" ON content_trend_winners;
CREATE POLICY "authenticated_read_content_trend_winners" ON content_trend_winners
  FOR SELECT TO authenticated
  USING (true);

ALTER TABLE free_generations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_only_free_generations" ON free_generations;
CREATE POLICY "admin_only_free_generations" ON free_generations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
