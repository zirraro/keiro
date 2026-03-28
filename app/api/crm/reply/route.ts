import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { graphPOST } from '@/lib/meta';

export const runtime = 'nodejs';

/**
 * POST /api/crm/reply
 * Send a reply email or DM to a prospect from KeiroAI.
 * Body: { prospect_id, message, channel: 'email' | 'dm_instagram' }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { prospect_id, message, channel = 'email', recipient_id } = await req.json();

  if (!prospect_id || !message) {
    return NextResponse.json({ error: 'prospect_id et message requis' }, { status: 400 });
  }

  // Get prospect
  const { data: prospect } = await supabase
    .from('crm_prospects')
    .select('*')
    .eq('id', prospect_id)
    .single();

  if (!prospect) {
    return NextResponse.json({ error: 'Prospect introuvable' }, { status: 404 });
  }

  if (channel === 'email') {
    // Send email reply via Resend
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY || !prospect.email) {
      return NextResponse.json({ error: 'Email non disponible' }, { status: 400 });
    }

    // Get sender info from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, company_name')
      .eq('id', user.id)
      .single();

    const senderName = profile?.first_name || profile?.company_name || 'KeiroAI';

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${senderName} <contact@keiroai.com>`,
          to: [prospect.email],
          reply_to: 'contact@keiroai.com',
          subject: `Re: ${prospect.company || prospect.first_name || 'Votre message'}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;">
            ${message.split('\n').map((l: string) => `<p style="margin:8px 0;">${l}</p>`).join('')}
            <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
              <p style="margin:0;">${senderName}</p>
            </div>
          </div>`,
          text: message,
        }),
      });

      if (!res.ok) throw new Error('Email send failed');

      // Log activity
      await supabase.from('crm_activities').insert({
        prospect_id,
        type: 'email',
        description: `Reponse manuelle envoyee: "${message.substring(0, 100)}"`,
        data: { manual_reply: true, message: message.substring(0, 500), sent_by: user.id },
        created_at: new Date().toISOString(),
      });

      // Update prospect status
      await supabase.from('crm_prospects').update({
        status: 'repondu',
        temperature: 'hot',
        updated_at: new Date().toISOString(),
      }).eq('id', prospect_id);

      return NextResponse.json({ ok: true, channel: 'email' });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (channel === 'dm_instagram') {
    // Get user's IG credentials to send DM via Instagram API
    const { data: profile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, facebook_page_access_token, instagram_access_token')
      .eq('id', user.id)
      .single();

    const igToken = profile?.facebook_page_access_token || profile?.instagram_access_token;
    const igUserId = profile?.instagram_business_account_id;

    // recipient_id can be: Instagram-scoped user ID (from conversations) or prospect.instagram field
    const recipientId = recipient_id || prospect.instagram_user_id || prospect.instagram;

    if (igToken && igUserId && recipientId) {
      try {
        // Send DM via Instagram Messaging API
        await graphPOST(`/${igUserId}/messages`, igToken, {
          recipient: JSON.stringify({ id: recipientId }),
          message: JSON.stringify({ text: message }),
        } as any);

        // Log success
        await supabase.from('crm_activities').insert({
          prospect_id,
          type: 'dm_instagram',
          description: `DM envoye via KeiroAI: "${message.substring(0, 100)}"`,
          data: { manual_dm: false, message, target: prospect.instagram || prospect.company, sent_by: user.id, status: 'sent', recipient_id: recipientId },
          created_at: new Date().toISOString(),
        });

        // Update prospect status
        await supabase.from('crm_prospects').update({
          status: 'repondu',
          temperature: 'hot',
          updated_at: new Date().toISOString(),
        }).eq('id', prospect_id);

        return NextResponse.json({ ok: true, channel: 'dm_instagram', sent: true });
      } catch (e: any) {
        console.error('[crm/reply] Instagram DM send failed:', e.message);
        // Fallback: save as prepared if API fails
        await supabase.from('crm_activities').insert({
          prospect_id,
          type: 'dm_instagram',
          description: `DM echec API, prepare: "${message.substring(0, 100)}"`,
          data: { manual_dm: true, message, target: prospect.instagram || prospect.company, sent_by: user.id, status: 'failed', error: e.message?.substring(0, 200) },
          created_at: new Date().toISOString(),
        });
        return NextResponse.json({ ok: true, channel: 'dm_instagram', sent: false, note: 'Envoi echoue — DM sauvegarde' });
      }
    } else {
      // No IG credentials — save as prepared
      await supabase.from('crm_activities').insert({
        prospect_id,
        type: 'dm_instagram',
        description: `DM prepare (IG non connecte): "${message.substring(0, 100)}"`,
        data: { manual_dm: true, message, target: prospect.instagram || prospect.company, sent_by: user.id, status: 'prepared' },
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, channel: 'dm_instagram', sent: false, note: 'Instagram non connecte — DM sauvegarde' });
    }
  }

  return NextResponse.json({ error: 'Channel non supporte' }, { status: 400 });
}
