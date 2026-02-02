-- Migration SAFE: Add video support and category to tiktok_drafts
-- Date: 2026-02-02
-- Description: Allow tiktok_drafts to store both images and videos, with category organization
-- This version handles cases where columns may already exist or have been renamed

-- ====================
-- STEP 1: Add new columns if they don't exist
-- ====================

DO $$
BEGIN
  -- Add video_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'video_id'
  ) THEN
    ALTER TABLE public.tiktok_drafts
      ADD COLUMN video_id UUID REFERENCES public.my_videos(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added column video_id';
  ELSE
    RAISE NOTICE 'Column video_id already exists, skipping';
  END IF;

  -- Add media_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'media_type'
  ) THEN
    ALTER TABLE public.tiktok_drafts
      ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video'));
    RAISE NOTICE 'Added column media_type';
  ELSE
    RAISE NOTICE 'Column media_type already exists, skipping';
  END IF;

  -- Add category if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE public.tiktok_drafts
      ADD COLUMN category TEXT DEFAULT 'draft' CHECK (category IN ('draft', 'converted', 'published'));
    RAISE NOTICE 'Added column category';
  ELSE
    RAISE NOTICE 'Column category already exists, skipping';
  END IF;
END $$;

-- ====================
-- STEP 2: Rename image_url to media_url if needed
-- ====================

DO $$
BEGIN
  -- Check if image_url exists and media_url doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'image_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'media_url'
  ) THEN
    ALTER TABLE public.tiktok_drafts RENAME COLUMN image_url TO media_url;
    RAISE NOTICE 'Renamed image_url to media_url';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'media_url'
  ) THEN
    RAISE NOTICE 'Column media_url already exists, skipping rename';
  ELSE
    RAISE WARNING 'Neither image_url nor media_url found. Please check table structure.';
  END IF;
END $$;

-- ====================
-- STEP 3: Add indexes if they don't exist
-- ====================

-- Index for video_id
CREATE INDEX IF NOT EXISTS idx_tiktok_drafts_video_id
  ON public.tiktok_drafts(video_id)
  WHERE video_id IS NOT NULL;

-- Index for category
CREATE INDEX IF NOT EXISTS idx_tiktok_drafts_category
  ON public.tiktok_drafts(user_id, category, created_at DESC);

-- ====================
-- STEP 4: Add column comments
-- ====================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'video_id'
  ) THEN
    COMMENT ON COLUMN tiktok_drafts.video_id IS 'Reference to my_videos if media_type is video';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'media_type'
  ) THEN
    COMMENT ON COLUMN tiktok_drafts.media_type IS 'Type of media: image or video';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'category'
  ) THEN
    COMMENT ON COLUMN tiktok_drafts.category IS 'Category: draft (default), converted (CloudConvert), published (published to TikTok)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tiktok_drafts'
      AND column_name = 'media_url'
  ) THEN
    COMMENT ON COLUMN tiktok_drafts.media_url IS 'URL of media (image or video)';
  END IF;
END $$;

-- ====================
-- VERIFICATION: Show final table structure
-- ====================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tiktok_drafts'
ORDER BY ordinal_position;

-- ✅ RÉSULTAT ATTENDU:
-- - video_id (uuid, nullable)
-- - media_type (text, not null, default 'image')
-- - category (text, nullable, default 'draft')
-- - media_url (text) OU image_url (text) selon état initial
-- - Indexes créés
