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
  let phoneNumberId = String(body.phone_number_id || '').trim();
  let wabaId = String(body.waba_id || '').trim();
  const displayPhone = String(body.display_phone_number || '').trim();
  const code = String(body.code || '').trim();

  // Flux Meta-HOSTED (secours quand le SDK JS est bloqué) : Facebook ne renvoie
  // qu'un `code`. On l'échange contre un token, puis on résout la WABA + le numéro
  // via debug_token (granular_scopes) — flux Tech Provider documenté.
  if ((!phoneNumberId || !wabaId) && code) {
    try {
      const appId = process.env.NEXT_PUBLIC_FB_APP_ID || '1240886857588819';
      const secret = process.env.WHATSAPP_APP_SECRET || process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || '';
      if (secret) {
        const tokRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${secret}&code=${encodeURIComponent(code)}`);
        const tok = await tokRes.json();
        const userToken = tok?.access_token;
        if (userToken) {
          const dbg = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${userToken}&access_token=${appId}|${secret}`);
          const dbgJson = await dbg.json();
          const scopes = dbgJson?.data?.granular_scopes || [];
          const waScope = scopes.find((s: any) => s.scope === 'whatsapp_business_management' || s.scope === 'whatsapp_business_messaging');
          wabaId = wabaId || String(waScope?.target_ids?.[0] || '');
          if (wabaId && !phoneNumberId) {
            const pn = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${userToken}`);
            const pnJson = await pn.json();
            phoneNumberId = String(pnJson?.data?.[0]?.id || '');
          }
        }
      }
    } catch { /* échange best-effort — on retombe sur l'erreur ci-dessous si échec */ }
  }

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
