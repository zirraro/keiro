-- Performance indexes for CRM stats dashboard
CREATE INDEX IF NOT EXISTS idx_crm_activities_type_prospect ON crm_activities(type, prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type_created ON crm_activities(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_action_agent ON agent_logs(action, agent, created_at DESC);
