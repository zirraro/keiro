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
 * Returns { allowed: true } and consumes one credit when the IP still has a
 * free gen, { allowed: false, gate: 'signup' } once exhausted. Fails OPEN on
 * any error so a tracking glitch never blocks a legitimate first generation.
 *
 * Stockage : public.anon_gen_log sur Supabase, via la fonction atomique
 * anon_gen_touch(). Cette table vivait sur une base Neon héritée de Vercel,
 * dernier vestige d'une infrastructure abandonnée : une dépendance de plus à
 * maintenir, à payer et à surveiller pour une seule route.
 *
 * L'incrément passe par une fonction SQL et non par un lire-puis-écrire :
 * deux requêtes simultanées de la même IP liraient sinon la même valeur, et la
 * limite se contournerait en rafale.
 *
 * Confidentialité : l'IP est stockée HACHÉE (sha256 + sel), jamais en clair.
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Échec OUVERT : un incident de comptage ne doit jamais empêcher une
  // première génération légitime — on préfère offrir un visuel de trop que
  // bloquer un prospect.
  if (!url || !cle) return NextResponse.json({ ok: true, allowed: true, failOpen: true });

  try {
    const supabase = createClient(url, cle, { auth: { persistSession: false } });
    const ipHash = hashIp(getIp(req));
    const { data, error } = await supabase.rpc('anon_gen_touch', { p_ip_hash: ipHash });
    if (error) throw error;

    const used: number = typeof data === 'number' ? data : 1;
    const allowed = used <= FREE_PER_IP;
    return NextResponse.json({
      ok: true,
      allowed,
      used,
      remaining: Math.max(0, FREE_PER_IP - used),
      ...(allowed ? {} : { gate: 'signup' }),
    });
  } catch (e: any) {
    console.warn('[anon-gen] comptage indisponible, on laisse passer:', e?.message);
    return NextResponse.json({ ok: true, allowed: true, failOpen: true });
  }
}
