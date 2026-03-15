-- Add JSONB data column to crm_activities for storing email metadata (step, subject, category, etc.)
ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';

-- Index for filtering by email step
CREATE INDEX IF NOT EXISTS idx_crm_activities_data_step ON crm_activities ((data->>'step'));
