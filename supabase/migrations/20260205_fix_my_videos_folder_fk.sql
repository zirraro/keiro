-- Migration: Fix my_videos folder_id foreign key
-- Date: 2026-02-05
-- Description: Corriger la référence de folders vers library_folders

-- Drop the incorrect foreign key constraint if it exists
ALTER TABLE IF EXISTS my_videos
DROP CONSTRAINT IF EXISTS my_videos_folder_id_fkey;

-- Add the correct foreign key constraint
ALTER TABLE IF EXISTS my_videos
ADD CONSTRAINT my_videos_folder_id_fkey
FOREIGN KEY (folder_id) REFERENCES library_folders(id)
ON DELETE SET NULL;

-- Comment for documentation
COMMENT ON CONSTRAINT my_videos_folder_id_fkey ON my_videos IS 'Foreign key to library_folders table (fixed reference)';
