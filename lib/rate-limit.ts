/**
 * Rate limiting léger en mémoire (par process) — protège les endpoints publics
 * contre l'abus/bruteforce/spam (OWASP ASVS V11, exigence CASA). Pas de Redis :
 * fenêtre fixe par clé (IP). Suffisant pour 1 process pm2 ; pour multi-instance,
 * remplacer par Upstash plus tard.
 */
import { NextRequest, NextResponse } from 'next/server';

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  // Nettoyage paresseux pour borner la mémoire (toutes les 60s max).
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}

/** Retourne l'IP cliente best-effort (derrière nginx/Cloudflare). */
export function clientIp(req: NextRequest | Request): string {
  const h = (req as any).headers;
  const xff = h.get('x-forwarded-for') || '';
  return (xff.split(',')[0] || '').trim() || h.get('x-real-ip') || h.get('cf-connecting-ip') || 'unknown';
}

/** Vérifie+consomme un jeton. ok=false si dépassement. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  b.count++;
  return { ok: true, retryAfter: 0 };
}

/**
 * Garde prête à l'emploi pour une route : limite par IP+bucket. Renvoie une
 * NextResponse 429 si dépassé, sinon null (on continue).
 *   const limited = enforceRateLimit(req, 'capture-email', 10, 60_000); if (limited) return limited;
 */
export function enforceRateLimit(req: NextRequest | Request, bucket: string, limit: number, windowMs: number): NextResponse | null {
  const { ok, retryAfter } = rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs);
  if (ok) return null;
  return NextResponse.json(
    { ok: false, error: 'Trop de requêtes, réessaie plus tard.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}
