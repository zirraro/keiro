import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { verifySmtpConnection } from '@/lib/agents/smtp-sender';
import { encryptSmtpPassword } from '@/lib/smtp-crypto';

export const runtime = 'nodejs';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/auth/smtp
 * Body: { host, port, user, password, from_email?, from_name?, secure? }
 *
 * Tests the SMTP connection first (real handshake). Only on success do
 * we persist — password is encrypted with AES-256-GCM before it hits the
 * DB so it cannot be leaked via a read-only SQL query or a logical
 * backup.
 *
 * GET /api/auth/smtp    → returns {connected, host, from_email, user}
 * DELETE /api/auth/smtp → wipes all smtp_* columns
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { host, port, user: smtpUser, password, from_email, from_name, secure } = body || {};
  if (!host || !port || !smtpUser || !password) {
    return NextResponse.json({ error: 'host, port, user, password requis' }, { status: 400 });
  }

  // Live verification — refuse to save creds that don't actually work.
  const verifyError = await verifySmtpConnection({
    host, port: Number(port), user: smtpUser, password, secure,
  });
  if (verifyError) {
    return NextResponse.json({ ok: false, error: `SMTP handshake failed: ${verifyError}` }, { status: 400 });
  }

  let encrypted: string;
  try {
    encrypted = encryptSmtpPassword(password);
  } catch (e: any) {
    return NextResponse.json({ error: `Encryption unavailable: ${e.message}` }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  await supabase.from('profiles').update({
    smtp_host: host,
    smtp_port: Number(port),
    smtp_user: smtpUser,
    smtp_password_enc: encrypted,
    smtp_secure: typeof secure === 'boolean' ? secure : Number(port) === 465,
    smtp_from_email: from_email || smtpUser,
    smtp_from_name: from_name || null,
    smtp_verified_at: new Date().toISOString(),
  }).eq('id', user.id);

  return NextResponse.json({ ok: true, connected: true, from_email: from_email || smtpUser });
}

export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('profiles')
    .select('smtp_host, smtp_user, smtp_from_email, smtp_from_name, smtp_verified_at')
    .eq('id', user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    connected: !!data?.smtp_verified_at,
    host: data?.smtp_host || null,
    user: data?.smtp_user || null,
    from_email: data?.smtp_from_email || null,
    from_name: data?.smtp_from_name || null,
    verified_at: data?.smtp_verified_at || null,
  });
}

export async function DELETE() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  await supabase.from('profiles').update({
    smtp_host: null,
    smtp_port: null,
    smtp_user: null,
    smtp_password_enc: null,
    smtp_secure: null,
    smtp_from_email: null,
    smtp_from_name: null,
    smtp_verified_at: null,
  }).eq('id', user.id);

  return NextResponse.json({ ok: true, connected: false });
}
