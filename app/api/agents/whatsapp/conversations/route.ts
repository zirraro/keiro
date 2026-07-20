import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/whatsapp/conversations
 *   → liste les conversations WhatsApp du client (espace Stella) : un fil par
 *     numéro, avec dernier message, compteur, statut prise-en-main humaine.
 * GET ?phone=336...  → le fil complet d'une conversation (messages ordonnés).
 *
 * Founder 2026-07-20 : espace pour SUIVRE les conversations et REPRENDRE LA MAIN.
 */
export async function GET(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const phone = req.nextUrl.searchParams.get('phone');

  // Numéros WhatsApp appartenant à CE client (via ses prospects) — multi-tenant ready.
  const { data: myProspects } = await sb
    .from('crm_prospects')
    .select('id, whatsapp_phone, first_name, company')
    .eq('user_id', user.id)
    .not('whatsapp_phone', 'is', null)
    .limit(2000);
  const myPhones = new Set((myProspects || []).map((p: any) => p.whatsapp_phone));
  const prospectByPhone: Record<string, any> = {};
  for (const p of myProspects || []) prospectByPhone[p.whatsapp_phone] = p;

  // ── Fil complet d'une conversation ──
  if (phone) {
    if (!myPhones.has(phone)) return NextResponse.json({ ok: false, error: 'Conversation introuvable' }, { status: 404 });
    const { data: msgs } = await sb
      .from('whatsapp_conversations')
      .select('role, message, message_type, created_at')
      .eq('phone_number', phone)
      .order('created_at', { ascending: true })
      .limit(200);
    // Prise en main humaine active ?
    const { data: takeover } = await sb
      .from('agent_logs')
      .select('created_at, action')
      .eq('user_id', user.id)
      .in('action', ['whatsapp_human_takeover', 'whatsapp_resume_stella'])
      .contains('data', { phone })
      .order('created_at', { ascending: false })
      .limit(1);
    const humanActive = takeover?.[0]?.action === 'whatsapp_human_takeover';
    return NextResponse.json({
      ok: true,
      phone,
      prospect: prospectByPhone[phone] || null,
      human_takeover: humanActive,
      messages: (msgs || []).map((m: any) => ({ role: m.role, message: m.message, type: m.message_type, date: m.created_at })),
    });
  }

  // ── Liste des fils (dernier message par numéro) ──
  const phonesArr = Array.from(myPhones);
  if (phonesArr.length === 0) return NextResponse.json({ ok: true, conversations: [] });

  const { data: recent } = await sb
    .from('whatsapp_conversations')
    .select('phone_number, role, message, created_at')
    .in('phone_number', phonesArr)
    .order('created_at', { ascending: false })
    .limit(1000);

  const byPhone: Record<string, { phone: string; last: string; last_role: string; last_at: string; count: number; name: string }> = {};
  for (const m of recent || []) {
    const ph = m.phone_number;
    if (!byPhone[ph]) {
      const p = prospectByPhone[ph];
      byPhone[ph] = {
        phone: ph,
        last: m.message,
        last_role: m.role,
        last_at: m.created_at,
        count: 0,
        name: p?.first_name || p?.company || ph,
      };
    }
    byPhone[ph].count++;
  }
  const conversations = Object.values(byPhone).sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());
  return NextResponse.json({ ok: true, conversations });
}
