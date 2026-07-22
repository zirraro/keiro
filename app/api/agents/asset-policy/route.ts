import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Police d'utilisation des fichiers CLIENT (founder 22/07). À l'upload, le client
 * déclare ce qu'on a le droit de faire de SES photos/vidéos : brut uniquement,
 * retouche qualité légère, mixage, ajout d'éléments IA. Stockée dans
 * org_agent_configs (agent_id='content').config.asset_usage_policy et lue par
 * Léna à la génération (getAssetUsagePolicyRules).
 *
 * GET  → { ok, policy }
 * POST { mode, allow_mix, allow_add_elements } → persiste
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
  const { data } = await sb.from('org_agent_configs').select('config').eq('user_id', user.id).eq('agent_id', 'content').maybeSingle();
  return NextResponse.json({ ok: true, policy: (data?.config as any)?.asset_usage_policy || null });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const modeIn = String(body.mode || '').trim();
  const mode = (['raw', 'light', 'free'].includes(modeIn) ? modeIn : 'light') as 'raw' | 'light' | 'free';
  const policy = {
    mode,
    allow_mix: !!body.allow_mix,
    allow_add_elements: !!body.allow_add_elements,
    updated_at: new Date().toISOString(),
  };

  const sb = admin();
  const { data: existing } = await sb
    .from('org_agent_configs')
    .select('id, config')
    .eq('user_id', user.id)
    .eq('agent_id', 'content')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextConfig = { ...((existing?.config as any) || {}), asset_usage_policy: policy };
  if (existing?.id) {
    await sb.from('org_agent_configs').update({ config: nextConfig }).eq('id', existing.id);
  } else {
    await sb.from('org_agent_configs').insert({ user_id: user.id, agent_id: 'content', config: nextConfig });
  }
  return NextResponse.json({ ok: true, policy });
}
