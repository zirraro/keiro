-- Hugo §3.1 — hard-pause sur bounce rate élevé (brief v3, 2026-06-12).
-- Un domaine brûlé est irrécupérable : si le taux de hard bounce dépasse le
-- seuil sur fenêtre glissante, on STOPPE les envois pour ce client (pas juste
-- allonger le warmup) jusqu'à reprise manuelle.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hugo_paused_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hugo_pause_reason text;
