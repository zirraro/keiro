import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * LÉO — SESSIONS DE DÉMARCHAGE DATÉES (founder 13/07). Chaque liste générée
 * (préfaite depuis le CRM OU recherche Google) est sauvegardée avec sa DATE et
 * apparaît en mini-onglet, pour la finaliser jour par jour. Priorité coût : on
 * recharge une session par ses prospect_ids (0 requête Google).
 *
 * Stockage : org_agent_configs.config.prospection_sessions (jsonb, pas de
 * migration). On garde les 12 dernières.
 */
const MAX_SESSIONS = 12;

async function loadCfg(supabase: any, userId: string) {
  const { data } = await supabase.from('org_agent_configs')
    .select('id, config').eq('user_id', userId).eq('agent_id', 'commercial')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return { row: data, config: (data?.config as any) || {} };
}
async function saveCfg(supabase: any, userId: string, row: any, config: any) {
  if (row?.id) await supabase.from('org_agent_configs').update({ config }).eq('id', row.id);
  else await supabase.from('org_agent_configs').insert({ user_id: userId, agent_id: 'commercial', config });
}

export async function GET(_req: NextRequest) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { config } = await loadCfg(supabase, user.id);
    const sessions = Array.isArray(config.prospection_sessions) ? config.prospection_sessions : [];
    return NextResponse.json({ ok: true, sessions });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const source = body.source === 'google' ? 'google' : 'crm';
    const params = body.params && typeof body.params === 'object' ? body.params : {};
    const prospectIds: string[] = Array.isArray(body.prospect_ids) ? body.prospect_ids.filter((x: any) => typeof x === 'string').slice(0, 100) : [];
    if (prospectIds.length === 0) return NextResponse.json({ error: 'prospect_ids requis' }, { status: 400 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { row, config } = await loadCfg(supabase, user.id);
    const prev: any[] = Array.isArray(config.prospection_sessions) ? config.prospection_sessions : [];

    const at = new Date().toISOString();
    const labelBits = [params.sector, params.city].filter(Boolean).join(' · ');
    const session = {
      id: `s_${at.replace(/[^0-9]/g, '').slice(0, 14)}_${Math.floor(prospectIds.length)}`,
      at, source, params, prospect_ids: prospectIds, count: prospectIds.length,
      label: labelBits || (source === 'google' ? 'Recherche Google' : 'CRM'),
    };
    const next = [session, ...prev].slice(0, MAX_SESSIONS);
    await saveCfg(supabase, user.id, row, { ...config, prospection_sessions: next });

    return NextResponse.json({ ok: true, session, sessions: next });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}
