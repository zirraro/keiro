import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/agents/dm-instagram/conversations
 * Fetch real Instagram DM conversations with messages.
 * Uses the new Instagram API token (IGAA format).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Get IG tokens — need facebook_page_id + facebook_page_access_token for conversations API
  // AND instagram_business_account_id to identify "my" messages
  let pageToken: string | null = null;
  let pageId: string | null = null;
  let igUserId: string | null = null;

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, instagram_access_token, instagram_igaa_token, facebook_page_access_token, facebook_page_id, email, is_admin')
    .eq('id', user.id)
    .single();

  // IGAA token (from Meta developer tools) is permanent and takes priority
  // It's never cleared by disconnect/reconnect — only by manual removal
  const igaaToken = userProfile?.instagram_igaa_token;

  console.log(`[DM-conversations] User ${userProfile?.email || user.id}: ig_account=${userProfile?.instagram_business_account_id || 'null'}, page_id=${userProfile?.facebook_page_id || 'null'}, has_igaa=${!!igaaToken}, has_fb_token=${!!userProfile?.facebook_page_access_token}`);

  pageToken = userProfile?.facebook_page_access_token || userProfile?.instagram_access_token;
  pageId = userProfile?.facebook_page_id;
  igUserId = userProfile?.instagram_business_account_id;

  // Admin users get admin fallback for testing/demo; real clients do not —
  // otherwise a disconnected client would keep seeing the admin's DMs.
  const isAdminUser = userProfile?.is_admin === true;

  // User intent: instagram_business_account_id is the disconnect signal.
  // Disconnect clears it (see /api/agents/disconnect-network) even though
  // the permanent instagram_igaa_token stays on the profile. If the user
  // has no ig_id and is not admin, we treat the account as disconnected
  // regardless of the IGAA token's presence.
  if (!userProfile?.instagram_business_account_id && !isAdminUser) {
    console.log(`[DM-conversations] User ${userProfile?.email} has no instagram_business_account_id → connected:false`);
    return NextResponse.json({ ok: true, conversations: [], connected: false, message: 'Instagram non connecte' });
  }

  if (isAdminUser && (!pageToken || !igUserId) && !igaaToken) {
    const { data: anyProfile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, instagram_igaa_token, facebook_page_access_token, facebook_page_id')
      .not('instagram_business_account_id', 'is', null)
      .or('facebook_page_access_token.not.is.null,instagram_igaa_token.not.is.null')
      .limit(1)
      .maybeSingle();

    if (anyProfile) {
      pageToken = anyProfile.facebook_page_access_token || anyProfile.instagram_access_token;
      pageId = anyProfile.facebook_page_id;
      igUserId = anyProfile.instagram_business_account_id;
      (userProfile as any).instagram_igaa_token = anyProfile.instagram_igaa_token;
      console.log(`[DM-conversations] Admin fallback used: ig_account=${igUserId}`);
    }
  }

  const currentIgaa = igaaToken || (userProfile as any)?.instagram_igaa_token;

  if (!pageToken && !currentIgaa) {
    console.warn(`[DM-conversations] No IG token for user ${user.id} — returning disconnected`);
    return NextResponse.json({ ok: true, conversations: [], connected: false, message: 'Instagram non connecte' });
  }

  // If igUserId is null (disconnected) but we have IGAA token, we can still fetch conversations
  if (!igUserId && igaaToken) {
    // Try to get igUserId from IGAA token
    try {
      const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id&access_token=${igaaToken}`);
      if (meRes.ok) {
        const meData = await meRes.json();
        igUserId = meData.id;
        console.log(`[DM-conversations] Recovered igUserId from IGAA token: ${igUserId}`);
      }
    } catch {}
  }

  if (!igUserId) {
    console.warn(`[DM-conversations] No IG user ID for user ${user.id}`);
    return NextResponse.json({ ok: true, conversations: [], connected: false, message: 'Instagram non connecte' });
  }

  // Keep both tokens — IGAA token works on graph.instagram.com, FB page token on graph.facebook.com
  const igToken = userProfile?.instagram_access_token;
  const fbToken = userProfile?.facebook_page_access_token;

  console.log(`[DM-conversations] Using page_id=${pageId}, ig_account=${igUserId}, has_ig_token=${!!igToken}, has_fb_token=${!!fbToken}`);

  try {
    // Try endpoints in order of reliability
    // 1. Instagram Graph API /me/conversations (works with IGAA token)
    // 2. Facebook Page conversations with platform=instagram (works with FB page token)
    // 3. IG user conversations on Facebook Graph (works with FB page token)

    const endpoints = [
      // IGAA token (permanent, from Meta dev tools) — highest priority for DMs
      igaaToken ? { url: `https://graph.instagram.com/v21.0/me/conversations?fields=id,participants,updated_time&access_token=${igaaToken}`, label: 'Instagram IGAA /me/conversations', apiType: 'instagram', token: igaaToken } : null,
      // Instagram API — works with IGAA tokens obtained via OAuth
      igToken && igToken !== igaaToken ? { url: `https://graph.instagram.com/v21.0/me/conversations?fields=id,participants,updated_time&access_token=${igToken}`, label: 'Instagram /me/conversations', apiType: 'instagram', token: igToken } : null,
      // Facebook Page conversations with platform=instagram filter
      pageId && fbToken ? { url: `https://graph.facebook.com/v21.0/${pageId}/conversations?platform=instagram&fields=id,participants,updated_time&access_token=${fbToken}`, label: 'FB Page+platform=instagram', apiType: 'facebook', token: fbToken } : null,
      // IG user conversations via Facebook Graph
      fbToken ? { url: `https://graph.facebook.com/v21.0/${igUserId}/conversations?fields=id,participants,updated_time&access_token=${fbToken}`, label: 'FB IG user conversations', apiType: 'facebook', token: fbToken } : null,
      // Retry Instagram API with FB token (some setups store FB token as IG token)
      fbToken && fbToken !== igToken ? { url: `https://graph.instagram.com/v21.0/me/conversations?fields=id,participants,updated_time&access_token=${fbToken}`, label: 'Instagram /me with FB token', apiType: 'instagram', token: fbToken } : null,
    ].filter(Boolean) as Array<{ url: string; label: string; apiType: string; token: string }>;

    const errors: string[] = [];
    for (const ep of endpoints) {
      console.log(`[DM-conversations] Trying ${ep.label}...`);

      const res = await fetch(ep.url);
      if (res.ok) {
        const data = await res.json();
        const count = data.data?.length || 0;
        console.log(`[DM-conversations] ✓ ${ep.label} returned ${count} conversations`);
        if (count > 0) {
          return await processConversations(data, ep.token, [igUserId, pageId || ''], ep.apiType);
        }
      } else {
        const errText = await res.text().catch(() => '');
        const errMsg = `${ep.label}: HTTP ${res.status} — ${errText.substring(0, 150)}`;
        console.warn(`[DM-conversations] ✗ ${errMsg}`);
        errors.push(errMsg);
      }
    }

    // If ALL endpoints failed with errors (not just 0 conversations), report it
    if (errors.length === endpoints.length && errors.length > 0) {
      console.error(`[DM-conversations] ALL ${errors.length} endpoints FAILED. Errors:`, errors.join(' | '));
      return NextResponse.json({
        ok: false,
        connected: true,
        conversations: [],
        error: 'Instagram API error — check token validity',
        details: errors,
        hint: 'Try reconnecting Instagram in Settings',
      });
    }

    console.warn(`[DM-conversations] All endpoints returned 0 conversations (no errors)`);
    return NextResponse.json({ ok: true, connected: true, conversations: [], message: 'No conversations yet — send a DM to your Instagram to test' });
  } catch (e: any) {
    console.error(`[DM-conversations] Error:`, e.message);
    return NextResponse.json({ ok: true, connected: true, conversations: [], error: e.message });
  }
}

