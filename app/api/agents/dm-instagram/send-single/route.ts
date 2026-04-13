import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * POST /api/agents/dm-instagram/send-single
 * Client sends a single DM from the queue by clicking "Envoyer".
 * Body: { dm_id: string }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dm_id } = await req.json();
  if (!dm_id) return NextResponse.json({ error: 'dm_id requis' }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Get the DM from queue
  const { data: dm } = await supabase.from('dm_queue').select('*').eq('id', dm_id).single();
  if (!dm) return NextResponse.json({ error: 'DM introuvable' }, { status: 404 });

  // Get client's IG token
  const { data: profile } = await supabase
    .from('profiles')
    .select('instagram_access_token, instagram_business_account_id, facebook_page_id, facebook_page_access_token')
    .eq('id', user.id)
    .single();

  if (!profile?.instagram_access_token) {
    return NextResponse.json({ error: 'Instagram non connecte' }, { status: 400 });
  }

  const token = profile.instagram_access_token;
  const igAccountId = profile.instagram_business_account_id;

  try {
    // Find recipient IG user ID
    let recipientIgId = '';
    const discoverRes = await fetch(
      `https://graph.instagram.com/v21.0/${igAccountId}?fields=business_discovery.fields(id).username(${dm.handle})&access_token=${token}`
    );
    if (discoverRes.ok) {
      const discoverData = await discoverRes.json();
      recipientIgId = discoverData?.business_discovery?.id || '';
    }

    if (!recipientIgId) {
      await supabase.from('dm_queue').update({ status: 'failed', error: 'User not found' }).eq('id', dm_id);
      return NextResponse.json({ ok: false, error: 'Compte Instagram introuvable pour @' + dm.handle });
    }

    // Send DM
    let sent = false;
    const igRes = await fetch(`https://graph.instagram.com/v21.0/me/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientIgId },
        message: { text: dm.message },
        access_token: token,
      }),
    });

    if (igRes.ok) {
      sent = true;
    } else {
      // Try FB fallback
      if (profile.facebook_page_id && profile.facebook_page_access_token) {
        const fbRes = await fetch(`https://graph.facebook.com/v21.0/${profile.facebook_page_id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            recipient: JSON.stringify({ id: recipientIgId }),
            message: JSON.stringify({ text: dm.message }),
            access_token: profile.facebook_page_access_token,
          }),
        });
        if (fbRes.ok) sent = true;
      }
    }

    if (sent) {
      await supabase.from('dm_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', dm_id);
      await supabase.from('crm_prospects').update({
        dm_status: 'sent',
        dm_sent_at: new Date().toISOString(),
        status: 'contacte',
        updated_at: new Date().toISOString(),
      }).eq('id', dm.prospect_id);

      return NextResponse.json({ ok: true, sent: true });
    } else {
      const errText = await igRes.text().catch(() => 'unknown');
      await supabase.from('dm_queue').update({ status: 'failed', error: errText.substring(0, 200) }).eq('id', dm_id);
      return NextResponse.json({ ok: false, error: 'Envoi echoue — le prospect n\'a peut-etre pas encore interagi avec votre compte' });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
