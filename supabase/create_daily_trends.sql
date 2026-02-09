-- Table pour stocker les tendances quotidiennes (Google Trends + TikTok)
-- Permet d'analyser les tendances sur semaine/mois/année par domaine

CREATE TABLE IF NOT EXISTS daily_trends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trend_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL CHECK (source IN ('google_trends', 'tiktok')),
  keyword TEXT NOT NULL,
  traffic TEXT, -- ex: "200K+" pour Google Trends
  video_count BIGINT, -- pour TikTok
  trend_direction TEXT CHECK (trend_direction IN ('up', 'down', 'stable')),
  category TEXT, -- catégorie auto-détectée (Sport, Tech, etc.)
  related_queries TEXT[], -- requêtes associées
  raw_data JSONB, -- données brutes complètes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_daily_trends_date ON daily_trends (trend_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_trends_source ON daily_trends (source);
CREATE INDEX IF NOT EXISTS idx_daily_trends_keyword ON daily_trends (keyword);
CREATE INDEX IF NOT EXISTS idx_daily_trends_category ON daily_trends (category);

-- Contrainte unique : un keyword par source par jour (pas de doublons)
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_trends_unique
  ON daily_trends (trend_date, source, keyword);

-- RLS : lecture publique, écriture service role uniquement
ALTER TABLE daily_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_trends_read" ON daily_trends
  FOR SELECT USING (true);

CREATE POLICY "daily_trends_insert" ON daily_trends
  FOR INSERT WITH CHECK (true);
