import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';
import { parseAddressDeterministic } from '@/lib/agents/address-parser';

export const runtime = 'nodejs';

/**
 * LÉO — ENRICHISSEMENT GRATUIT DES FICHES (founder 13/07 : "augmenter la
 * complétude, en maîtrisant le coût"). On remplit le champ ESSENTIEL `quartier`
 * (compte dans le score) à partir de l'ADRESSE déjà présente, via un parseur
 * LOCAL déterministe → **ZÉRO appel API, zéro coût**. On dérive aussi la ville
 * quand elle manque. Aucune donnée inventée : uniquement ce que l'adresse porte.
 *
 * (L'enrichissement payant — email/Instagram — reste séparé et plafonné.)
 *
 * Auth : utilisateur connecté (scopé à SES fiches) OU CRON_SECRET (backfill global).
 * GET/POST { limit? }
 */
async function run(userId: string | null, limit: number) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  let q = supabase.from('crm_prospects')
    .select('id, address, quartier, ville')
    .or('quartier.is.null,quartier.eq.')
    .not('address', 'is', null)
    .limit(limit);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message, updated: 0 };

  let updated = 0;
  for (const p of data || []) {
    const parsed = parseAddressDeterministic(p.address || null);
    const patch: Record<string, any> = {};
    if (parsed.quartier && parsed.confidence >= 70 && !p.quartier) patch.quartier = parsed.quartier;
    if (parsed.ville && !p.ville) patch.ville = parsed.ville;
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      await supabase.from('crm_prospects').update(patch).eq('id', p.id);
      updated++;
    }
  }
  return { ok: true, scanned: (data || []).length, updated };
}

async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  const isCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const limit = Math.min(500, parseInt(new URL(req.url).searchParams.get('limit') || '300', 10));

  if (isCron) return NextResponse.json(await run(null, limit));

  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await run(user.id, limit));
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
