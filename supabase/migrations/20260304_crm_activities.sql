-- CRM Activities: historique d'interactions avec prospects
CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES crm_prospects(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- appel, appel_manque, message, email, rdv, dm_instagram, visite, relance, note, autre
  description TEXT,
  resultat TEXT, -- pas_de_reponse, interesse, rappeler, rdv_pris, demande_infos, pas_interesse, mauvais_moment, numero_incorrect
  date_activite TIMESTAMPTZ DEFAULT now(),
  date_rappel TIMESTAMPTZ, -- quand relancer (null = pas de rappel)
  heure_rappel TEXT, -- "14:00", "matin", "après-midi"
  rappel_fait BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index pour recherche rapide par prospect
CREATE INDEX IF NOT EXISTS idx_crm_activities_prospect ON crm_activities(prospect_id);

-- Index pour rappels en attente (filtré)
CREATE INDEX IF NOT EXISTS idx_crm_activities_rappel ON crm_activities(date_rappel) WHERE rappel_fait = false;

-- Index pour tri par date d'activité
CREATE INDEX IF NOT EXISTS idx_crm_activities_date ON crm_activities(date_activite DESC);

-- RLS: admin only
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on crm_activities"
  ON crm_activities
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Service role bypass
CREATE POLICY "Service role full access on crm_activities"
  ON crm_activities
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
