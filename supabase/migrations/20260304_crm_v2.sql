-- CRM v2: Enhanced prospect tracking
-- Update status values
ALTER TABLE crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_status_check;
ALTER TABLE crm_prospects ADD CONSTRAINT crm_prospects_status_check
  CHECK (status IN ('identifie', 'contacte', 'repondu', 'demo', 'sprint', 'client', 'perdu'));

-- Update source/channel values
ALTER TABLE crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_source_check;
ALTER TABLE crm_prospects ADD CONSTRAINT crm_prospects_source_check
  CHECK (source IN ('dm_instagram', 'email', 'telephone', 'linkedin', 'terrain', 'facebook', 'tiktok', 'recommandation', 'import', 'other'));

-- Add new columns
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS type TEXT; -- Restaurant, Café, Brasserie, etc.
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS quartier TEXT; -- 11e, 6e, etc.
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS instagram TEXT; -- @handle
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS abonnes INTEGER; -- Instagram followers
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS note_google NUMERIC(2,1); -- Google rating 0.0-5.0
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS avis_google INTEGER; -- Google reviews count
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS priorite TEXT DEFAULT 'B' CHECK (priorite IN ('A', 'B', 'C')); -- A=hot, B=warm, C=cold
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0; -- prospect score 0-20
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS freq_posts TEXT; -- posting frequency
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS qualite_visuelle TEXT; -- visual quality
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS date_contact TEXT; -- date of first contact
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS angle_approche TEXT; -- approach angle/notes

-- Update default status for new prospects
ALTER TABLE crm_prospects ALTER COLUMN status SET DEFAULT 'identifie';
