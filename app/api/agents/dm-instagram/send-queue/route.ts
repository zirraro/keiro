import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/agents/dm-instagram/send-queue
 * Process pending DMs from dm_queue and send them via Instagram API.
 * Auth: CRON_SECRET required.
 *
 * Instagram API rule: can only DM users who have interacted with the business
 * in the last 24h (human agent window) or 7 days (standard messaging).
 * Proactive DMs to new users may fail — we handle gracefully.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const userId = req.nextUrl.searchParams.get('user_id');

  // Get client's IG tokens
  const profileQuery = supabase.from('profiles').select('id, instagram_access_token, instagram_business_account_id, facebook_page_id, facebook_page_access_token');
  if (userId) profileQuery.eq('id', userId);
  else profileQuery.eq('is_admin', false).not('instagram_access_token', 'is', null);

  const { data: profiles } = await profileQuery;
  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No profiles with IG token' });
  }

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const profile of profiles) {
    if (!profile.instagram_access_token) continue;
    const token = profile.instagram_access_token;
    const igAccountId = profile.instagram_business_account_id;

    // Get pending DMs for this client's prospects
    const { data: pendingDMs } = await supabase
      .from('dm_queue')
      .select('id, prospect_id, handle, message, channel, priority')
      .eq('status', 'pending')
      .eq('channel', 'instagram')
      .order('priority', { ascending: false })
      .limit(10); // Max 10 per run to respect rate limits

    if (!pendingDMs || pendingDMs.length === 0) continue;

    for (const dm of pendingDMs) {
      const cleanHandle = (dm.handle || '').replace(/^@/, '').replace(/\s/g, '').trim();
      if (!cleanHandle || cleanHandle.length < 2 || cleanHandle === 'A_VERIFIER') {
        await supabase.from('dm_queue').update({ status: 'skipped', error: 'Invalid handle: ' + (dm.handle || 'empty') }).eq('id', dm.id);
        totalSkipped++;
        continue;
      }

      try {
        // Step 1: Find the Instagram user ID from handle via Business Discovery
        let recipientIgId = '';
        let recipientMediaIds: string[] = [];
        try {
          const discoverRes = await fetch(
            `https://graph.instagram.com/v21.0/${igAccountId}?fields=business_discovery.fields(id,username,media.limit(3){id}).username(${dm.handle})&access_token=${token}`
          );
          if (discoverRes.ok) {
            const discoverData = await discoverRes.json();
            recipientIgId = discoverData?.business_discovery?.id || '';
            recipientMediaIds = (discoverData?.business_discovery?.media?.data || []).map((m: any) => m.id);
          }
        } catch {}

        if (!recipientIgId) {
          await supabase.from('dm_queue').update({ status: 'skipped', error: 'User not found' }).eq('id', dm.id);
          totalSkipped++;
          continue;
        }

        // Step 1.5: Pre-engage — like their recent posts to trigger notification
        // This increases chances they check our profile and respond to our DM
        // Instagram allows liking public posts via Graph API
        let likesGiven = 0;
        for (const mediaId of recipientMediaIds.slice(0, 2)) {
          try {
            const likeRes = await fetch(`https://graph.instagram.com/v21.0/${mediaId}/likes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: token }),
            });
            if (likeRes.ok) likesGiven++;
          } catch {}
          await new Promise(r => setTimeout(r, 1000));
        }
        if (likesGiven > 0) {
          console.log(`[DMSendQueue] Pre-engaged ${dm.handle}: liked ${likesGiven} posts`);
          // Log the likes for stats tracking
          await supabase.from('agent_logs').insert({
            agent: 'dm_instagram',
            action: 'pre_engagement_likes',
            status: 'success',
            result: { handle: dm.handle, likes: likesGiven, prospect_id: dm.prospect_id },
            user_id: profile.id,
            created_at: new Date().toISOString(),
          });
        }

        // Step 2: Send DM via Instagram Graph API
        let sendSuccess = false;

        // Try IG Graph API
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
          sendSuccess = true;
        } else {
          const errText = await igRes.text();
          console.warn(`[DMSendQueue] IG send failed for ${dm.handle}:`, errText.substring(0, 150));

          // Try FB Graph API fallback
          if (profile.facebook_page_id && profile.facebook_page_access_token) {
            try {
              const fbRes = await fetch(`https://graph.facebook.com/v21.0/${profile.facebook_page_id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  recipient: JSON.stringify({ id: recipientIgId }),
                  message: JSON.stringify({ text: dm.message }),
                  access_token: profile.facebook_page_access_token,
                }),
              });
              if (fbRes.ok) sendSuccess = true;
            } catch {}
          }
        }

        if (sendSuccess) {
          // Update queue
          await supabase.from('dm_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', dm.id);
          // Update prospect
          await supabase.from('crm_prospects').update({
            dm_status: 'sent',
            dm_sent_at: new Date().toISOString(),
            status: 'contacte',
            updated_at: new Date().toISOString(),
          }).eq('id', dm.prospect_id);
          totalSent++;
        } else {
          await supabase.from('dm_queue').update({ status: 'failed', error: 'API send failed' }).eq('id', dm.id);
          totalFailed++;
        }

        // Rate limit: 2s between DMs
        await new Promise(r => setTimeout(r, 2000));

      } catch (e: any) {
        await supabase.from('dm_queue').update({ status: 'failed', error: e.message?.substring(0, 200) }).eq('id', dm.id);
        totalFailed++;
      }
    }
  }

  console.log(`[DMSendQueue] Sent: ${totalSent}, Failed: ${totalFailed}, Skipped: ${totalSkipped}`);
  return NextResponse.json({ ok: true, sent: totalSent, failed: totalFailed, skipped: totalSkipped });
}
