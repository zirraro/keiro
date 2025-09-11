-- Tables pour ingestion & génération

-- 1) sources : ce qu'on ingère (briefs, liens, etc.)
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  type text not null default 'brief',   -- ex: brief, link, file
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 2) generations : résultat (mock) de "générer"
create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  source_id uuid null references sources(id) on delete set null,
  kind text not null default 'post',    -- ex: post, image, video
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index utiles
create index if not exists idx_sources_brand_id on sources(brand_id, created_at desc);
create index if not exists idx_generations_brand_id on generations(brand_id, created_at desc);

-- RLS de base pour tests (ouvertes)
alter table sources enable row level security;
alter table generations enable row level security;

drop policy if exists "public read sources" on sources;
drop policy if exists "public insert sources" on sources;
create policy "public read sources"   on sources for select using (true);
create policy "public insert sources" on sources for insert with check (true);

drop policy if exists "public read generations" on generations;
drop policy if exists "public insert generations" on generations;
create policy "public read generations"   on generations for select using (true);
create policy "public insert generations" on generations for insert with check (true);
