/**
 * Per-business visual naturalism profiles.
 *
 * Different businesses need different *kinds* of "natural". A restaurant
 * dish photographed editorially is fine; the same editorial polish on
 * an institut de beauté model immediately reads as stock / fake.
 *
 * Léna injects this profile into every generation prompt so the visual
 * matches the business's real-world aesthetic — not a generic Seedream
 * default.
 *
 * Usage:
 *   const profile = naturalismProfileFor(businessType);
 *   prompt += '\n' + profile.toPromptBlock();
 */

export type NaturalismProfile = {
  id: string;
  /** Human-readable label for logs. */
  label: string;
  /** Sector keywords this profile matches (loose ilike against business_type). */
  matches: string[];
  /** What "natural" means for this business. Injected into the prompt. */
  rules: {
    people: string;        // how to depict humans (or whether to)
    lighting: string;      // light mood
    skin: string;          // skin tone / texture rules (matters a LOT for beauty/wellness)
    composition: string;   // framing + density
    palette: string;       // colour direction (avoid X, prefer Y)
    avoid: string[];       // explicit don'ts
  };
};

const PROFILES: NaturalismProfile[] = [
  {
    id: 'restaurant',
    label: 'Restaurant / café / bar / bistrot',
    matches: ['restaurant', 'cafe', 'café', 'bar', 'bistrot', 'pizzeria', 'brasserie', 'traiteur', 'food', 'gastronomie'],
    rules: {
      people: 'Optional — diners visible from behind / blurred / cropped is fine. Never centered hero models.',
      lighting: 'Warm ambient (candles, pendant lamps, golden hour). Tungsten OK. Avoid clinical white.',
      skin: 'Not the focus. Hands holding glasses / cutlery are good.',
      composition: 'Cluttered tables = good. Multiple plates, glasses, napkins. Shallow DOF on the hero dish.',
      palette: 'Earth tones, warm wood, ceramic glaze, herb green. Wine reds, golden oils. Saturated only on the food itself.',
      avoid: ['cold blue lighting', 'minimalist white background', 'studio plate isolation', 'over-stylized chefs', 'fashion-shoot models'],
    },
  },
  {
    id: 'institut_beaute',
    label: 'Institut de beauté / spa / esthétique',
    matches: ['institut', 'beauté', 'beaute', 'spa', 'esthet', 'massage', 'wellness', 'bien-etre', 'epilation'],
    rules: {
      people: 'Real-looking adult clients (any age). Eyes closed during treatment OR soft natural smile after. NO airbrush, NO model agency look.',
      lighting: 'Soft diffused daylight or warm spa light. Never hard flash. Never blue clinical.',
      skin: 'CRITICAL: realistic skin texture. Visible pores, slight freckles or imperfections OK. NO porcelain skin, NO doll-face. Match the diversity of actual French clientele.',
      composition: 'Intimate close-ups (hands, face details, products on skin). Calm scenes. White towels, plants, candles, stones.',
      palette: 'Sage green, beige, soft pink, off-white, warm wood. Avoid stark white. Avoid neon.',
      avoid: ['supermodels', 'glossy magazine retouching', 'over-saturated lipstick', 'fake-looking lashes', 'plastic skin', 'stock photo poses'],
    },
  },
  {
    id: 'coiffeur',
    label: 'Coiffeur / barbier / salon',
    matches: ['coiff', 'barbier', 'salon de coiff', 'hair'],
    rules: {
      people: 'Real clients of varied hair types and ages. Mid-cut OR finished look. Stylist hands sometimes visible.',
      lighting: 'Salon natural + soft accent light. Mirror reflections OK.',
      skin: 'Realistic, not retouched. Natural under-eyes, real beard texture.',
      composition: 'Side-angle to show cut + style. Salon environment visible (chair, mirror, products on shelf).',
      palette: 'Match the salon brand. Warm wood + black + brass = timeless. Pastel for trendy salons.',
      avoid: ['wig-like hair', 'over-glossy hair', 'chemistry-perfect skin', 'fashion-week extreme styling unless that\'s the brand'],
    },
  },
  {
    id: 'fleuriste',
    label: 'Fleuriste',
    matches: ['fleuri', 'florist', 'flower', 'bouquet'],
    rules: {
      people: 'Optional — florist hands arranging flowers, customer receiving a bouquet. Never centered model.',
      lighting: 'Natural daylight from a side window. Soft shadows. Boutique ambient.',
      skin: 'Hands shown in detail — visible knuckles, slight pollen stains, working hands.',
      composition: 'Organic and slightly imperfect arrangements (NOT supermarket-perfect). Workshop chaos = charm.',
      palette: 'Match the bouquet. Avoid over-saturating petals — real flowers have subtle gradient. Brown craft paper, twine.',
      avoid: ['plastic-looking flowers', 'symmetric corporate bouquets', 'over-saturated petals', 'fake water droplets'],
    },
  },
  {
    id: 'boutique_mode',
    label: 'Boutique de mode / vêtements',
    matches: ['boutique', 'mode', 'fashion', 'vetement', 'vêtement', 'pret-a-porter'],
    rules: {
      people: 'Editorial-style models OK BUT prefer real-looking customers / boutique owners. Mid-pose, candid feel.',
      lighting: 'Natural shop daylight + warm tungsten. Boutique window light is gold.',
      skin: 'Realistic — keep some texture. No agency-airbrush.',
      composition: 'Garment in context (on hanger, on body, in fitting room). Boutique interior visible.',
      palette: 'Match brand. Earth tones + neutrals = timeless. Avoid trying to imitate Vogue unless the brand is luxury.',
      avoid: ['high-fashion runway shots for casual brands', 'aggressive contrast', 'plasticky textures'],
    },
  },
  {
    id: 'caviste',
    label: 'Caviste / wine shop',
    matches: ['caviste', 'cave', 'vin', 'wine', 'liquor', 'spiriteux'],
    rules: {
      people: 'Caviste hands selecting bottles, customer receiving recommendation. Optional.',
      lighting: 'Cellar warm tungsten. Bottles slightly back-lit to show colour through glass.',
      skin: 'Working hands.',
      composition: 'Bottle close-ups, label visible, stone walls / wood shelves behind. Wine glass with proper colour.',
      palette: 'Burgundy, deep red, amber, oak brown. Cellar darkness with warm pools of light.',
      avoid: ['supermarket-style bright lighting', 'over-staged tasting setups', 'fake condensation'],
    },
  },
  {
    id: 'coach_sportif',
    label: 'Coach sportif / salle de sport',
    matches: ['coach', 'sport', 'gym', 'fitness', 'crossfit', 'pilates', 'yoga'],
    rules: {
      people: 'Real-looking athletes — sweat, effort, real bodies of varied builds. NEVER fitness-magazine cover physiques unless that\'s the niche.',
      lighting: 'Gym natural light or warm session lighting. Avoid harsh fluorescent.',
      skin: 'Visible sweat, flushed cheeks during effort. Natural texture.',
      composition: 'Movement frozen mid-rep, focused expressions, equipment in context.',
      palette: 'Earthy + contrast colours of equipment (rubber, chalk dust). Avoid neon corporate gym vibe.',
      avoid: ['unrealistic abs', 'glossy oily skin', 'cheesy thumbs-up poses', 'stock-photo trainer-with-clipboard'],
    },
  },
  {
    id: 'agence_marketing',
    label: 'Agence marketing / SaaS / B2B',
    matches: ['agence', 'marketing', 'saas', 'b2b', 'consulting', 'agency', 'keiro'],
    rules: {
      people: 'Founder/team in real workspace, laptops visible. Casual professional. Avoid stock-handshake.',
      lighting: 'Office natural light + warm desk lamps. Slightly cinematic.',
      skin: 'Realistic.',
      composition: 'Tech context visible — screens, notes, coffee, plants. Modern but not corporate-sterile.',
      palette: 'Brand-aligned. Tech accents (cyan, violet, deep navy) OK because the audience expects it.',
      avoid: ['stock-photo handshakes', 'cheesy "team meeting" poses', 'fake productivity'],
    },
  },
  {
    id: 'default',
    label: 'Generic local business (fallback)',
    matches: [],
    rules: {
      people: 'Real-looking adult clients of varied ages, doing the activity naturally.',
      lighting: 'Natural daylight or warm ambient — NEVER clinical / flash.',
      skin: 'Realistic with visible texture. No airbrush.',
      composition: 'Subject in their actual environment, slight asymmetry, real props.',
      palette: 'Match the business\'s actual brand colours. Avoid violet / amber unless they\'re already in the reference.',
      avoid: ['stock photo aesthetic', 'porcelain skin', 'studio gradient backgrounds', 'fake props'],
    },
  },
];

export function naturalismProfileFor(businessType: string | null | undefined): NaturalismProfile {
  const t = (businessType || '').toLowerCase();
  if (!t) return PROFILES[PROFILES.length - 1]; // default
  for (const p of PROFILES) {
    if (p.matches.some(m => t.includes(m))) return p;
  }
  return PROFILES[PROFILES.length - 1];
}

/** Render the profile rules as a French prompt block to inject into Léna's system prompt. */
export function naturalismToPromptBlock(profile: NaturalismProfile): string {
  return `

━━━ DIRECTION ARTISTIQUE NATURELLE — ${profile.label} ━━━
- Personnes : ${profile.rules.people}
- Lumière : ${profile.rules.lighting}
- Peau / texture : ${profile.rules.skin}
- Composition : ${profile.rules.composition}
- Palette : ${profile.rules.palette}

À ÉVITER ABSOLUMENT pour ce type de business :
${profile.rules.avoid.map(x => `- ${x}`).join('\n')}

→ La photo doit ressembler à ce qu'un photographe local capturerait dans CE TYPE de commerce. Pas du stock, pas du Vogue, pas du clinical. Du vrai, ancré dans le métier.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
}
