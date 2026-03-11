/**
 * Shared email sender: tries Brevo first, falls back to Resend.
 */

const FOUNDER_BCC = 'mrzirraro@gmail.com';

interface EmailPayload {
  from_name: string;
  from_email: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
  /** Set to false to skip BCC to founder. Default: true */
  bcc_founder?: boolean;
}

interface SendEmailResult {
  ok: boolean;
  provider: 'brevo' | 'resend';
  messageId?: string;
  error?: string;
}

/**
 * Send an email using Brevo (priority) or Resend (fallback).
 * Throws if neither provider is configured.
 */
export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!BREVO_API_KEY && !RESEND_API_KEY) {
    throw new Error('Aucun provider email configuré (BREVO_API_KEY ou RESEND_API_KEY requis)');
  }

  // Try Brevo first
  if (BREVO_API_KEY) {
    const result = await sendViaBrevo(BREVO_API_KEY, payload);
    if (result.ok) return result;
    console.warn('[EmailSender] Brevo failed, trying Resend fallback...', result.error);
  }

  // Fallback to Resend
  if (RESEND_API_KEY) {
    return sendViaResend(RESEND_API_KEY, payload);
  }

  // Brevo was tried and failed, no Resend available
  return { ok: false, provider: 'brevo', error: 'Brevo failed and no Resend fallback' };
}

async function sendViaBrevo(apiKey: string, payload: EmailPayload): Promise<SendEmailResult> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: payload.from_name, email: payload.from_email },
        to: payload.to.map(email => ({ email })),
        ...(payload.bcc_founder !== false ? { bcc: [{ email: FOUNDER_BCC }] } : {}),
        subject: payload.subject,
        htmlContent: payload.html,
        textContent: payload.text,
        tags: payload.tags?.map(t => `${t.name}:${t.value}`) || [],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, provider: 'brevo', error: errText };
    }

    const data = await res.json();
    return { ok: true, provider: 'brevo', messageId: data.messageId || 'unknown' };
  } catch (e: any) {
    return { ok: false, provider: 'brevo', error: e.message };
  }
}

async function sendViaResend(apiKey: string, payload: EmailPayload): Promise<SendEmailResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${payload.from_name} <${payload.from_email}>`,
        to: payload.to,
        ...(payload.bcc_founder !== false ? { bcc: [FOUNDER_BCC] } : {}),
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        tags: payload.tags,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, provider: 'resend', error: errText };
    }

    const data = await res.json();
    return { ok: true, provider: 'resend', messageId: data.id || 'unknown' };
  } catch (e: any) {
    return { ok: false, provider: 'resend', error: e.message };
  }
}
