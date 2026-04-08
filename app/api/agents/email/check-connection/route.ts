import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/agents/email/check-connection
 * Check if client has Gmail/SMTP connected for email sending.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: profile } = await supabase
    .from('profiles')
    .select('gmail_refresh_token, gmail_access_token, gmail_email, smtp_host, smtp_from_email')
    .eq('id', user.id)
    .single();

  const gmailConnected = !!(profile?.gmail_refresh_token || profile?.gmail_access_token);

  return NextResponse.json({
    ok: true,
    gmail_connected: gmailConnected,
    gmail_email: profile?.gmail_email || null,
    smtp_connected: !!profile?.smtp_host,
    smtp_email: profile?.smtp_from_email || null,
    provider: gmailConnected ? 'gmail' : profile?.smtp_host ? 'smtp' : 'keiroai',
  });
}

/**
 * POST /api/agents/email/check-connection
 * Disconnect Gmail or SMTP.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  if (body.action === 'disconnect_gmail') {
    await supabase.from('profiles').update({
      gmail_refresh_token: null,
      gmail_access_token: null,
      gmail_email: null,
      gmail_token_expires_at: null,
    }).eq('id', user.id);
    return NextResponse.json({ ok: true, disconnected: 'gmail' });
  }

  if (body.action === 'disconnect_smtp') {
    await supabase.from('profiles').update({
      smtp_host: null, smtp_port: null, smtp_user: null, smtp_pass: null, smtp_from_email: null,
    }).eq('id', user.id);
    return NextResponse.json({ ok: true, disconnected: 'smtp' });
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
}
