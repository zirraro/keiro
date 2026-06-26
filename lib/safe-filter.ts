/**
 * Assainissement des valeurs interpolées dans les filtres PostgREST
 * (`.or()`, `.ilike()`, `.filter()`). Sans ça, une entrée externe contenant
 * `,` `.` `(` `)` peut injecter de la syntaxe de filtre et élargir le scope
 * d'une requête (OWASP ASVS V5 / injection). À utiliser sur toute valeur
 * issue d'un webhook ou d'un input utilisateur avant interpolation.
 */

/** Retire les métacaractères de filtre PostgREST + wildcards LIKE. */
export function pgSafe(v: unknown): string {
  return String(v ?? '')
    .replace(/[,()\\*%_]/g, ' ')   // séparateurs/opérateurs PostgREST + wildcards
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Numéro de téléphone : ne garde que chiffres et +. */
export function phoneSafe(v: unknown): string {
  return String(v ?? '').replace(/[^0-9+]/g, '').slice(0, 20);
}

/** Email basique normalisé (lowercase, sans métacaractères de filtre). */
export function emailSafe(v: unknown): string {
  const e = String(v ?? '').toLowerCase().trim();
  return /^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/.test(e) ? e : '';
}
