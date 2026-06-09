-- Extend content_calendar.format to allow 'photo' (TT Photo Mode +
-- IG Carousel Photo) and 'image' (legacy alias). Adds 'draft_qa_failed'
-- to status to wire the new validators in (rejects from caption /
-- visual / image-prompt / video-prompt validators).
--
-- 2026-06-09 — Founder ask : "stories sur les 2 reseaux IG et tiktok"
-- ne marchait pas pour TT car format=photo etait bloque par check.

ALTER TABLE content_calendar DROP CONSTRAINT IF EXISTS content_calendar_format_check;
ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_format_check
  CHECK (format = ANY (ARRAY['carrousel','reel','story','post','video','text','photo','image']));

ALTER TABLE content_calendar DROP CONSTRAINT IF EXISTS content_calendar_status_check;
ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_status_check
  CHECK (status = ANY (ARRAY[
    'draft', 'draft_qa_failed', 'approved', 'pending_approval',
    'publishing', 'video_generating', 'retry_pending',
    'published', 'publish_failed', 'skipped',
    'awaiting_manual_publish', 'deleted_on_ig'
  ]));
