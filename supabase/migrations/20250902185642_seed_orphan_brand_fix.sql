insert into public.brands (name, user_id, tone, created_at, updated_at)
select 'Actus Demo', null, '{"voice":"neutral"}'::jsonb, now(), now()
where not exists (
  select 1 from public.brands where user_id is null and name = 'Actus Demo'
);
