/**
 * Validation d'email partagée — fiabilité de la base de prospection.
 *
 * 2026-06-22 — Founder : "on veut des fiches avec des infos contacts ultra
 * fiables car ce sont nos bases de prospection utilisées par TOUS les agents".
 * La validation MX n'existait qu'au moment de l'envoi (Hugo). On la remonte
 * à l'INSERTION (Léo / commercial) + on offre une re-vérification, pour que
 * la base soit propre à la source.
 *
 * 3 niveaux, du moins cher au plus cher :
 *   1. format   — regex stricte (gratuit, instantané)
 *   2. jetable  — domaine temporaire connu (gratuit)
 *   3. MX       — le domaine peut-il recevoir du mail ? (DNS, mis en cache)
 *
 * On NE supprime jamais un prospect (cf. règle CRM) : un email invalide est
 * juste FLAGUÉ (email_sequence_status='email_invalid') pour qu'aucun agent ne
 * l'utilise, le prospect restant joignable via DM/téléphone.
 */

import dns from 'dns/promises';

const mxCache = new Map<string, boolean>();

// Regex pragmatique (RFC-lite) : un @, un domaine avec au moins un point, pas
// d'espaces, pas de double-point. Couvre 99.9% des vrais emails sans rejeter
// les TLD longs / sous-domaines.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DISPOSABLE_DOMAINS = new Set([
  'yopmail.com', 'guerrillamail.com', 'tempmail.com', 'mailinator.com',
  'throwaway.email', '10minutemail.com', 'trashmail.com', 'getnada.com',
  'temp-mail.org', 'fakeinbox.com', 'sharklasers.com', 'maildrop.cc',
]);

// Adresses "role" à faible valeur de contact (souvent non lues / no-reply).
// On NE les bloque PAS (un contact@ reste joignable) mais on le signale pour
// que Léo préfère une adresse nominative si dispo.
const ROLE_PREFIXES = new Set(['noreply', 'no-reply', 'donotreply', 'postmaster', 'mailer-daemon']);

export type EmailValidation = {
  valid: boolean;
  reason: string | null;       // pourquoi invalide (null si valide)
  isRole: boolean;             // adresse générique (contact@, info@…)
  domain: string | null;
  checkedMx: boolean;          // le MX a-t-il été testé ?
};

export async function hasMxRecord(domain: string): Promise<boolean> {
  if (!domain) return false;
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;
  try {
    const records = await dns.resolveMx(domain);
    const ok = Array.isArray(records) && records.length > 0;
    mxCache.set(domain, ok);
    return ok;
  } catch (e: any) {
    // ENOTFOUND / ENODATA → le domaine ne peut PAS recevoir de mail.
    if (e?.code === 'ENOTFOUND' || e?.code === 'ENODATA') {
      mxCache.set(domain, false);
      return false;
    }
    // SERVFAIL / TIMEOUT → bénéfice du doute (pas de cache), on ne flague pas.
    return true;
  }
}

/**
 * Valide un email. `checkMx=false` saute le DNS (validation rapide en masse).
 * Quand `checkMx=true`, un MX absent rend l'email invalide.
 */
export async function validateEmail(
  email: string | null | undefined,
  opts: { checkMx?: boolean } = { checkMx: true },
): Promise<EmailValidation> {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { valid: false, reason: 'empty', isRole: false, domain: null, checkedMx: false };
  if (!EMAIL_RE.test(e)) return { valid: false, reason: 'bad_format', isRole: false, domain: null, checkedMx: false };

  const domain = e.split('@')[1];
  const localPart = e.split('@')[0];
  const isRole = ROLE_PREFIXES.has(localPart);

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'disposable', isRole, domain, checkedMx: false };
  }

  if (opts.checkMx) {
    const mxOk = await hasMxRecord(domain);
    if (!mxOk) return { valid: false, reason: 'no_mx', isRole, domain, checkedMx: true };
    return { valid: true, reason: null, isRole, domain, checkedMx: true };
  }

  return { valid: true, reason: null, isRole, domain, checkedMx: false };
}

/** Validation format-only synchrone (ultra rapide, pas de DNS). */
export function isValidEmailFormat(email: string | null | undefined): boolean {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !EMAIL_RE.test(e)) return false;
  const domain = e.split('@')[1];
  return !DISPOSABLE_DOMAINS.has(domain);
}
