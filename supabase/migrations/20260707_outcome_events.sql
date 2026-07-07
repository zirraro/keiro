-- OUTCOME EVENTS — socle du data moat (analyse sectorielle → API insights).
-- Couche normalisée + indépendante des API plateformes. Voir lib/agents/outcome-events.ts.
create table if not exists outcome_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  org_id       uuid,
  agent        text not null,
  event_type   text not null,           -- post_published/dm_handled/review_replied/email_step/prospect_added/studio_created
  sector       text,                    -- ICP normalisé (beauty/resto/coach/immo/retail/artisan/other)
  platform     text,                    -- instagram/tiktok/linkedin/email/google
  format       text,                    -- reel/carousel/story/static/video
  hook_family  text,
  event_context text,                   -- holiday/trend/live_event/none
  day_of_week  int,
  hour_of_day  int,
  metrics      jsonb default '{}'::jsonb,-- {views,likes,comments,shares,saves,reach,conversion,rating_delta}
  measured_at  text default 'submit',   -- submit / 24h / 72h / 7d
  ref_id       text,                    -- content_calendar.id / prospect id… (idempotence)
  created_at   timestamptz default now()
);

-- Idempotence : une même création mesurée à la même fenêtre = 1 ligne.
create unique index if not exists outcome_events_idem
  on outcome_events (user_id, event_type, ref_id, measured_at)
  where ref_id is not null;

-- Agrégation benchmarks sectoriels.
create index if not exists outcome_events_sector_type
  on outcome_events (sector, event_type, created_at desc);
create index if not exists outcome_events_user
  on outcome_events (user_id, created_at desc);

-- RLS : service-role uniquement (écrit par les crons/agents ; lu agrégé + k-anonyme).
alter table outcome_events enable row level security;