async function processConversations(convData: any, token: string, myIds: string[], apiType: string) {
  const myIdSet = new Set(myIds.filter(Boolean));
  const domain = apiType === 'instagram' ? 'graph.instagram.com' : 'graph.facebook.com';
  const convList = (convData.data || []).slice(0, 10);

  // Fire all per-conversation message fetches in parallel — the previous
  // serial loop did 10 round-trips sequentially (≈300ms each on Meta's side
  // so the whole endpoint took 3s+ before returning). With Promise.all we
  // collapse to a single round-trip worth of latency.
  // LIST-ONLY payload: no per-conversation message fetch.
  //
  // Meta's "Application request limit" hit hard when we fetched messages
  // for every conversation on every 10s poll (≥10 convs × 12 messages =
  // 120 rate-limited calls per minute per viewer). Messages are now
  // fetched on demand by GET /conversations/[id]/messages when the user
  // selects a conversation, and refreshed only for that one conv every
  // 10s. Net: one light list call per poll + one focused messages call.
  const started = Date.now();
  const conversations = convList.map((conv: any) => {
    const otherParticipant = conv.participants?.data?.find((p: any) => !myIdSet.has(p.id))
      || conv.participants?.data?.[0]
      || { username: 'inconnu', id: '?' };
    return {
      id: conv.id,
      participant: { username: otherParticipant.username || otherParticipant.name || 'inconnu', id: otherParticipant.id },
      updated_time: conv.updated_time,
      messages: [] as any[],
    };
  });

  const elapsed = Date.now() - started;
  console.log(`[DM-conversations] Returning ${conversations.length} conversations (list only) in ${elapsed}ms`);
  return new NextResponse(JSON.stringify({ ok: true, connected: true, conversations }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=10',
    },
  });
}
