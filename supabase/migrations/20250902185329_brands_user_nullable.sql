-- Rendre user_id nullable pour autoriser des brands "orphelines"
alter table public.brands
  alter column user_id drop not null;

-- Unique user_id uniquement quand il est non-null
create unique index if not exists brands_user_id_unique
  on public.brands (user_id)
  where user_id is not null;
