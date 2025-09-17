alter table brands enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'brands' and policyname = 'public read brands'
  ) then
    create policy "public read brands" on brands
      for select using (true);
  end if;
end $$;
