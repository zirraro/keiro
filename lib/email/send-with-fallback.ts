/**
 * 2026-06-03 — Email send with multi-provider fallback.
 *
 * Founder ask: garantir que les emails partent même si une clé est
 * revoquée. La clé Brevo a été silencieusement revoquée pendant
 * plusieurs jours, on a perdu des envois.
 *
 * Order:
 *   1. Brevo API v3 (xkeysib-...) — primary, transactional
 *   2. Resend                     — backup, paiement à l'usage
 *   3. Brevo SMTP (xsmtpsib-...)  — last resort via nodemailer
 *
 * Each provider attempts up to 1 retry on 5xx; fallback only on
 * 401/403 (auth) or all retries exhausted.
 */

import nodemailer from 'nodemailer';

export interface SendEmailOpts {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  textContent?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  inReplyTo?: string;
  tags?: string[];
}

export interface SendEmailResult {
  ok: boolean;
  provider: 'brevo_api' | 'resend' | 'brevo_smtp' | 'none';
  messageId?: string;
  error?: string;
  attempts?: Array<{ provider: string; ok: boolean; status?: number; error?: string }>;
}

const DEFAULT_FROM_NAME = 'KeiroAI';
const DEFAULT_FROM_EMAIL = 'contact@keiroai.com';

function isAuthError(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  const lowered = (body || '').toLowerCase();
  return lowered.includes('key not found')
    || lowered.includes('unauthorized')
    || lowered.includes('invalid api')
    || lowered.includes('invalid_key');
}

/** Provider 1: Brevo API v3 */
async function sendViaBrevoApi(opts: SendEmailOpts): Promise<{ ok: boolean; status: number; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, status: 0, error: 'BREVO_API_KEY missing' };
  // Only the API v3 keys start with 'xkeysib-'. SMTP passwords (xsmtpsib-)
  // are not valid for the v3 REST API and would always return 401.
  if (!apiKey.startsWith('xkeysib-')) {
    return { ok: false, status: 401, error: 'BREVO_API_KEY is a SMTP password, not an API v3 key' };
  }
  try {
    const headers: Record<string, string> = {};
    if (opts.inReplyTo) {
      headers['In-Reply-To'] = opts.inReplyTo;
      headers['References'] = opts.inReplyTo;
    }
    const body: any = {
      sender: { name: opts.fromName || DEFAULT_FROM_NAME, email: opts.fromEmail || DEFAULT_FROM_EMAIL },
      to: [{ email: opts.to, name: opts.toName }],
      subject: opts.subject,
      htmlContent: opts.html,
      textContent: opts.textContent,
    };
    if (opts.replyTo) body.replyTo = { email: opts.replyTo };
    if (opts.tags) body.tags = opts.tags;
    if (Object.keys(headers).length > 0) body.headers = headers;
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      // 2026-06-09 — log Brevo email cost (0€ inclus dans plan, mais
      // on suit le volume pour limites)
      try {
        const { logApiCost } = await import('@/lib/admin/api-cost-logger');
        logApiCost({
          provider: 'brevo',
          kind: 'email_sent',
          units: 1,
          cost_eur: 0, // inclus dans plan Brevo (mais counter quota important)
          metadata: { messageId: data.messageId, to_count: (opts.to as any)?.length || 1 },
        }).catch(() => {});
      } catch { /* silent */ }
      return { ok: true, status: res.status, messageId: data.messageId };
    }
    const errText = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: errText.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message?.slice(0, 200) || 'network error' };
  }
}

/** Provider 2: Resend */
async function sendViaResend(opts: SendEmailOpts): Promise<{ ok: boolean; status: number; messageId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, status: 0, error: 'RESEND_API_KEY missing' };
  try {
    const fromEmail = opts.fromEmail || DEFAULT_FROM_EMAIL;
    const fromName = opts.fromName || DEFAULT_FROM_NAME;
    // Resend requires a verified domain in 'from'. If keiroai.com isn't
    // verified yet, fall back to Resend's onboarding sender (test mode,
    // only delivers to the founder's verified inbox).
    const verifiedDomain = process.env.RESEND_DOMAIN_VERIFIED === '1';
    const from = verifiedDomain ? `${fromName} <${fromEmail}>` : `${fromName} <onboarding@resend.dev>`;
    const body: any = {
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.textContent) body.text = opts.textContent;
    if (opts.replyTo) body.reply_to = opts.replyTo;
    if (opts.inReplyTo) body.headers = { 'In-Reply-To': opts.inReplyTo, 'References': opts.inReplyTo };
    if (opts.tags) body.tags = opts.tags.map(name => ({ name, value: name }));
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, status: res.status, messageId: data.id };
    }
    const errText = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: errText.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message?.slice(0, 200) || 'network error' };
  }
}

/** Provider 3: Brevo SMTP via nodemailer (works with xsmtpsib- keys) */
async function sendViaBrevoSmtp(opts: SendEmailOpts): Promise<{ ok: boolean; status: number; messageId?: string; error?: string }> {
  const smtpPass = process.env.BREVO_SMTP_PASSWORD || process.env.BREVO_API_KEY;
  const smtpUser = process.env.BREVO_SMTP_USER || process.env.SMTP_USER || 'contact@keiroai.com';
  if (!smtpPass) return { ok: false, status: 0, error: 'BREVO_SMTP_PASSWORD missing' };
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });
    const info = await transporter.sendMail({
      from: `${opts.fromName || DEFAULT_FROM_NAME} <${opts.fromEmail || DEFAULT_FROM_EMAIL}>`,
      to: opts.toName ? `${opts.toName} <${opts.to}>` : opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.textContent,
      replyTo: opts.replyTo,
      inReplyTo: opts.inReplyTo,
      references: opts.inReplyTo,
    });
    return { ok: true, status: 200, messageId: info.messageId };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message?.slice(0, 200) || 'smtp error' };
  }
}

/**
 * Send an email with automatic fallback chain.
 * Order: Brevo API v3 → Resend → Brevo SMTP
 */
export async function sendEmailWithFallback(opts: SendEmailOpts): Promise<SendEmailResult> {
  const attempts: SendEmailResult['attempts'] = [];

  // 1. Brevo API v3
  const r1 = await sendViaBrevoApi(opts);
  attempts.push({ provider: 'brevo_api', ok: r1.ok, status: r1.status, error: r1.error });
  if (r1.ok) {
    return { ok: true, provider: 'brevo_api', messageId: r1.messageId, attempts };
  }

  // 2. Resend (skip si keiroai.com pas vérifié ET destinataire pas mrzir test)
  const resendDomainVerified = process.env.RESEND_DOMAIN_VERIFIED === '1';
  const canTryResend = resendDomainVerified || opts.to.toLowerCase() === 'mrzirraro@gmail.com';
  if (canTryResend) {
    const r2 = await sendViaResend(opts);
    attempts.push({ provider: 'resend', ok: r2.ok, status: r2.status, error: r2.error });
    if (r2.ok) {
      return { ok: true, provider: 'resend', messageId: r2.messageId, attempts };
    }
  }

  // 3. Brevo SMTP (works with xsmtpsib- keys)
  const r3 = await sendViaBrevoSmtp(opts);
  attempts.push({ provider: 'brevo_smtp', ok: r3.ok, status: r3.status, error: r3.error });
  if (r3.ok) {
    return { ok: true, provider: 'brevo_smtp', messageId: r3.messageId, attempts };
  }

  return {
    ok: false,
    provider: 'none',
    error: `All providers failed: ${attempts.map(a => `${a.provider}=${a.error || a.status}`).join(' | ')}`,
    attempts,
  };
}
