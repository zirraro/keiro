-- Add video_url column to content_calendar for Reels and TikTok video publishing
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS video_url TEXT;

COMMENT ON COLUMN content_calendar.video_url IS 'URL of generated video (Reel/TikTok) with narration — stored in Supabase Storage';
