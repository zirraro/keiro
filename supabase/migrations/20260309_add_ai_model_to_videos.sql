-- Add ai_model column to my_videos for provider tracking
ALTER TABLE my_videos ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'seedream';
