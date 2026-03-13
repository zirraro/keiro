-- Add 'prospection_commerciale' to allowed source values
ALTER TABLE crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_source_check;
ALTER TABLE crm_prospects ADD CONSTRAINT crm_prospects_source_check
  CHECK (source IN ('dm_instagram', 'email', 'telephone', 'linkedin', 'terrain', 'facebook', 'tiktok', 'recommandation', 'import', 'chatbot', 'prospection_commerciale', 'other'));
