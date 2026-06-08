-- Founder ask 2026-06-08: more enrichment paths for ville/quartier
-- without lowering the 70% quality bar. Persist canonical city/postal
-- code and tag the source of the quartier value.
alter table public.crm_prospects
  add column if not exists ville text null;

alter table public.crm_prospects
  add column if not exists postal_code text null;

alter table public.crm_prospects
  add column if not exists quartier_source text null;
