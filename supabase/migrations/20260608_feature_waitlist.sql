-- Feature waitlist for not-yet-shipped integrations (e.g. X/Twitter
-- publish). Users land on the feature, fill an email, we contact them
-- at launch. Founder ask 2026-06-08.
create table if not exists public.feature_waitlist (
  id          uuid primary key default gen_random_uuid(),
  feature     text not null,
  email       text not null,
  user_id     uuid null references auth.users(id) on delete set null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_feature_waitlist_feature on public.feature_waitlist(feature);
create unique index if not exists ux_feature_waitlist_dedup on public.feature_waitlist(feature, lower(email));

alter table public.feature_waitlist enable row level security;

drop policy if exists "feature_waitlist insert all" on public.feature_waitlist;
create policy "feature_waitlist insert all" on public.feature_waitlist for insert to anon, authenticated with check (true);

drop policy if exists "feature_waitlist select admin" on public.feature_waitlist;
create policy "feature_waitlist select admin" on public.feature_waitlist for select using (
  exists (select 1 from public.user_subscriptions us where us.user_id = auth.uid() and us.plan = 'admin')
);
