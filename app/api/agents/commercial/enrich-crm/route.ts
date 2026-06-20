import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectSector, SECTORS } from '@/lib/agents/sales-playbook';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Enrichissement CRM léger (founder: "enrichir si il manque des infos, récupérer
 * le max d'info pour une utilisation pertinente"). Remplit le `business_type`
 * manquant des prospects en l'INFÉRANT du nom du commerce (gratuit, zéro API)
 * → Jade/qualification ne restent plus sur "autre" et les accroches sont justes.
 * Bounded. Ne remplit QUE quand l'inférence est confiante (≠ autre).
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function run(userId?: string, limit = 200) {
  const supabase = sb();
  let q = supabase.from('crm_prospects')
    .select('id, company, business_type')
    .or('business_type.is.null,business_type.eq.')
    .not('company', 'is', null)
    .limit(limit);
  if (userId) q = q.eq('user_id', userId);
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let updated = 0;
  for (const r of rows || []) {
    const sector = detectSector(String(r.company || ''));
    if (sector === 'autre') continue; // pas d'inférence confiante → on ne pollue pas
    try {
      await supabase.from('crm_prospects').update({ business_type: SECTORS[sector].label }).eq('id', r.id);
      updated++;
    } catch { /* skip */ }
  }
  return NextResponse.json({ ok: true, scanned: (rows || []).length, updated });
}

export async function GET(req: NextRequest) {
  const cs = process.env.CRON_SECRET;
  if (!cs || req.headers.get('authorization') !== `Bearer ${cs}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return run(req.nextUrl.searchParams.get('user_id') || undefined);
}
export async function POST(req: NextRequest) {
  const cs = process.env.CRON_SECRET;
  if (!cs || req.headers.get('authorization') !== `Bearer ${cs}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  return run(body.userId, body.limit || 200);
}
