-- Run this in Supabase SQL Editor to add 3D avatar support

ALTER TABLE agent_avatars ADD COLUMN IF NOT EXISTS avatar_3d_url TEXT;
ALTER TABLE agent_avatars ADD COLUMN IF NOT EXISTS animation_type TEXT DEFAULT 'idle';
ALTER TABLE agent_avatars ADD COLUMN IF NOT EXISTS gradient_from TEXT DEFAULT '#7c3aed';
ALTER TABLE agent_avatars ADD COLUMN IF NOT EXISTS gradient_to TEXT DEFAULT '#4f46e5';
ALTER TABLE agent_avatars ADD COLUMN IF NOT EXISTS badge_color TEXT DEFAULT '#7c3aed';

-- Set unique gradients per agent
UPDATE agent_avatars SET gradient_from = '#7c3aed', gradient_to = '#4338ca', badge_color = '#7c3aed' WHERE id = 'ceo';
UPDATE agent_avatars SET gradient_from = '#2563eb', gradient_to = '#0891b2', badge_color = '#2563eb' WHERE id = 'commercial';
UPDATE agent_avatars SET gradient_from = '#059669', gradient_to = '#10b981', badge_color = '#059669' WHERE id = 'email';
UPDATE agent_avatars SET gradient_from = '#db2777', gradient_to = '#e11d48', badge_color = '#db2777' WHERE id = 'content';
UPDATE agent_avatars SET gradient_from = '#d97706', gradient_to = '#ea580c', badge_color = '#d97706' WHERE id = 'seo';
UPDATE agent_avatars SET gradient_from = '#0891b2', gradient_to = '#2563eb', badge_color = '#0891b2' WHERE id = 'onboarding';
UPDATE agent_avatars SET gradient_from = '#7c3aed', gradient_to = '#a855f7', badge_color = '#8b5cf6' WHERE id = 'retention';
UPDATE agent_avatars SET gradient_from = '#0d9488', gradient_to = '#059669', badge_color = '#0d9488' WHERE id = 'marketing';
UPDATE agent_avatars SET gradient_from = '#dc2626', gradient_to = '#ea580c', badge_color = '#dc2626' WHERE id = 'ads';
UPDATE agent_avatars SET gradient_from = '#475569', gradient_to = '#334155', badge_color = '#475569' WHERE id = 'rh';
