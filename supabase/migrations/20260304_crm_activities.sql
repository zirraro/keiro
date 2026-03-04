-- CRM Activities: interaction history, follow-ups & reminders
CREATE TABLE crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES crm_prospects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'appel', 'appel_manque', 'message', 'email', 'rdv', 'dm_instagram',
    'visite', 'relance', 'note', 'autre'
  )),
  description TEXT,
  resultat TEXT,
  date_activite TIMESTAMPTZ DEFAULT now(),
  date_rappel TIMESTAMPTZ,
  heure_rappel TEXT,
  rappel_fait BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_crm_activities_prospect ON crm_activities(prospect_id);
CREATE INDEX idx_crm_activities_rappel ON crm_activities(date_rappel) WHERE rappel_fait = false;
CREATE INDEX idx_crm_activities_date ON crm_activities(date_activite DESC);

-- RLS admin only
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only" ON crm_activities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );
