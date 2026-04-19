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

  const errors: string[] = [];
  const msgPayload = { text: String(message).substring(0, 1000) };
  const recipientPayload = { id: String(recipient_id) };

  // 1. IGAA token — the only one Meta lets us use for conversation content,
  //    so try it first. graph.instagram.com expects the access_token as a
  //    URLSearchParams field, not JSON, for POST.
  if (igaaToken) {
    try {
      const res = await fetch('https://graph.instagram.com/v21.0/me/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          recipient: JSON.stringify(recipientPayload),
          message: JSON.stringify(msgPayload),
          access_token: igaaToken,
        }),
      });
      if (res.ok) {
        console.log(`[DM-send] Sent via IGAA to ${recipient_id}`);
        return NextResponse.json({ ok: true, sent: true, method: 'instagram_igaa' });
      }
      const err = await res.text().catch(() => '');
      errors.push(`IGAA: ${res.status} ${err.substring(0, 150)}`);
    } catch (e: any) {
      errors.push(`IGAA error: ${e.message}`);
    }
  }

  // 2. Legacy Instagram Graph token (only if distinct from the IGAA one)
  if (igToken && igToken !== igaaToken) {
    try {
      const res = await fetch('https://graph.instagram.com/v21.0/me/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          recipient: JSON.stringify(recipientPayload),
          message: JSON.stringify(msgPayload),
          access_token: igToken,
        }),
      });
      if (res.ok) {
        console.log(`[DM-send] Sent via IG access_token to ${recipient_id}`);
        return NextResponse.json({ ok: true, sent: true, method: 'instagram_access_token' });
      }
      const err = await res.text().catch(() => '');
      errors.push(`IG: ${res.status} ${err.substring(0, 150)}`);
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
      const res = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          recipient: JSON.stringify(recipientPayload),
          message: JSON.stringify(msgPayload),
          access_token: fbToken,
        }),
      });
      if (res.ok) {
        console.log(`[DM-send] Sent via Facebook page token to ${recipient_id}`);
        return NextResponse.json({ ok: true, sent: true, method: 'facebook_api' });
      }
      const err = await res.text().catch(() => '');
      errors.push(`FB: ${res.status} ${err.substring(0, 150)}`);
    } catch (e: any) {
      errors.push(`FB error: ${e.message}`);
    }
  }

  console.warn('[DM-send] All send methods failed:', errors);
  return NextResponse.json({ ok: false, sent: false, errors });
}
