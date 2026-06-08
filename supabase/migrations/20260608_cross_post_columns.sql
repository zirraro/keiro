-- Cross-post tracking: when a TikTok reel publishes, we clone the post
-- for Instagram (Reel) so 1 generation = 2 publications. Need a few
-- columns on content_calendar to support this without breaking the
-- existing flow.
--
-- Founder rule (lib/credits/constants.ts:67-68): "1 génération = 2 publi".
-- mrzirraro audit 2026-06-08: 8 TikTok publié vs 0 Insta cross-post in
-- the same week → confirms cross-post pipeline never existed.

alter table public.content_calendar
  add column if not exists source text null;

alter table public.content_calendar
  add column if not exists parent_post_id uuid null;

alter table public.content_calendar
  add column if not exists auto_publish boolean not null default true;

create index if not exists idx_content_calendar_parent
  on public.content_calendar(parent_post_id)
  where parent_post_id is not null;
