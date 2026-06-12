-- Anti-collision NOAH — brief v3 §3.5 (2026-06-12).
-- no_outbound: "ne me recontactez pas" persistant. Posé par un opt-out (DM,
-- email, avis) ; SURVIT à un réengagement entrant (le prospect peut écrire, on
-- lui répond, mais il ne réintègre JAMAIS une séquence sortante). Cohérent avec
-- la règle founder "jamais supprimer un prospect, dead seulement".
-- active_channel: 1 prospect = 1 canal sortant actif à la fois (anti DM+email
-- simultanés).
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS no_outbound boolean NOT NULL DEFAULT false;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS active_channel text;
CREATE INDEX IF NOT EXISTS idx_crm_no_outbound ON crm_prospects (no_outbound) WHERE no_outbound;
