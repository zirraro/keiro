/**
 * Generic SMTP sender for clients who host their email on their own
 * domain (OVH, Gandi, ProtonMail Business, Infomaniak, etc.).
 *
 * Flow:
 *   1. Client pastes host/port/user/password/from into Settings.
 *   2. verifySmtpConnection tests the creds — if nodemailer's verify()
 *      succeeds we store them (password encrypted).
 *   3. sendViaSmtp is called by Hugo's reply router when the client has
 *      no Gmail connected but has verified SMTP credentials.
 *
 * We never log the password. `verifySmtpConnection` runs on the server
 * only — credentials never leave our backend except to reach the
 * client's SMTP server.
 */

import nodemailer, { type SendMailOptions } from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { decryptSmtpPassword } from '@/lib/smtp-crypto';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface SmtpCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  secure?: boolean;
  from_email?: string;
  from_name?: string;
}

/**
 * Test the creds by opening an SMTP connection + handshaking. Returns
 * null on success, or a human-readable error message on failure.
 */
export async function verifySmtpConnection(creds: SmtpCredentials): Promise<string | null> {
  try {
    const transport = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure ?? creds.port === 465,
      auth: { user: creds.user, pass: creds.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.verify();
    transport.close();
    return null;
  } catch (e: any) {
    return String(e?.message || e).substring(0, 300);
  }
}

/**
 * Send an email via the client's stored SMTP credentials. Threads via
 * In-Reply-To so the reply lands in the same conversation on the
 * recipient's end.
 */
export async function sendViaSmtp(params: {
  userId: string;
  to: string;
  toName?: string;
  subject: string;
  body: string;              // plain text — converted to html below
  inReplyTo?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from('profiles')
    .select('smtp_host, smtp_port, smtp_user, smtp_password_enc, smtp_secure, smtp_from_email, smtp_from_name, smtp_verified_at')
    .eq('id', params.userId)
    .maybeSingle();

  if (!profile?.smtp_host || !profile.smtp_password_enc || !profile.smtp_verified_at) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  let password: string;
  try {
    password = decryptSmtpPassword(profile.smtp_password_enc);
  } catch {
    return { sent: false, reason: 'smtp_decrypt_failed' };
  }

  const transport = nodemailer.createTransport({
    host: profile.smtp_host,
    port: profile.smtp_port ?? 587,
    secure: profile.smtp_secure ?? (profile.smtp_port === 465),
    auth: { user: profile.smtp_user, pass: password },
  });

  const fromEmail = profile.smtp_from_email || profile.smtp_user;
  const fromName = profile.smtp_from_name || undefined;

  const bodyHtml = params.body
    .split(/\n\n+/)
    .map(p => `<p style="margin:0 0 10px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  const mail: SendMailOptions = {
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: params.toName ? `${params.toName} <${params.to}>` : params.to,
    subject: params.subject,
    text: params.body,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;">${bodyHtml}</div>`,
  };
  if (params.inReplyTo) {
    mail.inReplyTo = params.inReplyTo;
    mail.references = [params.inReplyTo];
  }

  try {
    await transport.sendMail(mail);
    transport.close();
    return { sent: true };
  } catch (e: any) {
    transport.close();
    return { sent: false, reason: String(e?.message || e).substring(0, 200) };
  }
}

/**
 * Is SMTP set up + verified for this user?
 */
export async function hasVerifiedSmtp(userId: string): Promise<{ connected: boolean; from_email: string | null }> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('profiles')
    .select('smtp_host, smtp_verified_at, smtp_from_email, smtp_user')
    .eq('id', userId)
    .maybeSingle();
  return {
    connected: !!data?.smtp_host && !!data?.smtp_verified_at,
    from_email: data?.smtp_from_email || data?.smtp_user || null,
  };
}
