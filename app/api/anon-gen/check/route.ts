export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore — pg ships no bundled types and @types/pg is not installed
import { Client } from 'pg';
import crypto from 'crypto';

/**
 * POST /api/anon-gen/check
 *
 * Server-side source of truth for the anonymous (logged-out) free-generation
 * quota. Guarantees 1 free generation per IP and prevents bypassing the
 * client-side localStorage counter by clearing it.
 *
 * Returns { allowed: true } and consumes one credit when the IP still has a
 * free gen, { allowed: false, gate: 'signup' } once exhausted. Fails OPEN on
 * any error so a tracking glitch never blocks a legitimate first generation.
 *
 * Storage: public.anon_gen_log on the Postgres pointed to by POSTGRES_URL.
 * Privacy: the IP is stored HASHED (sha256 + salt), never in clear.
 */

const FREE_PER_IP = 2; // 2 visuels gratuits par IP pour appâter le lead (founder 03/07)

function getIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const first = fwd.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

function hashIp(ip: string): string {
  const salt = process.env.ANON_IP_SALT || process.env.CRON_SECRET || 'keiro-anon-salt';
  return crypto.createHash('sha256').update(`${ip}:${salt}`).digest('hex');
}

export async function POST(req: NextRequest) {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    return NextResponse.json({ ok: true, allowed: true, failOpen: true });
  }
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const ipHash = hashIp(getIp(req));
    await client.connect();
    // Atomic: insert count=1, or increment on conflict; return the new count.
    const res = await client.query(
      `insert into public.anon_gen_log (ip_hash, count, last_at)
       values ($1, 1, now())
       on conflict (ip_hash) do update
         set count = public.anon_gen_log.count + 1, last_at = now()
       returning count;`,
      [ipHash],
    );
    const used: number = res.rows?.[0]?.count ?? 1;
    const allowed = used <= FREE_PER_IP;
    return NextResponse.json({
      ok: true,
      allowed,
      used,
      remaining: Math.max(0, FREE_PER_IP - used),
      ...(allowed ? {} : { gate: 'signup' }),
    });
  } catch (e: any) {
    // Fail OPEN — never block a real first generation on a tracking error.
    console.error('[anon-gen/check] error (failing open):', e?.message);
    return NextResponse.json({ ok: true, allowed: true, failOpen: true });
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}
