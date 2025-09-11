alter table brands enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'brands' and policyname = 'public insert brands'
  ) then
    create policy "public insert brands" on brands
      for insert with check (true);
  end if;
end $$;
