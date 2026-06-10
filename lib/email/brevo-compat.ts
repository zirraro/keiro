/**
 * 2026-06-10 — Brevo-compat shim.
 *
 * Drop-in replacement for `fetch('https://api.brevo.com/v3/smtp/email', ...)`.
 * Many routes call Brevo directly with a `.catch(() => {})` that swallowed
 * the 401 when the key got revoked. Result: emails (Noah briefs,
 * onboarding, admin digests, CEO group, etc.) failed silently for days.
 *
 * This shim accepts the exact same Brevo payload shape we already use
 * across the codebase, and routes it through sendEmailWithFallback
 * (Brevo API → Resend → Brevo SMTP). Call sites change minimally:
 *
 *   - Before:
 *     await fetch('https://api.brevo.com/v3/smtp/email', {
 *       method: 'POST', headers: {...}, body: JSON.stringify(payload),
 *     });
 *
 *   - After:
 *     await sendBrevoCompat(payload);
 *
 * Returns a fetch-like response so existing `.ok` / `.status` / `.json()`
 * checks keep working without rewrites.
 */
import { sendEmailWithFallback } from './send-with-fallback';

interface BrevoPayload {
  sender?: { name?: string; email?: string };
  to?: Array<{ email: string; name?: string }>;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  replyTo?: { email: string; name?: string } | string;
  tags?: string[];
  headers?: Record<string, string>;
}

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<{ messageId?: string; provider?: string; error?: string }>;
  text: () => Promise<string>;
}

export async function sendBrevoCompat(payload: BrevoPayload): Promise<FetchLikeResponse> {
  const recipient = payload.to?.[0];
  if (!recipient?.email) {
    return makeResponse(false, 400, { error: 'sendBrevoCompat: payload.to[0].email missing' });
  }
  const replyToEmail = typeof payload.replyTo === 'string'
    ? payload.replyTo
    : payload.replyTo?.email;
  const inReplyTo = payload.headers?.['In-Reply-To'] || payload.headers?.['in-reply-to'];

  const result = await sendEmailWithFallback({
    to: recipient.email,
    toName: recipient.name,
    subject: payload.subject,
    html: payload.htmlContent || (payload.textContent ? `<pre>${payload.textContent}</pre>` : ''),
    textContent: payload.textContent,
    fromName: payload.sender?.name,
    fromEmail: payload.sender?.email,
    replyTo: replyToEmail,
    inReplyTo,
    tags: payload.tags,
  });

  if (result.ok) {
    return makeResponse(true, 200, { messageId: result.messageId, provider: result.provider });
  }
  return makeResponse(false, 502, { error: result.error || 'all_providers_failed', provider: result.provider });
}

function makeResponse(ok: boolean, status: number, body: any): FetchLikeResponse {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
