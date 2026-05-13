import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * POST /api/agents/dm-instagram/send
 * Send a DM directly via Instagram Messaging API.
 * Body: { recipient_id: string (IG scoped user ID), message: string }
 *
 * Token priority (matches the rest of the DM stack):
 *   1. instagram_igaa_token  → graph.instagram.com/me/messages (permanent)
 *   2. instagram_access_token → graph.instagram.com/me/messages (legacy)
 *   3. facebook_page_access_token → graph.facebook.com/{ig_user_id}/messages
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const { recipient_id, message } = await req.json();
  if (!recipient_id || !message?.trim()) {
    return NextResponse.json({ error: 'recipient_id et message requis' }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const PROFILE_COLS = 'instagram_business_account_id, instagram_access_token, instagram_igaa_token, facebook_page_access_token, facebook_page_id';
  const { data: profile } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('id', user.id)
    .single();

  let igUserId = profile?.instagram_business_account_id;
  let igaaToken = profile?.instagram_igaa_token;
  let igToken = profile?.instagram_access_token;
  let fbToken = profile?.facebook_page_access_token;

  // Admin fallback if client has no IG
  if (!igUserId && !igaaToken) {
    const { data: admin } = await supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('is_admin', true)
      .limit(1)
      .maybeSingle();
    igUserId = admin?.instagram_business_account_id;
    igaaToken = admin?.instagram_igaa_token;
    igToken = admin?.instagram_access_token;
    fbToken = admin?.facebook_page_access_token;
  }

  if (!igUserId && !igaaToken) {
    return NextResponse.json({ ok: false, sent: false, error: 'Instagram non connecte' }, { status: 400 });
  }

  // Audit log helper — every successful Graph API DM send writes a row
  // to agent_logs so /meta-audit can show what permission was used
  // (manage_messages inside the 24h window, human_agent outside). Errors
  // are also logged so the reviewer can see why a send failed.
  const auditSend = async (params: { ok: boolean; method: string; tagged: boolean; errorDetail?: string }) => {
    try {
      await supabase.from('agent_logs').insert({
        agent: 'dm_instagram',
        action: 'dm_auto_reply',
        user_id: user.id,
        status: params.ok ? 'success' : 'error',
        data: {
          method: params.method,
          recipient_id: String(recipient_id).slice(0, 32),
          human_agent: params.tagged,
          message_preview: String(message).slice(0, 80),
          error: params.errorDetail,
        },
      });
    } catch {}
  };

  const errors: string[] = [];
  const msgPayload = { text: String(message).substring(0, 1000) };
  const recipientPayload = { id: String(recipient_id) };

  // Meta returns this message body when the recipient hasn't messaged us in
  // the last 24h. The only way to retry is with messaging_type=MESSAGE_TAG &
  // tag=HUMAN_AGENT, which requires the human_agent permission to be approved.
  // We attempt the standard send first, and only retry tagged on this error
  // — keeps us safe on 24h-window sends and auto-activates the moment Meta
  // approves the human_agent permission, no redeploy needed.
  const isOutsideWindowError = (text: string) =>
    /outside.*allowed.*window|24[- ]?hour.*window|2018|messages outside the/i.test(text);

  // Inside-24h-window send first, then optional human-agent retry.
  const sendAttempt = async (
    url: string,
    base: Record<string, string>,
  ): Promise<{ ok: boolean; status: number; body: string }> => {
    const standard = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(base),
    });
    if (standard.ok) return { ok: true, status: standard.status, body: '' };
    const errBody = await standard.text().catch(() => '');
    if (!isOutsideWindowError(errBody)) {
      return { ok: false, status: standard.status, body: errBody };
    }
    // Outside 24h — retry with HUMAN_AGENT tag (requires approved permission).
    const tagged = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...base,
        messaging_type: 'MESSAGE_TAG',
        tag: 'HUMAN_AGENT',
      }),
    });
    if (tagged.ok) return { ok: true, status: tagged.status, body: 'human_agent' };
    const taggedBody = await tagged.text().catch(() => '');
    return { ok: false, status: tagged.status, body: `outside-window + human_agent retry: ${taggedBody}` };
  };

  // 1. IGAA token — the only one Meta lets us use for conversation content,
  //    so try it first. graph.instagram.com expects the access_token as a
  //    URLSearchParams field, not JSON, for POST.
  if (igaaToken) {
    try {
      const r = await sendAttempt('https://graph.instagram.com/v21.0/me/messages', {
        recipient: JSON.stringify(recipientPayload),
        message: JSON.stringify(msgPayload),
        access_token: igaaToken,
      });
      if (r.ok) {
        const tagged = r.body === 'human_agent';
        console.log(`[DM-send] Sent via IGAA to ${recipient_id}${tagged ? ' (HUMAN_AGENT tag)' : ''}`);
        await auditSend({ ok: true, method: 'instagram_igaa', tagged });
        return NextResponse.json({ ok: true, sent: true, method: 'instagram_igaa', human_agent: tagged });
      }
      errors.push(`IGAA: ${r.status} ${r.body.substring(0, 200)}`);
    } catch (e: any) {
      errors.push(`IGAA error: ${e.message}`);
    }
  }

  // 2. Legacy Instagram Graph token (only if distinct from the IGAA one)
  if (igToken && igToken !== igaaToken) {
    try {
      const r = await sendAttempt('https://graph.instagram.com/v21.0/me/messages', {
        recipient: JSON.stringify(recipientPayload),
        message: JSON.stringify(msgPayload),
        access_token: igToken,
      });
      if (r.ok) {
        const tagged = r.body === 'human_agent';
        console.log(`[DM-send] Sent via IG access_token to ${recipient_id}${tagged ? ' (HUMAN_AGENT tag)' : ''}`);
        await auditSend({ ok: true, method: 'instagram_access_token', tagged });
        return NextResponse.json({ ok: true, sent: true, method: 'instagram_access_token', human_agent: tagged });
      }
      errors.push(`IG: ${r.status} ${r.body.substring(0, 200)}`);
    } catch (e: any) {
      errors.push(`IG error: ${e.message}`);
    }
  }

  // 3. Facebook page token fallback — only if it's an actual EAA-prefixed FB
  //    token, not an IGAA stored by mistake in the FB slot (graph.facebook
  //    rejects IGAA tokens with "Cannot parse access token").
  const fbTokenLooksValid = fbToken && !fbToken.startsWith('IGAA') && fbToken !== igaaToken;
  if (fbTokenLooksValid && igUserId) {
    try {
      const r = await sendAttempt(`https://graph.facebook.com/v21.0/${igUserId}/messages`, {
        recipient: JSON.stringify(recipientPayload),
        message: JSON.stringify(msgPayload),
        access_token: fbToken!,
      });
      if (r.ok) {
        const tagged = r.body === 'human_agent';
        console.log(`[DM-send] Sent via Facebook page token to ${recipient_id}${tagged ? ' (HUMAN_AGENT tag)' : ''}`);
        await auditSend({ ok: true, method: 'facebook_api', tagged });
        return NextResponse.json({ ok: true, sent: true, method: 'facebook_api', human_agent: tagged });
      }
      errors.push(`FB: ${r.status} ${r.body.substring(0, 200)}`);
    } catch (e: any) {
      errors.push(`FB error: ${e.message}`);
    }
  }

  console.warn('[DM-send] All send methods failed:', errors);
  await auditSend({ ok: false, method: 'none', tagged: false, errorDetail: errors.join(' | ').slice(0, 400) });
  return NextResponse.json({ ok: false, sent: false, errors });
}
