import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * POST /api/agents/dm-instagram/send
 * Send a DM directly via Instagram Messaging API.
 * Body: { recipient_id: string (IG scoped user ID), message: string }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const { recipient_id, message } = await req.json();
  if (!recipient_id || !message?.trim()) {
    return NextResponse.json({ error: 'recipient_id et message requis' }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Get user's IG credentials
  const { data: profile } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, instagram_access_token, facebook_page_access_token, facebook_page_id')
    .eq('id', user.id)
    .single();

  // Try user profile, then admin fallback
  let igUserId = profile?.instagram_business_account_id;
  let igToken = profile?.instagram_access_token;
  let fbToken = profile?.facebook_page_access_token;

  if (!igUserId) {
    const { data: admin } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, facebook_page_access_token')
      .eq('is_admin', true)
      .limit(1)
      .maybeSingle();
    igUserId = admin?.instagram_business_account_id;
    igToken = admin?.instagram_access_token;
    fbToken = admin?.facebook_page_access_token;
  }

  if (!igUserId) {
    return NextResponse.json({ ok: false, sent: false, error: 'Instagram non connecte' }, { status: 400 });
  }

  // Try sending via Instagram Graph API (IGAA token)
  const errors: string[] = [];

  if (igToken) {
    try {
      const res = await fetch(`https://graph.instagram.com/v21.0/me/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipient_id },
          message: { text: message.substring(0, 1000) },
          access_token: igToken,
        }),
      });
      if (res.ok) {
        console.log(`[DM-send] Sent via Instagram Graph API to ${recipient_id}`);
        return NextResponse.json({ ok: true, sent: true, method: 'instagram_api' });
      }
      const err = await res.text().catch(() => '');
      errors.push(`Instagram API: ${res.status} ${err.substring(0, 100)}`);
    } catch (e: any) {
      errors.push(`Instagram API error: ${e.message}`);
    }
  }

  // Fallback: try Facebook Graph API with page token
  if (fbToken && igUserId) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          recipient: JSON.stringify({ id: recipient_id }),
          message: JSON.stringify({ text: message.substring(0, 1000) }),
          access_token: fbToken,
        }),
      });
      if (res.ok) {
        console.log(`[DM-send] Sent via Facebook Graph API to ${recipient_id}`);
        return NextResponse.json({ ok: true, sent: true, method: 'facebook_api' });
      }
      const err = await res.text().catch(() => '');
      errors.push(`Facebook API: ${res.status} ${err.substring(0, 100)}`);
    } catch (e: any) {
      errors.push(`Facebook API error: ${e.message}`);
    }
  }

  console.warn(`[DM-send] All send methods failed:`, errors);
  return NextResponse.json({ ok: false, sent: false, errors });
}
