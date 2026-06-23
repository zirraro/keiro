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
  // ── Élargissement 2026-06-23 (founder: étoffer À FOND pour la portée) ──
  {
    key: 'negative_command',
    name: 'Negative command / warning',
    why: 'Un ordre négatif déclenche la curiosité (« pourquoi pas ? ») + évite la perte.',
    template_fr: 'Ne fais JAMAIS [action courante] si [situation]',
    template_en: 'NEVER do [common action] if [situation]',
    example_fr: 'Ne baisse JAMAIS tes prix pour remplir un creux',
    example_en: 'NEVER cut your prices to fill a slow day',
  },
  {
    key: 'direct_address',
    name: 'Direct call-out (cher…)',
    why: 'Nomme exactement la cible → elle se sent visée et reste.',
    template_fr: 'Si tu as [type de commerce], écoute bien ça',
    template_en: 'If you run a [business type], listen up',
    example_fr: 'Si tu as un institut, écoute bien ça',
    example_en: 'If you own a beauty salon, listen up',
  },
  {
    key: 'result_first',
    name: 'Result-first (j’ai testé)',
    why: 'Le résultat d’abord = preuve + promesse implicite « tu peux pareil ».',
    template_fr: 'J’ai fait [action] pendant [durée], voilà le résultat',
    template_en: 'I did [action] for [time], here is what happened',
    example_fr: 'J’ai posté tous les jours 30 jours, voilà le résultat',
    example_en: 'I posted daily for 30 days, here is what happened',
  },
  {
    key: 'myth_bust',
    name: 'Myth-bust (non, c’est faux)',
    why: 'Corrige une croyance = tension cognitive à résoudre.',
    template_fr: 'Non, [croyance répandue] c’est faux — la vraie raison :',
    template_en: 'No, [common belief] is wrong — the real reason:',
    example_fr: 'Non, poster plus ne booste pas ton reach',
    example_en: 'No, posting more does not boost your reach',
  },
  {
    key: 'hot_take',
    name: 'Unpopular opinion',
    why: 'Annonce un avis clivant → polarise et fait commenter (reach).',
    template_fr: 'Avis impopulaire : [prise de position]',
    template_en: 'Unpopular opinion: [bold take]',
    example_fr: 'Avis impopulaire : les hashtags ne servent à rien',
    example_en: 'Unpopular opinion: hashtags do nothing',
  },
  {
    key: 'did_you_know',
    name: 'Did you know (fait surprenant)',
    why: 'Promesse d’une info nouvelle et partageable.',
    template_fr: 'Tu savais que [fait surprenant et local] ?',
    template_en: 'Did you know [surprising local fact]?',
    example_fr: 'Tu savais que 3 clients sur 4 te cherchent sur ton tél ?',
    example_en: 'Did you know 3 of 4 customers find you on their phone?',
  },
  {
    key: 'everyone_but_you',
    name: 'Everyone but you (FOMO)',
    why: 'Crée la peur d’être le seul à rater le coche.',
    template_fr: 'Tout le monde fait [tendance] en ce moment, sauf toi',
    template_en: 'Everyone is doing [trend] right now, except you',
    example_fr: 'Tous les restos de ta ville font ça, sauf toi',
    example_en: 'Every shop in your town does this, except you',
  },
  {
    key: 'exact_method',
    name: 'Exact method (la méthode précise)',
    why: 'La spécificité (« exacte ») = crédibilité + valeur actionnable.',
    template_fr: 'La méthode exacte pour [résultat] sans [effort redouté]',
    template_en: 'The exact method to [result] without [dreaded effort]',
    example_fr: 'La méthode exacte pour remplir tes créneaux creux',
    example_en: 'The exact method to fill your slow slots',
  },
  {
    key: 'this_is_why',
    name: 'Diagnostic (voilà pourquoi)',
    why: 'Promet d’expliquer une frustration précise que vit la cible.',
    template_fr: 'Si [problème précis], voilà exactement pourquoi',
    template_en: 'If [specific problem], here is exactly why',
    example_fr: 'Si tes reels font 200 vues, voilà exactement pourquoi',
    example_en: 'If your reels cap at 200 views, here is why',
  },
  {
    key: 'green_screen_react',
    name: 'React / on m’a demandé',
    why: 'Format réaction = social proof (« d’autres demandent aussi »).',
    template_fr: 'On m’a demandé [question], voici la vraie réponse',
    template_en: 'Someone asked me [question], here is the real answer',
    example_fr: 'On me demande comment être 1er sur Google, voici',
    example_en: 'People ask how to rank #1 on Google, here it is',
  },
  {
    key: 'stop_scroll',
    name: 'Stop-scroll command',
    why: 'Ordre direct + ciblage = interrompt net le défilement.',
    template_fr: 'Arrête de scroller si tu [situation cible]',
    template_en: 'Stop scrolling if you [target situation]',
    example_fr: 'Arrête de scroller si ton agenda a des trous',
    example_en: 'Stop scrolling if your calendar has gaps',
  },
  {
    key: 'comparison',
    name: 'This vs that (verdict)',
    why: 'Le cerveau veut le verdict d’une comparaison.',
    template_fr: '[Option A] ou [Option B] ? Le verdict en [durée]',
    template_en: '[Option A] vs [Option B]? The verdict in [time]',
    example_fr: 'Poster le matin ou le soir ? Le verdict',
    example_en: 'Post morning or evening? The verdict',
  },
  {
    key: 'challenge',
    name: 'Challenge (essaie X jours)',
    why: 'Invite à l’action + boucle de retour (« reviens me dire »).',
    template_fr: 'Essaie ça pendant [N] jours et regarde ce qui change',
    template_en: 'Try this for [N] days and watch what changes',
    example_fr: 'Réponds à TOUS tes avis pendant 7 jours, regarde',
    example_en: 'Reply to ALL your reviews for 7 days, watch',
  },
  {
    key: 'authority',
    name: 'Authority / after N',
    why: 'Crédential chiffrée = autorité instantanée.',
    template_fr: 'Après [N] [expériences], voici ce que j’ai compris',
    template_en: 'After [N] [experiences], here is what I learned',
    example_fr: 'Après 500 posts pour des commerces, voici la vérité',
    example_en: 'After 500 posts for local shops, here is the truth',
  },
  {
    key: 'relatable_frustration',
    name: 'Relatable frustration',
    why: 'Nomme une irritation partagée → « c’est tellement moi ».',
    template_fr: 'Ça t’énerve aussi quand [situation agaçante] ?',
    template_en: 'Does it bug you too when [annoying situation]?',
    example_fr: 'Ça t’énerve aussi de poster et faire 12 vues ?',
    example_en: 'Does it bug you to post and get 12 views?',
  },
  {
    key: 'teardown',
    name: 'Teardown (on décortique)',
    why: 'Promet une analyse concrète, image par image.',
    template_fr: 'On décortique [exemple] image par image',
    template_en: 'Let us break down [example] frame by frame',
    example_fr: 'On décortique le post qui a fait 100k vues',
    example_en: 'Breaking down the post that hit 100k views',
  },
  {
    key: 'behind_scenes',
    name: 'Behind the scenes',
    why: 'Accès aux coulisses = intimité + exclusivité.',
    template_fr: 'Ce qu’on ne te montre jamais en [secteur]',
    template_en: 'What they never show you in [industry]',
    example_fr: 'Ce qu’on ne te montre jamais en restauration',
    example_en: 'What they never show you in the food business',
  },
  {
    key: 'ease_promise',
    name: 'Effortless result',
    why: 'Résultat désiré + sans l’effort redouté = irrésistible.',
    template_fr: 'Comment [résultat] sans [effort que tout le monde déteste]',
    template_en: 'How to [result] without [the effort everyone hates]',
    example_fr: 'Comment être partout en ligne sans y passer de temps',
    example_en: 'How to be everywhere online without spending time',
  },
  {
    key: 'open_loop_story',
    name: 'Open-loop story',
    why: 'Ouvre une histoire non résolue → on reste pour la fin.',
    template_fr: 'Personne ne me croyait quand [situation], puis…',
    template_en: 'Nobody believed me when [situation], then…',
    example_fr: 'On me disait que mon resto était trop petit, puis…',
    example_en: 'They said my shop was too small, then…',
  },
  {
    key: 'you_are_doing_it_wrong',
    name: 'You are doing it wrong',
    why: 'Accusation douce + promesse de correction = forte rétention.',
    template_fr: 'Tu fais [chose] comme ça ? C’est l’erreur n°1',
    template_en: 'You do [thing] like that? That is mistake #1',
    example_fr: 'Tu publies tes plats comme ça ? Erreur n°1',
    example_en: 'You post your dishes like that? Mistake #1',
  },
  {
    key: 'specific_number_time',
    name: 'Specific number + timeframe',
    why: 'Chiffre précis + délai = crédible et désirable.',
    template_fr: '[Résultat chiffré] en [délai court], sans [obstacle]',
    template_en: '[Specific result] in [short time], without [obstacle]',
    example_fr: '+40 réservations en 30 jours, sans pub payante',
    example_en: '+40 bookings in 30 days, with no paid ads',
  },
  {
    key: 'watch_this',
    name: 'Watch what happens (démo)',
    why: 'Annonce une démonstration visuelle imminente → on regarde.',
    template_fr: 'Regarde ce qui se passe quand [action]',
    template_en: 'Watch what happens when [action]',
    example_fr: 'Regarde ce qui se passe quand on filme bien un plat',
    example_en: 'Watch what happens when a dish is shot right',
  },
];

