/**
 * WhatsApp Business Cloud API helper.
 *
 * Env vars required:
 *   WHATSAPP_PHONE_NUMBER_ID  — Meta phone number ID
 *   WHATSAPP_ACCESS_TOKEN     — permanent system-user token
 *   WHATSAPP_VERIFY_TOKEN     — webhook verification token (arbitrary string you choose)
 *   WHATSAPP_APP_SECRET       — Meta app secret for signature verification
 */

const API_VERSION = 'v21.0';

function getBaseUrl(): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID non configuré');
  return `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;
}

function getAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN non configuré');
  return token;
}

/**
 * Send a plain text message to a WhatsApp number.
 * The recipient must have messaged us within the last 24 h (conversation window),
 * or we must use a template instead.
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
): Promise<{ success: boolean; messageId?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(getBaseUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      console.error('[WhatsApp] sendMessage error:', res.status, err.slice(0, 200));
      return { success: false };
    }

    const data = await res.json();
    const messageId = data.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err: any) {
    console.error('[WhatsApp] sendMessage exception:', (err.message || '').slice(0, 200));
    return { success: false };
  }
}

/**
 * Send a pre-approved template message (required for first contact / outside 24 h window).
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params?: string[],
  language: string = 'fr',
): Promise<{ success: boolean; messageId?: string }> {
  try {
    const components: any[] = [];
    if (params && params.length > 0) {
      components.push({
        type: 'body',
        parameters: params.map((p) => ({ type: 'text', text: p })),
      });
    }

    const res = await fetch(getBaseUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          ...(components.length > 0 ? { components } : {}),
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[WhatsApp] sendTemplate error:', res.status, err);
      return { success: false };
    }

    const data = await res.json();
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: any) {
    console.error('[WhatsApp] sendTemplate exception:', err.message);
    return { success: false };
  }
}

/**
 * Send an interactive button message (max 3 buttons, titles max 20 chars).
 */
export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: { id: string; title: string }[],
): Promise<{ success: boolean; messageId?: string }> {
  try {
    const res = await fetch(getBaseUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.title.slice(0, 20) },
            })),
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[WhatsApp] sendButtons error:', res.status, err);
      return { success: false };
    }

    const data = await res.json();
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: any) {
    console.error('[WhatsApp] sendButtons exception:', err.message);
    return { success: false };
  }
}

/**
 * Mark a message as read (blue ticks).
 */
export async function markAsRead(messageId: string): Promise<void> {
  try {
    await fetch(getBaseUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch {
    /* non-blocking */
  }
}

/**
 * Verify webhook signature from Meta using HMAC-SHA256.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | null,
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error('[WhatsApp] WHATSAPP_APP_SECRET not set — rejecting webhook');
    return false;
  }
  if (!signature) return false;

  // Signature format: "sha256=<hex>"
  const expectedPrefix = 'sha256=';
  if (!signature.startsWith(expectedPrefix)) return false;
  const sigHex = signature.slice(expectedPrefix.length);

  // Use dynamic import to avoid edge runtime issues
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(typeof rawBody === 'string' ? rawBody : rawBody);
  const expectedHex = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(sigHex, 'hex'),
    Buffer.from(expectedHex, 'hex'),
  );
}
