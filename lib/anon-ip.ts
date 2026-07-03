import crypto from 'crypto';

/**
 * Shared IP helpers for the anonymous free-generation funnel.
 * The IP is only ever stored HASHED (sha256 + salt), never in clear.
 * Same salt across check / save / claim so a visitor's visuals can be
 * matched to their IP at signup time.
 */

export function getIp(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const first = fwd.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

export function hashIp(ip: string): string {
  const salt = process.env.ANON_IP_SALT || process.env.CRON_SECRET || 'keiro-anon-salt';
  return crypto.createHash('sha256').update(`${ip}:${salt}`).digest('hex');
}

/** Tag stored on an anonymous saved_images row so we can find it by IP later. */
export function anonTag(ipHash: string): string {
  return `anon:${ipHash}`;
}
