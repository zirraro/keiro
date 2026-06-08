-- Cache table for trend card thumbnails (resolved from Pixabay search).
-- Reused across all clients/regions for the same trend keyword so the
-- /generate page's Insta/TikTok/LinkedIn trend cards always render with
-- a topic-coherent image instead of a bare gradient.
create table if not exists public.trend_thumbnails (
  id          bigserial primary key,
  slug        text not null unique,
  query       text not null,
  image_url   text null,
  source      text not null default 'pixabay',
  updated_at  timestamptz not null default now()
);

create index if not exists idx_trend_thumbnails_updated on public.trend_thumbnails(updated_at);

alter table public.trend_thumbnails enable row level security;

drop policy if exists "trend_thumbnails read all" on public.trend_thumbnails;
create policy "trend_thumbnails read all" on public.trend_thumbnails for select to anon, authenticated using (true);
