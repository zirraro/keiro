-- Add original_image_url column to saved_images
-- Stores the clean image (without text overlay) so text can be modified later
ALTER TABLE saved_images ADD COLUMN IF NOT EXISTS original_image_url TEXT;
