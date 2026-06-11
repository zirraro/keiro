/**
 * Anti-AI realism directive — shared by every visual generation surface
 * (Léna's content agent, the /studio + /generate manual pipelines via
 * jade-prompter, etc.) so a client-facing image looks like an AUTHENTIC
 * photograph and a viewer scrolling their feed cannot tell it was generated.
 *
 * 2026-06-11 — Founder ask: "le moins d'effets IA possible, le plus naturel
 * possible, faire croire aux gens que ce n'est presque pas de la génération
 * IA". Default = hyper-natural. The block explicitly yields to the brief when
 * the client asked for a non-photographic style (illustration, 3D, graphic) —
 * so a deliberate stylised choice at the last step still wins.
 */
export const ANTI_AI_REALISM = `
━━━ REALISM — THE VIEWER MUST NOT SUSPECT AI ━━━
Unless the brief EXPLICITLY asks for an illustration, 3D, cartoon or graphic
style, this image will be posted publicly as if a real human photographer shot
it. It must pass as an authentic photograph. AVOID every classic AI tell:
- Skin: real pores, fine lines, slight asymmetry, natural blemishes. NO waxy/plastic/airbrushed skin, NO uncanny smoothness, NO glowing complexion.
- Hands & anatomy: correct number of fingers/teeth/limbs, natural joints. NO fused fingers, NO warped hands, NO impossible poses.
- Eyes: natural catchlights, slight redness, real moisture. NO glassy/dead/over-symmetric eyes.
- Texture: real materials with micro-imperfections — crumbs, fingerprints, scratches, fabric pilling, condensation, uneven wear. NO too-clean surfaces, NO CGI sheen, NO glossy render look.
- Light: physically plausible single/dominant source with consistent shadows and natural falloff. NO impossible reflections, NO multiple conflicting shadows, NO HDR halos, NO over-bloomed highlights.
- Composition: a candid, slightly imperfect human frame — minor clutter, off-centre subjects, natural depth. NO sterile symmetry, NO perfectly arranged props, NO stock-photo staging.
- Color: natural, slightly imperfect white balance like a real camera/phone. NO over-saturation, NO uniform teal-orange grade, NO synthetic neon glow.
- Background: coherent, real-world detail that holds up on zoom. NO melting objects, NO repeated/cloned patterns, NO nonsensical geometry, NO warped straight lines.
- Overall: the subtle grain, focus falloff, and tiny flaws of a genuine photo taken on a real camera or modern phone. Believable over beautiful.
Think: a candid editorial photograph a real person posted — not a render, not a generation.
`;
