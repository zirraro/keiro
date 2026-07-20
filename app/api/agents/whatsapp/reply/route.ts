import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/whatsapp/reply
 *   body { phone, message }                → le client répond LUI-MÊME (reprise en
 *                                            main) ; envoie le message + met la conv
 *                                            en "human takeover" → Stella se tait.
 *   body { phone, action: 'takeover' }     → prend la main sans envoyer (Stella pause)
 *   body { phone, action: 'resume' }       → rend la main à Stella (auto reprend)
 *
 * Founder 2026-07-20 : reprendre la main depuis KeiroAI. Stella ne double jamais
 * un humain qui a pris la conversation.
 */
export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone || '').replace(/[^\d]/g, '');
  const action = body.action as string | undefined;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!phone) return NextResponse.json({ ok: false, error: 'phone requis' }, { status: 400 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Vérifie que ce numéro appartient bien à un prospect du client.
  const { data: prospect } = await sb
    .from('crm_prospects')
    .select('id, user_id')
    .eq('whatsapp_phone', phone)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!prospect) return NextResponse.json({ ok: false, error: 'Conversation introuvable' }, { status: 404 });

  const now = new Date().toISOString();

  // Rendre la main à Stella.
  if (action === 'resume') {
    await sb.from('agent_logs').insert({ agent: 'whatsapp', action: 'whatsapp_resume_stella', user_id: user.id, data: { phone }, created_at: now });
    return NextResponse.json({ ok: true, human_takeover: false });
  }

  // Envoi d'un message humain (reprise en main) OU simple prise de main.
  let sent = false;
  if (message) {
    const res = await sendWhatsAppMessage(phone, message);
    sent = !!res?.success;
    if (!sent) {
      return NextResponse.json({ ok: false, error: 'Échec envoi WhatsApp (fenêtre 24h expirée ? il faut alors un template)' }, { status: 400 });
    }
    await sb.from('whatsapp_conversations').insert({
      phone_number: phone,
      prospect_id: prospect.id,
      role: 'human',           // réponse du commerçant lui-même
      message,
      message_type: 'text',
      whatsapp_message_id: res?.messageId || null,
      created_at: now,
    });
  }

  // Toute action ici met (ou maintient) la prise en main humaine → Stella pause.
  await sb.from('agent_logs').insert({ agent: 'whatsapp', action: 'whatsapp_human_takeover', user_id: user.id, data: { phone }, created_at: now });

  return NextResponse.json({ ok: true, sent, human_takeover: true });
}
