-- 2026-05-24 — Léo direction controls
-- Add profiles.gmaps_focus (JSONB) to persist a client's chosen
-- sector + city focus across cron runs. /api/agents/commercial/focus
-- writes here, /api/agents/gmaps reads here when no custom query is
-- passed so the next prospection pass targets the right niche.
-- Applied via Supabase Management API; this file documents the change.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmaps_focus jsonb;
