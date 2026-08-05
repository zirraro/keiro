/**
 * Normalisation des numéros de téléphone pour WhatsApp.
 *
 * Vit dans `lib` et non dans la route : Next.js n'autorise qu'un jeu fixe
 * d'exports dans un fichier `route.ts` (GET, POST, runtime…) et fait échouer
 * le build sur tout le reste. La fonction était aussi testable ici, ce qui
 * était la vraie raison de l'exporter.
 */

/**
 * Vers le format attendu par Meta : international, sans « + » ni séparateur.
 *
 * Un numéro mal formé part en erreur silencieuse côté Meta — le message
 * n'arrive jamais et rien ne le signale. D'où une normalisation stricte plutôt
 * qu'un espoir placé dans la saisie.
 */
export function normaliserNumero(brut: string): string | null {
  const n = String(brut || '').replace(/[^\d+]/g, '');
  if (!n) return null;
  if (n.startsWith('+')) return n.slice(1);
  if (n.startsWith('00')) return n.slice(2);
  // 0X XX XX XX XX → 33X XX XX XX XX
  if (n.startsWith('0') && n.length === 10) return '33' + n.slice(1);
  if (n.length >= 11) return n;
  return null;
}
