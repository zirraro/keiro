/**
 * Chiffrement au repos des tokens OAuth (Gmail, Google Business, Meta, TikTok…).
 *
 * Point central de l'audit Google CASA / OWASP ASVS : les credentials sensibles
 * stockés en base doivent être chiffrés au repos. On réutilise le même schéma
 * authentifié AES-256-GCM que les mots de passe SMTP (lib/smtp-crypto).
 *
 * Clé : env TOKEN_ENC_KEY (sinon repli sur SMTP_ENC_KEY déjà présente sur le VPS),
 * 64 hex = 32 octets. Générer avec `openssl rand -hex 32`.
 *
 * Format stocké : `gx1:<iv>:<tag>:<ciphertext>` (tout en base64url).
 * Le préfixe `gx1:` permet une détection NON ambiguë → rétro-compatibilité totale :
 *   - decryptToken() d'une valeur SANS préfixe = ancien token en clair → renvoyé tel quel.
 *   - les nouveaux écrits sont chiffrés ; les anciens migrent au prochain refresh/reconnect.
 */

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const PREFIX = 'gx1:';

function getKey(): Buffer | null {
  const k = process.env.TOKEN_ENC_KEY || process.env.SMTP_ENC_KEY;
  if (!k || k.length !== 64) return null; // pas de clé configurée → pas de chiffrement (disponibilité)
  return Buffer.from(k, 'hex');
}

/** Chiffre un token. Si aucune clé n'est configurée, renvoie le clair (avec warning). */
export function encryptToken(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === '') return plaintext ?? null;
  if (plaintext.startsWith(PREFIX)) return plaintext; // déjà chiffré
  const key = getKey();
  if (!key) {
    console.warn('[token-crypto] TOKEN_ENC_KEY/SMTP_ENC_KEY absente — token stocké en clair');
    return plaintext;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map(b => b.toString('base64url')).join(':');
}

/** Déchiffre un token. Valeur sans préfixe = ancien clair → renvoyée telle quelle. */
export function decryptToken(stored: string | null | undefined): string | null {
  if (stored == null || stored === '') return stored ?? null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const key = getKey();
  if (!key) {
    console.error('[token-crypto] valeur chiffrée mais aucune clé pour déchiffrer');
    return null;
  }
  try {
    const parts = stored.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return null;
    const [iv, tag, ct] = parts.map(p => Buffer.from(p, 'base64url'));
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e: any) {
    console.error('[token-crypto] échec déchiffrement:', e?.message);
    return null;
  }
}

/** True si la valeur est déjà chiffrée (utile pour scripts de migration). */
export function isEncrypted(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith(PREFIX);
}
