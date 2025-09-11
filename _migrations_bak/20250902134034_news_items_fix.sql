-- Table des actus pour une brand
create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  title text not null,
  summary text,
  url text not null,
  image_url text,
  source text,               -- ex: "Google News"
  raw jsonb default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

-- Unicité par brand+url pour éviter les doublons
create unique index if not exists news_items_brand_url_unique
  on public.news_items (brand_id, url);

-- Activer RLS
alter table public.news_items enable row level security;

-- Politiques: un user ne peut voir/insérer que pour SES brands
create policy if not exists "news_items_select_mine"
on public.news_items for select
using (exists (
  select 1 from public.brands b
  where b.id = news_items.brand_id
    and (b.user_id is null or b.user_id = auth.uid())
));

create policy if not exists "news_items_insert_mine"
on public.news_items for insert
with check (exists (
  select 1 from public.brands b
  where b.id = news_items.brand_id
    and (b.user_id is null or b.user_id = auth.uid())
));

create policy if not exists "news_items_update_mine"
on public.news_items for update
using (exists (
  select 1 from public.brands b
  where b.id = news_items.brand_id
    and (b.user_id is null or b.user_id = auth.uid())
));

create policy if not exists "news_items_delete_mine"
on public.news_items for delete
using (exists (
  select 1 from public.brands b
  where b.id = news_items.brand_id
    and (b.user_id is null or b.user_id = auth.uid())
));
