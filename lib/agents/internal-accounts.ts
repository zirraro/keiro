/**
 * Comptes INTERNES : jamais de génération de contenu (images, reels, posts).
 *
 * Règle fondateur du 2026-07-29. Deux comptes produisaient du contenu payant
 * sans que personne ne le publie jamais :
 *   - mrzirraro+metareview@gmail.com : bac à sable créé pour la revue Meta,
 *     rien d'autre. Il portait 356 posts approuvés jamais publiés et 249
 *     échecs de publication (token Instagram invalide) sur juin-juillet.
 *   - contact@keiroai.com : compte admin de supervision, pas un client.
 *
 * Chaque post généré coûte une image (~0,03 €) : générer pour ces comptes,
 * c'est brûler du budget pour un contenu que personne ne verra.
 *
 * NB : mrzirraro@gmail.com (le compte vitrine du fondateur) N'EST PAS dans
 * cette liste — lui publie pour de vrai.
 */

const INTERNAL_EMAILS = new Set([
  'mrzirraro+metareview@gmail.com',
  'contact@keiroai.com',
]);

const INTERNAL_USER_IDS = new Set([
  '84ab08f0-f653-4c82-be28-4dd6a65dfbf2', // mrzirraro+metareview@gmail.com
  '9bbcc8f2-e19a-4568-8b6c-cefc67e6b766', // contact@keiroai.com
]);

/** Ce compte doit-il être exclu de toute génération de contenu ? */
export function isNoContentAccount(opts: { email?: string | null; userId?: string | null }): boolean {
  const email = (opts.email || '').trim().toLowerCase();
  if (email && INTERNAL_EMAILS.has(email)) return true;
  if (opts.userId && INTERNAL_USER_IDS.has(opts.userId)) return true;
  return false;
}

/** Variante par identifiant seul, quand l'email n'est pas sous la main. */
export function isNoContentUserId(userId: string | null | undefined): boolean {
  return !!userId && INTERNAL_USER_IDS.has(userId);
}

export const NO_CONTENT_EMAILS = [...INTERNAL_EMAILS];
