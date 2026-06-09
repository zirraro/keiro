/**
 * Lightweight smoke test for validators — runs with `node --experimental-vm-modules`.
 * Not wired into CI; just a manual check that the rules fire as expected.
 *
 * Usage: node lib/validators/__tests__/smoke.mjs
 */
import { validateCaption } from '../caption.ts';
import { validateVisualCoherence } from '../visual-coherence.ts';
import { validateImagePrompt } from '../image-prompt.ts';
import { validateVideoPrompt } from '../video-prompt.ts';
import { validateImageOutput, validateVideoOutput } from '../media-output.ts';
import { aggregate } from '../types.ts';

const ctx = {
  user_id: 'test-user',
  business_type: 'restaurant',
  platform: 'instagram',
  format: 'post',
  recent_posts: [
    {
      id: 'p1',
      caption: 'La burrata fumée arrive cette semaine en édition limitée. Si tu as un bon plan brunch ce week-end on est ouvert dimanche.',
      hook: 'La burrata fumée arrive',
      visual_url: 'https://example.com/burrata.jpg',
      visual_description: 'Hero shot of a smoked burrata on a wooden board with olive oil drops, warm amber lighting',
      format: 'post',
      platform: 'instagram',
      published_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      id: 'p2',
      hook: 'Nouveau menu',
      caption: 'Nouveau menu du chef cette semaine — venez tester le plat du jour.',
      visual_url: 'https://example.com/menu.jpg',
      visual_description: 'Menu chalkboard with handwritten dish names, warm amber light, wooden frame',
      format: 'post',
      platform: 'instagram',
      published_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
  ],
};

const cases = [
  {
    label: 'clean post (info findings ok)',
    post: { caption: 'Le risotto truffe arrive lundi soir. Réservation par téléphone, 2 services 19h30 et 21h.', hook: 'Lundi soir', hashtags: ['#risotto', '#paris11'], platform: 'instagram', format: 'post', visual_description: 'Top down of risotto with truffle shavings, deep green herb crumb' },
    expected: 'info', // dish_without_venue is info-only, not blocking
  },
  {
    label: 'AI-tell',
    post: { caption: 'Dans ce post nous allons découvrir notre nouveau menu. N hésitez pas à venir le tester.', platform: 'instagram', format: 'post' },
    expected: 'block',
  },
  {
    label: 'forbidden claim',
    post: { caption: 'Le meilleur restaurant de la ville garanti 100% satisfait ou remboursé.', platform: 'instagram', format: 'post' },
    expected: 'block',
  },
  {
    label: 'IA signature',
    post: { caption: 'Votre coach IA vous recommande ce plat — sélectionné par notre IA.', platform: 'instagram', format: 'post' },
    expected: 'block',
  },
  {
    label: 'duplicate caption',
    post: { caption: 'La burrata fumée arrive cette semaine en édition limitée. Si tu as un bon plan brunch ce week-end on est ouvert dimanche.', platform: 'instagram', format: 'post' },
    expected: 'block',
  },
  {
    label: 'hashtag spam (heavy)',
    post: { caption: 'Soir cosy au restaurant — viens partager une bonne table avec nous ce week-end on est ouvert dimanche brunch.', hashtags: ['#food','#paris','#yummy','#chef','#delicious','#instafood','#foodie','#restaurant','#dinner','#cuisine','#gourmet','#tasty','#hungry','#eat','#chefslife','#yum','#foodporn'], platform: 'instagram', format: 'post' },
    expected: 'block', // 17 > 10*1.5
  },
  {
    label: 'palette monotony',
    post: { caption: 'Soirée détente', visual_description: 'Warm amber sunset with terracotta accents over a wooden table', platform: 'instagram', format: 'post' },
    expected: 'warn', // recent posts all amber
  },
  {
    label: 'creative novel post — should pass',
    post: { caption: '23h47, dernière fournée de pain de seigle. Demain pas de boulange — on est à la mer.', hook: '23h47', visual_description: 'Bakery interior, low blue light, copper-bronze counter, single loaf cooling', platform: 'instagram', format: 'post' },
    expected: 'clean',
  },
];

console.log('SMOKE TEST — caption + visual\n');
let pass = 0, fail = 0;
for (const c of cases) {
  const cap = validateCaption(c.post, ctx);
  const vis = validateVisualCoherence(c.post, ctx);
  const merged = aggregate([...cap.findings, ...vis.findings]);
  const ok = merged.severity === c.expected;
  const symbol = ok ? '✅' : '❌';
  console.log(`${symbol} ${c.label.padEnd(40)} expected=${c.expected.padEnd(7)} got=${merged.severity.padEnd(7)} score=${merged.quality_score}`);
  if (!ok) {
    console.log('   findings:', merged.findings.map(f => `[${f.severity}] ${f.code}`).join(', '));
    fail++;
  } else pass++;
}

// ─── Image prompt validator ─────────────────────────────────
console.log('\nSMOKE TEST — image prompt\n');
const imageCases = [
  {
    label: 'rich brief',
    prompt: 'Professional editorial close-up of fresh sourdough loaves on a copper-bronze counter, top-down composition, golden hour rim lighting, hands tearing one open with steam rising, cinematic depth of field',
    expected: 'clean',
  },
  {
    label: 'minimalist clean brief (no explicit subject)',
    prompt: 'Close-up of espresso pour, cinematic studio light, top-down composition, hands holding professional cup',
    expected: 'warn', // no_subject regex doesn't catch hyphenated openers — intentional
  },
  {
    label: 'too short',
    prompt: 'food',
    expected: 'block',
  },
  {
    label: 'markup leak',
    prompt: 'Professional close-up of {dish_name} with editorial lighting, hero shot',
    expected: 'block',
  },
  {
    label: 'copyright entity',
    prompt: 'Professional photo of a Disney mickey mouse cake on the table, hero shot, cinematic',
    expected: 'block',
  },
  {
    label: 'forbidden content',
    prompt: 'Cinematic close-up showing graphic violence scene with blood splatter on the floor, hero shot',
    expected: 'block',
  },
];
for (const c of imageCases) {
  const v = validateImagePrompt(c.prompt);
  const ok = v.severity === c.expected;
  const symbol = ok ? '✅' : '❌';
  console.log(`${symbol} ${c.label.padEnd(40)} expected=${c.expected.padEnd(7)} got=${v.severity.padEnd(7)} score=${v.quality_score}`);
  if (!ok) {
    console.log('   findings:', v.findings.map(f => `[${f.severity}] ${f.code}`).join(', '));
    fail++;
  } else pass++;
}

// ─── Video prompt validator ─────────────────────────────────
console.log('\nSMOKE TEST — video prompt\n');
const videoCases = [
  {
    label: 'rich english brief',
    prompt: 'Cinematic dolly in on barista pouring espresso into ceramic cup, golden hour light, smoke rising, slow motion',
    duration: 5,
    expected: 'clean',
  },
  {
    label: 'french brief (block)',
    prompt: 'Une vidéo cinématique avec un mouvement de caméra et de la lumière naturelle dans la salle du restaurant',
    duration: 5,
    expected: 'block',
  },
  {
    label: 'too short',
    prompt: 'food',
    duration: 5,
    expected: 'block',
  },
  {
    label: 'duration out of range',
    prompt: 'Cinematic dolly in on espresso pour with golden hour rim light',
    duration: 30,
    expected: 'block',
  },
  {
    label: 'no movement / no camera',
    prompt: 'A beautiful product shot of fresh bread on a wooden surface',
    duration: 5,
    expected: 'warn',
  },
];
for (const c of videoCases) {
  const v = validateVideoPrompt(c.prompt, { duration: c.duration });
  const ok = v.severity === c.expected;
  const symbol = ok ? '✅' : '❌';
  console.log(`${symbol} ${c.label.padEnd(40)} expected=${c.expected.padEnd(7)} got=${v.severity.padEnd(7)} score=${v.quality_score}`);
  if (!ok) {
    console.log('   findings:', v.findings.map(f => `[${f.severity}] ${f.code}`).join(', '));
    fail++;
  } else pass++;
}

// ─── Output validators ─────────────────────────────────────
console.log('\nSMOKE TEST — media output\n');
const outputCases = [
  { label: 'image post 1080x1080 ok',     fn: () => validateImageOutput({ url: 'https://cdn.example.com/img.jpg', width: 1080, height: 1080, format: 'post' }), expected: 'clean' },
  { label: 'image post wrong aspect',     fn: () => validateImageOutput({ url: 'https://cdn.example.com/img.jpg', width: 1080, height: 1920, format: 'post' }), expected: 'block' },
  { label: 'image story 1080x1920 ok',    fn: () => validateImageOutput({ url: 'https://cdn.example.com/img.jpg', width: 1080, height: 1920, format: 'story' }), expected: 'clean' },
  { label: 'image with error placeholder',fn: () => validateImageOutput({ url: 'https://cdn.example.com/error_placeholder.jpg', width: 1080, height: 1080, format: 'post' }), expected: 'block' },
  { label: 'invalid url',                 fn: () => validateImageOutput({ url: 'not a url', width: 1080, height: 1080, format: 'post' }), expected: 'block' },
  { label: 'video reel 8s ok',            fn: () => validateVideoOutput({ url: 'https://cdn.example.com/v.mp4', duration_sec: 8, format: 'reel' }), expected: 'clean' },
  { label: 'video zero duration',         fn: () => validateVideoOutput({ url: 'https://cdn.example.com/v.mp4', duration_sec: 0, format: 'reel' }), expected: 'block' },
];
for (const c of outputCases) {
  const v = c.fn();
  const ok = v.severity === c.expected;
  const symbol = ok ? '✅' : '❌';
  console.log(`${symbol} ${c.label.padEnd(40)} expected=${c.expected.padEnd(7)} got=${v.severity.padEnd(7)} score=${v.quality_score}`);
  if (!ok) {
    console.log('   findings:', v.findings.map(f => `[${f.severity}] ${f.code}`).join(', '));
    fail++;
  } else pass++;
}

const total = cases.length + imageCases.length + videoCases.length + outputCases.length;
console.log(`\n${pass}/${total} pass · ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
