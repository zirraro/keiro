-- Add comptable agent to system constraints
-- Agent Louis — Expert Comptable & Finance

-- Drop and recreate agent_logs constraint to include comptable
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check;
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check1;
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check2;
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_agent_check3;
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_agent_check
  CHECK (agent IN ('ceo', 'chatbot', 'email', 'commercial', 'gmaps', 'dm_instagram', 'tiktok_comments', 'seo', 'onboarding', 'retention', 'content', 'marketing', 'ads', 'rh', 'comptable', 'all'));

-- Drop and recreate agent_orders to_agent constraint
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check;
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check1;
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check2;
ALTER TABLE agent_orders DROP CONSTRAINT IF EXISTS agent_orders_to_agent_check3;
ALTER TABLE agent_orders ADD CONSTRAINT agent_orders_to_agent_check
  CHECK (to_agent IN ('chatbot', 'email', 'gmaps', 'dm_instagram', 'tiktok_comments', 'commercial', 'seo', 'onboarding', 'retention', 'content', 'marketing', 'ads', 'rh', 'comptable', 'all'));

-- Insert default avatar config for comptable agent
INSERT INTO agent_avatars (id, display_name, title, gradient_from, gradient_to, badge_color, personality, custom_instructions, is_active)
VALUES (
  'comptable',
  'Louis',
  'Expert Comptable & Finance',
  '#0e7490',
  '#155e75',
  '#0e7490',
  '{
    "tone": "rigoureux, méthodique, proactif",
    "verbosity": "concis",
    "emoji_usage": "aucun",
    "humor_level": "aucun",
    "expertise_focus": ["comptabilité", "finance", "contrôle de gestion", "prévisions", "SaaS metrics"],
    "language_style": "professionnel tutoiement",
    "signature_catchphrase": "Les chiffres ne mentent jamais."
  }'::jsonb,
  '',
  true
)
ON CONFLICT (id) DO NOTHING;
