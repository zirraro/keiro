-- Add bilingual (FR/EN) columns to client_notifications so the UI can
-- render the right language based on the user's locale instead of only
-- serving the French strings that notify-client.ts writes today.
--
-- We keep the legacy `title`/`message` columns as the authoritative source
-- of truth (UI falls back to them when the locale-specific column is empty),
-- so rolling back is a column-drop only and doesn't require a data migration.

alter table public.client_notifications
  add column if not exists title_fr text,
  add column if not exists message_fr text,
  add column if not exists title_en text,
  add column if not exists message_en text;

-- Backfill the FR columns from the existing data so new readers can pick
-- the locale-specific column without extra fallbacks when locale=fr.
update public.client_notifications
set title_fr = title
where title_fr is null and title is not null;

update public.client_notifications
set message_fr = message
where message_fr is null and message is not null;

-- Index on `read` + user_id is already implicit via user_id + created_at
-- (see unread-count query); no new index needed.
