-- Rename the chatbot agent persona from "Max" to "Clara".
-- The chatbot agent (website widget) is being merged with the in-app
-- onboarding agent under a single Clara persona that does chatbot QA +
-- onboarding/conversion + retention. Same persona either way.
--
-- Tables touched:
--   agent_avatars   — display_name + avatar copy from the onboarding row
--   no schema change needed elsewhere; widget greeting + system prompt
--   are computed from code (see app/api/widget/chat/route.ts).

UPDATE agent_avatars
SET display_name = 'Clara',
    -- Copy the visual identity from the onboarding row so both agent_ids
    -- show the same Clara avatar in admin/dashboard surfaces. If the
    -- onboarding row doesn't exist yet, the COALESCE leaves the current
    -- chatbot avatar untouched.
    avatar_url    = COALESCE((SELECT avatar_url    FROM agent_avatars WHERE id = 'onboarding'), avatar_url),
    avatar_3d_url = COALESCE((SELECT avatar_3d_url FROM agent_avatars WHERE id = 'onboarding'), avatar_3d_url),
    updated_at    = NOW()
WHERE id = 'chatbot';
