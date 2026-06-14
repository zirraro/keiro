export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * POST /api/anon-gen/check
 *
 * Server-side source of truth for the anonymous (logged-out) free-generation
 * quota. Guarantees 1 free generation per IP and prevents bypassing the
 * client-side localStorage counter by clearing it.
 *
 * Returns { allowed: true } and increments when the IP still has a free gen,
 * { allowed: false, gate: 'signup' } once exhausted. Fails OPEN on any error
 * so a tracking glitch never blocks a legitimate first generation.
 *
 * Privacy: the IP is stored HASHED (sha256 + salt), never in clear.
 */

const FREE_PER_IP = 1;

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
  try {
    const ipHash = hashIp(getIp(req));
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: row } = await sb
      .from('anon_gen_log')
      .select('count')
      .eq('ip_hash', ipHash)
      .maybeSingle();

    const used = row?.count ?? 0;

    if (used >= FREE_PER_IP) {
      return NextResponse.json({ ok: true, allowed: false, used, gate: 'signup' });
    }

    // Consume one free generation for this IP.
    await sb
      .from('anon_gen_log')
      .upsert(
        { ip_hash: ipHash, count: used + 1, last_at: new Date().toISOString() },
        { onConflict: 'ip_hash' },
      );

    return NextResponse.json({
      ok: true,
      allowed: true,
      used: used + 1,
      remaining: Math.max(0, FREE_PER_IP - (used + 1)),
    });
  } catch (e: any) {
    // Fail OPEN — never block a real first generation on a tracking error.
    console.error('[anon-gen/check] error (failing open):', e?.message);
    return NextResponse.json({ ok: true, allowed: true, failOpen: true });
  }
}
