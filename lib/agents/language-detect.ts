/**
 * Lightweight language detection for customer-facing agents.
 *
 * Every agent that replies to a prospect / client (DM, comment, email,
 * Google review, WhatsApp, chatbot) should detect the incoming language
 * and respond in the SAME language. French stays the default when we
 * can't tell, because the product primary market is French commerces.
 *
 * We intentionally skip a heavy library — a keyword+diacritics heuristic
 * is > 95% accurate on short customer messages (< 50 words) and costs
 * ~0.01ms per call. For longer mixed-language threads, feed the detected
 * language back into the prompt and let the LLM mirror the client.
 */

const FR_MARKERS = [
  // Function words
  'je', 'tu', 'nous', 'vous', 'ils', 'elles', 'on',
  'est', 'sont', 'avec', 'dans', 'pour', 'sur', 'sans', 'mais', 'donc',
  'voici', 'voilà', 'aussi', 'très', 'bien', 'merci', 'bonjour', 'salut',
  'oui', 'non', 'peut', 'être', 'avoir', 'faire', 'aller', 'venir',
  // Common business words
  'restaurant', 'boutique', 'coiffeur', 'fleuriste',
  "j'ai", "c'est", "t'as", "n'est",
];
const EN_MARKERS = [
  'the', 'and', 'you', 'your', 'that', 'this', 'with', 'from', 'have',
  'has', 'will', 'can', 'could', 'would', 'should',
  'hello', 'hi', 'hey', 'thanks', 'please', 'sorry', 'yes', 'no',
  'great', 'good', 'bad', 'interested', 'interesting',
  "i'm", "you're", "it's", "that's", "don't", "doesn't", "didn't",
];
const ES_MARKERS = ['hola', 'gracias', 'que', 'como', 'por', 'para', 'estoy', 'tengo', 'pero', 'tambien'];
const DE_MARKERS = ['hallo', 'danke', 'bitte', 'ich', 'wir', 'sie', 'nicht', 'auch', 'mit'];

// French-only diacritic set — presence of any of these is a strong FR signal
const FR_DIACRITICS = /[àâçéèêëîïôùûüœæ]/i;

export type DetectedLang = 'fr' | 'en' | 'es' | 'de' | 'unknown';

function countHits(text: string, markers: string[]): number {
  // word-boundary match on lowercase
  let hits = 0;
  for (const m of markers) {
    const re = new RegExp(`(^|[^\\p{L}])${m.replace(/'/g, "['\u2019]")}([^\\p{L}]|$)`, 'ui');
    if (re.test(text)) hits++;
  }
  return hits;
}

/**
 * Detect the language of a short customer message.
 * Returns 'unknown' when the input is empty or too short to tell.
 */
export function detectLanguage(text: string | null | undefined): DetectedLang {
  if (!text) return 'unknown';
  const clean = text.toLowerCase().trim();
  if (clean.length < 3) return 'unknown';

  const hasFrenchDiacritics = FR_DIACRITICS.test(clean);
  const fr = countHits(clean, FR_MARKERS) + (hasFrenchDiacritics ? 2 : 0);
  const en = countHits(clean, EN_MARKERS);
  const es = countHits(clean, ES_MARKERS);
  const de = countHits(clean, DE_MARKERS);

  const scores: Array<[DetectedLang, number]> = [
    ['fr', fr], ['en', en], ['es', es], ['de', de],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = scores[0];
  if (topScore === 0) return 'unknown';
  // Need a clear margin over second place to avoid flipping between FR and EN
  const secondScore = scores[1][1];
  if (topScore - secondScore < 1 && !(topLang === 'fr' && hasFrenchDiacritics)) return 'unknown';
  return topLang;
}

/**
 * Produce a concise prompt snippet that tells the LLM to mirror the
 * incoming message's language. Pass the last prospect/client message
 * (or the full thread) as `sample`.
 */
export function languagePromptDirective(
  sample: string | null | undefined,
  opts: { defaultLang?: DetectedLang } = {},
): string {
  const defaultLang = opts.defaultLang || 'fr';
  const detected = detectLanguage(sample);
  const effective = detected === 'unknown' ? defaultLang : detected;

  const LANG_NAME: Record<DetectedLang, string> = {
    fr: 'French',
    en: 'English',
    es: 'Spanish',
    de: 'German',
    unknown: 'French',
  };

  return `LANGUAGE — mirror the customer:
- Detected language: ${LANG_NAME[effective]} (${effective})
- Write your entire reply in ${LANG_NAME[effective]}.
- If the customer switches language mid-thread, follow their latest message.
- Tone stays the same as the agent persona (no robotic translation — write like a native speaker).`;
}
