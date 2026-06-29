import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const runtime = 'nodejs';

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * Facebook/Instagram Data Deletion Callback (conformité Meta — testé en review).
 * https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 *
 * Meta POST un `signed_request` quand un utilisateur retire l'app / demande la
 * suppression. On DOIT : (1) vérifier la signature, (2) SUPPRIMER/anonymiser ses
 * données, (3) répondre { url, confirmation_code } (JSON exact attendu par Meta).
 *
 * À configurer dans App Dashboard → App Settings → Advanced → "Data Deletion
 * Request URL" = https://keiroai.com/api/auth/facebook-data-deletion
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const signedRequest = params.get('signed_request');
    if (!signedRequest) {
      return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 });
    }

    const [encodedSig, payload] = signedRequest.split('.');
    const appSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || '';
    const expectedSig = crypto.createHmac('sha256', appSecret).update(payload).digest('base64url');
    if (!appSecret || encodedSig !== expectedSig) {
      console.error('[FacebookDataDeletion] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    const userId = String(decoded.user_id || '');
    const confirmationCode = crypto.randomUUID();
    const sb = admin();
    const report = { prospects: 0, agent_logs: 0 };

    // SUPPRESSION RÉELLE : anonymise les données liées à cet utilisateur (PII out,
    // ligne gardée = conforme RGPD + doctrine never-delete) + scrub les logs.
    if (userId) {
      try {
        const { data: matched } = await sb.from('crm_prospects').select('id').eq('instagram', userId);
        const pids = (matched || []).map((p: any) => p.id);
        if (pids.length) {
          await sb.from('crm_prospects').update({
            instagram: null, tiktok_handle: null, linkedin_url: null,
            first_name: null, last_name: null, email: null, phone: null, whatsapp_phone: null,
            company: 'Anonymisé (Meta deletion)', notes: null, angle_approche: null, dm_message: null,
            no_outbound: true, updated_at: new Date().toISOString(),
          }).in('id', pids);
          await sb.from('crm_activities').delete().in('prospect_id', pids);
          report.prospects = pids.length;
        }
        const { count } = await sb.from('agent_logs').delete({ count: 'exact' })
          .or(`data->>sender_id.eq.${userId},data->>recipient_id.eq.${userId}`);
        report.agent_logs = count || 0;
      } catch (e: any) {
        console.error('[FacebookDataDeletion] purge error:', e?.message);
      }
    }

    // Trace de conformité (le code permet de retrouver/confirmer la demande).
    await sb.from('agent_logs').insert({
      agent: 'ops', action: 'fb_data_deletion_callback', status: 'ok',
      data: { user_id: userId, confirmation_code: confirmationCode, report, at: new Date().toISOString() },
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    console.log(`[FacebookDataDeletion] Processed user ${userId}: ${JSON.stringify(report)}`);

    const statusUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com'}/legal/data-deletion?code=${confirmationCode}`;
    return NextResponse.json({ url: statusUrl, confirmation_code: confirmationCode });
  } catch (error: any) {
    console.error('[FacebookDataDeletion] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Meta peut faire un GET de vérification (rare) — on renvoie 200.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'data-deletion-callback' });
}
