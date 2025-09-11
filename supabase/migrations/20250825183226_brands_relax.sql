-- UUID helper
create extension if not exists pgcrypto;

-- PK propre sur id
alter table if exists brands alter column id set default gen_random_uuid();
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.brands'::regclass and contype='p'
  ) then
    alter table brands add primary key (id);
  end if;
end $$;

-- user_id nullable
alter table if exists brands alter column user_id drop not null;

-- Drop la FK vers users si elle existe
do $$ declare fk_name text; begin
  select conname into fk_name
  from pg_constraint
  where conrelid='public.brands'::regclass and contype='f';
  if fk_name is not null then
    execute format('alter table brands drop constraint %I', fk_name);
  end if;
end $$;

-- 1 client = 1 marque si user_id présent
create unique index if not exists brands_user_id_unique
  on brands(user_id) where user_id is not null;

-- RLS basique pour tests
alter table if exists brands enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='brands' and policyname='public read brands'
  ) then
    create policy "public read brands" on brands for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='brands' and policyname='public insert brands'
  ) then
    create policy "public insert brands" on brands for insert with check (true);
  end if;
end $$;
