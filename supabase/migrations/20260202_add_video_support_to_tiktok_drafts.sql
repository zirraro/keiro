-- Migration: Add video support and category to tiktok_drafts
-- Date: 2026-02-02
-- Description: Allow tiktok_drafts to store both images and videos, with category organization

-- 1. Add new columns
ALTER TABLE public.tiktok_drafts
  ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES public.my_videos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'draft' CHECK (category IN ('draft', 'converted', 'published'));

-- 2. Rename image_url to media_url (handles both images and videos)
ALTER TABLE public.tiktok_drafts
  RENAME COLUMN image_url TO media_url;

-- 3. Make saved_image_id and video_id mutually exclusive at application level
-- (one must be set based on media_type)
-- We don't enforce at DB level to allow flexibility

-- 4. Add index for video_id
CREATE INDEX IF NOT EXISTS idx_tiktok_drafts_video_id
  ON public.tiktok_drafts(video_id)
  WHERE video_id IS NOT NULL;

-- 5. Add index for category
CREATE INDEX IF NOT EXISTS idx_tiktok_drafts_category
  ON public.tiktok_drafts(user_id, category, created_at DESC);

-- 6. Update existing drafts to set media_type = 'image' (default already set)
-- and category = 'draft' (default already set)

-- Comments
COMMENT ON COLUMN tiktok_drafts.video_id IS 'Reference to my_videos if media_type is video';
COMMENT ON COLUMN tiktok_drafts.media_type IS 'Type of media: image or video';
COMMENT ON COLUMN tiktok_drafts.category IS 'Category: draft (default), converted (CloudConvert), published (published to TikTok)';
COMMENT ON COLUMN tiktok_drafts.media_url IS 'URL of media (image or video)';

-- ✅ RÉSULTAT:
-- tiktok_drafts maintenant supporte images ET vidéos
-- Nouvelle colonne category pour organiser: draft, converted, published
-- Colonnes: saved_image_id (images), video_id (vidéos), media_type, category
