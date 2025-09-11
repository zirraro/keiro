-- Activer RLS
alter table if exists brands enable row level security;
alter table if exists sources enable row level security;
alter table if exists generations enable row level security;

-- Par défaut, on remplit user_id avec l'utilisateur connecté (si non fourni)
alter table if exists brands alter column user_id drop not null;
alter table if exists brands alter column user_id set default auth.uid();

-- Policies brands: seul le propriétaire voit/insère ses lignes
drop policy if exists "read own brands" on brands;
drop policy if exists "insert own brands" on brands;

create policy "read own brands" on brands
  for select using (user_id = auth.uid());

create policy "insert own brands" on brands
  for insert with check (user_id = auth.uid());

-- Policies sources: accès si la source référence une brand appartenant à l'utilisateur
drop policy if exists "read own sources" on sources;
drop policy if exists "insert own sources" on sources;

create policy "read own sources" on sources
  for select using (
    exists(select 1 from brands b where b.id = sources.brand_id and b.user_id = auth.uid())
  );

create policy "insert own sources" on sources
  for insert with check (
    exists(select 1 from brands b where b.id = brand_id and b.user_id = auth.uid())
  );

-- Policies generations: idem via brand_id
drop policy if exists "read own generations" on generations;
drop policy if exists "insert own generations" on generations;

create policy "read own generations" on generations
  for select using (
    exists(select 1 from brands b where b.id = generations.brand_id and b.user_id = auth.uid())
  );

create policy "insert own generations" on generations
  for insert with check (
    exists(select 1 from brands b where b.id = brand_id and b.user_id = auth.uid())
  );
