import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Toggle "gestion complète de la boîte" (Option B) PAR UTILISATEUR (founder 25/07).
 * GET  → { enabled }  (flag org_agent_configs email.config.full_mailbox)
 * POST { enable:false } → désactive le flag.
 * ⚠️ ACTIVER passe par la reconnexion OAuth (/api/auth/gmail-oauth?optionB=1) car il
 * faut le consentement des scopes readonly+compose+modify — le callback pose le flag.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const sb = admin();
  const { data } = await sb.from('org_agent_configs').select('config').eq('user_id', user.id).eq('agent_id', 'email').order('created_at', { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ ok: true, enabled: !!(data?.config as any)?.full_mailbox });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const enable = !!body.enable;
  const sb = admin();
  const { data: cfgRow } = await sb.from('org_agent_configs').select('id, config').eq('user_id', user.id).eq('agent_id', 'email').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const nextCfg = { ...((cfgRow?.config as any) || {}), full_mailbox: enable };
  if (cfgRow?.id) await sb.from('org_agent_configs').update({ config: nextCfg }).eq('id', cfgRow.id);
  else await sb.from('org_agent_configs').insert({ user_id: user.id, agent_id: 'email', config: nextCfg });
  // Pour ACTIVER, renvoie l'URL de reconnexion (consentement scopes étendus requis).
  return NextResponse.json({ ok: true, enabled: enable, reconnectUrl: enable ? '/api/auth/gmail-oauth?optionB=1&returnTo=/assistant/agent/email' : null });
}
