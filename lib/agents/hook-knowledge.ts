/**
 * HOOK KNOWLEDGE BASE — single source of truth for scroll-stopping hooks,
 * shared by the content agent (Léna) AND the Studio.
 *
 * Grounded in documented short-form analyses (creator blogs, hook-formula
 * round-ups, TikTok creative research). Key principles encoded here:
 *   - The hook must land in the first ~3 seconds (~10-14 spoken words).
 *   - Top creators ROTATE between 5-10 formulas, never reuse one.
 *   - 63% of top-performing TikTok ads deliver the core signal in the first 3s.
 *   - The 3 most consistently viral families: Contrarian Claim, Mistake
 *     Warning, List Tease (they stack curiosity + self-relevance + a promise).
 *
 * Sources (2025/2026): submagic, sendshort, virvid, vexub, freshfaced.
 */

export interface HookFormula {
  key: string;
  name: string;
  why: string;            // why it works (1 line)
  template_fr: string;
  template_en: string;
  example_fr: string;
  example_en: string;
}

export const HOOK_FORMULAS: HookFormula[] = [
  {
    key: 'contrarian',
    name: 'Contrarian / bold claim',
    why: 'Breaks the expected belief → the viewer must know why you disagree.',
    template_fr: 'Arrête de [croyance répandue] — voici pourquoi.',
    template_en: 'Stop [common belief] — here is why.',
    example_fr: 'Arrête de poster à 18h, ça tue ton reach',
    example_en: 'Stop posting at 6pm, it kills your reach',
  },
  {
    key: 'mistake',
    name: 'Mistake warning',
    why: 'Loss aversion + self-relevance: nobody wants to be making the error.',
    template_fr: '[N] erreurs qui [détruisent X] (et comment les éviter)',
    template_en: '[N] mistakes that [destroy X] (and how to avoid them)',
    example_fr: '3 erreurs qui tuent ton reach Instagram',
    example_en: '3 mistakes killing your Instagram reach',
  },
  {
    key: 'list_tease',
    name: 'List tease',
    why: 'A numbered promise creates a completion loop → they stay for all of it.',
    template_fr: '[N] [choses] que [public] ne connaît pas',
    template_en: '[N] [things] [audience] does not know',
    example_fr: '3 trucs que ton concurrent fait déjà',
    example_en: '3 things your competitor already does',
  },
  {
    key: 'curiosity',
    name: 'Curiosity gap',
    why: 'Opens an information gap the brain needs to close.',
    template_fr: 'Ce [détail] change tout (et personne ne le voit)',
    template_en: 'This [detail] changes everything (nobody notices it)',
    example_fr: 'Ce détail sur ta vitrine change tout',
    example_en: 'This one detail on your storefront changes everything',
  },
  {
    key: 'pov',
    name: 'POV / call-out',
    why: 'Names the viewer\'s exact situation → instant "that\'s me".',
    template_fr: 'POV : tu es [situation précise du public]',
    template_en: 'POV: you are [viewer\'s exact situation]',
    example_fr: 'POV : ton commerce est vide à 14h',
    example_en: 'POV: your shop is empty at 2pm',
  },
  {
    key: 'question',
    name: 'Must-know question',
    why: 'A question the target cannot leave unanswered.',
    template_fr: 'Pourquoi [résultat surprenant] ?',
    template_en: 'Why does [surprising outcome] happen?',
    example_fr: 'Pourquoi tes posts font 200 vues max ?',
    example_en: 'Why do your posts cap at 200 views?',
  },
  {
    key: 'secret',
    name: 'Insider secret',
    why: 'Implies privileged info → fear of missing the edge.',
    template_fr: 'Ce que personne ne te dit sur [sujet]',
    template_en: 'What nobody tells you about [topic]',
    example_fr: 'Ce que personne ne te dit sur l\'algo TikTok',
    example_en: 'What nobody tells you about the TikTok algo',
  },
  {
    key: 'confession',
    name: 'Shock / confession',
    why: 'Vulnerability + taboo → emotional jolt, stops the scroll.',
    template_fr: 'Je vais me faire détester, mais [vérité]',
    template_en: 'This might get me cancelled, but [truth]',
    example_fr: 'Je vais me faire détester : ta promo ne sert à rien',
    example_en: 'This might get me cancelled: your discount is useless',
  },
  {
    key: 'stakes_number',
    name: 'Stakes / number',
    why: 'A concrete figure feels true and raises the stakes.',
    template_fr: '[Chiffre choc] — et toi tu fais quoi ?',
    template_en: '[Shocking number] — so what are you doing?',
    example_fr: '78% des recherches locales finissent en visite',
    example_en: '78% of local searches end in a store visit',
  },
  {
    key: 'before_after',
    name: 'Before/after tease',
    why: 'Promises a transformation the viewer wants for themselves.',
    template_fr: 'Avant [galère] → après [résultat] en [délai]',
    template_en: 'Before [pain] → after [result] in [timeframe]',
    example_fr: '11h/semaine perdues → 12 min aujourd\'hui',
    example_en: '11 hrs/week lost → 12 minutes today',
  },
  {
    key: 'pattern_interrupt',
    name: 'Pattern interrupt',
    why: 'Starts mid-action / mid-sentence → breaks the scroll rhythm.',
    template_fr: '…et c\'est exactement là que tout a basculé',
    template_en: '…and that is exactly where it all changed',
    example_fr: 'Et là, le client est parti sans rien dire',
    example_en: 'And then the customer just walked out',
  },
  {
    key: 'urgency',
    name: 'Time-bound / now',
    why: 'Anchors to the moment → relevance + mild urgency.',
    template_fr: 'En 2026, si tu [action], tu [conséquence]',
    template_en: 'In 2026, if you [action], you [consequence]',
    example_fr: 'En 2026, sans Google Maps tu es invisible',
    example_en: 'In 2026, without Google Maps you are invisible',
  },
];

/**
 * Build a compact prompt block of rotating hook formulas. Pass `seed` (e.g. a
 * post id char-sum) to rotate which formulas are surfaced so the model doesn't
 * default to the same one every time (top creators rotate 5-10).
 */
export function buildHookKnowledgeBlock(opts: { lang?: 'fr' | 'en'; count?: number; seed?: number } = {}): string {
  const en = opts.lang === 'en';
  const count = Math.max(4, Math.min(opts.count || 6, HOOK_FORMULAS.length));
  const start = ((opts.seed || 0) % HOOK_FORMULAS.length + HOOK_FORMULAS.length) % HOOK_FORMULAS.length;
  const picked: HookFormula[] = [];
  for (let i = 0; i < count; i++) picked.push(HOOK_FORMULAS[(start + i) % HOOK_FORMULAS.length]);
  const lines = picked.map(f => {
    const tmpl = en ? f.template_en : f.template_fr;
    const ex = en ? f.example_en : f.example_fr;
    return `- ${f.name} — ${f.why}\n  modèle: ${tmpl}\n  ex: "${ex}"`;
  });
  return `PROVEN HOOK FORMULAS (rotate — pick the ONE that fits this topic best, never reuse the same family two posts in a row):\n${lines.join('\n')}`;
}

/** Tiny stable seed from a string (post id / topic) for rotation. */
export function hookSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
