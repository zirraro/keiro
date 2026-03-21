-- Add 3D avatar support to agent_avatars table
ALTER TABLE agent_avatars ADD COLUMN IF NOT EXISTS avatar_3d_url TEXT;
ALTER TABLE agent_avatars ADD COLUMN IF NOT EXISTS animation_type TEXT DEFAULT 'idle' CHECK (animation_type IN ('idle', 'wave', 'thinking', 'talking', 'none'));
ALTER TABLE agent_avatars ADD COLUMN IF NOT EXISTS gradient_from TEXT DEFAULT '#7c3aed';
ALTER TABLE agent_avatars ADD COLUMN IF NOT EXISTS gradient_to TEXT DEFAULT '#4f46e5';
ALTER TABLE agent_avatars ADD COLUMN IF NOT EXISTS badge_color TEXT DEFAULT '#7c3aed';
