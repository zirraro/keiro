-- Add subtitle_text and audio_url columns to my_videos
-- These store the generated subtitle text and audio URL for video editing in modals

ALTER TABLE public.my_videos
  ADD COLUMN IF NOT EXISTS subtitle_text TEXT,
  ADD COLUMN IF NOT EXISTS audio_url TEXT;

COMMENT ON COLUMN my_videos.subtitle_text IS 'Generated subtitle/narration text for video overlay';
COMMENT ON COLUMN my_videos.audio_url IS 'Generated audio narration URL (ElevenLabs TTS)';
