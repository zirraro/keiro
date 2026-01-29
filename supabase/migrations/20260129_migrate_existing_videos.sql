-- Migration: Move existing videos from saved_images to my_videos
-- Date: 2026-01-29
-- Description: One-time migration to separate videos from images

-- Insert existing videos into my_videos table
-- Videos are identified by .mp4, .mov, .webm extensions in image_url
INSERT INTO my_videos (
  user_id,
  title,
  video_url,
  thumbnail_url,
  source_type,
  folder_id,
  is_favorite,
  created_at,
  updated_at
)
SELECT
  user_id,
  title,
  image_url AS video_url,
  thumbnail_url,
  CASE
    WHEN image_url LIKE '%tiktok-videos%' THEN 'seedream_i2v'
    ELSE 'upload'
  END AS source_type,
  folder_id,
  is_favorite,
  created_at,
  created_at AS updated_at
FROM saved_images
WHERE
  LOWER(image_url) LIKE '%.mp4%'
  OR LOWER(image_url) LIKE '%.mov%'
  OR LOWER(image_url) LIKE '%.webm%'
  OR LOWER(image_url) LIKE '%.avi%'
ON CONFLICT DO NOTHING;

-- Log migration results
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count FROM my_videos;
  RAISE NOTICE 'Migration complete: % videos migrated to my_videos table', migrated_count;
END $$;

-- Optional: Delete migrated videos from saved_images
-- UNCOMMENT ONLY AFTER VERIFYING MIGRATION SUCCESS
-- DELETE FROM saved_images
-- WHERE
--   LOWER(image_url) LIKE '%.mp4%'
--   OR LOWER(image_url) LIKE '%.mov%'
--   OR LOWER(image_url) LIKE '%.webm%'
--   OR LOWER(image_url) LIKE '%.avi%';

-- Verification query (run this after migration)
-- SELECT
--   'saved_images' AS table_name,
--   COUNT(*) AS count,
--   'Images remaining' AS description
-- FROM saved_images
-- UNION ALL
-- SELECT
--   'my_videos' AS table_name,
--   COUNT(*) AS count,
--   'Videos migrated' AS description
-- FROM my_videos;
