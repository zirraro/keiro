import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * POST /api/me/send-email
 * Body: { to_email, subject?, body, in_reply_to? }
 *
 * Sends an email from the caller's own SMTP / Gmail / Outlook
 * connection. Used by the inbox UI for ad-hoc replies that aren't
 * tied to a CRM prospect (e.g. reply to a personal-email
 * unsubscriber to acknowledge the request).
 *
 * Falls back through the available channels in this priority:
 *   SMTP custom domain → Gmail OAuth → Outlook OAuth → contact@keiroai.com
 */
export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const to = String(body.to_email || '').trim();
  const subject = String(body.subject || 'Re:').substring(0, 200);
  const text = String(body.body || '').trim();
  const inReplyTo = body.in_reply_to ? String(body.in_reply_to) : undefined;

  if (!to || !text) {
    return NextResponse.json({ ok: false, error: 'to_email and body required' }, { status: 400 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const { sendViaSmtp } = await import('@/lib/agents/smtp-sender');
    const result = await sendViaSmtp({
      userId: user.id,
      to,
      subject,
      body: text,
      inReplyTo,
    });
    if (result.sent) {
      await sb.from('agent_logs').insert({
        agent: 'email',
        action: 'manual_send',
        user_id: user.id,
        data: { to, subject, body: text.substring(0, 5000), via: 'smtp', in_reply_to: inReplyTo },
      });
      return NextResponse.json({ ok: true, via: 'smtp' });
    }
    return NextResponse.json({
      ok: false,
      error: result.reason === 'smtp_not_configured'
        ? 'SMTP non configuré — connecte ton email dans le panneau Hugo.'
        : `Échec envoi : ${result.reason}`,
    }, { status: 500 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'send failed' }, { status: 500 });
  }
}
