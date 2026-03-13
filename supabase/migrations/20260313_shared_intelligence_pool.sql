-- Shared Intelligence Pool: expand agent_orders for cross-agent directives
-- CEO + Marketing can now emit strategic directives to ANY agent

-- Allow 'all' and 'marketing' as targets for directives
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check;
ALTER TABLE agent_orders ADD CONSTRAINT agent_orders_to_agent_check
  CHECK (to_agent IN ('chatbot', 'email', 'gmaps', 'dm_instagram', 'tiktok_comments', 'commercial', 'seo', 'onboarding', 'retention', 'content', 'marketing', 'all'));

-- Allow 'marketing' as from_agent
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_from_agent_check;

-- Add instagram_permalink column to content_calendar for tracking real publications
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS instagram_permalink TEXT;

-- Index for directive lookups (agents check for pending directives)
CREATE INDEX IF NOT EXISTS idx_agent_orders_directive_lookup
  ON agent_orders(to_agent, status, created_at DESC);
