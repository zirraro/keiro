-- Applied on the POSTGRES_URL database (Neon pooler) — used directly by
-- /api/anon-gen/check via the `pg` client, NOT via the Supabase REST API.
-- Already applied 2026-06-14 (CREATE TABLE run over pg). Kept for the record.
--
-- Per-IP anonymous generation quota (server-side source of truth).
-- Guarantees the 1st free generation per IP and prevents bypassing the
-- client-side localStorage counter by clearing it. IPs are stored HASHED
-- (sha256 + salt) — never in clear — for privacy.
create table if not exists public.anon_gen_log (
  ip_hash text primary key,
  count int not null default 0,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);

-- Service-role only (the API uses the service key); no public access.
alter table public.anon_gen_log enable row level security;
