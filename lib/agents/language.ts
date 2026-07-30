/**
 * Langue de travail des agents — français ET anglais.
 *
 * Règle fondateur (2026-07-30) : « tous les agents doivent bien comprendre et
 * actionner le français et l'anglais, super important ».
 *
 * Avant, six prompts imposaient « Réponds en français » en dur : un client
 * anglophone recevait des réponses en français, et les formulations reconnues
 * pour déclencher une action n'existaient qu'en français — « clean my inbox »
 * ne déclenchait rien.
 *
 * Ordre de priorité : le réglage explicite du client > la langue du message
 * qu'il vient d'écrire > le français par défaut (notre marché principal).
 */

export type AgentLang = 'fr' | 'en';

/** Mots très fréquents et discriminants, pour trancher sans dépendance externe. */
const FR_MARKERS = /\b(je|tu|nous|vous|le|la|les|des|une|un|est|sont|pour|avec|dans|mais|pas|plus|mes|mon|ma|ton|ta|ça|c'est|qu'|d'|l'|bonjour|salut|merci|s'il|peux|veux|fais|publie|poste|envoie|nettoie|range|trie)\b/gi;
const EN_MARKERS = /\b(i|you|we|the|a|an|is|are|for|with|in|but|not|more|my|your|it's|don't|hi|hello|thanks|please|can|want|make|publish|post|send|clean|sort|file|schedule)\b/gi;

/** Langue d'un texte libre. Renvoie null si le texte est trop court pour trancher. */
export function detectLang(text: string | null | undefined): AgentLang | null {
  const t = (text || '').trim();
  if (t.length < 12) return null;
  const fr = (t.match(FR_MARKERS) || []).length;
  const en = (t.match(EN_MARKERS) || []).length;
  if (fr === 0 && en === 0) return null;
  // Les accents tranchent vite en faveur du français.
  const accents = (t.match(/[àâäéèêëîïôöùûüçœ]/gi) || []).length;
  if (accents >= 2 && fr >= en) return 'fr';
  if (en > fr) return 'en';
  if (fr > en) return 'fr';
  return null;
}

/**
 * Langue à utiliser pour ce client.
 * @param configured valeur du réglage `langue` (peut être "fr", "en", "français", "english"…)
 * @param message    dernier message du client
 */
export function resolveLang(configured?: string | null, message?: string | null): AgentLang {
  const c = (configured || '').toLowerCase().trim();
  if (c.startsWith('en') || c.includes('anglais') || c.includes('english')) return 'en';
  if (c.startsWith('fr') || c.includes('français') || c.includes('francais')) return 'fr';
  return detectLang(message) || 'fr';
}

/** Consigne de langue injectée dans le prompt de l'agent. */
export function languagePromptBlock(lang: AgentLang): string {
  return lang === 'en'
    ? `\n━━━ LANGUAGE ━━━
This client works in ENGLISH. Reply in English, and produce every deliverable
(posts, captions, emails, documents, replies to reviews and messages) in English.
You still understand French perfectly: if the client switches to French
mid-conversation, follow them without asking.\n`
    : `\n━━━ LANGUE ━━━
Ce client travaille en FRANÇAIS. Réponds en français, et produis tous les
livrables (posts, légendes, emails, documents, réponses aux avis et aux
messages) en français. Tu comprends parfaitement l'anglais : si le client passe
à l'anglais en cours de conversation, suis-le sans lui demander.\n`;
}