/**
 * OUVERTURES VISUELLES — le premier plan (0-1s) qui stoppe le pouce AVANT
 * même le texte. À combiner avec une formule de hook texte. (Founder: hooks
 * qui captent l’attention + meilleure portée.)
 */
export const VISUAL_OPENERS: { key: string; fr: string }[] = [
  { key: 'extreme_closeup', fr: 'Macro ultra-serré (texture, geste, matière) qui s’ouvre ensuite — on devine pas tout de suite, donc on reste.' },
  { key: 'motion_in', fr: 'Mouvement franc dès l’image 1 (tourbillon/whirl, push rapide, whip) — le mouvement bat l’image fixe pour stopper le scroll.' },
  { key: 'before_after_split', fr: 'Avant/après en split ou cut sec dans la première seconde — promesse de transformation immédiate.' },
  { key: 'unexpected_first_frame', fr: 'Premier plan inattendu / décalé par rapport au sujet (pattern interrupt visuel) puis révélation.' },
  { key: 'human_face_emotion', fr: 'Un visage humain avec une vraie émotion (surprise, satisfaction) en plan 1 — l’humain capte plus que le produit seul.' },
  { key: 'text_on_action', fr: 'Hook texte gros et lisible POSÉ sur une action en cours (pas sur un plan figé) — lecture + mouvement simultanés.' },
  { key: 'reveal_countdown', fr: 'Amorce d’un compte à rebours / « regarde jusqu’au bout » visuel pour créer une boucle de complétion.' },
];

