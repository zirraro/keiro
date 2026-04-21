/**
 * AES-256-GCM helpers for encrypting SMTP passwords at rest.
 *
 * The key lives in env (SMTP_ENC_KEY) as a hex string (32 bytes = 64 hex
 * chars). Generate once with: `openssl rand -hex 32` and paste into the
 * VPS .env.local before deploying the SMTP feature.
 *
 * Format of stored value (colon-delimited, all base64url):
 *   <iv>:<authTag>:<ciphertext>
 *
 * We pick GCM over CBC to get authenticated encryption — an attacker
 * who tampers with the DB ciphertext would fail decryption cleanly
 * instead of silently returning garbage that could blow up SMTP login.
 */

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const k = process.env.SMTP_ENC_KEY;
  if (!k || k.length !== 64) {
    throw new Error('SMTP_ENC_KEY must be a 64-char hex string (32 bytes). Generate with `openssl rand -hex 32`.');
  }
  return Buffer.from(k, 'hex');
}

export function encryptSmtpPassword(plaintext: string): string {
  const iv = crypto.randomBytes(12); // GCM wants 12 bytes
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map(b => b.toString('base64url')).join(':');
}

export function decryptSmtpPassword(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Malformed ciphertext');
  const [iv, tag, ct] = parts.map(p => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
