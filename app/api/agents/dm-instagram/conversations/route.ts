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
    .select('instagram_business_account_id, instagram_access_token, facebook_page_access_token, facebook_page_id, email')
    .eq('id', user.id)
    .single();

  console.log(`[DM-conversations] User ${userProfile?.email || user.id}: ig_account=${userProfile?.instagram_business_account_id || 'null'}, page_id=${userProfile?.facebook_page_id || 'null'}, has_fb_token=${!!userProfile?.facebook_page_access_token}`);

  pageToken = userProfile?.facebook_page_access_token || userProfile?.instagram_access_token;
  pageId = userProfile?.facebook_page_id;
  igUserId = userProfile?.instagram_business_account_id;

  if (!pageToken || !igUserId) {
    // Fallback: admin profile
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, facebook_page_access_token, facebook_page_id')
      .eq('is_admin', true)
      .limit(1)
      .maybeSingle();

    if (adminProfile) {
      pageToken = adminProfile.facebook_page_access_token || adminProfile.instagram_access_token;
      pageId = adminProfile.facebook_page_id;
      igUserId = adminProfile.instagram_business_account_id;
      console.log(`[DM-conversations] Fallback to admin: page_id=${pageId}, ig_account=${igUserId}`);
    }
  }

  if (!pageToken || !igUserId) {
    // Last fallback: any profile with IG connected
    const { data: anyProfile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, facebook_page_access_token, facebook_page_id')
      .not('instagram_business_account_id', 'is', null)
      .not('facebook_page_access_token', 'is', null)
      .limit(1)
      .maybeSingle();

    if (anyProfile) {
      pageToken = anyProfile.facebook_page_access_token || anyProfile.instagram_access_token;
      pageId = anyProfile.facebook_page_id;
      igUserId = anyProfile.instagram_business_account_id;
      console.log(`[DM-conversations] Fallback to any connected profile: page_id=${pageId}, ig_account=${igUserId}`);
    }
  }

  if (!pageToken || !igUserId) {
    console.warn(`[DM-conversations] No IG token found for user ${user.id}`);
    return NextResponse.json({ ok: true, conversations: [], message: 'Instagram non connecte' });
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
      // Instagram API — works with IGAA tokens (most common for new IG API)
      igToken ? { url: `https://graph.instagram.com/v21.0/me/conversations?fields=id,participants,updated_time&access_token=${igToken}`, label: 'Instagram /me/conversations', apiType: 'instagram', token: igToken } : null,
      // Facebook Page conversations with platform=instagram filter
      pageId && fbToken ? { url: `https://graph.facebook.com/v21.0/${pageId}/conversations?platform=instagram&fields=id,participants,updated_time&access_token=${fbToken}`, label: 'FB Page+platform=instagram', apiType: 'facebook', token: fbToken } : null,
      // IG user conversations via Facebook Graph
      fbToken ? { url: `https://graph.facebook.com/v21.0/${igUserId}/conversations?fields=id,participants,updated_time&access_token=${fbToken}`, label: 'FB IG user conversations', apiType: 'facebook', token: fbToken } : null,
      // Retry Instagram API with FB token (some setups store FB token as IG token)
      fbToken && fbToken !== igToken ? { url: `https://graph.instagram.com/v21.0/me/conversations?fields=id,participants,updated_time&access_token=${fbToken}`, label: 'Instagram /me with FB token', apiType: 'instagram', token: fbToken } : null,
    ].filter(Boolean) as Array<{ url: string; label: string; apiType: string; token: string }>;

    for (const ep of endpoints) {
      console.log(`[DM-conversations] Trying ${ep.label}...`);

      const res = await fetch(ep.url);
      if (res.ok) {
        const data = await res.json();
        const count = data.data?.length || 0;
        console.log(`[DM-conversations] ${ep.label} returned ${count} conversations`);
        if (count > 0) {
          return await processConversations(data, ep.token, [igUserId, pageId || ''], ep.apiType);
        }
      } else {
        const errText = await res.text().catch(() => '');
        console.warn(`[DM-conversations] ${ep.label} failed (${res.status}): ${errText.substring(0, 100)}`);
      }
    }

    console.warn(`[DM-conversations] All endpoints returned 0 conversations`);
    return NextResponse.json({ ok: true, conversations: [], message: 'Aucune conversation trouvee' });
  } catch (e: any) {
    console.error(`[DM-conversations] Error:`, e.message);
    return NextResponse.json({ ok: true, conversations: [], error: e.message });
  }
}

async function processConversations(convData: any, token: string, myIds: string[], apiType: string) {
  const conversations: Array<{
    id: string;
    participant: { username: string; id: string };
    updated_time: string;
    messages: Array<{ id: string; message: string; from: string; fromMe: boolean; created_time: string }>;
  }> = [];

  // myIds contains all IDs that represent "me" (igUserId, pageId, etc.)
  const myIdSet = new Set(myIds.filter(Boolean));

  for (const conv of (convData.data || []).slice(0, 10)) {
    // Get the other participant (not me)
    const otherParticipant = conv.participants?.data?.find((p: any) => !myIdSet.has(p.id)) ||
                             conv.participants?.data?.[0] ||
                             { username: 'inconnu', id: '?' };

    // Fetch messages
    try {
      const domain = apiType === 'instagram' ? 'graph.instagram.com' : 'graph.facebook.com';
      const msgRes = await fetch(
        `https://${domain}/v21.0/${conv.id}/messages?fields=id,message,from,created_time&limit=20&access_token=${token}`
      );

      let messages: any[] = [];
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        messages = (msgData.data || []).map((m: any) => ({
          id: m.id,
          message: m.message || '',
          from: m.from?.username || m.from?.name || '?',
          fromMe: myIdSet.has(m.from?.id),
          created_time: m.created_time,
        })).reverse(); // Chronological order
      } else {
        const errText = await msgRes.text().catch(() => '');
        console.warn(`[DM-conversations] Message fetch failed for conv ${conv.id}: ${msgRes.status} ${errText.substring(0, 100)}`);
      }

      conversations.push({
        id: conv.id,
        participant: { username: otherParticipant.username || otherParticipant.name || 'inconnu', id: otherParticipant.id },
        updated_time: conv.updated_time,
        messages,
      });
    } catch {}
  }

  return NextResponse.json({ ok: true, conversations });
}