/** Principes de PORTÉE (à respecter quel que soit le hook). */
export const REACH_PRINCIPLES_FR = [
  'Le signal clé doit arriver dans les 3 premières secondes (63% des top vidéos le font).',
  'Vertical plein cadre, sous-titres lisibles, premier plan en mouvement.',
  'Tourner de hook EN hook : jamais la même famille deux posts d’affilée.',
  'Rétention > tout : chaque seconde doit donner envie de voir la suivante (boucles ouvertes).',
  'Déclencher le commentaire (avis clivant, question, « tu fais quelle erreur ? ») = signal de portée fort.',
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
  // Une ouverture visuelle + un principe de portée, tournés par seed → le hook
  // texte ET le premier plan sont pensés ensemble (founder: capter + portée).
  const vo = VISUAL_OPENERS[(start) % VISUAL_OPENERS.length];
  const rp = REACH_PRINCIPLES_FR[(start) % REACH_PRINCIPLES_FR.length];
  return `PROVEN HOOK FORMULAS (rotate — pick the ONE that fits this topic best, never reuse the same family two posts in a row):\n${lines.join('\n')}\n\nOUVERTURE VISUELLE suggérée (0-1s, à marier au hook texte): ${vo.fr}\nPRINCIPE DE PORTÉE: ${rp}`;
}

/** Tiny stable seed from a string (post id / topic) for rotation. */
export function hookSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
