/**
 * Signed unsubscribe tokens for email footer links.
 *
 * Token format: base64url(prospectId).base64url(hmacSha256)
 * Verified on the /unsubscribe page — no DB lookup needed to validate,
 * which means the link works even if the prospect row was renamed/merged.
 */

import crypto from 'crypto';

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET
    || process.env.CRON_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || 'keiro-unsubscribe-fallback';
}

function b64urlEncode(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Buffer {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

/**
 * Returns a URL-safe token like "YWJj.xyz123" that encodes the prospect id
 * and is signed with our secret. Roughly 80 chars long.
 */
export function signProspectId(prospectId: string): string {
  const idPart = b64urlEncode(prospectId);
  const sig = crypto.createHmac('sha256', secret()).update(idPart).digest();
  return `${idPart}.${b64urlEncode(sig)}`;
}

/**
 * Returns the prospect id if the token is valid, null otherwise.
 * Uses timing-safe comparison to avoid token oracle attacks.
 */
export function verifyProspectToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const [idPart, sigPart] = token.split('.');
  if (!idPart || !sigPart) return null;

  const expected = crypto.createHmac('sha256', secret()).update(idPart).digest();
  let got: Buffer;
  try { got = b64urlDecode(sigPart); } catch { return null; }
  if (got.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(got, expected)) return null;

  try {
    return b64urlDecode(idPart).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Build the full unsubscribe URL for a prospect. Use in email templates.
 * Base can be overridden for dev/staging, defaults to prod.
 */
export function buildUnsubscribeUrl(prospectId: string, baseUrl?: string): string {
  const base = baseUrl
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || 'https://keiroai.com';
  return `${base.replace(/\/$/, '')}/unsubscribe?t=${signProspectId(prospectId)}`;
}
