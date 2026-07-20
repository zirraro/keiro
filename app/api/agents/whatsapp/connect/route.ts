import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/whatsapp/connect
 *   body { phone_number_id, waba_id, display_phone_number? }
 *
 * Appelé par le flux Embedded Signup (Coexistence) après que le CLIENT a connecté
 * SON numéro : on capte les IDs renvoyés par Meta, on les mappe au client (multi-
 * tenant), et on abonne notre app à sa WABA pour recevoir ses messages.
 * Founder 2026-07-20 : chaque client connecte son numéro, KeiroAI route + facture.
 */
export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const phoneNumberId = String(body.phone_number_id || '').trim();
  const wabaId = String(body.waba_id || '').trim();
  const displayPhone = String(body.display_phone_number || '').trim();
  if (!phoneNumberId || !wabaId) {
    return NextResponse.json({ ok: false, error: 'phone_number_id et waba_id requis' }, { status: 400 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 1) Mapping client → numéro (config agent 'whatsapp'). Sert au routage multi-tenant.
  const { data: existing } = await sb
    .from('org_agent_configs')
    .select('id, config')
    .eq('user_id', user.id)
    .eq('agent_id', 'whatsapp')
    .order('created_at', { ascending: false })
    .limit(1);
  const cfg = { ...((existing?.[0]?.config as any) || {}), whatsapp_phone_number_id: phoneNumberId, whatsapp_waba_id: wabaId, whatsapp_display_phone: displayPhone, whatsapp_connected_at: new Date().toISOString() };
  if (existing?.[0]?.id) {
    await sb.from('org_agent_configs').update({ config: cfg }).eq('id', existing[0].id);
  } else {
    await sb.from('org_agent_configs').insert({ user_id: user.id, agent_id: 'whatsapp', config: cfg });
  }

  // 2) Abonner notre app à la WABA du client (pour recevoir ses messages entrants).
  //    Utilise le token System User permanent de KeiroAI.
  let subscribed = false;
  try {
    const tok = process.env.WHATSAPP_ACCESS_TOKEN;
    if (tok) {
      const r = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok}` },
      });
      subscribed = r.ok;
    }
  } catch { /* best-effort — peut être fait aussi côté Embedded Signup */ }

  await sb.from('agent_logs').insert({
    agent: 'whatsapp', action: 'whatsapp_connected', user_id: user.id,
    data: { phone_number_id: phoneNumberId, waba_id: wabaId, subscribed }, created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, subscribed });
}
